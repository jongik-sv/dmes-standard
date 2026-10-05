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
- shareTab 사본의 `tab-N` 은 서비스가 읽기 시점에 정하고, `copyTabs` 가 트랜잭션 안에서 그 ID 가 이미 있으면 다음 빈 번호로 옮긴다(받는 사람 탭을 덮어쓰지 않는다).

## 4. 남은 위험

- 받는 사람이 공유 전에 연 화면 상태로 새 탭을 만들면 프런트가 공유 사본과 같은 `tab-N` 을 고를 수 있고, 그 saveTab 은 기존 탭 저장으로 처리되어 사본을 덮어쓴다. 서버만으로는 막을 수 없으므로 프런트가 새 탭 ID 를 정하기 전에 다시 불러오거나 충돌 시 번호를 올려야 한다.
- 두 관리자가 동시에 새 기본 탭을 만들면 같은 `def-N` 이 나올 수 있다. TAB_ID 유일 제약이 뒤 저장을 막으므로 그 관리자는 다시 저장해야 한다.

---

# 구조 변경 기록 — widget-tabs (프런트, 2026-10-05)

설계 정본은 [design-widget-tabs.md](design-widget-tabs.md) §4 이다. 시험 명령은 shared `npx vitest run --maxWorkers=2 tests/unit/widget- tests/unit/lookup-multi-modal.unit.test.ts`, m-mcm `npx vitest run --maxWorkers=2 page-components/csa/commWidgetMng page-components/home`(둘 다 heavy.sh 경유).

## S1. shared 위젯 — 고정 탭·mode·탭 파일·공유
- 커밋: 4843a13d(순수 함수), c673aa53(WidgetTabs·WidgetWorkspace·공유 창·파일)
- 바뀌기 전: 「홈」만 고정. 탭 순서는 seq 만으로 정렬. 관리자 편집은 `singleTab` 단일 탭. 탭 메뉴는 이름·잠금·옮기기·지우기·홈 되돌리기.
- 바뀐 뒤: `types.ts` 끝에 인터페이스 병합으로 `WidgetTab.defaultTab?·customized?`, `WidgetStore.resetTab?·shareTab?·searchUsers?`, `WidgetShareUser`·`WidgetShareResult`·`WidgetTabExportFile`·`WidgetTabExportItem` 을 덧붙였다(기존 선언 변경 없음). `widget-layout.ts` 에 `isFixedTab`·`orderTabs`·`fixedTabCount`·`uniqueTabName`·`buildTabExport`·`parseTabImport`·`tabImportMessage`·`shareResultMessage` 를 더했고, `reuseTabs` 비교에 `defaultTab`·`customized` 를 넣었다. `constants.ts` 에 `MAX_DEFAULT_TABS`(5)·`MAX_SHARE_USERS`(10)·`SHARE_KEYWORD_MIN`(2)·`TAB_EXPORT_VERSION`·`TAB_EXPORT_KIND`. `WidgetTabs` 새 선택 props(`mode`·`maxTabs`·`onResetTab`·`onShare`·`onExport`·`onImport`·`importDisabled`·`importTitle`) — 핸들러가 없으면 항목을 그리지 않는다. `WidgetWorkspace` 새 prop `mode`("user"|"admin"). 새 파일 `WidgetShareDialog.tsx`(공유 창, 열 때만 마운트), `widget-file.ts`(JSON 내려받기·파일 읽기).
- 바꾼 이유: 관리자 기본 탭(고정 탭)·기본으로 되돌리기·공유·내보내기·가져오기(사용자 결정 2026-10-05 §0-1·0-2)와 관리자 다중 탭 편집.
- 동작 보존 근거: 기존 위젯 시험 12개 파일 192건 통과(widget-workspace·entry-load·pdf·tabs 포함, 시험 파일 수정 없음). 새 시험 `widget-tab-io`(24)·`widget-tabs-default`(12)·`widget-workspace-tabs`(18).
- 영향 범위: 사용자 홈(m-mcm home) 탭 줄에 (+) 옆 「가져오기」 단추와 탭 메뉴 「내보내기」가 새로 보인다. store 에 shareTab·searchUsers 가 있으면 「공유…」. `singleTab` 은 그대로 남아 있다(지금 쓰는 곳 없음).
- 되돌리는 방법: c673aa53 → 4843a13d 순으로 revert. m-mcm 커밋(ee2dc912·59b10c7a)이 새 타입·mode 를 쓰므로 먼저 되돌린다.

## S2. shared 공통 부품 — LookupMultiModal
- 커밋: 9bbe00a9, 문서 d8118a4a
- 바뀌기 전: 검색 팝업은 한 행만 고르는 `LookupModal` 뿐.
- 바뀐 뒤: `components/lookup/LookupMultiModal.tsx`(검색어 최소 글자·체크 목록·고른 칩·최대 개수·제외 코드, [확인]은 닫지 않음)를 `@dk-oasis/shared/lookup` 으로 내보낸다(새 서브패스 없음). 위젯 공유 창은 이 파일을 직접 import 한다(lookup index 를 거치면 AgDataGrid 가 위젯 묶음에 딸려 온다). mantine-aggrid-ui 스킬 `references/components/lookup-multi-modal.md`·`widget.md`·`ui_docs.py` 분류·`llms.txt`·`llms-full.txt` 갱신.
- 바꾼 이유: 받는 사람 여러 명 검색·선택은 도메인과 무관한 부품이라 CLAUDE.md 「공통 컴포넌트 행동강령」·Part B §18 대로 등록.
- 동작 보존 근거: 기존 lookup 부품 변경 없음. 새 시험 `lookup-multi-modal`(7). `ui_docs.py check-examples` 통과, `coverage` 는 기존 `useWidgetVisible` 미등재 1건만 남음(이번 변경 전부터).
- 영향 범위: 새 부품만 추가.
- 되돌리는 방법: 9bbe00a9 revert(그 전에 c673aa53 의 WidgetShareDialog 를 되돌린다).

## S3. m-mcm 홈 저장소
- 커밋: ee2dc912
- 바뀌기 전: secWidget search·saveTab·deleteTab·reorderTabs·resetHome.
- 바뀐 뒤: search 줄 `defaultYn`·`customYn` → `defaultTab`·`customized`(기본 탭 줄에만 칸을 싣는다), 새 `resetTab`·`shareTab`(grids `targets.rows`)·`searchUsers`. 응답 `ok` 는 boolean·"Y" 모두 받는다. `page.tsx` 는 바꾸지 않았다(작업 공간이 store 메서드 유무로 메뉴를 정한다). 「홈」 되돌리기는 resetHome, 홈 기본 배치는 widgetDef/list 그대로.
- 바꾼 이유: 설계 §3.1 호출부.
- 동작 보존 근거: 홈 시험 전부 통과, 새 `widget-store.test.ts`(5).
- 영향 범위: 사용자 홈.
- 되돌리는 방법: ee2dc912 revert.

## S4. 위젯관리 「기본 배치」 — 다중 탭 admin 보드
- 커밋: 59b10c7a
- 바뀌기 전: `LayoutTab` 이 `WidgetWorkspace singleTab` + 어댑터(load=loadLayout, saveTab=saveLayout, 나머지 거절).
- 바뀐 뒤: `WidgetWorkspace mode="admin"`(홈 + 기본 탭 최대 5개). `layout-store` 어댑터: load = 홈(미리 받은 배치 또는 loadLayout) + `loadDefaultTabs`, saveTab 은 홈 → saveLayout·그 밖 → `saveDefaultTab`, deleteTab → `deleteDefaultTab`, reorderTabs → `reorderDefaultTabs`, 새 탭 `tab-N` → 서버 `def-N` 매핑을 기억(load 때·지울 때 비움, 저장 안 한 탭 지우기·순서는 서버를 부르지 않음). 기본 탭 API 가 없는 api 를 주면 예전처럼 홈만 다룬다. `layout-api` 에 4개 action, `searchLayouts` 의 `tabCount`(응답에 있을 때만). `layout-model` 에 `LoadedDefaultTab`·`defaultTabsFromRows`·`tabsFromBoard`·`MAX_DEFAULT_TABS`, 목록 이름에 「기본 탭 n개」, 지우기 확인 문구에 기본 탭도 지워진다는 문장. 보드 제목은 GridPanel 제목(「전사 기본 배치」)으로 옮기고 보드 위에 홈·기본 탭 안내 한 줄.
- 바꾼 이유: 설계 §3.2·§4.
- 동작 보존 근거: 기존 commWidgetMng 시험(layout-store 8·layout-model 26·layout-api 16·board-mode 1) 통과. 새 `layout-default-tabs.test.ts`(17), board-mode 에 admin 모드 단언 1건 추가.
- 영향 범위: 위젯관리 화면 「기본 배치」 탭. 서버 action 은 wt-backend 가 같은 계약으로 만든다.
- 되돌리는 방법: 59b10c7a revert.

## 프런트가 가정한 점·남은 위험
- 사용자 탭 정렬은 클라이언트가 홈 → 기본 탭(seq 순) → 일반 탭으로 다시 한다(서버 tabSeq 100+ 에 기대지 않는다).
- 가져오기는 파일을 검사한 뒤 새 일반 탭을 **바로 저장**한다(편집 모드로 열지 않는다). 탭 한도·이름 중복·없는/사용 중지 위젯 거르기는 클라이언트가 먼저 하고, 서버 한도 거절은 알림으로 보인다.
- 공유는 편집 중이면 막는다(서버는 저장된 배치를 복사한다).
- 관리자 보드에서 새 탭을 만든 뒤 [완료] 에서 저장이 일부 실패하면 저장된 탭만 `def-N` 매핑이 남는다. 그 상태에서 [취소] 하면 저장된 탭은 남는다(기존 [완료] 실패 규칙과 같다).
- 브라우저 확인은 하지 않았다(조정 세션 몫).
