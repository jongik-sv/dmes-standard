# 화면 키 컬럼 사전 분류표 (C1, 2026-10-05)

m-mcm·m-mls·m-mdm 화면이 MDM 메타(머리글 툴팁)를 찾는 키를 모아, 지금 mcm 메타에서 찾히는지 확인하고 키마다 처리 방법을 정한 표다.
기계가 읽는 정본은 같은 폴더의 `classification.json`·`classification.csv` 이고, 이 문서의 표는 그 JSON 에서 만들었다.

## 1. 요약

| 분류 | 행 수 | 처리 |
|---|---:|---|
| 사전에 있음 (EXIST) | 45 | 그대로 둔다 |
| 사전에 있음 — MDM 별칭 (MDM) | 67 | 등록하지 않는다. C1b(mcm 조회 시스템 코드 `MES,MDM`) 뒤 hit 된다 |
| 새 표준 컬럼 등록 (NEW) | 70 | 표준 컬럼 60개를 새로 만들고, 화면 키가 표준 물리명과 다르면 같은 save 에 MES 별칭으로 넣는다(별칭 60개). WIDGET_ID 는 용어 「위젯」 을 먼저 등록한다 |
| MES 별칭 등록 (ALIAS) | 10 | 같은 뜻의 기존 표준 컬럼 10개에 MES 별칭을 더한다 |
| 표시용 (DISPLAY) | 32 | 화면에서 `meta="표준 물리명"` 으로 원 컬럼에 연결한다(등록 없음) |
| 화면 예외 (OFF) | 3 | 뜻이 다르거나 한 라벨에 여러 키가 묶여 화면에서 `meta={false}` 로 끈다(DATA_SRC·LABEL_LONG·LINE_NO) |
| 범용 키 (GENERIC) | 104 | 화면에서 `meta={false}` 로 끈다(사전에 새로 넣지 않는다) |
| UI 전용 (UI) | 143 | 등록하지 않는다(화면이 모든 위치에서 이미 meta=false 로 둔 칸 포함) |
| 합계 | 474 | 화면 키의 물리명 기준. 그중 메타를 요청하는 키는 416개다(나머지는 화면이 모든 위치에서 meta=false) |

- 등록 전 기준(dev d1028256 을 합친 뒤): 메타를 요청하는 물리명 416개 중 mcm 메타 hit 61, missing 355, unavailable 0(`scripts/mdm-meta/check-meta.sh`, 2026-10-05 로컬). 합치기 전(e00a3c7c)에는 417개 중 hit 62 였다.
- 조정자 실측(메뉴 관리 화면 키 18개 중 5개 hit)은 같은 결과로 재현된다. 이 표의 메뉴 관리 키는 검색 조건·상세 칸까지 넣어 24개다.
- 등록과 C1b 가 끝나면 NEW·ALIAS 80행과 MDM 67행(합 147)이 hit 으로 바뀌어야 한다. 범용 키 중 지금 hit 인 15개는 화면이 meta 를 끄면 요청에서 빠진다.
- dev 를 합친 뒤(화면 레인의 th → MdmFieldLabel·meta=false 반영) 다시 만들었다. 새 키 REFRESH_SEC(신규)·BIZ_RULE(MDM 별칭)·STD_RULE(사전에 있음)이 생겼고, 화면이 모든 위치에서 끈 키는 UI 전용으로 둔다(DATA_SRC·LABEL_LONG 등).
- 2026-10-05 조정자 결정(지시 mdm-column-dict-2)을 반영했다: MDM 별칭 키는 MES 별칭으로 겹쳐 넣지 않는다, WIDGET_ID 는 용어를 등록해 신규로 넣는다, TITLE 은 사전에 있음으로 둔다.

## 2. 방법

### 2.1 키 수집 — `scripts/mdm-meta/collect-keys.mjs`

- 대상: `m-mcm/page-components`·`m-mcm/widget-types`·`m-mls/pages`·`m-mdm/pages`·`m-mdm/src`(시험 파일 제외).
- 그리드 열: `{ key, header }` 객체의 `key`, 같은 객체의 `meta`(문자열이면 그 이름, `false` 면 제외).
- `FormGroup`·`MdmFieldLabel` 의 `name`·`meta`. 화면 레인이 상세 `<th>` 를 `MdmFieldLabel` 로 바꾼 뒤(dev d1028256)에는 대부분 이 규칙으로 잡힌다. `name={상수}` 처럼 상수로 준 이름은 잡지 못한다(`NoticeTitleRow.tsx` 의 `TITLE` 은 다른 칸에서 잡힌다).
- 화면이 `meta={false}` 로 끈 위치도 그 키의 행에 묶고, 몇 곳을 껐는지 근거 칸에 적는다. 모든 위치를 끈 키는 메타 요청에 들어가지 않는다.
- `SearchField` 의 `name`, 없으면 `value={filters.pX}` 바인딩에서 `p` 접두어를 뗀 이름.
- 상세 표 `<th>`: 다음 8줄 안에서 처음 바인딩한 데이터 키(`item.X`·`row.X`·`closed("X")` 등). 바인딩이 없는 정적 칸은 키 없이 빠진다.
- 물리명 변환은 shared `mdm-meta/names.ts`·cactus `MdmNames.toPhysName` 과 같은 규칙이다(camelCase → UPPER_SNAKE).

### 2.2 메타 확인 — mcm 8100 직접 호출

- 포털 5100 은 로그인 쿠키가 필요해 BE 를 직접 부른다. `POST http://localhost:8100/api/mcm/mdmMeta/columns`, 헤더 `X-Client-Key`(로컬 기본 `dmes-bff-local-client-key-2026`), `X-Authenticated-User`, `X-Authenticated-Role: USER`.
- 주의: `src/frontend/m-mcm/.env` 의 `BACKEND_CLIENT_KEY` 는 지금 실행 중인 mcm(local 프로필, application.yml 고정값)과 맞지 않아 A001 이 난다. 로컬 기본값을 쓴다.
- mcm 은 `cactus.mdm.system-code: MES` 하나로 별칭을 찾는다(`MdmMetaClient` 가 `params.systemCode` 하나만 싣는다). 그래서 **MDM·APS 시스템 별칭만 있는 키는 missing** 이다.

### 2.3 판정 근거 — MDM `columnMng/compare`(읽기 전용)

- `POST http://localhost:8096/api/mdm/oasis/columnMng/compare` 를 REVERSE(화면 키 → 용어)·FORWARD(한국어 논리명 → 표준 물리명)로 불렀다. 응답의 토큰별 용어·의미 번호, 추천 도메인, 중복(논리명·물리명·시스템 별칭)을 근거로 쓴다.
- REVERSE 는 약어마다 첫 의미만 고른다(예: ROLE→직무, MN→망간). 그래서 신규 컬럼은 한국어 논리명을 정해 FORWARD 로 다시 분해했고, 등록 자료의 `termIds` 도 FORWARD 결과다.
- 중복 방지: FORWARD 중복(같은 논리명·물리명) 외에, 사전 스냅숏에서 **용어 집합이 같은 기존 컬럼**(구분↔유형 동의어 포함)을 찾아 있으면 별칭으로 돌렸다(예: MENU_TP → MENU_KND, PIN_YN → FIX_YN, STARTED_AT → STR_DH).
- 실제 DB 컬럼 근거: 로컬 SQLite(`mcm.db`·`mdm.db`·`mls.db`) 의 테이블 구조를 읽기 전용으로 읽었다.
- 유사어(KURE) 검사(2026-10-05, 읽기 전용): (1) 용어 `SYNONYMS` 로 묶음을 넓히고(구분↔유형 포함) 신규 표준 컬럼 60개의 용어 집합을 기존 컬럼과 다시 대조했다 — 같은 뜻 기존 컬럼 0건(WIDGET_ID 는 새 용어라 제외). (2) 사전에 없어 다른 용어로 바꾼 원래 단어(역할·게시·본문·다중·열람·부제·새로고침·위젯)를 `termMng/compare`(1차 문자열 + 2차 임베딩 추천)로 불렀다 — 같은 뜻 기존 용어는 없었다(예: 새로고침 → 개편 0.75·대보수 0.68, 위젯 → W-BEAD 0.56). 그래서 대체 분해(역할→직무 등)를 유지한다.

## 3. 판정 규칙

1. **범용 키**: 수식어 없는 한 단어 키는 화면마다 뜻이 달라 사전 설명이 오해를 부른다. 사전에 있어도(hit 16개 포함) `meta={false}` 로 끈다. 명시 목록:
   `NAME KEY CODE STATUS TYPE KIND VALUE VAL LABEL ITEM RESULT ID NO SEQ TEXT NOTE MESSAGE STATE MODE LEVEL ORDER PATH FORMAT COUNT TOTAL DETAIL MEMO TARGET SOURCE MODULE TABLE ROW FIELD HEADER POSITION DIRECTION WIDTH LENGTH SETTING CONDITION EXPR ACTION SORT CHANGE BEFORE AFTER LEFT RIGHT RANGE DOMAIN DISPLAY LABELS VARS USERS ISSUES ACT ACTUAL EXPECT EXPECTED DESCRIPTION DESC OP BY ZONE CHECK CHECKED CHK USE OPEN DEL DELETE PIN CONFIRM SAME NA IMPACT HIT MARK SENT SPARK SURFACE ABSENT FIRST_FALSE EVALUATED Q KEYWORD VER PARAM SERVICE`
   - 범용 키에서 파생된 표시 키(`KIND_LABEL`·`VER_TEXT`·`TYPE_BADGE` 등)도 범용으로 본다.
   - 예외로 뜻이 고정된 한 단어(ENCODING·EMAIL·CONTEXT·DIMENSION·FACTOR·OFFSET·REQUIRED·DEFINITION·SYSTEMS·TRANSFORM)는 범용으로 보지 않는다.
   - `TITLE` 은 범용에서 뺀다. 공지·위젯 제목이 사전 TITLE(제목)과 뜻이 같아 「사전에 있음」 으로 둔다(m-mls `NoticeTitleRow` 의 `MdmFieldLabel` 유지, 조정자 결정).
   - hit 이지만 뜻이 다른 `LINE_NO`(사전: 생산 라인 번호, 화면: CSV 줄 번호)는 「화면 예외」 로 `meta={false}` 를 둔다.
   - 「화면 예외」(조정자 지시 mdm-column-dict-3): 화면 레인이 끈 칸 중 사전 판정과 엇갈리는 것이다. `DATA_SRC`(위젯 「실행 모듈」, 사전은 데이터 출처)·`LABEL_LONG`(표시명 긴/중간/짧은 입력 3개 묶음)을 이 분류로 둔다. `LAYOUT_ID`(폼의 「ID / 버전」 묶음 라벨 2곳)·`COLUMN_PHYS`(ColumnInfoPopover 가 있는 칸 1곳)는 그리드에서 계속 메타를 찾으므로 분류는 그대로 두고 예외 위치를 근거에 적었다.
2. **UI 전용**: 밑줄로 시작하는 키, 실제 DB 컬럼이 없고 화면이 계산하거나 서버 응답에만 있는 값(캐시 상태·건수·비교 결과·이전/이후 값 등).
3. **표시용**: `*_LABEL`·`*_TEXT`·`*_NM`(SQL 계산 이름)·검색 조건 키(`CBO_*`·`EDT_*`·`FILTER_*`)처럼 원 컬럼이 따로 있는 키. 화면에서 `meta` 에 표준 물리명을 적는다. 신규 컬럼을 가리키는 행은 등록 뒤에 연결된다.
   - `OBJ_NM` 은 지금 hit 이지만 사전 OBJ_NM 은 「목적 명」(목적지)이라 뜻이 다르다. `meta="OBJECT_NM"` 으로 바로잡는다.
   - `CODE_VAL`(→ CD_V)·`COL_ID`(→ COLUMN_ID)는 같은 뜻의 표준 컬럼이 있지만, 두 컬럼에 MDM(자기 시스템, `SELF_YN='Y'`) 매핑이 있어 `columnMng` save 로 별칭을 더할 수 없다(서버가 그 매핑을 「쓸 수 없는 시스템」 으로 거부하고, 빼고 보내면 차분 저장이 지운다). 그래서 화면 meta 로 연결한다.
4. **사전에 있음 — MDM 별칭**: MDM 시스템 별칭이 이미 표준 컬럼을 가리키는 키(67건 — m-mdm 키 66건과 SYSTEM_CODE). MES 에 없는 필드를 MES 별칭으로 넣으면 사전 뜻이 틀어지므로 등록하지 않는다. C1b 로 mcm 이 `MES,MDM` 순서로 별칭을 찾게 되면 hit 한다.
5. **MES 별칭**: MES 필드이고 같은 뜻의 표준 컬럼이 있으면 새 컬럼을 만들지 않고 화면 키를 MES 별칭으로 붙인다. 근거는 용어 집합이 같은 표준 컬럼이다(mcm·mls 키 10건, 예: CODE_ID → CD_TP_ID, MENU_TP → MENU_KND).
6. **새 표준 컬럼**: 실제 DB 컬럼이고, 같은 뜻의 표준 컬럼이 없고, 논리명이 용어로 모두 분해되는 키. 표준 물리명은 FORWARD 분해 결과(약어)를 쓰고, 화면 키와 다르면 같은 save 의 `systems` 에 MES 별칭을 넣는다.
   - 숫자 접미 키(`CODE_VAL_REF1~5`·`MASTER_CODE_REF1~5`·`MENU_PARAM1~3`)는 숫자가 토큰이 될 수 없어 표준 컬럼 하나에 별칭 여러 개를 단다(별칭 PK 가 컬럼·시스템·이름이라 허용된다).
   - 사전에 없는 용어는 있는 용어로 바꿔 분해했다: 역할→직무(용어 정의 「사용자의 업무 역할(Role)」), 게시→공지, 본문→내용, 다중→복수, 열람→조회, 부제→보조 제목.
   - 대체할 용어가 없는 `WIDGET_ID` 는 용어 「위젯」(약어 WIDGET)을 먼저 등록하고 `WIDGET_ID`(위젯 아이디)를 만든다(조정자 결정).
   - 도메인은 FORWARD 추천값을 넣고, 추천이 없으면 비운다(도메인은 필수가 아니다, D-141).

## 4. 조정자 결정(지시 mdm-column-dict-2)

1. MDM 별칭 66건(+SYSTEM_CODE): MES 별칭으로 겹쳐 넣지 않는다. mdm 메타 피드가 쉼표로 이은 시스템 코드 목록을 받게 하고 mcm 을 `MES,MDM` 으로 바꾼다(C1b).
2. WIDGET_ID: 보류하지 않는다. 용어 「위젯」 등록 + 신규 컬럼을 C2 등록 묶음에 넣는다(용어 → 컬럼 순서).
3. 뜻이 어긋난 hit 2건(`OBJ_NM`·`LINE_NO`)은 이 표대로 화면 meta 로 처리한다. 사전 쪽은 고치지 않는다.
4. TITLE 은 「사전에 있음」 으로 옮긴다.
5. 참고 — 리뷰 지적으로 `CODE_VAL`·`COL_ID` 를 MES 별칭에서 표시용으로 옮겼다(§3 의 3).
6. 참고 — CODE_ID·CODE_DESC → CD_TP_ID·CD_TP_DESC: `TB_MCM_CODE_MASTER` 가 사전의 「코드 구분」 군(CD_TP_CHARACTER·CD_TP_VER·CD_TP_OWNER_EMP_NO)과 같은 구성이라 별칭으로 붙였다. 같은 테이블의 `CODE_NM` 은 「코드 구분 명」 이 없어 CD_TP_NM 을 새로 만든다.

## 5. 다시 만들기

```bash
node scripts/mdm-meta/collect-keys.mjs --json /tmp/hits.json     # 화면 키(위치 포함)
node scripts/mdm-meta/collect-keys.mjs --names > /tmp/names.txt  # 물리명 목록
scripts/mdm-meta/check-meta.sh --names /tmp/names.txt --list     # 지금 hit·missing
```

판정 덮어쓰기(별칭 대상·논리명)는 사람이 정한 값이라 스크립트로 다시 만들지 않는다. 화면 키가 바뀌면 위 두 명령으로 새 키를 찾고 이 표에 행을 더한다.

## 6. 분류별 목록

### 범용 키 — 화면에서 `meta={false}` (104)

| 키 | 모듈 | 머리글 | 근거 | 첫 위치 |
|---|---|---|---|---|
| ABSENT | m-mcm | 값 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:119 |
| ACT | m-mdm |  | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx:115 |
| ACTION | m-mdm | 처리 / 동작 | 사전 hit(ACTION)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/columnMng/page.tsx:438 |
| ACTUAL | m-mdm | 실제 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx:80 |
| AFTER | m-mdm | 이후 / 지금 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:19 |
| BEFORE | m-mdm | 이전 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:18 |
| BY | m-mdm | 만드는 룰 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/cards/SetIoTables.tsx:97 |
| CHANGE | m-mdm | 변경 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/VersionPanel.tsx:38 |
| CHECK | m-mdm | 검사 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:515 |
| CHECKED | m-mdm | 고름 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/cards/BoundaryCaseModal.tsx:110 |
| CHK | m-mcm | 선택 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/cma/masterCodeMng/page.tsx:183 |
| CODE | m-mdm | 규칙 / 코드 / 키 | 사전 hit(CD@MES)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:11 |
| CONDITION | m-mdm | 거부 조건 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/LayoutCheckPanel.tsx:19 |
| CONFIRM | m-mdm |  | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/termMng/TermDetailPane.tsx:153 |
| COUNT | m-mdm | 건수 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:12 |
| DEL | m-mdm | 삭제 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:517 |
| DELETE | m-mdm |  | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainTestCaseGrid.tsx:49 |
| DESCRIPTION | m-mcm,m-mdm | 설명 / 정의 | 사전 hit(DESC@MES)이지만 화면마다 뜻이 다른 범용 키 (화면 14/18 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:158 |
| DETAIL | m-mdm | 내용 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:13 |
| DIRECTION | m-mdm | 방향 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:20 |
| DISPLAY | m-mdm | 환산값 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/unitMng/ConvertCalculator.tsx:24 |
| DOMAIN | m-mdm | 도메인 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/columnMng/page.tsx:73 |
| EVALUATED | m-mdm | 평가 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:75 |
| EXPECT | m-mdm | 기대 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:20 |
| EXPECTED | m-mdm | 기대 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TestCasePanel.tsx:79 |
| EXPR | m-mdm | 식 / 결과 식 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:96 |
| FIELD | m-mcm,m-mdm | 필드 | 화면마다 뜻이 다른 범용 키 | m-mcm/widget-types/query-chart/editor.tsx:28 |
| FIRST_FALSE | m-mdm | 처음 거짓 열 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:77 |
| FORMAT | m-mcm | 값 형식 / 형식 | 화면마다 뜻이 다른 범용 키 (화면 1/2 위치는 이미 meta=false) | m-mcm/widget-types/query-number/editor.tsx:95 |
| HEADER | m-mcm | 머리글 | 화면마다 뜻이 다른 범용 키 | m-mcm/widget-types/query-table/editor.tsx:45 |
| HIT | m-mdm | 적중 | 사전 hit(HIT)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:76 |
| ID | m-mcm | ID | 화면마다 뜻이 다른 범용 키 (화면 2/2 위치는 이미 meta=false) | m-mcm/page-components/csa/commObjMng/page.tsx:714 |
| IMPACT | m-mdm | 영향 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/ImpactPanel.tsx:23 |
| ISSUES | m-mdm | 문제 / 상세 / 오류 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutConfirm/page.tsx:60 |
| ITEM | m-mdm | 항목 / 검사 | 사전 hit(ITEM)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/ConstEditModal.tsx:25 |
| KEY | m-mcm,m-mdm | 키 / 노드·선 | 사전 hit(KEY)이지만 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:110 |
| KEYWORD | m-mcm,m-mdm | 검색 / 검색어 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:395 |
| KIND | m-mcm,m-mdm | 구분 / 변경 | 사전 hit(KND@MES)이지만 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:55 |
| LABEL | m-mcm,m-mdm | 배치 / 통화 / 이름(범례) | 화면마다 뜻이 다른 범용 키 (화면 3/8 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/LayoutTab.tsx:74 |
| LABELS | m-mdm | 표시명(긴/중간/짧은) | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/columnMng/page.tsx:72 |
| LEFT | m-mdm | 하한 / 값 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:101 |
| LENGTH | m-mdm | 길이 / 소수 자리 / 타입·길이 / 길이 | 사전 hit(LENGTH)이지만 화면마다 뜻이 다른 범용 키 (화면 1/4 위치는 이미 meta=false) | m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:97 |
| LEVEL | m-mdm | 수준 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:12 |
| MARK | m-mdm | 상태 / 마지막 결과 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmc/codeItemEdit/cate/CategoryTab.tsx:166 |
| MEMO | m-mdm | 메모 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainTestCaseGrid.tsx:43 |
| MESSAGE | m-mdm | 메시지 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:14 |
| MODE | m-mdm | 전환 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/VersionPanel.tsx:40 |
| MODULE | m-mcm | 모듈 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:72 |
| NA | m-mdm | 무관 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:106 |
| NAME | m-mdm | 항목 / 이름 / 변수 | 사전 hit(NM@MES)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/SampleMessagePanel.tsx:22 |
| NO | m-mcm,m-mdm | 순번 / NO / # | 사전 hit(NO)이지만 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/cmb/masterRuleFrame/constants.ts:36 |
| NOTE | m-mdm | note / 설명 / 행 설명 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:306 |
| OP | m-mdm | OP | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:100 |
| OPEN | m-mdm | 상태 / 열림 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmd/dataItemMng/columns.tsx:44 |
| ORDER | m-mdm | 순서 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/sections/columns/column-grid.tsx:348 |
| PARAM | m-mcm | PARAM / 파라메터 | TB_MCM_SEC_OBJ.PARAM — 한 단어 범용 키(사전 PARAMETER 가 있으나 화면마다 뜻이 다를 수 있음) (화면 1/3 위치는 이미 meta=false) | m-mcm/page-components/csa/commMenuMng/page.tsx:327 |
| PATH | m-mdm | 경로 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmc/codeItemEdit/components/PreviewPanel.tsx:54 |
| PIN | m-mdm |  | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/VariablePanel.tsx:91 |
| POSITION | m-mdm | 위치 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/HeaderStackGrid.tsx:57 |
| Q | m-mcm | 키 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:453 |
| RANGE | m-mdm | 적용 구간 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleMng/RuleDetailPanel.tsx:93 |
| RESULT | m-mdm | 결과 / 실행 결과 / 결과(${resultLabel}) | 사전 hit(RST@MES)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:21 |
| RIGHT | m-mdm | 상한 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:102 |
| ROW | m-mdm | 행 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/TraceDetail.tsx:74 |
| SAME | m-mdm | 같음/다름 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/debugger/RunCompare.tsx:27 |
| SENT | m-mdm | 키 보냄 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/cards/ValueTestCard.tsx:70 |
| SEQ | m-mcm,m-mdm | 순번 / 순서 | 사전 hit(SEQUENCE_NO@MES)이지만 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/cmb/masterRuleData/page.tsx:87 |
| SERVICE | m-mcm | SERVICE | TB_MCM_SEC_OBJ.SERVICE — 한 단어 범용 키 (화면 1/4 위치는 이미 meta=false) | m-mcm/page-components/csa/commMenuMng/page.tsx:326 |
| SETTING | m-mdm | 설정 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/BodyItemGrid.tsx:19 |
| SORT | m-mcm | 정렬 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:454 |
| SOURCE | m-mdm | 원천 / 출처 | 화면마다 뜻이 다른 범용 키 (화면 4/5 위치는 이미 meta=false) | m-mdm/pages/dmc/codeMng/CodeRegisterForm.tsx:73 |
| SPARK | m-mcm | 추이 | 화면마다 뜻이 다른 범용 키 | m-mcm/widget-types/exchange/renderer.tsx:49 |
| STATE | m-mcm,m-mdm | 상태 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:74 |
| STATUS | m-mcm,m-mdm | 상태 / 결과 | 사전 hit(STS@MES)이지만 화면마다 뜻이 다른 범용 키 (화면 2/16 위치는 이미 meta=false) | m-mcm/page-components/cma/masterCodeMng/page.tsx:199 |
| SURFACE | m-mdm | 토큰 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/columnMng/page.tsx:434 |
| TABLE | m-mdm | 테이블 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmc/codeConfirm/page.tsx:96 |
| TARGET | m-mdm | 영향도 대상 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainImpactPanel.tsx:11 |
| TEXT | m-mdm | 값 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/SampleMessagePanel.tsx:24 |
| TOTAL | m-mcm | 항목 수 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:85 |
| TYPE | m-mcm,m-mdm | 대상 / 대상 종류 / 타입 | 화면마다 뜻이 다른 범용 키 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:109 |
| USE | m-mdm | 선택 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/termRegPop/termRegPop.tsx:177 |
| USERS | m-mdm | 읽는 룰 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleSetEdit/cards/SetIoTables.tsx:77 |
| VAL | m-mdm | 값 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:96 |
| VALUE | m-mdm | 입력 / 이 전문의 값 / 값 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainCheckList.tsx:19 |
| VARS | m-mdm | 변수(JSON) | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dma/domainMng/components/DomainTestCaseGrid.tsx:42 |
| VER | m-mdm | 버전 | 사전 hit(VER)이지만 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/headerMng/components/HeaderUsagePanel.tsx:19 |
| WIDTH | m-mcm | 폭 | 화면마다 뜻이 다른 범용 키 | m-mcm/widget-types/query-table/editor.tsx:46 |
| ZONE | m-mdm | 구역 | 화면마다 뜻이 다른 범용 키 | m-mdm/pages/dmb/layoutMng/components/SampleMessagePanel.tsx:21 |
| CHECK_TEXT | m-mdm | 세트 검사 | 표시용 파생 키(원 컬럼 CHECK) | m-mdm/pages/dme/ruleSetMng/columns.tsx:53 |
| DETAIL_TEXT | m-mdm | 상세 | 표시용 파생 키(원 컬럼 DETAIL) | m-mdm/pages/dme/ruleConfirm/page.tsx:103 |
| FORMAT_LABEL | m-mls | 형식 | 표시용 파생 키(원 컬럼 FORMAT) (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:61 |
| KIND_LABEL | m-mdm | 변경 | 표시용 파생 키(원 컬럼 KIND) | m-mdm/pages/dme/ruleConfirm/page.tsx:115 |
| KIND_TEXT | m-mdm | 종류 | 표시용 파생 키(원 컬럼 KIND) | m-mdm/pages/dmb/layoutConfirm/page.tsx:48 |
| LENGTH_TEXT | m-mdm | 총 길이(전 → 후) | 표시용 파생 키(원 컬럼 LENGTH) | m-mdm/pages/dmb/layoutConfirm/page.tsx:59 |
| PIN_LABEL | m-mls | 고정 | 표시용 파생 키(원 컬럼 PIN) (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:99 |
| RESULT_TEXT | m-mdm | 결과 | 표시용 파생 키(원 컬럼 RESULT) | m-mdm/pages/dma/domainMng/components/DomainTestCaseGrid.tsx:45 |
| SEQ_TEXT | m-mdm | 순서 | 표시용 파생 키(원 컬럼 SEQ) | m-mdm/pages/dme/ruleConfirm/page.tsx:116 |
| STATUS_LABEL | m-mls | 게시상태 | 표시용 파생 키(원 컬럼 STATUS) (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:71 |
| TARGET_LABEL | m-mls | 대상 | 표시용 파생 키(원 컬럼 TARGET) (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:108 |
| TYPE_BADGE | m-mdm | 타입 | 표시용 파생 키(원 컬럼 TYPE) | m-mdm/pages/dme/ruleEdit/cards/ValueTestCard.tsx:61 |
| TYPE_TITLE | m-mcm | 유형 | 표시용 파생 키(원 컬럼 TYPE) | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:68 |
| VALUE_TEXT | m-mdm | 값 | 표시용 파생 키(원 컬럼 VALUE) (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/unitMng/ConvertCalculator.tsx:102 |
| VER_LABEL | m-mdm | 버전 | 표시용 파생 키(원 컬럼 VER) | m-mdm/pages/dmc/codeConfirm/page.tsx:54 |
| VER_TEXT | m-mdm | 버전 | 표시용 파생 키(원 컬럼 VER) | m-mdm/pages/dmb/layoutConfirm/page.tsx:49 |

### 표시용 — 원 컬럼에 `meta="표준 물리명"` 연결 (32)

| 키 | meta 대상 | 머리글 | 근거 | 첫 위치 |
|---|---|---|---|---|
| EDT_PERMISSION_ID | AUT_ID | PERMISSION ID | 검색 조건 키 | m-mcm/page-components/csa/commPermMng/page.tsx:566 |
| EDT_PERMISSION_NM | AUT_NM | PERMISSION 명 | 검색 조건 키 | m-mcm/page-components/csa/commPermMng/page.tsx:571 |
| CODE_VAL | CD_V | 코드 값 / 코드값 | TB_MCM_CODE_DETAIL.CODE_VAL — 같은 용어 집합(코드 값). CD_V 에 MDM(자기 시스템) 매핑이 있어 columnMng save 로 MES 별칭을 더할 수 없다 — 화면 meta 로 연결 | m-mcm/page-components/cma/masterCodeMng/page.tsx:215 |
| CODE_VAL_REF1_MN | CD_V_REF | 참조1 | CODE_VAL_REF1 참조값의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:85 |
| CODE_VAL_REF2_MN | CD_V_REF | 참조2 | CODE_VAL_REF2 참조값의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:86 |
| CODE_VAL_REF3_MN | CD_V_REF | 참조3 | CODE_VAL_REF3 참조값의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:87 |
| CODE_VAL_REF4_MN | CD_V_REF | 참조4 | CODE_VAL_REF4 참조값의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:88 |
| CODE_VAL_REF5_MN | CD_V_REF | 참조5 | CODE_VAL_REF5 참조값의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:89 |
| COL_ID | COLUMN_ID | 영문항목명 | TB_MCA_RULE_COL_LIST.COL_ID — 같은 용어 집합(컬럼 아이디). COLUMN_ID 에 MDM(자기 시스템) 매핑이 있어 columnMng save 로 MES 별칭을 더할 수 없다 — 화면 meta 로 연결 | m-mcm/page-components/cmb/masterRuleFrame/constants.ts:38 |
| DIMENSION_LABEL | DIM | 차원 | TB_MDM_UNIT.DIMENSION 의 표시 이름 | m-mdm/pages/dma/unitMng/page.tsx:38 |
| CBO_IN_OUT_EMP_TP | INTL_EXT_EMP_TP | 내부 외부 구분 | 검색 조건 키(내부 외부 사원 구분) | m-mcm/page-components/csa/commUserMng/page.tsx:889 |
| SET_ID | MARU_RULE_SETS_ID | 룰 세트 / 세트 ID | 룰 세트 ID(TB_MDM_RULE_SET.MARU_RULE_SET_ID 의 화면 키) | m-mdm/pages/dme/ruleEdit/cards/RuleUsageCard.tsx:33 |
| SET_NAME | MARU_RULE_SETS_NM | 이름 / 세트명 | 룰 세트 이름(TB_MDM_RULE_SET.MARU_RULE_SET_NAME 의 화면 키) | m-mdm/pages/dme/ruleEdit/cards/RuleUsageCard.tsx:34 |
| EDT_MENU_ID | MENU_ID | 메뉴 ID | 검색 조건 키 | m-mcm/page-components/csa/commMenuMng/page.tsx:1020 |
| EDT_MENU_NM | MENU_NM | 메뉴 명 | 검색 조건 키 | m-mcm/page-components/csa/commMenuMng/page.tsx:1025 |
| MASTER_CODE_REF1_NM | MST_CD_REF | 참조1 | MASTER_CODE_REF1 의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:65 |
| MASTER_CODE_REF2_NM | MST_CD_REF | 참조2 | MASTER_CODE_REF2 의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:66 |
| MASTER_CODE_REF3_NM | MST_CD_REF | 참조3 | MASTER_CODE_REF3 의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:67 |
| MASTER_CODE_REF4_NM | MST_CD_REF | 참조4 | MASTER_CODE_REF4 의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:68 |
| MASTER_CODE_REF5_NM | MST_CD_REF | 참조5 | MASTER_CODE_REF5 의 이름(SQL 계산 칸) | m-mcm/page-components/cme/masterCodeMngList/page.tsx:69 |
| EDT_OBJECT_ID | OBJECT_ID | OBJECT | 검색 조건 키 | m-mcm/page-components/csa/commObjMng/page.tsx:522 |
| OBJ_ID | OBJECT_ID | OBJECT ID | 오브젝트 고르기 팝업의 OBJECT ID | m-mcm/page-components/access-management/ObjectPickerModal.tsx:22 |
| OBJ_NM | OBJECT_NM | 객체명 | 지금 hit(OBJ_NM '목적 명')은 뜻이 다르다 — 오브젝트 명으로 연결 | m-mcm/page-components/access-management/ObjectPickerModal.tsx:23 |
| EDT_ROLE_GROUP_ID | ROLE_GRP_ID | 역할 그룹 ID | 검색 조건 키 | m-mcm/page-components/csa/commRoleGrpMng/page.tsx:716 |
| EDT_ROLE_GROUP_NM | ROLE_GRP_NM | 역할 그룹명 | 검색 조건 키 | m-mcm/page-components/csa/commRoleGrpMng/page.tsx:721 |
| EDT_ROLE_ID | ROLE_ID | 역할 ID | 검색 조건 키 | m-mcm/page-components/csa/commRoleMng/page.tsx:872 |
| EDT_ROLE_NM | ROLE_NM | 역할명 | 검색 조건 키 | m-mcm/page-components/csa/commRoleMng/page.tsx:877 |
| SYNONYMS_TEXT | SYNONYMOUS_LIST | 동의어 | TB_MDM_TERM.SYNONYMS 를 글자로 보인 칸 | m-mdm/pages/dma/termMng/page.tsx:34 |
| SYSTEMS_TEXT | SYS_LIST | 사용 시스템 | TB_MDM_TERM.SYSTEMS 를 글자로 보인 칸 | m-mdm/pages/dma/termMng/TermDetailPane.tsx:37 |
| CBO_USE_TP | USE_TP | 사용 유무 / 사용 여부 | 검색 조건 키(사용 구분) | m-mcm/page-components/csa/commMenuMng/page.tsx:1030 |
| EDT_USER_ID | USER_ID | 사용자 | 검색 조건 키 | m-mcm/page-components/csa/commUserMng/page.tsx:882 |
| FILTER_USER_ID | USER_ID | 권한 부여 source 사용자 ID/사번 | 검색 조건 키(복사 원본 사용자) | m-mcm/page-components/csa/commUserRoleCopy/page.tsx:419 |

### 화면 예외 — 뜻이 다르거나 여러 키가 묶여 `meta={false}` (3)

| 키 | 모듈 | 머리글 | 근거 | 첫 위치 |
|---|---|---|---|---|
| DATA_SRC | m-mcm | 실행 모듈 | commWidgetMng 의 '실행 모듈' 라벨 — 사전 DATA_SRC(데이터 출처)와 뜻이 달라 화면 레인이 meta=false(조정자 지시 mdm-column-dict-3) (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:254 |
| LABEL_LONG | m-mdm | 표시명 긴/중간/짧은 | columnMng '표시명 긴/중간/짧은' — 한 라벨에 입력 3개가 묶여 화면 레인이 meta=false(조정자 지시 mdm-column-dict-3) (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/columnMng/ColumnDetailForm.tsx:139 |
| LINE_NO | m-mdm | 줄 | 지금 hit(LINE_NO '라인 번호')은 뜻이 다르다 — CSV 줄 번호라 meta=false | m-mdm/pages/dmd/dataCsvUploadPop/dataCsvUploadPop.tsx:38 |

### UI 전용 — 등록 안 함 (143)

| 키 | 모듈 | 머리글 | 근거 | 첫 위치 |
|---|---|---|---|---|
| __ACTION | m-mdm | 동작 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dmc/codeItemEdit/cate/CategoryTab.tsx:129 |
| __CHANGE | m-mdm | 변경 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dmc/codeItemEdit/page.tsx:380 |
| __DRAG | m-mdm |  | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dmc/codeItemEdit/page.tsx:370 |
| __NO | m-mcm | NO | 밑줄로 시작하는 화면 내부 키 | m-mcm/page-components/cmz/masterCodeSelPop/masterCodeSelPop.tsx:60 |
| _BIZ | m-mdm | 비즈니스식(요구 변수) | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dma/domainMng/components/DomainTreeGrid.tsx:31 |
| _NAME | m-mdm | 도메인명 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dma/domainMng/components/DomainTreeGrid.tsx:18 |
| _STD | m-mdm | 자신의 표준식 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dma/domainMng/components/DomainTreeGrid.tsx:29 |
| _TYPE | m-mdm | 타입 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dma/domainMng/components/DomainTreeGrid.tsx:27 |
| _UNIT | m-mdm | 단위 | 밑줄로 시작하는 화면 내부 키 | m-mdm/pages/dma/domainMng/components/DomainTreeGrid.tsx:28 |
| ABBR_TEXT | m-mdm | 약어 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/columnMng/page.tsx:436 |
| ACTIONS | m-mdm | 작업 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/HeaderStackGrid.tsx:59 |
| ALIGN | m-mcm | 정렬 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/widget-types/query-table/editor.tsx:48 |
| APPLIED_SEQ | m-mcm | 적용 순번 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:81 |
| AS_OF | m-mdm | 시각 T | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dmb/layoutMng/components/LayoutBasicForm.tsx:62 |
| ATTACH_TO | m-mdm |  | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:550 |
| BASE_UNIT_BADGE | m-mdm | 기준 단위 여부 | 기준 단위 여부 배지(값의 뜻이 원 컬럼과 다름) | m-mdm/pages/dma/unitMng/page.tsx:41 |
| BRANCH_NAME | m-mdm | 분기 이름 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:371 |
| BYTES | m-mcm | 추정 크기 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:138 |
| C_USR_ID | m-mls | 등록 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/page.tsx:634 |
| CACHE_ENTRY | m-mcm | 항목 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/page.tsx:499 |
| CATEGORY_LABEL | m-mls | 분류 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:47 |
| CHANGED_TEXT | m-mdm | 바뀐 칸 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleConfirm/page.tsx:117 |
| CHART_TYPE | m-mcm | 차트 종류 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-chart/editor.tsx:59 |
| COLUMNS | m-mcm | 표시 컬럼 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-table/editor.tsx:95 |
| COMPUTED_FORM_URL | m-mcm | FORM URL | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commObjMng/page.tsx:775 |
| CONSECUTIVE_FAILURES | m-mcm | 연속 실패 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:84 |
| CONTRACT_BADGE | m-mdm | 계약 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleEdit/cards/ValueTestCard.tsx:63 |
| CURRENT_VER | m-mdm | 현재 버전 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/LayoutList.tsx:17 |
| CURRENT_VER_LABEL | m-mdm | 현재 버전 / 현재 | 현재 버전 표시 글자 (화면 1/2 위치는 이미 meta=false) | m-mdm/pages/dmc/codeMng/CodeDetail.tsx:142 |
| DATA_QUERY_DEF_IDS | m-mcm | 데이터 질의에 쓸 쿼리 위젯 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/chat/editor.tsx:115 |
| DEFAULT_SIZE | m-mcm | 기본 크기 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:88 |
| DEPENDED_BY | m-mdm | 역의존 룰 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleEdit/cards/RuleUsageCard.tsx:37 |
| DEPENDS_ON | m-mdm | 의존 룰 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleEdit/cards/RuleUsageCard.tsx:36 |
| DERIVED | m-mdm | 도메인(파생) / 파생 타입·길이 / 단위 / 도메인 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 (화면 1/2 위치는 이미 meta=false) | m-mdm/pages/dmb/layoutMng/components/BodyItemGrid.tsx:18 |
| DETAIL_ERROR | m-mcm | 오류 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/page.tsx:507 |
| DIFF_TEXT | m-mcm | 전일 대비 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/widget-types/exchange/renderer.tsx:41 |
| DRAFT_VER | m-mdm | DRAFT | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/LayoutList.tsx:18 |
| EDT_TARGET | m-mcm | 처리대상 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:265 |
| EFF_BIZ_EXPR | m-mdm | 유효 비즈니스식 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/domainMng/components/DomainRuleEditor.tsx:51 |
| EFF_STD_EXPR | m-mdm | 유효 표준식 / 유효 식(조립) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 (화면 1/2 위치는 이미 meta=false) | m-mdm/pages/dma/domainMng/components/DomainRuleEditor.tsx:44 |
| ENCODING_PAD_RULE | m-mdm | 인코딩 / 패딩 규칙 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dmb/headerMng/components/HeaderForm.tsx:98 |
| ENTRY_KIND | m-mcm | 구분 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/page.tsx:517 |
| EVALUATED_AT | m-mdm | 평가 시각 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutConfirm/page.tsx:58 |
| EVENT_LABEL | m-mdm | 사건 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmd/dataItemMng/history/DataHistoryTimeline.tsx:91 |
| EXPR_INFO | m-mdm | 식 결과 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleEdit/sections/columns/column-grid.tsx:523 |
| FINAL_RESULTS | m-mdm | 최종 결과 변수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleSetMng/columns.tsx:37 |
| FORM_ERRORS | m-mcm | 저장할 수 없음 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:294 |
| FROM | m-mdm | 출발 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/EdgePanel.tsx:39 |
| FROM_UNIT_CODE | m-mdm | 입력 단위 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/unitMng/ConvertCalculator.tsx:115 |
| FROM1 | m-mcm | FROM (서버) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:77 |
| FROM2 | m-mcm | FROM (구분) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:78 |
| FROM3 | m-mcm | FROM (인스턴스) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:79 |
| FROM4 | m-mcm | FROM (스키마) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:80 |
| GEN_DOMAIN | m-mdm | 추천 도메인 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/columnMng/page.tsx:654 |
| GEN_DUPLICATES | m-mdm | 중복 검사 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/columnMng/page.tsx:677 |
| GEN_PREVIEW | m-mdm |  | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/columnMng/page.tsx:637 |
| GRP_RESULT | m-mdm | 결과 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleEdit/decision-table/columns.ts:506 |
| GUIDE | m-mdm | 안내 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/domainMng/components/ParentLinkModal.tsx:161 |
| HEADER_LENGTH | m-mdm | 헤더 길이 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dmb/headerMng/components/HeaderForm.tsx:112 |
| HEADER_NAME | m-mdm | 헤더 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/HeaderStackGrid.tsx:51 |
| HEADER_STATE | m-mdm | 상태 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/headerMng/components/HeaderList.tsx:19 |
| HEADER_SUMMARY | m-mdm | 헤더 구성 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/LayoutList.tsx:15 |
| HEADER_VER | m-mdm | 버전 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/headerMng/components/HeaderList.tsx:18 |
| HEAP_USED | m-mcm | 힙 사용/최대 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:97 |
| HIT_MARK | m-mdm | 해당 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeItemEdit/cate/components/PreviewPanel.tsx:23 |
| HITS | m-mcm | 조회 수 / 조회 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 (화면 1/2 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/page.tsx:128 |
| INIT_PASSWORD | m-mcm | 초기 비밀번호 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commUserMng/page.tsx:1404 |
| INPUT_COUNT | m-mdm | 입력 변수 수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleSetMng/columns.tsx:51 |
| INSTANCE_ID | m-mcm | 인스턴스 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:80 |
| ITEM_COUNT | m-mdm | 항목 / 본문 항목 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/headerMng/components/HeaderList.tsx:16 |
| ITEM_NAME | m-mdm | 항목명 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/src/layout/item-rows.ts:16 |
| KEYS_TEXT | m-mcm | 키 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/RegisterModal.tsx:90 |
| LABEL_FIELD | m-mcm | 라벨 필드 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-number/editor.tsx:39 |
| LAST_ACCESS_AT | m-mcm | 마지막 조회 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:127 |
| LAST_SUCCESS_AT | m-mcm | 마지막 확인 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:83 |
| LAST_USED_DT | m-mcm | 마지막 이용일 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/screenUsageStat/tabs/unused-tab.ts:16 |
| LATEST_SEQ | m-mcm | MDM 순번 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:82 |
| LENGTH_OFFSET | m-mdm | 총 길이·기존 오프셋 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/VersionPanel.tsx:39 |
| LOADED_AT | m-mcm | 적재 시각 / 적재 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 (화면 1/2 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/page.tsx:126 |
| MATCH_COUNT | m-mdm | 해당 / 매칭 건수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeItemEdit/cate/CategoryTab.tsx:125 |
| MATCH_TEXT | m-mdm | 매칭 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/columnMng/page.tsx:435 |
| MEMBER_KEY | m-mdm | 항목 키 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmd/dataItemMng/history/DataHistoryTimeline.tsx:161 |
| MENU_PATH | m-mcm | 메뉴 경로 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/screenUsageStat/tabs/columns.ts:38 |
| NEW_CELLS | m-mdm | 이후 셀 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleConfirm/page.tsx:119 |
| NEW_VALUES | m-mdm | 이후 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeConfirm/page.tsx:107 |
| NODE_ID | m-mdm | 노드 ID | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:316 |
| OFFSET_LENGTH | m-mdm | 오프셋 / 길이 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/src/layout/LayoutItemDetail.tsx:143 |
| OLD_CELLS | m-mdm | 이전 셀 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleConfirm/page.tsx:118 |
| OLD_VALUES | m-mdm | 이전 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeConfirm/page.tsx:100 |
| OVERRIDDEN | m-mcm,m-mdm | 덮어씀 / 재정의 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:91 |
| OVERRIDES | m-mdm | 재정의한 상수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/HeaderStackGrid.tsx:58 |
| OWNER_TEXT | m-mdm | 소유자 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutConfirm/page.tsx:50 |
| PAGE_GUIDE | m-mcm | 포털 화면 안내 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/chat/editor.tsx:103 |
| PENDING_TEXT | m-mdm | 미적용 버전 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleMng/page.tsx:216 |
| POST_PERIOD | m-mls | 게시기간 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mls/pages/lsh/noticeMgmt/notice-columns.tsx:85 |
| PREVIEW | m-mcm | 미리보기(기본 크기) | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:308 |
| PWD_RESET_FLAG | m-mcm | 비밀번호 초기화 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commUserMng/page.tsx:1173 |
| RATE_TEXT | m-mcm | 환율(원) | 환율 위젯 표시 글자 | m-mcm/widget-types/exchange/renderer.tsx:39 |
| RE_REGISTER | m-mcm | 계정 재생성 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commUserMng/page.tsx:1234 |
| READERS | m-mdm | 읽는 룰 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleSetEdit/cards/SetIoTables.tsx:108 |
| REASON_LABEL | m-mdm | 근거 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/termRegPop/termRegPop.tsx:175 |
| REASON_TEXT | m-mdm | 근거 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeItemEdit/components/PreviewPanel.tsx:56 |
| RELEASED_VER | m-mdm | 적용 버전 / 확정 버전 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 (화면 1/2 위치는 이미 meta=false) | m-mdm/pages/dme/ruleMng/page.tsx:208 |
| REMAINING_SECONDS | m-mcm | 남은 수명(초) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:130 |
| ROLE_COPY_USER_ID | m-mcm | 사용자 역할그룹 복사 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commUserMng/page.tsx:1147 |
| ROW_STATUS | m-mcm | 상태 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/cmb/masterRuleData/page.tsx:89 |
| RULE_COUNT | m-mdm | 룰 수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dme/ruleSetMng/columns.tsx:35 |
| RULE_KIND_POLICY | m-mdm | 종류·정책 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/PropertyPanel.tsx:195 |
| SCORE_TEXT | m-mdm | 유사도 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/termMng/TermDetailPane.tsx:38 |
| SERIES | m-mcm | 값 계열 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-chart/editor.tsx:86 |
| SND_RCV | m-mdm | 송수신 / 송신 → 수신 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutConfirm/page.tsx:55 |
| SND_RCV_SYSTEM | m-mdm | 송신 / 수신 시스템 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dmb/layoutMng/components/LayoutBasicForm.tsx:94 |
| SQL | m-mcm | SQL | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 3/3 위치는 이미 meta=false) | m-mcm/widget-types/query-chart/editor.tsx:46 |
| SSO_RESET_FLAG | m-mcm | SSO 초기화 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commUserMng/page.tsx:1203 |
| STAGE_TEXT | m-mdm | 구분 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/termMng/TermDetailPane.tsx:34 |
| SYNC_TARGET | m-mcm | 처리유형 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:255 |
| SYSTEM_FIELDS | m-mdm | 시스템 필드 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/columnMng/page.tsx:76 |
| SYSTEM_PROMPT | m-mcm | 시스템 프롬프트 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/chat/editor.tsx:74 |
| TARGET_ROLES | m-mls | 대상 역할 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mls/pages/lsh/noticeMgmt/page.tsx:749 |
| TARGET_TYPE | m-mcm | 대상 종류 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/mdmCacheMng/RegisterModal.tsx:84 |
| TARGET_VALUE | m-mdm | 대상 값 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeItemEdit/cate/components/PreviewPanel.tsx:22 |
| TERM_NAMES | m-mdm | 구성 용어 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dma/columnMng/page.tsx:75 |
| TO | m-mdm | 도착 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dme/ruleSetEdit/panels/EdgePanel.tsx:47 |
| TO1 | m-mcm | TO (서버) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:81 |
| TO2 | m-mcm | TO (구분) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:82 |
| TO3 | m-mcm | TO (인스턴스) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:83 |
| TO4 | m-mcm | TO (스키마) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commSyncMng/page.tsx:84 |
| TOP_MENU_NM | m-mcm | 최다 이용 화면 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/screenUsageStat/tabs/dept-tab.ts:15 |
| TOTAL_BYTES | m-mcm | 캐시 추정 크기 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/mdmCacheMng/page.tsx:88 |
| TYPE_CONFIG | m-mcm | 유형 설정 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:268 |
| UNAPPLIED_LABEL | m-mdm | 미적용 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmc/codeMng/page.tsx:421 |
| UNIT | m-mcm | 단위(원 차트) / 단위 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 2/2 위치는 이미 meta=false) | m-mcm/widget-types/query-chart/editor.tsx:110 |
| UNIT_FIELD | m-mcm | 단위 필드 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-number/editor.tsx:67 |
| UNUSED_DAYS | m-mcm | 미사용 기준(일) | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/screenUsageStat/page.tsx:171 |
| USED_BY_COUNT | m-mdm | 사용 전문 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/headerMng/components/HeaderList.tsx:17 |
| USER_CNT | m-mcm | 이용자 수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/screenUsageStat/tabs/overview-tab.ts:14 |
| USER_COUNT | m-mcm | 사용자 수 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mcm/page-components/csa/commWidgetMng/WidgetListTab.tsx:89 |
| VALUE_FIELD | m-mcm | 값 필드 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-number/editor.tsx:53 |
| VER_STATE | m-mdm | 버전 상태 | 실제 DB 컬럼 없음 — 화면이 계산하거나 서버 응답에만 있는 값 | m-mdm/pages/dmb/layoutMng/components/ImpactPanel.tsx:19 |
| WELCOME | m-mcm | 첫 인사 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/chat/editor.tsx:89 |
| WIDGET_KIND | m-mcm | 구분 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/page-components/csa/commWidgetMng/WidgetDetailForm.tsx:140 |
| X_FIELD | m-mcm | 가로축 필드 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mcm/widget-types/query-chart/editor.tsx:72 |
| EXAMPLES_TEXT | m-mdm | 예시 값 | 화면이 모든 위치에서 meta=false 로 둔 칸(입력·설정·표시 칸) — 이번 등록 대상 아님 (화면 1/1 위치는 이미 meta=false) | m-mdm/pages/dma/domainMng/components/DomainBasicForm.tsx:142 |

### MES 별칭 등록 — 기존 표준 컬럼에 별칭 추가 (10)

| 화면 키(별칭) | 표준 컬럼 | 머리글 | 근거 |
|---|---|---|---|
| CODE_DESC | CD_TP_DESC | 설명 | TB_MCM_CODE_MASTER.CODE_DESC — CD_TP_* 군 |
| CODE_ID | CD_TP_ID | 코드ID | TB_MCM_CODE_MASTER(코드 구분 정의) — 사전 CD_TP_* 군(CD_TP_CHARACTER·CD_TP_VER·CD_TP_OWNER_EMP_NO)과 같은 테이블 구성 |
| CODE_VAL_DESC | CD_V_DESC | 설명 / 코드설명 | TB_MCM_CODE_DETAIL — 같은 용어 집합(코드 값 설명) |
| CODE_VAL_MEAN | CD_V_MEANING | 코드 의미 / 코드의미 | TB_MCM_CODE_DETAIL — 같은 용어 집합(코드 값 의미) |
| COL_NM | COLUMN_NM | 한글항목명 | TB_MCA_RULE_COL_LIST.COL_NM — 같은 용어 집합(컬럼 명) |
| ENDED_AT | END_DH | 종료 | TB_SEC_SCREEN_USAGE_LOG.ENDED_AT — 같은 용어 집합(종료 일시) |
| PIN_YN | FIX_YN | 상단 고정 | TB_MLS_NOTICE.PIN_YN — 같은 용어 집합(고정 여부) |
| MENU_TP | MENU_KND | 메뉴타입 / 메뉴 타입 | TB_MCM_SEC_MENU.MENU_TP — 메뉴 유형(구분↔유형 동의어), 기존 MES 별칭 MENU_TYPE |
| MOBILE_TEL_NO | MOBILE_TEL | MOBILE / 모바일번호 | TB_MCM_SEC_USER.MOBILE_TEL_NO — 기존 '모바일 전화'(MES 별칭 MOBILE_PHONE) |
| STARTED_AT | STR_DH | 시작 | TB_SEC_SCREEN_USAGE_LOG.STARTED_AT — 같은 용어 집합(시작 일시) |

### 사전에 있음(MDM 별칭) — C1b(조회 시스템 코드 MES,MDM) 뒤 hit (67)

| 화면 키 | 표준 컬럼 | 머리글 | 근거 |
|---|---|---|---|
| ALTER_NAME | ABBR_NM | 약칭 | MDM 별칭 ALTER_NAME→ABBR_NM(약어 명) 있음, 실제 컬럼 mdm.TB_MDM_CODE_ITEM,mdm.TB_MDM_DATA_ITEM |
| COLLECT_AGG | AGG_WAY | 집계 | MDM 별칭 COLLECT_AGG→AGG_WAY(집계 방식) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| APPLY_TO | APL_END_DH | 적용 끝 | MDM 별칭 APPLY_TO→APL_END_DH(적용 종료 일시) 있음, 실제 컬럼 mdm.TB_MDM_CODE_VER,mdm.TB_MDM_RULE_VER |
| APPLY_FROM | APL_STR_DH | 적용 시작 / 적용 구간 | MDM 별칭 APPLY_FROM→APL_STR_DH(적용 시작 일시) 있음, 실제 컬럼 mdm.TB_MDM_CODE_VER,mdm.TB_MDM_RULE_VER |
| BASE_UNIT | BAS_UNIT | 기준 단위 | MDM 별칭 BASE_UNIT→BAS_UNIT(기준 단위) 있음, 실제 컬럼 mdm.TB_MDM_UNIT |
| BIZ_RULE | BUSINESS_RULE | 비즈니스 검증식 | MDM 별칭 BIZ_RULE→BUSINESS_RULE(업무 규칙) 있음, 실제 컬럼 mdm.TB_MDM_DOMAIN |
| CASE_NAME | CASE_NM | 이름 | MDM 별칭 CASE_NAME→CASE_NM(케이스 명) 있음, 실제 컬럼 mdm.TB_MDM_RULE_TEST_CASE,mdm.TB_MDM_RULE_SET_TEST_CASE |
| CATE_ID | CATEGORY_ID | ID / 카테고리 ID | MDM 별칭 CATE_ID→CATEGORY_ID(카테고리 아이디) 있음, 실제 컬럼 mdm.TB_MDM_CODE_CATE,mdm.TB_MDM_CODE_CATE_ITEM |
| CATE_NAME | CATEGORY_NM | 이름 / 카테고리 정의 | MDM 별칭 CATE_NAME→CATEGORY_NM(카테고리 명) 있음, 실제 컬럼 mdm.TB_MDM_CODE_CATE,mdm.TB_MDM_DATA_CATE |
| CODE_PATTERN | CD_REGEX | 키 패턴 | MDM 별칭 CODE_PATTERN→CD_REGEX(코드 정규식) 있음, 실제 컬럼 mdm.TB_MDM_DATA |
| CHANGE_SUMMARY | CHG_CTT | 변경 | MDM 별칭 CHANGE_SUMMARY→CHG_CTT(변경 내용) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_VER |
| TRANSFORM | CONV_RULE | 변환 규칙 | MDM 별칭 TRANSFORM→CONV_RULE(변환 규칙) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN_SYSTEM |
| SWITCH_MODE | CVT_MOD | 전환 방식 | MDM 별칭 SWITCH_MODE→CVT_MOD(전환 모드) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_VER |
| DEFAULT_VALUE | DEFAULTS | 기본값 / 헤더 기본값 | MDM 별칭 DEFAULT_VALUE→DEFAULTS(기본값) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN,mdm.TB_MDM_LAYOUT_ITEM |
| DEF_TARGET | DEFINE_DEST | 대상 칸 | MDM 별칭 DEF_TARGET→DEFINE_DEST(정의 대상) 있음, 실제 컬럼 mdm.TB_MDM_CODE_CATE,mdm.TB_MDM_DATA_CATE |
| DEF_KIND | DEFINE_KND | 종류 | MDM 별칭 DEF_KIND→DEFINE_KND(정의 유형) 있음, 실제 컬럼 mdm.TB_MDM_CODE_CATE,mdm.TB_MDM_DATA_CATE |
| DEF_EXPR | DEFINE_REGEX | 정규식 | MDM 별칭 DEF_EXPR→DEFINE_REGEX(정의 정규식) 있음, 실제 컬럼 mdm.TB_MDM_CODE_CATE,mdm.TB_MDM_DATA_CATE |
| RELEASED_AT | DEPLOY_DH | 확정 일시 | MDM 별칭 RELEASED_AT→DEPLOY_DH(배포 일시) 있음, 실제 컬럼 mdm.TB_MDM_CODE_VER,mdm.TB_MDM_RULE_VER |
| DIMENSION | DIM | 차원 | MDM 별칭 DIMENSION→DIM(차원) 있음, 실제 컬럼 mdm.TB_MDM_UNIT |
| DISP_TYPE | DISP_KND | 표시 타입 | MDM 별칭 DISP_TYPE→DISP_KND(표시 유형) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| DOMAIN_KIND | DOMAIN_KND | 종류 | MDM 별칭 DOMAIN_KIND→DOMAIN_KND(도메인 유형) 있음, 실제 컬럼 mdm.TB_MDM_DOMAIN |
| DOMAIN_NAME | DOMAIN_NM | 도메인명 / 하위 도메인 / 도메인 | MDM 별칭 DOMAIN_NAME→DOMAIN_NM(도메인 명) 있음, 실제 컬럼 mdm.TB_MDM_DOMAIN |
| EAI_CODE | EAI_CD | EAI 코드 / EAI | MDM 별칭 EAI_CODE→EAI_CD(EAI 코드) 있음, 실제 컬럼 mdm.TB_MDM_EAI,mdm.TB_MDM_LAYOUT_VER |
| EAI_NAME | EAI_NM | EAI 이름 | MDM 별칭 EAI_NAME→EAI_NM(EAI 명) 있음, 실제 컬럼 mdm.TB_MDM_EAI |
| VALID_TO | END_VLD_DD | 끝 | MDM 별칭 VALID_TO→END_VLD_DD(종료 유효 일자) 있음, 실제 컬럼 mdm.TB_MDM_DATA_ITEM,mdm.TB_MDM_DATA_CATE |
| ENG_NAME | ENG_NM | 영문명 | MDM 별칭 ENG_NAME→ENG_NM(영문 명) 있음, 실제 컬럼 mdm.TB_MDM_TERM |
| REQUIRED | ESSEN | 필수 | MDM 별칭 REQUIRED→ESSEN(필수) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN |
| FACTOR | EXC_COEFF | 환산 계수 | MDM 별칭 FACTOR→EXC_COEFF(환산 계수) 있음, 실제 컬럼 mdm.TB_MDM_UNIT |
| EXPECTED_JSON | EXPCT_RST_JSON | 기대 | MDM 별칭 EXPECTED_JSON→EXPCT_RST_JSON(기대 결과 JSON) 있음, 실제 컬럼 mdm.TB_MDM_RULE_TEST_CASE,mdm.TB_MDM_RULE_SET_TEST_CASE |
| FILL_KIND | FILL_KND | fill_kind / 채움 방식 / 채움 | MDM 별칭 FILL_KIND→FILL_KND(채움 유형) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM |
| GRP_COND | GRP_CDN | 조건 / 열 조건 | MDM 별칭 GRP_COND→GRP_CDN(그룹 조건) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| LAYOUT_NAME | LAYOUT_NM | 헤더 이름 / 전문 이름 / 이름 | MDM 별칭 LAYOUT_NAME→LAYOUT_NM(레이아웃 명) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT |
| LVL_CNT | LEVEL_CNT | 계층 칸 수 | MDM 별칭 LVL_CNT→LEVEL_CNT(수준 수) 있음, 실제 컬럼 mdm.TB_MDM_CODE,mdm.TB_MDM_DATA |
| COLUMN_NAME | LGC_COLUMN_NM | 논리명 | MDM 별칭 COLUMN_NAME→LGC_COLUMN_NM(논리 컬럼 명) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN |
| MARU_CODE_ID | MARU_CD_ID | 코드 참조 / ID / 마루 코드 ID | MDM 별칭 MARU_CODE_ID→MARU_CD_ID(마루 코드 아이디) 있음, 실제 컬럼 mdm.TB_MDM_CODE,mdm.TB_MDM_CODE_SYSTEM |
| MARU_CODE_NAME | MARU_CD_NM | 이름 | MDM 별칭 MARU_CODE_NAME→MARU_CD_NM(마루 코드 명) 있음, 실제 컬럼 mdm.TB_MDM_CODE |
| MARU_DATA_NAME | MARU_DATA_NM | 이름 | MDM 별칭 MARU_DATA_NAME→MARU_DATA_NM(마루 데이터 명) 있음, 실제 컬럼 mdm.TB_MDM_DATA |
| MARU_RULE_NAME | MARU_RULE_NM | 이름 / 룰명 | MDM 별칭 MARU_RULE_NAME→MARU_RULE_NM(마루 규칙 명) 있음, 실제 컬럼 mdm.TB_MDM_RULE |
| SENSE_NO | MEANING_NO | 의미 / 의미 번호 | MDM 별칭 SENSE_NO→MEANING_NO(의미 번호) 있음, 실제 컬럼 mdm.TB_MDM_TERM |
| NUM_FORMAT | NUM_FMT | 숫자 표현 / 숫자 형식 | MDM 별칭 NUM_FORMAT→NUM_FMT(수치 형식) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM |
| OFFSET | OFST | 오프셋 | MDM 별칭 OFFSET→OFST(오프셋) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM |
| COLUMN_PHYS | PHYS_NM | 컬럼 / 표준 물리명 | MDM 별칭 COLUMN_PHYS→PHYS_NM(물리 명) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM — LayoutItemDetail 의 '컬럼' 칸 1곳은 ColumnInfoPopover 가 이미 있어 화면 레인이 meta=false(예외, 지시 mdm-column-dict-3) — 그리드는 그대로 |
| PHYS_NAME | PHYS_NM | 실제 필드명 / 표준 물리명 | MDM 별칭 PHYS_NAME→PHYS_NM(물리 명) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN_SYSTEM,mdm.TB_MDM_COLUMN |
| PARENT_DOMAIN_ID | PRN_DOMAIN_ID | 부모 도메인 / 지금 부모 / 새 부모 도메인 | MDM 별칭 PARENT_DOMAIN_ID→PRN_DOMAIN_ID(상위 도메인 아이디) 있음, 실제 컬럼 mdm.TB_MDM_DOMAIN |
| RCV_SYSTEM | RCV_SYS_CD | 수신 시스템 | MDM 별칭 RCV_SYSTEM→RCV_SYS_CD(수신 시스템 코드) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT |
| REF_CATE_ID | REF_CATEGORY_ID | 참조 카테고리 | MDM 별칭 REF_CATE_ID→REF_CATEGORY_ID(참조 카테고리 아이디) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN |
| REF_KIND | REF_KND | 참조 종류 | MDM 별칭 REF_KIND→REF_KND(참조 유형) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN |
| REF_TARGET | REF_MARU_DATA_ID | 참조 대상 | MDM 별칭 REF_TARGET→REF_MARU_DATA_ID(참조 마루 데이터 아이디) 있음, 실제 컬럼 mdm.TB_MDM_COLUMN |
| ROW_VERSION | ROW_VER | 행 버전 | MDM 별칭 ROW_VERSION→ROW_VER(행 버전) 있음, 실제 컬럼 mdm.TB_MDM_RULE_TEST_CASE,mdm.TB_MDM_CODE_VER |
| RES_GRP | RST_GRP | 그룹 | MDM 별칭 RES_GRP→RST_GRP(결과 그룹) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| RULE_KIND | RULE_KND | 종류 | MDM 별칭 RULE_KIND→RULE_KND(규칙 유형) 있음, 실제 컬럼 mdm.TB_MDM_RULE |
| SND_SYSTEM | SND_SYS_CD | 송신→수신 / 송신 시스템 | MDM 별칭 SND_SYSTEM→SND_SYS_CD(송신 시스템 코드) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT |
| TOTAL_LENGTH | SNT_LTH | 길이 / 총 길이 | MDM 별칭 TOTAL_LENGTH→SNT_LTH(전문 총 길이)가 이미 있음 (화면 1/6 위치는 이미 meta=false) |
| FILLER_LENGTH | SPR_LEN | FILLER 길이 | MDM 별칭 FILLER_LENGTH→SPR_LEN(예비 길이) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM |
| SOURCE_KIND | SRC_KND | 원천 | MDM 별칭 SOURCE_KIND→SRC_KND(출처 유형) 있음, 실제 컬럼 mdm.TB_MDM_RULE,mdm.TB_MDM_CODE |
| STD_NAME | STD_NM | 표준명 | MDM 별칭 STD_NAME→STD_NM(표준 명) 있음, 실제 컬럼 mdm.TB_MDM_DOMAIN |
| VALID_FROM | STR_VLD_DD | 시작 일시 / 시작 | MDM 별칭 VALID_FROM→STR_VLD_DD(시작 유효 일자) 있음, 실제 컬럼 mdm.TB_MDM_DATA_ITEM,mdm.TB_MDM_DATA_CATE |
| SYSTEM_CODE | SYS_CD | SYSTEM / 시스템 | MDM 별칭 SYSTEM_CODE→SYS_CD(시스템 코드) 있음, 실제 컬럼 mcm.TB_MCM_SEC_OBJ,mdm.TB_MDM_SYSTEM |
| SYSTEMS | SYS_LIST | 사용 시스템 | MDM 별칭 SYSTEMS→SYS_LIST(시스템 리스트) 있음, 실제 컬럼 mdm.TB_MDM_TERM |
| DEFINITION | TERM_DESC | 정의 | MDM 별칭 DEFINITION→TERM_DESC(용어 설명) 있음, 실제 컬럼 mdm.TB_MDM_TERM (화면 1/2 위치는 이미 meta=false) |
| TERM_NAME | TERM_NM | 표기 | MDM 별칭 TERM_NAME→TERM_NM(용어 명) 있음, 실제 컬럼 mdm.TB_MDM_TERM |
| UNIT_CODE | UNIT_CD | 단위 / 단위 코드 / 검색어 | MDM 별칭 UNIT_CODE→UNIT_CD(단위 코드) 있음, 실제 컬럼 mdm.TB_MDM_UNIT,mdm.TB_MDM_DOMAIN |
| USAGE_NOTE | USE_RMK | 활용처 메모 | MDM 별칭 USAGE_NOTE→USE_RMK(사용 비고) 있음, 실제 컬럼 mdm.TB_MDM_RULE,mdm.TB_MDM_COLUMN |
| VAR_KIND | VAR_KND | 구분 | MDM 별칭 VAR_KIND→VAR_KND(변수 유형) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| VAR_NAME | VAR_NM | 변수 | MDM 별칭 VAR_NAME→VAR_NM(변수 명) 있음, 실제 컬럼 mdm.TB_MDM_RULE_VAR |
| VER_KIND | VER_KND | 종류 | MDM 별칭 VER_KIND→VER_KND(버전 유형) 있음, 실제 컬럼 mdm.TB_MDM_CODE_VER,mdm.TB_MDM_RULE_VER |
| TRANS_UNIT | XMIT_UNIT | 전송 단위 / 단위 항목 / 전송 단위 | MDM 별칭 TRANS_UNIT→XMIT_UNIT(전송 단위) 있음, 실제 컬럼 mdm.TB_MDM_LAYOUT_ITEM |

### 새 표준 컬럼 등록 (70)

| 화면 키 | 표준 물리명 | 논리명 | MES 별칭 | 도메인 | 용어(의미 번호) | 근거 |
|---|---|---|---|---|---|---|
| ACCESS_TP | ACCESS_TP | 접근 구분 | (물리명과 같음) | 157 | 접근#1 구분#1 | TB_MCM_SEC_OBJ.ACCESS_TP |
| PERMISSION_ACTION | ACTION_BTN_AUT | 실행작업 버튼 권한 | PERMISSION_ACTION |  | 실행작업#1 버튼#1 권한#1 | TB_MCM_SEC_PERM.PERMISSION_ACTION |
| FULL_SEQ | ALL_SEQ | 전체 순번 | FULL_SEQ | 175 | 전체#1 순번#1 | TB_MCM_SEC_MENU.FULL_SEQ |
| PERMISSION_DESC | AUT_DESC | 권한 설명 | PERMISSION_DESC | 183 | 권한#1 설명#1 | TB_MCM_SEC_PERM.PERMISSION_DESC |
| PERMISSION_ID | AUT_ID | 권한 아이디 | PERMISSION_ID | 168 | 권한#1 아이디#1 | TB_MCM_SEC_PERM.PERMISSION_ID |
| PERMISSION_NM | AUT_NM | 권한 명 | PERMISSION_NM | 181 | 권한#1 명#1 | TB_MCM_SEC_PERM.PERMISSION_NM |
| SUBTITLE | AUX_TITLE | 보조 제목 | SUBTITLE |  | 보조#1 제목#1 | TB_MCM_WIDGET_DEF.SUBTITLE — '부제' 용어가 없어 '보조 제목'으로 분해 |
| RULE_OWNER_EMP_NO | BUSINESS_BAS_CHR_EMP_NO | 업무 기준 담당자 사원 번호 | RULE_OWNER_EMP_NO | 170 | 업무#1 기준#1 담당자#1 사원#1 번호#1 | TB_MCA_RULE_MASTER.RULE_OWNER_EMP_NO |
| RULE_DESC | BUSINESS_BAS_DESC | 업무 기준 설명 | RULE_DESC | 183 | 업무#1 기준#1 설명#1 | TB_MCA_RULE_MASTER(업무기준).RULE_DESC |
| RULE_ID | BUSINESS_BAS_ID | 업무 기준 아이디 | RULE_ID | 168 | 업무#1 기준#1 아이디#1 | TB_MCA_RULE_MASTER(업무기준).RULE_ID — MDM 룰(MARU_RULE_ID)과 다른 대상 |
| RULE_NM | BUSINESS_BAS_NM | 업무 기준 명 | RULE_NM | 181 | 업무#1 기준#1 명#1 | TB_MCA_RULE_MASTER(업무기준).RULE_NM |
| RULE_VER | BUSINESS_BAS_VER | 업무 기준 버전 | RULE_VER |  | 업무#1 기준#1 버전#1 | TB_MCA_RULE_MASTER.RULE_VER |
| CODE_NM | CD_TP_NM | 코드 구분 명 | CODE_NM | 181 | 코드#1 구분#1 명#1 | TB_MCM_CODE_MASTER.CODE_NM — CD_TP_* 군에 '코드 구분 명'만 없음 |
| CODE_VAL_REF1 | CD_V_REF | 코드 값 참조 | CODE_VAL_REF1 |  | 코드#1 값#1 참조#1 | TB_MCM_CODE_DETAIL.CODE_VAL_REF1~5 — 숫자는 토큰이 될 수 없어 한 표준 컬럼에 별칭 5개 |
| CODE_VAL_REF2 | CD_V_REF | 코드 값 참조 | CODE_VAL_REF2 |  | 코드#1 값#1 참조#1 | CODE_VAL_REF1 과 같은 표준 컬럼의 별칭 |
| CODE_VAL_REF3 | CD_V_REF | 코드 값 참조 | CODE_VAL_REF3 |  | 코드#1 값#1 참조#1 | CODE_VAL_REF1 과 같은 표준 컬럼의 별칭 |
| CODE_VAL_REF4 | CD_V_REF | 코드 값 참조 | CODE_VAL_REF4 |  | 코드#1 값#1 참조#1 | CODE_VAL_REF1 과 같은 표준 컬럼의 별칭 |
| CODE_VAL_REF5 | CD_V_REF | 코드 값 참조 | CODE_VAL_REF5 |  | 코드#1 값#1 참조#1 | CODE_VAL_REF1 과 같은 표준 컬럼의 별칭 |
| PERMISSION_COMMON | CMN_BTN_AUT | 공통 버튼 권한 | PERMISSION_COMMON |  | 공통#1 버튼#1 권한#1 | TB_MCM_SEC_PERM.PERMISSION_COMMON |
| COL_PREC_LEN | COLUMN_DECIMAL_LTH | 컬럼 소수점 길이 | COL_PREC_LEN | 200 | 컬럼#1 소수점#1 길이#1 | TB_MCA_RULE_COL_LIST.COL_PREC_LEN |
| COL_TYPE | COLUMN_KND | 컬럼 유형 | COL_TYPE |  | 컬럼#1 유형#1 | TB_MCA_RULE_COL_LIST.COL_TYPE |
| COL_LEN | COLUMN_LTH | 컬럼 길이 | COL_LEN | 200 | 컬럼#1 길이#1 | TB_MCA_RULE_COL_LIST.COL_LEN |
| CONTENT_FORMAT | CTT_FMT | 내용 형식 | CONTENT_FORMAT |  | 내용#1 형식#1 | TB_MLS_NOTICE.CONTENT_FORMAT — '본문' 용어가 없어 '내용'으로 분해 |
| DEPT_NM | DEPT_NM | 부서 명 | (물리명과 같음) | 181 | 부서#1 명#1 | TB_MCM_DEPT_INFO.DEPT_NM |
| OUT_ACCESS_IP | EXT_ACCESS_IP | 외부 접근 IP | OUT_ACCESS_IP | 186 | 외부#2 접근#1 IP#1 | TB_MCM_SEC_OBJ.OUT_ACCESS_IP |
| IO_FLAG | INPUT_OTPUT_TP | 입력 출력 구분 | IO_FLAG | 157 | 입력#1 출력#1 구분#1 | TB_MCA_RULE_COL_LIST.IO_FLAG(IN/OUT) |
| OPEN_CNT | INQUIRY_CNT | 조회 수 | OPEN_CNT | 196 | 조회#1 수#1 | TB_SEC_SCREEN_USAGE_DAY.OPEN_CNT — '열람' 용어가 없어 '조회 수'로 분해 |
| IN_OUT_EMP_TP | INTL_EXT_EMP_TP | 내부 외부 사원 구분 | IN_OUT_EMP_TP | 157 | 내부#1 외부#2 사원#1 구분#1 | TB_MCM_SEC_USER.IN_OUT_EMP_TP |
| LINK_PAGE_ID | LNK_PAGE_ID | 연결 페이지 아이디 | LINK_PAGE_ID | 168 | 연결#1 페이지#1 아이디#1 | TB_MCM_WIDGET_DEF.LINK_PAGE_ID |
| MENU_DESC | MENU_DESC | 메뉴 설명 | (물리명과 같음) | 183 | 메뉴#1 설명#1 | TB_MCM_SEC_MENU.MENU_DESC |
| MENU_VIEW_YN | MENU_DISP_YN | 메뉴 표시 여부 | MENU_VIEW_YN | 50 | 메뉴#1 표시#1 여부#1 | TB_MCM_SEC_MENU.MENU_VIEW_YN |
| MENU_PARAM1 | MENU_PARAMETER | 메뉴 파라미터 | MENU_PARAM1 | 192 | 메뉴#1 파라미터#1 | TB_MCM_SEC_MENU.MENU_PARAM1~3 — 한 표준 컬럼에 별칭 3개 |
| MENU_PARAM2 | MENU_PARAMETER | 메뉴 파라미터 | MENU_PARAM2 | 192 | 메뉴#1 파라미터#1 | MENU_PARAM1 과 같은 표준 컬럼의 별칭 |
| MENU_PARAM3 | MENU_PARAMETER | 메뉴 파라미터 | MENU_PARAM3 | 192 | 메뉴#1 파라미터#1 | MENU_PARAM1 과 같은 표준 컬럼의 별칭 |
| MENU_SEQ | MENU_SEQ | 메뉴 순번 | (물리명과 같음) | 175 | 메뉴#1 순번#1 | TB_MCM_SEC_MENU.MENU_SEQ |
| MULTIPLE_YN | MLT_YN | 복수 여부 | MULTIPLE_YN | 50 | 복수#1 여부#1 | TB_MCM_WIDGET_DEF.MULTIPLE_YN — '다중' 용어가 없어 '복수'로 분해 |
| MASTER_CODE_REF1 | MST_CD_REF | 마스터 코드 참조 | MASTER_CODE_REF1 |  | 마스터#1 코드#1 참조#1 | TB_MCM_CODE_MASTER.MASTER_CODE_REF1~5 — 한 표준 컬럼에 별칭 5개 |
| MASTER_CODE_REF2 | MST_CD_REF | 마스터 코드 참조 | MASTER_CODE_REF2 |  | 마스터#1 코드#1 참조#1 | MASTER_CODE_REF1 과 같은 표준 컬럼의 별칭 |
| MASTER_CODE_REF3 | MST_CD_REF | 마스터 코드 참조 | MASTER_CODE_REF3 |  | 마스터#1 코드#1 참조#1 | MASTER_CODE_REF1 과 같은 표준 컬럼의 별칭 |
| MASTER_CODE_REF4 | MST_CD_REF | 마스터 코드 참조 | MASTER_CODE_REF4 |  | 마스터#1 코드#1 참조#1 | MASTER_CODE_REF1 과 같은 표준 컬럼의 별칭 |
| MASTER_CODE_REF5 | MST_CD_REF | 마스터 코드 참조 | MASTER_CODE_REF5 |  | 마스터#1 코드#1 참조#1 | MASTER_CODE_REF1 과 같은 표준 컬럼의 별칭 |
| MASTER_CODE_DIV | MST_CD_TP | 마스터 코드 구분 | MASTER_CODE_DIV | 157 | 마스터#1 코드#1 구분#1 | TB_MCA_RULE_COL_LIST.MASTER_CODE_DIV |
| NOTICE_CATEGORY | NTC_CLSF | 공지 분류 | NOTICE_CATEGORY |  | 공지#1 분류#1 | TB_MLS_NOTICE.NOTICE_CATEGORY |
| TARGET_SCOPE | NTC_DEST_RNG | 공지 대상 범위 | TARGET_SCOPE |  | 공지#1 대상#1 범위#1 | TB_MLS_NOTICE.TARGET_SCOPE |
| POST_END_DT | NTC_END_DT | 공지 종료 일자 | POST_END_DT | 30 | 공지#1 종료#1 일자#1 | TB_MLS_NOTICE.POST_END_DT — '게시' 용어가 없어 '공지'로 분해 |
| NOTICE_ID | NTC_ID | 공지 아이디 | NOTICE_ID | 168 | 공지#1 아이디#1 | TB_MLS_NOTICE.NOTICE_ID |
| POST_START_DT | NTC_STR_DT | 공지 시작 일자 | POST_START_DT | 30 | 공지#1 시작#1 일자#1 | TB_MLS_NOTICE.POST_START_DT — '게시' 용어가 없어 '공지'로 분해 |
| NOTICE_STATUS | NTC_STS | 공지 상태 | NOTICE_STATUS |  | 공지#1 상태#1 | TB_MLS_NOTICE.NOTICE_STATUS |
| OBJECT_ID | OBJECT_ID | 오브젝트 아이디 | (물리명과 같음) | 168 | 오브젝트#1 아이디#1 | TB_MCM_SEC_OBJ.OBJECT_ID — 기존 RGS_OBJECT_ID 등과 같은 '오브젝트' 용어 |
| OBJECT_TYPE | OBJECT_KND | 오브젝트 유형 | OBJECT_TYPE |  | 오브젝트#1 유형#1 | TB_MCM_SEC_OBJ.OBJECT_TYPE — RGS_OBJECT_KND 와 같은 '오브젝트 유형' 표기 |
| OBJECT_NM | OBJECT_NM | 오브젝트 명 | (물리명과 같음) | 181 | 오브젝트#1 명#1 | TB_MCM_SEC_OBJ.OBJECT_NM — 사전 OBJ_NM 은 '목적 명'이라 다른 뜻 |
| OWN_LENGTH | PEC_LTH | 고유 길이 | OWN_LENGTH | 200 | 고유#1 길이#1 | TB_MDM_LAYOUT_VER.OWN_LENGTH — MDM 별칭도 함께 넣는다 |
| PROGRAM_DESC | PGM_DESC | 프로그램 설명 | PROGRAM_DESC | 183 | 프로그램#1 설명#1 | TB_MCM_SEC_OBJ.PROGRAM_DESC |
| PARENT_MENU_ID | PRN_MENU_ID | 상위 메뉴 아이디 | PARENT_MENU_ID | 168 | 상위#1 메뉴#1 아이디#1 | TB_MCM_SEC_MENU.PARENT_MENU_ID |
| PARENT_ROLE_ID | PRN_ROLE_ID | 상위 직무 아이디 | PARENT_ROLE_ID | 168 | 상위#1 직무#1 아이디#1 | TB_MCM_SEC_ROLE.PARENT_ROLE_ID — ROLE 은 용어 '직무'(사용자의 업무 역할) |
| POPUP_BTN | PU_BTN_AUT | 팝업 버튼 권한 | POPUP_BTN |  | 팝업#1 버튼#1 권한#1 | TB_MCM_SEC_PERM.POPUP_BTN |
| REFRESH_SEC | RENEWAL_CYCLE_SS | 갱신 주기 초 | REFRESH_SEC |  | 갱신#1 주기#1 초#2 | TB_MCM_WIDGET_DEF.REFRESH_SEC(새로 고침 주기, 초) — '새로고침' 용어가 없어 '갱신 주기 초'로 분해(dev 합친 뒤 새 키) |
| ROLE_DESC | ROLE_DESC | 직무 설명 | (물리명과 같음) | 183 | 직무#1 설명#1 | TB_MCM_SEC_ROLE.ROLE_DESC |
| ROLE_GROUP_DESC | ROLE_GRP_DESC | 직무 그룹 설명 | ROLE_GROUP_DESC | 183 | 직무#1 그룹#1 설명#1 | TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_DESC |
| ROLE_GROUP_ID | ROLE_GRP_ID | 직무 그룹 아이디 | ROLE_GROUP_ID | 168 | 직무#1 그룹#1 아이디#1 | TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_ID |
| ROLE_GROUP_NM | ROLE_GRP_NM | 직무 그룹 명 | ROLE_GROUP_NM | 181 | 직무#1 그룹#1 명#1 | TB_MCM_SEC_ROLEGROUP.ROLE_GROUP_NM |
| ROLE_NM | ROLE_NM | 직무 명 | (물리명과 같음) | 181 | 직무#1 명#1 | TB_MCM_SEC_ROLE.ROLE_NM |
| SSO_ID | SSO_ID | SSO 아이디 | (물리명과 같음) | 168 | SSO#1 아이디#1 | TB_MCM_SEC_USER.SSO_ID |
| START_KIND | STR_TP | 시작 구분 | START_KIND | 157 | 시작#1 구분#1 | TB_SEC_SCREEN_USAGE_LOG.START_KIND |
| FORM_URL | UI_URL | 화면 URL | FORM_URL |  | 화면#1 URL#1 | TB_MCM_SEC_OBJ.FORM_URL |
| USAGE_DT | USE_DT | 이용 일자 | USAGE_DT | 30 | 이용#1 일자#1 | TB_SEC_SCREEN_USAGE_DAY.USAGE_DT |
| DURATION_MS | USE_TIM | 이용 시간 | DURATION_MS | 215 | 이용#1 시간#1 | TB_SEC_SCREEN_USAGE_*.DURATION_MS — 단위 ms 는 활용처 메모에 적는다 |
| USER_CATEGORY_CD | USER_CLSF_CD | 사용자 분류 코드 | USER_CATEGORY_CD | 156 | 사용자#1 분류#1 코드#1 | TB_MCM_SEC_USER.USER_CATEGORY_CD |
| PERMISSION_CUSTOM | USER_DEFINE_BTN_AUT | 사용자 정의 버튼 권한 | PERMISSION_CUSTOM |  | 사용자#1 정의#1 버튼#1 권한#1 | TB_MCM_SEC_PERM.PERMISSION_CUSTOM |
| WIDGET_ID | WIDGET_ID | 위젯 아이디 | (물리명과 같음) | 168 | 위젯#1(신규) 아이디#1 | TB_MCM_WIDGET_DEF.WIDGET_ID — 용어 「위젯」(WIDGET)을 먼저 등록한다(조정자 결정 mdm-column-dict-2) |

### 사전에 있음 (45)

| 화면 키 | 표준 컬럼 | 근거 |
|---|---|---|
| BASE_VER | BASE_VER | 사전 hit |
| CASE_ID | CASE_ID | 사전 hit |
| CATEGORY_ID | CATEGORY_ID | 사전 hit |
| CATEGORY_NM | CATEGORY_NM | 사전 hit |
| CLIENT_IP | CLIENT_IP | 사전 hit |
| CONTEXT | CONTEXT | 사전 hit (화면 1/3 위치는 이미 meta=false) |
| DATA_TYPE | DATA_KND | 사전 hit(MES 별칭 DATA_TYPE→DATA_KND) |
| DEPT_CD | DEPT_CD | 사전 hit |
| DISPLAY_NAME | DISP_NM | 사전 hit(MES 별칭 DISPLAY_NAME→DISP_NM) |
| DOMAIN_ID | DOMAIN_ID | 사전 hit |
| EMAIL | EMAIL | 사전 hit |
| ENCODING | ENCODING | 사전 hit |
| END_ACTIVE_DATE | END_VLD_DD | 사전 hit(MES 별칭 END_ACTIVE_DATE→END_VLD_DD) |
| ENG_ABBR | ENG_ABBR | 사전 hit |
| HEADER_LAYOUT_ID | HEADER_LAYOUT_ID | 사전 hit |
| HEADER_SEQ | HEADER_SEQ | 사전 hit |
| HIT_POLICY | HIT_POLICY | 사전 hit |
| INPUT_JSON | INPUT_JSON | 사전 hit |
| LAST_UPDATE_TIMESTAMP | LAST_CHG_DH | 사전 hit(MES 별칭 LAST_UPDATE_TIMESTAMP→LAST_CHG_DH) |
| LAST_UPDATED_OBJECT_ID | LAST_CHG_OBJECT_ID | 사전 hit(MES 별칭 LAST_UPDATED_OBJECT_ID→LAST_CHG_OBJECT_ID) |
| LAYOUT_ID | LAYOUT_ID | 사전 hit — headerMng·layoutMng 폼의 'ID / 버전' 라벨 2곳은 두 값이 묶여 화면 레인이 meta=false(예외, 지시 mdm-column-dict-3) — 그리드 3곳은 그대로 hit |
| MARU_DATA_ID | MARU_DATA_ID | 사전 hit |
| MARU_RULE_ID | MARU_RULE_ID | 사전 hit |
| MENU_ID | MENU_ID | 사전 hit |
| MENU_NM | MENU_NM | 사전 hit |
| MASTER_CODE | MST_CD | 사전 hit(MES 별칭 MASTER_CODE→MST_CD) |
| OWNER_ID | OWNER_ID | 사전 hit |
| PAGE_ID | PAGE_ID | 사전 hit |
| CREATION_TIMESTAMP | RGS_DH | 사전 hit(MES 별칭 CREATION_TIMESTAMP→RGS_DH) |
| PRIO | RNK | 사전 hit(MES 별칭 PRIO→RNK) |
| ROLE_ID | ROLE_ID | 사전 hit |
| ROW_ID | ROW_ID | 사전 hit |
| SORT_SEQ | SORT_SEQ | 사전 hit |
| STD_RULE | STD_RULE | 사전 hit |
| START_ACTIVE_DATE | STR_VLD_DD | 사전 hit(MES 별칭 START_ACTIVE_DATE→STR_VLD_DD) |
| SYS_CD | SYS_CD | 사전 hit |
| TEL_NO | TEL_NO | 사전 hit |
| TITLE | TITLE | 사전 TITLE(제목) — 공지·위젯 제목과 같은 뜻(조정자 결정 mdm-column-dict-2) (화면 4/7 위치는 이미 meta=false) |
| UNIT_ITEM | UNIT_ITEM | 사전 hit |
| USE_TP | USE_TP | 사전 hit |
| USE_YN | USE_YN | 사전 hit |
| USER_EMP_NO | USER_EMP_NO | 사전 hit |
| USER_ID | USER_ID | 사전 hit |
| USER_NM | USER_NM | 사전 hit |
| VAR_ID | VAR_ID | 사전 hit |
