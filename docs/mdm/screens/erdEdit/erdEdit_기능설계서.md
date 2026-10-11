# erdEdit 기능설계서 — ERD 설계

- 정본: [ERD 도구 설계](../../../superpowers/specs/2026-10-10-erd-tool-design.md). 이 문서는 MDM 화면 규약(screens/README.md §5)에 맞춘 색인이다.
- 그룹 `dma`, screenId·serviceId `erdEdit`, componentPath `dma/erdEdit`.
- 버전 대상 `ERD_MODEL`(모듈 하나 = 객체 하나, 스펙 D2). 확정은 소유자가 직접 한다(ADR-0002).

## 1. 액션

| 액션 | 뜻 | 권한 세트 |
|---|---|---|
| search | 모델 목록 | READ |
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타. `kind=SET_VIEW` 면 내 화면 상태(보는 다이어그램·선택한 표)를 알린다. 읽기 전용 사용자도 부를 수 있다 | READ |
| compare | 논리명·물리명 미리보기(표준 판정) | READ |
| validate | 확정 검사 미리보기 | EDIT |
| reg | 빈 모델 만들기 | EDIT |
| save | 명령 묶음 적용(`apply`) | EDIT |
| restore | 명령 되돌리기 | EDIT |
| execute | 작업 중 표시와 공동 편집자 등록·해제. `kind` 값은 ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE | EDIT |
| copy | 새 버전(DRAFT) | EDIT |
| delete | DRAFT 삭제 | EDIT |
| lock / unlock / handover | DRAFT 선점·해제·넘기기 | EDIT |
| confirm | 확정 | CONFIRM |
| import | DB 가져오기(`kind=FROM_DB`). 단계 1 에서 추가했다(5절) | EDIT |

## 2. 데이터

스펙 3절. 표는 `TB_MDM_ERD_MODEL`, `_MODEL_VER`, `_EDITOR`, `_CMD_LOG`, `_DIAGRAM`, `_DIAGRAM_NODE`, `_CLAIM`.

## 3. 판정과 오류

스펙 4.2~4.5절. 거절 코드 `INVALID`·`CONFLICT`·`NOT_FOUND`·`NOT_EDITOR`·`NEEDS_CHOICE`.

## 4. 실시간 채널

`GET /api/mdm/erd/stream/{modelId}?session=&sinceRev=&source=` (`session` 은 필수, `sinceRev` 기본값은 -1, `source` 기본값은 `UI`. 포털 경유 `/api/mdm/rest/erdEdit/view/api/mdm/erd/stream/{modelId}`). 이벤트 `change`·`presence`·`claim`·`reload`·`ping`.

## 5. 단계 1 — 가져오기·뷰어

- 가져오기: `import`(`kind=FROM_DB`, EDIT). 모델에 표가 있으면 `INVALID`. 딕셔너리 뷰(`ALL_*`)를 OWNER 로 묶어 읽고, DB FK 는 `DB`, 그 밖의 후보는 `INFERRED` 로 넣는다. 추정 근거는 `erd/hints/<module>.json`(`scripts/erd/erd-hints.mjs` 가 만든다)과 칼럼명 규칙이다.
- 읽기 종류: `view` 의 `kind=STATUS`(컬럼별 표준 상태·쓰인 도메인·판정 시간), `kind=SET_VIEW`(화면 선택 상태 공유, READ), `compare` 의 `kind=DB_DIFF`(다시 가져오기 차이, 반영은 단계 2).
- 표준 판정의 타입 비교: 도메인은 논리 타입(STRING·NUMBER·DATE·BOOLEAN)을, 모델 컬럼은 Oracle 물리 타입을 갖는다. 판정·미리보기·확정 검사·엔진 경고는 아래 대응 규칙 하나를 같이 쓴다.
  - 타입·길이·소수 세 값이 그대로 같으면 맞다.
  - STRING 은 VARCHAR2·NVARCHAR2·VARCHAR·CHAR·NCHAR 와 맞다. 길이가 같아야 한다. 도메인에 길이가 없으면 길이를 보지 않는다.
  - NUMBER 는 NUMBER 와 맞다. 정밀도와 소수가 같아야 한다(소수 null 은 0). 정밀도와 소수가 둘 다 없는 도메인은 모든 NUMBER 와 맞다.
  - 소수가 없는 DATE 는 DATE 와 맞고, 소수가 n 인 DATE 는 TIMESTAMP(n) 과 맞다.
  - BOOLEAN 은 길이 1 문자 타입과 맞다(`_YN` 컬럼의 `VARCHAR2(1 CHAR)` 관례).
- 허브 칼럼: 후보는 모두 `INFERRED` 로 저장하고 `candidateRank` 로 순위를 준다. 화면은 1 순위만 그리고 나머지 후보는 접는다. 접힌 후보는 검토 패널에 함께 나온다.
- 화면: 메뉴 `마루 MDM > 용어·도메인 > ERD 설계`(`dma/erdEdit`).
  - 캔버스: 논리·물리 전환(F3), 보기 프리셋, 확대율 50% 미만이면 이름만 그린다. 오른쪽 아래에 확대·축소·화면 맞춤 단추가 있다. 첫 화면 맞춤은 아직 그리지 않은 노드까지 잰다.
  - F3 은 ERD 화면이 먼저 받아 전파를 끊는다. 그래서 포털 메뉴 검색 창이 함께 열리지 않는다.
  - 컬럼 그리드(읽기), 검토 패널(`추정 관계 검토(n)` 탭에서 추정 관계를 확정·기각한다).
- MCP `getModelText{modelId, diagram?, tables?}`:
  - 결과는 40,000자를 넘지 않는다.
  - `tables` 없이 불렀는데 전체 글이 상한을 넘으면 개요를 준다. 개요는 표 수, 컬럼 수, 관계 상태별 수, PK 없는 표, 표마다 컬럼 수와 PK 다.
  - `tables` 는 정확한 물리명이다(대소문자와 앞의 스키마 이름은 무시한다). 끝에 `*` 를 붙이면 접두사로 찾는다.
  - `tables` 를 주면 Ref 줄은 고른 표가 자식이든 부모든 나온다. 고른 글이 상한을 넘으면 들어가는 표까지만 싣는다.
  - `getCurrentView` 는 시각을 지역 시각(오프셋)과 지난 시간으로 적는다.
- 측정 결과(L_ERD12(TPL_DATA 복제, L_MAIN 아님), 2026-10-11):
  - MCM 가져오기: 표 57, 컬럼 891, 키 68, 관계 DB 0·INFERRED 113, 7초.
  - MDM 가져오기: 표 46, 컬럼 855, 키 85, 관계 DB 59·INFERRED 38, 2초.
  - 추정 표 짝: MCM 은 108쌍 중 67쌍을 그린다(접힌 후보 행 43개). MDM 은 34쌍 중 31쌍을 그린다(접힌 후보 행 5개).
  - `view kind=STATUS`(타입 대응을 고친 뒤): MCM 가운데 648ms(첫 670ms, 최대 743ms). MDM 가운데 617ms(첫 774ms, 최대 774ms).
  - 같은 모델에 두 번째로 `import` 하면 `INVALID`(이미 표가 있다)이고 rev 는 그대로다. 가져온 직후 `DB_DIFF` 는 MCM 0건, MDM 0건이다.
- 감사 컬럼 8개(`C_USR_ID`·`C_AT`·`C_SVC_ID`·`C_PGM_ID`·`U_USR_ID`·`U_AT`·`U_SVC_ID`·`U_PGM_ID`, 대소문자 무시, `VER` 제외): `addTable` 이 표 끝에 자동으로 붙이고(`audit:false` 로 끈다, 가져오기는 붙이지 않는다), 화면은 기본으로 숨기고 도구 막대 [감사 컬럼 보기] 토글로 보인다. `position` 없는 `addColumn`·끝으로 가는 `moveColumn` 은 감사 블록 앞에 넣는다. `getModelText` 는 한 줄로 접고 `audit:true` 면 펼친다. 정본은 단계 2 계획 README S2-30.

## 6. 단계 2 — 편집·동시 편집

- 쓰기: `save`(명령 묶음)·`restore`(되돌리기)에 `dryRun` 이 있다. 결과와 SSE `change` 에 `rowVersion` 이 있다. 바뀐 것이 없는 되돌리기는 INVALID 다.
- 버전 이벤트: SSE `version`(SUBSCRIBE·CONFIRM·LOCK·UNLOCK·HANDOVER·ADD_EDITOR·REMOVE_EDITOR). `copy`·DRAFT 삭제는 `reload` 다.
- 변경 기록: `view sinceRev` 가 다시 읽기 지점 앞을 물으면 `reload:true` 와 `fromRev`(기록을 줄 수 있는 가장 이른 sinceRev)를 준다. 화면 변경 기록과 MCP·CLI 의 rev 없는 되돌리기는 `fromRev` 부터 한 번 더 읽는다.
- 접속자: MCP·CLI 요청은 600초 시한 항목으로 보인다. `selectedTables` 는 마지막 쓰기가 건드린 표와 작업 중 표시 표다.
- 충돌·삭제 거절에 `byUserId` 가 있다. `execute kind=CLAIM` 은 쥔 세션·사용자·만료 시각을 돌려준다.
- 다시 가져오기 반영: `import kind=APPLY_DIFF`(`itemsJson` = `compare kind=DB_DIFF` 의 항목 id). 낡은 id 가 있으면 INVALID 다.
- 화면: 캔버스 편집(끌기·표 추가·관계 도구·Delete/Alt+Delete·자동 배치·마법사), 그리드 편집(논리명 미리보기·토막 고르기·도메인 적용), 버전 막대·확정 대화상자·공동 편집자 관리, 알림 막대·변경 기록 되돌리기·Ctrl+Z.
- Claude: MCP 쓰기 도구 6개(`apply`·`confirmRelation`·`rejectRelation`·`undo`·`claimTable`·`releaseTable`), CLI `scripts/erd/erd-cli.mjs`(기본 시험 실행).
- 마감 확인(L_ERD2C, 2026-10-11): CONFLICT(byUserId erd-mcp-b, 세션 claude-b, rev 3) → getChangesSince → 다시 보내 rev 4 반영, 델타 2개(3 claude-b, 4 claude-a), 값 동시편집A, SSE change rowVersion 2. p1 그리드 C5 논리명 사람A논리(rev 18 admin UI) → claude-b 클로드B논리(rev 19) → p1 Ctrl+Z → CONFLICT 알림 'erd-mcp-b 님이 rev 19 에서 먼저 바꿨습니다. 지금 값: "클로드B논리"', 안내에 '변경 기록에서 다른 변경을 고르세요', rev 19 불변. mine/copy 없음(되돌리기 묶음은 set 이 없어 내 값이 없다 — edit-context mine=set[property], 설계대로). ui/66-notice.png. 화면 확정 한 번에 통과(MDM001 없음, 대화상자 오류 null), 서버 1.001 RELEASED rowVersion 30, SSE version CONFIRM. B 창(p2) 새로 고침 없이 548ms 뒤 읽기 전용 띠 '확정된 버전이라 모델을 고칠 수 없습니다. [새 버전]으로 DRAFT 를 만드세요.' 대화상자 요약 '오류 0건 · 경고 738건 · 남은 추정 관계 113건', 경고 ERD_STD_DOMAIN:550·ERD_STD_MISS:160·ERD_STD_TYPE:27·ERD_INFERRED_LEFT:1, applyFrom 08:53:45(대화상자 연 시각). ui/74-b-released.png. 화면 반영 2항목(COLUMN_CHANGED:SAMPLE_NOTICE.TITLE·TABLE_ADDED:SAMPLE_MASTER_CODE), 안내 '고른 2건: DB 에 생긴 표 1 · 컬럼 다름 1', 요약 'rev 40 에 2건을 반영했습니다 — 표 추가 1 · 컬럼 바뀜 1', 델타 rev 40 admin UI, SSE rowVersion 2, DB_DIFF 0, 새 표 id t-236a17c3…(same:false) 컬럼 6개 그대로(감사 컬럼 자동 추가 없음 — S2-30 가져오기 예외 확인), TITLE 길이 200 복귀. 새 DRAFT 1.002 owner admin(선점 불필요), copy 는 7-4 applyFrom 지난 뒤 MDM006 없음. ui/82-diff-apply.png.

## 7. UX 정비 1차

화면 틀, 문구, 큰 모델 읽기를 고친 회차다(2026-10-11). 정본은 UX 정비 1차 계획 README(`docs/superpowers/plans/2026-10-11-erd-ux1/README.md`)의 U1-U54 이다. 이 절은 화면 설계가 된 결정만 요약한다. 서버 쪽 변경은 칸 2개와 확정 검사 규칙 1개다. Flyway V 파일은 더하지 않았다. 마감 값은 계획 README "1차 구현 결정" 에 있다.

### 7.1 화면 틀

- 화면 분할은 shared `ContentBody resizable` 와 `ContentPanel` 로 한다(Part B §4-3, U10). CSS grid 는 쓰지 않는다.
  - 바깥 세로 분할: `storageKey="mdm.dma.erdEdit"`. 안에 가로 분할(main)과 검토 패널이 든다.
  - 가로 분할: `storageKey="mdm.dma.erdEdit.main"`. 왼쪽 패널(기본 폭 220), 캔버스(남는 폭), 속성 패널(기본 폭 400)이다.
  - 크기는 ContentBody 가 사용자별로 `dmes:split:v1:{userId}:<storageKey>` 에 저장한다. 더블클릭하면 기본 크기로 돌아간다.
  - 최대화 때 속성 카드는 shared `FloatingPanel`(`storageKey="mdm.dma.erdEdit.props"`)에 띄운다. 위치와 크기는 `dmes:floating-panel:mdm.dma.erdEdit.props` 에 저장한다.
  - 캔버스 패널은 늘 같은 `key="canvas"` 라서 다른 패널이 빠져도 React Flow 가 다시 마운트되지 않는다.
- 검토 패널은 기본으로 접힌다(U11). 접힌 모양은 탭 줄 하나이고, 높이는 32px 이하이며 건수가 보인다. 탭 줄은 ContentBody 밖 형제로 둔다. 탭을 누르면 펼치고 그 탭을 연다(펼친 높이 기본 260). 위반이 있어도 저절로 열지 않는다.
- 속성 패널은 고른 표가 있을 때만 그린다(U12). 사용자가 접으면 28px 레일로 남는다. 입력 칸에 초점이 있으면 선택이 풀려도 초점이 나갈 때까지 숨기지 않는다. 패널이 열고 닫혀 캔버스 폭이 바뀌어 고른 노드가 캔버스 밖이면, 배율을 유지한 채 그 노드로 옮긴다.
- 왼쪽 패널은 접으면 28px 레일이 된다(U13).
- 캔버스 최대화(U14): 상태는 `ErdViewer` 의 `maximized` 이고 기억하지 않는다. 켜면 왼쪽·속성·검토 패널과 탭 줄을 그리지 않고 위 막대만 남긴다. 고른 표가 있으면 `FloatingPanel` 에 속성을 띄운다. 켜고 끄는 방법은 Controls 의 [캔버스 최대화] 단추와 `Alt+M`(`e.code === "KeyM"`)이다. 입력 칸에서는 키를 넘긴다.
- 위 막대는 한 줄이다(U15). 순서는 모델 단추들, [+ 모델], 요약 줄, [버전 ▾], [읽기 전용] 칩, 접속자, 빈 칸, [논리|물리], 보기 프리셋, [범례], [DB 에서 가져오기](표 없는 모델만)다. 모델 등록 입력은 shared `Modal` 로 옮기고 칸마다 라벨을 단다. 끊김 띠와 알림 띠는 있을 때만 그 아래 줄에 나온다. 요약 줄은 고정 칸(넘치면 `…`, `title` 에 전문)에 둔다(Local-Rules §38). 모델이 많아 단추가 줄을 넘는 경우는 deferred 에 있다.
- [버전 ▾](U16)는 shared `DetailPopover` 안에 `VersionActionBar` 를 그대로 둔다. 번호와 공동 편집자 단추도 팝오버 안에 있다. `ConfirmDialog` 와 `EditorsModal` 은 팝오버 밖(VersionBar 루트)에 둔다. 팝오버는 닫히면 내용을 언마운트하기 때문이다. 비활성 [확정] 의 회색 모양은 ERD 범위 CSS 로 입힌다(U17).
- 화면 제목 "ERD 설계" 는 `.erd-page > .page-layout__header` CSS 로 숨긴다(U18). 아래 꼬리(breadcrumb, 화면 ID)는 그대로 둔다.
- 읽기 전용은 [읽기 전용] 칩 하나로 알린다(U19). 칩의 `title` 은 짧은 이유이고 누르면 `DetailPopover` 로 긴 이유와 할 일을 보인다. 모델과 이유별로 처음 한 번은 저절로 연다(`seenReadOnly`). 다른 곳(도구 막대 툴팁, 입력 칸, DB 다시 가져오기 탭)은 짧은 이유(`shortReason`)만 쓴다.
- 메시지는 shared `useMessage().showMessage({ toast: true })` 로 보인다(U20). 지속 시간은 info 3초, warn 5초, error 8초다. 같은 글을 숨은 live region(`data-testid="erd-message"`, 화면 높이 0)에도 둔다.
- 측정 선택자(`.erd-app`, `.erd-area-bar`, `.erd-area-side`, `.erd-area-center`, `.erd-area-grid`, `.erd-area-review`)의 이름은 그대로 지킨다(U5). 면적 측정이 같은 방법으로 이어지게 하려는 것이다.

### 7.2 작업 상태 저장

- 키는 `dmes:erdEdit:v1:{userId}` 하나다(JSON, `state/prefs.ts`, U21). 읽기와 쓰기는 모두 try/catch 이고 실패하면 기본값으로 동작한다. 쓰기는 300ms 미룬다.
- 값은 다음과 같다.

| 칸 | 기본값 | 뜻 |
|---|---|---|
| `lastModelId` | null | 마지막으로 연 모델. 목록에 있고 그 사이 사용자가 모델을 고르지 않았을 때만 연다 |
| `lastDiagram` | {} | 모델별 마지막 다이어그램 id |
| `mode` | `logical` | 논리·물리 모드 |
| `preset` | `basic` | 보기 프리셋 |
| `reviewOpen`·`reviewTab` | false·`inferred` | 검토 패널 열림과 마지막 탭 |
| `sideOpen`·`propsOpen` | true·true | 왼쪽·속성 패널 접힘. `propsOpen` 은 고른 표가 없으면 무시한다 |
| `viewports` | {} | `모델/다이어그램` 별 화면 위치와 배율. 최대 30개이고 넘치면 오래된 것부터 뺀다. 배율은 0.1 이상 2 이하만 받는다 |
| `seenReadOnly` | [] | 저절로 연 읽기 전용 안내(`모델:이유`). 최대 20개 |

- 읽는 때는 `me`(RBAC)와 모델 목록이 둘 다 온 뒤 한 번이다.
- 기존 키 `dmes.erdEdit.showAudit` 은 그대로 둔다. 미니맵은 `dmes.erdEdit.showMiniMap`(`"1"`·`"0"`)이고 저장값이 없으면 다이어그램 표가 30개 이상일 때 켠다(U51).
- 같은 사용자의 탭 두 개는 서로 덮어쓴다. 메모리 사본 통째로 한 키에 쓰고 다른 탭의 `storage` 이벤트를 받지 않는다. 마지막에 쓴 탭이 이긴다(deferred 에 있다).

### 7.3 첫 viewport와 첫 다이어그램

- 첫 viewport(U22, `state/viewport.ts`): `fitView` prop 은 끄고 `initialViewport` 로 정한다.
  1. 저장 viewport(`viewports["모델/다이어그램"]`)가 있으면 그것을 쓴다.
  2. 없으면 다이어그램 전체 맞춤 배율(상한 1)을 계산한다. 0.35(`FIRST_FIT_MIN_ZOOM`)이상이면 맞춤으로 연다.
  3. 아니면 배율 1 로, 노드 묶음의 왼쪽 위(첫 표)를 캔버스 왼쪽 위에서 40px 안쪽에 둔다.
  - 이동이 끝나면(`onMoveEnd`) viewport 를 저장한다. [화면 맞춤]과 `Shift+1` 은 최소 0.1 까지 맞춘다. `Shift+2` 는 고른 표를 맞춘다(상한 1).
  - 0.35 는 개요 단계 문턱(`ZOOM_OVERVIEW`)과 같은 값이다. 서버에 저장된 자리는 읽기 전용 사용자가 바꿀 수 없으므로 첫 화면은 viewport 로 고친다.
- 첫 다이어그램(U53): `lastDiagram[모델]` 이 있고 살아 있으면 그것을 연다. 없으면 `sortSeq` 순으로 표가 30개 이하인 첫 다이어그램, 그것도 없으면 `sortSeq` 첫 다이어그램을 연다. 주제별 나누기를 마치면 만든 첫 다이어그램으로 간다(`ctx.nav.selectDiagram`).
- 가져오기 격자(U24): `ErdImportBuilder` 가 격자 행 높이를 고정 220 대신 그 행에서 가장 큰 노드의 어림 높이에 60 을 더한 값으로 잡는다(어림 = 30 + 20 × 감사 컬럼을 뺀 컬럼 수). 열은 8개, 열 간격은 280 그대로다. 겹침을 막으려는 것이다.

### 7.4 큰 모델 읽기

- 2-D 자동 배치(U23, `canvas/erd-layout.ts`의 `layoutTables`): 관계로 이어진 묶음마다 shared `autoLayout`(dagre LR)을 돌린 뒤, 묶음 높이가 목표를 넘으면 층을 나눠 옆 열로 쌓고(`wrapRanks`), 묶음과 외톨이 표를 줄 단위로 포장한다(`packShelves`). 목표 가로세로 비는 캔버스의 가로/세로이고 값이 없으면 1.6이다. 화면에 반영하는 곳은 [자동 배치], 다이어그램 마법사, 주제별 나누기뿐이다. shared `autoLayout` 은 바꾸지 않는다.
- 단계별 그리기 문턱(U50, `canvas/erd-geometry.ts`):

| 단계 | 확대율 | 그리기 |
|---|---|---|
| `detail` | 0.5 이상(`ZOOM_NAMES_ONLY`) | 프리셋대로 |
| `names` | 0.35 이상 0.5 미만 | 이름만(머리 한 줄). 이름 글자를 화면 기준 약 12px 로 키운다(`calc(12px / var(--erd-zoom))`) |
| `overview` | 0.35 미만(`ZOOM_OVERVIEW`) | 원래 높이의 상자에 논리명·물리명 두 줄을 화면 기준 약 12px 로 그린다. 흐름 단위 상한 60px, 최대 3줄. 관계선은 끝 모양과 후보 표지를 숨기고 선 굵기를 화면 기준 약 1.5px 로 둔다 |

  - 단계 판정은 store 선택자(불리언 2개)로만 다시 그린다. 배율 값은 `useCanvasEditing` 이 React Flow 요소에 CSS 변수 `--erd-zoom` 과 `data-lod` 로 한 번씩 쓴다. 노드마다 배율을 구독하지 않는다(Local-Rules §19).
  - 노드 자리는 서버 값이라 개요에서 상자를 줄이지 않는다. 상자를 줄이는 개요는 deferred 에 있다.
- 미니맵(U51): React Flow `MiniMap` 을 캔버스 오른쪽 아래에 둔다. 노드 색은 위반 있는 표 `--color-danger-soft`, 고른 표 `--color-primary`, 나머지 `--color-bg-header` 다. 도구 막대 [미니맵] 으로 켜고 끈다.
- 관계선 붙는 변: 두 표가 좌우로 8px(`FACING_MIN_GAP`)를 넘게 떨어지면 마주 보는 변이고, 겹치거나 맞닿으면 둘 다 오른쪽 변(ㄷ 모양)이다. 자기 참조도 오른쪽 변이다. 표를 끄는 동안에도 바로 바뀐다.
- 여러 표 고르기: ⌘/Ctrl+클릭으로 더하고, Shift+빈 곳 끌기로 사각형 안 표를 모두 고른다. 고른 표를 함께 끌면 `moveNodes` 한 묶음으로 저장되고 되돌리기 한 번에 돌아온다. `Delete` 는 고른 표 모두를 한 묶음으로 다이어그램에서 뺀다. 속성 패널은 고른 표 중 첫 표만 보인다. 여러 개를 고르면 [컬럼 추가]·[PK 추가] 는 꺼진다.

### 7.5 주제별로 나누기

- 진입: 도구 막대 [주제별 나누기]와 빈 곳 메뉴 [주제별로 나누기…]. 권한은 다이어그램 편집 권한(`rights.diagram`)이다.
- 창(`SplitDialog`)은 묶음 미리보기(이름, 표 수, 앞 표 3개, 만들기 체크)를 보인다. [만들기] 는 고른 묶음마다 `addDiagram` 과 `placeTables`(2-D 배치 자리)를 한 묶음으로 보낸다. 한 번에 보내는 명령은 200개(`MAX_BATCH`) 안이고, 넘으면 나눠 보낸다. 업무영역 이름 기본값은 `주제별` 이다. 같은 이름의 다이어그램이 이미 있으면 그 묶음은 꺼지고 "이미 있음" 이 보인다. 일부만 만들어지면 "n개 만들었습니다. 나머지는 만들지 못했습니다." 를 보인다.
- 묶는 규칙(`subjectGroups(model, tables, { min: 5, max: 20 })`, 순수 함수 `canvas/erd-split.ts`):
  1. 열쇠는 표 물리명에서 모델 접두(`TB_<X>_`, `tablePrefix`)를 뺀 첫 토막이다. 예: `TB_MCM_SEC_MENU` 는 `SEC` 다.
  2. 20개를 넘는 묶음은 그 안의 관계 연결 묶음으로 나눈다. 그래도 넘으면 물리명 순으로 고른 조각으로 자른다(이름 `SEC 1`, `SEC 2`).
  3. 5개 미만 묶음은 관계가 가장 많이 걸린 다른 묶음에 붙인다. 합쳐서 20개 이하일 때만 붙인다. 붙일 곳이 없으면 `기타` 로 모아 20개씩 자른다.
  4. 순서는 묶음 이름순이다. 같은 입력이면 같은 결과가 나온다.
- 서버 변경은 없다. 묶음 편집(이름 바꾸기, 표 옮기기)은 2차로 미뤘다(U54).

### 7.6 위반 정의(U25)

- "고칠 위반" 은 상태가 `TYPE`·`DOMAIN`·`MISS` 인 컬럼이다(`state/violations.ts`). `NEW`·`ALIAS` 는 세지 않는다. 그리드 배지로만 보인다.
- 감사 컬럼은 보기(`showAudit`)가 꺼져 있으면 세지 않는다.
- 위 막대 요약 줄, 왼쪽 목록 수, 노드 머리 수, [표준 위반] 탭의 행과 건수가 모두 이 규칙을 쓴다.
- MCP `listViolations` 는 이 규칙으로 바꾸지 않았다(deferred 에 있다).
- 모델 요약 줄(U26): `표 57 · 관계 113(추정 113) · 고칠 위반 737`. 관계는 `REJECTED` 를 뺀 수이고 추정은 `INFERRED` 수다. 표준 상태를 아직 읽지 못했으면 위반 칸은 `…` 다.
- 위반 행을 누르면 `ctx.nav.selectColumn(columnId)` 로 표를 고르고 그 컬럼 행을 고른다(U39).

### 7.7 서버 칸

- `userHint`(U27): `ErdRejection` 에 JSON 읽기 전용 칸 `userHint` 를 더했다. `save`·`restore`·`import` 결과의 `rejection` 과 DB 다시 가져오기 반영 결과에 실린다. 값 규칙은 `engine/ErdUserHints.of(code, hint, ownerId)` 다.
  - `hint` 에 기계 용어(`getChangesSince`, `getModelText`, `baseRev`, `view`, `kind=`, `restore`, `undo(`, `op`, `JSON`, `setPrimaryKey`, `confirmRelation`, `updateRelation`, `copy 로`)가 없으면 `hint` 를 그대로 쓴다.
  - 있으면 정해진 사람 글을 쓴다. 정할 글이 없으면 null 이다.
  - `hint` 글자는 바꾸지 않는다. MCP·Java 시험이 본다.
  - 화면은 `hint` 를 보이지 않고 `userHint` 만 보인다. 옛 서버는 칸이 없으므로 화면은 `?? null` 로 읽는다.
- 변경 기록 `at`(U28): `ErdDelta` 끝에 `at`(문자열, `yyyy-MM-ddTHH:mm:ss`, 서버 지역 시각, 초 단위)을 더했다. `view sinceRev` 의 `deltas[]` 와 SSE `change` 에 실린다. 명령 기록 `C_AT` 에서 읽고, 실시간 `change` 는 쓴 시각, 다시 읽기 지점은 그 행의 시각이다. 모르면 null 이다. 옛 7인자 생성자는 `at = null` 로 남겼다. 스키마와 V 파일은 바꾸지 않았다.
- 화면의 변경 기록 칸은 시각(오늘이면 `HH:mm`, 아니면 `MM-dd HH:mm`), 번호, 사람(내 세션은 "나"), 출처, 내용이다(U33).

### 7.8 확정 검사의 감사 컬럼 규칙(U29)

- 확정 검사에서 감사 컬럼 8개의 표준 위반은 늘 경고다. 오류가 되지 않고 버리지도 않는다. 첫 확정과 두 번째 확정 모두 같다.
- 판정은 `ErdConfirmCheck.classify` 한 곳이다. 오류 조건은 "첫 버전이 아님 + 이번 버전에서 바뀐 컬럼 + 감사 컬럼이 아님" 이다.
- 코드는 그대로 `ERD_STD_*` 다. 화면 확정 창은 그 행에 "감사 컬럼" 을 붙인다. 사전과 DB 는 바꾸지 않았다. 다른 컬럼의 규칙(deferred 52)도 그대로다.
- 사용자 결정(2026-10-11): "감사 컬럼 8개는 확정 검사에서 제외한다. 표준 위반이 있어도 경고만 하고 확정을 막지 않는다." 두 문장을 함께 읽어 "경고에는 남기고 막지는 않는다" 로 해석했다. 검사에서 아예 빼려면 `classify` 의 한 줄을 `return` 으로 바꾼다.
- 화면 쪽 문구는 `labels.ts` 가 모은다(U30). 확정 코드(`ERD_STD_TYPE` → 타입 불일치, `ERD_STD_DOMAIN` → 도메인 다름, `ERD_STD_MISS` → 사전 없음, `ERD_INFERRED_LEFT` → 검토 안 한 추정 관계), 근거 종류(`DOC` → 설계 문서, `SQL_JOIN` → SQL 조인, `NAME_RULE` → 이름 규칙), 출처(`UI` → 화면, `MCP` → Claude, `CLI`, `SYSTEM` → 시스템), 변경 종류(`diagramNode` → 표 자리)이다. 모르는 코드는 원문을 그대로 보인다.
