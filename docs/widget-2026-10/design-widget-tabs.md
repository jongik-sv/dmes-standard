# widget-tabs 설계 (항목 1·2, 2026-10-05)

정본 지시: `/Users/jji/.coord/widget-2026-10-05/lanes/widget-tabs/brief.md`, 공통 규칙: 메인 체크아웃 `docs/widget-2026-10/README.md`.
경로 표기는 워크트리 기준이다(`src/backend/mcm-core/...`, `src/frontend/...`).

## 1. 결정 사항 (사용자 §0 + 레인 기본안)

> **2026-10-07 개정: 고정 탭** — [2026-10-07-widget-fixed-tabs-design.md](../superpowers/specs/2026-10-07-widget-fixed-tabs-design.md) 참고. 기본 탭은 이제 사용자 개인화·재정의 행·「기본으로 되돌리기」 없이 **늘 보이고 사용자가 편집할 수 없는 고정 탭**이다(되돌리기 없음). 부서 사슬은 첫 키 하나가 아니라 전체가 탭으로 쌓이고, 한도는 개인 탭(`tab-N`)만 세어 10개다. 아래 옛 문장은 지우지 않고 둔다.


- 기본 탭 = 관리자가 전사(`*`)·부서 키에 두는 탭 여러 개. 「홈」 기본 배치(`TB_MCM_WIDGET_DEFAULT_LAYOUT`)는 **건드리지 않는다**(widgetDef/list 의 homeDefault 불변). 홈 외 기본 탭은 새 테이블 2개에 둔다.
- 기본 탭 ID 는 `def-N`(전역 유일, 최대 30자). 사용자 탭 `tab-N`·`home` 과 구분된다.
- 사용자의 기본 탭 집합 = 부서 사슬(자기 부서 → 상위, 최대 10단) → 전사(`*`) 중 기본 탭이 하나라도 있는 첫 키의 집합 전체.
- 한도: 사용자 탭 합계(홈 포함) 10개. 기본 탭도 포함. 관리자 기본 탭은 키당 최대 5개.
- 사용자는 기본 탭을 지우거나 이름을 바꿀 수 없고, 순서도 못 바꾼다(홈 다음에 관리자 순서로 고정). 잠그기와 「기본으로 되돌리기」는 된다. 배치는 개인화한다.
- 개인화한 기본 탭은 사용자 테이블(`TB_MCM_SEC_USER_WIDGET_TAB`/`_WIDGET`)에 같은 `def-N` 탭 ID 행으로 저장한다(재정의 행). 되돌리기 = 그 행 삭제.
- 새 기본 탭은 secWidget/search 가 접속 때마다 풀어 주므로 다음 접속에 생긴다. 관리자가 기본 탭을 지우면 사용자 재정의 행은 두고 화면에서만 숨긴다.
- 공유 = 사본 전달. 받는 사람에게 「(공유) 이름」 새 `tab-N` 탭으로 즉시 복사. 배치·위젯 설정(configJson)만 넘기고 메모·대화 테이블 내용은 복사하지 않는다(별도 테이블이라 행 복사만 하면 자동으로 빠진다). 받는 사람의 탭 한도를 지킨다.
- 내보내기·가져오기는 클라이언트만. JSON 파일, `version: 1`. 가져올 때 등록부에 없거나 `meta.disabled` 위젯은 빼고 알린다. 서버 변경 없음.

## 2. 테이블 (erd-widget-tabs.md 에도 적는다)

- `TB_MCM_WIDGET_DEFAULT_TAB` (LAYOUT_KEY 30, TAB_ID 30 = `def-N`, TAB_NM 60, TAB_SEQ int) PK(LAYOUT_KEY, TAB_ID) + 감사 칸.
- `TB_MCM_WIDGET_DEFAULT_TAB_ITEM` (LAYOUT_KEY, TAB_ID, INST_ID 40, WIDGET_ID 100, POS_X, POS_Y, SIZE_W, SIZE_H, LOCK_YN) PK(LAYOUT_KEY, TAB_ID, INST_ID) + 감사 칸.
- 기존 테이블은 변경 없음. 로컬은 `ddl-auto: update` 로 자동 생성.

## 3. 서버 API 계약

### 3.1 사용자 secWidget (AUTH_ONLY, 모두 `requireUser()` 로 본인 기준)

> **2026-10-07 개정: 고정 탭** — [2026-10-07-widget-fixed-tabs-design.md](../superpowers/specs/2026-10-07-widget-fixed-tabs-design.md) 참고. `search` 는 고정 탭 줄(`fixedYn=Y`·`origin`)을 돌려주고, `saveTab`·`deleteTab` 은 `home`·`def-*`·`dept-*` 를 거절하며, `resetHome`·`resetTab` 은 행을 지우지 않고 거절한다(되돌리기 없음). 개인 탭 한도는 `tab-N` 만 센다. `shareTab` 원본은 관리자 배치다.


- `search` 응답 `tabs[]` 줄에 `defaultYn`("Y"|"N"), `customYn`("Y"|"N", 기본 탭의 사용자 재정의 행이 있으면 Y) 추가. 사용자 탭 목록 = 홈(기존 로직) + 해석된 기본 탭(재정의 행 있으면 그것의 배치·잠금, 없으면 기본 배치, 이름·순서는 항상 관리자 값, tabSeq 는 100+관리자 순서) + 일반 사용자 탭. `widgets[]` 는 기존 필드 그대로이며 기본 탭 줄의 `tabId` 가 `def-N` 이다. 해석 집합에 없는 `def-*` 재정의 행은 숨긴다.
- `saveTab` 이 `def-N` 을 받으면: 사용자의 해석 집합에 있는 ID 일 때만 허용(없으면 BusinessException), tabNm 은 관리자 이름으로 덮어쓴다(요청 이름 무시), seq 는 쓰지 않는다. `deleteTab` 이 `def-*` 를 받으면 거절.
- `reorderTabs` 는 `def-*` 를 건너뛴다(순서 고정).
- 새 `resetTab` (params `tabId`) : `def-N`(해석 집합에 있는 것)·`home` 의 사용자 재정의 행 삭제. 기존 `resetHome` 은 그대로 둔다.
- 일반 탭 개수 한도(saveTab 새 탭): `tab-N` 새 탭은 (홈 제외 사용자 일반 탭 수 + 해석된 기본 탭 수) < MAX_TABS-1 일 때만.
- 새 `shareTab` (params `tabId`, grids `targets.rows` = [{userId}]) : 원본은 본인의 사용자 행에서만 읽는다(기본 탭이면 재정의 행이 있으면 그것, 없으면 기본 배치). 받는 사람마다 존재·사용 중 확인, 본인 제외, 최대 10명, 받는 사람의 탭 한도 확인, 이름 「(공유) 」+원본 이름을 20자로 자르고 충돌하면 숫자 꼬리, 새 `tab-N`, instId 재발급, lock 은 N 으로, 한 트랜잭션 writer 에서. 응답 `results[]` = {userId, ok(boolean), tabNm, message}. 홈·기본 탭도 공유할 수 있다(사본은 일반 탭).
- 새 `searchUsers` (params `keyword`) : 2자 이상, 활성 사용자만, 최대 20건, 응답 `users[]` = {userId, userNm, deptNm}. 쿼리는 `widget/repository/**` 에 둔다.

### 3.2 관리자 commWidgetMng (RBAC, 기존 메뉴 권한)

기존 `searchLayouts/loadLayout/saveLayout/deleteLayout/searchDepts` 는 동작 유지(홈 기본 배치). 추가:
- `loadDefaultTabs` {layoutKey} → {layoutKey, tabs:[{tabId, tabNm, tabSeq, items:[{instId, widgetId, posX, posY, sizeW, sizeH, lockYn}]}]} (그 키의 `def-*` 탭만, 순서대로).
- `saveDefaultTab` {layoutKey, tabId?, tabNm, tabSeq} + grids `widgets.rows`(saveLayout 과 같은 줄, 빈 목록 허용) → {layoutKey, tabId, count}. tabId 가 없거나 `def-N` 으로 존재하지 않으면 새 ID 채번(전역 max+1). 키당 5개 한도, 탭 이름 중복(같은 키) 거절, 이름 20자.
- `deleteDefaultTab` {layoutKey, tabId} → {deleted}.
- `reorderDefaultTabs` {layoutKey} + grids `tabs.rows`=[{tabId}] .
- `searchLayouts` 의 목록에는 홈 기본 배치가 없고 기본 탭만 있는 키도 나타난다(count 는 홈 위젯 수 + 기본 탭 수가 아니라 기존 count 에 `tabCount` 필드를 따로 추가).
- `deleteLayout` 은 그 키의 홈 기본 배치와 기본 탭을 모두 지운다.

## 4. 화면

> **2026-10-07 개정: 고정 탭** — [2026-10-07-widget-fixed-tabs-design.md](../superpowers/specs/2026-10-07-widget-fixed-tabs-design.md) 참고. shared `WidgetTab` 에 `fixed?`·`origin?`, `WidgetWorkspace` 에 `fixedHome?`·`homeTabName?`, `WidgetBoard` 에 `emptyText?` 가 더해졌다. 고정 탭은 [배치 편집]이 막히고 메뉴에는 공유·내보내기만 있으며, 기본 탭 개인화·「기본으로 되돌리기」·「홈 기본 배치로 되돌리기」는 `fixedHome` 을 쓰지 않는 사용처 호환용으로만 남는다.


- shared `WidgetTab` 에 `defaultTab?: boolean`, `customized?: boolean` 추가. `WidgetStore` 에 선택 메서드 `resetTab?(tabId)`, `shareTab?(tabId, userIds)`, `searchUsers?(keyword)` 추가(없으면 해당 메뉴 안 보임). 기존 시그니처 변경 없음.
- `WidgetWorkspace` 에 `mode?: "user" | "admin"`(기본 user) 추가. admin 에서는 탭 잠그기·홈 되돌리기·공유·내보내기·가져오기 메뉴를 숨긴다. 탭 이름 바꾸기·옮기기·지우기는 홈 외 탭에 허용.
- 「고정 탭」: `home` 과 `defaultTab` 탭은 지우기·이름 바꾸기·옮기기 불가, 탭 줄 앞쪽(홈, 기본 탭들)에 고정, 일반 탭이 그 뒤.
- 탭 메뉴(user): 기본 탭은 잠그기 / 기본으로 되돌리기(재정의가 있을 때만 활성) / 공유 / 내보내기. 일반 탭은 기존 메뉴 + 공유 / 내보내기. 탭 줄 오른쪽(또는 (+) 옆)에 「가져오기」.
- 되돌리기 뒤에는 조용히 다시 불러온다(`load({silent:true})`). 기본 탭 편집은 일반 탭과 같게 [배치 편집] → [완료] 로 saveTab.
- 관리자 `LayoutTab` 은 `singleTab` 대신 다중 탭 `WidgetWorkspace mode="admin"` 으로 바꾼다. `layout-store` 어댑터가 홈은 기존 saveLayout, 기본 탭은 saveDefaultTab 으로 보낸다. 새 탭의 클라이언트 임시 ID(`tab-N`)는 어댑터가 서버 `def-N` 으로 매핑해 기억한다.
- 가져오기 JSON 모양: `{ "version": 1, "kind": "dmes-widget-tab", "name": "탭 이름", "items": [{ "widgetId", "x", "y", "w", "h", "locked", "config" }] }`. 버전이 다르거나 모양이 틀리면 거절하고 알린다. 위젯 30개 초과는 거절. 가져온 탭 이름은 중복이면 숫자 꼬리.
