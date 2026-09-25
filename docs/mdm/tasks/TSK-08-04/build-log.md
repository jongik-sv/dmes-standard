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

## B8 — FE 카드 ④ 값 테스트·⑤ 테스트 결과·⑥ 테스트 케이스

- `P/cards/ValueTestCard.tsx`(④): 대상 선택(`vt-target`, 값 `BODY`·`V:<ver>`) — `editable` 이고 선택 버전이 DRAFT 면 `편집본 · 버전 N 저장 전` 이 맨 앞
  기본값(I34), 그 뒤 `버전 N · 상태`. 모드 설명(`vt-mode`), 열 초안 dirty 안내(`vt-col-draft`, 편집본만). 입력 줄은 `inputFields`(편집본은 표 카드가 올린
  표, 다른 버전은 `viewRule` 로 받은 정의)이고 식 AST 는 `InputContractSection` 과 같은 조건(`canParseOnServer`)으로 `serverParse`. 줄마다 라벨·물리명·
  타입 배지·계약 배지·키 보냄(`vt-key-<NAME>` 안의 확인란)·값 칸(`vt-input-<NAME>`, placeholder "비우면 NULL", 키 보냄 끔이면 비활성)·설명·도메인.
  "돌리기"(`canDo("execute")`) → `runValueTest` → `setTestRun`. 서버 오류는 카드 안 `vt-error` 에 보인다. "케이스로 저장" 은 이름 칸(`vt-case-name`)이
  비면 꺼지고, 방금 같은 대상·같은 입력으로 돌린 결과가 있을 때만 `expectedFromResult` 를 기대값으로 싣는다.
- `P/cards/TestResultCard.tsx`(⑤): `vt-result-empty`(결과 없음), `vt-result-target`(대상·판정함/판정 오류·evalTs), `vt-result-errors`(단계·코드·메시지),
  `vt-result-values`(결과 변수 seq 순, 결과 열 그룹은 그룹 이름 한 칸 + "그룹 열 N개 가운데 라벨 물리명"), `vt-result-hits`("{seq}행 (row_id id)", 기본 행이면
  "어느 행도 참이 아니어서 기본 행 (row_id id)"), `vt-result-warnings`, `vt-result-cell-errors`(깨진 셀·뺀 행). 표에 칠했으면(`runShownOnTable`)
  `vt-result-on-table`, 아니고 VERSION 결과면 그 버전의 읽기 전용 표 `vt-result-table`(shared `AgDataGrid` + `buildTableColumns`·`displayRows`·`testMarksOf`,
  행 클래스 `ag-row-test-hit`), BODY 인데 rev 가 달라졌으면 `vt-result-stale`.
- `P/cards/TestCaseCard.tsx`(⑥): 줄 `tc-row-<caseId>`, 빈 상태 `tc-empty` "테스트 케이스가 없습니다", 머리 "모두 돌리기"(④ 의 대상·입력 + `runCases`), 결과 배지
  `tc-badge-<caseId>`(`caseBadge`) 뒤에 불일치 `키 기대 ≠ 실제`·판정 오류, 동작 "불러오기"·"기대값 갱신"(마지막 케이스 결과가 OK 일 때)·"삭제"(한 번 더 눌러
  "삭제 확인"). 쓰기는 `runWrite`(뒤에 view 다시 불러오기). 모두 돌리기 오류는 `tc-error`.
- `P/value-test/run-request.ts`(생성): `targetOptions`·`resolveTarget`·`targetKey`·`targetLabel`·`bodyTable`·`prepareRun`(요청 + `TestRunView` 의 rev·rowVersion)·
  `useTargetView`(다른 버전 view 를 룰·버전·row_version 마다 한 번 받아 모듈 캐시, 테스트는 `clearVersionViewCache`)·`defaultRowIdOf`.
- `P/cards.ts`: header·versions·table·valueTest(8)·testResult(8)·testCases(16)·usage.
- TDD: `value-test-cards.test.ts`(14건)를 먼저 쓰고 모듈이 없어 실패하는 것을 확인한 뒤 구현했다. 변이 7개 중 "다른 입력의 결과를 기대값으로" 가 처음에
  잡히지 않아 사례(돌린 뒤 입력을 바꾸고 저장 → 기대값 없음)를 더했다.

### 설계 이탈

1. **`state/workbench-context.tsx`(B7 파일)에 칸 둘을 더했다.** ⑥ "모두 돌리기" 는 ④ 가 고른 대상·입력으로 돌아야 하고(§6.7), "불러오기" 는 ④ 입력 칸을
   채워야 하는데 두 카드는 형제 슬롯이라 props 로 나눌 수 없다. `valueTestInput{ruleId, target, ver, inputJson}`·`publishValueTestInput`(④ 가 올린다),
   `caseLoad{ruleId, inputJson, seq}`·`loadCase`(⑥ 가 올리고 ④ 가 seq 가 오를 때 한 번 채운다)를 더했다. 기존 칸·reducer 는 그대로다.
2. **`value-test/run-request.ts` 를 새로 두었다.** 대상 선택지·요청 모양·다른 버전 정의 캐시를 ④⑤⑥ 이 함께 써서 한 곳에 모았다(§2.5 표에 없는 파일).
3. **값 테스트 오류는 ErrorModal 이 아니라 카드 안에 보인다.** 값 테스트는 쓰기가 아니라 `runWrite`(성공 뒤 view 다시 불러오기)를 쓰지 않고
   `runValueTest` 를 바로 부른다. MDM021 등 서버 거부는 ④ `vt-error`(모두 돌리기는 ⑥ `tc-error`)에 남는다(e2e V5). 케이스 저장·갱신·삭제는 쓰기라
   `runWrite` 를 쓴다(실패는 기존 ErrorModal).
4. **같은 버전 VERSION 결과라도 표에 저장 안 한 변경이 있으면 ⑤ 에 그 버전 표를 따로 그린다.** 표 카드는 그때 칠하지 않으므로(B7 이탈 3) 결과를 볼 자리가
   없어진다. "대상이 보이는 표와 다르면" 의 판정을 `runShownOnTable` 거짓으로 두었다.
5. **"기대값 갱신" 은 "모두 돌리기" 로 그 케이스의 결과(판정함)가 있을 때만 켠다.** 기대값은 서버가 준 케이스 결과(`results`·`hit`)를 `expectedFromResult`
   모양으로 바꿔 만든다(hit 은 서버 표현 그대로).
6. **카드 폭은 design §2.5 대로 ④ 8칸·⑤ 8칸이다**(시안은 6·10).
7. **렌더 테스트 describe 에 `timeout: 30_000`.** 다른 스위트와 함께 돌 때 한 사례가 5.2초가 나온 적이 있어 선례(`engine-contract.generated.test.ts`)처럼 늘렸다.

### 보고

- 입력 줄에 도메인 표준 식·예시 값은 보이지 않는다(B7 「보고」와 같다 — view 에 표준 식이 없고 컬럼 사전에 예시 칼럼이 없다, F13).
- 식 AST 는 `validate` 권한이 있고 `editable` 일 때만 받는다(08-03 `canParseOnServer` 관례). 비소유 담당자가 식 변수가 있는 룰을 값 테스트하면 그 식이 읽는
  변수는 입력 줄에 없고 `vt-pending` 안내만 나온다(판정은 서버가 하므로 키를 못 넣을 뿐이다).
- `rule-edit-page.test.ts` 는 카드 수·순서를 고정하지 않아 고치지 않았다(§3.3 의 "7개로 바꾼다" 대상 없음). 카드 순서는 `value-test-cards.test.ts` 가 고정한다.

### 인계 — B9(e2e)

- 대상 고르기: `vt-target` 의 `selectOption({ label: "버전 1 · RELEASED" })` 또는 값 `V:1`, 편집본은 값 `BODY`.
- 입력: `vt-input-<NAME>`, 키 보냄 끄기는 `vt-key-<NAME>` 안의 `input[type=checkbox]`. 끄면 값 칸이 비활성이다.
- V2: 다른 버전 결과는 `vt-result-table` 안의 `.ag-row-test-hit`·`.cell-test-false`. V3: 편집본 결과는 표 카드의 `dt-test-shown`·⑤ `vt-result-on-table`,
  키 보냄 끔 → ⑤ `vt-result-errors` 에 `MISSING_KEY`.
- V4: `vt-case-name` 에 이름 → ④ "케이스로 저장"(view 다시 불러온 뒤 ⑥ 에 새 줄), ⑥ "모두 돌리기" → `tc-badge-<id>` 문구 "통과"·"실패 · <키>"·"돌려 보기만".
- V5: ④ `vt-error` 에 서버 메시지(MDM021).

## B3 — `RuleTableService` 재배치·거부·응답 매핑

- `BL/dme/ruleEdit/service/RuleTableService.java`: 트랜잭션 안 `beginDraftWrite → hitPolicy → rawVars(한 번 읽음) → checkRows → limits(rows) →
  resolver.resolve → RuleSaveValidator.validate(TABLE) → ERROR 면 RuleSaveRejections.reject(report.issues())` 뒤에야 발급·삭제·INSERT·HIT_POLICY 를 쓴다
  (§6.1). 검사기에 넘기는 적중 정책은 트랜잭션 안에서 검사한 값(DERIVE 는 null), 행은 임시 번호 그대로·seq 는 INSERT 와 같은 규칙.
  INSERT 와 응답 `rows.cells` 는 `RuleCellsCodec.write(normalizedRows[i].cells)`(입력 순서라 인덱스로 짝짓는다). 응답 issues = 커밋 뒤 분석
  (`RuleIssueMaps.of`) + `report.nonAnalysisIssues()` 의 rowIds 를 발급 번호로 바꾼 새 맵(메시지의 "새 행 -1" 글자는 그대로). `ObjectProvider<RuleSaveCheck>`
  주입을 `RuleSaveValidator` 로 바꾸고 클래스 javadoc 의 D3 문장을 고쳤다. `checkRows` 가 파싱한 셀을 `RequestedRow.parsed` 로 들고 가 다시 파싱하지 않는다.
- `limits(rows)`: 행 수(`MAX_ROWS`, rowIds 없음)·행마다 셀 JSON 길이(`MAX_ROW_CELLS_CHARS`, 그 행 임시 번호)·합(`MAX_TOTAL_CELLS_CHARS`) → 넘는 것마다
  LIMIT_EXCEEDED ERROR 를 모아 `RuleSaveRejections.reject`(MDM021). 길이는 `String.length()`(UTF-16 글자 수)다.
- 옛 `BL/dme/ruleEdit/service/RuleSaveCheck.java`·`RuleSaveContext.java` 를 지웠다(사용처는 `RuleTableService` 하나였다).
- 새 테스트 `BAT/dme/ruleEdit/RuleTableSaveCheckTest`(11건): ① ALL_NA_ROW 거부 ② UNIQUE 겹침 거부·같은 표 FIRST 저장+OVERLAP 경고 ③ 미완성(조건·기본 행 결과)
  거부 ④ 경고만이면 저장, 검사 경고가 분석 이슈 뒤·발급 번호 ⑤ 한쪽 빈 구간 → GE·IN 정렬로 저장, 응답 rows = 저장 셀 ⑥ 비소유자 MDM003 이 검사보다 먼저
  ⑦ 행 수·행 셀 길이·셀 길이 합 — 같으면 저장, +1 거부(셀 길이는 JSON 공백으로 정확히 맞추고 저장값은 공백 없는 JSON). 셀 규칙 ERROR(TYPE_LITERAL) 거부,
  검사 빈 ERROR 거부 각 1건. 거부 사례는 모두 `TB_MDM_RULE_ROW`·`HIT_POLICY`·`ROW_VERSION`·`LAST_ROW_ID` 전후가 같은지 본다(요청 적중 정책을 저장값과
  다르게 보내 HIT_POLICY 무변경이 뜻을 갖게 했다). ④·검사 빈 ERROR 는 비분석 WARNING 을 내는 빈이 아직 없어(B6 전) 테스트 안 `@TestConfiguration` 가짜
  `RuleSaveCheck`(static 스위치, 기본 꺼짐, 새 행마다 코드 `PROBE`)로 확인한다.
- TDD: 테스트를 먼저 쓰고 옛 구현에서 11건 중 10건 실패(비소유자 MDM003 은 원래 통과)를 확인한 뒤 구현했다.
- 관련 테스트: `:mdm:lib:test` 1026건, `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*' --tests '*MdmBusinessRuleMigrationTest' --tests '*Architecture*'`
  141건 모두 통과.

### 의도해서 뒤집은 기존 기대값(§3.5)

- `RuleTableServiceTest.조건_전부_NA_행이_ERROR_여도_저장하고_응답_issues_는_…` → `응답_issues_는_저장한_정의의_분석기_결과와_같다`: 원래 "ALL_NA_ROW·UNIQUE OVERLAP
  ERROR 가 있어도 저장" → 새 기대 "FIRST 겹침(경고) 표를 저장하고 응답 issues 가 분석기 결과와 **전부** 같다"(거부 사례는 `RuleTableSaveCheckTest` ①②로 옮김) ·
  근거 수용 기준 1·2, 06:338-341. 비분석 경고가 지금은 나오지 않으므로 전부 일치 비교를 유지했다(§3.5 조건).
- `RuleTableServiceTest.행의_셀과_설명을_받은_그대로_저장한다` → `행의_셀은_정규화해_저장하고_숫자_텍스트와_설명은_그대로_둔다`: 원래 " 1.60"·IN `["C","A"]` 를
  글자 그대로 저장 → 새 기대 " 1.60" 은 TYPE_LITERAL 이므로 "1.60" 으로 바꿔 보내고, IN 은 `["A","C"]` 로 정렬해 저장, `1.60` 은 다시 쓰지 않는다 · 근거 I6·I9.
- `RuleTableServiceTest.새_행의_음수_임시_ID_…`·`변수_행은_바뀌지_않는다`: 새 행이 전부 NA·결과 셀 없음(미완성)이라 이제 거부된다 → 조건·결과가 다 찬 행으로
  바꿨다(검사 대상이 아닌 발급·seq·변수 불변 기대는 그대로) · 근거 I4.
- `DmeOasisHttpTest.tableBody`(B4 소유 파일, B4 가 아직 돌지 않아 B3 가 최소로 고침): 둘째 행 `{"1":{"op":"NA"}}`(ALL_NA·결과 없음·UNIQUE 겹침) →
  `{"1":{"op":"GE","left":"2.5"},"2":{"val":"B"}}`. `등록자는_표를_저장하고_…` 의 `issues[0].code` 기대 `ALL_NA_ROW` → `NULL_GAP`(실제 분석 결과) · 근거 수용 기준 1.

### 설계 이탈

1. `DmeOasisHttpTest` 는 design 「공유 파일 소유」 에서 B4 몫이지만, 표 저장 기대값 뒤집기(§3.5, B3 범위) 때문에 `tableBody` 한 줄과 단언 한 줄을 고쳤다.
2. 순서는 design 대로 `checkRows` 뒤 `limits` 다 — 상한을 넘는 요청도 모양 검사(파싱)는 먼저 받는다.

### 인계

- B4: `DmeOasisHttpTest.tableBody` 를 위처럼 바꿨다. `execute` 사례를 더할 때 이 표(두께 [1.6, 2.5) → A, ≥ 2.5 → B, UNIQUE)를 그대로 쓸 수 있다.
- B6: 원장 검사 빈이 `RuleTableServiceTest` 픽스처(QLTY_GRD_JDG, 사전은 COIL_THK·COIL_WID·SURF_GRD 만, 코드 없음)에서 경고를 내면 `응답_issues_는_…_같다` 의
  전부 일치 비교를 §3.5 대로 앞부분 비교로 바꾼다. `RuleTableSaveCheckTest` 의 가짜 빈은 코드 `PROBE` 만 내고 ④ 는 "마지막 이슈가 PROBE, 그 앞은 분석 코드" 를
  보므로 B6 빈이 TABLE 에서 경고를 내면 ④ 의 "그 앞은 분석 코드" 단언을 "PROBE 가 분석 이슈 뒤" 로 좁혀야 한다.
- B9: e2e S5·S6·V6 의 거부 메시지는 `룰 저장 거부: <CODE> <message>; …`(분석기 ERROR 는 `ALL_NA_ROW …`, UNIQUE 겹침은 `OVERLAP …`)다. 표 저장은 이제 셀을 정규화해
  저장하므로(목록 정렬·한쪽 빈 구간 → 1 타입 op) 저장 뒤 그리드 칸이 보낸 글자와 다를 수 있다.

## B4 — 값 테스트(`execute`)·정의 조립기·요청마다 만든 정의 조회

- `BL/common/rule/definition/RuleDefinitionAssembler`(순수 static `assemble(ruleId, ver, ruleKind, hitPolicy, applyFrom, applyTo, rawVars, vars, rows,
  externalType) → Assembled(definition, failures, skippedRows)`): TSK-08-01 §6.4 매핑, 셀마다 `CellTextGenerator`(CODE_IN 은 `ResolvedVar.maruCodeId`),
  계약은 `InputContracts.compute(…, labels)`. 타입은 이 룰의 이름 변수 → `externalType` → STRING(화면 `contract-view.ts` 기본값과 같다).
- `SingleRuleDefinitionLookup`(빈 아님, 요청마다 `new`), `StoredRuleDefinitions`(`@Component`, `read(ruleId, ver)`·`assemble`·`externalTypes(ruleId, ver)` —
  룰 밖 이름은 해석기에 이름 하나짜리 임시 변수를 물어 컬럼 사전·다른 룰 결과만 받는다, 요청 안 캐시), `BL/common/rule/RuleTestCaseQueries`(`cases`·`count`).
- `BL/dme/ruleEdit/service/RuleValueTestService.run`: 상한(본문 행 수·행 셀 길이·합 → 입력 JSON 길이 → 객체 파싱 → 키 수) → 버전 읽기 → BODY 면 표 저장과 같은
  모양 검사(`RuleTableService.checkRows`·`hitPolicy`) + `validate(TEST_BODY)` 로 깨진 행 빼기 → 조립(생성 실패 행도 뺀다) → `new MdmRuleEngine(evaluator.configuration(),
  new SingleRuleDefinitionLookup(def))` → 응답(§6.5 모양, 화면 `types.ts` `ValueTestResult` 와 칸 이름·모양 대조함) → `runCases` 면 케이스마다 같은 엔진으로 돌려 비교.
  쓰기 트랜잭션·발급기·`beginDraftWrite` 를 부르지 않는다. 평가 시각은 주입한 `Clock`(초 단위), `evalTs` 는 그 시간대의 `yyyy-MM-dd HH:mm:ss`.
- DTO `RuleTestRequest`(setter POJO, `rows` 는 `grids.rows.rows`)·`RuleTestResult`, `RuleEditService.runTest`, BPMN `execute` 갈래(`executeTask`, method `runTest`,
  dto `RuleTestRequest`)와 DI·documentation, `DmeBpmnActionTest`(execute, readOnly 아님), `DmeOasisHttpTest`(실제 BPMN 으로 VERSION 을 비소유 담당자 lee 가·BODY 를
  kim 이 `grids.rows.rows` 로 돌리고 원장 무변경).
- 테스트: `BLT/common/rule/definition/RuleDefinitionAssemblerTest`(25 — 샘플 DISP·06:1326-1328 텍스트·엔진 판정 06:1322, 생성 실패 행 제외, 식 변수, **입력 계약
  코퍼스 21건 전부**), `BAT/dme/ruleEdit/RuleValueTestServiceTest`(12 — design §3.2 ①~⑩, ⑨ 는 상한 다섯 개 각각 같으면 통과·+1 거부).
- TDD: 조립기·서비스 본문을 `UnsupportedOperationException` 스텁으로 두고 새 테스트 37건이 모두 실패하는 것을 본 뒤 구현했다.
- 관련 테스트: `:mdm:lib:test` 전체 1051 · `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*' --tests '*MdmBusinessRuleMigrationTest' --tests '*Architecture*'
  --tests '*MdmOasisActionVocabularyTest' --tests '*MdmRuleContract*'` 161 모두 통과. oasis 계약 검사 ERROR 0 / WARN 0 / INFO 29(기준선과 같다).

### 설계 이탈

1. **식 변수 `refVars` 는 null 이 아니라 `InputContracts.usedVariables(exprAst)` 다**(§2.3 은 null). 엔진 `RuleEvaluator.expressionVariables` 가 `refVars` 로 참조
   변수 NULL 가드를 돌므로 null 이면 참조 입력이 NULL 이어도 식을 평가한다. B1 인계가 허용한 둘째 선택지(같은 값·순서)라 계약은 화면과 같다(코퍼스 21건 확인).
   AST 가 없으면 null 이다.
2. **`RuleDefinitionAssemblerTest` 는 BAT 가 아니라 BLT(스프링 없음)에 두었다.** 조립기가 원장을 읽지 않는 순수 클래스라서다. 코퍼스는 `RuleAnalysisCorpusTest` 처럼
   상대 경로로 읽고 사례 하나가 아니라 21건 전부를 조립기로 돌린다. 06:1324 "row 3 만 BASE_FCT" 는 코퍼스 `qlty-grd-jdg-v1` 이 맡는다(원장 샘플 QLTY_GRD_JDG 는
   결과 셀이 모두 Value 라 그 계약이 나오지 않는다). 코퍼스에 코드 도메인이 없어 테스트가 조건 열에 가짜 마루 코드를 준다(CODE_IN 셀 텍스트용, 계약과 무관).
3. **B3 파일 `RuleTableService` 의 `RequestedRow`·`checkRows`·`hitPolicy`·`draftRows` 를 package-private 으로 풀었다.** BODY 행이 표 저장과 같은 모양 검사를
   받게 하려는 것이다(동작 불변, `RuleTableServiceTest`·`RuleTableSaveCheckTest` 통과).
4. **생성에 실패한 셀은 VERSION 에서도 그 행을 빼고 `cellErrors`(GENERATE_FAILED)·`skippedRows` 로 돌려준다.** 조립기가 셀마다 텍스트를 만들며 실패를 모으므로
   BODY·VERSION 이 같은 경로다(D5 를 저장된 버전에도 적용).
5. **`MISSING_CELL_AS_NA` 는 결과 셀이 없는 칸에도 붙인다**(엔진은 NULL 로 낸다). 기본 행의 조건 칸은 원래 없으므로 경고하지 않는다. VERSION 에도 붙는다.
6. **상한 거부 메시지는 `MdmErrors.of(INVALID_INPUT, "값 테스트 요청 상한 — …")`** → "입력값이 올바르지 않습니다: 값 테스트 요청 상한 — …"(MDM021). 값 테스트는
   저장이 아니라 `RuleSaveRejections`("룰 저장 거부:")를 쓰지 않았다. 상한은 버전을 읽기 전에 본다.
7. **"발급기 미호출" 은 `@SpyBean` 대신 원장 스냅샷으로 본다.** api 테스트에 스파이 빈 선례가 없고, 발급기는 `TB_MDM_RULE.LAST_*_ID` 를 올리므로 표 여섯
   (`TB_MDM_RULE`·`_VER`·`_VAR`·`_ROW`·`_TEST_CASE`·`_SET`) 전체 행 전후 비교가 카운터·row_version 까지 덮는다. JDBC 쓰기를 넣는 변이로 잡히는 것을 확인했다.
8. **케이스 비교는 엔진 결과 값의 타입으로 한다.** 엔진이 결과를 결과 변수 타입(NUMBER → BigDecimal 등)으로 바꿔 내므로 그 값이 BigDecimal 이면 기대값(JSON 숫자·숫자 모양
   문자열)을 BigDecimal 로 `compareTo`, Boolean 이면 불린·`TRUE`/`FALSE` 문자열, 나머지는 글자 비교다. 기대 키는 결과 이름과 정확히 같은 것 → 대소문자 무시 순으로 찾고
   없으면 실패(`actual` null). 판정 오류면 기대값이 있을 때 `pass=false`·`mismatches` 비움(화면 배지 "실패 · 판정 오류"). 케이스 결과에도 `hit` 을 같은 표현으로 싣는다.
9. **BODY 의 `ver` 가 DRAFT 인지 서버가 보지 않는다.** 그 버전의 저장된 변수만 읽고 쓰지 않으므로 막을 까닭이 없다. 화면은 DRAFT 일 때만 편집본 대상을 준다(I34).
10. **BPMN 은 손으로 고쳤다.** `bpmn-tool` 이 PATH 에 없다. 기존 `validateTask` 모양 그대로 serviceTask·endEvent·sequenceFlow 둘과 DI(shape 둘·edge 둘)를 더했고
    `xmllint --noout`·oasis 계약 검사·`DmeBpmnActionTest`·`DmeOasisHttpTest`(실제 BPMN 실행)로 확인했다.

### 보고

- 값 테스트는 운영 평가기(`mdmEvaluator`)를 그대로 쓰므로 `MASTER`·`CODE_IN` 셀·식은 늘 빈 결과로 판정된다(D-077 알려진 한계, design §7.5). 이 경로의 테스트는 두지 않았다.
- 엔진이 `EngineEvaluationException` 밖의 예외(예: 저장된 식 변수 텍스트가 컴파일되지 않음)를 던지면 그대로 500 이 된다 — 감추지 않았다.

### 인계

- B5: 케이스 조회는 `RuleTestCaseQueries.cases(ruleId)`(case_id 오름차순, 상한 100)·`count(ruleId)`(룰당 상한 검사용). view `testCases` 도 `cases` 를 쓰면 된다.
- B6(`ExprTypeByCaseCheck`): `RuleSaveContext.rows`(StoredRow)를 `DraftRow(rowId, seq, rowKind, RuleCellsCodec.parse(cells))` 로 바꿔 `RuleDefinitionAssembler.assemble(…,
  storedRuleDefinitions.externalTypes(ruleId, ver))` 에 넣고 `new MdmRuleEngine(evaluator.configuration(), new SingleRuleDefinitionLookup(def))` 로 케이스마다 돌린다.
  케이스 입력 파싱은 `USE_BIG_DECIMAL_FOR_FLOATS`(값 테스트와 같게). `EngineEvaluationException` 의 `TYPE_CONVERSION`·`EVALUATION_ERROR` 가 결과 타입 경고 후보다.
- B9(e2e): V5 서버 오류 문구는 "입력값이 올바르지 않습니다: 값 테스트 요청 상한 — 입력 JSON 이 N자다. 16384자까지 받는다"(④ `vt-error`). V3 키 보냄 끔 →
  `errors[].code` `MISSING_KEY`. V4 케이스 결과 `hit` 은 적중 하나면 숫자·기본 행이면 기본 행 row_id.

## B5 — 테스트 케이스 저장(part CASE)·view `testCases`

- `BL/dme/ruleEdit/service/RuleTestCaseService`(`RuleEditSavePart`, part `CASE`): 룰 읽기 → `requireMdm` → 폐기(DEPRECATED) 거부(MDM009) → `requireSteward`(MDM013) →
  칸 검사(이름 필수·길이, 입력 필수, 입력·기대 JSON 길이 → JSON 객체) → `TransactionTemplate`. 새 케이스는 트랜잭션 안에서 룰당 케이스 수 상한을 보고
  `issue(ruleId, CASE, 1)` 번호로 엔티티 INSERT(row_version 0). 수정·삭제는 `RuleTestCaseWrites` 의 `ROW_VERSION` 조건 네이티브 쓰기이고 0행이면 MDM001.
  버전·DRAFT 소유는 보지 않는다(D8).
- `BL/common/rule/RuleTestCaseWrites`: 조건부 UPDATE(이름·입력·기대·설명 통째로, `ROW_VERSION + 1`, 감사 U_*·`VER + 1`)·조건부 DELETE. `RuleNativeWrites` 의 감사 모양을 따른다.
- DTO: `RuleEditSaveRequest` 에 `caseId`·`caseName`·`inputJson`·`expectedJson`·`caseDeleted`, `RuleEditSaveResult` 에 `caseId`. `RuleEditViewResult.TestCaseInfo`
  (`caseId, caseName, inputJson, expectedJson, description, rowVersion`)와 `testCases` — `RuleViewService` 가 `RuleTestCaseQueries.cases`(case_id 오름차순)로 채운다.
  모양은 화면 `types.ts` `TestCaseView`·`TestCaseSaveResult`, `api.ts` `saveTestCase`·`deleteTestCase` 의 칸 이름과 대조했다(프런트 무변경).
- 테스트: `BAT/dme/ruleEdit/RuleTestCaseServiceTest`(15, 파사드 `RuleEditService.save` 로 part 위임까지), `RuleEditViewTest` 사례 2건(오름차순·원문 JSON·row_version,
  버전이 없는 룰에도 싣는다).
- TDD: 서비스 본문을 `UnsupportedOperationException` 스텁으로 두고 `RuleTestCaseServiceTest` 14건이 모두 실패하는 것을 본 뒤 구현했다. view 두 사례는 구현과 함께 썼고
  변이(m16·m17·m18)로 빨강을 확인했다.
- 관련 테스트: `:mdm:lib:test` 1051 · `:mdm:api:test --tests 'com.dongkuk.dmes.mdm.dme.*' --tests '*MdmBusinessRuleMigrationTest' --tests '*Architecture*'
  --tests '*MdmOasisActionVocabularyTest' --tests '*MdmRuleContract*'` 178 모두 통과(B4 의 161 + 새 17, 설계 이탈 7 수정 뒤 다시 돌림).

### 설계 이탈

1. **`description`·`rowVersion` 칸은 새로 만들지 않았다**(§2.4 는 `description` 추가). 헤더 저장이 쓰는 기존 칸을 CASE 도 쓴다. `rowVersion` 은 CASE 에서 케이스의 row_version 이다.
2. **수정은 칸을 통째로 바꾼다.** 화면은 null 을 빼고 보내므로(`omitNullish`) 기대값·설명을 빼고 보낸 수정은 그 칸을 지운다. 화면 "기대값 갱신"은 네 칸을 모두 싣는다(`TestCaseCard`).
3. **거부 코드**: 폐기 룰은 MDM009(`RuleVersionService.newVersion` 과 같은 모양), JSON 이 객체가 아니면 `ErrorCode.INVALID_VALUE`(MDM 코드 없음), 상한은 MDM021
   ("입력값이 올바르지 않습니다: 테스트 케이스 상한 — …"). 이름·입력이 비면 REQUIRED_VALUE, 수정·삭제에 row_version 이 없거나 삭제에 caseId 가 없으면 REQUIRED_VALUE.
4. **JSON 검사는 뒤에 붙은 글자도 거부한다**(`FAIL_ON_TRAILING_TOKENS`). Jackson 기본 설정은 `{"a":1} x` 를 통과시켜 DB CHECK 에서야 `DataIntegrityViolationException` 이 나고,
   `json_valid` 는 배열도 통과시키므로 객체 검사는 서버만 한다. 입력은 받은 글자 그대로 저장한다(다시 쓰지 않는다).
5. **룰당 케이스 수 상한은 새 케이스에만 건다.** 상한에 닿은 룰도 수정·삭제는 된다. 길이 상한은 파싱보다 먼저 본다.
6. **view `testCases` 는 버전을 고르지 못한 룰(버전 0개)에도 싣는다** — 케이스는 버전과 무관하다(06:1058).
7. **새 케이스는 리포지토리 `save` 가 아니라 `EntityManager.persist` 로 넣는다**(`RuleTestCaseWrites.insert`). ID 를 직접 넣는 `@IdClass` 엔티티라 Spring Data 가
   새것으로 보지 않아 `save` 가 `merge` 로 가고, 발급 번호가 기존 case_id 와 겹치면(카운터가 뒤처진 룰) 그 케이스를 조용히 덮어썼다(row_version 은 `updatable=false` 라
   그대로 남아 화면도 모른다). 처음 커밋(7c3d686)이 이 상태였고 사례 `발급_번호가_이미_있는_케이스와_겹치면_덮어쓰지_않고_실패한다` 로 확인한 뒤 고쳤다. 겹치면 PK 위반
   예외로 트랜잭션이 되돌아가고(발급도 되돌아간다) 업무 오류 코드로 바꾸지 않았다 — 카운터가 뒤처진 것은 데이터 오류라 감추지 않는다.

### 보고

- CASE 저장은 HTTP(OASIS) 테스트가 없다. `DmeOasisHttpTest` 는 B4 소유 파일이라 건드리지 않았고, 파라미터 바인딩(`caseId` Integer·`caseDeleted` Boolean·JSON 문자열)은
  기존 `ver`(Integer)·`rowVersion`(Long) 과 같은 경로라 같다고 보았다. e2e V4 가 실제 BPMN 으로 처음 태운다.
- 케이스 조건부 UPDATE·DELETE 와 `issue(CASE)` 의 MSSQL 경로는 도커 금지로 확인하지 못했다(방언 중립 SQL, design 「도커 금지로 생략한 검증」).
- 케이스 입력 JSON 의 키 수는 상한을 걸지 않았다(design §6.6 에 없다). 값 테스트 `runCases` 가 케이스를 돌릴 때의 처리는 B4 몫이다.

### 인계

- B9(e2e): 저장 응답은 `{part:"CASE", rowVersion(새 케이스 0·수정 +1·삭제 null), caseId(새 케이스면 발급 번호), rowIdMap:{}, issues:[], rows:[]}`. view 의 `testCases[{caseId, caseName,
  inputJson, expectedJson, description, rowVersion}]`. 픽스처에 케이스를 넣으면 `TB_MDM_RULE.LAST_CASE_ID` 를 넣은 최대 case_id 이상으로 맞춘다(아니면 화면 저장이 PK 위반
  예외로 실패한다 — 설계 이탈 7).
  STD_ADMIN(READ) 사용자는 BFF 권한에서 save 가 막히고, 서버에서도 MDM013 이다.

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
| I34 | `RULE_EDIT_CARDS` 의 valueTest·testResult 순서를 바꿈 | `value-test-cards.test.ts` › 카드 순서는 header·…·usage 다 | 잡힘 |
| I34 | 편집본 대상을 `editable` 없이도 제공 | `value-test-cards.test.ts` › 편집본 대상은 editable 이고 DRAFT 일 때만 … | 잡힘 |
| I34 | 편집본 대상을 선택 버전이 DRAFT 가 아니어도 제공 | `value-test-cards.test.ts` › 편집본 대상은 editable 이고 DRAFT 일 때만 … | 잡힘 |
| (B8) | BODY 요청에 편집 중인 표 대신 저장된 행을 실음 | `value-test-cards.test.ts` › 돌리기는 편집본 행을 grids.rows 로 싣고 … | 잡힘 |
| (B8) | "모두 돌리기" 가 `runCases` 를 빼먹음 | `value-test-cards.test.ts` › 모두 돌리기는 … runCases 를 싣고 … | 잡힘 |
| (B8) | "케이스로 저장" 이 다른 입력의 결과를 기대값으로 실음 | `value-test-cards.test.ts` › 케이스로 저장은 part CASE 로 … | 안 잡힘(보강함) |
| I33 | ⑤ 가 다른 버전 결과도 "표에 칠했다" 로 봄 | `value-test-cards.test.ts` › 다른 버전을 대상으로 돌리면 … 그 버전 표를 따로 그린다 | 잡힘 |
| I1 | 표 저장의 `report.hasErrors()` 거부 끔 | `RuleTableSaveCheckTest` › 셀_규칙_ERROR_는_거부한다 | 잡힘 |
| I1 | 분석기 ERROR 를 빼고 검사 ERROR 만으로 거부 판단(`nonAnalysisIssues`) | `RuleTableSaveCheckTest` › 조건_전부_NA_행이_있으면_거부하고_아무것도_쓰지_않는다 | 잡힘 |
| I5·I6 | 표 저장이 정규화한 셀 대신 요청 셀을 저장 | `RuleTableSaveCheckTest` › 행_셀_길이_상한과_같으면_저장하고_넘으면_거부한다(fail-fast 첫 실패), 한쪽_빈_구간은_1_타입_op_로_바꿔_저장하고_… 도 이 변이를 잡는다 | 잡힘 |
| I2 | 검사 이슈 row_id 를 발급 번호로 바꾸지 않음 | `RuleTableSaveCheckTest` › 경고만_있으면_저장하고_검사_경고를_분석_이슈_뒤에_발급_번호로_싣는다 | 잡힘 |
| I2 | 검사 이슈를 분석 이슈 앞에 붙임 | `RuleTableSaveCheckTest` › 경고만_있으면_저장하고_… | 잡힘 |
| I2 | 검사 경고를 응답에서 뺌 | `RuleTableSaveCheckTest` › 경고만_있으면_저장하고_… | 잡힘 |
| I3 | 경고만 있어도 거부(`issues` 가 비지 않으면) | `RuleTableSaveCheckTest` › 경고만_있으면_저장하고_… | 잡힘 |
| I4 | NORMAL 행 조건 키 없음 허용 | `RuleCompletenessTest` › NORMAL_행의_조건_셀이_없으면_거부한다 | 잡힘 |
| I4 | 기본 행의 결과 셀 없음 허용 | `RuleCompletenessTest` › 결과_셀이_없으면_기본_행도_거부한다 | 잡힘 |
| I4 | `{"op":"NA"}` 를 미완성으로 봄 | `RuleCompletenessTest` › 완성된_표는_이슈가_없고_무관_셀은_완성이다 | 잡힘 |
| I23 | 표 저장 `limits(rows)` 호출 뺌 | `RuleTableSaveCheckTest` › 행_셀_길이_상한과_같으면_저장하고_넘으면_거부한다 | 잡힘 |
| I23 | 행 수 상한 `>` → `>=` | `RuleTableSaveCheckTest` › 행_수_상한과_같으면_저장하고_넘으면_거부한다 | 잡힘 |
| I23 | 행 셀 길이 상한 `>` → `>=` | `RuleTableSaveCheckTest` › 행_셀_길이_상한과_같으면_저장하고_넘으면_거부한다 | 잡힘 |
| I23 | 셀 길이 합 상한 `>` → `>=` | `RuleTableSaveCheckTest` › 셀_길이_합_상한과_같으면_저장하고_넘으면_거부한다 | 잡힘 |
| I19 | 값 테스트 끝에 JDBC 로 `TB_MDM_RULE.LAST_ROW_ID` 를 올림 | `RuleValueTestServiceTest` › 본문_정의는_새_행과_미완성_행도_판정하고_원장에_쓰지_않는다 | 잡힘 |
| I20 | `SingleRuleDefinitionLookup.rule` 이 늘 빈 값(요청 정의가 엔진에 가지 않음) | `RuleValueTestServiceTest` › UNIQUE_다중_적중은_판정_오류다(fail-fast 첫 실패) | 잡힘 |
| I21 | 계약 always 이름 중 레코드에 없는 키를 null 로 채움 | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I22 | BODY 의 깨진 행을 빼지 않음(`filter(r -> true)`) | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I22 | 빠진 셀 경고 `MISSING_CELL_AS_NA` 를 싣지 않음 | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I22·D5 | 조립기가 생성 실패 셀의 행을 정의에 남김 | `RuleDefinitionAssemblerTest` › 생성에_실패한_셀의_행은_정의에서_빼고_실패로_돌려준다 | 잡힘 |
| I23 | 값 테스트 본문 행 수 상한 `>` → `>=` | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I23 | 값 테스트 행 셀 길이 상한 `>` → `>=` | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I23 | 값 테스트 셀 길이 합 상한 `>` → `>=` | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I23 | 입력 JSON 길이 상한 `>` → `>=` | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I23 | 입력 키 수 상한 `>` → `>=` | `RuleValueTestServiceTest`(fail-fast) | 잡힘 |
| I24 | NUMBER 비교 `compareTo` → `equals`(1.050 대 1.05) | `RuleValueTestServiceTest` › 케이스를_같은_정의로_돌려_결과_변수_타입으로_견준다 | 잡힘 |
| I24 | 기대에 모르는 키를 통과시킴 | `RuleValueTestServiceTest` › 케이스를_같은_정의로_돌려_… | 잡힘 |
| I24 | 기대값 없음을 통과로 봄 | `RuleValueTestServiceTest` › 케이스를_같은_정의로_돌려_… | 잡힘 |
| I24 | 기본 행 적용의 hit 을 null 로 | `RuleValueTestServiceTest` › 케이스를_같은_정의로_돌려_… | 잡힘 |
| I32 | BPMN execute 갈래 이름을 compare 로 | `DmeBpmnActionTest` › ruleEdit_는_…_validate_execute | 잡힘 |
| (B4) | 조립기가 식 변수 `refVars` 를 null 로(설계 이탈 1) | `RuleDefinitionAssemblerTest` › 식_변수는_식_텍스트와_AST_와_AST_에서_뽑은_참조_변수를_싣는다 | 잡힘 |
| (B4) | 조립기가 라벨을 계약 계산에 넘기지 않음 | `RuleDefinitionAssemblerTest` › 식_변수는_… | 잡힘 |
| I25 | 담당자 검사(`requireSteward`) 제거 | `RuleTestCaseServiceTest` › 담당자가_아니면_MDM013_이다 | 잡힘 |
| I25·I29 | 원천 검사(`requireMdm`) 제거 | `RuleTestCaseServiceTest` › 외부_원천_룰과_폐기한_룰에는_케이스를_쓰지_않는다 | 잡힘 |
| I25 | 폐기 룰 검사 끔 | `RuleTestCaseServiceTest` › 외부_원천_룰과_폐기한_룰에는_케이스를_쓰지_않는다 | 잡힘 |
| I25 | 새 번호를 발급기 대신 케이스 수 + 1 로 | `RuleTestCaseServiceTest` › 새_케이스는_발급기로_번호를_받아_row_version_0_으로_넣는다 | 잡힘 |
| I25 | 수정 UPDATE 의 `ROW_VERSION` 조건 무력화 | `RuleTestCaseServiceTest` › 틀린_row_version_의_수정은_MDM001_이고_바꾸지_않는다 | 잡힘 |
| I25 | 삭제 DELETE 의 `ROW_VERSION` 조건 무력화 | `RuleTestCaseServiceTest` › 삭제는_row_version_조건이고_틀리면_MDM001_로_남긴다 | 잡힘 |
| I25 | JSON 객체 검사 끔(배열·문자열 통과) | `RuleTestCaseServiceTest` › JSON_객체가_아닌_입력과_기대는_DB_보다_먼저_INVALID_VALUE_로_… | 잡힘 |
| I25 | JSON 뒤 토큰 허용(`FAIL_ON_TRAILING_TOKENS` 끔) | `RuleTestCaseServiceTest` › JSON_객체가_아닌_입력과_기대는_DB_보다_먼저_INVALID_VALUE_로_… | 잡힘 |
| I23 | 룰당 케이스 수 상한 `>=` → `>` | `RuleTestCaseServiceTest` › 룰당_케이스_수_상한까지는_새로_넣고_넘으면_거부하되_수정은_된다 | 잡힘 |
| I23 | 룰당 케이스 수 상한을 수정에도 적용 | `RuleTestCaseServiceTest` › 룰당_케이스_수_상한까지는_새로_넣고_… | 잡힘 |
| I23 | 케이스 이름 길이 상한 `>` → `>=` | `RuleTestCaseServiceTest` › 케이스_이름_길이_상한과_같으면_저장하고_넘으면_MDM021_로_거부한다 | 잡힘 |
| I23 | 케이스 JSON 길이 상한 `>` → `>=` | `RuleTestCaseServiceTest` › 입력_JSON_길이_상한과_같으면_저장하고_넘으면_MDM021_로_거부한다 | 잡힘 |
| I25 | 수정이 row_version 을 올리지 않음 | `RuleTestCaseServiceTest` › 수정은_row_version_조건으로_칸을_통째로_바꾸고_row_version_을_올린다 | 잡힘 |
| I25 | 수정 응답 row_version 을 올리지 않은 값으로 | `RuleTestCaseServiceTest` › 수정은_row_version_조건으로_… | 잡힘 |
| (B5) | 수정에서 뺀 기대값을 기존 값으로 둠(`COALESCE`) | `RuleTestCaseServiceTest` › 수정은_row_version_조건으로_… | 잡힘 |
| (B5) | view `testCases` 를 비움 | `RuleEditViewTest` › 테스트_케이스를_case_id_오름차순으로_저장된_글자_그대로_버전과_무관하게_싣는다 | 잡힘 |
| (B5) | view `testCases` 를 버전을 고른 때만 채움 | `RuleEditViewTest` › 테스트_케이스를_case_id_오름차순으로_… | 잡힘 |
| (B5) | 케이스 조회 정렬을 이름순으로 | `RuleEditViewTest` › 테스트_케이스를_case_id_오름차순으로_… | 잡힘 |
| I25 | 새 케이스 INSERT 를 `persist` 대신 `merge` 로(겹친 PK 덮어쓰기) | `RuleTestCaseServiceTest` › 발급_번호가_이미_있는_케이스와_겹치면_덮어쓰지_않고_실패한다 | 안 잡힘(보강함) |

- Java 변이는 `:maru-mdm-engine:test` 태스크 실패(컴파일 통과 뒤 테스트 실패)로 확인했다. enum → 문자열 상수로 바꾼 뒤 최종 코드에 Java 변이 9개를 다시 돌려 모두 잡혔다. fail-fast 첫 실패 사례 이름은 로그에 남기지 않았다.
- TS 변이는 확인한 뒤 곧바로 `git checkout` 으로 되돌렸다(TS 파일 무변경, I28).
- B2 변이는 스크립트 하나(변이 → `:mdm:lib:test --tests <클래스> --fail-fast` → `git checkout`)를 `heavy.sh` 로 감싸 세 번에 나눠 돌렸다. 변이마다 `git diff` 로 실제로 바뀐 것을 확인했다. "(fail-fast)" 로 적은 행은 첫 실패 사례 이름을 로그에서 뽑지 못한 것이다.
- B8 변이는 스크립트 하나(백업 복사 → 변이 → `vitest run value-test-cards.test.ts --bail=1` → 백업으로 되돌리기, `trap` 으로 중단 때도 되돌림)를 `heavy.sh` 로
  감싸 돌렸다(파일이 커밋 전이라 `git checkout` 대신 백업 복사). 보강 뒤 7개 모두 잡혔다.
- B3 변이는 구현을 먼저 커밋(5669e8a)한 뒤 스크립트 하나(변이 → `:mdm:api:test --tests '*RuleTableSaveCheckTest'` 또는 `:mdm:lib:test --tests '*RuleCompletenessTest'`
  `--fail-fast` → `git checkout`)를 `heavy.sh` 로 감싸 두 번에 나눠 돌렸다. 변이마다 `git diff --stat` 으로 실제로 바뀐 것을 확인했고 14개 모두 잡혔다. "쓰기 뒤 같은
  트랜잭션 안에서 거부" 변이는 롤백 때문에 결과가 같은 등가 변이라 돌리지 않았다.
- B4 변이는 구현을 먼저 커밋(9bd735f)한 뒤 스크립트 하나(변이 → `:mdm:api:test`·`:mdm:lib:test --tests <클래스> --fail-fast` → `git checkout`, `trap` 으로 중단 때도
  되돌림)를 `heavy.sh` 로 감싸 두 번에 나눠 돌렸다. 변이마다 `git diff --stat` 으로 실제로 바뀐 것을 확인했고 18개 모두 테스트 실패(컴파일 오류 아님, "N tests completed,
  M failed")로 잡혔다. 첫 묶음 8개는 첫 실패 사례 이름을 뽑지 않아 "(fail-fast)" 로 적었다.
- B5 변이는 구현을 먼저 커밋(7c3d686)한 뒤 스크립트 하나(변이 → `:mdm:api:test --tests '*RuleTestCaseServiceTest'`·`'*RuleEditViewTest'` `--fail-fast` → `git checkout`,
  SIGTERM·SIGHUP 에도 되돌림)를 `heavy.sh` 로 감싸 두 번에 나눠 돌렸다. 변이마다 `git diff --stat` 으로 실제로 바뀐 것을 확인했고 18개 모두 테스트 실패(컴파일 오류 아님)로
  잡혔다. 그 뒤 설계 이탈 7 을 찾아 사례를 더하고 고친 다음, `persist` → `merge` 변이를 백업 복사로 되돌리는 스크립트로 한 번 더 돌려 잡히는 것을 확인했다.
  D8 "DRAFT 소유와 무관" 은 소유자 검사를 더하는 변이를 돌리지 않았다 — 서비스가 버전 조회를 주입받지 않아 한 줄 변이로 만들 수 없다. 사례
  `기대값_없이도_저장하고_버전_DRAFT_소유와_무관하게_담당자가_쓴다`(lee 소유 DRAFT 가 있는 룰에 kim 이 저장)가 그 동작을 고정한다.
