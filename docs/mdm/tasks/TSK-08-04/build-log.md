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

- Java 변이는 `:maru-mdm-engine:test` 태스크 실패(컴파일 통과 뒤 테스트 실패)로 확인했다. enum → 문자열 상수로 바꾼 뒤 최종 코드에 Java 변이 9개를 다시 돌려 모두 잡혔다. fail-fast 첫 실패 사례 이름은 로그에 남기지 않았다.
- TS 변이는 확인한 뒤 곧바로 `git checkout` 으로 되돌렸다(TS 파일 무변경, I28).
