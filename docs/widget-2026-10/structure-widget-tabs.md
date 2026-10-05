# 구조 변경 기록 — widget-tabs (백엔드, 2026-10-05)

설계 정본은 [design-widget-tabs.md](design-widget-tabs.md) §1~§3, 테이블은 [erd-widget-tabs.md](erd-widget-tabs.md) 이다. 이 문서는 백엔드 변경만 다룬다(화면은 프런트 기록에 남긴다).

## 1. 변경 파일

### mcm-core — 새 파일

| 파일 | 역할 |
|---|---|
| `widget/layout/entity/WidgetDefaultTab`·`WidgetDefaultTabId` | `TB_MCM_WIDGET_DEFAULT_TAB`(PK LAYOUT_KEY+TAB_ID, TAB_ID 단독 유일 제약) |
| `widget/layout/entity/WidgetDefaultTabItem`·`WidgetDefaultTabItemId` | `TB_MCM_WIDGET_DEFAULT_TAB_ITEM` |
| `widget/layout/repository/WidgetDefaultTabRepository`·`WidgetDefaultTabItemRepository` | 키별 조회·키별 탭 수·전체 탭 ID·키 단위 삭제 |
| `widget/layout/service/WidgetDefaultTabs` | 사용자 기본 탭 집합 해석(부서 → 상위 → 전사 중 첫 키), `def-N` 형식 도우미. 읽기 전용 `@Component` |
| `widget/layout/service/WidgetDefaultTabWriter` | 관리자 기본 탭 쓰기 트랜잭션(저장·채번·지우기·순서·키 전체 삭제) |
| `widget/layout/service/CommWidgetDefaultTabService` | OASIS 빈 `commWidgetDefaultTabService` — loadDefaultTabs·saveDefaultTab·deleteDefaultTab·reorderDefaultTabs |
| `widget/layout/dto/CommWidgetDefaultTabRequest` | 위 4개 action 의 params(layoutKey·tabId·tabNm·tabSeq) |
| `widget/repository/WidgetUserLookupRepository` | 사용 중 사용자 찾기(LIKE 이스케이프 `!`)·사용 중 확인·부서 코드. EntityManager 클래스(Spring Data 인터페이스 아님) |
| `widget/dto/SecWidgetUserSearchRequest` | searchUsers params(keyword) |

### mcm-core — 바꾼 파일

| 파일 | 변경 |
|---|---|
| `widget/service/SecWidgetService` | search 에 기본 탭 풀기(defaultYn·customYn), saveTab 의 `def-N` 규칙·기본 탭을 포함한 탭 한도, deleteTab 의 `def-*` 거절, reorderTabs 의 `def-*` 건너뛰기, 새 resetTab·shareTab·searchUsers. 생성자 인자 4개 추가 |
| `widget/service/SecWidgetTabWriter` | `copyTabs`(공유 사본을 한 트랜잭션으로) 추가 |
| `widget/repository/SecUserWidgetTabRepository` | `findDistinctDefaultTabIds`(채번용) 추가 |
| `widget/repository/SecUserWidgetRepository` | `findByUserIdAndTabId`(공유 원본) 추가 |
| `widget/layout/service/CommWidgetLayoutService` | searchLayouts 에 기본 탭만 있는 키·`tabCount`, deleteLayout 이 기본 탭까지 한 트랜잭션으로 지움. `requireLayoutKey`·`toItem` 을 패키지 공개로 넓혀 기본 탭 서비스가 재사용 |
| `widget/dto/SecWidgetTabRequest` | 주석만(resetTab·shareTab 도 쓴다) |

### mcm(api)

| 파일 | 변경 |
|---|---|
| `services/roleManagement/secWidget.bpmn` | resetTab·shareTab·searchUsers 분기 추가(게이트웨이 outgoing 3줄 + 파일 끝 흐름) |
| `services/csa/commWidgetMng.bpmn` | loadDefaultTabs·saveDefaultTab·deleteDefaultTab·reorderDefaultTabs 분기 추가(게이트웨이 outgoing 4줄 + 파일 끝 흐름·도형) |
| `init/seed/CoreRbacSeeder` | PERM_ALL action 에 기본 탭 4개 추가(없으면 SYSADMIN 도 403). 기존 DB 는 `ensurePermAllActions` 가 덧붙인다 |

### 시험

| 파일 | 내용 |
|---|---|
| `mcm-core/.../widget/service/SecWidgetDefaultTabTest`(새) | search 풀기·saveTab def 규칙·탭 한도·deleteTab/reorderTabs/resetTab·shareTab(이름·한도·부분 실패·원본)·searchUsers |
| `mcm-core/.../widget/layout/CommWidgetDefaultTabTest`(새) | 관리자 기본 탭 action 검사 |
| `mcm-core/.../widget/layout/WidgetDefaultTabJpaTest`·`WidgetTabsJpaTestConfig`(새) | H2: homeDefault 불변·해석 순서·채번·유일 제약·키 삭제·사용자 찾기 쿼리 |
| `mcm-core/.../widget/service/SecWidgetServiceTest` | 새 생성자 인자용 `@Mock` 과 「기본 탭 없음」 스텁만 추가 |
| `mcm-core/.../widget/layout/CommWidgetLayoutTest` | `tabCount` 칸 반영, deleteLayout 검증 대상을 기본 탭 Writer 로 교체, 기본 탭만 있는 키 시험 추가 |
| `mcm/api/.../widget/SecWidgetBpmnActionTest`·`CommWidgetMngBpmnActionTest` | 분기 수(8·13)와 새 action 의 dto·grids 파라미터 이름 대조 |

## 2. 계약 요약

- secWidget(AUTH_ONLY, `secwidget/` 접두라 새 action 도 자동 면제): `search` 탭 줄 `defaultYn`·`customYn`, `resetTab{tabId}`, `shareTab{tabId}+grids.targets.rows[{userId}] → results[{userId, ok, tabNm, message}]`, `searchUsers{keyword} → users[{userId, userNm, deptNm}]`.
- commWidgetMng(RBAC): `loadDefaultTabs`·`saveDefaultTab(+grids.widgets.rows)`·`deleteDefaultTab → {layoutKey, tabId, deleted}`·`reorderDefaultTabs(+grids.tabs.rows) → {layoutKey, count}`, `searchLayouts` 줄에 `tabCount`.
- 모든 새 serviceTask 는 `output=result`, `grid` 속성 없음. `check_oasis_contract.py` ERROR 0.

## 3. 설계와 다르게 정한 점

- 새 `def-N` 채번은 기본 탭 테이블뿐 아니라 사용자 재정의 행에 남은 `def-*` 번호까지 본다(지운 탭 번호 재사용 시 옛 재정의 행이 되살아나는 문제 방지).
- shareTab 원본이 「홈」인데 사용자 행이 없으면 사용자 부서 기준 「홈」 기본 배치를 쓰고, 그것도 없으면 거절한다(화면 코드 상수 배치는 서버가 모른다).
- shareTab 이름 숫자 꼬리는 `" 2"`, `" 3"` … 이고, 꼬리를 붙인 뒤에도 20자 안에 들게 앞부분을 다시 자른다. 겹침 판정 대상은 받는 사람의 일반 탭 이름·해석된 기본 탭 이름·「홈」이다.
- saveTab 의 일반 탭 이름 중복 검사는 해석된 기본 탭 이름도 본다.
- searchUsers 는 본인을 빼고, 검색어 30자 초과도 거절한다. 아이디·이름 포함 일치(대소문자 무시)다.
- deleteDefaultTab 응답에 `layoutKey`·`tabId` 를 더 넣었다.
