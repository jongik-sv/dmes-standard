# erdEdit 기능설계서 — ERD 설계

- 정본: [ERD 도구 설계](../../../superpowers/specs/2026-10-10-erd-tool-design.md). 이 문서는 MDM 화면 규약(screens/README.md §5)에 맞춘 색인이다.
- 그룹 `dma`, screenId·serviceId `erdEdit`, componentPath `dma/erdEdit`.
- 버전 대상 `ERD_MODEL`(모듈 하나 = 객체 하나, 스펙 D2). 확정은 소유자가 직접 한다(ADR-0002).

## 1. 액션

| 액션 | 뜻 | 권한 세트 |
|---|---|---|
| search | 모델 목록. 칸에 `status`(모델 STATUS)·`releasedVer`(최신 확정본, 없으면 null)·`createdBy`(등록자)가 있다. `kind=SCHEMAS` 는 `ALL_USERS` 중 `ORACLE_MAINTAINED='N'` 인 DB 사용자 이름 목록이다(2차 7절) | READ |
| view | 모델 하나(JSON·다이어그램·rev·편집자·접속자) 또는 `sinceRev` 이후 델타. `kind=SET_VIEW` 면 내 화면 상태(보는 다이어그램·선택한 표)를 알린다. 읽기 전용 사용자도 부를 수 있다 | READ |
| compare | 논리명·물리명 미리보기(표준 판정) | READ |
| validate | 확정 검사 미리보기 | EDIT |
| reg | 빈 모델 만들기 | EDIT |
| save | 명령 묶음 적용(`apply`). 다이어그램 명령 `setRoute`·`clearRoutes`·`copyDiagram` 이 있다(2차 7절) | EDIT |
| restore | 명령 되돌리기 | EDIT |
| execute | 작업 중 표시와 공동 편집자 등록·해제. `kind` 값은 ADD_EDITOR·REMOVE_EDITOR·CLAIM·RELEASE | EDIT |
| copy | 새 버전(DRAFT) | EDIT |
| delete | DRAFT 삭제. `kind=MODEL` 이면 모델 완전 삭제(2차 7.3절) | EDIT |
| lock / unlock / handover | DRAFT 선점·해제·넘기기 | EDIT |
| confirm | 확정 | CONFIRM |
| import | DB 가져오기(`kind=FROM_DB`). 단계 1 에서 추가했다(5절) | EDIT |

## 2. 데이터

스펙 3절. 표는 `TB_MDM_ERD_MODEL`, `_MODEL_VER`, `_EDITOR`, `_CMD_LOG`, `_DIAGRAM`, `_DIAGRAM_NODE`, `_CLAIM`, `_DIAGRAM_ROUTE`(2차, Flyway mdm V7, 7.1절).

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

## 8. UX 정비 1.5 — 여러 표 동시 처리

여러 표를 한 번에 다루는 동작과 추정 점선 누르기를 더한 회차다(2026-10-11). 정본은 UX 정비 1.5 계획 README(`docs/superpowers/plans/2026-10-11-erd-ux15-multiselect/README.md`)의 U55-U73 과 Task 6 이다. 화면 파일만 바뀌었다. 서버·MCP·Flyway 는 바꾸지 않았다(U55). 모든 명령이 이미 표 목록을 받고, apply 한 번이 rev 하나이기 때문이다. 마감 값은 계획 README "1.5 구현 결정" 에 있다.

### 8.1 고르기

- 고르기는 xyflow 기본 키를 그대로 쓴다. ⌘+클릭(Windows Ctrl+클릭, `multiSelectionKeyCode` 기본값)으로 더하고, Shift+빈 곳 끌기(`selectionKeyCode` 기본값)로 사각형 안 표를 고른다. `ErdViewer` 의 ReactFlow 에는 두 키를 지정하지 않는다.
- `Ctrl/⌘+A` = 이 다이어그램 표 모두 고르기(U67). ERD 키 표 `selectAll` 은 `key: "a"` 와 물리 키 `code: "KeyA"` 를 함께 본다(한글 자판). 캔버스 초점일 때만 받고, 입력 칸이면 shared `dispatchShortcut` 이 넘긴다. 표가 없으면 넘긴다.
- 함께 끌기, 접기(도구 막대 `FOLDS`·표 메뉴 `targets` → `setFoldCommand`), 다이어그램에서 빼기, 모델에서 삭제는 1.5 전부터 `selectedIds()` 를 넘겼다(U56). 이 회차에서는 시험만 더했다.
- Delete 키는 그대로다(U57). `Delete`·`⌫` = 고른 표 모두 이 다이어그램에서 빼기, `⌥⌫` = 모델에서 삭제(확인 창, 200개 상한).
- 속성 패널은 여러 개를 골라도 첫 표(살아 있는 선택의 첫 값)를 보인다. 머리 글만 `속성 · 고른 표 n개 중 <물리명>`(`erd-props-multi`)으로 바꾼다(U65).
- 선택 비우기(U66): `onSelectDiagram` 이 다른 다이어그램으로 갈 때 `selected` 와 `selectedColumnId` 를 비운다. 같은 다이어그램이면 그대로 둔다. 늘 거르는 방식은 쓰지 않는다. 컬럼 점프와 표 찾기가 다이어그램에 없는 표를 `selected` 에 두는 길이 있기 때문이다. 모델에서 지운 표는 `focusTable` 계산에서 뺀다(파생 값, 새 상태 없음). 1차 마감 결함 후보 `staleSelectionAcrossDiagram` 을 고친 것이다.

### 8.2 정렬(U58·U59·U60)

- 순수 함수는 `canvas/erd-multi.ts` 의 `alignBoxes`·`distributeBoxes` 다. 결과는 `moveNodesCommand` 한 건이고, 안 바뀐 표는 뺀다. 모두 그대로면 apply 하지 않고 "이미 맞춰져 있습니다." 를 알린다.
- 맞춤 6 = 왼쪽·가운데·오른쪽·위쪽·중간·아래쪽(PowerPoint 한국어 이름). 기준은 고른 표 경계 상자다. 2개 이상이면 켠다.
- 간격 2 = 가로 간격 같게·세로 간격 같게. 3개 이상이면 켠다. 축 좌표, 다음 표 id 순으로 늘어놓고 양 끝 표를 고정해 표 사이 빈 칸을 같게 한다. 빈 칸이 40(`DISTRIBUTE_MIN_GAP`) 보다 작으면 40 으로 첫 표부터 펼친다. 이때 마지막 표도 옮겨진다.
- 좌표는 정수 반올림만 한다. 격자 10 맞춤을 하지 않는 이유는 가운데 맞춤이 어긋나지 않게 하려는 것이다.
- 크기와 자리는 누를 때 읽는다(U59). `measuredSizes()` 를 자동 배치와 함께 쓴다. 크기는 React Flow 가 잰 값이고, 이름만 배율(`ZOOM_NAMES_ONLY` 0.5 미만)이면 잰 높이에 컬럼 행이 빠져 있어 `initialHeight` 를 쓴다. 그래서 이름만 배율에서 정렬하면 화면의 머리 상자끼리는 줄이 안 맞아 보이고, 확대하면 맞는다(마감 M4). 자리는 `rf.getNode(id).position`(끄는 중 덮개 포함)이다. 도구 막대는 자리를 구독하지 않는다(Local-Rules §19).
- 진입점은 도구 막대 [정렬 ▾](`erd-tool-align`, shared `TextToolButton menu` + `ContextMenu`)와 표 메뉴 "정렬" 묶음이다. 단축키는 없다. 권한은 `rights.diagram` 이라 확정된 버전에서도 소유자·공동 편집자가 쓸 수 있다. apply 라벨은 `왼쪽 맞춤(표 3개)` 꼴이다.

### 8.3 다른 다이어그램에 넣기(U61)

- 창은 `canvas/MultiDialogs.tsx` 의 `PlaceIntoDialog` 다. 대상 목록은 shared `Select` 이고 지금 다이어그램은 뺀다. 명령은 `placeTables` 한 건이다.
- 대상에 이미 있는 표는 화면이 걸러서 보내지 않는다. 서버 `ErdDiagramStore.mergeNode` 가 `MERGE … WHEN MATCHED THEN UPDATE SET POS_X, POS_Y` 라서 다시 보내면 대상의 자리를 덮어쓰기 때문이다. 서버에 "있으면 건너뛰기" 칸을 더하는 안은 서버·MCP 계약 변경이라 쓰지 않았다.
- 자리는 고른 표끼리의 상대 배치를 유지하고, 대상 경계 상자 오른쪽 + 80, 위 = 대상 최소 y 에 놓는다. 대상이 비면 (0,0) 이다. 넣은 뒤 지금 다이어그램에 머문다.
- 알림은 `표 n개를 「업무영역 / 이름」에 넣었습니다(이미 있던 m개 뺌).` 이고, apply 라벨은 `다른 다이어그램에 넣기(표 n개)` 다. 다른 다이어그램이 없으면 단추와 메뉴 항목이 꺼진다. 권한은 `rights.diagram` 이다.
- 고른 표로 새 다이어그램 만들기는 하지 않았다(U62). [새 다이어그램] 마법사가 있다.

### 8.4 같은 컬럼 여러 표에(U63·U64)

- [컬럼 추가] 가 고른 표 2개 이상이면 창 `BulkColumnModal` 을 연다. 표 메뉴의 "표 n개에 같은 컬럼 추가…" 도 같다.
- 논리명을 넣으면 300ms 뒤 `previewName({logical})` 로 물리명 칸을 채운다. 사용자가 고칠 수 있고, 사전에 없는 토막이면 직접 넣는다. 물리명은 trim 하고 대문자로 바꾼다.
- 보낼 때 물리명이 미리보기와 다르면 `previewName({phys})` 로 추천 도메인을 받는다(실패면 null). 제출 중에 늦게 온 미리보기 응답은 버린다(Local-Rules §37). 모든 `addColumn` 에 `phys` 와 `domainId` 를 넣어 보내므로 서버 NEEDS_CHOICE(토막 고르기)가 표마다 오지 않는다. 토막 고르기 창을 이 창에 넣는 안은 비용이 커서 "물리명 직접 넣기" 로 갈음했다.
- 대상은 고른 표 가운데 같은 물리명(대소문자 무시) 컬럼이 없는 표다. 있는 표는 "건너뜀" 목록에 보인다. 같은 이름 하나가 묶음 전체를 거절시키므로 미리 거른다. 감사 컬럼 이름은 막는다. 대상이 0 이면 [추가] 를 끈다. 표 수 상한은 `MAX_BATCH`(200)다.
- 위치는 끝이다(서버 규칙: 감사 블록 앞). PK 는 아니다. apply 한 번이고 라벨은 `컬럼 추가(표 n개)` 다. 거절이면 창 안에 문구를 보이고, 묶음 전체가 거절되므로 아무것도 바뀌지 않는다.
- 다른 세션이 그 표의 다른 컬럼을 먼저 고쳐도 거절되지 않는다(마감 M7). `addColumn` 은 새 요소라 rev 충돌이 없다.
- 새 컬럼 id 는 `erd-commands` 의 `newElementId("c")` 다(U71).
- [PK 추가] 는 표 하나만 받는다(U64). PK 바꾸기는 관계와 자식 표에 번지기 때문이다.

### 8.5 도구 막대 툴팁(U68)

- 꺼진 접기 3·넣기·빼기·삭제 단추의 툴팁은 `tipOf` 가 `"… — 표를 먼저 고르세요"` 를 붙이고, shared `ToolButton` 을 감싼 `span[data-tip]` 의 CSS `::after` 로 보인다. 1차 마감 `disabledNoReason` 은 title·aria-label 을 읽은 판정 잘못이었다(마감 M9 에서 보임 확인).
- 고른 표가 2개 이상이면 켜진 접기 3·넣기·빼기·삭제 툴팁 끝에 ` (표 n개)` 를 붙인다. [컬럼 추가] 는 `컬럼 추가 — 고른 표 n개에 같은 컬럼`, [정렬 ▾] 는 `정렬 (표 n개)` 다.

### 8.6 추정 점선 누르기(Task 6)

- 추정(INFERRED) 관계선만 누를 수 있다. `ErdRelationEdge` 가 `RelationPickContext` 를 받으면 본선 위에 투명한 12px stroke 경로(`erd-rel__hit`, `pointer-events: stroke`)를 얹는다. 확정 관계선에는 이 경로가 없어 지금처럼 누르지 않는다. 관계선의 `selectable: false` 는 그대로다.
- 누르면 `ErdViewer.onPickRelation` 이 관계 id 를 작은 외부 저장소 `InferredPick`(`panels/ReviewPanel.tsx`)에 넣고, prefs 를 `reviewTab: "inferred"`·`reviewOpen: true` 로 바꾼다. 이미 그 상태면 prefs 를 바꾸지 않아 화면 루트가 다시 그려지지 않는다. 노드 선택은 건드리지 않는다.
- 추정 그리드는 `InferredPick` 을 구독해 `highlightedRowKey` 로 그 행을 강조하고 그 행으로 굴린다. `scrollToRow` 는 쓰지 않는다. 행을 누를 때마다 가운데로 튀기 때문이다. 그리드의 `onFocusedRowChange` 는 저장소에 다시 쓴다(↑/↓ 이동 유지, 표 선택은 행을 누를 때만).
- Provider 값 `onPickRelation` 은 안정 콜백이라 선·노드가 다시 그려지지 않는다(Screen-Performance R7·R16).
- 알려진 한계(deferred): 같은 점선을 다시 누르면 저장소 값이 같아 다시 굴리지 않는다. 12px 띠 위에서는 빈 곳 끌기와 우클릭 캔버스 메뉴가 되지 않는다. 최대화 중에는 검토 패널이 없어 prefs 와 저장소만 바뀌고, 최대화를 끄면 그 행이 강조되어 있다.

### 8.7 새 표 창 물리명 Enter

- 새 표 창(`CanvasDialogs.tsx` `NewTableModal`)의 물리명 칸에서 Enter 를 누르면 [만들기] 와 같다. 물리명을 직접 넣으면 "사전에 없는 단어가 있어 물리명을 직접 넣으세요." 줄을 숨긴다. 1차 마감 결함 후보 `newTableEnterPhys` 를 사용자 결정(2026-10-11)으로 이 회차에 넣었다.
- 알려진 한계(deferred): 만들기가 성공한 직후 창이 닫히기 전 2~4초 동안 "같은 물리명의 표가 이미 있습니다: …" 가 보인다. 방금 만든 자기 표와 다시 견주는 것으로 추정하며, 원인은 확인하지 않았다. 표는 하나만 만들어진다.

### 8.8 성능

- 화면 루트에 새 상태가 없다. `selected` 만 쓴다(U70). 창 입력 상태는 창 안에 있고, 창 열림 상태는 `useCanvasEditing` 안에 있다. 창은 열린 동안만 모델을 받는다(`SplitDialog` 방식). 도구 막대의 새 props 는 숫자·불리언·안정 콜백이다.

## 9. 2차 — 경유점·목록 관리·캔버스 편집·CLI·MCP

2차 회차(erd-2nd-1012, 2026-10-12)다. 정본은 [2차 레인 공통 규칙](../../../erd-tool/stage2-2026-10-12/README.md) §7 이다. 서버·CLI·MCP·화면이 모두 바뀌었다. Flyway V 파일은 mdm V7 하나다. 새 권한 액션은 만들지 않았다(`MdmActions` 16종 그대로, 기존 액션의 `kind` 로 넓혔다).

### 9.1 관계선 경유점(꺾임점)

- 표 `TB_MDM_ERD_DIAGRAM_ROUTE`(V7): `DIAGRAM_ID`·`REL_UUID`(PK) → `POINTS_JSON` → 감사 컬럼 9개(VER 포함). `POINTS_JSON` 은 CLOB `IS JSON STRICT`, `[{"x":int,"y":int},…]`, 1~50개다. FK 는 `TB_MDM_ERD_DIAGRAM` 만 있다(관계는 버전 JSON 안에 있다). 모든 컬럼에 `COMMENT ON` 이 있다.
- 다이어그램 명령(save 묶음, 버전 밖):
  - `{"op":"setRoute","diagram","relation","points":[…]}` — 빈 목록은 거절. 그 DRAFT(없으면 현재 버전)에 없는 관계는 `INVALID`. 화면이 보는 ver 가 기준이 아니다.
  - `{"op":"clearRoutes","diagram","relations":[…]}` — 빈 목록은 no-op(거절하지 않고 rev 는 올린다). null 목록·null 원소는 거절한다.
- 델타 kind `diagramRoute`, id `"<diagram>:<relation>"`, 값 `{diagram, relation, points}`(지움 = null). `view` 응답의 `routes` 는 `[{diagram, relation, points:[{x,y}]}]` 다.
- 연쇄 삭제(같은 rev, 역명령에 함께 들어가 되돌리기 1번으로 모두 돌아온다):
  - `deleteRelation`·`deleteTable`(걸린 관계도 지움): 모든 다이어그램의 그 관계 꺾임점.
  - `deleteDiagram`: 그 다이어그램의 꺾임점(`remember()` 가 route 행도 잡는다).
  - `removeFromDiagram`(표): 그 다이어그램에서 그 표에 걸린 관계의 꺾임점.
- 되돌리기: `RestoreDiagram` 요소 kind 검사에 `diagramRoute` 를 더했다. FK 순서는 다이어그램 되살리기 → 노드·route → 다이어그램 지우기다.
- 처리 규칙(사용자 결정 10-12):
  - 표 손 이동(`moveNodes`)·정렬은 꺾임점을 유지한다. 좌표는 캔버스 절대 좌표이고 표가 움직여도 꺾임점은 옮기지 않는다.
  - [자동 배치] 는 화면이 `moveNodes` 와 `clearRoutes`(옮긴 표에 걸린 관계)를 한 묶음으로 보낸다(되돌리기 1번).
  - 그 버전에 없는 관계의 route 행은 지우지 않고 화면이 그리지 않는다.
  - 권한은 다른 다이어그램 명령과 같다.
- 선 모양은 꺾임점을 지나는 꺾은선이다(직각 강제 없음, `canvas/erd-route.ts`). 끝 모양은 끝 마디 방향을 따른다.
- 화면: 선을 누르면 고르고(강조), 선 가운데 손잡이를 끌면 꺾임점이 생기고, 꺾임점 손잡이를 끌면 옮기고 두 번 누르면 지운다. 선을 오른쪽 단추로 누르면 [자동 경로로 되돌리기] 가 있다. 앞뒤와 한 줄이거나 4px 안에 겹친 점은 지운다. 개요 단계(0.35 미만)에서는 손잡이를 그리지 않는다.
- 알려진 한계(deferred 133·134): `onlyRenderVisibleElements` 가 꺾임점을 보지 않아 표 둘이 모두 화면 밖이면 선이 안 보인다. [자동 배치] 결과가 지금과 같으면 꺾임점이 남는다(계약대로).

### 9.2 모델 관리·다이어그램 목록 관리

- `search`(kind 없음): `status`·`releasedVer`·`createdBy` 칸을 더했다. `search kind=SCHEMAS` 는 `ALL_USERS` 중 `ORACLE_MAINTAINED='N'` 사용자 이름 목록이다. 실패하거나 비면 화면은 직접 입력을 받는다.
- `copyDiagram`: `{"op":"copyDiagram","from","id"(선택),"areaName","diagramName"}`. 노드(위치·접기)와 꺾임점을 함께 복사하고 rev 1 이다. 화면 기본 이름은 「<이름> 복사」(겹치면 번호)다.
- 화면: 위 막대 [모델 관리](`ModelListModal`)에서 목록(상태·확정본·등록자)을 보고 [열기]·[삭제] 한다. 왼쪽 다이어그램 목록의 오른쪽 단추 메뉴(`DiagramTreeMenu`, shared `ContextMenu` 재사용)에 이름 바꾸기·복사·지우기가 있고 지운 뒤 [되돌리기] 를 제안한다. 새 모델 등록 창(`ModelRegisterModal`)은 칸마다 예시(`mcm`·`mcm`·`MCMAPUSER`·`MCM 스키마`)를 보이고, 모듈은 모델 ID 를 따라가며(직접 고치면 멈춤), 스키마는 `SCHEMAS` 목록에서 고른다.
- 모델 상태 글: 생성·사용 중·사용 중지(모델 STATUS).

### 9.3 모델 완전 삭제

- `delete kind=MODEL`(kind 없음 = 기존 DRAFT 삭제). 모델 행을 잠근 뒤 `_CLAIM`·`_EDITOR`·`_CMD_LOG`·`_DIAGRAM_ROUTE`·`_DIAGRAM_NODE`·`_DIAGRAM`·`_MODEL_VER`·`_MODEL` 순으로 지운다.
- 구독자에게 알린다. 새로 읽으면 `ERD_MODEL_NOT_FOUND`(MDM029)다. 화면은 알림 뒤 시작 화면으로 간다. 끊긴 연결은 `viewStatus` 로 확인해 MDM029 면 재연결을 멈춘다.
- 완전 삭제이고 되돌리기가 없다. 화면 확인 창에서 모델 ID 를 입력해야 [삭제] 가 켜진다.
- 권한: 관리자(역할 `MDM_STD_ADMIN` 또는 `SYSADMIN`)는 확정본 유무와 무관하게 지운다. 비관리자는 DRAFT 소유자(`_VER.OWNER_ID`)이고 RELEASED·REQUESTED·APPROVED 버전이 하나도 없을 때만 지운다. 그 밖은 거절한다. 거절 코드: MDM016(DRAFT 없음, 관리자만)·MDM003(소유자 아님·확정류 있음)·MDM029(모델 없음)·MDM001(다시 시도). 문구는 서버 `meta.message` 를 그대로 보인다.
- MCP 에는 모델 삭제를 넣지 않았다(CLI `delete-model --yes` 만).
- 알려진 한계(deferred 135·136): 지운 모델을 다시 등록하면 rev 가 메모리 한정으로 이어진다. SCHEMAS 범위는 `ALL_USERS` 전체다(MDM 서버 계정이 볼 수 있는 모든 사용자).

### 9.4 캔버스 편집(화면)

- 사전에 없는 단어(`***`) 표시: 순수 함수 `placeholder-name.ts` 가 `{display, reconstructed, unknownWords}` 를 만든다. 자리 맞춤은 논리명에 `***` 가 있고 논리명 단어 수와 물리명 `_` 토막 수가 같을 때다(예: `EXCEL_TP` 「*** 구분」 → 「EXCEL 구분」). 맞지 않으면 `display = reconstructed`, `unknownWords = []`, 툴팁에 물리명 전체. 저장 값과 「사전 없음」 위반은 바뀌지 않는다.
  - 컬럼 그리드(속성 패널 안 그리드 포함): 칸 순서 = 논리명(`display`, 채운 단어는 기울임·회색, 툴팁 「사전에 없는 단어」) | 사전 재구성(`reconstructed`, 읽기 전용) | 물리명 | …. 편집기는 저장 값(`***` 포함)으로 시작한다.
  - 캔버스 표 노드: `display` 만(추가 칸 없음).
- PK 맨 위: 표 노드 컬럼 행은 PK 가 먼저(안정 분할)이고 구분선은 `.erd-col[data-sep]` inset box-shadow 다(높이 안 바뀜). 손잡이 id 는 그대로다.
- 그 자리 편집: 표 이름·컬럼 줄 두 번 누르기 또는 `F2`(shortcut `rename`). `data-field`(logical|phys)·`data-col` 속성으로 대상을 판정하고 `InlineEdit` 를 `decorateNodes` 가 `data.inline` 으로 싣는다. Enter·밖 누르기 = 저장, Esc = 그만. 물리명은 대문자로 저장하고 틀린 값은 입력을 유지한다(빨간 테두리). 개요 단계의 `F2` 는 「확대」 안내만 한다.
- Space 속성 창(`PropsWindow`): 고른 표 하나. `propsCommands(model, base, draft, newKeyId)` 의 base 는 열 때의 초안이다. 판정은 `rights.model`. [적용] 한 번이 한 묶음이다. 순서는 표 → 컬럼(도메인 붙일 때 `applyDomain`) → `setPrimaryKey` → 키(지우기·고치기·더하기) → 관계(지우기·고치기·확정/기각). 연 뒤 남이 바꾼 칸은 그대로 두고, 내가 고친 칸을 남도 바꿨으면 「다시 여세요」 다. 바깥 누르기로 닫히지 않는다. 캔버스 Space 끌어 이동(`panActivationKeyCode`)은 없앴다(`null`).
- 표 복사·붙여넣기: `ErdClip`(`ErdTablesClip`|`ErdColumnsClip`) 공용 클립보드(`erd-clipboard.ts`, 화면 메모리 한 칸, 같은 모델 안). 붙이기는 `addTable audit:false` + 컬럼 전부 거꾸로 position 0, `setPrimaryKey`(이름 지정)·`addKey`, 고른 표끼리의 확정·DB 관계(pairs 빈 것 제외, dbFk 원래 값, REUSE), cardinality 가 다르면 `updateRelation`, `placeTables` 로 한 묶음(되돌리기 1번)이다. 이름은 `<원래>_COPY`(겹치면 `_COPY2`…)·「… 복사」다.
- 컬럼 복사(`state/column-clip.ts`): 그리드에서 고른 한 행의 값만 담고(키·관계 없음) `addColumn` 한 묶음으로 붙인다. 같은 물리명이 있으면 `_COPY`·「… 복사」, 자리는 고른 컬럼 바로 뒤다.
- 입력 칸 모드(`GridInputBar`): [추가]·[이름 바꾸기]. 컬럼을 고르면 이름 바꾸기가 기본이고 다른 컬럼으로 옮기면 다시 기본이다. `Ctrl/⌘+Enter` 는 추가 모드로 바꾼다. 입력 칸 `Enter` 는 지금 모드의 동작이다.

### 9.5 버전 숨기기와 DRAFT 자동 만들기

- 확정본(RELEASED)을 보고 있고 새 버전을 만들 수 있으면(`autoDraftEligible`) 첫 편집 때 화면이 `copy MINOR` 로 DRAFT 를 만든 뒤 변경을 적용한다. 만들 때 서버가 막으면 그 거절을 그대로 보인다. 소유자 판정은 내 DRAFT 가 된다.
- 위 막대에는 DRAFT 일 때 [기준본으로 저장](= 확정) 단추 하나만 둔다. 이력·새 버전·선점·공동 편집자는 [버전 ▾] 안에 있다.
- 알려진 한계(deferred 137): `import`(`FROM_DB`)·`APPLY_DIFF` 는 `ctx.apply` 가 아닌 exclusive 경로라 자동 DRAFT 를 타지 않는다.

### 9.6 처음 둘러보기

- shared 새 부품 `tour`(`@dk-oasis/shared/tour`, `components/tour/**`)를 쓴다. `Tour` 는 비모달이고 강조 층은 `pointer-events: none` 이다. 닫기 결과 `finish`·`skip` 과 「다시 보지 않기」 값(`neverShow`)을 `onClose` 로 넘기고 저장은 화면이 정한다.
- 4단계: 모델 고르기(`.erd-bar__models`) → 표 추가(`erd-tool-table`) → 관계 긋기(`erd-tool-relmenu`) → Space 속성 창(가운데 놓음). 대상이 없으면 가운데에 보인다.
- 모델을 읽은 뒤 `prefs.tourSeen` 이 false 면 저절로 열린다. [완료]·「다시 보지 않기」 는 `tourSeen` 을 저장하고, [건너뛰기]·`Esc` 는 이번 세션만 닫는다. 위 막대 [둘러보기] 로 다시 본다.

### 9.7 CLI·MCP

- CLI `scripts/erd/erd-cli.mjs` 새 명령:

| 명령 | 하는 일 | 서버 호출 |
|---|---|---|
| `models` | 모델 목록(상태·확정본 버전·만든 사람 포함) | `search` |
| `diagrams --model M` | 다이어그램 목록(id·업무영역/이름·표 수·꺾임점 수) | `view` |
| `diagram-rename`·`diagram-delete`·`diagram-copy` | 다이어그램 이름 바꾸기·지우기·복사(`--base-rev` 필수, 기본은 시험 실행) | `save` |
| `register --module --schema --name [--model]` | 모델 등록 | `reg` |
| `import --model [--base-rev]` | 표가 없는 모델에 DB 첫 가져오기 | `import kind=FROM_DB` |
| `delete-model --model --yes` | 모델 완전 삭제 | `delete kind=MODEL` |

  - `register`·`import` 는 서버에 시험 실행이 없다. `--apply` 가 없으면 서버에 보내지 않고 읽기(`search`·`view`)로 겹침·표 유무만 확인해 "시험 실행: 서버에 보내지 않음" 을 낸다. 거절될 것이면 종료 1, 아니면 0(서버 검사를 통과했다는 뜻은 아니다).
  - `delete-model` 은 `--yes` 와 사용자(`--user`·`ERD_USER`)가 모두 있어야 보낸다.
  - `text --diagram` 은 관계 꺾임점을 Ref 줄 아래 `  via (x,y) → (x,y)` 로 붙인다.
  - 꺾임점 명령 `setRoute`·`clearRoutes`·`copyDiagram` 은 묶음 파일의 `commands` 에 넣는다. 같은 묶음에서 `addRelation` 으로 만든 관계도 글로 가리킬 수 있다.
- MCP `scripts/erd/erd-mcp.mjs` 새 도구 4개(도구 16개):
  - `listModels`: 모델 목록(ID·모듈·스키마·이름·rev·DRAFT 버전·소유자·상태·최신 확정본·만든 사람). 확정 칸이 `확정 없음` 이면 확정본이 없고 `확인 불가` 면 서버가 칸을 주지 않은 것이다.
  - `listDiagrams{modelId}`: 다이어그램 목록(id·업무영역/이름·표 수·꺾임점 수).
  - `registerModel{moduleId, schemaName, modelName, modelId?}`: 시험 실행 없음. 사용자가 등록을 요청했을 때만 부른다.
  - `importModel{modelId, baseRev?}`: 첫 가져오기(`FROM_DB`). 시험 실행 없음. `baseRev` 를 빼면 지금 rev 를 읽어 쓴다.
  - `getCurrentView`·`getModelText(diagram)` 는 그 다이어그램의 꺾임점을 덧붙인다.
  - 모델 삭제 도구는 없다.
