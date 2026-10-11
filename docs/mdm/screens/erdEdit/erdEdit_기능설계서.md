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
