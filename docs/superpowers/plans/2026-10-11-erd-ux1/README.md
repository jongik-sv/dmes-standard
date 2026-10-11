# ERD 도구 UX 정비 1차 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ERD 설계 화면(m-mdm `erdEdit`)의 캔버스 면적을 넓히고, 첫 화면을 바로 읽히게 하고, 사람이 읽는 문구를 쉬운 한국어로 바꾸고, 싼 직관성 개선(글자 단추·메뉴·안내 줄·비활성 이유·빈 상태 시작 단추·[물리명도] 끔·논리명 먼저)을 넣는다. 서버는 확정 검사에서 감사 컬럼을 막지 않게 하고, 화면 문구에 필요한 칸(`userHint`, 변경 기록 `at`)만 더한다.

**Architecture:** 화면 분할을 CSS grid 에서 shared `ContentBody resizable`·`ContentPanel` 로 바꾼다(Part B §4-3). 크기는 ContentBody 가 사용자별로 저장. 나머지 작업 상태(마지막 모델·모드·프리셋·패널 열림·viewport)는 새 순수 모듈 `state/prefs.ts` 가 localStorage 한 키에 둔다. 위 막대는 한 줄로 줄이고 버전 단추는 shared `DetailPopover` 안 `VersionActionBar`(그대로)로 옮긴다. 메시지 줄은 shared toast + 숨은 live region 으로 바꾼다. 2-D 자동 배치는 `canvas/erd-layout.ts` 안 후처리(묶음별 dagre → 높은 층 나누기 → 선반 포장)이고 shared `autoLayout` 은 안 바꾼다. 서버 API 는 칸 추가만 한다.

**Tech Stack:** React 19, `@xyflow/react` 12.12.0, `@dagrejs/dagre`(shared `autoLayout`), shared `/layout`(ContentBody·ContentPanel)·`/detail-popover`·`/floating-panel`·`/message-provider`·`/react-flow`(ContextMenu·ToolButton)·`/form`·`/modal`, vitest(happy-dom). Java 21, Spring Boot 4, JUnit 5 + Mockito(mdm lib), `node:test`(`scripts/erd/tests/`).

**입력(범위 정본):** [docs/erd-tool/ux-2026-10-11/README.md](../../../erd-tool/ux-2026-10-11/README.md) 의 진단·개선안 1-5·사용법 직관성·"다음 회차 제안" 1차 행·사용자 결정. 근거: [A-exerd.md](../../../erd-tool/ux-2026-10-11/A-exerd.md), [B-complexity.md](../../../erd-tool/ux-2026-10-11/B-complexity.md)(과제별 단계, file:line), [C-walkthrough.md](../../../erd-tool/ux-2026-10-11/C-walkthrough.md)(「Space / layout」 측정값). 앞 계획: [단계 2 README](../2026-10-11-erd-tool-stage2/README.md)(S2-1~S2-30, "단계 2 구현 결정"). 미룬 기능: [docs/erd-tool/deferred.md](../../../erd-tool/deferred.md)(80번까지).

**착수 전:** dev `07c68195e`(UX 조사 문서 커밋). 단계 2 머지 끝. 화면 라우팅 = RULE.md 분기 3(MES 개발) 아님 — mdm 화면 FE 작업이라 공통 [FrontEnd README](../../../guide/FrontEnd/README.md)·[Local-Rules](../../../guide/FrontEnd/Local-Rules.md)·[Part B](../../../guide/FrontEnd/standard-v2/part-b-shared-policy.md)·`mantine-aggrid-ui` 스킬(무조건 적용)을 따른다. 서버는 [Backend 구현 가이드](../../../guide/BackEnd/Backend-Implementation-Guide.md).

**완료 기준:**
- 1440×900·1920×1080 에서 캔버스 면적: 기본 상태(고른 표 없음, 검토 패널 접힘) 1440 은 40% 이상, 1920 은 50% 이상. 캔버스 최대화 상태 1440 은 60% 이상, 1920 은 70% 이상. 기준선 16.4%·28.2%(C 「Space / layout」). `measure.js` 로 잰다.
- ERD 위 막대 높이 44px 이하(모델 2개, 1440×900, 한 줄).
- 첫 화면이 읽히는 배율로 열린다(U22: 저장 viewport → 맞춤 배율 ≥ 0.35 면 맞춤 → 아니면 배율 1). [자동 배치] 결과 가로세로 비가 캔버스 비의 0.5-2배.
- **큰 모델 읽기(U49-U54):** MCM 57개 표를 [자동 배치] 한 뒤 1920×1080 기본 상태에서 [화면 맞춤] 배율 0.25 이상. 배율 0.5 미만 어디서나(이름만·개요 단계) 표 이름이 화면 글자 크기 11px 이상으로 보인다. 미니맵 토글이 있다. [주제별로 나누기] 로 표 5-20개짜리 다이어그램들이 생기고, 다음에 그 모델을 열면 작은 다이어그램이 먼저 열린다.
- 화면 어디에도 `getChangesSince`·`baseRev`·`getModelText`·`ERD_STD_*`·`NAME_RULE`·`SQL_JOIN`·`ui-` 세션 이름이 보이지 않는다(툴팁 제외 = `title` 의 세션 이름만 허용).
- 두 번째 확정에서 새 표의 감사 컬럼 위반이 확정을 막지 않는다(경고로만 보임).
- README "직관성 확인 방법" 과제 5개를 개선 뒤 단계 수로 다시 잰다(목표 판정은 보고만, 미달이어도 실패 아님).
- 렌더 하네스 erdEdit `formInput` 이 돈다(입력 한 글자당 화면 루트 렌더 0회 판정, Screen-Performance-Guide §5).

**문서 구성:** README = 결정·제약·인터페이스 정본·레인. Task 파일 3개. Task 맡은 사람은 README + 자기 파일을 읽는다. 인터페이스 이름·모양·키·testid 는 아래 "인터페이스 (정본)" 이 정본. 서버 칸(`userHint`, `at`)은 화면 레인이 정본 모양 가짜 응답으로 먼저 시험한다(단계 2 S2-1 방식).

---

## 1차에서 정한 점

U1-U9 는 범위·레인, U10 부터 화면·서버 판정. 단계 2 결정(S2-*)은 바꾸지 않는다. 바꿀 때는 U 행에 적었다.

| # | 결정 | 이유 |
|---|---|---|
| U1 | 회차 1개, 레인 2개(FE1·FE2) + 마감. 서버 일은 FE2 의 첫 Task(Task 5)로 둔다. 서버 파일과 화면 파일은 겹치지 않는다 | 모드 token(레인 최소). 서버 일은 작다(검사 한 줄 규칙 + 칸 2개 + 가져오기 격자). 레인 하나를 더 띄우는 비용이 일보다 크다 |
| U2 | 화면 공통 파일(`ErdViewer.tsx`·`types.ts`·`api.ts`·`edit-context.ts`·`state/permissions.ts`·`canvas/erd-styles.ts`)은 FE1 만 고친다. FE1 Task 1(뼈대)이 FE2 가 기대는 것(새 타입 칸, `labels.ts`, `state/violations.ts`, `ErdNav.startColumnAdd`, `ColumnGrid` 의 `addRequest` prop, `shortReason`)을 먼저 만들어 머지한다. FE2 는 FE1 Task 1 머지 뒤에 Task 6 Step 7·Task 7·8 을 한다 | 단계 2 S2-19 와 같은 방식. 이번에는 `ErdViewer.tsx` 가 레이아웃·첫 화면·문구 모두에 걸린다 |
| U3 | `canvas/erd-styles.ts` 는 이번 회차 FE1 소유(단계 2 는 FE2). 레이아웃 CSS(`.erd-app`·`.erd-area-*`)가 거기 있어서다. FE2 의 새 규칙은 `canvas/erd-edit-styles.ts` 에 둔다 | 한 파일 두 레인 금지 |
| U4 | 도움말(`erdEdit_사용자도움말.md`)·기능설계서는 마감 Task 9 하나가 고친다. 레인은 보고에 "도움말 반영 메모"(절 → 바뀐 점)를 적는다. 아래 "도움말 반영 표" 가 시작점 | 두 레인이 같은 문서를 고치면 겹친다 |
| U5 | 시험 기준 viewport 2개: 1440×900, 1920×1080. 면적은 C 의 `docs/erd-tool/ux-2026-10-11/scripts/measure.js` 로 잰다. 그래서 측정 선택자(`.erd-app`·`.erd-area-bar`·`.erd-area-side`·`.erd-area-center`·`.erd-area-grid`·`.erd-area-grid .grid-panel`·`.erd-area-review`·`.page-layout__footer-breadcrumb`)는 이름을 지킨다 | 기준선 16.4%·28.2% 와 같은 방법으로 비교 |
| U6 | 2차로 미루는 것(이번에 안 함): 속성 창(Space), 캔버스 그 자리 편집·F2, 관계선 선택, 추가·이름 바꾸기 분리(Enter), 복사·붙여넣기, redo, 버전 숨기기·DRAFT 자동, 처음 둘러보기, 표 이름 바꾸기, 컬럼·관계 삭제 UI, 자기 참조 그리기 | 사용자 결정(README 2차 행) |
| U7 | 브라우저 마감은 TPL_DATA 복제 PDB(`L_UX1C`)에서 한다. L_MAIN 에는 쓰지 않는다. 쓰기(표 추가·확정)가 필요한 확인이 많다 | 단계 2 S2-9·07-close 와 같음 |
| U8 | 사람 이름 표시(사용자 ID → 이름)는 하지 않는다. mdm 에 사용자 이름 조회가 없다(조사: `USER_NM`·`SEC_USER` 조회 없음). 화면은 "나" 와 ID 를 보이고 세션은 `title` 로만 보인다. deferred 새 행 | 새 서버 API·권한 범위라 1차 밖 |
| U9 | 레인 모델: FE1 opus, FE2 opus. 서브에이전트 동시 상한 10 | 모드 token 이지만 FE2 에 "큰 모델 읽기"(2-D 배치·단계별 그리기·주제별 나누기)가 들어가 판단이 많다. FE1 은 레이아웃·상태 저장·시험 수정이 넓다 |
| U10 | **화면 분할 = shared `ContentBody resizable` + `ContentPanel`.** 바깥 column(`storageKey="mdm.dma.erdEdit"`) = [main row ContentBody, 검토 ContentPanel]. main row(`storageKey="mdm.dma.erdEdit.main"`) = [왼쪽 ContentPanel 220, 캔버스 ContentPanel flex, 속성 ContentPanel 400]. 크기는 ContentBody 가 `dmes:split:v1:{userId}:<storageKey>` 로 저장. 새 shared 부품 없음 | Part B §4-3 이 분할 영역에 `ContentBody resizable` 를 요구(CSS grid 금지). 크기 저장·키보드 조절·더블클릭 기본값이 이미 있다. 선례 `m-mdm/pages/dme/ruleSetEdit/RuleSetEditor.tsx:906-913`(React Flow 화면) |
| U11 | **검토 패널 기본 접힘.** 접힘 = 탭 줄만(높이 32px 이하, 건수 보임). 탭 줄은 ContentBody 밖 형제로 둔다(ContentBody 의 column 최소 120px 에 걸리지 않게). 탭을 누르면 펼치고 그 탭을 연다. 펼침 = ContentPanel `key="review"` `height={260}` `minSize={120}`. 위반이 있어도 저절로 열지 않는다. 열림·마지막 탭 기억(prefs) | 세로 +230px(C). B "첫 화면 과부하" 7번 |
| U12 | **오른쪽 속성 패널:** 고른 표가 있으면 보이고, 없으면 렌더 안 함(자동 숨김). 사용자가 [접기] 하면 28px 레일로 남고 기억(prefs `propsOpen`). 초점이 패널 안(그리드·입력 칸)에 있으면 선택이 풀려도 초점이 나갈 때까지 숨기지 않는다. 패널이 열리고 닫혀 캔버스 폭이 바뀌면 고른 노드가 캔버스 밖이면 그 노드로 옮긴다(배율 유지) | C 26번(크기 바뀌면 고른 표를 잃음). 대부분 시간 "0건" 패널이 400px 를 쓴다(C 3번) |
| U13 | **왼쪽 목록 접기:** [접기] 하면 28px 레일, 기억(prefs `sideOpen`) | C 레이아웃 제안 4 |
| U14 | **캔버스 최대화:** 상태는 `ErdViewer` 의 `maximized`(기억 안 함). 켜면 왼쪽·속성·검토 패널과 탭 줄을 렌더 안 하고 위 막대(40px)만 남긴다. 고른 표가 있으면 shared `FloatingPanel`(`storageKey="mdm.dma.erdEdit.props"`, 위치·크기 저장)에 `ColumnGrid` 를 띄운다. 켜고 끄기 = 캔버스 Controls 의 [최대화] 단추 + **Alt+M**(⌥M, `e.code === "KeyM"`, window 캡처, 입력 칸이면 넘김) | Alt+O 와 같은 방식. F11 은 브라우저, Ctrl+Shift+M 은 Chrome 프로필 전환이라 피함. 다시 열 때 최대화로 시작하면 패널이 사라진 것처럼 보인다 |
| U15 | **위 막대 한 줄(40px 목표):** [모델 단추들] [+ 모델] · 요약 줄 · [버전 1.000 · 작성 중 ▾] · [읽기 전용] 칩 · 접속자 · (빈 칸) · [논리|물리] · [기본|E-R 개요|논리+물리] · [범례] · [DB 에서 가져오기](표 없는 모델만). 모델 등록 입력은 shared `Modal` 로 옮기고 칸마다 라벨. 끊김 띠(`erd-banner-lost`)·거절 알림 띠(`NoticeBar`)는 있을 때만 그 아래 줄. 빈 메시지 줄(`erd-message`, 18px)은 없앰 | C 레이아웃 제안 5. 모델 단추는 testid·하네스 클릭을 지키려고 그대로 둔다(모델 2개) |
| U16 | **버전 ▾ = shared `DetailPopover` 안에 `VersionActionBar` 그대로**(라벨·순서·모양·확인창 그대로). 팝오버 안에 rev·공동 편집자 단추도 둔다. `ConfirmDialog`·`EditorsModal` 은 팝오버 밖(VersionBar 루트)에 둔다 — DetailPopover 는 닫히면 내용을 언마운트한다. [확정]·[공동 편집자] 를 누르면 팝오버를 닫고 창을 연다 | `VersionActionBar` 는 다른 화면 6곳이 쓴다. Local-Rules §24 "버튼은 늘 보임" 과의 차이는 "사용자 승인·확인 필요" 3번 |
| U17 | **비활성 [확정] 이 파란색인 문제:** ERD 범위 CSS `.erd-ver-pop [data-testid="erd-ver-confirm"]:disabled` 로 비활성 토큰(`--color-bg-disabled`·`--color-text-disabled`)을 입힌다. shared `Button`·`VersionActionBar` 는 안 바꿈. 인라인 스타일이라 CSS 가 못 이기면 그대로 두고 레인 보고 | 기존 shared 모양 변경은 승인 사항(Part B §18-2) |
| U18 | **화면 제목 "ERD 설계" 숨김:** `MdmPageLayout className="erd-page"` → `.page-layout.erd-page > .page-layout__header { display: none; }`. 아래 꼬리(breadcrumb·화면 ID)는 그대로(하네스 신호). shared `PageLayout` 은 안 바꿈 | 포털 탭 이름과 같은 글이 37px 를 쓴다(C). `ERD_CSS` 는 head 에 남고 포털은 숨은 탭을 둔다 → 규칙은 반드시 `.erd-page` 로 좁힌다 |
| U19 | **읽기 전용 안내 = 칩 하나.** 위 막대 `[읽기 전용]` 칩(`title` = 짧은 이유). 누르면 `DetailPopover` 로 긴 이유와 할 일. 모델·이유별로 처음 한 번은 저절로 연다(prefs `seenReadOnly`). 노란 띠는 없앤다. 다른 곳(도구 막대 툴팁·그리드 입력 칸·DB 다시 가져오기 탭)은 짧은 이유(`shortReason`)만 쓴다 | 같은 긴 문장이 최대 3곳 + 모든 꺼진 아이콘 툴팁(C 2번·15번) |
| U20 | **메시지 → toast.** `ctx.notify(text, tone)` 는 shared `useMessage().showMessage({ message, alertType, toast: true, toastDuration })` 를 부른다(info 3000ms, warn 5000ms, error 8000ms). 같은 글을 숨은 live region `<div role="status" aria-live="polite" className="erd-sr-only" data-testid="erd-message">` 에도 둔다(화면 높이 0, 시험·스크린리더용) | 빈 메시지 줄 제거(C). toast 는 Part B §9 의 유일한 경로(`useMessage` toast). live region 으로 기존 시험 약 10개가 그대로 통과 |
| U21 | **작업 상태 저장:** 키 `dmes:erdEdit:v1:{userId}` 하나(JSON, 아래 정본). 모든 읽기·쓰기 try/catch, 실패하면 기본값. 쓰기는 300ms 미룸. 읽는 때 = `me`(RBAC)와 모델 목록이 둘 다 온 뒤 한 번. `lastModelId` 는 목록에 있고 그 사이 사용자가 모델을 고르지 않았을 때만 연다. 기존 `dmes.erdEdit.showAudit` 키는 그대로 둔다 | §39 키 모양(`dmes:...:{userId}`)을 따른다. `me` 는 첫 렌더 뒤에 온다 |
| U22 | **첫 화면 배율:** `fitView` prop 을 끄고 `initialViewport` 로 정한다. (1) 저장 viewport(`viewports["모델/다이어그램"]`)가 있으면 그것. (2) 없으면 다이어그램 전체 맞춤 배율(상한 1)을 계산해 0.35(`FIRST_FIT_MIN_ZOOM`, U50 개요 단계 문턱과 같은 값) 이상이면 맞춤. (3) 아니면 배율 1 로 첫 표(노드 묶음 왼쪽 위)를 캔버스 왼쪽 위 40px 안쪽에 둔다. 이동이 끝나면(`onMoveEnd`) viewport 저장. [화면 맞춤]·Shift+1 은 그대로 맞춤(최소 0.1) | 서버에 저장된 자리는 읽기 전용 사용자가 바꿀 수 없다 → 첫 화면 개선은 viewport 로 한다. 작은 다이어그램(U53)은 한눈에 보이는 편이 낫다. C 1번(배율 0.1) |
| U23 | **2-D 자동 배치("큰 모델 읽기" 1):** `canvas/erd-layout.ts` 의 `layoutTables` 를 바꾼다. 관계 연결 묶음(connected component)마다 shared `autoLayout`(dagre LR) → 묶음 높이가 목표 높이를 넘으면 층(같은 x)을 높이 상한으로 나눠 옆 열로 쌓기(`wrapRanks`) → 묶음·외톨이 표를 줄 단위로 포장(`packShelves`). 목표 가로세로 비 = 캔버스 가로/세로(React Flow store `width/height`, 없으면 1.6). 화면에 반영은 [자동 배치]·다이어그램 마법사·주제별 나누기(쓰기)뿐. shared `autoLayout` 서명·기본값은 안 바꿈 | 지금 배치 = shared `autoLayout`(`@dagrejs/dagre` 3.1.1, rankdir LR, `isolated: "grid"`). 왜 세로 한 줄인가: 모델 전체가 연결 묶음 하나이고 층(rank)이 2-3개뿐이라 dagre 가 한 층의 자식 수십 개를 세로로 쌓는다(층 하나 = 열 하나). 외톨이 표 격자도 그 아래에 붙는다. C 측정(폭 약 1,700, y 2,762-8,794)이 이 모양이다. 가져오기 격자(8열 × 280, 57개면 약 2,240 × 1,760)로는 안 나온다. 마감에서 L_MAIN 노드 좌표를 읽기로 확인 |
| U24 | **가져오기 격자 겹침:** `ErdImportBuilder` 격자 행 높이를 고정 220 대신 그 행에서 가장 큰 노드 어림 높이 + 60 으로 한다(어림 = 30 + 20 × 감사 컬럼을 뺀 컬럼 수). 열 8·열 간격 280 그대로 | 노드 평균 높이 약 245 > 220 이라 겹친다(C 표). 새 가져오기의 첫 화면 |
| U25 | **위반 정의 하나:** "고칠 위반" = 상태 TYPE·DOMAIN·MISS 인 컬럼. 감사 컬럼은 보기(`showAudit`)가 꺼져 있으면 세지 않는다. 요약 줄·왼쪽 목록 수·노드 머리 수·[표준 위반] 탭(행과 건수)이 모두 이 규칙(`state/violations.ts`). NEW·ALIAS 는 탭에서 빠진다(그리드 배지로만 보임). MCP `listViolations` 는 그대로 | B "위반 정의 세 가지", C 13번(737·802·21 이 안 맞음). NEW 는 이 화면에서 고칠 수 없다(B 2d) |
| U26 | **모델 요약 줄:** `표 57 · 관계 113(추정 113) · 고칠 위반 737`(`erd-summary`). 관계 = REJECTED 뺀 수, 추정 = INFERRED 수. 표준 상태를 아직 못 읽었으면 위반 칸은 `…` | B 2a "모델 요약 없음" |
| U27 | **서버 `userHint`(새 칸, 사람용):** `ErdRejection` 에 JSON 읽기 전용 칸 `userHint` 를 더한다. 값 = `hint` 에 기계 용어(`getChangesSince`·`getModelText`·`baseRev`·`view`·`kind=`·`restore`·`undo(`·`op `·`JSON`·`setPrimaryKey`·`confirmRelation`·`updateRelation`·`copy 로`)가 없으면 `hint` 그대로, 있으면 정해진 사람 글(아래 정본 표), 정할 글이 없으면 null. `hint` 는 글자 그대로 둔다(MCP·Java 시험 4건 이상이 본다). 화면은 `hint` 를 보이지 않고 `userHint` 만 보인다 | Local-Rules §9 "프론트에서 문자열을 파싱해 사유를 추정하지 않는다". 25곳 넘는 거절 지점을 하나씩 고치는 것보다 서버 한 곳 변환 + 전수 시험이 싸다 |
| U28 | **변경 기록 `at`(새 칸):** `ErdDelta` 끝에 `at`(문자열, `yyyy-MM-ddTHH:mm:ss`, 서버 지역 시각, 초 단위)을 더한다. 명령 기록 `C_AT` 에서 읽고, 실시간 `change` 는 쓴 시각, 다시 읽기 지점은 그 행 시각. 옛 7인자 생성자는 `at = null` 로 남긴다 | 명령 기록에 `C_AT`(SYSTIMESTAMP)가 이미 있다. 스키마·V 파일 안 바꿈 |
| U29 | **감사 컬럼 확정 규칙(사용자 결정 해석):** 확정 검사에서 감사 컬럼 8개의 표준 위반은 늘 경고로 간다(오류 안 됨, 버리지도 않음). 첫 확정·두 번째 확정 모두. 코드는 그대로 `ERD_STD_*`. 화면 확정 창은 그 항목에 "감사 컬럼" 표시. 사전·DB 안 바꿈. 다른 컬럼 규칙(D19, deferred 52)은 그대로 | "감사 컬럼 8개는 확정 검사에서 제외한다. 표준 위반이 있어도 경고만 하고 확정을 막지 않는다." 두 문장을 함께 읽은 결과 = 경고에는 남기고 막지는 않음 |
| U30 | **문구 사전 `labels.ts`:** 확정 코드(`ERD_STD_TYPE`→"타입 불일치", `ERD_STD_DOMAIN`→"도메인 다름", `ERD_STD_MISS`→"사전 없음", `ERD_INFERRED_LEFT`→"검토 안 한 추정 관계"), 근거 종류(`DOC`→"설계 문서", `SQL_JOIN`→"SQL 조인", `NAME_RULE`→"이름 규칙"), 출처(`UI`→"화면", `MCP`→"Claude", `CLI`→"CLI", `SYSTEM`→"시스템"), 변경 종류(`diagramNode`→"표 자리"). 모르는 코드는 원문 | 영어 코드가 사람 글에 섞임(B 4 "Language mix") |
| U31 | **한 단어 한 뜻:** 추정 관계 판정 단추 = [맞음]/[아님](testid 그대로 `erd-confirm-{id}`·`erd-reject-{id}`). 버전 [확정] 은 §24 라벨이라 그대로. 다시 가져오기 = "DB 다시 가져오기"(검토 탭 이름·반영 창 제목·반영 단추 "고른 항목 가져오기"). 첫 가져오기 = "DB 에서 가져오기". 다시 읽기 단추는 "새로 읽기" | B 4 "Same word, different meaning", README 직관성 3번 |
| U32 | **CONFLICT·NOT_FOUND 글에서 rev 를 뺀다:** "41000207 님이 먼저 바꿨습니다. 지금 값: "역할설명"". rev 는 알림 `title` 로만. 되돌리기 성공 글 = "변경을 되돌렸습니다." 위 막대 rev 는 버전 팝오버 안으로 | B 개념 13(rev = 내부 용어) |
| U33 | **변경 기록 칸:** 시각(`at` → 오늘이면 `HH:mm`, 아니면 `MM-dd HH:mm`) · 번호(rev) · 사람(내 세션 "나", 아니면 사용자 ID. `title` = 세션 · 출처) · 출처(한국어) · 내용(요소 이름 최대 2개 + "외 n", 감사 컬럼은 "감사 컬럼 n" 으로 따로) · [되돌리기](꺼지면 `title` 에 이유). 빈 머리글 칸·세션 칸 없앰 | C 21번, B 2e |
| U34 | **비활성 단추 이유:** 꺼진 단추마다 `title`(또는 ToolButton `tip`)에 "할 일 — 짧은 이유". 대상: 도구 막대·추정 관계 [맞음]/[아님]·변경 기록 [되돌리기]·[고른 항목 가져오기]·버전 단추(이미 있음, 켜진 단추에도 할 일 설명을 더함) | C 5번·15번·19번·21번 |
| U35 | **범례:** 왼쪽 패널 범례를 색 견본 표로(실선 = DB FK·확정 관계, 파선 = 추정 관계, 행 바탕 2색, 머리 빨간 수 = 고칠 위반 수, `감사 8` = 숨긴 감사 컬럼 수, `FK?` = 추정 FK, `다른 후보 n개`, 캔버스 바탕 = 논리/물리 모드). 위 막대 [범례] 는 같은 표를 `DetailPopover` 로(왼쪽 패널을 접었을 때용) | C 9번 |
| U36 | **색 뜻 줄이기(싼 것만):** 물리 모드 캔버스 바탕 `--color-danger-soft` → 위반 행과 다른 토큰(Task 4 Step 에서 토큰 확인, 후보 `--color-bg-header`), 접속자 이름표(사람) `--color-warning` → `--color-primary`, PK 표시 `--color-warning` → `--color-primary`. 노랑 = 추정 관계·타입/도메인 행·후보 표지만, 빨강 = 사전 없음 행·위반 수·삭제만 | B 3 "Colour overload" |
| U37 | **[물리명도] 기본 끔.** 컬럼을 고를 때마다 끔으로 돌아간다(기억 안 함). 켜고 미리보기 물리명이 지금과 다르면 미리보기 줄에 `물리명도 MENU_NM → MENU_NAME 으로 바뀝니다(DB 와 달라짐)`(`erd-grid-phys-warn`) | 조용한 물리명 변경(B 5번 3위) |
| U38 | **Shift+1/2 구현:** `fitView` = 다이어그램 전체 맞춤(배율 상한 1), `fitSelection` = 고른 표 맞춤(배율 상한 1). 고른 표가 없으면 Shift+2 는 "표를 먼저 고르세요" 알림. 도움말 §5 의 "동작하지 않습니다" 줄 고침 | 키는 이미 묶였고 손잡이만 없다(C 17번) |
| U39 | **위반 행 → 컬럼 고르기:** [표준 위반] 행 클릭 = `ctx.nav.selectColumn(columnId)`(표 고르기 + 그 행). 추정 관계 행은 지금처럼 자식 표 | B 2d, `nav.selectColumn` 이 이미 있음 |
| U40 | **새 표 창 = 논리명 먼저.** 칸 순서 논리명 → 물리명. 논리명이 300ms 멈추면 `previewName({ logical })` → 물리명 칸에 `<접두><physName>` 을 채운다. 접두 = 모델 표 물리명의 가장 흔한 `TB_<X>_` (없으면 빈 접두). 사용자가 물리명 칸을 고치면 자동 채움을 멈춘다. 미리보기 토막에 사전 없는 단어(`***`)가 있으면 "물리명을 직접 넣으세요" 안내. 명령은 지금처럼 `addTable{id, phys, logical}`(서버는 물리명이 필요하다) | 컬럼 흐름과 같은 순서(B 2b·4). `previewName` 은 컬럼 이름 규칙이라 표 접두는 화면이 붙인다 |
| U41 | **관계 도구 안내 줄**(`erd-tool-hint`, 캔버스 위 가운데): 표 도구 "표를 놓을 빈 곳을 누르세요 · Esc 취소", 관계 도구 시작 전 "부모 표에서 자식 표로 끌거나, 부모 표 → 자식 표 순서로 누르세요 · Esc 취소"(식별이면 앞에 "식별 관계:"), 시작 뒤 "자식 표를 누르세요 · Esc 취소" | README 직관성 4번 |
| U42 | **자기 참조 = 알림만.** `onConnectEnd` 의 연결 상태에서 시작 노드 = 끝 노드면 `notify("같은 표 안의 관계(자기 참조)는 아직 화면에서 그릴 수 없습니다. Claude 나 CLI 의 addRelation 으로 만드세요.", "warn")`. 메뉴 [관계 시작] 뒤 같은 표를 눌러도 같다. 그리기 지원은 2차(deferred 58) | `isValidConnection` 이 같은 노드를 막아 `onConnect` 가 안 불린다. 자기 참조는 이름 겹침(PK 를 같은 표에 복사)·자기 고리 선 그리기가 필요해 싸지 않다 |
| U43 | **도구 막대 글자 단추:** [표 추가] [관계 ▾] [컬럼 추가] [PK 추가] 를 글자 단추(shared `Button size="sm"`)로, 나머지(선택·접기·감사·빼기·삭제·자동 배치)는 아이콘 그대로. [관계 ▾] = shared `ContextMenu`(비식별 관계 (4) · 식별 관계 (5)). [컬럼 추가]·[PK 추가] 는 고른 표가 하나일 때만 켜지고 `ctx.nav.startColumnAdd(tableId, pk)` 를 부른다 | README 직관성 2번. shared 에 일반 Menu 가 없다 → 이미 쓰는 ContextMenu |
| U44 | **표 오른쪽 클릭 메뉴 더함:** 컬럼 추가 · PK 컬럼 추가 · 관계 시작 ▸(비식별·식별). 빈 곳 메뉴는 그대로(표 추가·자동 배치). 이름 바꾸기·속성·복사는 2차 | README 직관성 2번 중 싼 것 |
| U45 | **빈 상태 시작 단추**(`erd-start`): (a) 모델이 하나도 없음 → "등록된 모델이 없습니다." + [새 모델 등록]; (b) 모델은 있는데 안 고름 → 모델 카드 단추(이름 · 모듈 · 스키마) + [새 모델 등록]; (c) 고른 모델에 표가 없음 → "표가 없습니다." + [DB 에서 가져오기]. 권한 없으면 단추를 끄고 `title` 에 이유. "샘플 열기" 는 샘플 모델이 없어 (b) 의 모델 카드로 갈음 | README 직관성 4번. 샘플 모델은 서버에 없다 |
| U46 | **Zoom 단추 한국어:** React Flow `Controls` 의 `showZoom={false}`, 우리 `ControlButton` [확대]·[축소]·[화면 맞춤]·[최대화] | C 16번(영어 툴팁) |
| U47 | **렌더 하네스:** `scripts/perf/render/screens.mjs` erdEdit 항목에 `formInput: 'input[data-testid="erd-grid-input"]'` 와 새 선택 칸 `formPrepare`(⑤ 앞에 차례로 누를 선택자 배열)를 더하고, `count-renders.mjs` 가 `formPrepare` 를 돈다. 다른 화면은 영향 없음. 측정은 복제 PDB(admin 이 DRAFT 소유)에서 한다 | L_MAIN admin 은 읽기 전용이라 입력 칸이 꺼져 ⑤ 를 건너뛴다. 새 브라우저 프로필에는 prefs 가 없어 모델·표를 눌러야 한다 |
| U48 | 단계 2 S2-6(shared `AgDataGrid` props 안 바꿈)·S2-10(VersionActionBar 선택 props)·S2-27(키 위치)·S2-30(감사 컬럼 8개)은 그대로 | 범위 밖 |
| U49 | **"큰 모델 읽기" 묶음(사용자 의견 10-11, 높은 우선순위)** = U22(첫 배율) + U23(2-D 배치) + U50(단계별 그리기) + U51(미니맵) + U52·U53(주제별 나누기·첫 다이어그램). 모두 1차. 캔버스 쪽은 FE2(Task 6·7), 첫 다이어그램 고르기·`ErdNav.selectDiagram` 은 FE1(Task 1·2) | 사용자 스크린샷: MCM 57개 표가 배율 약 10% 의 성긴 세로 띠로 보여 읽을 수 없다. 배율 1 기본만으로는 "모델 전체를 본다" 가 안 된다 |
| U50 | **단계별 그리기(semantic zoom):** 단계 3개. `detail`(배율 ≥ 0.5) = 지금 그대로. `names`(0.35 ≤ 배율 < 0.5) = 지금의 이름만(머리 한 줄) + 이름 글자를 화면 기준 약 12px 로 키움(같은 `calc(12px / var(--erd-zoom))`, 넘치면 `…`). `overview`(배율 < 0.35) = 노드가 원래 높이의 상자로 남고 안에 논리명·물리명 두 줄을 화면 기준 약 12px 로 그린다(글자 크기 = `calc(12px / var(--erd-zoom))`, 흐름 단위 상한 60px, 줄 넘김 허용, 최대 3줄). 관계선은 끝 모양(까마귀발·막대·"0")과 후보 표지를 숨기고 선 굵기를 화면 기준 약 1.5px 로 둔다. 단계 판정은 store 선택자(불리언 2개)로만 다시 그리고, 배율 값은 `useCanvasEditing` 이 React Flow DOM 요소에 CSS 변수 `--erd-zoom` 과 `data-lod` 로 한 번씩 쓴다(노드마다 배율을 구독하지 않음, Local-Rules §19) | 배율 0.3 에서 12px 글자는 3.6px 로 보인다. 노드 자리는 서버 값이라 개요에서 상자를 줄일 수 없다 → 글자를 키우고 상자를 이름판으로 쓴다. 0.35 는 57개 표 2-D 배치를 1920 캔버스에 맞췄을 때 배율(약 0.3)을 개요 단계로 넣으려는 값 |
| U51 | **미니맵:** React Flow `MiniMap`(shared `/react-flow` 가 `@xyflow/react` 를 그대로 다시 내보냄)을 캔버스 오른쪽 아래(Controls 위)에 둔다. 도구 막대 [미니맵] 토글(`erd-tool-minimap`). 기억 = localStorage `dmes.erdEdit.showMiniMap`(감사 토글과 같은 방식, `"1"`·`"0"`). 저장값이 없으면 다이어그램 표 30개 이상일 때 켬. 노드 색 = 위반 있는 표 `--color-danger-soft`, 고른 표 `--color-primary`, 나머지 `--color-bg-header`. `pannable`·`zoomable` 켬 | 큰 다이어그램에서 지금 어디를 보는지 모른다. 새 shared 부품 필요 없음 |
| U52 | **주제별로 나누기(1차에 넣음):** 도구 막대 [주제별 나누기]·빈 곳 메뉴 [주제별로 나누기…] → 창(`SplitDialog`)이 묶음 미리보기(이름·표 수·앞 표 3개, 묶음마다 체크)를 보이고 [만들기] 로 고른 묶음마다 `addDiagram` + `placeTables`(2-D 배치 자리)를 한 묶음으로 보낸다(MAX_BATCH 200 안). 업무영역 이름 기본 "주제별"(고칠 수 있음). 같은 이름 다이어그램이 이미 있으면 그 묶음은 끄고 "이미 있음" 표시. 권한 = `rights.diagram`. 묶는 규칙 `subjectGroups(model, tables, { min: 5, max: 20 })`: (1) 열쇠 = 표 물리명에서 모델 접두(`TB_<X>_`, U40 의 `tablePrefix`)를 뺀 첫 토막(`TB_MCM_SEC_MENU` → `SEC`). (2) 20개를 넘는 묶음은 그 안 관계 연결 묶음으로 나누고, 그래도 넘으면 물리명 순으로 20개씩 자른다(이름 `SEC 1`·`SEC 2`). (3) 5개 미만 묶음은 관계가 가장 많이 걸린 다른 묶음에 붙인다(합쳐 20 이하일 때만). 붙일 곳이 없으면 "기타" 로 모아 20개씩. (4) 순서는 묶음 이름순, 결과는 같은 입력이면 같다 | 비용: 순수 함수 하나 + 마법사와 같은 모양의 창 하나 + 기존 명령(`wizardCommands`). 서버 변경 없음. 큰 모델을 읽는 가장 확실한 길이라 1차에 넣는다. 묶음 편집(이름 바꾸기·표 옮기기)은 2차 — 만든 뒤 기존 다이어그램 기능으로 고친다 |
| U53 | **첫 다이어그램 고르기:** prefs `lastDiagram[모델]` 이 있고 살아 있으면 그것. 없으면 sortSeq 순으로 표 30개 이하인 첫 다이어그램, 그것도 없으면 sortSeq 첫 다이어그램(지금 규칙). 나누기를 마치면 만든 첫 다이어그램으로 간다(`ctx.nav.selectDiagram`) | 나누기 뒤 다시 열 때 "전체" 대신 작은 다이어그램이 먼저 열린다 |
| U54 | 큰 모델 읽기 중 2차로 미루는 것: 다이어그램을 열지 않고 겹쳐 보는 "주제 묶음 상자" 그리기, 개요 단계에서 관계선 묶어 그리기(edge bundling), 나누기 묶음 편집 | 비용이 크고 1차 목표(57개 표 읽기)는 U50-U53 으로 닿는다 |

---

## 사용자 승인·확인 필요

1차는 아래를 하지 않거나 대안으로 간다. 마감 보고 "사용자 확인 목록" 에 그대로 옮긴다.

| # | 항목 | 이번 처리(대안) | 승인되면 |
|---|---|---|---|
| A1 | shared `PageLayout` 에 제목 숨김 prop | 안 함. U18 의 화면 범위 CSS 로 숨김 | prop 으로 바꾸고 CSS 한 줄 지움 |
| A2 | shared `Button` 비활성 primary 모양(모든 화면) | 안 함. U17 ERD 범위 CSS | shared 에서 고치고 ERD CSS 지움 |
| A3 | Local-Rules §24 "버튼은 늘 보이고 조건부로 숨기지 않는다" 와 [버전 ▾] 팝오버 | 진행(U16, 조정자 지시 "version actions in a 버전 ▾ menu"). 팝오버 안에서는 §24 그대로. §24 개정 문장 제안: "ERD 설계처럼 캔버스가 주 영역인 화면은 버전 막대를 [버전 ▾] 펼침 안에 둘 수 있다. 펼침 안의 라벨·순서·모양은 이 규약을 따른다." | 사용자가 거부하면 팝오버를 걷고 위 막대 둘째 줄로 되돌린다(약 32px) |
| A4 | 포털 메뉴 접힘 기억(shared portal-shell `useState`) | 안 함 | shared portal-shell 변경 |
| A5 | 공통 그리드 F2(deferred 54·55) | 안 함 | 2차 |
| A6 | 확정 판정 규칙 중 감사 컬럼 밖(deferred 52), 되돌리기 규칙(53), 공동 편집자 등록 폐지 | 안 함 | 2차·별도 |
| A7 | `VersionActionBar` 의 [넘기기(준비 중)] 숨기기 | 안 함(팝오버 안에 남음) | VersionActionBar props 변경 |
| A8 | shared `autoLayout` 에 2-D 옵션 추가 | 안 함. ERD 로컬 후처리(U23) | shared 로 옮김 |
| A9 | U29 해석(감사 컬럼 위반을 경고에 남김) | 경고에 남김 | "아예 빼기" 면 `classify` 의 한 줄을 `return` 으로 바꿈(Task 5 메모) |
| A10 | U18 화면 범위 CSS 로 공용 프레임 제목을 숨기는 것 자체 | 진행 | 거부하면 CSS 한 줄 지움 |

---

## Global Constraints

- 작업은 dev(`07c68195e` 이후)에서 딴 worktree branch. lane branch `erd-ux1-fe1`·`erd-ux1-fe2`, 마감 `erd-ux1-close`. git 은 `/usr/bin/git`. 복합 셸 명령이 거절되면 나눠 부른다.
- 프런트 명령(`src/frontend` 에서):
  ```bash
  pnpm --filter "@dk-oasis/m-mdm^..." build                      # m-mdm 시험은 shared dist 를 쓴다
  pnpm --filter @dk-oasis/m-mdm exec vitest run tests/dma/erdEdit/
  pnpm --filter @dk-oasis/m-mdm lint                              # tsc --noEmit (tests 폴더는 안 봄)
  ```
  m-mdm vitest 는 `tests/**/*.test.ts` 만 모은다. 렌더 시험도 `.test.ts` + `createElement`.
- 바꾼 화면 파일마다 커밋 전 `node .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.mjs audit <파일>` 와 `node .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.mjs audit <파일>` = 0건(오탐이면 보고에 이유).
- 화면 모듈은 Mantine·AG Grid 직접 import 금지(shared 래퍼만). 로컬 `.css` import 금지(Local-Rules §17, TS 문자열 + `<style href precedence>`). 색은 `--color-*`·`--spacing-*`·`--font-size-*` 토큰만(§8). React Flow §19·§33. 그리드 §20·§30. 늦은 응답 버리기 §37. 길이 바뀌는 상태 글을 단추 줄에 두지 않는다(§38) — 요약 줄은 고정 칸(`min-width`, `white-space: nowrap`, 넘치면 `…` + `title`).
- 기존 shared 부품 props·동작·모양 변경 금지(승인 사항). 새 shared 부품 등록은 이번 계획에 없다. 필요해지면 Part B §18-3 절차 전부(스킬 문서·색인·`dist` export 시험)를 같은 Task 에서 하고 보고.
- `@/shell` 의 `VersionActionBar`·`MdmPageLayout` 은 안 바꿈(MdmPageLayout 의 기존 `className` prop 만 씀).
- localStorage 는 모든 읽기·쓰기 try/catch. 실패해도 화면은 기본값으로 동작.
- 서버: JDK 21 `export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`. 명령은 `src/backend/mdm` 에서 `../gradlew ... --max-workers=2`. Gradle 전 `unset BACKEND_CLIENT_KEY`(또는 `env -u BACKEND_CLIENT_KEY`) — 남아 있으면 HTTP 시험이 401(deferred 79). Oracle 시험은 `DFLOW_HEAVY_WAIT=1800 node ../../../.claude/skills/dflow-dev/scripts/heavy.mjs ../gradlew :api:test --max-workers=2 -Pdmes.ora.test=clone --tests <클래스>`. 도커·SQLite 금지. 새 Flyway V 파일 없음. 머지된 V 파일 안 고침. Bash timeout 600000ms.
- `hint` 글자를 바꾸지 않는다(MCP·Java 시험). `ErdRejection`·`ErdDelta` 칸 추가는 JSON 에서 additive. `node --test scripts/erd/tests/` 를 서버 Task 에서 함께 돈다.
- 브라우저 확인은 ego-browser 스킬(사용자 전역 지침). 사용자 프로필 고르지 않음. TaskSpace 는 끝나면 `finish({ keep: [] })`.
- 주석·문서·커밋 제목은 한국어. 커밋 형식 `type(scope): 제목`, 끝에:
  ```
  Co-Authored-By: Claude Opus 5.5 (1M context) <noreply@anthropic.com>
  ```
- push 금지. dev 머지는 조정 세션 허가 뒤(조정 세션이 없으면 사용자에게 묻는다). 머지 전 lane commit 1개로 합침(`node .claude/skills/_shared/node/squash-branch.mjs --onto dev --rebase`), 머지 `--ff-only`. 머지한 worktree 는 `git worktree remove`(`--force` 금지), branch `git branch -d`.
- 시험 시간 예산: 바뀐 범위만, 항목마다 15분 상한. 전체는 마감에서 한 번.

## Review Focus

1. 검토 패널을 접은 채 [변경 기록] 탭을 누른다 → 패널이 펼쳐지고 변경 기록을 한 번 읽는다. 다시 접어도 다음 펼침에서 두 번 읽지 않는다(이미 읽은 `history` 유지). 시험: Task 2 `reviewStripOpensTabAndLoadsOnce`.
2. 표를 고르면 속성 패널이 열려 캔버스 폭이 400px 줄어든다 → 고른 노드가 캔버스 밖이면 배율을 유지한 채 그 노드로 옮긴다. 그리드 입력 칸에 초점이 있는 동안 선택을 풀면 패널이 남는다. 시험: Task 2 `propsPanelAutoHideKeepsFocusAndNode`, 순수 `nodeOutside`.
3. prefs 에 `lastModelId="mcm"` 이 있고 `me` 가 늦게 온다 → `me` 와 목록이 온 뒤 mcm 을 연다. 그 전에 사용자가 mdm 을 누르면 mdm 을 그대로 둔다. 목록에 없는 id 면 열지 않는다. 시험: Task 2 `lastModelOpensOnlyWhenUntouched`.
4. 버전 팝오버에서 [확정] → 팝오버가 닫혀도 확정 창이 열려 있고 확정이 끝까지 간다. 시험: Task 3 `confirmDialogSurvivesPopoverClose`.
5. 두 번째 확정 전에 새 표(감사 컬럼 8개, C_AT 이 DOMAIN 위반)를 더한다 → 확정 검사 `errors` 에 감사 컬럼이 없고 `warnings` 에 있다. 같은 묶음의 일반 컬럼 위반은 `errors`. 시험: Task 5 `auditColumnsNeverBlockConfirm`.
6. `getChangesSince(212) 로 최신 값을 읽고 다시 보내세요` hint 를 가진 CONFLICT → 화면 알림에 이 글이 없고 `userHint` 글이 보인다. MCP 결과 글은 그대로. 시험: Task 5 `userHintNeverLeaksMachineTerms`(Java, 정본 표 전수), Task 4 `noticeShowsUserHintOnly`.
7. 57개 표(부모 1 → 자식 40, 외톨이 16) 자동 배치, 캔버스 비 1.77 → 결과 가로세로 비가 0.88-3.5(캔버스 비의 0.5-2배), 상자 겹침 0, 같은 입력 같은 결과, 묶음 안에서 부모 x < 자식 x. 시험: Task 6 `layoutTables2dKeepsAspectAndOrder`.
8. 배율을 0.6 → 0.4 → 0.2 로 바꾼다 → 노드 부품은 단계가 바뀌는 두 번만 다시 그린다(배율 값마다 다시 그리지 않음). `--erd-zoom` 은 React Flow DOM 요소에 쓰인다. 시험: Task 6 `lodTierRerendersOnlyOnTierChange`.
9. MCM 모양 표 57개(`TB_MCM_SEC_*` 12, `TB_MCM_CODE_*` 3, `TB_MCM_JOB_*` 25, 기타 17)를 나눈다 → 모든 묶음 5-20개(기타 묶음 마지막 조각만 5 미만 허용), 표마다 한 묶음, 같은 입력 같은 결과. 시험: Task 7 `subjectGroupsBoundedAndStable`.

---

## 파일 구조

화면 경로 `S/` = `src/frontend/m-mdm/pages/dma/erdEdit/`, 시험 `T/` = `src/frontend/m-mdm/tests/dma/erdEdit/`, 서버 `E/` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/erdEdit/`, 서버 시험 `LT/` = `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/dma/erdEdit/`.

```
S/types.ts, S/api.ts, S/edit-context.ts, S/labels.ts(새), S/state/violations.ts(새), S/state/prefs.ts(새),
S/state/permissions.ts(shortReason), S/panels/ColumnGrid.tsx(addRequest prop — 한 번만), T/erd-fixtures.ts   (Task 1, FE1)
S/ErdViewer.tsx(레이아웃·상태·최대화·첫 viewport), S/state/viewport.ts(새), S/canvas/erd-styles.ts, S/panels/core-styles.ts,
S/panels/ReviewPanel.tsx(접힘 줄), S/panels/DiagramTree.tsx(레일)                                         (Task 2, FE1)
S/page.tsx, S/panels/TopBar.tsx, S/panels/VersionBar.tsx, S/panels/StartPanel.tsx(새),
S/panels/ModelRegisterModal.tsx(새), scripts/perf/render/screens.mjs(erdEdit 항목), count-renders.mjs      (Task 3, FE1)
S/panels/ReviewPanel.tsx(문구·행 클릭), S/panels/ChangeLog.tsx, S/panels/NoticeBar.tsx, S/edit-context.ts(알림 글),
S/panels/ConfirmDialog.tsx, S/panels/DiagramTree.tsx(범례·수), S/canvas/erd-styles.ts(색)                   (Task 4, FE1)
E/engine/ErdRejection.java, E/engine/ErdUserHints.java(새), E/stream/ErdDelta.java, E/service/ErdCommandLogStore.java,
E/service/ErdCommandService.java(실시간 at), E/service/ErdReloadMarker.java(위치는 grep), E/service/ErdConfirmCheck.java,
E/importing/ErdImportBuilder.java(격자 행 높이), LT/engine/ErdUserHintsTest(새), LT/service/ErdConfirmCheckClassifyTest(새),
LT/importing/ErdImportBuilderTest(격자 시험 고침·더함)                                                     (Task 5, FE2)
S/canvas/erd-layout.ts(2-D), S/canvas/erd-geometry.ts(단계 문턱), S/canvas/ErdTableNode.tsx·ErdRelationEdge.tsx(단계별),
S/canvas/useCanvasEditing.ts(Shift+1/2·자기 참조·--erd-zoom·미니맵), S/canvas/erd-flow.ts(위반 수),
S/canvas/erd-shortcuts.ts, S/canvas/erd-minimap.ts(새), S/canvas/erd-edit-styles.ts                     (Task 6, FE2)
S/canvas/ErdToolbar.tsx, S/canvas/useCanvasEditing.ts(메뉴·안내 줄·관계 시작·나누기), S/canvas/CanvasDialogs.tsx,
S/canvas/erd-commands.ts(tablePrefix), S/canvas/erd-split.ts(새), S/canvas/SplitDialog.tsx(새)            (Task 7, FE2)
S/panels/GridInputBar.tsx, S/panels/ColumnGrid.tsx(addRequest 뒤 문구), S/panels/DbDiffApply.tsx           (Task 8, FE2)
docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md, erdEdit_기능설계서.md, docs/erd-tool/deferred.md,
docs/erd-tool/ux-2026-10-11/README.md(결과 줄), 이 README "1차 구현 결정"                                   (Task 9, 마감)
```

---

## 인터페이스 (정본)

### localStorage 키

| 키 | 주인 | 값 |
|---|---|---|
| `dmes:erdEdit:v1:{userId}` | `S/state/prefs.ts`(새) | `ErdPrefs` JSON(아래) |
| `dmes.erdEdit.showAudit` | `S/audit-columns.ts`(그대로) | `"1"`·`"0"` |
| `dmes:split:v1:{userId}:mdm.dma.erdEdit` | shared ContentBody | `{ review: SizeSpec }` |
| `dmes:split:v1:{userId}:mdm.dma.erdEdit.main` | shared ContentBody | `{ side, props: SizeSpec }` |
| `dmes:floating-panel:mdm.dma.erdEdit.props` | shared FloatingPanel | 최대화 때 속성 카드 위치·크기 |
| `dmes.erdEdit.showMiniMap` | `S/canvas/erd-minimap.ts`(새, FE2) | `"1"`·`"0"`, 없으면 표 30개 이상일 때 켬(U51) |

### `S/state/prefs.ts`

```ts
import type { ErdMode, ErdPreset } from "../canvas/erd-flow";
import type { ReviewTab } from "../panels/ReviewPanel";

export interface ErdViewport { x: number; y: number; zoom: number }
export interface ErdPrefs {
  lastModelId: string | null;
  /** modelId → 마지막 다이어그램 id. */
  lastDiagram: Record<string, string>;
  mode: ErdMode;            // 기본 "logical"
  preset: ErdPreset;        // 기본 "basic"
  reviewOpen: boolean;      // 기본 false
  reviewTab: ReviewTab;     // 기본 "inferred"
  sideOpen: boolean;        // 기본 true
  propsOpen: boolean;       // 기본 true(사용자 접기 표시. 고른 표가 없으면 이 값과 무관하게 숨김)
  /** `${modelId}/${diagramId}` → viewport. 최대 30개, 넘치면 오래 쓴 것부터 뺀다(넣은 순서). */
  viewports: Record<string, ErdViewport>;
  /** 저절로 연 읽기 전용 안내 `${modelId}:${reasonKind}`. 최대 20개. */
  seenReadOnly: string[];
}
export const PREFS_MAX_VIEWPORTS = 30;
export const PREFS_SAVE_DELAY_MS = 300;
export const prefsKey = (userId: string): string => `dmes:erdEdit:v1:${userId}`;
export const DEFAULT_PREFS: ErdPrefs;
/** 모양 검사 후 칸별로 기본값을 채운다. 깨진 JSON·모르는 값·저장소 막힘 → DEFAULT_PREFS. */
export function loadPrefs(userId: string | null, storage?: Pick<Storage, "getItem"> | null): ErdPrefs;
export function savePrefs(userId: string | null, p: ErdPrefs, storage?: Pick<Storage, "setItem"> | null): void;
export function withViewport(p: ErdPrefs, modelId: string, diagramId: string, vp: ErdViewport): ErdPrefs;
export function withSeen(p: ErdPrefs, key: string): ErdPrefs;
/** userId 가 null 이면 기본값을 주고 저장하지 않는다. userId 가 처음 정해질 때 한 번 읽고 loaded=true. */
export function useErdPrefs(userId: string | null): { prefs: ErdPrefs; loaded: boolean; update(fn: (p: ErdPrefs) => ErdPrefs): void };
```

### `S/state/violations.ts`

```ts
export const BLOCKING_STATUSES: ReadonlySet<ErdColumnStatus> = new Set(["TYPE", "DOMAIN", "MISS"]);
/** U25: TYPE·DOMAIN·MISS 이고, 감사 컬럼이면 showAudit 일 때만 센다. */
export function isCountedViolation(model: ErdModelJson, columnId: string, statuses: Record<string, ErdColumnStatus>, showAudit: boolean): boolean;
export function countTableViolations(model: ErdModelJson, tableId: string, statuses: Record<string, ErdColumnStatus>, showAudit: boolean): number;
export interface ModelSummary { tables: number; relations: number; inferred: number; violations: number | null }
/** relations = REJECTED 뺀 관계 수, inferred = INFERRED 수, violations = statuses 가 null 이면 null. */
export function modelSummary(model: ErdModelJson, statuses: Record<string, ErdColumnStatus> | null, showAudit: boolean): ModelSummary;
export function summaryText(s: ModelSummary): string; // "표 57 · 관계 113(추정 113) · 고칠 위반 737", 위반 null 이면 "… "
```

### `S/labels.ts`

```ts
export const ISSUE_LABEL: Readonly<Record<string, string>>;   // U30
export const EVIDENCE_LABEL: Readonly<Record<string, string>>;
export const SOURCE_LABEL: Readonly<Record<ErdSource, string>>;
export const KIND_LABEL: Readonly<Record<string, string>>;      // table 표, column 컬럼, key 키, relation 관계, diagram 다이어그램, diagramNode 표 자리
export function issueLabel(code: string): string;              // 모르면 code
/** "SQL 조인 V1__baseline.sql:1108" — 경로는 마지막 조각(파일:줄)만. 원문은 title 로. */
export function evidenceText(e: { kind: string; ref: string }): string;
/** at(yyyy-MM-ddTHH:mm:ss) → 오늘이면 "HH:mm", 아니면 "MM-dd HH:mm". null·깨짐 → "". */
export function timeText(at: string | null | undefined, now?: Date): string;
```

### `S/state/permissions.ts` 더함

```ts
/** 긴 이유 → 짧은 이유(툴팁·입력 칸용). 모르는 글은 그대로. */
export function shortReason(reason: string | null): string;
// NO_RIGHT_TEXT → "권한 없음", RELEASED_TEXT → "확정된 버전", notEditorText(*) → "공동 편집자 아님",
// NO_OWNER_DIAGRAM_TEXT → "소유자 없음", LOST_TEXT → "연결 끊김", 그 밖 → 원문
export type ReadOnlyKind = "noRight" | "released" | "notEditor" | "noOwner";
export function readOnlyKind(r: EditRights): ReadOnlyKind | null;   // readOnlyBanner 와 같은 판정, 칩·seenReadOnly 키에 씀
```
RELEASED_TEXT 의 "[새 버전]" → "[버전 ▾] 의 [새 버전]". `readOnlyBanner` 는 그대로 남긴다(칩 팝오버 본문).

### `S/edit-context.ts` 바뀜

```ts
export interface ErdNav {
  selectTable(tableId: string): void;
  selectColumn(columnId: string): void;
  openTableFind(): void;
  openColumnJump(): void;
  /** 그 표를 고르고 속성 패널을 연 뒤 컬럼 입력 칸에 초점을 준다. pk 면 PK 모드. 권한은 부른 쪽이 본다. */
  startColumnAdd(tableId: string, pk: boolean): void;
  /** 그 다이어그램을 연다(왼쪽 목록 누르기와 같다). 모르는 id 면 아무것도 안 함. 주제별 나누기 뒤 FE2 가 부른다(U53). */
  selectDiagram(diagramId: string): void;
}
// noticeFromRejection: hint = r.userHint ?? null (r.hint 는 안 씀). CONFLICT·NOT_FOUND 글에서 "rev N 에서" 뺌(U32).
```

### `ColumnGrid` prop 더함(FE1 Task 1 이 한 번 고침, 그 뒤 FE2 소유)

```ts
export interface ColumnGridProps {
  ctx: ErdEditContext;
  tableId: string | null;
  /** seq 가 바뀌고 tableId 가 같으면 입력 칸 trigger(pk ? "addPk" : "add"). */
  addRequest?: { seq: number; tableId: string; pk: boolean } | null;
}
```

### `types.ts` 더함(서버 정본과 같은 모양, 옛 서버는 칸이 없다 → 읽을 때 `?? null`)

```ts
export interface ErdDelta { /* 기존 칸 */ at?: string | null }
export interface ErdRejection { /* 기존 칸 */ userHint?: string | null }
```

### 서버 API(additive)

| 칸 | 위치 | 모양 |
|---|---|---|
| `userHint` | `save`·`restore`·`import` 결과의 `rejection`, `DbDiffApply` 결과 | 문자열 또는 null. `ErdRejection` 의 `@JsonProperty(value = "userHint", access = READ_ONLY)` 메서드 |
| `at` | `view sinceRev` 의 `deltas[]`, SSE `change` | `"2026-10-11T14:03:22"` 또는 null |
| 확정 검사 | `validate`·`confirm` | 감사 컬럼 `ERD_STD_*` 는 늘 `warnings`(U29). 응답 모양 그대로 |

`userHint` 변환 정본(`E/engine/ErdUserHints.java`). 입력 `hint` 에 아래 왼쪽 글이 들어 있으면 오른쪽. 먼저 맞는 행이 이긴다. 기계 용어가 있는데 맞는 행이 없으면 null.

| hint 에 든 글 | userHint |
|---|---|
| `getChangesSince(` 와 `다시 보내세요`(CONFLICT) | `화면이 최신 값으로 바뀌었습니다. 확인한 뒤 다시 고치세요.` |
| `getChangesSince 로 확인한 뒤 직접 고치세요` | `그 뒤에 바뀐 값이 있어 되돌릴 수 없습니다. 변경 기록에서 다른 변경을 고르거나 직접 고치세요.` |
| `getChangesSince 로 최신 모델을 읽으세요` | `다른 사람이 지운 요소입니다. 화면이 최신 상태로 바뀌었는지 확인하세요.` |
| `getChangesSince 가 준 값을 그대로` / `restore 값은` | null |
| `getModelText 로` | `화면을 새로 고친 뒤 다시 하세요.` |
| `getChangesSince 가 준 rev`·`getChangesSince 로 받은 rev`·`view 가 준 rev` | `화면을 새로 고친 뒤 다시 하세요.` |
| `지금 DRAFT 에서 한 변경만 되돌리세요` | `지금 DRAFT 에서 한 변경만 되돌릴 수 있습니다.` |
| `reload 를 주면 모델을 다시 읽고` | `화면을 새로 고친 뒤 다시 하세요.` |
| `compare kind=DB_DIFF` | `[DB 다시 가져오기] 탭에서 [새로 읽기] 한 뒤 다시 고르세요.` |
| `import kind=FROM_DB` | `[DB 에서 가져오기] 로 먼저 가져오세요.` |
| `execute kind=ADD_EDITOR` | `소유자(<ownerId>)에게 공동 편집자 등록을 요청하세요.`(ownerId 가 null 이면 `소유자에게 …`) |
| `copy 로 새 버전` | `[버전 ▾] 에서 [새 버전] 을 만드세요.` |
| `setPrimaryKey 로` | `PK 는 [PK 추가] 로 바꾸세요.` |
| `confirmRelation 또는 updateRelation` | `이미 있는 관계입니다. 추정 관계면 [맞음] 으로 확정하세요.` |
| `op 를 넣으세요`·`명령 JSON`·`{"op"`·`되돌리기는 undo`·`필드 이름·값 형식` | null(화면이 만들지 않는 요청 형식 오류) |

기계 용어 판정 정규식(정본): `getChangesSince|getModelText|baseRev|\bview\b|kind=|restore|undo\(|\bop\b|JSON|setPrimaryKey|confirmRelation|updateRelation|copy 로`.

### 큰 모델 읽기(FE2, Task 6·7)

```ts
// S/canvas/erd-geometry.ts 더함
export const ZOOM_NAMES_ONLY = 0.5;          // 그대로
export const ZOOM_OVERVIEW = 0.35;           // 이 미만 = overview 단계(U50). ErdViewer FIRST_FIT_MIN_ZOOM 과 같은 값
export type LodTier = "detail" | "names" | "overview";
export function lodTier(zoom: number): LodTier;
export const OVERVIEW_FONT_PX = 12;          // 화면 기준 글자 크기
export const OVERVIEW_FONT_MAX_FLOW = 60;    // 흐름 단위 상한(배율 0.2 미만이면 화면 글자가 작아진다)

// S/canvas/erd-layout.ts 바뀜
export function layoutTables(model, tables, size, origin?, aspect?: number /* 기본 1.6 */): Record<string, FlowPos>;
export function autoLayoutCommand(state, diagramId, measured, showAudit?, aspect?: number): ErdCommandJson | null;
export function components(ids: readonly string[], edges: readonly LayoutEdge[]): string[][];
export function wrapRanks(pos: Record<string, FlowPos>, size: (id: string) => Size, maxHeight: number, gap: number, rankGap: number): Record<string, FlowPos>;
export function packShelves(boxes: readonly { id: string; w: number; h: number }[], rowWidth: number, gap: number): Record<string, FlowPos>;

// S/canvas/erd-split.ts(새)
export interface SubjectGroup { key: string; name: string; tables: string[] }
export function subjectGroups(model: ErdModelJson, tables: readonly string[], opt?: { min?: number; max?: number }): SubjectGroup[];
/** 묶음마다 wizardCommands 모양(addDiagram + placeTables). 한 배열이 MAX_BATCH(200)를 넘지 않게 나눠 돌려준다. */
export function splitCommands(state: ErdState, groups: readonly SubjectGroup[], areaName: string, newId: () => string, showAudit: boolean, aspect: number): ErdCommandJson[][];

// S/canvas/erd-minimap.ts(새)
export const SHOW_MINIMAP_KEY = "dmes.erdEdit.showMiniMap";
export function loadShowMiniMap(tableCount: number): boolean;   // 저장값 없으면 tableCount >= 30
export function saveShowMiniMap(show: boolean): void;
export function miniMapNodeColor(n: ErdFlowNode): string;        // CSS 변수 문자열
```
`tablePrefix(model): string` 는 `S/canvas/erd-commands.ts` 에 둔다(U40·U52 공용). 물리명이 `TB_<X>_` 로 시작하는 표가 절반을 넘으면 가장 흔한 `TB_<X>_`, 아니면 `""`.

### 화면 틀(ErdViewer JSX 뼈대, Task 2)

```tsx
<div className="erd-app" data-testid="erd-viewer" data-maximized={maximized ? "" : undefined}>
  <div className="erd-area-bar">{TopBar}{lost 띠}{NoticeBar}</div>
  <ContentBody direction="column" resizable storageKey="mdm.dma.erdEdit">
    <ContentBody key="main" direction="row" resizable storageKey="mdm.dma.erdEdit.main" flex="1 1 0" minSize={240}>
      {!maximized && (prefs.sideOpen
        ? <ContentPanel key="side" width={220} minSize={160}><div className="erd-area-side">…</div></ContentPanel>
        : <div className="erd-area-side erd-rail" data-testid="erd-side-rail">…</div>)}
      <ContentPanel key="canvas" flex="1 1 0" minSize={320}><div className="erd-area-center">…</div></ContentPanel>
      {!maximized && focusTable && (prefs.propsOpen || propsFocused
        ? <ContentPanel key="props" width={400} minSize={320}><div className="erd-area-grid" onFocusCapture onBlurCapture>…</div></ContentPanel>
        : <div className="erd-area-grid erd-rail" data-testid="erd-props-rail">…</div>)}
    </ContentBody>
    {!maximized && prefs.reviewOpen && <ContentPanel key="review" height={260} minSize={120}><div className="erd-area-review">…</div></ContentPanel>}
  </ContentBody>
  {!maximized && !prefs.reviewOpen && <div className="erd-area-review erd-review-strip" data-testid="erd-review-strip">…</div>}
  {maximized && focusTable && <FloatingPanel title=… open storageKey="mdm.dma.erdEdit.props" testId="erd-props-float">…ColumnGrid…</FloatingPanel>}
  {ctx && <ColumnJump …/>}
</div>
```
레일(`.erd-rail`)은 레이아웃 자식이 아니라 막대가 없다. 캔버스 ContentPanel 은 늘 `key="canvas"` 라 다른 패널이 빠져도 React Flow 가 다시 마운트되지 않는다. `ColumnJump` 는 `erd-area-grid` 밖(최대화·패널 숨김 때도 Alt+O 동작).

### testid 호환표

| testid | 1차 뒤 | 바뀌는 시험 |
|---|---|---|
| `erd-message` | 숨은 live region, 마지막 `notify` 글(U20) | 없음 |
| `erd-rev` | 없앰. `erd-ver-trigger` 의 `data-rev` 와 팝오버 안 `erd-ver-rev`("번호 3") | page-render: `byTestId("erd-ver-trigger")?.dataset.rev` |
| `erd-ver` | 없앰. `erd-ver-trigger` 글 "버전 1.000 · 작성 중 ▾" | 있으면 바꿈 |
| `erd-version-bar` | `erd-ver-pop`(팝오버 본문, 열렸을 때만) | 버전 단추 시험은 `erd-ver-trigger` 먼저 누름(도우미 `openVersion()`) |
| `erd-ver-major·minor·delete·confirm·lock·unlock·handover(-wrap)`, `erd-editors-open` | 팝오버 안 그대로 | 위와 같음 |
| `erd-banner-readonly` | 없앰. `erd-readonly-chip`(글 "읽기 전용", `title` = 짧은 이유) + `erd-readonly-pop`(긴 글) | page-render 2곳: 칩 `title` 이나 팝오버 글로 |
| `erd-banner-lost` | 그대로 | 없음 |
| `erd-model-{id}`, `erd-reg-open` | 그대로. 등록 칸은 `erd-reg-modal` 안 `erd-reg-{key}`·`erd-reg-submit` | 등록 시험 있으면 바꿈 |
| `erd-import` | 위 막대 그대로 + 빈 상태 `erd-start-import` | 없음 |
| `erd-mode-*`, `erd-preset-*` | 그대로(Button 묶음 유지) | 없음 |
| `erd-tab-{violations,inferred,diff,history}` | 접힘 줄·펼친 패널 모두 같은 id | 접힘 줄 클릭 = 펼침 |
| `erd-review` | 펼쳤을 때만. 접힘 = `erd-review-strip` | 탭 누른 뒤 보는 시험은 그대로 |
| `erd-canvas-empty` | `erd-start` 안으로(빈 상태) | 글 비교 있으면 바꿈 |
| `erd-columns-empty` | 없앰(패널 자동 숨김) | 있으면 바꿈 |
| `erd-confirm-{relId}`·`erd-reject-{relId}` | 그대로, 글 [맞음]·[아님] | 글 비교 있으면 바꿈 |
| 새 | `erd-summary`, `erd-ver-trigger`, `erd-ver-pop`, `erd-ver-rev`, `erd-readonly-chip`, `erd-readonly-pop`, `erd-legend`(왼쪽), `erd-legend-open`(위), `erd-side-toggle`, `erd-props-toggle`, `erd-review-toggle`, `erd-review-strip`, `erd-side-rail`, `erd-props-rail`, `erd-maximize`, `erd-zoom-in`, `erd-zoom-out`, `erd-props-float`, `erd-start`, `erd-start-model-{id}`, `erd-start-reg`, `erd-start-import`, `erd-reg-modal` | FE1 |
| 새 | `erd-tool-hint`, `erd-tool-addcol`, `erd-tool-addpk`, `erd-tool-relmenu`, `erd-tool-minimap`, `erd-tool-split`, `erd-minimap`, `erd-split-dialog`, `erd-split-group-{key}`, `erd-split-ok`, `erd-newtable-preview`, `erd-grid-phys-warn`, 메뉴 항목 id `addcol`·`addpk`·`rel-start`·`rel-start-n`·`rel-start-i`·`split` | FE2 |
| 속성 | `.react-flow` 요소의 `data-lod="detail|names|overview"` 와 `--erd-zoom`(U50) | FE2 |

`historyRows` 행 모양(정본, `panel-rows.test.ts` 의 `toEqual` 을 이 모양으로 고침):
```ts
{ id: string; rev: number; at: string /* timeText */; who: string /* "나" | userId */; whoTitle: string /* `${session} · ${SOURCE_LABEL}` */;
  source: string /* SOURCE_LABEL */; summary: string }
```

### shared 부품(새로 쓰는 것, 모두 기존 export)

`@dk-oasis/shared/layout`(`ContentBody`·`ContentPanel`), `@dk-oasis/shared/detail-popover`(`DetailPopover`: `opened`·`onOpenChange`·`content`·`children` 트리거·`width`·`testId`), `@dk-oasis/shared/floating-panel`(`FloatingPanel`: `title`·`open`·`onClose`·`storageKey`·`testId`), `@dk-oasis/shared/message-provider`(`useMessage().showMessage({ toast: true })`), `@dk-oasis/shared/react-flow`(`ContextMenu`·`ControlButton`·`getViewportForBounds`), `@dk-oasis/shared/modal`(`Modal`). 각 props 는 소스가 정본 — 쓰기 전 `node .claude/skills/mantine-aggrid-ui/scripts/ui_docs.mjs get <이름>` 으로 확인.

---

## Task 문서

| Task | 파일 | 내용 | 레인 | 선행 |
|---|---|---|---|---|
| 1 | [01-fe1-frame.md](01-fe1-frame.md) | 뼈대: 타입 칸, `labels.ts`, `violations.ts`, `prefs.ts`, `shortReason`·`readOnlyKind`, `ErdNav.startColumnAdd`·`selectDiagram`, ColumnGrid `addRequest`, 시험 도구 | FE1 | 없음(먼저 머지) |
| 2 | [01-fe1-frame.md](01-fe1-frame.md) | 화면 틀: ContentBody 분할, 접기 레일, 검토 접힘 줄, 속성 자동 숨김, 최대화(Alt+M·FloatingPanel), prefs 연결(마지막 모델·다이어그램·모드·프리셋·패널·viewport), 첫 viewport(U22)·첫 다이어그램(U53) | FE1 | Task 1 |
| 3 | [01-fe1-frame.md](01-fe1-frame.md) | 위 막대 한 줄: 요약 줄, 버전 ▾, 읽기 전용 칩, toast, 등록 창, 빈 상태 시작 단추, 제목 숨김, 비활성 확정 CSS, Zoom 한국어, 렌더 하네스 | FE1 | Task 2 |
| 4 | [01-fe1-frame.md](01-fe1-frame.md) | 문구: 검토 패널(위반 → 컬럼, 근거·맞음/아님, 비활성 이유), 변경 기록, 알림(userHint), 확정 창 한국어, 범례·수, 색 줄이기 | FE1 | Task 3 |
| 5 | [02-fe2-canvas-server.md](02-fe2-canvas-server.md) | 서버: 감사 컬럼 확정 규칙 + 시험, `userHint`, `ErdDelta.at`, 가져오기 격자 행 높이 | FE2 | 없음 |
| 6 | [02-fe2-canvas-server.md](02-fe2-canvas-server.md) | 큰 모델 읽기 ①: 2-D 배치(캔버스 비), 단계별 그리기(overview), 미니맵, Shift+1/2, 자기 참조 알림, 노드 위반 수 | FE2 | Step 1-6 없음, Step 7 = [FE1:Task 1 머지] |
| 7 | [02-fe2-canvas-server.md](02-fe2-canvas-server.md) | 큰 모델 읽기 ②(주제별 나누기) + 도구 막대 글자 단추·관계 ▾·컬럼/PK 추가, 표 메뉴, 관계 안내 줄·관계 시작, 새 표 창 논리명 먼저, 짧은 이유 툴팁 | FE2 | [FE1:Task 1 머지] |
| 8 | [02-fe2-canvas-server.md](02-fe2-canvas-server.md) | 입력 칸 [물리명도] 끔·경고, 짧은 이유, DB 다시 가져오기 이름·userHint·비활성 이유 | FE2 | [FE1:Task 1 머지] |
| 9 | [03-close.md](03-close.md) | 마감: 전체 시험, 복제 PDB, 항목별 브라우저 확인(1440·1920), 면적 재기, 직관성 5과제, 렌더 하네스, 도움말·기능설계서·deferred·결정 기록 | 마감 | 모든 레인 머지 |

## 의존 관계와 레인

| 레인 | 모델 | Task | 고치는 파일(소유) | 선행 |
|---|---|---|---|---|
| FE1 화면 틀·위 막대·문구 | opus | 1 → 2 → 3 → 4 | `S/ErdViewer.tsx`, `S/page.tsx`, `S/types.ts`, `S/api.ts`, `S/edit-context.ts`, `S/labels.ts`(새), `S/state/prefs.ts`(새), `S/state/violations.ts`(새), `S/state/viewport.ts`(새), `S/state/permissions.ts`, `S/panels/{TopBar,VersionBar,NoticeBar,ReviewPanel,ChangeLog,ConfirmDialog,DiagramTree,core-styles}`, `S/panels/{StartPanel,ModelRegisterModal}.tsx`(새), `S/canvas/erd-styles.ts`, `scripts/perf/render/{screens,count-renders}.mjs`, 시험 `T/{erd-fixtures,page-render,panel-rows,core-panels,version-bar,edit-core}.test.ts`·새 `T/erd-prefs.test.ts`·`T/erd-labels.test.ts`·`T/erd-layout-frame.test.ts`. 한 번 고침(Task 1): `S/panels/ColumnGrid.tsx`(prop + 효과 하나) | 없음 |
| FE2 캔버스·입력·서버 | opus | 5, 6 → 7 → 8 | `E/engine/{ErdRejection,ErdUserHints(새)}.java`, `E/stream/ErdDelta.java`, `E/service/{ErdCommandLogStore,ErdCommandService,ErdConfirmCheck}.java`, `ErdDelta` 생성 지점이 있는 그 밖의 서버 파일(`ErdReloadMarker` 등, grep), `E/importing/ErdImportBuilder.java`, lib 시험(새 2개 + 고칠 것), `S/canvas/**`(`erd-styles.ts` 제외), `S/panels/{ColumnGrid,GridInputBar,DbDiffApply,TokenChoiceModal}.tsx`, 시험 `T/{erd-canvas*,erd-flow,grid-edit,column-grid,db-diff-apply,audit-columns}.test.ts`·`T/{erd-canvas-fixtures,grid-fixtures}.ts` | Task 5 없음. Task 6 Step 5·7·8 = [FE1:Task 1 → FE2] |
| 마감 | opus | 9 | 문서, `tmp/erd-ux1-close/`(커밋 안 함) | 모든 레인 |

```
FE1 : Task 1 ─(dev 머지)─ Task 2 ─ Task 3 ─ Task 4
FE2 : Task 5 ── Task 6(Step 1-6) ──┬─ Task 6 Step 7 ─ Task 7 ─ Task 8
                     FE1 Task 1 머지 ┘
마감 : Task 9 (모든 레인 머지 뒤)
```

- 머지 순서: FE1 Task 1 을 먼저 dev 에 머지(조정 허가). FE2 Task 5 는 언제든. FE2 는 FE1 Task 1 머지 뒤 rebase 하고 Task 6 Step 7 로 간다.
- FE2 는 `ErdViewer.tsx`·`types.ts`·`api.ts`·`edit-context.ts`·`state/*`·`erd-styles.ts`·`panels/{TopBar,ReviewPanel,ChangeLog,ConfirmDialog,DiagramTree,NoticeBar,VersionBar}` 를 고치지 않는다. 빠진 것이 있으면 레인 보고 → 조정자 → FE1.
- FE1 은 Task 1 뒤 `ColumnGrid.tsx`·`canvas/*`(erd-styles.ts 제외)·`GridInputBar`·`DbDiffApply` 를 고치지 않는다.
- 화면에서 서버 새 칸(`userHint`·`at`)은 가짜 응답으로 시험. 실제 연결은 마감(Task 9). 의존 [FE2:Task 5 → 마감:Task 9].
- Oracle 시험은 PC 단위 잠금(heavy). 이번 계획의 서버 시험은 lib 단위(Oracle 안 씀). Oracle 회귀(`ErdVersionServiceTest`)는 마감에서 한 번.
- 띄운 pane·레인·이름 붙인 에이전트는 끝나면 바로 닫는다.

## 레인 분해 안내

| 레인 | 항목 | 범위 | 통과 확인 | 비고 |
|---|---|---|---|---|
| FE1 | t1 | Task 1 전부 | Task 1 Step 9 | 끝나면 dev 머지 먼저 |
| FE1 | t2a | Task 2 Step 1-6(분할·레일·접힘 줄·자동 숨김) | Step 6 | 커밋 |
| FE1 | t2b | Task 2 Step 7-11(prefs 연결·첫 viewport·최대화) | Step 11 | |
| FE1 | t3 | Task 3 전부 | Step 12 | |
| FE1 | t4 | Task 4 전부 | Step 11 | |
| FE2 | t5 | Task 5 전부 | Step 10 | 서버만, 언제든 머지 가능 |
| FE2 | t6a | Task 6 Step 1-3(2-D 배치) | Step 3 | 커밋 |
| FE2 | t6b | Task 6 Step 4-6(단계별 그리기·미니맵·Shift+1/2·자기 참조) | Step 6 | 커밋 |
| FE2 | t6c | Task 6 Step 7-8(노드 위반 수) | Step 8 | FE1 t1 머지 뒤 |
| FE2 | t7a | Task 7 Step 1-4(주제별 나누기) | Step 4 | 커밋 |
| FE2 | t7b | Task 7 Step 5-10(도구 막대·메뉴·안내 줄·새 표 창) | Step 10 | |
| FE2 | t8 | Task 8 전부 | Step 6 | |
| 마감 | t9 | Task 9 | — | 모든 레인 머지 뒤 |

---

## 도움말 반영 표(마감 Task 9 시작점)

`docs/mdm/screens/erdEdit/erdEdit_사용자도움말.md` 절 → 바꿀 것. 레인 보고의 "도움말 반영 메모" 로 덧붙인다.

| 절(줄) | 바꿀 것 |
|---|---|
| §2.2 화면 열기(47) | 마지막 모델·모드·프리셋·패널·배율을 기억해 다시 연다. 처음이면 시작 화면(모델 카드·[새 모델 등록]) |
| §2.3 5분 둘러보기(55) | 첫 화면 배율 1, 요약 줄 읽는 법, 검토 패널은 접혀 있고 탭을 누르면 열림 |
| §2.4 편집하려면(69) | 노란 띠 → [읽기 전용] 칩, 누르면 이유·할 일 |
| §3 화면 구성 표(84-90) | 위 막대 한 줄, [버전 ▾], 패널 접기·크기 조절(끌기·더블클릭 기본값·화살표 키), 캔버스 최대화(Alt+M), [범례] |
| §3.1(92) | 범례 색 견본, 물리 모드 바탕색 바뀜, PK·이름표 색 |
| §4.1 추정 관계(122) | [맞음]/[아님], 근거 한국어(설계 문서·SQL 조인·이름 규칙) |
| §4.2 표와 컬럼(141, 146, 164, 167) | 새 표 = 논리명 먼저 + 물리명 미리보기, 도구 막대 [컬럼 추가]·[PK 추가], 표 오른쪽 클릭 메뉴, [물리명도] 기본 끔·켜면 경고 |
| §4.3 관계 만들기(177) | 안내 줄, [관계 ▾], 메뉴 [관계 시작], 자기 참조 알림 |
| §4.4 배치(193) | 자동 배치가 화면 비율에 맞춰 여러 줄로 놓음. [주제별로 나누기](표 이름 앞 토막별 5-20개 다이어그램), 다음에 열면 작은 다이어그램부터 |
| §3.1·§3.2(92·107) 더함 | 배율에 따른 그리기 3단계(자세히·이름만·개요), 개요에서는 표 이름이 크게 보이고 선 끝 모양이 빠짐. [미니맵] 토글 |
| §4.5 표준 상태(222, 230) | 위반 행 → 그 컬럼이 골라짐, "고칠 위반" 수 규칙 하나(감사 컬럼은 보기 켰을 때만) |
| §4.6(237) | 이름 "DB 다시 가져오기", 단추 [고른 항목 가져오기] |
| §4.7 되돌리기(260) | 변경 기록 칸(시각·번호·사람·출처·내용) |
| §4.8 확정(276-288) | 확정 창 한국어 묶음, 감사 컬럼 위반은 경고로만(막지 않음) |
| §4.9(293) | 버전 단추는 [버전 ▾] 안 |
| §4.10(307) | 모델 등록 창(라벨 있는 칸 4개) |
| §4.11 감사 컬럼(319, 339) | 확정을 막지 않음(U29) |
| §5 단축키(343-373) | Shift+1(전체 맞춤)·Shift+2(고른 표 맞춤) 동작, Alt+M 최대화 추가, 373줄 "동작하지 않습니다" 에서 Shift+1·2 뺌 |
| §6 표준 상태(376) | 위반 수 규칙(U25) |
| 문제 해결(약 618-634) | 비활성 단추 = 마우스를 올리면 짧은 이유, 긴 안내는 [읽기 전용] 칩 |
| 용어집(약 656-672) | 한 단어 한 뜻(맞음/아님, 확정 = 버전만, DB 다시 가져오기), rev → 번호 |

기능설계서 `erdEdit_기능설계서.md` 에는 "## 7. UX 정비 1차" 절을 더한다(U10-U47 요약, 서버 칸 `userHint`·`at`, 확정 검사 감사 컬럼 규칙).

---

## 1차 구현 결정

(마감 Task 9 가 채운다. 단계 2 README "단계 2 구현 결정" 과 같은 표.)

---

## 계획 작성자 메모

- 조정자 지시는 "bottom review panel collapsed by default to a tab strip with counts + resizable splitter" 였다. 조사로 shared `ContentBody resizable` 가 이미 있고 Part B §4-3 이 분할 영역에 그것을 요구함을 찾았다. 그래서 새 shared 분할 부품을 만들지 않았다(U10). 크기 저장도 ContentBody 가 사용자별로 한다.
- "drop duplicate page title if it is screen-owned": 제목은 shared `PageLayout` 이 그리고 숨김 prop 이 없다. 화면이 소유하지 않는다. 판정: 화면 범위 CSS(U18) + 승인 표 A1·A10.
- "disabled 확정 not painted as active": 원인은 `VersionActionBar` 가 `variant="primary"` 를 늘 주고 shared Button 의 비활성 primary 가 채운 파랑이라는 것(추정, 마감에서 계산 스타일로 확인). 두 부품 모두 다른 화면이 써서 ERD 범위 CSS 로 갔다(U17).
- "version actions in a 버전 ▾ menu" 는 Local-Rules §24 와 부딪친다. 조정자 지시를 따르고 §24 개정 문장을 승인 표 A3 에 적었다.
- 감사 컬럼 확정 규칙은 두 읽기가 있다: (a) 경고에 남기고 막지 않음, (b) 검사에서 아예 뺌. (a) 로 정했다(U29). 사용자 문장 "경고만 하고" 와 조정자 문장 "violations stay warnings" 가 (a) 다. 바꾸기 쉽게 Task 5 에서 판정을 순수 함수 `classify` 로 뺀다.
- `userHint` 는 서버 한 곳 변환(U27)이다. 거절 지점마다 사람 글을 따로 넣는 안은 25곳 넘게 고쳐야 해서 버렸다. 대신 조사로 모은 기계 hint 전부를 정본 표와 시험으로 묶는다. 새 거절 지점이 기계 용어 hint 를 더하면 `userHint` 는 null(화면에 안내 없음)로 안전하게 떨어진다.
- 사람 이름(사용자 ID → 이름)은 mdm 에 조회가 없어 U8 로 미뤘다. C 의 "owner shown as raw employee number" 도 남는다.
- 조정자 범위 D 의 "Shift+1/2 either implemented or removed" 는 구현으로 정했다(U38). 손잡이 두 개라 싸다.
- 조정자 범위 B 의 "preselect last model" 은 prefs 의 `lastModelId` 만 쓴다. "모델이 하나뿐이면 자동으로 연다" 는 넣지 않았다 — 기존 렌더 시험(모델 1개 목록)이 [모델] 단추 누르기를 전제로 한다.
- 조정자 추가 의견(사용자, 10-11): "큰 모델 읽기" 4항목. 판정: 2-D 배치·단계별 그리기·미니맵·주제별 나누기 모두 1차(U49-U53). 주제별 나누기는 서버 변경 없이 기존 다이어그램 명령으로 되고 창 하나라 1차 비용 안이다. 묶음 편집·겹쳐 보는 주제 상자·선 묶기는 2차(U54). 모두 캔버스 레인(FE2) 소유이고, 첫 다이어그램·첫 배율 판정만 `ErdViewer` 라 FE1 이다.
- 단계별 그리기는 노드 자리를 바꾸지 않는다(서버 값). 개요 단계는 "원래 크기 상자 + 큰 글자" 다. 상자를 줄이는 개요는 화면 전용 자리 계산이 필요해 2차 후보.
- 2-D 배치는 화면 쓰기([자동 배치])로만 반영된다. 읽기 전용 사용자의 첫 화면은 U22(viewport)로만 좋아진다. 마감에서 소유자로 [자동 배치] 를 눌러 확인한다.
- 레인 2개 구성: 조정자는 2-3 레인을 제안했다. 서버 일이 작고 화면 파일과 겹치지 않아 FE2 에 넣었다(U1). 서버 레인을 따로 두려면 Task 5 를 그대로 떼어 `erd-ux1-be` 로 주면 된다(의존 없음).
- 위 막대 40px 은 모델이 2개일 때 목표다. 모델이 많아지면 모델 단추가 줄을 넘긴다. 그때는 모델 고르기를 shared `Select` 로 바꾸는 안이 있다(deferred 새 행 후보, 하네스 `formPrepare` 도 같이 바꿔야 함).

## 조정자 판정 (2026-10-11)

- 계획 채택. 레인 2개(FE1·FE2) + 마감, 서버 Task 5 는 FE2 첫 일(U1) 그대로.
- A3 [버전 ▾] 팝오버: 진행. Local-Rules §24 문서는 이번에 고치지 않고 개정 문장을 마감 보고 사용자 확인 목록에 올린다.
- A9 감사 컬럼: (a) 경고에 남기고 막지 않음. 사용자 답 설명 "위반이 있어도 경고만 하고 확정을 막지 않습니다" 와 같다.
- A1·A2·A4~A8·A10: 계획의 대안대로. 모두 마감 보고 사용자 확인 목록.
- 2-D 배치는 [자동 배치] 를 눌러야 저장 배치에 반영된다. L_MAIN 예제 모델은 조정자가 쓰지 않으므로, 마감 보고에 "소유자가 [자동 배치] 또는 [주제별로 나누기] 를 한 번 누르면 된다" 를 적는다.
