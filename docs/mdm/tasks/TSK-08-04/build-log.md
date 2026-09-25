# TSK-08-04 Build 기록

> 구현 중 기록(변이 검증·설계 이탈·인계)을 모은다. 설계 정본은 design.md.

## B1 — 엔진 `InputContracts` 이식 + 입력 계약 코퍼스 + 두 러너

- `EJ/rule/InputContracts.java`: TS `input-contract.ts`(`computeInputContract`·`alwaysNames`)·`null-safety.ts`(`nullSafety`)·`interpreter.ts`
  (`usedVariables`)·`functions.ts`(`nullPolicy` 표)를 함수 경계·순회 순서 그대로 옮겼다. 공개 API:
  - `compute(vars, rows, kind, resolveType)` — design §2.1 서명 그대로(라벨 없음).
  - `compute(vars, rows, kind, resolveType, Map<Integer,String> labels)` — 라벨 오버로드(아래 「설계 이탈」 1).
  - `alwaysNames(vars, rows)`, `usedVariables(Map ast)`, `nullSafety(Map ast) → NullSafety(required, optional)`.
  - cond 요약의 셀 문자열은 이미 있는 `CellSummary.of` 를 쓴다(TS `cellSummary` 가 이것을 옮긴 것).
- 코퍼스 `ER/contract/input-contract-corpus.json` 21건(하한 12). 사례: `evalex-input-contract.test.ts` 의 사례 전부(PROD_WGT_CALC PV1·PV2,
  R13 Expression 조건 열·열 조건, R14 식 변수 라벨·기본 행, nullSafety 단위 사례는 결과 식 한 열짜리 룰로), QLTY_GRD_JDG v1(06:1324),
  식 변수 구간 op 라벨·무라벨(`_V<id>`), AST 없는 식 변수(화면 pending), DERIVE seq 참조, 결과 열 그룹 열 조건, 비-fail 함수 정책 전부
  (IF 가드 `!=`·`==`, SWITCH 기본값 유무, COALESCE, STR_CONTAINS, INSTR `>`·`==`, MASTER, MASTER_AT), 전위 연산자·표에 없는 함수,
  상수 제외, 대소문자 섞인 이름, 행 정렬(seq→rowId), cond 요약 op 별 문자열.
- 코퍼스 AST 는 테스트 파서(`tests/helpers/parse-expr.ts`)로 만들었고, `InputContractCorpusTest.코퍼스_AST_가_EvalEx_파싱_결과와_같다` 가
  식 65개 전부 EvalEx(`AstExporter.export`) 결과와 같음을 확인한다. expect 는 TS 운영 경로(`computeContract`)로 뽑았고, 06·기존 TS
  테스트에 기대값이 있는 사례(PROD_WGT·PV2·R13·R14·QLTY_GRD_JDG row 3 = BASE_FCT)는 그 기대값과 같은지 눈으로 대조했다.
  생성 스크립트는 커밋하지 않았다(임시 vitest 파일, 생성 뒤 삭제).
- TDD: `InputContracts` 를 빈 계약을 돌려주는 스텁으로 두고 `InputContractCorpusTest` 를 돌려 계약 사례 21건 실패·AST 65건 통과를 확인한 뒤 구현했다.

### 설계 이탈

1. **라벨 오버로드 추가.** 엔진 `RuleVar` 에는 라벨이 없는데 TS cond 요약은 이름 없는 열(식 변수)을 `label ?? _V<varId>` 로 적는다
   (R14 "품명 = A"). design 서명 `compute(vars, rows, kind, resolveType)` 는 그대로 두고 `labels`(var_id → 라벨) 인자를 받는 오버로드를
   더했다. 4인자 판은 라벨 없이(`_V<id>`) 계산한다.
2. **`kind` 인자는 계산에 쓰지 않는다.** TS `computeInputContract` 가 룰 종류를 보지 않으므로 같은 경계를 지키려고 design 서명대로 받기만 한다.
3. **TS 러너는 bare `ruleDefFromStored` 가 아니라 `contract-view.ts` 의 `computeContract` 로 돈다.** `ruleDefFromStored` 는 식 변수 AST·
   `resGrp`·열 조건 AST 를 싣지 않아(분석 입력 전용) 식 변수·결과 열 그룹 사례에서 Java 와 어긋난다. `computeContract` 가 화면의 실제
   입력 계약 경로(`ruleDefFromStored` + varMeta + 서버 AST → `computeInputContract`)다. contract-view.ts 는 고치지 않았다.
4. **코퍼스 모양.** design 은 "analysis-corpus 의 rule 과 같은 모양 + 변수 타입 표"다. 화면 경로 입력을 그대로 싣도록 `rule.meta`
   (`varId, resGrp, grpCond`)와 사례별 `asts`(식 변수 텍스트·열 조건 텍스트 → AST), `types`(대문자 이름 → `dataType, scale, domainId`)를 더했다.
   식 변수는 저장 형태대로 `exprVar: true` + `varName` 에 식 텍스트다. expect 는 이름만 싣고 두 러너가 `types` 로 `VarType` 을 만들어
   `VarType` 전체(이름·타입·scale·domainId)를 순서까지 견준다.

5. **`EngineContractSchemaTest` 의 Java 전용 목록에 `InputContracts.NullSafety` 를 더했다.** 이 가드는 엔진 expr·rule 패키지의 record·enum 이
   스키마 대응표나 Java 전용 목록에 있어야 한다고 본다. `NullSafety` 는 TS `nullSafety` 반환 모양이고 짝은 입력 계약 코퍼스가 묶는다.
   NULL 안전 문맥(FAIL/SAFE)·인자 문맥(fail/safe/inherit)은 enum 을 새로 두지 않고 TS 문자열 리터럴 그대로 상수로 두었다.
6. design.md §2.1(라벨 오버로드)·§2.3(`RuleDefinitionAssembler` 의 라벨·`refVars` 규칙)에 위 경계를 한 줄씩 더했다 — 서명이 바뀐 설계 변경이라서다.

### 인계 — B4(`RuleDefinitionAssembler`)가 지켜야 할 입력 계약 경계

화면(`computeContract`)과 같은 계약을 얻으려면 조립기가 엔진 `RuleVar` 를 다음처럼 채워야 한다(코퍼스 러너의 변환 도우미
`InputContractCorpusTest.vars` 가 같은 규칙이다).

- 식 변수(`exprVar`)·Expression 조건 열은 `varName = null`. 식 변수는 `exprText` = 저장 식 텍스트(trim), `exprAst` = 저장 AST.
- **`refVars` 는 null 로 둔다(또는 `usedVariables(exprAst)` 와 같은 값·순서로).** `InputContracts` 는 `refVars != null` 이면 그 목록을 쓰고
  null 일 때만 AST 를 걷는다(TS `refVars ?? usedVariables(ast)` — 빈 목록도 "주어짐"). 화면은 AST 가 있으면 `refVars` 를 비워 두므로,
  DB 의 참조 변수 칼럼을 다른 순서·대소문자로 넣으면 always 가 화면과 달라진다.
- 결과 열 `resGrp` 는 공백뿐이면 null, 아니면 저장값 그대로(trim 하지 않음). `grpCondAst` 는 열 조건 AST.
- cond 요약을 화면과 맞추려면 `compute(..., labels)` 에 `ResolvedVar.label` 을 var_id 별로 넘긴다.
- `resolveType` 이 null 을 돌려주면 `IllegalArgumentException`(TS 는 Error 를 던진다).

### 보고 — TS 동작 중 이상해 보이지만 그대로 옮긴 것

1. `&&`·`||` 의 양쪽은 바깥 문맥과 무관하게 늘 FAIL 로 본다 — `(A && B) == C` 처럼 `==` 안에 있어도 A·B 는 필수가 된다.
2. 입력 계약의 `excluded` 는 룰의 **모든** 결과 변수 이름이다(seq 무관). DERIVE 에서 뒤 seq 결과를 읽는 식도 계약에서 빠진다(그 식 자체의
   거부는 08-03 `checkDeriveExprs`·B2 `RuleExpressionChecks` 몫).
3. 구간 op cond 요약은 셀 요약 문자열에서 **첫** "변수" 한 곳을 열 이름으로 바꾼다 — 하한 값에 "변수" 글자가 있으면 그 자리가 바뀐다.
4. `IF` 가드 분기는 인자가 정확히 3개일 때만이다(아니면 `args` 정책 `safe, inherit, inherit` 의 마지막 칸을 반복).

## B7 — FE 기반(카드 공유 상태·표 카드·칠하기·입력 줄·케이스 모델·API)

- `P/state/workbench-context.tsx`: `RuleWorkbenchProvider`·`useRuleWorkbench`·순수 `workbenchReducer`. `page.tsx` 가 카드 목록을 감싼다.
  Provider 밖(카드 단독 렌더 테스트)에서는 아무것도 나누지 않는 기본값이다.
- `P/decision-table/DecisionTableCard.tsx`: ① 편집 중인 표(`tableStoredRows`)를 올린다(내용 서명이 같으면 rev 불변) ② `runShownOnTable` 이 참일
  때만 `testMarksOf` 로 칠한다 ③ BODY 결과 뒤 rev 가 바뀌면 context 가 결과를 지우고 `dt-test-stale` 안내 ④ 저장 거부 메시지 `dt-save-rejected`
  (row_version 충돌 MDM001 은 제외 — useRuleEdit 의 다시 불러오기 안내 몫), 편집 상태 유지. 저장 뒤 서버 저장 검사만 낸 이슈는 `dt-server-checks`.
- `P/decision-table/columns.ts`: `CellMark.t`, `TableMarks.test`, 셀 클래스 4개, 표시 행 `__hit`, 행 클래스 상수 `TEST_HIT_ROW_CLASS`.
- `P/decision-table/analysis.ts`: `ANALYZER_CODES`(8종)·`serverOnlyIssues`, `sameIssues` 는 분석기 코드만 견준다(I26).
- `P/value-test/test-input.ts`·`test-marks.ts`·`case-model.ts`, `P/api.ts`(`runValueTest`·`saveTestCase`·`deleteTestCase`, 표 행 → grid 행 도우미를
  표 저장과 함께 쓴다), `P/types.ts`(`TestCaseView`·`ValueTestResult` 등, hits·trace 는 `engine-contract.generated` 의 `RuleHit`·`RowTrace`).
- shared `grid.css`: `ag-row-test-hit`·`cell-test-hit`·`cell-test-false`·`cell-test-chosen`·`cell-test-dim`(의미 토큰만).
- TDD: 순수 테스트 네 파일(`value-test-input`·`value-test-marks`·`case-model`·`analysis-same`)을 먼저 쓰고 빨강(모듈 없음·`serverOnlyIssues` 없음)을
  확인한 뒤 구현했다. 렌더 테스트 `decision-table-value-test.test.ts`(7건)는 구현 뒤에 썼고, 변이 검증에서 카드의 칠하기 조건 변이를 잡는 것을 확인했다.

### 설계 이탈

1. **`inputFields` 서명.** design 은 `inputFields(rule: RuleDef, view, varMeta)` 다. 화면의 실제 입력 계약 경로가 `computeContract`(B1 이탈 3)라서
   `inputFields(src: ContractSource, asts, candidates?)` 로 두고 계약 → 입력 줄 변환은 `fieldsOfContract(contract, vars, candidates)` 로 뗐다.
   계약 계산이 던지면(편집 중인 셀) 입력 줄 없이 `failure` 를 돌려준다. 케이스 "불러오기"용 `inputFromCase` 를 더했다.
2. **그룹 고른 열·흐린 열은 행마다.** design `chosenVarIds·dimmedVarIds`(집합)는 COLLECT 처럼 적중 행마다 고른 열이 다르면 한 열이 강조·흐림을 함께
   받는다. `chosen·dimmed: Map<rowId, Set<varId>>` 로 두었다. 고른 열이 없으면(`groupChoices` 값 null) 그 그룹 열을 모두 흐리게 한다.
3. **VERSION 결과 칠하기 조건.** "같은 버전" 에 더해 같은 row_version 이고 저장 안 한 변경이 없을 때만 칠한다(보이는 정의가 그 저장 버전일 때만).
   표를 저장하면 row_version 이 바뀌어 옛 VERSION 결과는 표에서 사라진다. 결과 카드(⑤)에는 남는다.
4. **기본 행 적중.** 엔진은 기본 행을 적용하면 hits 를 비운다(`RuleEvaluator` defaultApplied). 칠하기·`expectedFromResult` 는 보이는 정의의
   기본 행 row_id 를 인자로 받는다.
5. **안내 문구 하나로.** §6.7 "표가 바뀌어 결과를 지웠다. 다시 돌린다" 와 §3.4 V3 "다시 돌리세요" 를 "표가 바뀌어 값 테스트 결과를 지웠습니다.
   다시 돌리세요." 로 합쳤다(`dt-test-stale`). B9 e2e 는 이 문구(또는 "다시 돌리세요")로 확인한다.
6. **view 를 다시 불러와도 편집을 지우지 않는다(design 에 없는 변경).** 표 카드가 `[view]` 마다 표를 초기화하면, 값 테스트 편집본을 돌린 뒤
   "케이스로 저장"(runWrite → reload, §6.6)이 저장 안 한 표 편집과 BODY 결과를 지운다(e2e V3→V4 흐름). 표 정의 서명(룰·종류·버전·그 버전
   row_version·적중 정책·editable·vars·rows)이 바뀔 때만 초기화한다. 표 저장·열 적용·충돌 뒤 다시 불러오기는 row_version 이 바뀌므로 그대로
   초기화된다. reload 가 dirty 목록을 비우므로 `setDirty` 를 view 마다 다시 알린다.
7. **기대 JSON 숫자.** NUMBER 결과 변수 값은 서버 `toPlainString` 글자를 따옴표 없이 JSON 숫자로 싣는다(06:1322 `"PRC_FCT":1.05`). 숫자
   모양(`^[+-]?\d+(\.\d+)?$`)이 아니면 문자열로 둔다.

### 보고

- 도메인 표준 식은 입력 줄에 보이지 못한다 — view 의 `varMeta` 에 표준 식이 없고 `ResolvedVar` 에는 `domainName` 만 있다(`ResolvedVar` 칼럼 불변 I31).
  예시 값도 컬럼 사전에 칼럼이 없어 보이지 않는다(F13).
- `buildInputJson` 은 값을 문자열 그대로 보낸다(§3.3). 숫자·불린 변환은 서버 엔진 몫이다.

### 인계 — B8(카드 ④⑤⑥)

- context: `useRuleWorkbench()` → `{ tableDraft{ruleId, ver, hitPolicy, rows(StoredRow[]), dirty, rev} | null, testRun, setTestRun(run|null),
  testRunCleared, colDirty }`. BODY 를 돌릴 때는 `tableDraft.rev` 를 `run.rev` 에, VERSION 은 그 버전의 `rowVersion` 을 `run.rowVersion` 에 싣는다
  (`TestRunView{ruleId, target, ver, rowVersion, rev, result}`). 응답이 왔을 때 `tableDraft.rev` 가 이미 달라졌으면 표에 칠하지 않는다.
- API: `runValueTest({ruleId, target, ver, hitPolicy?, rows?(TableSaveRow — tableDraft.rows 에서 rowId·rowKind·cells·note), inputJson, runCases?})`,
  `saveTestCase(ruleId, {caseId?, rowVersion?, caseName, inputJson, expectedJson?, description?})`, `deleteTestCase(ruleId, caseId, rowVersion)`.
- 모델: `inputFields(src, asts, view.varCandidates)`(src 는 편집본이면 `{...contractSourceOfView(view,"current"), hitPolicy: tableDraft.hitPolicy,
  rows: tableDraft.rows}`, 다른 버전이면 `viewRule(ruleId, ver)` 로 받은 view 의 `contractSourceOfView`), `buildInputJson`, `inputFromCase`,
  `expectedFromResult(result, vars, defaultRowId)`, `hitValue`, `caseBadge`, `testMarksOf`(결과 카드의 다른 버전 표).
- 식 변수·열 조건 AST 는 `InputContractSection` 처럼 `serverParse` 로 받아야 계약에 들어간다(없으면 `pending`).
- 새 data-testid: `dt-save-rejected`, `dt-server-checks`, `dt-test-stale`, `dt-test-shown`. 셀 클래스는 `.cm-data-grid .ag-cell` 아래에서만 먹으므로
  결과 카드의 다른 버전 표도 shared `AgDataGrid` 로 그려야 같은 색이 난다.
- B4 에게: 기대 JSON 의 숫자는 JSON 숫자(위 7), 결과 값은 문자열로 온다고 보고 비교해야 한다(I24).

### 인계 — B9(e2e)

- 그리드 칸·행 클래스 연결(`cellRules` 의 `t` → `cell-test-*`, `rowClassOf` → `ag-row-test-hit`)은 단위 테스트가 잡지 못한다(렌더 테스트는 그리드
  밖만 본다). e2e V2·V3 은 정확한 클래스 이름(`ag-row-test-hit`, `cell-test-false`)으로 확인한다.
- 저장 거부 때 표 아래 `dt-save-rejected` 와 함께 기존 `ErrorModal` 도 뜬다. S5·S6·V6 은 다음 조작 전에 모달을 닫는다.

## B2 — 검사기 핵심(`BL/common/rule/check/`, 원장 비의존)

- 만든 것: `RuleLimits`·`RuleSaveIssueCode`·`RuleSaveTarget`·`RuleCheckInput`(+`DraftRow`)·`RuleCheckReport`·`RuleCellRules`·`RuleExpressionChecks`·
  `RuleCompleteness`·`RuleGenerateTry`·`RuleSaveValidator`(`@Component`)·`RuleSaveRejections`, 새 위치의 `RuleSaveCheck`·`RuleSaveContext`.
  옛 `dme/ruleEdit/service/RuleSaveCheck`·`RuleSaveContext` 는 그대로 두었다(삭제는 B3).
- 테스트(BLT, 스프링 없음): `RuleCellRulesTest`(320, op 허용 행렬 270 파라미터 포함)·`RuleExpressionChecksTest`(20)·`RuleCompletenessTest`(4)·
  `RuleGenerateTryTest`(5)·`RuleSaveValidatorTest`(11, 해석기·빈 공급자는 Mockito)·픽스처 `CheckFixtures`. 모두 360건.
- TDD: 로직 클래스 다섯을 입력을 그대로 돌려주는 스텁으로 두고 360건 중 235건 실패를 확인한 뒤 구현했다.
- 관련 테스트: `:mdm:lib:test` 전체 1026건 통과, `:mdm:api:test --tests '*RuleTableServiceTest' --tests '*RuleColumnsServiceTest'
  --tests '*MdmBusinessRuleMigrationTest'` 46건 통과(새 `@Component` 가 api 컨텍스트에 주입되고 `DefinitionLookup` 빈 0개 가드도 그대로다).

### 설계 이탈

1. **`ANALYSIS_FAILED` 를 enum 에 더했다.** §7.12 에는 있고 §6.2 목록에는 없다. 분석기 예외를 이 ERROR 하나로 바꿔 저장을 막는다.
2. **이슈 맵은 값이 없는 칸을 싣지 않는다.** §6.2 는 `lower: null, upper: null` 을 적었지만 `RuleIssueMaps` 모양(varId·lower·upper 는 있을 때만)에 맞췄다.
   모양은 `{code, severity, rowIds, varId?, message}` 다. 만드는 도우미는 `RuleCheckReport.issue`·`cellIssue`·`where` 이고 B3·B6 빈도 이것을 쓴다.
3. **기본 단계에 ERROR 가 있으면 `RuleSaveCheck` 빈을 부르지 않는다.** 정규화되지 않은 셀을 원장 검사가 다시 보지 않게 하려는 것이다.
   COLUMNS 는 기본 단계를 돌리지 않으므로 빈이 늘 불린다. 분석기도 셀·미완성에 ERROR 가 없을 때만 부른다(§7.12).
4. **`report.issues()` 에 분석기 이슈가 섞인다**(거부 판단에 분석기 ERROR 가 들어가므로). 분석 이슈를 따로 싣는 호출자는
   `report.nonAnalysisIssues()`(코드가 `RuleIssueCode` 이름이 아닌 것)를 쓴다.
5. **1 타입 op 는 13종이다.** design §6.3 은 "단항 12종"이라 적었지만 06 op-code 표(정본)의 1 타입 op 는 EQ·NE·LT·LE·GT·GE·IN·NOT_IN·CODE_IN·CONTAINS·
   INSTR·IS_NULL·NOT_NULL 13개다. 06 표를 따랐다.
6. **거부 메시지 요약은 `"CODE 메시지"` 다.** 셀 이슈 메시지가 이미 "행 r·열 라벨: " 로 시작하므로(§6.2) §2.2 의 `"CODE[행 r·열 v] 메시지"` 로
   다시 적으면 겹친다. 예: `룰 저장 거부: BOUND_ORDER 새 행 -1·COIL_THK: 하한 2.5 이(가) 상한 1.6 보다 크다; OVERLAP …`. details 는
   `ErrorDetail.of(MDM021)` 뒤 이슈마다 `ofGrid(null, "row:"+rowIds 쉼표 연결, "var:"+varId, code, message)`.
7. **외부 이름 판정은 검사기 밖에서 넣는다.** `RuleExpressionChecks` 는 순수 클래스로 두고 `Scope.external()`(이름 → 컬럼 사전 또는 다른 룰의 최신
   RELEASED 결과인가)를 받는다. `RuleSaveValidator` 가 08-03 `typeSourceOf` 와 같은 방식(이름 하나짜리 임시 변수를 `RuleVarTypeResolver` 에
   물어 COLUMN·RULE_RESULT 인지)으로 만들고 요청 안에서 캐시한다. 이 룰의 조건 변수(프로그램 변수 포함)는 `Scope.condNames` 로 본다.
8. **셀 규칙에서 design 이 정하지 않은 자리**:
   - 결과 셀의 `{"op":"NA"}` 는 OP_NOT_ALLOWED(06:387 "모든 결과 셀을 채우게 해 사실상 금지"), Value 열의 식 셀은 OP_NOT_ALLOWED, 값도 식도 없는
     결과 셀은 INCOMPLETE_RESULT. Expression 결과 열의 `val` 은 상수로 받아 타입만 본다.
   - Expression 조건 열은 NA 와 식 셀만 받는다(다른 op·빈 셀은 OP_NOT_ALLOWED). op-code 열의 식 셀도 OP_NOT_ALLOWED.
   - Number 변수의 `=` 값에 `%`·`_` 가 있으면 TYPE_LITERAL 대신 PATTERN_NOT_STRING 으로 알린다.
   - 구간 op 의 "빈칸"은 키 없음·null·공백뿐인 문자열이다.
   - 데이터 타입 DATE(초 정밀도 등, 일자 String 이 아닌 것)는 EQ·IS_NULL·NOT_NULL·NA 만 받는다(06 "초 정밀도 DATE 에는 열지 않는다").
   - `RuleLimits.MAX_TEXT_CHARS`(100)는 CONTAINS·INSTR 과 함께 IN 카테고리 값에도 건다. 패턴 길이 상한은 연속 `%` 를 접은 뒤 잰다.
   - RANGE_IN_EXPR(같은 변수 대소 비교 2회)는 조건 식 셀에만 건다. 결과 식의 `IF(A > 1 && A < 3, …)` 는 범위 자리 문제가 아니다.
9. **테스트 파일을 더했다**: design 이 적은 네 파일 밖에 `RuleSaveValidatorTest`(적용 지점·순서·빈 호출·거부 예외)와 픽스처 `CheckFixtures`.

### 인계 — B3(`RuleTableService`)

- 입력: `checkRows` 가 돌려준 행을 `DraftRow(rowId, seq, rowKind, RuleCellsCodec.parse(cells))` 로(seq 는 NORMAL 순번, DEFAULT 0), 변수는
  `resolver.resolve(id, ver, rawVars)`, `rawVars = queries.vars(id, ver)`. 행 수·셀 길이 상한(`RuleLimits.MAX_ROWS`·`MAX_ROW_CELLS_CHARS`·
  `MAX_TOTAL_CELLS_CHARS`)은 검사기가 보지 않는다 — design §6.1 흐름의 `limits(rows)` 는 B3 몫이다.
- `report.hasErrors()` 면 `throw RuleSaveRejections.reject(report.issues())`(ERROR 만 싣는다). 아니면 `report.normalizedRows()` 의 셀을
  `RuleCellsCodec.write` 로 저장한다(Expression 셀의 `ast` 는 서버 AST 로 바뀌어 있다).
- 응답 issues = 커밋 뒤 분석(`RuleIssueMaps.of`) + `report.nonAnalysisIssues()` 의 임시 row_id 를 `rowIdMap` 으로 바꾼 것.
- 기존 테스트에서 새로 거부될 수 있는 것: 결과 셀 `{"op":"NA"}`, 조건 셀이 빠진 NORMAL 행, 한쪽 빈 구간(이제 GE/GT/LE/LT 로 저장된다).

### 인계 — B4(값 테스트 BODY)·B6(원장 검사 빈)

- B4: `validate(… TEST_BODY)` 는 셀·식·생성만 돈다. `report.brokenRowIds()` = ERROR 이슈의 행, `report.issues()` 가 `cellErrors` 의 원천이다
  (`{code, severity, rowIds:[r], varId, message}`). 미완성·분석·빈은 돌지 않는다.
- B6: 빈은 `targets()` 로 적용 지점을 고른다(기본 TABLE·STORED). `RuleSaveContext.rows` 는 정규화한 행이고 새 행 번호는 음수다. COLUMNS·
  TEST_BODY 에서는 `analysis` 가 비어 있다. 기본 단계에 ERROR 가 있으면 빈은 불리지 않는다(이탈 3). 이슈는 `RuleCheckReport.issue`·`cellIssue` 로 만든다.

### 보고

- **변이 1건은 잡히지 않는다(등가 변이).** `RuleGenerateTry` 의 `= 패턴 정규식 Pattern.compile` 을 끄는 변이다. 생성기 정규식은 메타문자를 모두
  `\` 로 막고 `.`·`.*` 만 남기므로(06:158) 생성기가 받아들인 값에서 `Pattern.compile` 이 실패할 입력이 없다. 06 이 요구하는 단계라 코드는 두었다.
- 이 워크트리에서 다른 단위(B7·B8)가 동시에 파일을 바꾸고 있었다. B2 커밋에는 B2 파일만 stage 했다.

## 변이 검증 기록

| 불변 규칙 | 변이 | 잡은 테스트 | 결과 |
|---|---|---|---|
| I28 | Java COALESCE 정책을 fail 로 | `InputContractCorpusTest`(fail-fast) | 잡힘 |
| I28 | Java 기본 행을 NORMAL 행 앞에 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java 룰 결과 변수 제외 끔 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java 이름 중복 제거를 대소문자 구분으로 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java IF NULL 가드 분기 끔 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java SWITCH 기본값 자리(짝수 인자 끝) 무시 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java cond 라벨 무시(`_V<id>` 만) | `InputContractCorpusTest` | 잡힘 |
| I28 | Java `&&` 왼쪽 `!= NULL` 가드 끔 | `InputContractCorpusTest` | 잡힘 |
| I28 | Java Expression 조건 셀 참조를 always 에서 뺌 | `InputContractCorpusTest` | 잡힘 |
| I28 | TS COALESCE 정책을 fail 로(`functions.ts`) | `evalex-input-contract-corpus.test.ts` › prod-wgt-pv2-coalesce | 잡힘 |
| I28 | TS 열 조건 참조를 always 에서 뺌(`input-contract.ts`) | `evalex-input-contract-corpus.test.ts` › expression-column-and-grp-cond | 잡힘 |
| I26 | `sameIssues` 의 분석기 코드 필터 제거 | `analysis-same.test.ts` › 비분석 코드가 앞뒤로 더 있어도 참 | 잡힘 |
| I33 | `runShownOnTable` BODY rev 비교 무시 | `value-test-marks.test.ts` › BODY 결과는 같은 룰·버전·rev 일 때만 | 잡힘 |
| I33 | `runShownOnTable` 버전 비교 무시 | `value-test-marks.test.ts` › BODY 결과는 같은 룰·버전·rev 일 때만 | 잡힘 |
| I33 | `runShownOnTable` 룰 비교 무시 | `value-test-marks.test.ts` › BODY 결과는 같은 룰·버전·rev 일 때만 | 잡힘 |
| I33 | `runShownOnTable` VERSION 의 dirty 검사 무시 | `value-test-marks.test.ts` › VERSION 결과는 … 변경이 없을 때만 | 잡힘 |
| I33 | `runShownOnTable` VERSION 의 row_version 비교 무시 | `value-test-marks.test.ts` › VERSION 결과는 … 변경이 없을 때만 | 잡힘 |
| I33 | `testRunAfterTableChange` 가 BODY 결과 뒤 rev 변경에도 결과 유지 | `value-test-marks.test.ts` › BODY 결과 뒤 표가 바뀌면 지우고 안내 | 잡힘 |
| I33 | `DecisionTableCard` 가 `runShownOnTable` 없이 늘 칠함 | `decision-table-value-test.test.ts` › VERSION 결과는 … 칠하고 | 잡힘 |
| I33 | `testMarksOf` 가 적중 행·평가 안 한 행에도 첫 거짓 칸을 칠함 | `value-test-marks.test.ts` › 적중한 행의 firstFalseVarId … 칠하지 않는다 | 잡힘 |
| I5 | 한쪽 빈 구간 하한 `<=`→GE·`<`→GT 를 뒤바꿈 | `RuleCellRulesTest` › 한쪽_빈_구간은_1_타입_op_로_바꾼다 | 잡힘 |
| I5 | 경계 비교를 숫자도 문자열로 | `RuleCellRulesTest`(fail-fast) | 잡힘 |
| I5 | 양쪽 빈칸 거부 끔 | `RuleCellRulesTest`(fail-fast) | 잡힘 |
| I6 | 목록 중복 제거 끔 | `RuleCellRulesTest`(fail-fast) | 잡힘 |
| I6 | 목록 정렬 끔 | `RuleCellRulesTest` › 숫자_목록은_값으로_중복을_지우고_앞_원소를_남겨_값_순서로_정렬한다 | 잡힘 |
| I6 | 원소 수 상한 +1 | `RuleCellRulesTest` › 목록_원소_수_상한과_같으면_통과하고_넘으면_거부한다 | 잡힘 |
| I7 | 연속 `%` 접은 값을 저장하지 않음 | `RuleCellRulesTest` › 연속한_퍼센트는_하나로_접어_저장한다 | 잡힘 |
| I7 | `%` 개수에 막은 `\%` 도 셈 | `RuleCellRulesTest`(fail-fast) | 잡힘 |
| I7 | 일자 도메인 와일드카드 거부 끔 | `RuleCellRulesTest` › 일자_도메인은_와일드카드를_거부한다 | 잡힘 |
| I8 | CONTAINS·INSTR·IN 카테고리 빈 문자열 허용 | `RuleCellRulesTest` › IN_카테고리는_빈_값을_거부한다 | 잡힘 |
| I9 | 숫자 리터럴에 지수 허용 | `RuleCellRulesTest` › 숫자_리터럴이_아니면_거부한다[1e3] | 잡힘 |
| I9 | 불린 대문자 정규화 끔 | `RuleCellRulesTest` › 결과_Value_도_결과_변수_타입으로_검사한다 | 잡힘 |
| I10 | CONTAINS·INSTR 를 모든 데이터 타입에 허용 | `RuleCellRulesTest` › op_허용_행렬[1 열 NUM CONTAINS] | 잡힘 |
| I11 | 구간 op 범위 자리 검사 끔 | `RuleCellRulesTest` › op_허용_행렬[1 열 NUM `<= 변수 <=`] | 잡힘 |
| I11 | 식 안 같은 변수 대소 비교 기준 2회 → 3회 | `RuleExpressionChecksTest` › 같은_변수를_대소_비교로_두_번_이상_견주면_거부한다 | 잡힘 |
| I12 | 서버 AST 덮어쓰기 끔 | `RuleExpressionChecksTest` › 화면이_보낸_ast_를_서버_AST_로_덮어쓴다 | 잡힘 |
| I12 | 모르는 변수 검사 끔 | `RuleExpressionChecksTest` › 모르는_변수는_거부한다 | 잡힘 |
| I12 | DERIVE 결과 식 자기 참조 허용(`>=` → `>`) | `RuleExpressionChecksTest` › 산출_룰_결과_식은_앞_seq_결과만_읽는다 | 잡힘 |
| I12 | `ExpressionChecker` 문제(함수·정규식·MASTER 인자) 버림 | `RuleExpressionChecksTest` › MASTER_인자_모양이_틀리면_거부한다 | 잡힘 |
| I13 | 조건 셀 생성 텍스트 컴파일 끔 | `RuleGenerateTryTest` › 정규화하지_않은_한쪽_빈_구간은_생성기가_거부한다 | 잡힘 |
| I13 | 결과 Value 셀 생성 끔 | `RuleGenerateTryTest` › 생성기가_막는_값은_셀_단위로_거부한다 | 잡힘 |
| I13 | `=` 패턴 정규식 `Pattern.compile` 끔 | `RuleGenerateTryTest` | 안 잡힘(보고) — 등가 변이, B2 「보고」 |
| I13 | 생성해 보기에 정규화 전 셀을 넣음(§7.1 순서) | `RuleSaveValidatorTest` › 정규화한_셀로_생성해_보고_정규화한_행을_돌려준다 | 잡힘 |
| I30 | `RuleCellsCodec.parse` 가 문자열 값을 trim | `RuleCellsCodecTest` › 값을_고치지_않고_바이트_단위로_왕복한다 | 잡힘 |

- Java 변이는 `:maru-mdm-engine:test` 태스크 실패(컴파일 통과 뒤 테스트 실패)로 확인했다. enum → 문자열 상수로 바꾼 뒤 최종 코드에 Java 변이 9개를 다시 돌려 모두 잡혔다. fail-fast 첫 실패 사례 이름은 로그에 남기지 않았다.
- TS 변이는 확인한 뒤 곧바로 `git checkout` 으로 되돌렸다(TS 파일 무변경, I28).
- B2 변이는 스크립트 하나(변이 → `:mdm:lib:test --tests <클래스> --fail-fast` → `git checkout`)를 `heavy.sh` 로 감싸 세 번에 나눠 돌렸다. 변이마다 `git diff` 로 실제로 바뀐 것을 확인했다. "(fail-fast)" 로 적은 행은 첫 실패 사례 이름을 로그에서 뽑지 못한 것이다.
