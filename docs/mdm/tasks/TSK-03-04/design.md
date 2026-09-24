# TSK-03-04 설계 — 겹침·빈틈 분석·입력 계약 + 화면 JS 평가기·정합성 코퍼스

> 주문 `7d8179b0-ad6c-4811-972c-dd7a34ddcba2` · category dev · domain fullstack · 작성 2026-09-24 (Design Phase)
> 입력: `spec.md`(요구사항 데이터로만 읽었다) · 원천 `06-business-rule.md`(130·177·202·242·321·352행 절, 458행 패키지표) · `evalex-guide.md` §6·§8 · `02-term-domain-column.md` 「도메인 검증 규칙 표현 방식」 · `workrule-column-design.md` 5절 · `06-business-rule.html`(시안 룰 정의) · `PRD.md` FR-E2·E3·E7·AC-3·NFR-1 · `TRD.md` · `decisions.md` D-020~D-023 · `engine-contract.md` · TSK-03-01 산출물(엔진 계약 main, 스키마 정본, TS 생성물, `tasks/TSK-03-01/design.md`) · 병렬 형제 TSK-03-03 의 미머지 설계(`agent/e1205c87-rule-engine` 브랜치 69f1a03 의 `docs/mdm/tasks/TSK-03-03/design.md`, 팀장 조율 지시로 반영, §0.3)
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물. TSK-03-01·TSK-02-02 는 dev 에 머지됐지만 승인 전이다.
> 기점: `origin/dev` 955cef1, 브랜치 `agent/7d8179b0-rule-analysis-js-eval`.
> 경로 약어: `E` = `src/backend/maru-mdm-engine`, `T` = `E/src/test/java/kr/dongkuk/maru/mdm/engine`, `R` = `E/src/test/resources/kr/dongkuk/maru/mdm/engine`, `M` = `src/frontend/m-mdm`, `J` = `E/src/main/java/kr/dongkuk/maru/mdm/engine`.

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

### 0.1 리포·도구

| # | 사실 | 근거 |
|---|---|---|
| F1 | `docs/mdm/design` 은 리포 밖 `/Users/jji/project/mdm/docs/design` 을 가리키는 심링크다(로컬 전용, git 의 D 표시는 정상). `grep -r` 은 재귀 중에 심링크를 따라가지 않아 06 원문을 못 찾는다. `grep -R` 을 쓴다 | `ls -la docs/mdm`, 실제 검색 결과 |
| F2 | 원천 인터프리터 샘플과 `AstExporter` 는 리포 밖 `/Users/jji/project/mdm/js/{evalex-ast-interpreter.js,AstExporter.java,evalex-ast-interpreter.test.js,evalex-ast-interpreter.bench.js}` 에 있다. 리포 안에는 없다 | `find`, `ls` |
| F3 | `evalex-ast-interpreter` 는 npm 패키지가 아니다(`npm view evalex-ast-interpreter` → 404). evalex-guide §8.6 이 가리키는 것은 원천 샘플 파일 이름이다. 이 Task 는 그 샘플을 출발점으로 m-mdm 안에 TS 모듈로 옮겨 쓴다 | `npm view` |
| F4 | `decimal.js` 최신은 10.6.0 이다. m-mdm·lockfile 에 아직 없다 | `npm view decimal.js version`, `grep decimal pnpm-lock.yaml` |
| F5 | `decisions.md` 에는 TSK-03-01 항목이 없다(D-020~D-023 은 TSK-02-02, D-026 이후는 다른 Task). 이 설계는 TSK-03-01 의 결정을 `tasks/TSK-03-01/design.md` D1~D7 과 D-020~D-023 에서 가져온다 | `grep -n "03-01" docs/mdm/decisions.md` |
| F6 | 엔진 test 소스는 ArchUnit 규칙 밖이다. 모든 규칙이 `ImportOption.Predefined.DO_NOT_INCLUDE_TESTS` 로 main 만 가져온다. 엔진 test 에는 Jackson 2.18.2(`testImplementation`)와 JUnit 5.11.4 BOM(`@TestFactory`·`@ParameterizedTest` 사용 가능)이 이미 있다. `build.gradle` 은 고치지 않는다 | `E/build.gradle`, TSK-03-01 F3 |
| F7 | `T/arch/ContractOnlyPhaseTest` 는 main 클래스 집합이 계약 타입과 스캐폴드로 닫혀 있기를 요구한다. main 에 클래스 하나만 더해도 빨강이다. TSK-03-02 가 이 파일을 지운다(팀장 지시). 이 Task 는 main 을 건드리지 않고 이 파일도 고치지 않는다 | `ContractOnlyPhaseTest.java`, 팀장 지시 |
| F8 | 스키마 `CellCase` 는 `additionalProperties: false` 이고 서버 생성 텍스트 칸이 없다(`id, kind, variable, cell, patternRegex, value, evalTs, codeSets, expect`). `CellCase.variable` 에는 식 변수 정의를 담을 칸이 없다. 스키마는 이 Task 가 고치지 않는다 | 스키마 `$defs/CellCase` |
| F9 | 스키마 `Expect.screenFallback` 설명은 "화면은 isSupported=false 로 폴백해야 하고 서버 결과만 견준다"이다(정적 판정만 말한다) | 스키마 `$defs/Expect` |
| F10 | m-mdm: `lint = tsc --noEmit` 이고 tsconfig `include` 는 `src, pages, app` 이다. `tests`·`scripts` 는 타입 검사 밖이다. `test = vitest run`, 설정 파일 없음(node 환경, `**/*.test.ts`). tsup 첫 설정의 entry 는 `{ index: "src/index.ts" }` 이고 dependencies 는 자동으로 external 이다 | `M/package.json`, `M/tsconfig.json`, `M/tsup.config.ts` |
| F11 | 기존 프런트 테스트 두 개가 지키는 것: `engine-contract.generated.test.ts` 는 `src/index.ts` 에 `export type * from "./contract/engine-contract.generated";` 줄이 있는지, m-mdm 트리에 `*.schema.json` 이 없는지 본다. `tsup-entries.smoke.test.ts` 는 `pages/` 로 시작하고 `/page` 로 끝나는 entry 키만 본다. 새 entry `evalex/index` 는 두 테스트에 걸리지 않는다 | 두 테스트 파일 |
| F12 | `src/frontend/pnpm-workspace.yaml` 의 `allowBuilds:` 에 자리표시 값이 있어 `pnpm add` 가 이 파일을 바꿀 수 있다. 바뀌면 되돌린다(TSK-03-01 F12) | 파일 내용 |
| F13 | 표본 코퍼스 15건은 `docs/mdm/engine-contract/samples/sample-corpus.json` 에 있다. TSK-03-01 I27 이 `docs/mdm/engine-contract/**` 를 바이트 동일로 묶었으므로 이 파일은 읽기만 한다. 15건은 새 코퍼스에 같은 id·같은 내용으로 다시 쓴다 | TSK-03-01 design I27 |
| F14 | 06 「EvalEx 생성 규칙」 표 안에 충돌이 하나 있다. `=` 패턴 정규식 행의 예시 `A.B%` → `STR_MATCHES(V, "A\\.B.*")` 는 바로 위 단순형 규칙(`%` 가 끝에 하나뿐이면 `STR_STARTS_WITH`)으로는 접두형이다. 두 텍스트의 진릿값은 같다. 오라클은 단순형 규칙을 따른다(`STR_STARTS_WITH(V, "A.B")`). 예시가 보이려던 이스케이프는 정규식 변환 함수 단위 골든(`A.B%` → `A\.B.*`)으로 따로 확인한다 | 06:257-258 |
| F15 | 06 「입력 계약」 JSON 의 행 3 `required` 순서(`COIL_WID` 가 먼저)는 결과 식의 AST 순서(`COIL_OUT_DIA, COIL_IN_DIA, COIL_WID, COIL_VOID_RT, SPEC_GRAV`)와 다르다. 행 1·2 는 AST 순서와 같다. 그래서 골든은 **집합**으로 비교하고, 계산 결과의 순서는 AST 첫 등장 순으로 정의한다. 06 순서에 맞추려고 계산 방식을 비틀지 않는다 | 06:226-229 |
| F16 | PROD_WGT_CALC 의 정확한 정의는 06 md 가 아니라 시안 `06-business-rule.html:466-477` 에 있다. PV1(UNIQUE, RELEASED)은 조건 열 `PROD_TYPE`(Equal, var 1, seq 1)·`CALC_BASIS`(Equal, var 3, seq 2), 결과 열 `PROD_WGT`(Expression, var 2)와 행 셋이다. 행 id 1(seq 1): `EQ COIL`·`EQ LEN`·`ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)`. 행 id 3(seq 2): `EQ COIL`·`EQ DIA`·`ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)`. 행 id 2(seq 3): `EQ SHEET`·`NA`·`ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)`. PV2(DRAFT)는 결과 식의 `SPEC_GRAV` 를 `COALESCE(SPEC_GRAV, 7.85)` 로 바꾼 것이다. 값 테스트 사례: 행 1 입력(1.8, 1200, 1500, 7.85) → 25434, 행 3 입력(외경 1800, 내경 610, 폭 1200, 공극률 1.5, 비중 7.85) → 20899.7, 행 2 입력(0.8, 1219, 2438, 120, 7.85, `CALC_BASIS` NULL) → 2239.6. 세 값은 EvalEx 3.7.0 으로 실측해도 같다 | html 466-477·523-527, F17 |
| F17 | 시안 컬럼 사전 타입(`06-business-rule.html:367-388`): `COIL_THK` Number scale 2, `COIL_WID` Number 0, `COIL_LEN` Number 1, `SPEC_GRAV` Number 3, `COIL_OUT_DIA`·`COIL_IN_DIA`·`SHEET_LEN`·`SHEET_CNT` Number 0, `COIL_VOID_RT` Number 2, `PROD_WGT` Number 1, `PROD_TYPE`·`CALC_BASIS`·`SURF_GRD`·`TOP_RESIN_CD`·`COAT_SIDE` String, `BASE_FCT` Number 2 | html |
| F18 | 시안 BASE_SPD_LKP 두께 구간(UNIQUE, `06-business-rule.html:485`): `< 변수 <=` 0 0.5, `< 변수 <` 0.5 0.6, `<= 변수 <` 0.6 0.7, `<= 변수 <` 0.7 0.8, `<= 변수 <` 0.8 0.9, `<= 변수 <` 0.9 1, `<= 변수 <=` 1 1.2. 값 테스트: `COIL_THK` 0.65 → 3행 | html 485·528 |

### 0.3 병렬 형제 TSK-03-03 과의 조율 (팀장 전달, 2026-09-24)

03-03 은 아직 dev 에 머지되지 않았다. `/usr/bin/git fetch origin` 뒤 `origin/agent/*` 원격 브랜치는 없었고, 03-03 설계는 같은 저장소의 로컬 브랜치 `agent/e1205c87-rule-engine`(커밋 69f1a03, 워크트리 `dflow-e1205c87`)에서 `/usr/bin/git show agent/e1205c87-rule-engine:docs/mdm/tasks/TSK-03-03/design.md` 로 읽었다. 03-03 도 승인 전(미승인 선행)이다. 이 Task 의 코드는 **03-03 없이 컴파일·통과해야 한다.** 03-03 에 기대는 코드는 모두 §6.15 「03-03 머지 뒤 후속」으로 미룬다.

| # | 사실 | 근거 |
|---|---|---|
| F19 | 영구 `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다` 는 main 의 `engine.expr`·`engine.rule`(하위 패키지 포함)의 **모든 record·enum** 이 대응표나 `JAVA_ONLY` 목록에 있기를 요구한다. 엔진 main 에 파일을 더하지 않는다는 이 Task 의 제약(F7)에 이 테스트도 사유로 더한다. test 소스는 검사 밖이다 | `T/contract/EngineContractSchemaTest.java`, 03-03 design F6 |
| F20 | 03-03 이 `engine.rule` main 에 두는 이름: public `MdmRuleEngine`·`CellTextGenerator`·`CellSummary`, package-private `RuleEvaluator`·`ResultAggregator`·`ExpressionRunner`·`ExpressionFailure`·`ValueConverter`·`RecordKeys`. 03-03 test 는 `T/rule/**`·`T/rule/fixture/**`(`TestExpressionConfig`, `TestFunctions`, `InMemoryDefinitionLookup`, `RuleFixtures`, `SampleRules`, `CellTextSnapshotTest` 등)와 `E/src/test/resources/kr/dongkuk/maru/mdm/engine/rule/cell-text-snapshot.json` 이다. 이 Task 의 test 클래스(`T/corpus/` 의 `CorpusEvalExHarness`·`CorpusFunctions`·`CellTextOracle`·`AstMaps`·`CorpusConformanceTest`·`CorpusShapeTest`·`CellTextOracleTest`·`CorpusHarnessTest`)와 resources(`R/corpus/`)는 이 이름·경로와 겹치지 않는다 | 팀장 전달, 03-03 design §2.1·§2.2 |
| F21 | 03-03 §6.1 공개 시그니처(인용): `CellTextGenerator.NA_TEXT = ""`, `MAX_PATTERN_WILDCARDS = 3`, `REGEX_META`(14종), `static String subject(RuleVar var)`, `static String conditionText(RuleCell cell, @Nullable String subject, DataType dataType, @Nullable String maruCodeId)`, `static String resultText(RuleCell cell, DataType dataType)`, `static Optional<String> patternRegex(String patternValue)`("`=` 값이 정규식형이면 앵커 없는 Java 정규식, 정확 일치·단순형이면 빈 값. 거부 대상이면 IAE"), `static RuleDefinition withTexts(RuleDefinition, Function<String,String> maruCodeIdByDomainId)`, `CellSummary.of(@Nullable RuleVar var, RuleCell cell)`. 03-03 은 "이 시그니처는 TSK-03-04 의 코퍼스 CellCase 서버 러너가 부를 계약이다"라고 적었다(03-03 §6.1, D15) | 03-03 design §6.1 |
| F22 | 03-03 §6.11 `=` 패턴 규칙(인용 요약): ① `\` 다음이 `%`·`_`·`\` 면 글자 토큰, 다른 글자이거나 끝의 `\` 면 **거부(IAE)**, `%` 는 ANY, `_` 는 ONE ② 연속 ANY 접기 ③ ANY 하나뿐이면 거부, 접은 뒤 ANY 가 3 개를 넘으면 거부 ④ 와일드카드 없음 → 정확 일치, `[글자+, ANY]` → `STR_STARTS_WITH`, `[ANY, 글자+]` → `STR_ENDS_WITH`, `[ANY, 글자+, ANY]` → `INSTR(V, "…") > 0`, 그 밖 → 정규식(글자는 `REGEX_META` 면 `\` 를 붙이고 ANY `.*`, ONE `.`, 앵커 없음) ⑤ STRING 변수의 EQ 값은 늘 토큰화한다(03-03 D15). 이스케이프한 `\%`·`\_` 는 글자라 단순형 안에 들어갈 수 있다(`A\_B%` → `STR_STARTS_WITH(V, "A_B")`). `A.B%` 는 단순형이다(03-03 D11 ②, 이 설계 F14 와 같다). 접두형 `succ` 는 03-03 에 없다(서버는 겹침을 계산하지 않는다). 06:359 의 `succ` 규칙은 이 Task 의 화면 분석에만 쓴다 | 03-03 design §6.11, D11, D15 |
| F23 | 03-03 §6.7 `ValueConverter.toDeclared`(인용 요약): NUMBER ← String 은 `new BigDecimal(s)`(지수 허용, 공백·빈 문자열 실패), Boolean 은 실패. STRING·DATE ← BigDecimal·정수는 `toPlainString()`. BOOLEAN ← String 은 `TRUE`/`FALSE`(대소문자 무시). §6.8 `RecordKeys`: 상수 8종·`EVAL_TS`(대소문자 무시)·`_` 접두 검사에 더해, 대소문자만 다른 키가 둘 이상이면 `RESERVED_KEY`(03-03 D13). 입력 계약 키 확인(`MISSING_KEY`)은 **대소문자를 구분하는 정확 일치**다. §6.2: 조건 셀이 없으면(키 없음) 건너뛰고, 조건 셀 결과가 NULL 이면 거짓 + `EXPR_CELL_NULL`, **불린이 아니면 `EVALUATION_ERROR`**. `hitPolicy == null` 인 DECISION 은 FIRST 로 본다 | 03-03 design §6.2·§6.7·§6.8 |
| F24 | 03-03 §6.12 `CellSummary.of`: NA → `-`, Equal 열의 EQ → 값 그대로, EQ·NE·LT·LE·GT·GE → `= L`·`<> L`·`< L`·`<= L`·`> L`·`>= L`, IN·NOT_IN → `IN (a, b)`·`NOT IN (a, b)`, CODE_IN → `IN 카테고리 L`, CONTAINS·INSTR → `CONTAINS L`·`INSTR L`, IS_NULL·NOT_NULL → `IS NULL`·`IS NOT NULL`, 구간 op → `L <op> R`(예 `1.6 <= 변수 < 2.5`), Expression 셀 → expr, 결과 Value → val, 모르는 op → op 문자열. 값은 저장 문자열 그대로 | 03-03 design §6.12 |

### 0.2 EvalEx 3.7.0 실측 (2026-09-24, 이 Task 의 설계 기준)

엔진 main 설정과 같은 값(precision 68 HALF_EVEN, `allowOverwriteConstants=false`, 배열·구조체·암묵 곱셈·작은따옴표·2진 끔, Asia/Seoul, Locale.ROOT)으로 `EvalEx-3.7.0.jar` 를 직접 돌렸다. `X`·`Y` 는 NULL 을 넣은 변수다. 인터프리터 의미표(§6.3)는 이 표를 따른다. 원천 JS 샘플과 다른 곳이 많으니 샘플보다 이 표가 우선이다(서버가 기준, EG §8.5 2항).

| 식 | 결과 | 식 | 결과 |
|---|---|---|---|
| `MIN(X, 1)` | 1 | `MIN(1, X)` | NPE |
| `MAX(X, 1)` | 1 | `MAX(1, X)` | NPE |
| `MIN(X, Y)` | NULL | `SUM(X, 1)`·`SUM(X)`·`AVERAGE(X, 1)` | NPE |
| `X + 1` | `"null1"` | `1 + X` | `"1null"` |
| `"a" + 1` | `"a1"` | `TRUE + 1` | `"true1"` |
| `X * 2`·`X % 2`·`-X` | EvaluationException(지원 안 하는 타입) | `"2" * 3` 류 | 산술은 두 쪽이 모두 숫자여야 한다. 문자열을 숫자로 바꾸지 않는다 |
| `3 == "3"`·`"1" == 1`·`1 == TRUE`·`TRUE == "true"` | false | `X == NULL`·`NULL == NULL` | true |
| `X != 1` | true | `1.10 == 1.1` | true |
| `1 < "2"` | false | `1 > "0"`·`1 >= "1"`·`"b" > 1`·`TRUE > 0`·`"a" < TRUE` | true |
| `1 < TRUE` | false | `"B" < "a"`·`"10" < "9"` | true(UTF-16 순서) |
| `X < 1`·`X && TRUE`·`X \|\| TRUE`·`!X`·`NOT(X)` | NPE | `FALSE && X` | false |
| `TRUE \|\| X` | true | `TRUE && 1` | true |
| `TRUE && "x"` | false | `NOT(1)` | false |
| `!0` | true | `NOT("x")` | true |
| `IF(X, 1, 2)`·`IF(NULL, 1, 2)` | 2 | `IF(1, 1, 2)`·`IF("true", 1, 2)` | 1 |
| `IF("yes", 1, 2)` | 2 | `IF(TRUE, X, 2)` | NULL |
| `SWITCH(X, 1, 10, 20)` | 20 | `SWITCH(3, 1, 10, 2, 20)` | NULL |
| `COALESCE(X, 5)` | 5 | `COALESCE(X, Y)` | NULL |
| `STR_CONTAINS(X, "u")` | false | `STR_CONTAINS("AbC", "bc")` | true(둘 다 `toUpperCase` 후 `contains`) |
| `STR_STARTS_WITH("abc", "A")` | false | `STR_ENDS_WITH("abc", "")` | true |
| `STR_SUBSTRING("ABCDE", 1, 2)` | `"B"` | `STR_SUBSTRING("ABCDE", 2)` | `"CDE"` |
| `STR_SUBSTRING("ABC", 1, 9)` | `"BC"`(끝을 길이로 자른다) | `STR_SUBSTRING("ABCDE", 3, 1)` | EvaluationException |
| `STR_SUBSTRING("ABC", 5)` | StringIndexOutOfBounds | `STR_SUBSTRING("ABC", -1)` | EvaluationException |
| `STR_LEFT("ABC", 2)` | `"AB"` | `STR_LEFT("ABC", 0)`·`STR_LEFT("ABC", -1)` | `""` |
| `STR_RIGHT("ABC", 2)` | `"BC"` | `STR_RIGHT("ABC", 5)` | `"ABC"` |
| `STR_LENGTH("한글")` | 2(UTF-16 길이) | `STR_LENGTH(123)` | 3 |
| `STR_TRIM("  a ")` | `"a"`(Java `String.trim`, U+0020 이하만) | `STR_UPPER("abc")` | `"ABC"` |
| `STR_MATCHES("AxxB", "A.*B")` | true | `STR_MATCHES("xAB", "A.*B")`·`STR_MATCHES("ABC", "b")` | false(전체 일치) |
| `ROUND(2.345, 2)` | 2.34 | `ROUND(2.355, 2)` | 2.36 |
| `ROUND(-2.345, 2)` | -2.34 | `ROUND(2.5, 0)` | 2 |
| `ROUND(125, -1)` | 120 | `10 / 4` | 2.5 |
| `1 / 3` | `0.` 뒤 3 이 68개(유효숫자 68) | `1 / 0` | EvaluationException |
| `7 % 3` | 1 | `-7 % 3` | -1(나머지 부호는 피제수) |
| `7.5 % 2` | 1.5 | `AVERAGE(1, 2, 2)` | `1.6666666666666666666666666666666666666666666666666666666666666666667`(유효숫자 68) |
| `2 ^ 0.5` | 1.4142135623730951 | `2 ^ 2.5` | 5.6568542494923804 |
| `0.5 ^ 0.5` | 0.7071067811865476 | `1.1 ^ 2` | 1.21 |
| `2 ^ -1` | 0.5 | `2 ^ -2` | 0.25 |
| `3 ^ -1` | `0.` 뒤 3 이 68개 | `-2 ^ 2` | 4 |
| `SQRT(2)` | `1.41421356237309504880168872420969807856967187537694807317667973799073`(소수 68자리, 유효숫자 69) | `SQRT(0.04)` | 0.2 |
| `SQRT(-1)` | EvaluationException | `ABS(-1.50)` | 1.5 |
| `CEILING(1.2)` | 2 | `FLOOR(-1.2)` | -2 |
| `PI` | `3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679` | `E` | `2.71828182845904523536028747135266249775724709369995957496696762772407663` |
| `0.1 + 0.2 == 0.3` | true | 레코드 키 `NULL`·`null` | `UnsupportedOperationException: Can't set value for constant` |

숫자를 문자열로 바꾸는 자리는 BigDecimal 의 스케일을 그대로 쓴다(`toPlainString`). `stripTrailingZeros` 는 최종 결과에만 걸린다.

| 식 | 결과 |
|---|---|
| `STR_UPPER(1.50)`, `"" + 1.50` | `"1.50"` |
| `"" + X`(X = `BigDecimal("1.10")`) | `"1.10"` |
| `"" + (X * 1)` | `"1.10"` |
| `"" + (0.1 * 10)` | `"1.0"` |
| `"" + (0 * 1.5)` | `"0.0"` |
| `"" + 1E3` | `"1000"` |
| `"" + (2 ^ 0.5)` | `"1.4142135623730951"` |
| `X` 의 최종 결과 | 1.1(끝 0 제거) |

구현 확인(`javap -c` on `EvalEx-3.7.0.jar`):
- **`^`**(`InfixPowerOfOperator`): 지수 `y` 의 부호 `s` 를 떼어 `|y|` 로 만들고, `|y|` 의 정수부 `n` 과 소수부 `f` 로 나눈다. 결과 = `x.pow(n, mc)` × `BigDecimal.valueOf(Math.pow(x.doubleValue(), f.doubleValue()))`(곱셈도 `mc`). `s < 0` 이면 `ONE.divide(결과, 68, HALF_UP)`(소수 68자리, **HALF_UP**)이다. 두 피연산자가 숫자가 아니면 EvaluationException 이다.
- **`SQRT`**: 0 이면 0, 음수면 EvaluationException. `n = x.movePointRight(136).toBigInteger()`(0 쪽으로 자름), `bits = (n.bitLength() + 1) >> 1`, `ix = n >> bits` 에서 시작해 `ix = (ix + n / ix) >> 1` 을 되풀이한다. `d = |ix - ixPrev|` 가 0 이나 1 이면 멈춘다. 결과 = `new BigDecimal(ix, 68)`.
- **`/`·`%`**: 제수 `equals(ZERO)`(스케일까지 같은 0)면 EvaluationException, 아니면 `divide(mc)`·`remainder(mc)`. `1 / 0.0` 은 `ArithmeticException` 이 되지만 어느 쪽이든 오류다.
- **`MIN`·`MAX`**(`AbstractMinMaxFunction.findMinOrMax`): 누산기가 비어 있는 동안에는 인자 값(NULL 이면 null)을 그대로 누산기에 넣는다. 누산기가 찬 뒤 NULL 인자를 만나면 NPE 다.
- **`SWITCH`**: 비교는 "둘 다 NULL" 또는 "데이터 타입이 같고 `compareTo == 0`" 이다.
- **`STR_LEFT`**: `substring(0, max(0, min(n, len)))`. **`STR_RIGHT`**: `substring(len - max(0, min(n, len)))`. `n` 은 `intValue()`(소수 버림).

---

## 1. 접근 방식

분석(겹침·빈틈·도달 불가), 입력 계약 계산, op-code 셀 직접 비교, 적중 정책 미리보기, AST 인터프리터를 모두 `@dk-oasis/m-mdm` 의 TS 모듈 `src/evalex/` 하나에 두고, 서브패스 `@dk-oasis/m-mdm/evalex` 로 공개한다. 엔진 main 은 한 줄도 바꾸지 않는다. 임시 폐쇄 테스트 `ContractOnlyPhaseTest` 가 main 클래스 추가를 막고 있고, spec 의 entry-point 가 "`@dk-oasis/m-mdm` evalex 모듈"이기 때문이다(Java `engine.rule` 이식은 D1 로 남긴다). 서버와 화면이 같은 결과를 낸다는 것은 **코퍼스 JSON 한 벌**(엔진 test resources)을 두 러너가 함께 읽어 증명한다. JUnit 러너는 test 안에서 EvalEx 설정을 계약 상수로 조립해 식 텍스트를 평가하고(교체 지점 한 곳, D2), op-code 셀은 06 「EvalEx 생성 규칙」을 옮긴 test 전용 오라클로 텍스트를 만들어 평가한다(D3). 식 사례는 EvalEx 파서가 만든 AST 와 코퍼스 AST 가 같은지도 JUnit 이 대조한다. 그래서 텍스트와 AST 가 같은 식이라는 사실이 기계로 확인된다. Vitest 러너는 같은 파일의 AST 를 인터프리터로, 셀은 직접 비교로 평가한다. 인터프리터의 의미는 원천 JS 샘플이 아니라 EvalEx 3.7.0 실측(§0.2)에 맞춘다. 정확히 재현하지 못하는 자리(계산된 숫자의 문자열 변환, 혼합 타입 대소 비교)는 틀린 값을 내지 않고 서버로 폴백한다(D4). 이 방식을 고른 이유는 세 가지다. 첫째, 병렬로 진행하는 형제 Task(TSK-03-02·03-03)와 파일이 겹치지 않고 기존 테스트를 하나도 깨뜨리지 않는다. 둘째, 코퍼스 사본이 하나뿐이라 두 러너가 어긋난 입력을 읽을 일이 없다. 셋째, 서버 쪽 교체 지점이 명확해 TSK-03-02·03-03 이 실물을 넣으면 같은 코퍼스가 곧바로 실물을 검증한다.

---

## 2. 변경 파일 목록

### 2.1 생성

| 파일 | 내용 |
|---|---|
| `R/corpus/engine-corpus.json` | 정합성 코퍼스 정본(§6.10). `CorpusFile { version: 1, cases }`. 사례 169건(expr 82, cell 87). 2칸 들여쓰기, UTF-8 |
| `T/corpus/CorpusEvalExHarness.java` | 서버 쪽 하네스. `configuration(codeSets)`(교체 지점), 예약 키·키 누락·타입 변환·오류 매핑·결과 직렬화(§6.11) |
| `T/corpus/CorpusFunctions.java` | test 전용 대역 함수 `InstrStandIn`·`MasterStandIn`(`AbstractFunction`)(§6.11) |
| `T/corpus/CellTextOracle.java` | 06 「EvalEx 생성 규칙」을 옮긴 test 전용 셀 → 텍스트 오라클(§6.11) |
| `T/corpus/AstMaps.java` | `ASTNode → Map` 변환(원천 `AstExporter.toMap` 규칙: 자식이 없으면 `params` 키를 뺀다) |
| `T/corpus/CorpusConformanceTest.java` | 코퍼스 서버 러너(§3.1) |
| `T/corpus/CorpusShapeTest.java` | 스키마 `$defs` 로 코퍼스 모양 검사(§3.1) |
| `T/corpus/CellTextOracleTest.java` | 오라클 텍스트 골든(§3.1) |
| `T/corpus/CorpusHarnessTest.java` | 하네스 설정·대역 함수 검사(§3.1) |
| `M/src/evalex/index.ts` | evalex 모듈 배럴(§6.1) |
| `M/src/evalex/decimal.ts` | Decimal 설정·숫자 원문 표·평문 십진 판정(§6.2) |
| `M/src/evalex/contract-constants.ts` | 계약에서 온 상수(함수 집합·인자 수·예약 이름·EvalEx 상수 값)(§6.2) |
| `M/src/evalex/errors.ts` | `EvalexError`(ErrorCode 를 실은 오류), `FallbackSignal` |
| `M/src/evalex/values.ts` | `EvalValue`, `TypedValue` 변환, 선언 타입 변환(§6.2) |
| `M/src/evalex/functions.ts` | 함수 표(구현·지연 여부·NULL 인자 정책·인자 수)(§6.3) |
| `M/src/evalex/interpreter.ts` | `compile`·`evaluate`·`isSupported`·`usedVariables`·`checkRecordKeys`(§6.3·§6.4) |
| `M/src/evalex/pattern.ts` | `=` 패턴 토큰화·단순형 판정·`succ`(§6.5) |
| `M/src/evalex/cell-compare.ts` | `evaluateCell`(op-code 셀 직접 비교)(§6.5) |
| `M/src/evalex/rule-model.ts` | 룰 정의 TS 타입(§6.6) |
| `M/src/evalex/null-safety.ts` | AST NULL 안전 분석(필수·선택)(§6.7) |
| `M/src/evalex/input-contract.ts` | `computeInputContract`(§6.7) |
| `M/src/evalex/value-set.ts` | 값 집합 대수(§6.8) |
| `M/src/evalex/rule-analysis.ts` | `analyzeRule`(겹침·빈틈·도달 불가)(§6.8) |
| `M/src/evalex/rule-preview.ts` | `previewRule`(적중 정책 미리보기)(§6.9) |
| `M/tests/helpers/engine-paths.ts` | 엔진 쪽 파일 경로 상수(코퍼스·Java 계약 소스) |
| `M/tests/fixtures/evalex-rules.ts` | 테스트 룰 정의(QLTY_GRD_JDG, PROD_WGT_CALC PV1·PV2, BASE_SPD_LKP 두께 열)와 타입 해석기 |
| `M/tests/evalex-corpus.test.ts` | 코퍼스 화면 러너(§3.2) |
| `M/tests/evalex-interpreter.test.ts` | 인터프리터 단위 테스트 |
| `M/tests/evalex-contract-parity.test.ts` | 계약 상수 일치 테스트 |
| `M/tests/evalex-input-contract.test.ts` | 입력 계약 테스트 |
| `M/tests/evalex-cell-compare.test.ts` | 셀 비교 단위 테스트 |
| `M/tests/evalex-rule-analysis.test.ts` | 분석 테스트 |
| `M/tests/evalex-rule-preview.test.ts` | 미리보기 테스트 |
| `M/tests/evalex-perf.test.ts` | NFR-1 성능 테스트 |
| `M/tests/evalex-entry.test.ts` | 공개 경로 테스트 |

### 2.2 수정

| 파일 | 변경 |
|---|---|
| `M/package.json` | `dependencies` 에 `"decimal.js": "^10.6.0"`. `exports` 에 `"./evalex": { "types": "./dist/evalex/index.d.ts", "import": "./dist/evalex/index.js" }` 를 `"."` 다음에 추가 |
| `M/tsup.config.ts` | 첫 설정의 entry 를 `{ index: "src/index.ts", "evalex/index": "src/evalex/index.ts" }` 로 바꾼다. 다른 줄은 그대로 둔다 |
| `src/frontend/pnpm-lock.yaml` | `pnpm add` 결과(커밋 대상) |

### 2.3 수정하지 않는 것(명시)

- `J/**` 전부(엔진 main), 스키마 `E/src/main/resources/**/engine-contract.schema.json`, `E/build.gradle`.
- `T/arch/ContractOnlyPhaseTest.java`, `EnginePackageDependencyTest.java`, `MaruMdmEngineArchitectureTest.java`, `ContractTypeShapeTest.java`, `T/contract/**`, `T/expr/ExpressionEvaluatorTest.java`.
- `M/src/index.ts`(타입 전용 배럴 유지, F11), `M/src/contract/**`, `M/scripts/**`, 기존 두 테스트, `M/tsconfig.json`, `M/.prettierignore`.
- `src/frontend/pnpm-workspace.yaml`(바뀌면 되돌린다), `docs/mdm/engine-contract/**`(F13), `docs/mdm/decisions.md`.
- 형제 Task 가 쓸 test 패키지 `T/expr/**`·`T/rule/**`(03-03 의 `T/rule/fixture/**` 포함)와 resources `E/src/test/resources/kr/dongkuk/maru/mdm/engine/rule/**` 에는 파일을 만들지 않는다. 새 test 파일은 모두 `T/corpus/`, 새 resources 는 `R/corpus/` 에 둔다. 클래스 단순 이름도 03-03 의 main·test 이름(F20)과 겹치지 않는다.
- `T/contract/EngineContractSchemaTest.java`(`JAVA_ONLY` 목록 포함)는 고치지 않는다(F19).
- 커밋 제외: `docs/mdm/tasks/TSK-03-04/state.json`, `spec.md`, `.dflow*`, `.result`, `.issues`, `.tsbuildinfo`, `dist/`.

---

## 3. 테스트 전략

기준선: 백엔드 `testAll` 518건 실패 0, 프런트 m-mdm 6건 실패 0·lint 통과. 새 테스트를 먼저 쓰고 빨강(컴파일 실패·모듈 없음 포함)을 확인한 뒤 구현한다.

### 3.1 백엔드 — 새 테스트 273건 (518 → 791)

모두 `T/corpus/` 에 둔다. 코퍼스는 `CorpusConformanceTest.class.getResourceAsStream("/kr/dongkuk/maru/mdm/engine/corpus/engine-corpus.json")`, 스키마는 `"/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json"` 으로 읽고 Jackson `ObjectMapper.readTree` 로 파싱한다.

**`CorpusConformanceTest` — 169 + 82 + 1 = 252건**

| 테스트 | 종류 | 건수 | 검사 |
|---|---|---|---|
| `서버_평가가_코퍼스_기대값과_같다` | `@TestFactory` → `DynamicTest` 사례마다(표시 이름 = 사례 id) | 169 | §6.11 절차로 평가한 결과가 `expect.value`(값 비교) 또는 `expect.error`(코드 비교)와 같다. `screenFallback` 은 서버 쪽에서 보지 않는다. 셀 사례에 `patternRegex` 가 있으면 오라클이 만든 정규식이 그것과 글자까지 같아야 한다 |
| `식_사례의_AST_가_EvalEx_파싱_결과와_같다` | `@TestFactory` → expr 사례마다 | 82 | `AstMaps.toMap(new Expression(expr, harness 설정).getAbstractSyntaxTree())` 를 Jackson 트리로 바꾼 것이 사례의 `ast` 와 `JsonNode.equals` 로 같다. 텍스트와 AST 가 같은 식이라는 교차 확인이다 |
| `표본_15건의_id_와_기대값이_그대로_들어_있다` | `@Test` | 1 | 테스트 안 상수 `SAMPLE_EXPECTS`(§6.10 「표본 15건」의 `id → expect` 15쌍, docs 표본과 같은 값)와 코퍼스의 같은 id 사례 `expect` 가 Jackson 트리로 같다. docs 표본 파일은 읽지 않는다(TSK-03-01 D6 의 단일 사본 원칙). §6.14 5단계에서 표본 기대값을 서버 결과로 바꿔야 하는 상황이면 고치지 말고 멈춰 보고한다 |

**`CorpusShapeTest` — 4건**(JSON Schema 검증기는 쓰지 않는다. 스키마 `$defs` 를 읽어 대조한다)

| 테스트 | 검사 |
|---|---|
| `version_은_1_이고_cases_는_비어_있지_않다` | `version == 1`, `cases.size() > 0` |
| `id_는_유일하고_스키마_패턴을_지킨다` | 스키마 `ExprCase.properties.id.pattern` 으로 정규식을 만들어 모든 id 가 맞고 중복이 없다 |
| `사례_키가_ExprCase_CellCase_의_properties_와_required_를_지킨다` | `kind` 로 정의를 골라 사례 키 ⊆ `properties` 키, `required` ⊆ 사례 키. `variable` 객체도 `CellCase.properties.variable` 로 같은 검사 |
| `TypedValue_Expect_CellJson_모양이_스키마_변형_하나에_맞는다` | `TypedValue`: `type` 이 다섯 값 중 하나이고 변형의 키 집합과 같으며 NUMBER 는 변형의 `pattern` 을 지킨다. `Expect`: `value`·`error` 중 정확히 하나. `CellJson`: `op` 가 속한 묶음(`NoValueOp`·`SingleValueOp`·`ListOp`·`RangeOp`, 스키마 `enum` 에서 읽는다)의 변형 키 집합과 같다 |

**`CellTextOracleTest` — 14건**(V 자리 변수명은 `V`. 기대 텍스트는 03-03 §6.10.4 스냅샷의 같은 모양 항목과 글자까지 같다. 03-03 머지 뒤 이 테스트는 스냅샷 대조로 옮겨지고 지운다, §6.15)

| 테스트 | 셀 → 기대 텍스트 |
|---|---|
| `EQ_숫자는_리터럴을_정규화한다` | NUMBER `{op:EQ, left:"1.60"}` → `V != NULL && V == 1.6` |
| `음수_리터럴은_괄호로_감싼다` | NUMBER `{op:GE, left:"-1.5"}` → `V != NULL && V >= (-1.5)` |
| `구간_왼쪽_부등호는_뒤집고_오른쪽은_그대로다` | `{op:"<= 변수 <", left:"1.6", right:"2.5"}` → `V != NULL && V >= 1.6 && V < 2.5` |
| `구간_열린_아래_닫힌_위` | `{op:"< 변수 <=", left:"2.5", right:"3.0"}` → `V != NULL && V > 2.5 && V <= 3` |
| `IN_은_괄호로_묶은_OR_사슬이다` | STRING `{op:IN, list:["A","B"]}` → `V != NULL && (V == "A" \|\| V == "B")` |
| `NOT_IN_은_AND_사슬이다` | `{op:NOT_IN, list:["A","B"]}` → `V != NULL && V != "A" && V != "B"` |
| `패턴_단순형_셋` | `SGC%` → `V != NULL && STR_STARTS_WITH(V, "SGC")`, `%CC` → `V != NULL && STR_ENDS_WITH(V, "CC")`, `%G33%` → `V != NULL && INSTR(V, "G33") > 0` |
| `패턴_정규식형과_정규식_변환_거부` | `A%B` → `V != NULL && STR_MATCHES(V, "A.*B")`. `patternRegex("A.B%")` = 빈 값(단순형, 03-03 D11 ②), `patternRegex("A.B_")` = `A\.B.`(03-03 스냅샷 eq.pattern.regex-dot), `patternRegex("%A%B%")` = `.*A.*B.*`, 내부 변환 `likeToRegex("A.B%")` = `A\.B.*`(06:258 예시의 이스케이프, F14). 거부: `patternRegex("A\\B")`(홀로 선 `\`)·`patternRegex("%")`·`patternRegex("%A%B%C%")` 는 `IllegalArgumentException` |
| `이스케이프한_와일드카드와_문자열_리터럴` | `100\%` → `V != NULL && V == "100%"`. 값 `a"b\c` 의 EQ → `V != NULL && V == "a\"b\\c"` |
| `CONTAINS_와_INSTR_는_방향이_반대다` | CONTAINS `CC` → `V != NULL && INSTR(V, "CC") > 0`, INSTR `SGCC,SGHC` → `V != NULL && INSTR("SGCC,SGHC", V) > 0` |
| `CODE_IN_은_MASTER_로_만든다` | variable `maruCodeId: PROC_CD`, `{op:CODE_IN, left:"PLATING"}` → `V != NULL && MASTER("PROC_CD", "PLATING", V)` |
| `IS_NULL_NOT_NULL_NA` | `V == NULL`, `V != NULL`, NA → `""`(`NA_TEXT`, 03-03 F9) |
| `Boolean_은_TRUE_FALSE_맨_이름이다` | BOOLEAN `{op:EQ, left:"TRUE"}` → `V != NULL && V == TRUE` |
| `코퍼스_셀_텍스트의_함수는_GENERATED_안이다` | 코퍼스 cell 사례마다 텍스트를 만들어 하네스 설정으로 파싱하고, `getAllASTNodes()` 의 FUNCTION 이름 집합 ⊆ `FunctionSets.GENERATED` |

**`CorpusHarnessTest` — 3건**

| 테스트 | 검사 |
|---|---|
| `하네스_설정값이_MdmExpressionConfig_상수와_같다` | `configuration(Map.of())` 의 `getMathContext`·`getZoneId`·`getLocale`·`isAllowOverwriteConstants`·`isLenientMode`·`getMaxRecursionDepth`·`isArraysAllowed`·`isStructuresAllowed`·`isImplicitMultiplicationAllowed`·`isSingleQuoteStringLiteralsAllowed`·`isBinaryAllowed`·`isStripTrailingZeros`·`getDecimalPlacesRounding`·정규식 타임아웃 getter 가 `MdmExpressionConfig` 의 같은 이름 상수와 같다(getter 이름은 Build 가 `javap` 로 확인한다) |
| `하네스_함수_사전은_BASE_와_INSTR_MASTER_뿐이다` | `FunctionSets.BASE` 이름마다 `hasFunction` 참, `INSTR`·`MASTER` 참, `MASTER_AT` 거짓, `FunctionSets.STANDARD` 밖 이름(`LOG`, `DT_NOW`, `STR_FORMAT`) 거짓 |
| `대역_INSTR_는_06_규칙을_따른다` | `INSTR("SGCC", "CC")` = 3, `INSTR("SGCC", "cc")` = 0, `INSTR(X, "C")`(X NULL) = NULL, `INSTR("abc", "")` = 1 |

### 3.2 프런트 — 새 테스트 251건 (6 → 257)

모든 테스트는 `M/tests/*.test.ts`(평면 배치, 기존 관례)다. 경로는 `tests/helpers/engine-paths.ts` 가 한 번 정한다.

```ts
// M/tests/helpers/engine-paths.ts
export const ENGINE_ROOT = path.resolve(__dirname, "../../../../backend/maru-mdm-engine");
export const CORPUS_PATH = path.join(ENGINE_ROOT, "src/test/resources/kr/dongkuk/maru/mdm/engine/corpus/engine-corpus.json");
export const JAVA_EXPR_DIR = path.join(ENGINE_ROOT, "src/main/java/kr/dongkuk/maru/mdm/engine/expr");
```
(`M/tests/helpers/` 에서 `../../../../` 는 `src/` 다. Build 는 `existsSync(CORPUS_PATH)` 로 한 번 확인한다.)

| 파일 | 건수 | 테스트 |
|---|---|---|
| `evalex-corpus.test.ts` | 169 + 3 = 172 | `it.each(cases)("%s", …)` 사례마다 1건(§6.12). 메타 3건: `폴백을 허용한 사례는 고정 목록 4건과 같다`(screenFallback=true 인 id 집합 == `ALLOWED_FALLBACK_IDS`), `id 가 유일하다`, `m-mdm 안에 코퍼스 사본이 없고 러너는 엔진 test resources 를 읽는다`(node_modules·dist 를 뺀 m-mdm 트리에 `*corpus*.json` 0개, `CORPUS_PATH` 가 엔진 경로이고 파일이 있다) |
| `evalex-interpreter.test.ts` | 16 | 아래 표 |
| `evalex-contract-parity.test.ts` | 5 | 아래 표 |
| `evalex-input-contract.test.ts` | 14 | 아래 표 |
| `evalex-cell-compare.test.ts` | 3 | 아래 표 |
| `evalex-rule-analysis.test.ts` | 21 | 아래 표 |
| `evalex-rule-preview.test.ts` | 13 | 아래 표 |
| `evalex-perf.test.ts` | 4 | §6.13 |
| `evalex-entry.test.ts` | 3 | `package.json exports 에 ./evalex 가 dist/evalex/index.js·d.ts 를 가리키고 루트 배럴 src/index.ts 에는 ./evalex 문자열이 없다`, `tsup 첫 설정 entry 에 evalex/index 가 src/evalex/index.ts 로 있다`, `decimal.js 는 dependencies 에 있고 devDependencies 에 없다` |

**`evalex-interpreter.test.ts` (16)**

| # | 테스트 | 기대 |
|---|---|---|
| 1 | `isSupported: 6종 노드와 BASE 함수만 쓴 AST 는 참이다` | `IF(A > 1, ROUND(A, 2), STR_LEFT(B, 2))` 의 AST → true |
| 2 | `isSupported: MASTER_AT 은 거짓이다` | false |
| 3 | `isSupported: MASTER 는 codeSets 에 id|cate 집합이 있을 때만 참이다` | codeSets 없음 false, `{"PROC_CD|PLATING": [...]}` 있음 true, 첫 인자가 리터럴이 아니면 false |
| 4 | `isSupported: MASTER 의 attr 형태는 거짓이다` | 인자 4개 → false |
| 5 | `isSupported: 허용 밖 함수와 인자 수가 틀린 INSTR 은 거짓이다` | `LOG(A)` false, `INSTR(A, "B", "C")` false |
| 6 | `isSupported: 알 수 없는 노드 종류는 거짓이다` | `{type: "ARRAY_INDEX", …}` false |
| 7 | `usedVariables 는 대문자·첫 등장 순서이고 상수를 뺀다` | `b + A * PI + B` → `["B", "A"]` |
| 8 | `예약 키는 평가 전에 거부된다` | 키 `true` → CONSTANT_KEY, `eval_ts` → EVAL_TS_KEY, `_X` → RESERVED_KEY(대소문자 무시), `A` 와 `a` 가 함께 오면 RESERVED_KEY |
| 9 | `같은 AST 객체는 compile 결과를 재사용한다` | `compile(ast) === compile(ast)` |
| 10 | `리터럴과 레코드 숫자는 원문 스케일로 문자열이 된다` | `STR_UPPER(1.50)` → `"1.50"`, `"" + X`(X 원문 `"1.10"`) → `"1.10"`, `"" + ROUND(X, 2)`(X `"2.5"`) → `"2.50"` |
| 11 | `계산한 숫자를 문자열로 바꾸는 자리는 폴백한다` | `"" + (0.1 * 10)` → `{kind: "fallback"}` |
| 12 | `혼합 타입 대소 비교는 폴백한다` | `1 < "2"` → fallback |
| 13 | `STR_TRIM 은 U+0020 이하만 자른다` | `STR_TRIM(" a ")` → `" a"` |
| 14 | `숫자 결과는 평문 십진 TypedValue 가 된다` | `SWITCH(X, 1, 10, 20)` → `{type: "NUMBER", value: "20"}`(지수 표기 아님) |
| 15 | `validate 는 결과가 boolean 이 아니면 EVALUATION_ERROR 다` | `validate(ast("value >= 0.1"), {value: "0.5"})` → `{kind: "value", value: true}`, `validate(ast("value + 1"), {value: "1"})` → `{kind: "error", code: "EVALUATION_ERROR"}` |
| 16 | `prepare 한 scope 를 여러 식에 다시 써도 결과가 같다` | `const s = prepare({A: "1.10", B: "2"})` 를 `A + B == 3.1`·`STR_UPPER("" + A)` 에 넘긴 결과가 원본 vars 를 넘긴 결과와 같다(`true`, `"1.10"`). 예약 키가 있으면 `prepare` 가 `EvalexError("CONSTANT_KEY")` 를 던진다 |

**`evalex-contract-parity.test.ts` (5)** — Java 계약 소스를 텍스트로 읽어 정규식으로 뽑는다(스키마를 상대경로로 공유한 TSK-03-01 관례와 같다).

| # | 테스트 | 검사 |
|---|---|---|
| 1 | `화면 BASE 함수 = FunctionSets.BASE` | `FunctionSets.java` 의 `BASE = Set.of(…)` 안 문자열 리터럴 집합 == `contract-constants.ts` 의 `BASE_FUNCTIONS` == `functions.ts` 표에서 `set === "BASE"` 인 이름 |
| 2 | `MDM 함수 인자 수 = MdmFunction` | `MdmFunction.java` 의 `INSTR(2, 2, …)`, `MASTER(3, 4, …)`, `MASTER_AT(4, 5, …)` == `MDM_ARITY` |
| 3 | `예약 이름 = ReservedNames` | `CONSTANTS = Set.of(…)` 8개 == `RESERVED_CONSTANTS`, `EVAL_TS = "EVAL_TS"`, `RESERVED_PREFIX = "_"` |
| 4 | `Decimal 설정 = MdmExpressionConfig.MATH_CONTEXT` | `new MathContext(68, RoundingMode.HALF_EVEN)` 을 읽어 `D.precision === 68`, `D.rounding === Decimal.ROUND_HALF_EVEN` |
| 5 | `NULL 인자 정책 표가 지원 함수를 모두 덮는다` | `functions.ts` 의 모든 함수에 `nullPolicy` 가 있다 |

**`evalex-input-contract.test.ts` (14)** — 기대값은 06:226-229 와 html PV2.

| # | 테스트 | 기대 |
|---|---|---|
| 1 | `PROD_WGT_CALC: always 는 조건 열 순서의 PROD_TYPE, CALC_BASIS 다` | `always.map(v => v.name)` = `["PROD_TYPE", "CALC_BASIS"]` |
| 2 | `PROD_WGT_CALC: 행은 seq 순서이고 cond 는 06 문자열이다` | rowId `[1, 3, 2]`, cond `["PROD_TYPE = COIL · CALC_BASIS = LEN", "PROD_TYPE = COIL · CALC_BASIS = DIA", "PROD_TYPE = SHEET"]` |
| 3 | `PROD_WGT_CALC: 행별 required 집합이 06 과 같고 optional 은 비었다` | 행 1 `{COIL_THK, COIL_WID, COIL_LEN, SPEC_GRAV}`, 행 3 `{COIL_WID, COIL_OUT_DIA, COIL_IN_DIA, COIL_VOID_RT, SPEC_GRAV}`, 행 2 `{COIL_THK, COIL_WID, SHEET_LEN, SHEET_CNT, SPEC_GRAV}`. 비교는 정렬한 배열로 한다(F15) |
| 4 | `VarType 은 타입 해석기가 준 값을 싣는다` | 행 1 `COIL_THK` → `{name: "COIL_THK", dataType: "NUMBER", scale: 2, domainId: "THK_MM"}` |
| 5 | `PV2: COALESCE(SPEC_GRAV, 7.85) 의 SPEC_GRAV 는 모든 행에서 optional 이다` | 세 행 모두 optional = `["SPEC_GRAV"]`, required 에 없음(근거: html PV2 "비중을 비우면 7.85로 본다") |
| 6 | `사칙연산·대소 비교·ROUND 인자 자리는 필수다` | `ROUND(A * B, 1) > C` → required {A, B, C} |
| 7 | `== 과 != 피연산자로만 쓰인 변수는 선택이다` | `IF(A == "X", 1, 2)` → A optional |
| 8 | `COALESCE 의 마지막이 아닌 인자는 선택이고 마지막 인자는 바깥 문맥을 따른다` | `COALESCE(A, B) * 2` → A optional, B required. `COALESCE(A, B) == 1` → 둘 다 optional |
| 9 | `IF 의 NULL 검사로 막은 가지 안의 변수는 선택이다` | `IF(X != NULL, X * 2, 0)` → X optional. `IF(X == NULL, 0, X * 2)` → X optional. `IF(X != NULL, 1, X * 2)` → X required |
| 10 | `&& 왼쪽의 != NULL 검사도 오른쪽을 막는다` | `X != NULL && X > 1` → X optional. `X == NULL \|\| X > 1` → X optional |
| 11 | `STR_CONTAINS 인자와 MASTER key 는 선택이고 INSTR 인자는 바깥 문맥을 따른다` | `STR_CONTAINS(A, "u")` → A optional. `MASTER("C", "BASE", K)` → K optional. `INSTR(S, "C") > 0` → S required. `INSTR(S, "C") == 1` → S optional |
| 12 | `MIN 인자와 식 뿌리의 맨 변수는 필수다` | `MIN(A, 1)` → A required(애매하면 필수, 06:208). 결과 식 `A` → A required |
| 13 | `Expression 조건 셀과 열 조건의 변수는 always 이고 룰 결과 변수는 빠진다` | Expression 조건 셀 `COIL_THK * COIL_WID > 3000` 과 열 조건 `STR_STARTS_WITH(TOP_RESIN_CD, "2")` 가 있는 룰: always 에 `COIL_THK, COIL_WID, TOP_RESIN_CD` 가 든다. 결과 식 `QLTY_GRD` 를 읽는 결과 셀이 있어도 그 룰의 결과 변수 `QLTY_GRD` 는 행 목록에 없다 |
| 14 | `기본 행은 마지막에 싣고, 식 변수 열은 참조 변수를 always 에 넣는다` | DEFAULT 행 → 마지막, cond `"기본 행"`. 식 변수 열(exprAst `STR_SUBSTRING(MAT_CD, 1, 2)`) → always 에 `MAT_CD` |

**`evalex-cell-compare.test.ts` (3)**

| # | 테스트 | 기대 |
|---|---|---|
| 1 | `정규식형 패턴에 patternRegex 가 없으면 폴백한다` | `{op: EQ, left: "A%B"}`, 옵션 없음 → `{kind: "fallback"}` |
| 2 | `셀 리터럴이 변수 타입으로 바뀌지 않으면 EVALUATION_ERROR 다` | NUMBER 변수 `{op: GE, left: "abc"}` → error EVALUATION_ERROR(저장 시 검사가 막는 자리. 화면은 값을 지어내지 않는다) |
| 3 | `= A 와 IN (A) 는 같은 값에 같은 결과다` | 값 "A"·"B"·NULL 세 개에서 두 셀 결과가 같다 |

**`evalex-rule-analysis.test.ts` (21)** — 이슈 목록 **전체**를 `{code, severity, rowIds, varId, lower, upper}` 로 비교한다(`message` 는 빼고, 없는 칸은 `undefined`). 부분 포함 검사를 쓰지 않는다. 목록 순서는 §6.8 의 검사 순서다. 아래 표에서 NULL_GAP 을 따로 적지 않은 경우에도, NA·IS_NULL 셀이 하나도 없는 변수 조건 열의 NULL_GAP 은 기대 목록에 들어간다(Build 는 테스트에 명시적으로 적는다).

| # | 테스트 | 기대 이슈 목록 |
|---|---|---|
| 1 | `06 저장 시 검사 예: 2.50 이 빈틈이고 NULL 빈틈은 따로 보인다` | 두께 열(var 1, NUMBER scale 2, TWO) 행 1 `<= 변수 <` 1.6 2.5, 행 2 `< 변수 <=` 2.5 3.0, UNIQUE → `[{VALUE_GAP, WARNING, rowIds [1,2], varId 1, lower "2.50", upper "2.50"}, {NULL_GAP, WARNING, rowIds [], varId 1}]` |
| 2 | `이어진 구간이면 값 빈틈이 없다` | 행 2 를 `<= 변수 <=` 2.5 3.0 으로 → `[{NULL_GAP, varId 1}]` |
| 3 | `빈틈은 소수 자리수 격자로 판정한다` | 행 1 `<= 변수 <=` 1.6 2.5, 행 2 `<= 변수 <=` 2.6 3.0. scale 1 → `[NULL_GAP]`, scale 2 → `[VALUE_GAP lower "2.51" upper "2.59", NULL_GAP]` |
| 4 | `바깥 반직선은 빈틈으로 보고하지 않는다` | 행 하나 `>= 1.6` → `[NULL_GAP]` |
| 5 | `IS NULL 행이 있으면 NULL 빈틈이 없다` | 행 1 `>= 0`, 행 2 `IS_NULL` → `[]`(행 1 `< 0` 쪽은 바깥 반직선) |
| 6 | `scale 이 없으면 그 열 리터럴의 최대 소수 자리수를 쓴다` | scale null, 행 `<= 변수 <` 1.6 2.5·`< 변수 <=` 2.5 3.05 → VALUE_GAP lower "2.50" upper "2.50"(격자 0.01) |
| 7 | `다축은 나머지 조건 셀이 같은 행끼리 묶어 빈틈을 본다` | 두께 열(var 1, seq 1, NUMBER scale 2, TWO)과 폭 열(var 2, seq 2, NUMBER scale 0, ONE), FIRST. 행 1 (`<= 변수 <` 1.6 2.5, `LT 1000`), 행 2 (`<= 변수 <=` 2.5 3.0, `LT 1000`), 행 3 (`<= 변수 <` 1.6 2.5, `GE 1000`), 행 4 (`< 변수 <=` 2.5 3.0, `GE 1000`) → `[{VALUE_GAP, rowIds [3,4], varId 1, lower "2.50", upper "2.50"}, {NULL_GAP, varId 1}, {NULL_GAP, varId 2}]`(폭 열은 두께가 같은 행끼리 묶으면 `LT 1000 ∪ GE 1000` 이 빈틈 없이 이어진다) |
| 8 | `UNIQUE 표의 겹침은 OVERLAP ERROR 다` | 행 1 `IN (A)`, 행 2 `IN (A, B)` (STRING 열 하나) → OVERLAP ERROR rowIds [1,2] 와 NULL_GAP |
| 9 | `FIRST 표의 겹침은 OVERLAP WARNING 이고 뒤 행이 덮이면 UNREACHABLE 도 낸다` | 같은 두 행을 FIRST 로 → OVERLAP WARNING [1,2], NULL_GAP. 행 2 가 행 1 을 덮지만 반대는 아니므로 UNREACHABLE 없음 |
| 10 | `= A 와 IN (A) 는 같은 집합이라 겹친다` | `EQ A`·`IN (A)` UNIQUE → OVERLAP ERROR |
| 11 | `<> A 와 IS NULL 은 겹치지 않는다` | UNIQUE `NE A`·`IS_NULL` → `[]` |
| 12 | `한 열이라도 서로소면 두 행은 겹치지 않는다` | 두 열 표, 첫 열은 같고 둘째 열 `IN (A)`·`IN (B)` → OVERLAP 없음 |
| 13 | `접두 패턴은 반개구간이다` | `EQ "SGC%"` 와 `EQ "SGCC"` → OVERLAP. `EQ "SGC%"` 와 `EQ "SGD"` → 없음 |
| 14 | `정적으로 못 푸는 셀은 UNRESOLVED_CELL 이고 그 짝은 OVERLAP_UNRESOLVED 다` | STRING 열 행 1 `EQ "A%B"`, 행 2 `CONTAINS "X"`, 행 3 `IN (C)` UNIQUE → UNRESOLVED_CELL [1], [2], OVERLAP_UNRESOLVED [1,2], [1,3], [2,3], NULL_GAP |
| 15 | `Expression 셀이 낀 짝은 OVERLAP_UNRESOLVED 이고 Expression 열은 NULL 빈틈 대상이 아니다` | 조건 열 둘(var 1 NUMBER `ONE`, var 2 `EXPRESSION`), UNIQUE. 행 1 (`GE 1`, `A > 1`), 행 2 (`GE 2`, `A > 2`) → `[{UNRESOLVED_CELL, [1], varId 2}, {UNRESOLVED_CELL, [2], varId 2}, {OVERLAP_UNRESOLVED, [1,2]}, {NULL_GAP, varId 1}]` |
| 16 | `조건 셀이 전부 - 인 NORMAL 행은 ALL_NA_ROW ERROR 다` | 행 2 가 전부 NA → ALL_NA_ROW ERROR [2]. 그 행은 다른 검사에서 뺀다 |
| 17 | `FIRST: 앞 행 하나가 뒤 행을 덮으면 UNREACHABLE 이다` | 행 1 `>= 1.6`, 행 2 `<= 변수 <` 1.6 2.5 → OVERLAP WARNING [1,2], UNREACHABLE WARNING rowIds [2, 1], NULL_GAP |
| 18 | `FIRST: 앞 행 여럿의 합집합이 덮어도 UNREACHABLE 이고 한 칸이라도 비면 아니다` | 두 열(두께 NUMBER, 등급 STRING). 행 1 (`< 2`, `IN (A)`), 행 2 (`>= 2`, `IN (A)`), 행 3 (`<= 변수 <=` 1 3, `EQ A`) → UNREACHABLE [3, 1, 2]. 행 2 를 `> 2` 로 바꾸면 UNREACHABLE 없음(2 가 빈다) |
| 19 | `UNIQUE 표에는 UNREACHABLE 을 내지 않는다` | 17 번 행을 UNIQUE 로 → OVERLAP ERROR 와 NULL_GAP 만 |
| 20 | `06 샘플 두 표` | QLTY_GRD_JDG(06:83-90, FIRST) → `[{NULL_GAP, varId 두께}, {NULL_GAP, varId 표면등급}]`. BASE_SPD_LKP 두께 열(F18, UNIQUE) → `[{NULL_GAP, varId 두께}]` |
| 21 | `Boolean 과 일자 String 은 이산 값으로 본다` | Boolean 열 `EQ TRUE`·`EQ FALSE` UNIQUE → `[{NULL_GAP}]`(겹침 없음). 일자 열 `LT 20260902`·`GT 20260901` UNIQUE → `[{NULL_GAP}]`(두 날 사이에 일자가 없어 겹침 없음) |

**`evalex-rule-preview.test.ts` (13)**

| # | 테스트 | 기대 |
|---|---|---|
| 1 | `QLTY FIRST: 1행에 적중하고 뒤 행은 평가하지 않는다` | `COIL_THK "2.0"`, `COIL_WID "1200"`, `SURF_GRD "A"` → hits `[{rowId 1, seq 1}]`, trace 2·3행 `evaluated false` |
| 2 | `QLTY: 어느 행도 참이 아니면 기본 행이다` | `COIL_THK "3.0"`, `COIL_WID "1200"`, `SURF_GRD "C"` → hits `[]`, `defaultApplied true`, 3행 `firstFalseVarId` = 표면등급 var |
| 3 | `QLTY: 두께가 NULL 이면 두께 셀은 모두 거짓이다` | `COIL_THK null` → 1·2·3행 거짓, `firstFalseVarId` 두께, 기본 행 |
| 4 | `UNIQUE 에서 두 행이 적중하면 UNIQUE_MULTIPLE_HITS 다` | error code `UNIQUE_MULTIPLE_HITS`, rowIds [1, 2] |
| 5 | `PRIORITY·COLLECT·ANY 는 적중 행을 모두 돌려준다` | 같은 레코드에 세 정책 각각 hits 두 개 |
| 6 | `PROD_WGT_CALC 값 테스트 세 사례의 적중 행` | F16 입력 → hits 1, 3, 2 |
| 7 | `BASE_SPD_LKP 0.65 는 3행이다` | hits `[{rowId 3}]` |
| 8 | `조건 변수 키가 없으면 MISSING_KEY 이고 CALC_BASIS 는 시트 요청에도 필요하다` | 시트 레코드에서 `CALC_BASIS` 키를 빼면 error MISSING_KEY |
| 9 | `조건 변수 값이 선언 타입으로 바뀌지 않으면 TYPE_CONVERSION 이다` | `COIL_THK "abc"` → TYPE_CONVERSION |
| 10 | `레코드 키가 상수 이름이면 CONSTANT_KEY 다` | 키 `Pi` → CONSTANT_KEY |
| 11 | `Expression 조건 셀이 지원 밖이면 폴백하되 다른 셀이 거짓인 행은 확정 거짓이다` | FIRST 두 행, 두 행 모두 Expression 셀이 `MASTER_AT(…)`. 행 1 은 앞 셀이 거짓 → hit false. 행 2 는 앞 셀이 참 → 판정 불가 → 결과 `{kind: "fallback"}`, trace 행 2 `hit null` |
| 12 | `Expression 조건 셀 결과가 NULL 이면 그 셀만 거짓이고 EXPR_CELL_NULL 경고를 남긴다` | 셀 `IF(A > 1, TRUE, NULL)`, A "0" → 행 거짓, warnings `[{code: "EXPR_CELL_NULL", rowId, varId}]` |
| 13 | `식 변수는 참조 변수가 NULL 이면 NULL 이고 IS NULL 셀만 참이다` | 식 변수 열(`STR_SUBSTRING(MAT_CD, 1, 2)`, STRING) 행 1 `EQ "A"`, 행 2 `IS_NULL`. `MAT_CD null` → 행 2 적중. `MAT_CD "XAB"` → 행 1 적중 |

### 3.3 브라우저 E2E 스모크 넷

| 스모크 | 판정 | 사유 |
|---|---|---|
| 화면 진입(메뉴 → 화면 열림) | 해당 없음 | entry-point 가 "화면 없음"이다. 이 Task 는 라이브러리 서브패스 `@dk-oasis/m-mdm/evalex` 만 만들고 `pages/**` 를 더하지 않는다 |
| 조회·목록 표시 | 해당 없음 | 조회 API·화면이 없다 |
| 저장·검증 흐름 | 해당 없음 | 저장 화면이 없다. 소비 화면은 TSK-08-02·08-03·08-04(02 도메인·06 룰 화면)가 만든다 |
| 콘솔 오류·네트워크 실패 없음 | 해당 없음 | 브라우저에서 로드되는 번들이 없다. 대신 `pnpm build:libs` 가 서브패스 번들을 만들고, Build·Verify 가 `ls src/frontend/m-mdm/dist/evalex/index.js src/frontend/m-mdm/dist/evalex/index.d.ts` 로 산출물을 눈으로 확인해 보고에 적는다 |

### 3.4 게이트 명령(오케스트레이터가 실제로 돌린 명령, 글자 그대로)

```bash
# 백엔드 — 518건 실패 0 기준, 이 Task 뒤 791건 실패 0 기대
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon
# 프런트 — 6건 실패 0·lint 통과 기준, 이 Task 뒤 257건 실패 0·lint 통과 기대
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```

- 엔진만 빠르게 돌릴 때: `cd src/backend/maru-mdm-engine && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew test --no-daemon`.
- 테스트는 **반드시 포그라운드로 끝까지** 돌린다. `run_in_background` 를 쓰지 않는다(알림을 기다리다 멈춘 사고가 있었다).
- 건수 산식: 백엔드 = 169(서버 평가) + 82(AST 대조) + 1(표본) + 4(모양) + 14(오라클) + 3(하네스) = 273. 프런트 = 172 + 16 + 5 + 14 + 3 + 21 + 13 + 4 + 3 = 251. 코퍼스 사례 수가 바뀌면 두 산식을 함께 고치고 보고에 적는다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 06 「저장 시 검사」 겹침·빈틈 예시 통과 | `evalex-rule-analysis.test.ts` #1(06:364 원문 예: 소수 2자리 두께 열 `1.6 <= 변수 < 2.5` 다음 `2.5 < 변수 <= 3.0` → 값 빈틈 2.50, NULL 빈틈 따로)을 이슈 목록 전체로 비교한다. 같은 절의 규칙은 #2~#21 이 한 줄씩 붙잡는다: UNIQUE 겹침 오류·나머지 경고(#8·#9, 06:364), `= A`·`IN (A)` 동일(#10, 06:156), 가드된 셀과 `IS NULL` 불교차(#11, 06:354), 모든 열 교차 규칙(#12, 06:364), 접두 반개구간(#13, 06:359), 못 푸는 셀 경고(#14·#15, 06:343·360-362), 전부 `-` 행 거부와 FIRST 도달 불가(#16~#19, 06:342), 다축 묶음(#7, workrule 5절) |
| 계약 계산이 PROD_WGT_CALC 행별 계약과 일치 | `evalex-input-contract.test.ts` #1~#4 가 06:226-229 의 `always`·행 순서·`cond`·행별 `required`(집합)·빈 `optional` 을 그대로 비교한다. #5 는 시안 PV2 로 선택 판정을 확인한다. 필수·선택 규칙(06:208)은 #6~#12 가 붙잡는다 |
| 코퍼스 불일치 0건 | 같은 파일 `R/corpus/engine-corpus.json`(169건)을 JUnit `CorpusConformanceTest`(서버 평가 169 + AST 대조 82)와 Vitest `evalex-corpus.test.ts`(169)가 읽고 모두 기대값과 같아야 한다. 두 쪽이 같은 기대값과 같으므로 서로 같다. 화면 폴백은 고정 목록 4건에서만 허용한다(메타 테스트, D4) |
| 1만 행 평가 100 ms 이내(NFR-1) | `evalex-perf.test.ts` 4건(§6.13, D6): 1만 레코드 × 식 1개(R2·R3), 1만 레코드 × 룰 1개 미리보기(BASE_SPD_LKP UNIQUE 7행, QLTY_GRD_JDG FIRST). 입력 문자열 → Decimal 변환을 포함하고, 워밍업 3회 뒤 5회 측정한 중앙값 < 100 ms. 기준은 완화하지 않는다 |
| (요구사항) 조건 열별 값 집합으로 겹침·빈틈·도달 불가 계산 | `value-set.ts`·`rule-analysis.ts`, 위 분석 테스트 21건 |
| (요구사항) AST 기반 행별 필수·선택 입력 변수 | `null-safety.ts`·`input-contract.ts`, 입력 계약 테스트 14건 |
| (요구사항) op-code 셀 직접 비교, 적중 정책·겹침 즉시 미리보기(decimal.js) | `cell-compare.ts`(코퍼스 cell 87건 + 단위 3건), `rule-preview.ts`(13건), 겹침은 `analyzeRule`(분석 테스트) |
| (요구사항) AST 인터프리터, 지원 밖 노드는 isSupported=false 로 서버 폴백 | `interpreter.ts`(코퍼스 expr 82건 + 단위 16건 + 계약 일치 5건). 폴백은 interpreter #2~#6·#11·#12, 미리보기 #11 |
| (요구사항) 서버·JS 정합성 코퍼스 JSON + 양쪽 러너 | 코퍼스 한 벌(엔진 test resources) + JUnit·Vitest 러너, 사본 없음 메타 테스트 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 는 이 표를 순회해 변이를 넣고 빨강을 확인한 뒤 되돌린다. "변이"는 구현 쪽에 넣는다. 코퍼스 기대값을 고쳐 초록을 만드는 것은 변이 검증이 아니다.

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I1 | Decimal precision 68(EvalEx `MathContext`) | `decimal.ts` precision 34 → 코퍼스 `expr.divide.precision`·`expr.average.rounding` + parity #4 |
| I2 | 반올림은 HALF_EVEN(연산과 `ROUND`) | `ROUND` 를 `ROUND_HALF_UP` 로 → `expr.round.half-even`(2.345 → 2.34. 2.355 는 두 방식이 같아 가려내지 못한다) |
| I3 | 나머지는 피제수 부호(절삭 나머지) | `modulo: Decimal.ROUND_FLOOR` → `expr.modulo.negative` |
| I4 | `==`: 타입이 다르면 거짓, 둘 다 NULL 이면 참, 숫자는 값 비교 | 원천 샘플의 숫자 승격 복원 → `expr.eq.mixed-type`. 숫자를 문자열로 비교 → `expr.eq.number-scale`·`cell.eq.trailing-zero` |
| I5 | NA·IS_NULL·NOT_NULL 을 뺀 op-code 셀은 NULL 에 거짓(가드) | `NE` 의 NULL 처리를 `!=` 의미(참)로 → `cell.ne.null`. `NOT_IN` 동일 → `cell.not-in.null`. LT 에서 예외 → `cell.lt.null` |
| I6 | NA 셀은 NULL 에도 참 | NA 를 "값 있을 때만 참"으로 → `cell.na.null` |
| I7 | 구간 op: 왼쪽 부등호는 뒤집고 오른쪽은 그대로 | `<= 변수 <` 를 양쪽 닫힘으로 → `cell.range.upper-open-boundary`. `< 변수 <=` 아래 닫힘 → `cell.range.oi.lower` |
| I8 | `&&`·`\|\|` 단락 평가, 평가한 피연산자가 NULL 이면 EVALUATION_ERROR | 단락 제거 → `expr.and.false-short`. NULL 을 거짓으로(원천 샘플) → `expr.or.null-left`·`expr.and.null-left` |
| I9 | `IF` 는 지연 평가이고 조건 NULL 은 거짓 가지 | 인자를 미리 평가 → `expr.if.lazy`. NULL 조건 오류 → `expr.if.null-cond` |
| I10 | `MIN`·`MAX`: 앞쪽 NULL 은 누산기에 들어가고, 찬 뒤의 NULL 은 오류 | NULL 무시 → `expr.min.null-later`. 첫 NULL 도 오류 → `expr.min.null-first` |
| I11 | `+` 는 두 쪽이 숫자일 때만 덧셈, 아니면 문자열 연결(NULL 은 `"null"`) | NULL 을 오류로(원천 샘플) → `expr.null-plus`·`expr.plus-null-right` |
| I12 | `- * / % ^` 와 단항 `-`·`+` 는 문자열·NULL 을 숫자로 바꾸지 않고 오류 | 원천 샘플의 문자열 승격 복원 → `expr.string-times` |
| I13 | `^` 는 정수부 `pow(mc)` × 소수부 `Math.pow`, 음수 지수는 소수 68자리 HALF_UP 역수 | decimal.js `pow` 한 번으로 → `expr.power.fraction`·`expr.power.mixed`. 역수를 precision 68 로 나눔 → `expr.power.negative-scale`(유효숫자 68 이 되어 마지막 자리가 빠진다). 역수 반올림을 HALF_EVEN 으로 바꾸는 변이는 이 코퍼스로 가려내지 못한다(덮지 못하는 변이로 보고) |
| I14 | `SQRT` 는 BigInt Newton, 소수 68자리 버림 | decimal.js `sqrt()` 로 → `expr.sqrt` |
| I15 | 예약 키 검사(상수 8종·`EVAL_TS`·`_` 접두, 대소문자 무시)가 평가보다 먼저다 | 검사 제거 → `expr.constant-key`(원천 샘플은 조용히 상수를 쓴다)·`cell.constant-key`·`expr.eval-ts-key`·`expr.reserved-key`, interpreter #8 |
| I16 | 식 변수가 레코드에 없으면 MISSING_KEY | 누락을 NULL 로(lenient) → `expr.missing-key` |
| I17 | 문자열 대소 비교는 UTF-16 코드유닛 순서 | `localeCompare` 로 → `expr.string-order`(`"B" < "a"`), `expr.string-order.digits` |
| I18 | CONTAINS·INSTR·`=` 패턴은 대소문자를 구분하고 글자 그대로 찾는다 | 소문자로 맞춰 비교 → `cell.contains.case`·`cell.instr.case`·`cell.eq.pattern.prefix-case`. `%`·`.` 를 와일드카드로 → `cell.contains.percent-literal`·`cell.contains.meta-literal`·`cell.instr.meta` |
| I19 | `=` 패턴: `%` 0자 이상, `_` 한 글자, `\%`·`\_`·`\\` 는 글자, 전체 일치 | 이스케이프 무시 → `cell.eq.pattern.escaped-percent`·`cell.eq.pattern.escaped-underscore`·`cell.eq.pattern.backslash`. 앵커 제거 → `cell.eq.pattern-regex.full-match` |
| I20 | CODE_IN 은 받아 둔 `마루코드|카테고리` 집합의 `has`, 집합이 없으면 폴백 | 집합 없으면 false → 코퍼스 `cell.code-in.no-set`(폴백 기대) |
| I21 | `isSupported`: 6종 노드·허용 연산자·`BASE ∪ {INSTR}` + 조건부 `MASTER`. `MASTER_AT`·`attr`·집합 없는 `MASTER` 는 거짓 | `MASTER_AT` 허용 → interpreter #2. `MASTER` 무조건 허용 → #3·`expr.master.data-fallback` |
| I22 | 화면 함수 집합·인자 수·예약 이름·Decimal 설정 = Java 계약 | `BASE_FUNCTIONS` 에 `LOG` 추가 → parity #1. `MDM_ARITY.MASTER` 최대 5 → parity #2 |
| I23 | 계산한 숫자를 문자열로 바꾸거나 혼합 타입을 대소 비교하는 자리는 폴백(틀린 값을 내지 않는다) | 폴백 대신 `toFixed()` → `expr.concat.computed-scale` 이 value 가 되어 실패(허용 목록은 폴백을 요구) + interpreter #11. 혼합 비교를 문자열 비교로 → `expr.compare.mixed-type` + #12 |
| I24 | 화면 폴백은 `ALLOWED_FALLBACK_IDS` 4건에서만 허용하고, 그 밖의 폴백은 실패다 | 러너가 모든 폴백을 통과로 → 메타 테스트 `폴백을 허용한 사례는 고정 목록…` 은 그대로지만, 폴백이 새로 생기는 변이(예: I12 를 폴백으로 처리)는 해당 사례에서 실패 |
| I25 | 리터럴·레코드 숫자는 원문 스케일로 문자열이 된다 | 원문 표를 끄기 → `expr.str-upper.literal-scale`·`expr.concat.record-scale`(폴백이 되어 실패) |
| I26 | 셀 값 타입 변환 = 03-03 `ValueConverter`(§6.2 표): NUMBER ← 숫자·BigDecimal 모양 문자열, STRING ← 문자열·숫자(평문), BOOLEAN ← 불린·`TRUE`/`FALSE` 문자열 | STRING → NUMBER 변환 금지 → `cell.type.number-from-string`. NUMBER → STRING 거부 → `cell.type.string-from-number`(F 대신 오류). BOOLEAN 이 `Y` 를 받음 → `cell.type.bool-from-string` |
| I27 | 입력 계약 `always` = 조건 열 변수(seq 순) + 식 변수 참조 + Expression 조건 셀 참조 + 열 조건 참조, 룰 결과 변수 제외 | 조건 열 순서를 이름순으로 → input-contract #1. 결과 변수 제외 제거 → #13 |
| I28 | 행은 seq 순서, DEFAULT 는 마지막, `cond` 는 §6.7 형식 | 행을 rowId 순으로 → #2. 구분자 `·` 를 `,` 로 → #2 |
| I29 | 필수·선택 판정 규칙(§6.7 표) | `==` 피연산자를 필수로 → #7. COALESCE 앞 인자를 필수로 → #5·#8. IF 가드 무시 → #9. `&&` 가드 무시 → #10. INSTR 를 늘 필수로 → #11. MIN 을 선택으로 → #12 |
| I30 | 값 공간은 `도메인 값 ∪ {NULL}`, NULL 을 덮는 셀은 NA·IS_NULL 뿐 | NOT_NULL 이 NULL 을 덮게 → analysis #11(겹침 생김)·#5 |
| I31 | 두 행은 모든 조건 열이 교차할 때만 겹친다. UNIQUE 는 ERROR, 나머지는 WARNING | 한 열만 교차해도 겹침 → #12. UNIQUE 를 WARNING 으로 → #8 |
| I32 | 접두 패턴 `A%` = `[A, succ(A))`, 그 밖의 패턴·CONTAINS·INSTR·CODE_IN·Expression 은 못 푸는 셀 | succ 대신 닫힌 구간 → #13 은 그대로일 수 있어 `EQ "SGC%"`·`EQ "SGD"` 짝이 잡는다. CONTAINS 를 점 집합으로 → #14 |
| I33 | 값 빈틈은 Number 열만, 소수 자리수 격자, 내부 빈틈만 | 격자 무시(연속) → #3(scale 1 에서 빈틈이 생김). 바깥 반직선 보고 → #4. 격자 끝점을 반올림으로 → #1(`"2.50"`) |
| I34 | NULL 빈틈은 열 단위: 어느 행도 NA·IS_NULL 을 두지 않은 변수 조건 열 | 행마다 보고 → #1·#20(개수가 달라짐). Expression 열 포함 → #15 |
| I35 | 전부 `-` 인 NORMAL 행은 ALL_NA_ROW ERROR, FIRST 에서만 UNREACHABLE | FIRST 제한 제거 → #19. 다중 행 합집합 무시 → #18 |
| I36 | 미리보기 적중 정책(FIRST 첫 행에서 멈춤, UNIQUE 2개 이상 오류, 나머지 전부) | FIRST 가 계속 평가 → preview #1(trace). UNIQUE 오류 제거 → #4 |
| I37 | 미리보기: 셀 판정 불가(폴백)는 뒤에 확정 거짓 셀이 있으면 행을 거짓으로, 아니면 행 판정 불가로 | 폴백 셀이 있으면 행 전체 폴백 → preview #11 |
| I38 | 1만 레코드 평가 중앙값 < 100 ms | 평가마다 `compile` 캐시를 비움 + 레코드마다 `new Decimal` 을 두 번씩 → `evalex-perf.test.ts`(변이 강도는 Build 가 20 µs 바쁜 대기를 넣어 확인) |
| I39 | 코퍼스는 엔진 test resources 한 벌이다 | m-mdm 에 사본 추가 → 메타 테스트 `m-mdm 안에 코퍼스 사본이 없고…`. Vitest 경로를 사본으로 → 같은 테스트 |
| I40 | 코퍼스 식 텍스트와 AST 는 같은 식이다 | 사례 하나의 `ast` 리터럴을 바꿈 → `식_사례의_AST_가…`(해당 id). 텍스트만 바꿈 → 같은 테스트 |
| I41 | 오라클 정규식 = 사례 `patternRegex`, 생성 함수 ⊆ `GENERATED`, 패턴 규칙 = 03-03 §6.11 | `likeToRegex` 에서 `.` 이스케이프 제거 → 오라클 #8(`A.B_`). `%` 앞 단순형 판정을 없애 모두 정규식으로 → 오라클 #7. 홀로 선 `\` 를 글자로 받음 → 오라클 #8(거부 단언). 오라클이 `STR_CONTAINS` 를 쓰게 → 오라클 #14. `patternRegex` 가 사례와 다름 → `서버_평가가…[cell.eq.pattern-regex]` |
| I42 | 하네스 설정은 계약 상수에서 온다 | 하네스 precision 34 → `하네스_설정값이…` + 코퍼스 `expr.divide.precision` |
| I43 | 공개 경로는 서브패스, 배럴은 타입 전용 유지 | `index.ts` 에 `export * from "./evalex"` → `evalex-entry` #1(루트 배럴에 `./evalex` 가 없어야 한다). exports 제거 → 같은 테스트. tsup entry 제거 → entry #2 |
| I44 | 엔진 main·스키마·보호 테스트 파일은 바이트 동일 | 자동 테스트 일부(`ContractOnlyPhaseTest` 가 main 추가를 잡는다) + Verify 가 `/usr/bin/git diff origin/dev -- src/backend/maru-mdm-engine/src/main src/backend/maru-mdm-engine/build.gradle src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract src/frontend/m-mdm/src/index.ts docs/mdm/engine-contract` 이 비어 있는지 본다(덮지 못하는 변이로 보고) |

---

## 6. 상세 설계

### 6.1 모듈 배치와 공개 경로 (D1·D7)

- 모듈 이름은 `evalex` 다. evalex-guide §8.6 의 `evalex-ast-interpreter` 는 샘플 파일 이름일 뿐 npm 패키지가 아니다(F3). 인터프리터 파일은 `src/evalex/interpreter.ts` 로 둔다.
- `M/src/evalex/index.ts` 가 공개 API 를 모은다. 소비 화면은 `import { evaluate, analyzeRule, … } from "@dk-oasis/m-mdm/evalex"` 로 쓴다.

```ts
export { D, NUMBER_TEXT } from "./decimal";
export type { EvalValue, EvalOutcome } from "./values";
export { fromTypedValue, toTypedValue, convertForType } from "./values";
export { EvalexError, FallbackSignal } from "./errors";
export { compile, evaluate, validate, prepare, isSupported, usedVariables, checkRecordKeys } from "./interpreter";
export type { EvaluateOptions, CodeSetIndex } from "./interpreter";
export { evaluateCell } from "./cell-compare";
export type { CellVariable, CellOutcome } from "./cell-compare";
export type { RuleDef, RuleVarDef, RuleRowDef, HitPolicy, DispType } from "./rule-model";
export { nullSafety } from "./null-safety";
export { computeInputContract } from "./input-contract";
export { analyzeRule } from "./rule-analysis";
export type { RuleIssue, RuleIssueCode } from "./rule-analysis";
export { previewRule } from "./rule-preview";
export type { RulePreview, RowPreview } from "./rule-preview";
```

- 계약 TS 타입(`AstNode`, `CellJson`, `TypedValue`, `ErrorCode`, `CorpusFile`, `InputContract`, `VarType`, `RowContract`, `DataType`, `CodeSets`, `EngineWarning`)은 `../contract/engine-contract.generated` 에서 `import type` 으로 가져온다. 새로 정의하지 않는다.
- `src/index.ts` 는 바꾸지 않는다(F11, D7). 루트 배럴은 타입 전용으로 남는다.

### 6.2 값 표현·Decimal 설정·계약 상수

**`decimal.ts`**

```ts
import Decimal from "decimal.js";
/** EvalEx MathContext(68, HALF_EVEN) — MdmExpressionConfig.MATH_CONTEXT. modulo 는 BigDecimal.remainder 와 같은 절삭. */
export const D = Decimal.clone({ precision: 68, rounding: Decimal.ROUND_HALF_EVEN, modulo: Decimal.ROUND_DOWN, toExpNeg: -9e15, toExpPos: 9e15 });
export type Dec = InstanceType<typeof D>;
/** 숫자 → 문자열 변환에 쓰는 원문(BigDecimal.toPlainString 과 같은 스케일). 리터럴·레코드 값·ROUND 결과만 싣는다. */
export const NUMBER_TEXT = new WeakMap<Dec, string>();
/** 평문 십진(부호 선택). 지수·16진·공백 없음. */
export const PLAIN_DECIMAL = /^[+-]?(\d+(\.\d*)?|\.\d+)$/;
export function decimalWithText(text: string): Dec;   // new D(text) + NUMBER_TEXT 등록(plainText 규칙)
```

- `plainText(raw)`: `BigDecimal(raw).toPlainString()` 과 같은 문자열을 만든다. 규칙은 이렇다. 앞의 `+` 를 떼고, `.5` 는 `0.5` 로, `5.` 는 `5` 로 바꾼다. 소수 끝 0 은 **남긴다**(`1.50` → `1.50`). 지수·16진 리터럴(`1e-3`, `0xFF`)은 원문을 등록하지 않는다(문자열 변환 시 폴백).
- `decimal.js` 는 인스턴스에 스케일이 없으므로, 문자열로 바꿀 때 원문 표에 없는 숫자(연산 결과)는 `FallbackSignal` 을 던진다(D4). 예외: 단항 `-`·`+` 는 원문을 이어 받고(`-` + 원문, 이중 부호 정리), `ROUND(v, n)` 결과는 `n ≥ 0` 이면 `toFixed(n)`, `n < 0` 이면 `toFixed(0)` 을 원문으로 등록한다(EvalEx `setScale` 결과와 같다). `INSTR`·`STR_LENGTH` 결과(정수)는 `String(n)` 을 등록한다.

**`contract-constants.ts`**(parity 테스트가 Java 소스와 대조한다)

```ts
export const BASE_FUNCTIONS = ["IF","SWITCH","COALESCE","NOT","ABS","CEILING","FLOOR","SQRT","ROUND","MIN","MAX","SUM","AVERAGE",
  "STR_LENGTH","STR_UPPER","STR_LOWER","STR_TRIM","STR_LEFT","STR_RIGHT","STR_SUBSTRING","STR_CONTAINS","STR_STARTS_WITH","STR_ENDS_WITH","STR_MATCHES"] as const;
export const MDM_ARITY = { INSTR: [2, 2], MASTER: [3, 4], MASTER_AT: [4, 5] } as const;
export const RESERVED_CONSTANTS = ["NULL","TRUE","FALSE","PI","E","DT_FORMAT_ISO_DATE_TIME","DT_FORMAT_LOCAL_DATE_TIME","DT_FORMAT_LOCAL_DATE"] as const;
export const EVAL_TS = "EVAL_TS";
export const RESERVED_PREFIX = "_";
export const EXPR_VAR_PREFIX = "_V";
/** EvalEx 3.7.0 표준 상수 값(실측, §0.2). */
export const PI_TEXT = "3.1415926535897932384626433832795028841971693993751058209749445923078164062862089986280348253421170679";
export const E_TEXT = "2.71828182845904523536028747135266249775724709369995957496696762772407663";
export const DT_FORMATS = { DT_FORMAT_ISO_DATE_TIME: "yyyy-MM-dd'T'HH:mm:ss[.SSS][XXX]['['VV']']",
  DT_FORMAT_LOCAL_DATE_TIME: "yyyy-MM-dd'T'HH:mm:ss[.SSS]", DT_FORMAT_LOCAL_DATE: "yyyy-MM-dd" } as const;
```

화면 지원 함수 = `BASE_FUNCTIONS ∪ {INSTR}` + 조건부 `MASTER`(§6.4). 계약(`FunctionSets.STANDARD`)에서 `MASTER_AT` 만 뺀 것이다(engine-contract §5 "1차는 폴백").

**`values.ts`**

```ts
export type EvalValue = Dec | string | boolean | null;
export type EvalOutcome =
  | { kind: "value"; value: EvalValue }
  | { kind: "error"; code: ErrorCode; message: string }
  | { kind: "fallback"; reason: string };
export function fromTypedValue(tv: TypedValue): EvalValue;          // NUMBER → decimalWithText(value), NULL → null, LIST → EvalexError
export function toTypedValue(v: EvalValue): TypedValue;             // Decimal → { type: "NUMBER", value: v.toFixed() }(평문, 값 비교용)
export function convertForType(v: EvalValue | number, dataType: DataType): EvalValue;  // §6.5 표, 실패 시 EvalexError("TYPE_CONVERSION")
```

`convertForType` 표(엔진 계약 2, 06:199. 셀 러너·미리보기·JUnit 하네스가 같은 규칙을 쓴다):

| 변수 타입 | 받는 값 | 결과 | 그 밖 |
|---|---|---|---|
| NUMBER | Decimal | 그대로 | boolean → TYPE_CONVERSION |
| NUMBER | string 이 `BIGDECIMAL_TEXT`(`^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$`, Java `new BigDecimal(s)` 가 받는 모양)에 맞음 | `PLAIN_DECIMAL` 이면 `decimalWithText(s)`, 지수형이면 `new D(s)`(원문 미등록) | 공백·빈 문자열·그 밖 → TYPE_CONVERSION |
| NUMBER | JS number(유한) | `decimalWithText(String(n))`(화면 그리드 입력 편의. 코퍼스에는 없다) | NaN·무한 → TYPE_CONVERSION |
| STRING·DATE | string | 그대로 | boolean → TYPE_CONVERSION |
| STRING·DATE | Decimal | `toPlainString` 과 같은 문자열: 원문 표가 있으면 그것, 없으면 `toFixed()`(값 변환은 폴백하지 않는다. 레코드 값은 원문이 늘 있다) | |
| BOOLEAN | boolean | 그대로 | Decimal → TYPE_CONVERSION |
| BOOLEAN | string | `toUpperCase()` 가 `TRUE`/`FALSE` 면 불린 | 그 밖 → TYPE_CONVERSION |
| 모든 타입 | null | null | |

이 표는 03-03 `ValueConverter.toDeclared`(F23)와 같다. 처음 설계(STRING ← 숫자 거부, BOOLEAN ← 문자열 거부)에서 03-03 에 맞춰 바꿨다(D9).

### 6.3 인터프리터 의미표 (`interpreter.ts`·`functions.ts`)

원천 샘플의 구조(AST → 클로저 컴파일, 같은 AST 객체 WeakMap 캐시, 지연 함수 thunk, 컴파일 시 정규식 1회 생성, `prepare` 로 변수 사전 정규화)는 유지한다. 의미는 아래 표로 바꾼다. 기호: `err` = `EvalexError("EVALUATION_ERROR")`, `fb` = `FallbackSignal`.

**보조 변환**

| 이름 | 규칙 |
|---|---|
| `toBool(v)`(EvalEx `getBooleanValue`) | boolean → 그대로, Decimal → `!isZero()`, string → `toLowerCase() === "true"`, null → null(부르는 쪽이 정한다) |
| `str(v)`(문자열 변환) | null → `"null"`, boolean → `"true"`/`"false"`, string → 그대로, Decimal → `NUMBER_TEXT.get(v)` 이 있으면 그것, 없으면 `fb` |
| `num(v)`(산술 피연산자) | Decimal 이면 그대로, 그 밖(null 포함)은 `err` |

**노드**

| 노드 | 규칙 |
|---|---|
| `NUMBER_LITERAL` | 평문 십진이면 `decimalWithText(value)`, `0x…` 는 `new D(BigInt(value).toString())`(원문 미등록), 지수는 `new D(value)`(원문 미등록). 컴파일 시 1회 |
| `STRING_LITERAL` | 값 그대로 |
| `VARIABLE_OR_CONSTANT` | 대문자로 바꿔 상수(`TRUE`, `FALSE`, `NULL`, `PI`=`decimalWithText(PI_TEXT)`, `E`, `DT_FORMAT_*` 문자열)면 상수, 아니면 scope 조회. scope 에 키가 없으면 `EvalexError("MISSING_KEY")`(evaluate 가 미리 거르므로 보통은 닿지 않는다) |
| `PREFIX -` / `+` | `num` 뒤 `neg()` / 그대로. 원문이 있으면 이어 받는다 |
| `PREFIX !` | `toBool` 이 null 이면 `err`, 아니면 부정 |
| `INFIX &&` | 왼쪽 `toBool`. null 이면 `err`. false 면 오른쪽을 평가하지 않고 false. 오른쪽도 같은 규칙 |
| `INFIX \|\|` | 왼쪽 true 면 true(오른쪽 평가 안 함). 평가한 쪽이 null 이면 `err` |
| `INFIX +` | 둘 다 Decimal 이면 `plus`, 아니면 `str(a) + str(b)` |
| `INFIX - * /` | `num` 둘, `/` 는 제수가 0 이면 `err` |
| `INFIX %` | `num` 둘, 제수 0 이면 `err`, `mod`(절삭) |
| `INFIX ^` | §0.2 알고리즘. `n = |y| 의 정수부`, `f = |y| - n`. `ip = x.pow(n)`(precision 68), `dp = Math.pow(x.toNumber(), f.toNumber())`, `dp` 가 유한하지 않으면 `err`. `r = ip.times(new D(String(dp)))`. `y < 0` 이면 `r = new DHigh(1).div(r).toDecimalPlaces(68, ROUND_HALF_UP)`(`DHigh` = precision 1000 복제). `r` 이 0 이고 `y < 0` 이면 `err`. `n` 이 안전 정수를 넘으면 `err` |
| `INFIX == =` | `eq(a, b)`: 둘 다 null → true, 한쪽 null → false, 둘 다 Decimal → `a.eq(b)`, 둘 다 string → `===`, 둘 다 boolean → `===`, 타입이 다르면 false |
| `INFIX != <>` | `!eq(a, b)` |
| `INFIX < <= > >=` | 어느 쪽이든 null 이면 `err`. 둘 다 Decimal → `cmp`, 둘 다 string → JS 문자열 비교(UTF-16), 둘 다 boolean → false < true. 타입이 다르면 `fb`(D4) |

**함수**(`functions.ts` 의 표 한 줄 = `{ name, set: "BASE"|"MDM", lazy, arity?: [min, max], nullPolicy, impl }`. `nullPolicy` 는 §6.7 이 쓴다)

| 함수 | 구현 | nullPolicy |
|---|---|---|
| `IF(c, a, b)` 지연 | `toBool(c)` 가 true 면 a, 아니면(false·null) b | `{ args: ["safe", "inherit", "inherit"], guardIf: true }` |
| `SWITCH(v, …)` 지연 | v 를 평가하고 짝마다 `switchEq(v, ki)`(둘 다 null 이거나 같은 타입이고 값이 같음)면 그 결과. 인자 수가 짝수면 마지막이 기본값, 아니면 NULL | `{ first: "safe", matchValues: "safe", results: "inherit" }` |
| `COALESCE(…)` | 처음 null 이 아닌 값, 없으면 null | `{ notLast: "safe", last: "inherit" }` |
| `NOT(v)` | `toBool` null 이면 `err` | `fail` |
| `ABS`·`CEILING`·`FLOOR` | `num` 뒤 `abs`·`ceil`·`floor` | `fail` |
| `SQRT(v)` | §0.2 BigInt Newton. `n = BigInt(v.times(new DHigh("1e136")).trunc().toFixed())`, `bits = (n.toString(2).length + 1) >> 1`, `ix = n >> BigInt(bits)` 부터 반복, 결과 `new D(ix.toString()).div("1e68")`(precision 충분한 `DHigh` 로 나눈다). 0 → 0, 음수 → `err` | `fail` |
| `ROUND(v, n)` | `num` 둘, `k = trunc(n)`. `k ≥ 0` → `toDecimalPlaces(k, ROUND_HALF_EVEN)`, `k < 0` → `div(10^-k).toDecimalPlaces(0, HALF_EVEN).times(10^-k)`. 원문 등록(§6.2) | `fail` |
| `MIN`·`MAX` | 누산기 규칙(§0.2): 누산기가 null 이면 인자 값(Decimal 또는 null)을 넣는다. 찼으면 인자 null 은 `err`, 문자열·불린은 `fb`, Decimal 은 비교 | `fail`(애매하면 필수, 06:208) |
| `SUM`·`AVERAGE` | 모든 인자 `num`(null 은 `err`), 합은 precision 68, 평균은 `sum.div(개수)` | `fail` |
| `STR_LENGTH(s)` | s 가 null 이면 `err`, 아니면 `str(s).length`(Decimal 결과, 원문 등록) | `fail` |
| `STR_UPPER`·`STR_LOWER` | null `err`, `toUpperCase()`·`toLowerCase()` | `fail` |
| `STR_TRIM` | null `err`, 앞뒤에서 코드유닛 ≤ 0x20 인 글자만 뗀다(Java `trim`) | `fail` |
| `STR_LEFT(s, n)`·`STR_RIGHT(s, n)` | null `err`, `k = trunc(num(n))`, §0.2 공식 | `fail` |
| `STR_SUBSTRING(s, a[, b])` | null `err`. `a < 0` → `err`, `a > len` → `err`. `b` 가 있으면 `b < a` → `err`, `s.substring(a, min(b, len))`. 없으면 `s.substring(a)` | `fail` |
| `STR_CONTAINS(s, t)` | 어느 쪽이든 null 이면 false, 아니면 `str(s).toUpperCase().includes(str(t).toUpperCase())` | `safe` |
| `STR_STARTS_WITH`·`STR_ENDS_WITH` | null `err`, 대소문자 구분 | `fail` |
| `STR_MATCHES(s, re)` | null `err`. `new RegExp("^(?:" + re + ")$")`(플래그 없음, UTF-16). 리터럴 패턴이면 컴파일 시 1회. `SyntaxError` 면 `fb` | `fail` |
| `INSTR(s, t)`(MDM, arity 2) | 어느 쪽이든 null 이면 null, 아니면 `s.indexOf(t) + 1`(Decimal, 원문 등록) | `inherit` |
| `MASTER(id, cate, key)`(MDM) | `isSupported` 가 참일 때만 온다. key null → false, 집합 `codeSets[id + "|" + cate]` 에 `str(key)` 가 있으면 true, 없으면 false. key 가 Decimal 이면 `fb` | `{ args: ["safe", "safe", "safe", "safe"] }` |
| `MASTER_AT`(MDM) | 늘 `fb` | `{ args: 모두 "safe" }`(engine-contract §5 "key·base_dt 는 선택") |

**`evaluate(ast, vars, opts)` 순서**(`EvaluateOptions = { codeSets?: CodeSets }`)

1. `checkRecordKeys(Object.keys(vars))`: 키마다(순서대로) 대문자가 `RESERVED_CONSTANTS` 에 있으면 `CONSTANT_KEY`, 대문자가 `EVAL_TS` 면 `EVAL_TS_KEY`, `_` 로 시작하면 `RESERVED_KEY`. 이어서 대문자로 바꾸면 같아지는 키가 둘 이상이면 `RESERVED_KEY`(F23, 03-03 D13). 처음 어긋난 키의 코드로 `{kind: "error"}` 를 돌려준다. 3단계 키 누락 검사는 EvalEx 변수 조회 의미(대소문자 무시)를 따르고, 미리보기의 입력 계약 키 검사만 정확 일치다.
2. `isSupported(ast, opts)` 가 거짓이면 `{kind: "fallback", reason}`.
3. `usedVariables(ast)` 가운데 vars 에 대문자 기준으로 없는 이름이 있으면 `MISSING_KEY`.
4. `compile(ast, opts)(prepare(vars))`. `prepare` 는 키를 대문자로 바꾸고 값을 `EvalValue` 로 둔다(Decimal·string·boolean·null 만 받고, JS number 는 `decimalWithText(String(n))`).
5. 던져진 것 매핑: `EvalexError` → `{kind: "error", code}`, `FallbackSignal` → `{kind: "fallback"}`, 그 밖의 모든 예외(decimal.js 오류 포함) → `EVALUATION_ERROR`.

- `prepare(vars)`: 1단계 예약 키 검사를 하고(어긋나면 `EvalexError` 를 던진다) 4단계 정규화를 한 scope 를 돌려준다. scope 에는 `PREPARED` 심벌을 붙이고, `evaluate` 가 이 표지를 보면 1·4단계를 건너뛴다(EG 8.7 "prepare 재사용"). 그리드에서 행마다 한 번 `prepare` 하고 여러 식에 넘긴다.
- `validate(ast, vars, opts)`: `evaluate` 결과가 `value` 인데 boolean 이 아니면 `{kind: "error", code: "EVALUATION_ERROR"}` 로 바꾼다(도메인 표준식·룰 조건 셀용, EG 8.6 API 목록).
- `isSupported`(codeSets 없을 때)와 `usedVariables` 결과는 AST 객체 기준 `WeakMap` 으로 캐시한다. `evaluate` 가 호출마다 AST 를 다시 훑지 않게 하려는 것이다(§6.13 성능).

`compile` 캐시는 `opts.codeSets` 가 없을 때만 AST 객체 기준 WeakMap 으로 쓴다(원천 샘플과 같다). `codeSets` 가 있으면 `WeakMap<AstNode, WeakMap<CodeSets, Compiled>>` 로 두 단계 캐시한다.

### 6.4 `isSupported`·`usedVariables`

- `isSupported(ast, { codeSets })`: 노드마다 본다. `type` 이 6종 밖이면 거짓. PREFIX 는 `- + !`, INFIX 는 스키마 `InfixOperator` 16종만. FUNCTION 은 이름을 대문자로 바꿔 `BASE_FUNCTIONS` 면 참, `INSTR` 는 인자 2개일 때만 참, `MASTER` 는 인자 3개이고 앞 두 인자가 `STRING_LITERAL` 이며 `codeSets` 에 `id|cate` 키가 있을 때만 참, `MASTER_AT` 과 그 밖은 거짓. 자식까지 재귀한다.
- `usedVariables(ast)`: 전위 순회로 `VARIABLE_OR_CONSTANT` 를 모은다. 대문자로 바꾸고, 상수 8종을 빼고, 첫 등장 순서로 중복을 지운다.

### 6.5 op-code 셀 직접 비교 (`cell-compare.ts`·`pattern.ts`)

```ts
export interface CellVariable { name: string; dataType: "NUMBER" | "STRING" | "BOOLEAN"; dateString?: boolean; maruCodeId?: string }
export type CellOutcome = { kind: "value"; value: boolean } | { kind: "error"; code: ErrorCode; message: string } | { kind: "fallback"; reason: string };
export function evaluateCell(variable: CellVariable, cell: CellJson, value: EvalValue | number,
                             opts?: { patternRegex?: string; codeSets?: CodeSets; skipKeyCheck?: boolean }): CellOutcome;
```

순서: (1) `skipKeyCheck` 가 아니면 `checkRecordKeys([variable.name])` (2) `convertForType(value, variable.dataType)` (3) 아래 표. 코퍼스 cell 사례는 이 함수를 그대로 부른다(`variable`, `cell`, `fromTypedValue(value)`, `patternRegex`, `codeSets`).

| op | 규칙(v = 변환한 값, L·R = 셀 리터럴을 변수 타입으로 바꾼 값) |
|---|---|
| NA | true(값을 보지 않는다) |
| IS_NULL / NOT_NULL | `v === null` / `v !== null` |
| 그 밖 | v 가 null 이면 false(가드) |
| EQ | NUMBER: `v.eq(L)`. BOOLEAN: `v === L`(`"TRUE"`/`"FALSE"`). STRING: 일자면 `===`. 일자가 아니면 `pattern.ts` 로 토큰화해 와일드카드가 없으면 원문 복원값과 `===`, 접두형이면 `startsWith`, 접미형 `endsWith`, 앞뒤형 `indexOf ≥ 0`, 그 밖은 `patternRegex` 가 있으면 `new RegExp("^(?:" + patternRegex + ")$").test(v)`, 없으면 `fallback` |
| NE | `!(v 와 L 의 EQ 값 비교)`(패턴 해석 없음, 글자 그대로) |
| LT·LE·GT·GE | NUMBER: `cmp`. 일자 STRING: JS 문자열 비교 |
| IN / NOT_IN | 원소마다 EQ 값 비교(패턴 해석 없음). 하나라도 같으면 참 / 모두 다르면 참 |
| CONTAINS | `v.indexOf(L) >= 0` |
| INSTR | `L.indexOf(v) >= 0` |
| CODE_IN | `codeSets?.[maruCodeId + "|" + L]` 이 있으면 `includes(v)`, 없으면 `fallback`(evalex-guide 8.5) |
| 구간 4종 | 왼쪽 부등호를 뒤집어 `v >= L`(또는 `>`), 오른쪽은 `v <= R`(또는 `<`) |

- 셀 리터럴 변환: NUMBER 는 `PLAIN_DECIMAL` 이 아니면 `err`(evaluateCell 은 `{kind: "error", code: "EVALUATION_ERROR"}`). BOOLEAN 은 `"TRUE"`·`"FALSE"` 만. 셀별 변환 결과는 `WeakMap<CellJson, …>` 로 캐시한다(성능).
- **`pattern.ts`**: `tokenize(p)` → 토큰 `{lit: string}`·`ANY_SEQ`(`%`)·`ANY_ONE`(`_`). `\%`·`\_`·`\\` 는 글자, 그 밖의 `\x` 와 끝의 홀로 선 `\` 는 **거부**(F22 ①). 연속한 `ANY_SEQ` 는 하나로 접는다. 접은 뒤 `ANY_SEQ` 하나뿐이거나 3 개를 넘으면 **거부**(F22 ③). 거부된 패턴 셀은 `evaluateCell` 이 `{kind: "error", code: "EVALUATION_ERROR"}` 를 돌려주고(저장 시 검사가 막는 입력이다), 분석은 `unknown` 으로 본다. STRING 변수의 EQ 값은 일자 여부와 무관하게 늘 토큰화한다(F22 ⑤). 인접 글자 토큰은 하나로 합친다. `classify(tokens)` → `exact(lit)` | `prefix(lit)` | `suffix(lit)` | `infix(lit)` | `regex`. 글자 부분에 이스케이프한 `%`·`_` 가 있어도 단순형으로 본다(진릿값이 같다. F14 와 같은 취지). `succ(a)`: 마지막 코드유닛 `u` 가 대리쌍 범위(0xD800–0xDFFF)이거나 `0xD7FF`·`0xFFFF` 이면 `undefined`(못 푼다), 아니면 `a.slice(0, -1) + String.fromCharCode(u + 1)`. 빈 문자열이면 `undefined`.

### 6.6 룰 정의 TS 타입 (`rule-model.ts`)

Java `spi.DefinitionLookup.RuleDefinition` 과 같은 이름(camelCase)을 쓰고, 화면에 필요한 칸만 둔다. 생성 텍스트(`text`)는 없다.

```ts
export type HitPolicy = "FIRST" | "UNIQUE" | "PRIORITY" | "COLLECT" | "ANY";
export type DispType = "EQUAL" | "ONE" | "TWO" | "EXPRESSION" | "VALUE";
export interface RuleVarDef {
  varId: number; varKind: "COND" | "RESULT"; dispType: DispType; seq: number;
  varName: string | null;          // 식 변수·Expression 조건 열이면 null
  label?: string | null;           // 식 변수의 표시명
  exprAst?: AstNode | null;        // 식 변수 AST
  refVars?: string[] | null;       // 식 변수 참조 변수(없으면 usedVariables(exprAst))
  dataType: DataType; scale?: number | null; domainId?: string | null;
  dateString?: boolean;            // 화면 전용: 일자 String 도메인
  maruCodeId?: string | null;      // 화면 전용: 코드 도메인의 마루 코드(CODE_IN)
  resGrp?: string | null; grpCondAst?: AstNode | null;
}
export interface RuleRowDef { rowId: number; seq: number; rowKind: "NORMAL" | "DEFAULT"; cells: Record<number, CellJson> }
export interface RuleDef { ruleId: string; ruleKind: "DECISION" | "DERIVE"; hitPolicy: HitPolicy | null; vars: RuleVarDef[]; rows: RuleRowDef[] }
```

- 조건 열 = `varKind === "COND"` 을 `seq` 순으로. 결과 열 = `"RESULT"`.
- 열의 변수 이름 `varKey(var)` = `varName` 이 있으면 그것, 식 변수(`exprAst` 있음)면 `"_V" + varId`.
- 셀: 조건 열 Equal·1·2 는 op 셀, Expression 조건 열은 `{expr, ast}` 또는 `{op: "NA"}`, 결과 열은 `{val}` 또는 `{expr, ast}`.

### 6.7 입력 계약 (`null-safety.ts`·`input-contract.ts`)

```ts
export function nullSafety(ast: AstNode): { required: string[]; optional: string[] };   // 첫 등장 순, 대문자, 상수 제외, required ∩ optional = ∅
export function computeInputContract(rule: RuleDef, resolveType: (name: string) => VarType): InputContract;
```

**`nullSafety` 알고리즘**. 문맥 `ctx ∈ {FAIL, SAFE}` 와 가드 집합 `G`(NULL 이 아님이 보장된 변수)를 내려보낸다. 뿌리는 `(FAIL, ∅)` 이다(애매하면 필수, 06:208). 변수 노드에서 `ctx === FAIL` 이고 이름 ∉ G 면 required 에 넣고, 아니면 "본 변수"에 넣는다. 끝에 optional = 본 변수 − required.

| 노드 | 자식에게 주는 문맥 |
|---|---|
| INFIX `+ - * / % ^ < <= > >=`, PREFIX `- + !` | 모두 FAIL |
| INFIX `== = != <>` | 모두 SAFE(실측: NULL 이 와도 실패하지 않는다) |
| INFIX `&&` | 왼쪽 `(FAIL, G)`, 오른쪽 `(FAIL, G ∪ nonNullIfTrue(왼쪽))` |
| INFIX `\|\|` | 왼쪽 `(FAIL, G)`, 오른쪽 `(FAIL, G ∪ nonNullIfFalse(왼쪽))` |
| FUNCTION | 함수 표 `nullPolicy`: `fail` → 모두 FAIL, `safe` → 모두 SAFE, `inherit` → 모두 부모 ctx. `COALESCE` → 마지막이 아닌 인자 SAFE, 마지막은 부모 ctx. `IF(c, a, b)` → c 는 `(SAFE, G)`, a 는 `(부모, G ∪ nonNullIfTrue(c))`, b 는 `(부모, G ∪ nonNullIfFalse(c))`. `SWITCH` → 첫 인자와 비교 값 SAFE, 결과·기본값은 부모 ctx. `MASTER`·`MASTER_AT` → 모두 SAFE |
| 리터럴 | 없음 |

- `nonNullIfTrue(c)`: `X != NULL`·`NULL != X`·`X <> NULL` → {X}. `a && b` → 둘의 합집합. 그 밖 → ∅.
- `nonNullIfFalse(c)`: `X == NULL`·`NULL == X`·`X = NULL` → {X}. `a || b` → 둘의 합집합. 그 밖 → ∅.
- 이름 비교는 대문자로 한다.

**`computeInputContract`**

1. **always**: 조건 열을 `seq` 순으로 돌며 (a) 이름 열이면 `varName`, 식 변수면 `refVars ?? usedVariables(exprAst)` (b) Expression 조건 열이면 그 열의 모든 행 셀 `ast` 의 `usedVariables` 를 행 `seq` 순으로 모은다. 이어서 결과 열을 `seq` 순으로 돌며 `grpCondAst` 의 `usedVariables` 를 모은다. 룰 결과 변수 이름(결과 열 `varName` ∪ `resGrp`)은 뺀다. 첫 등장 순으로 중복을 지운다. 각 이름을 `resolveType` 으로 `VarType` 으로 바꾼다(`resolveType` 이 `undefined` 를 돌려주면 `Error` 를 던진다. 저장 시 검사가 막는 자리다).
2. **rows**: NORMAL 행을 `seq` 순으로, 그 뒤 DEFAULT 행을 싣는다. 행마다 결과 셀(`expr`·`ast` 가 있는 셀)의 `nullSafety` 를 결과 열 `seq` 순으로 합친다. 한 셀에서라도 required 면 required, 아니면 optional 이다. 룰 결과 변수 이름은 뺀다. 결과 열 그룹의 열들도 모두 합친다(어느 열을 고를지는 실행 때 정해지므로 합집합, 한 열에서라도 필수면 필수. 애매하면 필수 원칙). `{val}` 셀은 변수가 없다. 조건 변수가 결과 식에도 쓰이면 행 목록에도 남긴다(키는 늘 있지만 NULL 이면 안 되는지를 알려야 한다).
3. **cond**: NORMAL 행은 조건 열 `seq` 순으로 셀 요약을 ` · `(가운뎃점 앞뒤 공백)으로 잇는다. NA 셀과 빈 셀은 건너뛴다. 모두 건너뛰면 `"-"`. DEFAULT 행은 `"기본 행"`. 셀 요약 자체는 03-03 `CellSummary.of`(F24)를 TS 로 옮긴 `cellSummary(var, cell)`(`input-contract.ts` 안, export)로 만들고, 06:226-229 의 모양(`PROD_TYPE = COIL`)이 되도록 열 이름을 앞에 붙인다. 규칙: 구간 op 는 요약의 `변수` 를 N 으로 바꾼다, Equal 열의 EQ 는 `N = ` + 요약, Expression 셀은 요약(expr) 그대로, 그 밖은 `N ` + 요약. 결과는 아래 표와 같다(N = 열 표시 이름 = `varName ?? label ?? "_V" + varId`). D1 이 반려돼 Java 로 이식할 때는 `CellSummary.of` 를 그대로 재사용한다:

| op | 요약 |
|---|---|
| EQ·NE·LT·LE·GT·GE | `N = L`, `N <> L`, `N < L`, `N <= L`, `N > L`, `N >= L` |
| IN·NOT_IN | `N IN (a, b)`, `N NOT IN (a, b)` |
| CODE_IN·CONTAINS·INSTR | `N IN 카테고리 L`, `N CONTAINS L`, `N INSTR L` |
| IS_NULL·NOT_NULL | `N IS NULL`, `N IS NOT NULL` |
| 구간 4종 | `L ` + op 의 `변수` 를 N 으로 바꾼 것 + ` R`. 예: `1.6 <= COIL_THK < 2.5` |
| Expression 셀 | `expr` 텍스트 그대로 |

### 6.8 값 집합·겹침·빈틈·도달 불가 (`value-set.ts`·`rule-analysis.ts`)

**값 영역(열마다 하나)**

| 조건 열 | 영역 | 리터럴 → 좌표 |
|---|---|---|
| NUMBER(Equal·1·2) | `decimal`(연속) | `new D(L)` |
| STRING 일자(`dateString`) | `integer`(1 단위 이산) | 숫자열을 정수 Decimal 로. 길이가 같아 숫자 순서 = 사전순 |
| BOOLEAN | `integer`, 최소 0 최대 1 | FALSE = 0, TRUE = 1 |
| 그 밖의 STRING | `string`(UTF-16 코드유닛 순서, JS 비교) | 문자열 그대로 |
| Expression 조건 열 | 없음(셀마다 `unknown`) | |

**값 집합**

```ts
type Bound = { v: Dec | string; open: boolean } | null;          // null = 무한
interface Interval { lo: Bound; hi: Bound }
type ValueSet = { kind: "exact"; intervals: Interval[]; hasNull: boolean }   // intervals 는 정렬·서로소·비어 있지 않음
              | { kind: "unknown"; hasNull: boolean };                       // 못 푸는 셀
```
연산: `intersect(a, b)`, `union(list)`, `subtract(a, b)`, `isEmpty(a)`, `complementNonNull(a)`. `integer` 영역은 만들 때 열린 끝을 닫힌 정수 끝으로 바꾸고(`(a, …` → `[floor(a)+1, …`, `…, b)` → `…, ceil(b)-1]`), 최소·최대가 있으면 자른다. 그러면 비어 있는지 판정이 `lo ≤ hi` 한 줄이 된다. `decimal`·`string` 은 `lo < hi` 이거나 `lo == hi` 이고 두 끝이 닫혔을 때만 비어 있지 않다.

**셀 → 값 집합**(가드된 셀은 `hasNull: false`)

| 셀 | 집합 |
|---|---|
| NA | 전체 + NULL |
| 빈 셀(키 없음) | `unknown`, `hasNull: true`. UNRESOLVED_CELL 은 내지 않는다(미완성 검사는 TSK-08-04 몫) |
| IS_NULL / NOT_NULL | `{NULL}` / 전체(NULL 제외) |
| EQ | 점 `[L, L]`. STRING 비일자 패턴: `exact` → 점, `prefix(A)` → `[A, succ(A))`(succ 가 없으면 `unknown`), 그 밖 → `unknown` |
| NE | 전체 − 점(글자 그대로) |
| LT·LE·GT·GE | 반직선 |
| IN / NOT_IN | 점들의 합 / 전체 − 점들 |
| 구간 4종 | 끝 열림은 op 대로 |
| CONTAINS·INSTR·CODE_IN | `unknown`, `hasNull: false` |
| Expression 셀 | `unknown`, `hasNull: true` |

**검사**(대상 = NORMAL 행, `analyzeRule(rule)` 이 이슈를 아래 순서로 돌려준다)

```ts
export type RuleIssueCode = "ALL_NA_ROW" | "UNRESOLVED_CELL" | "OVERLAP" | "OVERLAP_UNRESOLVED" | "UNREACHABLE" | "VALUE_GAP" | "NULL_GAP";
export interface RuleIssue { code: RuleIssueCode; severity: "ERROR" | "WARNING"; rowIds: number[]; varId?: number; lower?: string; upper?: string; message: string }
```

1. **ALL_NA_ROW**(ERROR): 조건 셀이 모두 NA 인 NORMAL 행. rowIds `[행]`. 이 행은 뒤 검사에서 뺀다(06:342).
2. **UNRESOLVED_CELL**(WARNING): `unknown` 인 셀(빈 셀 제외). rowIds `[행]`, varId. 행 `seq`, 열 `seq` 순.
3. **겹침**: 행 짝 (i, j)(`seq` 순, i < j)마다 모든 조건 열에서 두 셀 집합이 교차하는지 본다. `exact` 끼리는 `intersect` 가 비어 있지 않거나 둘 다 `hasNull`. `unknown` 이 끼면 상대의 비NULL 부분이 비어 있지 않거나 둘 다 `hasNull` 이면 "교차 가능". 한 열이라도 교차하지 않으면 겹치지 않는다. 모든 열이 확실히 교차하면 **OVERLAP**(UNIQUE 면 ERROR, 그 밖 WARNING), `unknown` 때문에 가능하기만 하면 **OVERLAP_UNRESOLVED**(WARNING). rowIds `[i, j]`.
4. **UNREACHABLE**(WARNING, FIRST 만): 셀이 모두 `exact` 인 행 R 마다, 앞 행(`seq` 가 작고 셀이 모두 `exact`) 가운데 R 과 겹치는 행들을 P 로 두고 `covered(R, P, 0)` 이 참이면 낸다. rowIds `[R, …P 에서 실제로 쓰인 행(seq 순)]`. `covered(R, P, k)`: 열 k 가 끝이면 `P.length > 0`. 아니면 `R[k]` 를 P 의 `k` 열 집합들로 조각낸다(`pieces = [R[k]]`, P 마다 `pieces = pieces.flatMap(x => [intersect(x, p), subtract(x, p)]).filter(비어 있지 않음)`, NULL 은 따로 한 조각). 조각마다 그 조각을 품는 P 만 남겨 `covered(R, 그 P, k+1)` 이 참이어야 한다. 하나라도 거짓이면 거짓. "실제로 쓰인 행"은 참을 만든 마지막 단계에 남은 P 의 합집합이다.
5. **VALUE_GAP**(WARNING): NUMBER 조건 열마다, 나머지 조건 열 셀의 정규 키(아래)가 같은 행끼리 묶는다(첫 행 `seq` 순). 묶음마다 그 열 집합의 합집합을 구하고, 비NULL 여집합의 **유계** 구간(양 끝이 모두 유한)만 본다. 격자 `step = 10^-s`(`s` = 열 `scale`, 없으면 그 열 모든 리터럴의 최대 소수 자리수)에서 구간 안의 첫 격자점 `g1` 과 마지막 격자점 `g2` 를 구해 `g1 ≤ g2` 이면 낸다. `lower = g1.toFixed(s)`, `upper = g2.toFixed(s)`, rowIds = 묶음의 행(seq 순), varId. 바깥 반직선은 보고하지 않는다(D5).
6. **NULL_GAP**(WARNING): 변수가 있는 조건 열(Equal·1·2)마다, 대상 행 가운데 그 열 셀이 NA 나 IS_NULL 인 행이 하나도 없으면 낸다. rowIds `[]`, varId. Expression 열은 보지 않는다.

- 정규 키: op 셀은 `EQ L` 을 `IN [L]` 로 바꾸고, 목록은 좌표로 바꿔 중복을 지우고 정렬하고, NUMBER 리터럴은 `new D(L).toString()`(끝 0 제거)으로 쓴 JSON 문자열이다. Expression 셀은 `expr` 텍스트다.
- 셀 요약 메시지는 `message` 에만 싣는다(테스트 대상 아님). 예: `"1행·2행이 겹친다(COIL_THK: 1.6 <= 변수 < 2.5 / >= 2.5)"`.

### 6.9 적중 정책 미리보기 (`rule-preview.ts`)

```ts
export interface RowPreview { rowId: number; seq: number; evaluated: boolean; hit: boolean | null; firstFalseVarId: number | null; fallbackVarIds: number[] }
export type RulePreview =
  | { kind: "ok"; hits: { rowId: number; seq: number }[]; defaultApplied: boolean; trace: RowPreview[]; warnings: EngineWarning[] }
  | { kind: "error"; code: ErrorCode; rowIds: number[]; message: string }
  | { kind: "fallback"; trace: RowPreview[]; warnings: EngineWarning[]; reason: string };
export function previewRule(rule: RuleDef, record: Record<string, EvalValue | number>,
                            opts?: { codeSets?: CodeSets; patternRegex?: Record<string, string> /* 키 `${rowId}:${varId}` */ }): RulePreview;
```

1. **조건 검사**: `checkRecordKeys(레코드 키)` → 오류면 그대로. `computeInputContract` 의 always 이름 가운데 레코드에 **정확히 같은 키**(대소문자 구분, F23)가 없으면 `MISSING_KEY`(이름 전부를 `message` 에). 조건 열 변수를 `convertForType` 으로 바꾼다(실패 시 `TYPE_CONVERSION`). 식 변수 열은 참조 변수 가운데 하나라도 null 이면 null, 아니면 `evaluate(exprAst)` 결과를 선언 타입으로 바꿔 scope 의 `_V<varId>` 에 넣는다(평가 오류 → `EVALUATION_ERROR`, 타입 실패 → `TYPE_CONVERSION`, 폴백 → 그 열 셀은 모두 판정 불가).
2. **행 고르기**: NORMAL 행을 `seq` 순으로(같으면 rowId 순). 셀이 없거나 NA 면 건너뛴다(F23). 조건 셀을 조건 열 `seq` 순으로 평가한다. op 셀은 `evaluateCell(…, { skipKeyCheck: true })`, Expression 셀은 `evaluate(ast)`: 결과 null → 그 셀 false + 경고 `{code: "EXPR_CELL_NULL", ruleId, rowId, varId, message}`, 불린이 아니면 `EVALUATION_ERROR`(F23, 03-03 §6.2 와 같다), 폴백 → 판정 불가, 오류 → 미리보기 전체가 `{kind: "error"}`. 행 판정: 처음 false 셀에서 멈추고 `hit = false`, `firstFalseVarId` 기록. false 없이 판정 불가 셀이 있으면 `hit = null`, 모두 참이면 `hit = true`.
3. **정책**: FIRST — 행을 차례로 보다가 `hit === true` 면 멈춘다(뒤 행 `evaluated = false`). 그 전에 `hit === null` 인 행을 만나면 `{kind: "fallback"}`. UNIQUE — 모두 평가한다. 확정 적중이 2개 이상이면 `UNIQUE_MULTIPLE_HITS`(rowIds). 아니면 `null` 이 하나라도 있으면 fallback. PRIORITY·COLLECT·ANY — 모두 평가해 확정 적중 전부(결과 값에 따른 선택·집계는 서버 값 테스트 몫). `null` 이 있으면 fallback. DERIVE — 첫 NORMAL 행 하나가 늘 적중. `hitPolicy` 가 null 인 DECISION 은 FIRST 로 본다(F23).
4. 적중이 없으면 DEFAULT 행이 있을 때 `defaultApplied: true`.

### 6.10 코퍼스 파일과 사례 목록

- 위치: `R/corpus/engine-corpus.json`(엔진 test resources 한 벌, D1·팀장 제약 4). 루트 `{ "version": 1, "cases": [...] }`.
- 사례 순서는 아래 표 순서(cell 먼저, 그다음 expr)다. `ast` 는 **손으로 쓰지 않는다**(§6.14 4단계).
- 셀 변수 약어: `THK` = `{name: "COIL_THK", dataType: "NUMBER"}`, `SURF` = `{name: "SURF_GRD", dataType: "STRING"}`, `DT` = `{name: "ORD_DT", dataType: "STRING", dateString: true}`, `SPEC` = `{name: "SPEC_NM", dataType: "STRING"}`, `STL` = `{name: "STL_GRD", dataType: "STRING"}`, `PROC` = `{name: "PROC_CD", dataType: "STRING", maruCodeId: "PROC_CD"}`, `OK` = `{name: "QC_PASS", dataType: "BOOLEAN"}`. 값 약어: `N x` = `{type: NUMBER, value: "x"}`, `S x` = STRING, `B x` = BOOLEAN, `NULL` = `{type: NULL}`. 기대 `T`/`F` = BOOLEAN true/false. `CS` = `codeSets: {"PROC_CD|PLATING": ["82", "84"]}`.
- JSON 안의 백슬래시는 JSON 이스케이프로 두 번 적는다. 아래 표의 셀 값은 **JSON 을 풀었을 때의 글자**다.

**cell 사례 87건**

| # | id | 변수 | 셀 | 값 | 기대 | 근거 |
|---|---|---|---|---|---|---|
| 1 | `cell.eq.trailing-zero` | THK | EQ 1.1 | N 1.10 | T | 표본, 06:289 |
| 2 | `cell.eq.null` | THK | EQ 1.1 | NULL | F | 06:286 |
| 3 | `cell.ne.null` | SURF | NE A | NULL | F | 표본, 06:189 |
| 4 | `cell.ne.hit` | SURF | NE A | S B | T | |
| 5 | `cell.ne.miss` | SURF | NE A | S A | F | |
| 6 | `cell.lt.null` | THK | LT 2.5 | NULL | F | 06:190 |
| 7 | `cell.lt.boundary` | THK | LT 2.5 | N 2.5 | F | 06:287 |
| 8 | `cell.le.boundary` | THK | LE 2.5 | N 2.50 | T | 06:287 |
| 9 | `cell.gt.boundary` | THK | GT 2.5 | N 2.5 | F | 06:287 |
| 10 | `cell.ge.boundary` | THK | GE 2.5 | N 2.50 | T | 06:287 |
| 11 | `cell.le.null` | THK | LE 2.5 | NULL | F | 06:286 |
| 12 | `cell.gt.null` | THK | GT 2.5 | NULL | F | 06:286 |
| 13 | `cell.ge.null` | THK | GE 2.5 | NULL | F | 06:286 |
| 14 | `cell.range.ii.lower` | THK | `<= 변수 <=` 1.6 2.5 | N 1.6 | T | 06:287 |
| 15 | `cell.range.ii.upper` | THK | `<= 변수 <=` 1.6 2.5 | N 2.5 | T | |
| 16 | `cell.range.io.lower` | THK | `<= 변수 <` 1.6 2.5 | N 1.60 | T | |
| 17 | `cell.range.upper-open-boundary` | THK | `<= 변수 <` 1.6 2.5 | N 2.5 | F | 표본 |
| 18 | `cell.range.oi.lower` | THK | `< 변수 <=` 2.5 3.0 | N 2.5 | F | |
| 19 | `cell.range.oi.upper` | THK | `< 변수 <=` 2.5 3.0 | N 3 | T | |
| 20 | `cell.range.oo.lower` | THK | `< 변수 <` 0 100 | N 0 | F | |
| 21 | `cell.range.oo.upper` | THK | `< 변수 <` 0 100 | N 100 | F | |
| 22 | `cell.range.null` | THK | `<= 변수 <=` 1.6 2.5 | NULL | F | 06:286 |
| 23 | `cell.range.io.null` | THK | `<= 변수 <` 1.6 2.5 | NULL | F | |
| 24 | `cell.range.oi.null` | THK | `< 변수 <=` 2.5 3.0 | NULL | F | |
| 25 | `cell.range.oo.null` | THK | `< 변수 <` 0 100 | NULL | F | |
| 26 | `cell.range.negative` | THK | `<= 변수 <` -1.5 0 | N -1.5 | T | 06:249 |
| 27 | `cell.in.single` | SURF | IN [A] | S A | T | 표본, 06:291 |
| 28 | `cell.in.miss` | SURF | IN [A, B] | S C | F | |
| 29 | `cell.in.null` | SURF | IN [A] | NULL | F | |
| 30 | `cell.in.number` | THK | IN ["1.1", "2"] | N 1.10 | T | |
| 31 | `cell.not-in.null` | SURF | NOT_IN [C] | NULL | F | 06:189 |
| 32 | `cell.not-in.hit` | SURF | NOT_IN [C] | S A | T | |
| 33 | `cell.not-in.miss` | SURF | NOT_IN [C] | S C | F | |
| 34 | `cell.is-null.null` | SURF | IS_NULL | NULL | T | 표본 |
| 35 | `cell.is-null.value` | SURF | IS_NULL | S A | F | |
| 36 | `cell.not-null.null` | SURF | NOT_NULL | NULL | F | |
| 37 | `cell.na.null` | SURF | NA | NULL | T | 06:180 |
| 38 | `cell.code-in.member` | PROC | CODE_IN PLATING | S 82 | T, CS | 06:292 |
| 39 | `cell.code-in.not-member` | PROC | CODE_IN PLATING | S 83 | F, CS | 표본 |
| 40 | `cell.code-in.closed` | PROC | CODE_IN PLATING | S 85 | F, CS(85 는 닫혀 사본 집합에 없다) | 06:292 |
| 41 | `cell.code-in.null` | PROC | CODE_IN PLATING | NULL | F, CS | 06:292 |
| 42 | `cell.code-in.no-set` | PROC | CODE_IN PAINT | S 82 | F, CS, `screenFallback: true` | EG 8.5 1항 |
| 43 | `cell.lt.date-string` | DT | LT 20260907 | S 20260906 | T | 표본 |
| 44 | `cell.range.date-string` | DT | `<= 변수 <` 20260901 20261001 | S 20260930 | T | 06:293 |
| 45 | `cell.range.date-string-upper` | DT | `<= 변수 <` 20260901 20261001 | S 20261001 | F | 06:293 |
| 46 | `cell.eq.pattern.prefix` | STL | EQ `SGC%` | S SGCC | T | 06:294 |
| 47 | `cell.eq.pattern.prefix-case` | STL | EQ `SGC%` | S sgcc | F | 06:161 |
| 48 | `cell.eq.pattern.null` | STL | EQ `SGC%` | NULL | F | 06:190 |
| 49 | `cell.eq.pattern.suffix` | STL | EQ `%CC` | S SGCC | T | 06:294 |
| 50 | `cell.eq.pattern.infix` | SPEC | EQ `%G33%` | S `JIS G3302` | T | 06:294 |
| 51 | `cell.eq.pattern-regex` | STL | EQ `A%B`, `patternRegex: "A.*B"` | S AxxB | T | 표본 |
| 52 | `cell.eq.pattern-regex.full-match` | STL | EQ `A%B`, `patternRegex: "A.*B"` | S AxxBC | F | 06:158 |
| 53 | `cell.eq.pattern.dot-literal` | STL | EQ `A.B%` | S AxBC | F | 06:294 |
| 54 | `cell.eq.pattern.dot-hit` | STL | EQ `A.B%` | S A.BC | T | |
| 55 | `cell.eq.pattern.backslash` | STL | EQ `A\\B%`(이스케이프한 `\`) | S `A\BC` | T | 06:294 |
| 56 | `cell.eq.pattern.three-percent` | SPEC | EQ `%A%B%`, `patternRegex: ".*A.*B.*"` | S xAyBz | T | 06:294 |
| 57 | `cell.eq.pattern.escaped-percent` | STL | EQ `100\%` | S `100%` | T | 06:294 |
| 58 | `cell.eq.pattern.escaped-percent-miss` | STL | EQ `100\%` | S 1000 | F | |
| 59 | `cell.eq.pattern.escaped-underscore` | STL | EQ `A\_B` | S AxB | F | 06:294 |
| 60 | `cell.eq.pattern.underscore` | STL | EQ `A_C`, `patternRegex: "A.C"` | S ABC | T | 06:294 |
| 61 | `cell.eq.exact` | STL | EQ SGCC | S `SGCC `(끝 공백) | F | 06:294 |
| 62 | `cell.contains.hit` | SPEC | CONTAINS SGCC | S `JIS G3302 SGCC` | T | 06:169 |
| 63 | `cell.contains.miss` | SPEC | CONTAINS SGCC | S `JIS G3302 SGHC` | F | 06:170 |
| 64 | `cell.contains.case` | SPEC | CONTAINS sgcc | S `JIS G3302 SGCC` | F | 06:171 |
| 65 | `cell.contains.percent-literal` | SPEC | CONTAINS `G3302%` | S `JIS G3302 SGCC` | F | 06:172 |
| 66 | `cell.contains.meta-literal` | SPEC | CONTAINS `G.3` | S `JIS G33` | F | 표본, 06:295 |
| 67 | `cell.contains.star` | SPEC | CONTAINS `A*` | S `XA*Y` | T | 06:295 |
| 68 | `cell.contains.backslash` | SPEC | CONTAINS `A\B` | S `xA\By` | T | 06:295 |
| 69 | `cell.contains.null` | SPEC | CONTAINS SGCC | NULL | F | 06:286 |
| 70 | `cell.instr.hit` | STL | INSTR `SGCC,SGHC,SGCH` | S SGHC | T | 06:173 |
| 71 | `cell.instr.partial` | STL | INSTR `SGCC,SGHC,SGCH` | S GC | T | 06:174 |
| 72 | `cell.instr.miss` | STL | INSTR `SGCC,SGHC,SGCH` | S SGCH2 | F | 06:175 |
| 73 | `cell.instr.null` | STL | INSTR `SGCC,SGHC,SGCH` | NULL | F | 06:176 |
| 74 | `cell.instr.case` | STL | INSTR SGCC | S sgcc | F | 06:295 |
| 75 | `cell.instr.meta` | STL | INSTR `A.B*` | S `.B` | T | 06:295 두 방향 |
| 76 | `cell.instr.meta-miss` | STL | INSTR `A.B*` | S AxB | F | 06:295 |
| 77 | `cell.bool.eq-true` | OK | EQ TRUE | B true | T | 06:250 |
| 78 | `cell.bool.eq-false` | OK | EQ TRUE | B false | F | |
| 79 | `cell.bool.null` | OK | EQ TRUE | NULL | F | |
| 80 | `cell.type-mismatch` | THK | GE 2.5 | S abc | error TYPE_CONVERSION | 표본, 06:290 |
| 81 | `cell.type.number-from-string` | THK | GE 2.5 | S 2.50 | T | 06:199 |
| 82 | `cell.type.bool-from-string` | OK | EQ TRUE | S Y | error TYPE_CONVERSION | 06:290 |
| 83 | `cell.type.string-from-number` | SURF | EQ A | N 1 | F(`"1"` 로 바뀌어 `"A"` 와 다르다) | F23(03-03 ValueConverter) |
| 84 | `cell.constant-key` | `{name: "pi", dataType: "NUMBER"}` | EQ 1 | N 1 | error CONSTANT_KEY | 06:296, 06:199 |
| 85 | `cell.eval-ts-key` | `{name: "EVAL_TS", dataType: "STRING"}` | EQ A | S A | error EVAL_TS_KEY | engine-contract §6 |
| 86 | `cell.reserved-key` | `{name: "_V7", dataType: "STRING"}` | EQ A | S A | error RESERVED_KEY | engine-contract §6 |
| 87 | `cell.eq.pattern.infix-miss` | SPEC | EQ `%G34%` | S `JIS G3302` | F | 06:294 |

**expr 사례 82건**(`vars` 에 없는 변수는 식에 쓰지 않는다. `X`·`Y` 는 NULL)

| # | id | expr | vars | 기대 | 근거 |
|---|---|---|---|---|---|
| 1 | `expr.decimal.no-double` | `A + B == 0.3` | A N 0.1, B N 0.2 | T | 표본 |
| 2 | `expr.instr.null-compare` | `INSTR(A, "X") > 0` | A NULL | error EVALUATION_ERROR | 표본 |
| 3 | `expr.master.data-fallback` | `MASTER("CUST", "BASE", CUST_CD)` | CUST_CD S C001 | F, `screenFallback: true` | 표본 |
| 4 | `expr.master.code-member` | `MASTER("PROC_CD", "PLATING", P)` | P S 82, CS | T | EG 8.5 |
| 5 | `expr.master.code-null-key` | `MASTER("PROC_CD", "PLATING", P)` | P NULL, CS | F | engine-contract §7 |
| 6 | `expr.round.half-even` | `ROUND(X, 2)` | X N 2.345 | N 2.34 | 표본 |
| 7 | `expr.round.half-even-odd` | `ROUND(X, 2)` | X N 2.355 | N 2.36 | §0.2 |
| 8 | `expr.round.negative-scale` | `ROUND(X, -1)` | X N 125 | N 120 | §0.2 |
| 9 | `expr.constant-key` | `V != NULL` | V N 1, NULL N 1 | error CONSTANT_KEY | 표본 |
| 10 | `expr.eval-ts-key` | `V != NULL` | V N 1, EVAL_TS S x | error EVAL_TS_KEY | engine-contract §6 |
| 11 | `expr.reserved-key` | `V != NULL` | V N 1, _X N 1 | error RESERVED_KEY | engine-contract §6 |
| 12 | `expr.missing-key` | `A > 1` | (없음) | error MISSING_KEY | 06:197 엔진 계약 1 |
| 13 | `expr.null-plus` | `X + 1` | X NULL | S null1 | §0.2, engine-contract §11 |
| 14 | `expr.plus-null-right` | `1 + X` | X NULL | S 1null | §0.2 |
| 15 | `expr.null-times` | `X * 2` | X NULL | error EVALUATION_ERROR | §0.2 |
| 16 | `expr.string-times` | `S * 2` | S S 2 | error EVALUATION_ERROR | §0.2 |
| 17 | `expr.min.null-first` | `MIN(X, 1)` | X NULL | N 1 | §0.2 |
| 18 | `expr.min.null-later` | `MIN(1, X)` | X NULL | error EVALUATION_ERROR | §0.2 |
| 19 | `expr.max.null-first` | `MAX(X, 1)` | X NULL | N 1 | §0.2 |
| 20 | `expr.max.null-later` | `MAX(1, X)` | X NULL | error EVALUATION_ERROR | §0.2 |
| 21 | `expr.sum.null` | `SUM(X, 1)` | X NULL | error EVALUATION_ERROR | §0.2 |
| 22 | `expr.str-contains.null` | `STR_CONTAINS(X, "u")` | X NULL | F | §0.2 |
| 23 | `expr.str-contains.case` | `STR_CONTAINS("AbC", "bc")` | (없음) | T | §0.2 |
| 24 | `expr.if.null-cond` | `IF(X, 1, 2)` | X NULL | N 2 | §0.2 |
| 25 | `expr.if.lazy` | `IF(TRUE, 1, X * 2)` | X NULL | N 1 | EG 8.4 |
| 26 | `expr.if.string-cond` | `IF("yes", 1, 2)` | (없음) | N 2 | §0.2 |
| 27 | `expr.not.null` | `NOT(X)` | X NULL | error EVALUATION_ERROR | §0.2 |
| 28 | `expr.bang.null` | `!X` | X NULL | error EVALUATION_ERROR | §0.2 |
| 29 | `expr.and.false-short` | `FALSE && X` | X NULL | F | §0.2 |
| 30 | `expr.or.true-short` | `TRUE \|\| X` | X NULL | T | §0.2 |
| 31 | `expr.or.null-left` | `X \|\| TRUE` | X NULL | error EVALUATION_ERROR | §0.2 |
| 32 | `expr.and.null-left` | `X && TRUE` | X NULL | error EVALUATION_ERROR | §0.2 |
| 33 | `expr.and.number-operand` | `TRUE && 1` | (없음) | T | §0.2 |
| 34 | `expr.substring.boundary` | `STR_SUBSTRING("ABCDE", 1, 2)` | (없음) | S B | §0.2 |
| 35 | `expr.substring.end-clamp` | `STR_SUBSTRING("ABC", 1, 9)` | (없음) | S BC | §0.2 |
| 36 | `expr.substring.start-only` | `STR_SUBSTRING("ABCDE", 2)` | (없음) | S CDE | §0.2 |
| 37 | `expr.substring.reversed` | `STR_SUBSTRING("ABCDE", 3, 1)` | (없음) | error EVALUATION_ERROR | §0.2 |
| 38 | `expr.substring.negative` | `STR_SUBSTRING("ABC", -1)` | (없음) | error EVALUATION_ERROR | §0.2 |
| 39 | `expr.left.over` | `STR_LEFT("ABC", 5)` | (없음) | S ABC | §0.2 |
| 40 | `expr.left.negative` | `STR_LEFT("ABC", -1)` | (없음) | S (빈 문자열) | §0.2 |
| 41 | `expr.right` | `STR_RIGHT("ABC", 2)` | (없음) | S BC | §0.2 |
| 42 | `expr.trim` | `STR_TRIM("  a ")` | (없음) | S a | §0.2 |
| 43 | `expr.switch.null-default` | `SWITCH(X, 1, 10, 20)` | X NULL | N 20 | §0.2, engine-contract §11 |
| 44 | `expr.switch.no-default` | `SWITCH(3, 1, 10, 2, 20)` | (없음) | NULL | §0.2 |
| 45 | `expr.eq.mixed-type` | `3 == "3"` | (없음) | F | EG 8.4 |
| 46 | `expr.eq.bool-number` | `1 == TRUE` | (없음) | F | §0.2 |
| 47 | `expr.eq.number-scale` | `1.10 == 1.1` | (없음) | T | 06:289 |
| 48 | `expr.ne.null` | `X != 1` | X NULL | T | EG 8.4 |
| 49 | `expr.power.neg-unary` | `-2 ^ 2` | (없음) | N 4 | EG §2 |
| 50 | `expr.power.fraction` | `2 ^ 0.5` | (없음) | N 1.4142135623730951 | §0.2 |
| 51 | `expr.power.mixed` | `2 ^ 2.5` | (없음) | N 5.6568542494923804 | §0.2 |
| 52 | `expr.power.negative-int` | `2 ^ -2` | (없음) | N 0.25 | §0.2 |
| 53 | `expr.power.negative-scale` | `0.3 ^ -1` | (없음) | N `3.` + 3 이 68개(소수 68자리, 유효숫자 69) | §0.2(역수는 precision 이 아니라 scale 68) |
| 54 | `expr.sqrt` | `SQRT(2)` | (없음) | N 1.41421356237309504880168872420969807856967187537694807317667973799073 | §0.2 |
| 55 | `expr.sqrt.negative` | `SQRT(-1)` | (없음) | error EVALUATION_ERROR | §0.2 |
| 56 | `expr.divide.precision` | `1 / 3` | (없음) | N `0.` + 3 이 68개 | §0.2 |
| 57 | `expr.divide.zero` | `1 / 0` | (없음) | error EVALUATION_ERROR | §0.2 |
| 58 | `expr.average.rounding` | `AVERAGE(1, 2, 2)` | (없음) | N 1.6666666666666666666666666666666666666666666666666666666666666666667 | §0.2 |
| 59 | `expr.modulo.negative` | `-7 % 3` | (없음) | N -1 | §0.2 |
| 60 | `expr.modulo.step` | `value % 0.1 == 0` | value N 2.3 | T | EG §7 |
| 61 | `expr.str-matches.full` | `STR_MATCHES("xAB", "A.*B")` | (없음) | F | EG 8.4 |
| 62 | `expr.string-order` | `"B" < "a"` | (없음) | T | 06:127, §0.2 |
| 63 | `expr.string-order.digits` | `"10" < "9"` | (없음) | T | 06:127 |
| 64 | `expr.coalesce` | `COALESCE(X, 5)` | X NULL | N 5 | §0.2 |
| 65 | `expr.domain.range-hit` | `value >= 0.1 && value <= 3.5 && value % 0.1 == 0` | value N 3.5 | T | 02 예시 |
| 66 | `expr.domain.range-step-miss` | 같은 식 | value N 3.55 | F | 02 예시 |
| 67 | `expr.domain.inherit` | `(value >= 0.1 && value <= 3.5 && value % 0.1 == 0) && (value >= 1.6)` | value N 1.5 | F | 02 상속 예시 |
| 68 | `expr.prod-wgt.len` | `ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)` | 1.8, 1200, 1500, 7.85 | N 25434 | F16 |
| 69 | `expr.prod-wgt.dia` | `ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)` | 외경 1800, 내경 610, 폭 1200, 공극률 1.5, 비중 7.85 | N 20899.7 | F16 |
| 70 | `expr.prod-wgt.sheet` | `ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)` | 0.8, 1219, 2438, 120, 7.85 | N 2239.6 | F16 |
| 71 | `expr.prod-wgt.coalesce` | `ROUND(COIL_THK * COIL_WID * COIL_LEN * COALESCE(SPEC_GRAV, 7.85) / 1000, 1)` | 1.8, 1200, 1500, SPEC_GRAV NULL | N 25434 | F16 PV2 |
| 72 | `expr.instr.position` | `INSTR(S, "CC")` | S S SGCC | N 3 | 06:160 |
| 73 | `expr.instr.null` | `INSTR(S, "CC")` | S NULL | NULL | EG 8.4 |
| 74 | `expr.str-upper.literal-scale` | `STR_UPPER(1.50)` | (없음) | S 1.50 | §0.2 |
| 75 | `expr.concat.record-scale` | `"" + X` | X N 1.10 | S 1.10 | §0.2 |
| 76 | `expr.concat.round-scale` | `"" + ROUND(X, 2)` | X N 2.5 | S 2.50 | §0.2(setScale) |
| 77 | `expr.concat.computed-scale` | `"" + (0.1 * 10)` | (없음) | S 1.0, `screenFallback: true` | §0.2, D4 |
| 78 | `expr.compare.mixed-type` | `1 < "2"` | (없음) | F, `screenFallback: true` | §0.2, D4 |
| 79 | `expr.str-length.utf16` | `STR_LENGTH("한글")` | (없음) | N 2 | §0.2 |
| 80 | `expr.grp-cond` | `STR_STARTS_WITH(TOP_RESIN_CD, "2")` | TOP_RESIN_CD S 2A | T | 06:75 |
| 81 | `expr.gen.guard-null` | `V != NULL && V >= (-1.5)` | V NULL | F | 06:181 생성 규칙 |
| 82 | `expr.gen.null-eq` | `V == NULL` | V NULL | T | 06:188 |

- **표본 15건**(id 와 내용이 docs 표본과 같다): `cell.eq.trailing-zero`, `cell.range.upper-open-boundary`, `cell.ne.null`, `cell.is-null.null`, `cell.in.single`, `cell.code-in.not-member`, `cell.eq.pattern-regex`, `cell.contains.meta-literal`, `cell.lt.date-string`, `cell.type-mismatch`, `expr.decimal.no-double`, `expr.instr.null-compare`, `expr.master.data-fallback`, `expr.round.half-even`, `expr.constant-key`.
- **폴백 허용 목록 `ALLOWED_FALLBACK_IDS`(4건)**: `cell.code-in.no-set`, `expr.master.data-fallback`, `expr.concat.computed-scale`, `expr.compare.mixed-type`.

**06:284-296 필수 목록 대응표**

| 06 필수 항목 | 대응 |
|---|---|
| op 마다 NULL 입력 | 담김: cell #2·3·6·11·12·13·22-25·29·31·34·36·37·41·48·69·73·79 |
| 구간 op 4종 경계값, GE·GT·LE·LT 경계값 | 담김: cell #7-10·14-21 |
| 식 변수(참조 변수 NULL, 선언 타입 변환 실패) | **CorpusCase 모양에 담을 수 없음**(F8: `CellCase.variable` 에 식 칸이 없고 스키마는 고치지 않는다). 화면 쪽은 미리보기 #13 이 참조 변수 NULL 규칙을 붙잡는다. 서버 쪽 사례는 식 변수 평가를 구현하는 TSK-03-03 이 스키마 확장과 함께 넣는다(D3) |
| `1.10` 과 `1.1` | 담김: cell #1, expr #47 |
| 변수 타입과 어긋난 값 | 담김: cell #80·82·83 |
| 원소 하나짜리 IN | 담김: cell #27 |
| `IN 카테고리` 소속·비소속·닫힌 코드·NULL | 담김: cell #38-41(+ 집합 없음 #42) |
| 일자 문자열 구간 | 담김: cell #43-45 |
| `=` 패턴 단순형 셋·`A%B`·`.`·`\`·`%` 3개·`\%`·`\_`·`_` 만·정확 일치 | 담김: cell #46-61·87 |
| CONTAINS·INSTR 메타문자·대소문자·두 방향 | 담김: cell #62-76 |
| 상수 이름과 겹치는 레코드 키 | 담김: expr #9, cell #84 |
| (engine-contract §11) `NULL + 1`, MIN·MAX 비대칭, `STR_CONTAINS(NULL)`, `IF(NULL)`, `NOT(NULL)`, `FALSE && NULL`·`NULL \|\| TRUE`, `STR_SUBSTRING` 경계, ROUND HALF_EVEN, SWITCH 직렬화 | 담김: expr #13·17-20·22·24·27·29·31·34-38·6·43 |
| (engine-contract §11) `MASTER_AT`·`attr` 형태 | **뺌**: 서버 러너에 대역 함수가 없다(MASTER_AT 기준일 해석·attr 조회는 TSK-03-02 몫). 화면 폴백은 interpreter #2·#4 가 붙잡는다. TSK-03-02 가 실물 함수를 넣을 때 사례를 더한다(D3) |

### 6.11 JUnit 러너 (`T/corpus/`)

**`CorpusEvalExHarness`**(final 유틸 클래스, 교체 지점은 `configuration` 하나)

```java
/** 교체 지점 — TSK-03-02 가 MdmExpressionConfig.create 를 구현하면 이 몸체를 그 호출 한 줄로 바꾼다(D2). */
static ExpressionConfiguration configuration(Map<String, List<String>> codeSets) {
    FunctionDictionaryIfc std = ExpressionConfiguration.defaultConfiguration().getFunctionDictionary();
    List<Map.Entry<String, FunctionIfc>> fns = new ArrayList<>();
    for (String name : FunctionSets.BASE) fns.add(Map.entry(name, std.getFunction(name)));
    fns.add(Map.entry("INSTR", new CorpusFunctions.InstrStandIn()));
    fns.add(Map.entry("MASTER", new CorpusFunctions.MasterStandIn(codeSets)));
    return ExpressionConfiguration.builder()
        .mathContext(MdmExpressionConfig.MATH_CONTEXT).zoneId(MdmExpressionConfig.ZONE).locale(MdmExpressionConfig.LOCALE)
        .allowOverwriteConstants(MdmExpressionConfig.ALLOW_OVERWRITE_CONSTANTS).lenientMode(MdmExpressionConfig.LENIENT_MODE)
        .regexTimeoutMillis(MdmExpressionConfig.REGEX_TIMEOUT_MILLIS).maxRecursionDepth(MdmExpressionConfig.MAX_RECURSION_DEPTH)
        .arraysAllowed(MdmExpressionConfig.ARRAYS_ALLOWED).structuresAllowed(MdmExpressionConfig.STRUCTURES_ALLOWED)
        .implicitMultiplicationAllowed(MdmExpressionConfig.IMPLICIT_MULTIPLICATION_ALLOWED)
        .singleQuoteStringLiteralsAllowed(MdmExpressionConfig.SINGLE_QUOTE_STRING_LITERALS_ALLOWED)
        .binaryAllowed(MdmExpressionConfig.BINARY_ALLOWED).stripTrailingZeros(MdmExpressionConfig.STRIP_TRAILING_ZEROS)
        .decimalPlacesRounding(MdmExpressionConfig.DECIMAL_PLACES_ROUNDING)
        .functionDictionary(MapBasedFunctionDictionary.ofFunctions(fns.toArray(Map.Entry[]::new)))
        .build();
}
```
(빌더 메서드 이름은 TSK-03-01 이 `javap` 로 확인한 목록이다. 컴파일이 안 되는 이름이 있으면 `javap -cp <EvalEx jar> 'com.ezylang.evalex.config.ExpressionConfiguration$ExpressionConfigurationBuilder'` 로 확인해 맞추고 design 에 추기한다.)

하네스가 **엔진 동작을 대신 정하는 자리**(TSK-03-02·03-03 으로 바꿀 때 하나씩 다시 확인한다):

| 자리 | 하네스 규칙 | 실물 담당 |
|---|---|---|
| 예약 키 검사 | 키 순서대로 `ReservedNames.CONSTANTS`(대문자 비교) → `CONSTANT_KEY`, `EVAL_TS`(대문자 비교) → `EVAL_TS_KEY`, `_` 접두 → `RESERVED_KEY`, 대소문자만 다른 키 묶음 → `RESERVED_KEY`. 처음 어긋난 키 | TSK-03-03 `RecordKeys.check`(F23) |
| 키 누락 | `expression.getUsedVariables()` 가운데 상수를 뺀 이름이 vars 에 없으면 `MISSING_KEY` | TSK-03-03(입력 계약 기반) |
| 셀 값 타입 변환 | 03-03 `ValueConverter.toDeclared` 표(F23)를 test 안에 옮긴 `CorpusEvalExHarness.toDeclared`. §6.2 화면 표와 같다 | TSK-03-03 `ValueConverter`(머지 뒤 후속에서 교체는 하지 않는다. package-private 이라 test 패키지 `corpus` 에서 부를 수 없다. 코퍼스 사례가 두 구현을 묶는다) |
| NA 셀 | 식을 만들지 않고 true | TSK-03-03(평가 목록에서 뺀다, 06:180) |
| 오류 매핑 | `EvaluationException`·`NullPointerException`·`ArithmeticException`·`IndexOutOfBoundsException`·그 밖 `RuntimeException` → `EVALUATION_ERROR`. `ParseException` 은 코퍼스 잘못이므로 테스트 실패 | TSK-03-02·03 |
| `INSTR` | `InstrStandIn`: 인자 `s`, `sub`. 어느 쪽이든 NULL 이면 NULL, 아니면 `s.indexOf(sub) + 1`(`BigDecimal`) | TSK-03-02 |
| `MASTER` | `MasterStandIn(codeSets)`: 인자 `id`, `cate`, `key`, `attr`(`isVarArg`). attr 가 있으면 `EvaluationException`(코퍼스에 없다). key NULL → false. `codeSets` 에 `id|cate` 가 있으면 포함 여부. 없으면 false(마루 데이터 대상 `MasterLookup.NONE`, engine-contract §11) | TSK-03-02 |
| `MASTER_AT` | 넣지 않는다(파싱 오류가 되므로 코퍼스에서 뺐다) | TSK-03-02 |

**평가 절차**(`CorpusConformanceTest`)

- expr 사례: (1) vars 키 예약 검사 (2) `new Expression(expr, configuration(codeSets))` (3) 키 누락 검사 (4) vars 를 `TypedValue` → Java(`NUMBER` → `new BigDecimal(value)`(스케일 유지), `STRING` → `String`, `BOOLEAN` → `Boolean`, `NULL` → `null`)로 바꿔 `with` (5) `evaluate()` (6) 결과 `EvaluationValue` → `TypedValue`(`isNullValue` → NULL, `isBooleanValue` → BOOLEAN, `isNumberValue` → NUMBER `toPlainString()`, `isStringValue` → STRING, 그 밖은 실패) (7) 기대와 비교(NUMBER 는 `compareTo == 0`).
- cell 사례: (1) `variable.name` 예약 검사 (2) 값 타입 변환 (3) NA 면 true (4) `CellTextOracle.conditionText(cell, variable.name, dataType, variable.maruCodeId)` 로 텍스트를 만들고, `patternRegex` 가 있으면 `CellTextOracle.patternRegex(cell.left)` 가 그것과 글자까지 같은지 단언 (5) `with(name, 변환값)` 뒤 평가 (6) BOOLEAN 비교.

**`CellTextOracle`**(06 「EvalEx 생성 규칙」 06:242-262 와 03-03 §6.10·§6.11 을 옮긴 test 전용 거울. 03-03 머지 뒤 `CellTextGenerator` 로 바꾼다, §6.15)

- 시그니처는 03-03 `CellTextGenerator` 와 짝을 맞춘다(F21). 인자 타입만 코퍼스 모양(Jackson `JsonNode` 셀, `String` 데이터 타입)이다: `static final String NA_TEXT = ""`, `static String conditionText(JsonNode cell, String subject, String dataType, String maruCodeId)`(NA → `NA_TEXT`), `static Optional<String> patternRegex(String patternValue)`(정규식형일 때만 앵커 없는 정규식, 정확 일치·단순형이면 빈 값, 거부 대상이면 `IllegalArgumentException`). 일자 String 은 `dataType` 이 `STRING` 이다(생성기는 일자를 따로 보지 않는다).
- 리터럴 모양은 03-03 §6.10.2 와 같다. NUMBER 는 `^[+-]?\d+(\.\d+)?$` 만 받고(그 밖 IAE) `stripTrailingZeros`, 0 이면 `0`, 음수면 괄호. BOOLEAN 은 `TRUE`/`FALSE` 대소문자 무시.
- 거부 규칙은 03-03 §6.10.3 가운데 코퍼스에 닿는 것만 옮긴다: 홀로 선 `\`, `%`·`%%` 단독, 접은 뒤 `%` 4 개 이상, 빈 CONTAINS·INSTR 값, 숫자 리터럴 모양 위반, BOOLEAN `TRUE`/`FALSE` 밖, 빈 IN 목록, 구간 `right` 없음, `maruCodeId` 없는 CODE_IN, 모르는 op.
- 리터럴: STRING·일자 → `"` + (`\` → `\\`, `"` → `\"`) + `"`. NUMBER → 평문 정규화(`new BigDecimal(s).stripTrailingZeros().toPlainString()`, `-0` 은 `0`), 음수면 `(-1.5)` 처럼 괄호. BOOLEAN → `TRUE`/`FALSE`.
- op 별 텍스트는 오라클 테스트 표(§3.1)와 같다. IN 목록은 셀에 적힌 순서대로 쓴다(저장 시 정렬은 저장 측 몫).
- `=` 패턴(STRING 변수의 EQ, 일자 포함 늘 토큰화): 03-03 §6.11(F22)·`pattern.ts` 와 같은 토큰화(TS 와 Java 가 같은 규칙을 따로 구현한다. 코퍼스가 둘을 묶는다). 와일드카드 없음 → `V != NULL && V == "원문 복원값"`. 접두·접미·앞뒤형 → `STR_STARTS_WITH`·`STR_ENDS_WITH`·`INSTR(V, "A") > 0`. 그 밖 → `STR_MATCHES(V, "<likeToRegex 결과를 문자열 리터럴 규칙으로 이스케이프>")`.
- `static String likeToRegex(String pattern)`: 글자 토큰은 `\ ^ $ . | ? * + ( ) [ ] { }` 이면 앞에 `\`, `ANY_SEQ` → `.*`, `ANY_ONE` → `.`.

**`AstMaps.toMap(ASTNode)`**: `type` = `token.getType().name()`, `value` = `token.getValue()`, 자식이 있으면 `params`(원천 `AstExporter.toMap` 과 같다). 비교는 Jackson `valueToTree` 로 바꿔 `JsonNode.equals`.

### 6.12 Vitest 러너 (`evalex-corpus.test.ts`)

```ts
const corpus: CorpusFile = JSON.parse(readFileSync(CORPUS_PATH, "utf8"));
export const ALLOWED_FALLBACK_IDS = ["cell.code-in.no-set", "expr.master.data-fallback", "expr.concat.computed-scale", "expr.compare.mixed-type"];
it.each(corpus.cases.map(c => [c.id, c] as const))("%s", (_id, c) => { … });
```

- expr: `evaluate(c.ast, 변환한 vars, { codeSets: c.codeSets })`. cell: `evaluateCell(c.variable, c.cell, fromTypedValue(c.value), { patternRegex: c.patternRegex, codeSets: c.codeSets })`.
- 판정: 결과가 `fallback` 이면 `c.expect.screenFallback === true` 이고 id 가 `ALLOWED_FALLBACK_IDS` 에 있어야 통과. `c.expect.screenFallback === true` 인데 결과가 fallback 이 아니면 실패(화면이 폴백해야 할 자리에서 값을 지어냈다). 그 밖은 `value` 면 `toTypedValue` 와 기대를 타입·값으로 비교(NUMBER 는 `new D(a).eq(b)`), `error` 면 코드 비교.

### 6.13 성능 측정 (`evalex-perf.test.ts`, D6)

- 정의: PRD NFR-1 "1만 행 판정 100 ms 이내(02 「실행 지점」)"와 TRD "화면 AST 평가 1만 행 100 ms 이내"를 따라 **"1만 행" = 그리드 레코드 1만 개**로 본다. 식 1개 또는 룰 1개를 레코드마다 한 번 평가한다.
- 입력: 결정적 생성(선형 합동 난수, 씨앗 고정). 숫자 값은 **문자열**로 둔다(그리드가 주는 모양). 문자열 → Decimal 변환은 측정 시간에 **포함**한다.
- 절차: `compile`(또는 룰 준비) 1회 → 워밍업 3회(1만 건씩) → 측정 5회(`performance.now()`) → 중앙값 < 100 ms 를 단언한다. 실패 메시지에 5회 값을 모두 싣는다.

| 테스트 | 대상 |
|---|---|
| `NFR-1: 식 R2 를 1만 레코드에 100 ms 안에 평가한다` | `value >= 0.1 && value <= 3.5 && value % 0.1 == 0 && value >= COIL_THK`(EG 8.7 R2, 가장 무거운 측정 식) |
| `NFR-1: 식 R3 를 1만 레코드에 100 ms 안에 평가한다` | `IF(GRADE == "A", value <= 2.0, value <= 3.5) && STR_MATCHES(LOT, "^[A-Z0-9]{10,20}$")` |
| `NFR-1: BASE_SPD_LKP(UNIQUE 7행) 미리보기를 1만 레코드에 100 ms 안에 한다` | `previewRule` 레코드 1만 개(UNIQUE 라 행 7개를 모두 평가) |
| `NFR-1: QLTY_GRD_JDG(FIRST) 미리보기를 1만 레코드에 100 ms 안에 한다` | `previewRule` 레코드 1만 개 |

- 미리보기 성능을 위해 `previewRule` 은 룰 객체마다 준비물(조건 열 순서, 입력 계약 always, 셀 리터럴 변환)을 `WeakMap<RuleDef, Prepared>` 로 캐시한다.

### 6.14 Build 순서

1. **설치**: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm add decimal.js@^10.6.0`. 끝나면 `/usr/bin/git status --short src/frontend` 를 보고 `pnpm-workspace.yaml` 등 다른 파일이 바뀌었으면 그 파일만 `/usr/bin/git checkout -- <파일>` 로 되돌린다. 커밋은 `m-mdm/package.json`·`pnpm-lock.yaml` 로 한정한다.
2. **테스트 먼저**: §3 의 테스트 파일을 모두 쓰고, 코퍼스 JSON 을 §6.10 표대로 쓴다(`ast` 칸은 4단계에서 채운다). 빨강(컴파일·모듈 없음)을 확인한다.
3. **JUnit 쪽 구현**: `AstMaps`·`CorpusFunctions`·`CorpusEvalExHarness`·`CellTextOracle`.
4. **AST 채우기**: AST JSON 을 손으로 쓰지 않는다. scratchpad 에 main 을 가진 Java 파일을 하나 만들어 `AstMaps.toMap(new Expression(expr, CorpusEvalExHarness.configuration(Map.of())).getAbstractSyntaxTree())` 를 Jackson 으로 출력하고, 그 결과를 사례의 `ast` 에 붙인다. 클래스패스는 `E/build/classes/java/test`, `E/build/classes/java/main`, EvalEx·Jackson jar(`~/.gradle/caches/modules-2/files-2.1/...`)다. 이 파일은 커밋하지 않는다. 또는 `식_사례의_AST_가…` 테스트 실패 메시지에 실제 AST JSON 을 싣게 해 두고 그것을 옮겨도 된다.
5. **엔진 테스트 초록**: `CorpusConformanceTest` 가 기대값과 다르면 **서버가 기준**이다(EG 8.5 2항). 기대값을 서버 결과로 고치되, 그 결과가 06·EG·engine-contract 원문 문장(예: 06:189 가드 의미, 06:199 상수 키)과 모순되면 고치지 않고 멈춘 뒤 보고한다. 기대값을 고친 사례는 id 와 전후 값을 보고에 적는다.
6. **TS 구현**: `decimal.ts` → `contract-constants.ts` → `errors.ts`·`values.ts` → `functions.ts`·`interpreter.ts` → `pattern.ts`·`cell-compare.ts` → `null-safety.ts`·`input-contract.ts` → `value-set.ts`·`rule-analysis.ts` → `rule-preview.ts` → `index.ts`. 매 단계 해당 Vitest 를 초록으로 만든다. 코퍼스가 화면과 다르면 인터프리터를 고친다(기대값은 5단계에서 서버로 확정됐다).
7. **공개 경로**: `package.json` exports·`tsup.config.ts` entry. `pnpm build:libs` 뒤 `ls src/frontend/m-mdm/dist/evalex/index.js src/frontend/m-mdm/dist/evalex/index.d.ts` 로 산출물을 확인하고, `grep -vE "^\s*$|sourceMappingURL" src/frontend/m-mdm/dist/index.js | wc -l` 이 0 인지(루트 배럴 런타임 코드 없음) 본다.
8. **게이트**: §3.4 두 명령을 포그라운드로 끝까지 돌린다.
9. **변이 검증**: §5 를 하나씩 넣고 빨강을 확인한 뒤 되돌린다. 결과를 표로 보고한다.

---

### 6.15 03-03 머지 뒤 후속 (이 Task 의 코드는 03-03 없이 컴파일·통과한다)

지금 03-03 코드는 dev 에 없다(F20·F21 은 설계 인용일 뿐이다). 아래는 03-03 이 dev 에 머지된 **뒤에** 하는 일이고, 이 Task 의 Build 범위가 아니다. 담당은 03-03·03-04 가운데 나중에 머지되는 쪽의 후속 작업(또는 팀장이 정하는 정리 Task)이다. Build 는 이 절을 구현하지 않고, 끝 보고에 "03-03 머지 뒤 후속 5건"으로 올린다.

| # | 후속 | 바꾸는 곳 |
|---|---|---|
| P1 | 코퍼스 cell 사례의 서버 텍스트를 `CellTextGenerator.conditionText(RuleCell, subject, DataType, maruCodeId)` 로 만든다. 코퍼스 셀 JSON 을 `new DefinitionLookup.RuleCell(op, left, right, list, expr, ast, val, "")` 로, `variable.dataType` 을 `DefinitionLookup.DataType` 으로 바꾸는 변환만 러너에 둔다. `patternRegex` 대조도 `CellTextGenerator.patternRegex` 로 바꾼다 | `CorpusConformanceTest` 4단계, `CellTextOracle` 삭제 |
| P2 | `CellTextOracleTest` 14건을 지운다. 같은 모양은 03-03 `CellTextSnapshotTest` 가 고정한다. `코퍼스_셀_텍스트의_함수는_GENERATED_안이다` 1건만 `CorpusConformanceTest` 로 옮겨 남긴다 | 테스트 수 −13 |
| P3 | 서버 러너가 코퍼스를 03-03 의 `MdmRuleEngine` 경로로도 돌릴지 정한다. 셀 사례 하나를 조건 열 하나·행 하나짜리 FIRST 룰로 감싸 `hits` 여부를 기대값과 견주면, 예약 키·타입 변환·NA 처리까지 03-03 실물로 검증된다. 이렇게 하면 `CorpusEvalExHarness` 의 예약 키·타입 변환 거울(§6.11 표)을 지울 수 있다 | `CorpusConformanceTest` |
| P4 | TSK-03-02 까지 머지되면 `CorpusEvalExHarness.configuration` 을 `MdmExpressionConfig.create(...)` 한 줄로 바꾸고 `CorpusFunctions` 를 지운다(D2). 03-03 의 `TestExpressionConfig` 와 같은 시점이다 | `CorpusEvalExHarness`, `CorpusFunctions` |
| P5 | D1 이 반려돼 분석·입력 계약을 Java 로 이식하게 되면, `RowContract.cond` 는 03-03 `CellSummary.of` 를 재사용해 §6.7 의 열 이름 붙이기만 더한다 | `engine.rule`(이식 Task) |

---

## 7. Build 가 주의할 함정

- **엔진 main 금지**: `J/**` 에 파일을 만들거나 고치면 `ContractOnlyPhaseTest` 가 빨강이 되고, record·enum 이면 영구 `EngineContractSchemaTest`(F19)도 빨강이 된다. 하네스·오라클·대역 함수는 모두 test 소스(`T/corpus/`)다. `ContractOnlyPhaseTest` 는 지우지도 고치지도 않는다. done 시점의 `testAll` 은 이 브랜치(기점 955cef1)에서 실패 0 이어야 한다.
- **03-03 코드에 기대지 않는다**: `CellTextGenerator`·`CellSummary`·`ValueConverter` 등 03-03 클래스를 import 하지 않는다(dev 에 없어 컴파일이 깨진다). 03-03 의 규칙은 §0.3 인용과 오라클·TS 구현으로 거울만 둔다. 03-03 설계가 바뀌었는지 Build 시작 때 `/usr/bin/git show agent/e1205c87-rule-engine:docs/mdm/tasks/TSK-03-03/design.md` 로 §6.1·§6.7·§6.8·§6.11·§6.12 를 다시 보고, 달라졌으면 이 설계와의 차이를 보고에 적는다(설계를 조용히 바꾸지 않는다).
- **03-03 이 먼저 dev 에 머지된 뒤 이 브랜치를 다시 기점에 맞추는 경우**: 03-03 은 `ContractOnlyPhaseTest` 2건을 허용 실패로 안고 간다(03-03 D2). 그 2건은 이 Task 가 만든 실패가 아니므로 보고에 출처를 적어 구분한다. 이 Task 가 새로 만든 실패는 0 이어야 한다.
- **`MdmExpressionConfig.create`·`baseBuilder` 는 UOE 다**: 하네스에서 부르지 않는다. 상수만 읽는다. 스캐폴드 `expr.ExpressionEvaluator` 도 쓰지 않는다(TSK-03-02 가 바꾼다).
- **원천 JS 샘플을 그대로 옮기지 않는다**: `equals` 의 숫자 승격, `num()` 의 문자열 승격, `str(null)` 의 `"null"` 을 STR_* 인자에 쓰는 것, `&&` 의 NULL → false, `MIN`·`MAX` 의 `D.min`, `STR_CONTAINS` 의 `toLowerCase`, 64자리 PI 는 모두 서버와 다르다(§0.2).
- **decimal.js 스케일**: `new Decimal("1.50").toString()` 은 `"1.5"` 다. 숫자를 문자열로 바꿀 때 반드시 `NUMBER_TEXT` 를 거친다. `toTypedValue` 는 값 비교용이라 `toFixed()` 로 충분하다.
- **decimal.js 의 `pow`·`sqrt` 를 쓰지 않는다**: EvalEx 는 `^` 소수부에 double 을 쓰고 `SQRT` 는 버림 Newton 이다(§0.2). 코퍼스 #50-54 가 잡는다.
- **`^` 와 `DHigh`**: 음수 지수 역수는 precision 68 로 나누면 안 된다. 소수 **68자리**(scale)이고 HALF_UP 이다.
- **정규식 플래그**: `new RegExp(…, "u")` 를 쓰지 않는다. Java 정규식은 UTF-16 코드유닛 기준이다.
- **`STR_TRIM`**: JS `trim()` 은 U+00A0·U+3000 까지 지운다. Java `trim` 은 U+0020 이하만이다.
- **코퍼스 JSON 백슬래시**: 셀 값 `A\\B%` 는 JSON 에 `"A\\\\B%"` 로 적는다. 오라클 텍스트 안에서는 한 번 더 이스케이프된다(06:258).
- **테스트 경로 깊이**: `M/tests/helpers/engine-paths.ts` 에서 엔진까지는 `../../../../backend/…` 다. `M/tests/*.test.ts` 에서 직접 계산하면 `../../../backend/…` 다. 헬퍼 한 곳에서만 계산한다.
- **lint 범위**: `src/evalex/**` 는 `tsc --noEmit` strict 대상이다. `tests/**` 는 대상이 아니지만 타입을 느슨하게 쓰지 않는다. lint 는 `pnpm build:libs` 뒤에만 통과한다(shared dist 필요).
- **vitest 병렬**: 파일 단위로 병렬 실행되고 `engine-contract.generated.test.ts` 가 prettier 로 수 초 CPU 를 쓴다. 성능 테스트는 중앙값으로 판정하므로 한 번 튀어도 흔들리지 않는다. 그래도 빨강이면 실측 5회 값을 보고에 싣고 원인(구현 비용)부터 줄인다. 기준 100 ms 를 바꾸지 않는다.
- **`@TestFactory` 건수**: Gradle 보고서는 동적 테스트를 한 건씩 센다. 건수가 §3.4 산식과 다르면 코퍼스 사례 수부터 확인한다.
- **gitignore·심링크**: `docs/mdm/design` 은 심링크다(F1). 커밋 대상이 아니며 되돌리지 않는다.
- **git**: `/usr/bin/git` 절대경로로만 부른다. `git add -A` 를 쓰지 않고 파일명을 명시한다.
- **문제 기록**: 겪은 문제는 `.issues` 에 직접 쓰지 않고 Phase 보고에 분류(tool-error·gate-retry·permission·skill-unclear·env·other)와 함께 올린다.

## 8. Build 이탈 (Build Phase 추기, 2026-09-24)

Build 는 §6.14 순서대로 진행했다. 설계와 달라진 자리와 그 사유를 적는다. 03-03 설계는 Build 시작 때 다시 확인했고 69f1a03 에서 바뀌지 않았다.

| # | 이탈 | 사유 | 영향 |
|---|---|---|---|
| B1 | 테스트 전용 식 파서 `M/tests/helpers/parse-expr.ts` 와 그 검증 테스트 `M/tests/evalex-test-parser.test.ts`(1건)를 더했다 | 설계는 TS 테스트가 쓸 AST 의 출처를 정하지 않았다(interpreter #15 의 `ast("…")` 만 암시). AST 를 손으로 쓰지 않으려고 파서를 두었고, EvalEx 3.7.0 을 실측해 문법을 맞췄다(전위 > `^`(오른쪽 결합) > `* / %` > `+ -` > `< <= > >=` > `== = != <>` > `&&` > `\|\|`, 함수 이름은 적은 대로). 검증 테스트가 코퍼스 식 82건의 서버 AST 와 같은지 본다 | 프런트 새 테스트 251 → **252**(총 257 → **258**). 파서는 제품 코드가 아니다(tsconfig `include` 밖) |
| B2 | 함수의 숫자 인자(`ABS`·`ROUND`·`SUM`·`STR_LEFT` 등)가 문자열·불린이면 오류 대신 **폴백**한다. 연산자(`- * / % ^`, 단항)는 설계대로 오류다 | `javap -c` 로 확인한 EvalEx `EvaluationValue.getNumberValue` 는 문자열을 `Boolean.parseBoolean` 으로 1/0 으로, 불린을 1/0 으로 바꾼다(예: `ABS("2")` = 0). 오류를 내면 서버와 다르고, 그 이상한 값을 재현하는 것은 D4 취지에 어긋난다. NULL 은 서버에서 NPE 라 설계대로 오류다 | 코퍼스 사례 없음(D10) |
| B3 | `^` 정수부 한도를 안전 정수가 아니라 int 범위(2³¹−1)로 했다 | EvalEx 는 `intValueExact()` 로 정수부를 꺼내 int 를 넘으면 ArithmeticException 이다 | 코퍼스 사례 없음 |
| B4 | STRING 변수의 `=` 값은 일자 여부와 무관하게 늘 토큰화한다(§6.5 표의 "일자면 `===`" 대신) | §6.5 표와 같은 절 bullet(F22 ⑤, 03-03 D15)이 서로 다르다. 서버 생성기(오라클)는 늘 토큰화하므로 서버를 따랐다. 일자 값에는 와일드카드가 없어 결과는 같다 | 없음 |
| B5 | BOOLEAN 셀 리터럴 `TRUE`·`FALSE` 를 대소문자 무시로 받는다(§6.5 는 대문자만) | 03-03 §6.10.2 리터럴 규칙과 오라클이 대소문자를 무시한다(서버 기준) | 없음 |
| B6 | 오라클 테스트 `이스케이프한_와일드카드와_문자열_리터럴` 의 저장 값을 `a"b\\c`(이스케이프한 `\`)로 적었다 | 설계 본문의 `a"b\c` 는 `=` 패턴 규칙(F22 ①)상 홀로 선 `\` 라 거부 대상이다. 기대 텍스트 `"a\"b\\c"` 는 03-03 스냅샷 eq.escape(저장 값 `a"b\\c`)와 같다 | 없음 |
| B7 | 미리보기 테스트 #11 의 열 순서를 바꿨다(Expression 열이 seq 1, 표면등급 열이 seq 2). 행 1 은 판정 불가 셀 **뒤에** 확정 거짓 셀이 온다 | 설계 그대로(앞 셀이 거짓)면 I37 변이("판정 불가 셀이 있으면 행 전체 판정 불가")가 빨개지지 않는다. I37 문구("뒤에 확정 거짓 셀이 있으면 행을 거짓으로")에 맞췄다. 행 2 는 여전히 "앞 셀이 참 → 판정 불가 → fallback" 이다 | 건수 같음 |
| B8 | 분석 테스트 #11 에 `NOT_NULL`·`IS_NULL` 짝(겹침 없음) 단언을 더했다 | I30 변이("NOT_NULL 이 NULL 을 덮게")를 붙잡는 사례가 설계 테스트에 없었다 | 건수 같음 |
| B9 | 미리보기 테스트 #12 의 `A` 를 문자열 `"0"` 대신 숫자 `0` 으로, 인터프리터 #15·#16 의 `value`·`A`·`B` 를 `convertForType(…, "NUMBER")` 값으로 넣었다 | 문자열 레코드 값은 식 안에서 문자열이라 `"0" > 1` 이 혼합 타입 대소 비교(폴백)가 된다. 설계 표기의 `"0.5"`·`"1.10"` 은 "원문이 그런 숫자"라는 뜻으로 읽었다 | 없음 |
| B10 | 미리보기에서 판정 불가 셀 **뒤의** 셀이 오류면 미리보기 오류가 아니라 그 행을 판정 불가로 둔다 | 서버는 앞 셀이 참일 때만 그 셀에 닿는다. 화면은 앞 셀 결과를 모르므로 오류를 확정할 수 없다(D11) | 코퍼스·테스트 사례 없음 |
| B11 | 성능: `evaluate` 가 예약 키 검사와 scope 정규화를 한 번의 키 순회로 한다(`checkRecordKeys` 와 같은 결과 — 예약 이름이 먼저, 대소문자만 다른 키는 그 뒤). `plainText` 는 이미 평문 모양이면 바로 돌려준다 | 첫 게이트에서 NFR-1 R2 가 vitest 병렬 부하 속에 100 ms 를 넘은 적이 있다(단독 40 ms). 기준은 바꾸지 않고 구현 비용을 줄였다 | 단독 측정 중앙값 R2 14.2 ms · R3 6.7 ms · BASE_SPD_LKP 18.0 ms · QLTY_GRD_JDG 19.7 ms, 전체 스위트 병렬 중 53.5 · 22.0 · 49.2 · 34.0 ms |
| B12 | 분석에서 Expression 조건 열에도 자리표시 값 영역(string)을 준다 | Expression 열의 NA 셀을 "전체 + NULL" 집합으로 다뤄 겹침·도달 불가 계산에 그대로 넣기 위해서다. Expression 셀은 설계대로 `unknown`(NULL 포함)이다 | 없음 |

**코퍼스 기대값(§6.14 5단계)**: 169건 모두 첫 서버 실행에서 설계 표의 기대값과 같았다. 서버 결과로 바꾼 기대값은 없다. 표본 15건은 docs 표본의 `slot`·`evalTs` 칸까지 그대로 옮겼다.

**테스트 건수**: 백엔드 새 테스트 273건(설계와 같다). 프런트 새 테스트 252건(설계 251 + B1).

**변이 검증 결과**(구현 쪽 변이, 각 변이는 되돌렸다. 덮지 못한 변이는 둘이다)

| I | 변이 | 빨개진 테스트 |
|---|---|---|
| I1 | precision 68 → 34 | 코퍼스 `expr.divide.precision`·`expr.average.rounding`, parity #4 |
| I2 | ROUND HALF_UP | `expr.round.half-even` |
| I3 | modulo FLOOR | `expr.modulo.negative` |
| I4 | 숫자 승격 / 숫자를 원문 문자열로 비교 | `expr.eq.mixed-type` / `expr.eq.number-scale`·`cell.eq.trailing-zero`·`cell.in.number` |
| I5 | NE·NOT_IN 의 NULL 참, LT 의 NULL 예외 | `cell.ne.null`, `cell.not-in.null`, `cell.lt.null` |
| I6 | NA 를 값 있을 때만 참 | `cell.na.null` |
| I7 | `<= 변수 <` 양쪽 닫힘 / `< 변수 <=` 아래 닫힘 | `cell.range.upper-open-boundary`·`cell.range.date-string-upper` / `cell.range.oi.lower` |
| I8 | 단락 제거 / NULL 을 거짓으로 | `expr.and.false-short`·`expr.gen.guard-null` / `expr.or.null-left`·`expr.and.null-left`·`expr.bang.null` |
| I9 | IF 인자 미리 평가 / NULL 조건 오류 | `expr.if.lazy` / `expr.if.null-cond` |
| I10 | NULL 무시 / 첫 NULL 도 오류 | `expr.min.null-later`·`expr.max.null-later` / `expr.min.null-first`·`expr.max.null-first` |
| I11 | `+` 의 NULL 오류 | `expr.null-plus`·`expr.plus-null-right` |
| I12 | 산술 문자열 승격 | `expr.string-times` |
| I13 | decimal.js `pow` 한 번 / 역수 precision 68 / 역수 HALF_EVEN | `expr.power.fraction`·`expr.power.mixed`·`expr.power.negative-scale` / `expr.power.negative-scale` / **덮지 못함**(설계 예상과 같다) |
| I14 | decimal.js `sqrt` | `expr.sqrt`·`expr.sqrt.negative` |
| I15 | 예약 키 검사 제거 | `expr.constant-key`·`cell.constant-key`·`expr.eval-ts-key`·`cell.eval-ts-key`·`expr.reserved-key`·`cell.reserved-key`, interpreter #8·#16 |
| I16 | 누락 키를 NULL 로 | `expr.missing-key` |
| I17 | `localeCompare` | `expr.string-order`·`expr.string-order.digits` |
| I18 | 대소문자 무시 / `%`·`.` 를 와일드카드로 | `cell.contains.case`·`cell.instr.case`·`cell.eq.pattern.prefix-case` / `cell.contains.percent-literal`·`cell.contains.meta-literal`·`cell.instr.meta` 외 4건 |
| I19 | 이스케이프 무시 / 앵커 제거 | `cell.eq.pattern.escaped-percent`·`…escaped-underscore`·`…backslash` / `cell.eq.pattern-regex.full-match`·`expr.str-matches.full` |
| I20 | CODE_IN 집합 없으면 false | `cell.code-in.no-set` |
| I21 | MASTER_AT 허용 / MASTER 무조건 허용 | interpreter #2 / interpreter #3·`expr.master.data-fallback` |
| I22 | BASE 에 LOG / MASTER 최대 5 | parity #1·#5 / parity #2 |
| I23 | 계산 숫자를 `toFixed` 로 / 혼합 비교를 문자열 비교로 | `expr.concat.computed-scale`·interpreter #11 / `expr.compare.mixed-type`·interpreter #12 |
| I24 | 산술 오류를 폴백으로(허용 목록 밖 폴백) | `expr.string-times`·`expr.null-times` |
| I25 | 원문 표 끄기 | `expr.str-upper.literal-scale`·`expr.concat.record-scale`·`expr.null-plus`·`expr.plus-null-right` |
| I26 | STRING→NUMBER 금지 / NUMBER→STRING 거부 / BOOLEAN 이 `Y` 수용 | `cell.type.number-from-string` / `cell.type.string-from-number` / `cell.type.bool-from-string` |
| I27 | 조건 열 이름순 / 결과 변수 제외 제거 | input-contract #1·#13 / #13 |
| I28 | 행 rowId 순 / 구분자 `,` | input-contract #2·#3 / #2·#13 |
| I29 | `==` 필수 / COALESCE 앞 인자 필수 / IF 가드 무시 / `&&` 가드 무시 / INSTR 늘 필수 / MIN 선택 | #7 외 4건 / #5·#8 / #9 / #10 / #11 / #12 |
| I30 | NOT_NULL 이 NULL 을 덮게 / 가드 셀(NE·반직선)이 NULL 을 덮게 | analysis #11(B8) / #5·#7·#11·#18·#21 |
| I31 | 한 열만 교차해도 겹침 / UNIQUE 를 WARNING | analysis #7·#12·#18·#20 / #8·#10·#13·#19·#21 |
| I32 | 접두 패턴 닫힌 구간 / CONTAINS 점 집합 | analysis #13 / #14 |
| I33 | 격자 무시 / 바깥 반직선 보고 / 끝점 반올림 | analysis #3 / #4 외 11건 / #3 |
| I34 | NULL 빈틈 행마다 / Expression 열 포함 | analysis #1·#20 외 / #15 |
| I35 | FIRST 제한 제거 / 합집합 무시 | analysis #10·#13·#19 / #18 |
| I36 | FIRST 계속 평가 / UNIQUE 오류 제거 | preview #1·#5 / #4 |
| I37 | 판정 불가 셀이 있으면 행 전체 판정 불가 | preview #11(B7) |
| I38 | 식: 평가마다 캐시 없이 build + 20 µs 바쁜 대기 / 미리보기: 레코드마다 20 µs 바쁜 대기 | perf R2·R3 / perf BASE_SPD_LKP·QLTY_GRD_JDG |
| I39 | 사본 추가 / Vitest 경로를 사본으로 | 메타 `m-mdm 안에 코퍼스 사본이 없고…` |
| I40 | 사례 ast 리터럴 변경 / 식 텍스트만 변경 | JUnit `식_사례의_AST_가…[expr.decimal.no-double]` / 같은 테스트와 서버 평가의 `expr.round.half-even-odd` |
| I41 | `.` 이스케이프 제거 / 단순형 판정 제거 / 홀로 선 `\` 수용 / STR_CONTAINS 사용 / patternRegex 다름 | oracle #8 / oracle #7·#8 / oracle #8 / oracle #10·#14·`cell.contains.case` / `서버_평가가…[cell.eq.pattern-regex]` |
| I42 | 하네스 precision 34 | `하네스_설정값이…`·`expr.divide.precision`·`expr.average.rounding`·`expr.sqrt`·`expr.power.negative-scale` |
| I43 | 루트 배럴 재수출 / exports 제거 / tsup entry 제거 | entry #1 / entry #1 / entry #2 |
| I44 | (자동 테스트로 덮지 못함, 설계 예상과 같다) | `/usr/bin/git diff 955cef1 -- <엔진 main·build.gradle·arch·contract·expr test·m-mdm src/index.ts·src/contract·docs/mdm/engine-contract·pnpm-workspace.yaml·decisions.md>` 가 비어 있음을 확인했다. `origin/dev`(9a00856) 는 TSK-04-01 머지로 앞서 있지만 엔진·m-mdm·lockfile 은 건드리지 않았다 |

---

## 담당자 확인 필요 결정

### D1 — 분석·입력 계약·미리보기를 어디에 구현하는가(Java `engine.rule` 인가 TS 인가)
- **질문**: 06 원문은 엔진 모듈 `engine.rule` 에 "겹침·빈틈 계산용 값 집합 변환, 입력 계약 계산"을 둔다. 이 Task 에서 Java 로도 구현할 것인가, TS(m-mdm evalex 모듈)에만 둘 것인가?
- **확인한 원문(인용)**:
  - 06:458 패키지표 `kr.dongkuk.maru.mdm.engine.rule` 행: "의사결정표 모델, 적중 정책, 기본 행, 룰 세트, op-code 셀 → EvalEx 식 생성기, **겹침·빈틈 계산용 값 집합 변환, 입력 계약 계산**, 정의 조회 입구".
  - 06:268 「언제 만들고 무엇을 저장하는가」 배포 스냅샷 조립 행: "서버가 셀마다 식 텍스트를 한 번 만든다. **입력 계약도 여기서 계산한다**".
  - 보조: workrule 5절 "일반 조건 구간 겹침·빈틈·미완성 … **화면 JS 즉시(십진 라이브러리) + 저장 시 서버 재검증**", wbs.md:1829 "TSK-08-04 … 저장 시 검사가 op-code 생성기·**겹침 분석**을 … 쓴다".
  - 반대로 PRD FR-E2·FR-E3·AC-3, TRD, evalex-guide §8 에는 "이 분석·계약을 Java 엔진에서 이 Task 가 한다"고 못 박은 문장이 없다. spec 의 entry-point 는 "`@dk-oasis/m-mdm` evalex 모듈(화면 없음)"이다.
- **선택지**: (a) TS 에만 구현하고 Java 이식은 뒤 Task 로 넘긴다 / (b) Java `engine.rule` 에도 구현한다(`ContractOnlyPhaseTest` 를 지우거나 고쳐야 한다) / (c) Java 구현을 engine test 소스에 두고 나중에 main 으로 옮긴다
- **택한 것**: (a)
- **근거**: spec 본문의 entry-point 가 m-mdm evalex 모듈이다(가장 강한 근거). (b) 는 임시 폐쇄 테스트를 깨뜨리거나 지워야 하는데, 팀장 지시로 그 삭제는 TSK-03-02 몫이고 이 Task 의 게이트는 신규 실패 0건이다. (c) 는 제품 코드를 test 소스에 두는 것이라 소비자(TSK-08-04 서버 저장 검사)가 쓸 수 없고, 옮길 때 다시 검증해야 한다. 06 원문의 Java 배치는 지키지 못하므로 이 항목으로 드러낸다.
- **반려되면 재작업 방향**: TSK-03-02 가 `ContractOnlyPhaseTest` 를 지운 뒤, `value-set.ts`·`rule-analysis.ts`·`null-safety.ts`·`input-contract.ts` 의 알고리즘(§6.7·§6.8)을 `engine.rule` 의 Java 클래스로 이식한다. 분석·계약 골든(`evalex-rule-analysis.test.ts`·`evalex-input-contract.test.ts` 의 입력 룰과 기대 이슈·계약)을 엔진 test resources 에 JSON 한 벌(`R/analysis/analysis-corpus.json`)로 옮기고, JUnit 과 Vitest 러너가 그 파일을 함께 읽게 한다. 스키마에 분석 결과 정의가 필요하면 그 Task 가 스키마를 올린다.

### D2 — JUnit 러너의 EvalEx 설정을 어디서 만드는가
- **질문**: 서버 쪽 정식 설정 팩토리 `MdmExpressionConfig.create` 는 UOE 이고(TSK-03-02 몫), 스캐폴드 `ExpressionEvaluator` 는 기본 설정을 쓴다. 코퍼스를 서버 쪽에서 무엇으로 평가할 것인가?
- **선택지**: (a) test 안에서 계약 상수(`MdmExpressionConfig` 상수·`FunctionSets.BASE`)로 `ExpressionConfiguration` 을 조립하고, 교체 지점을 `CorpusEvalExHarness.configuration` 한 메서드로 모은다 / (b) 스캐폴드 `ExpressionEvaluator`(기본 설정)로 평가한다 / (c) TSK-03-02 가 끝날 때까지 JUnit 러너를 비활성으로 둔다
- **택한 것**: (a)
- **근거**: spec 요구사항과 수용 기준 "코퍼스 불일치 0건"은 서버 쪽 실행을 요구한다((c) 탈락). 기본 설정은 `allowOverwriteConstants=true`·JVM 기본 시간대·전체 함수 사전이라 계약과 다르다((b) 탈락). (a) 는 값을 손으로 다시 적지 않고 TSK-03-01 이 테스트로 고정한 상수를 그대로 읽으므로 어긋날 자리가 없다(`CorpusHarnessTest` 가 확인한다).
- **반려되면 재작업 방향**: TSK-03-02 가 `MdmExpressionConfig.create(EngineLookups)` 를 구현하면 `configuration` 몸체를 `MdmExpressionConfig.create(new EngineLookups(…codeSets 로 합성한 CodeLookup·CodeEffLookup, MasterLookup.NONE…))` 한 줄로 바꾸고 `CorpusFunctions` 를 지운다. 합성 규칙은 engine-contract §11(헤더 INUSE, RELEASED 1.000 한 버전, ITEM 행)을 따른다. `CorpusHarnessTest` 의 사전 검사는 `STANDARD` 기준으로 바꾼다.

### D3 — 셀 사례의 서버 텍스트와 커스텀 함수를 무엇으로 만드는가, 담지 못하는 필수 사례는 어떻게 하는가
- **질문**: 스키마 `CellCase` 에는 서버 생성 텍스트 칸이 없고(F8), op-code 생성기는 TSK-03-03, `INSTR`·`MASTER` 구현은 TSK-03-02 몫이다. 서버 러너가 셀 사례와 MDM 함수 사례를 어떻게 평가할 것인가? 식 변수·`MASTER_AT` 사례는 어떻게 할 것인가?
- **선택지**: (a) 06 「EvalEx 생성 규칙」을 옮긴 test 전용 오라클 `CellTextOracle` 과 대역 함수 `InstrStandIn`·`MasterStandIn` 을 두고 모두 평가한다. `MASTER_AT`·`attr`·식 변수 사례는 코퍼스에서 빼고 대응표에 담당 Task 를 적는다 / (b) 셀 사례와 MDM 함수 사례는 JUnit 에서 건너뛰고(Assumptions) 실물이 생기면 켠다 / (c) 스키마에 `text` 칸을 더해 사례마다 생성 텍스트를 손으로 싣는다
- **택한 것**: (a)
- **근거**: 06:284 는 op-code 셀을 "서버와 화면이 진짜로 다른 코드를 도는 유일한 자리"라 코퍼스가 필수라고 적는다. (b) 는 그 자리를 서버 쪽에서 비워 둔다. (c) 는 스키마를 고치게 되는데 팀장 제약상 스키마는 손대지 않는다. 오라클은 06 표를 그대로 옮긴 것이고, 오라클 골든 14건과 "생성 함수 ⊆ `GENERATED`" 검사로 고정된다. 대역 함수의 의미는 06:160·EG 8.4 와 engine-contract §7·§11 에 적힌 대로다.
- **반려되면 재작업 방향**: (b) 면 `CorpusConformanceTest` 에서 cell 사례와 `INSTR`·`MASTER` 를 쓰는 expr 사례에 `Assumptions.abort("TSK-03-02/03 대기")` 를 걸고, 건너뛴 id 목록을 테스트 상수로 고정해 건수를 보고한다. `CellTextOracle`·`CorpusFunctions` 는 지운다. TSK-03-03 이 생성기를 넣으면 오라클 자리를 `engine.rule` 생성기 호출로 바꾸고, 오라클 골든 14건은 생성기 회귀 테스트로 옮긴다. 식 변수 사례는 TSK-03-03 이 스키마 `CellCase.variable` 에 `exprText`·`exprAst`·`refVars` 를 더할 때 넣는다.

### D4 — 화면 폴백을 정적 판정(`isSupported`)에만 한정할 것인가
- **질문**: 스키마 `Expect.screenFallback` 설명은 "화면은 isSupported=false 로 폴백"(정적)만 말한다(F9). 그런데 서버의 숫자 → 문자열 변환은 BigDecimal 스케일을 따르고(`"" + (0.1 * 10)` = `"1.0"`), 혼합 타입 대소 비교는 이상한 규칙을 따른다(`1 < "2"` = false). decimal.js 로는 연산 결과의 스케일을 알 수 없고, 두 경우 모두 AST 만 보고는 가려낼 수 없다. 화면은 어떻게 할 것인가?
- **선택지**: (a) 평가 중에 재현할 수 없는 자리를 만나면 `FallbackSignal` 로 서버 폴백한다(런타임 폴백). 코퍼스 `screenFallback: true` 를 "정적 또는 런타임 폴백"으로 읽고, 허용 사례를 id 목록 4건으로 고정하며, 목록 밖의 폴백은 실패로 본다 / (b) 스케일을 추적하는 숫자 표현을 직접 만들어 서버와 같은 문자열을 낸다 / (c) 알려진 차이로 문서에만 적고 화면은 decimal.js 문자열을 쓴다
- **택한 것**: (a)
- **근거**: PRD AC-3 과 EG 8.5 3항은 "다를 때는 서버가 기준"이고 화면은 즉시 피드백용이다. 틀린 값을 보이는 (c) 는 불일치를 숨긴다. (b) 는 곱셈·나눗셈·거듭제곱의 BigDecimal 스케일 규칙을 모두 다시 구현하는 일이라 비용과 위험이 크고, 실무 식(비교·범위·단위 검사)은 이 자리를 거의 지나지 않는다. (a) 는 리터럴·레코드 값·`ROUND` 결과의 원문은 정확히 재현하고(코퍼스 #74-76), 나머지만 폴백한다. 허용 목록을 고정하므로 폴백이 불일치를 숨기는 통로가 되지 않는다.
- **반려되면 재작업 방향**: (b) 면 `decimal.ts` 에 `{ d: Decimal, scale: number }` 값 표현을 두고 연산마다 BigDecimal 선호 스케일 규칙(덧셈 max, 곱셈 합, 나눗셈 `mc` 결과 스케일)을 구현한 뒤 `expr.concat.computed-scale` 의 `screenFallback` 을 지우고 허용 목록을 3건으로 줄인다. (c) 면 두 사례를 코퍼스에서 빼고, 인터프리터는 폴백 대신 `toFixed()`·문자열 비교를 쓰며, design 에 알려진 차이를 적는다.

### D5 — 빈틈을 어디까지 보고하고 값 집합을 어떻게 모델링하는가
- **질문**: 06:364 는 "값 구간 빈틈은 Number 열만 보고 소수 자리수 격자로 판정한다"만 정한다. 바깥 반직선(최소값 아래·최대값 위), 다축 표, scale 이 없는 열, 이산 값(일자·불린)을 어떻게 다룰 것인가?
- **선택지**: (a) 내부 빈틈(양 끝이 유한한 여집합 구간)만 보고한다. 다축은 나머지 조건 셀이 같은 행끼리 묶는다(workrule 5절). scale 이 없으면 그 열 리터럴의 최대 소수 자리수를 쓴다. NULL 빈틈은 열 단위로 본다. 겹침은 NUMBER 를 연속으로, 일자 String·불린은 정수 이산으로 본다 / (b) 바깥 반직선도 빈틈으로 보고한다 / (c) 다축 전체 조합 공간에서 빈 상자를 모두 찾는다
- **택한 것**: (a)
- **근거**: 도메인 범위(최소·최대)는 검증식 안에 있어 정적으로 알 수 없으므로 바깥 반직선은 거의 모든 표에서 경고가 되어 소음이 된다((b)). workrule 5절이 "같은 폭 구간 안에서 두께 구간이 연속인지"를 검사 대상으로 적어 내부 연속성이 의도임을 보인다. (c) 는 06:364 가 말한 "사람이 읽기 좋게 묶는 방법"을 넘고 조합이 폭발한다. NULL 빈틈 열 단위는 06:354 "둘 다 없는 열에서는 NULL이 늘 빈틈"과 그대로 같다. NUMBER 겹침을 연속으로 보는 것은 UNIQUE 판정을 보수적으로(겹침을 놓치지 않게) 두기 위해서다. 레코드 값의 소수 자리는 도메인 검증이 막지만 엔진은 강제하지 않는다. 일자·불린은 06:127 이 값 모양을 고정하므로 이산이 정확하다.
- **반려되면 재작업 방향**: (b) 면 VALUE_GAP 에 `lower`·`upper` 한쪽이 없는 이슈(`lower: undefined` 는 아래로 열림)를 더하고 분석 테스트 #4 를 반대 기대로, #1·#2·#3·#20 기대 목록에 바깥 빈틈을 더한다. (c) 면 `rule-analysis.ts` 에 상자 차집합 알고리즘(도달 불가의 `covered` 를 뒤집은 것)을 더하고 빈틈 이슈에 열마다의 구간 튜플을 싣는다.

### D6 — NFR-1 "1만 행 평가 100 ms"를 무엇으로 재는가
- **질문**: "1만 행"이 1만 레코드 × 식 1개인지, 1만 행짜리 결정표인지, 그리고 측정 통계를 무엇으로 할 것인가?
- **선택지**: (a) 1만 레코드 × 식 1개(R2·R3) + 1만 레코드 × 룰 1개 미리보기(BASE_SPD_LKP·QLTY_GRD_JDG), 입력 문자열 변환 포함, 워밍업 3회 뒤 5회 측정의 중앙값 < 100 ms / (b) 한 번 측정 < 100 ms / (c) 1만 행 결정표 하나를 레코드 1개로 판정
- **택한 것**: (a)
- **근거**: PRD NFR-1 은 "화면 AST 평가 1건 0.3~2.7µs, 1만 행 판정 100 ms 이내(02 「실행 지점」)"이고 02 「실행 지점」은 "1만 행 일괄 검증도 수십 ms"라 적는다. TRD 는 "화면 AST 평가 1만 행 100 ms 이내"다. 모두 그리드 레코드 1만 개를 뜻한다((c) 탈락). spec 이 "적중 정책 즉시 미리보기"를 요구하므로 룰 미리보기도 같은 기준으로 잰다. vitest 는 파일을 병렬로 돌리고 같은 게이트에서 prettier 생성 테스트가 CPU 를 쓰므로 한 번 측정은 흔들린다((b)). 중앙값은 기준(100 ms)을 완화하지 않고 측정 잡음만 줄인다. 변환 시간을 넣는 것은 실제 그리드 사용(문자열 입력)과 같게 하려는 것이다.
- **반려되면 재작업 방향**: (b) 면 측정 1회 값을 단언하고, 흔들림이 보이면 `evalex-perf.test.ts` 를 `describe.sequential` 로 묶고 m-mdm `test` 스크립트를 바꾸지 않는 선에서 파일 첫머리에서 워밍업을 늘린다. 최댓값 기준을 원하면 5회 최댓값 < 100 ms 로 바꾼다. (c) 면 1만 행 UNIQUE 표를 만들어 레코드 1개 미리보기를 재는 테스트를 더한다.

### D7 — evalex 모듈을 어떤 경로로 공개하는가
- **질문**: entry-point 는 "`@dk-oasis/m-mdm` evalex 모듈"이다. 루트 배럴(`src/index.ts`)에 재수출할 것인가, 서브패스로 공개할 것인가?
- **선택지**: (a) 서브패스 `@dk-oasis/m-mdm/evalex`(tsup entry `evalex/index` + `package.json` exports), 루트 배럴은 타입 전용 유지 / (b) 루트 배럴에 `export * from "./evalex"` / (c) 별도 패키지 `@dk-oasis/evalex`
- **택한 것**: (a)
- **근거**: 루트 배럴 머리 주석이 "런타임 코드 없음. 화면 컴포넌트는 pages/* 서브패스로 로드(배럴 경유 금지 — 번들 분리 유지, m-mls/m-mqc 관례)"라 적는다(리포 관례). (b) 는 decimal.js 를 루트 배럴 번들에 끌어들여 그 주석과 TSK-03-01 §3.3 번들 확인("dist/index.js 런타임 코드 0줄")을 거스른다. (c) 는 entry-point 가 m-mdm 이라는 spec 과 다르다. 기존 테스트 두 개는 새 entry 에 걸리지 않는다(F11).
- **반려되면 재작업 방향**: (b) 면 `src/index.ts` 에 `export * from "./evalex";` 를 더하고 머리 주석을 고치며, `tsup.config.ts`·`package.json` exports 변경을 되돌리고 `evalex-entry.test.ts` 를 "루트 배럴이 evalex 를 재수출한다" 검사로 바꾼다. (c) 는 `src/frontend/pnpm-workspace.yaml` 에 패키지를 더해야 하므로 별도 Task 로 넘긴다.

### D8 — 입력 계약의 필수·선택 판정 세부 규칙
- **질문**: 06:208 은 "사칙연산과 ROUND·MIN·MAX·ABS·문자열 함수의 인자처럼 NULL이면 평가가 실패하는 자리 → 필수, COALESCE 의 마지막이 아닌 인자·`IF(X != NULL, …)` 가지 안의 X·`== NULL`·`!= NULL` 비교에만 쓰인 변수 → 선택, 애매하면 필수"라고만 적는다. 원문이 직접 다루지 않는 자리를 어떻게 판정할 것인가?
- **선택지**: (a) §6.7 표: `==`·`!=` 피연산자는 NULL 과 견줘도 실패하지 않으므로(실측) 값과 견주는 경우까지 선택, `+` 는 문자열 연결로 실패하지 않지만 06 이 사칙연산을 필수로 적었으므로 필수, 식 뿌리의 맨 변수와 `MIN` 은 필수, `INSTR`·`COALESCE` 마지막 인자·`IF`·`SWITCH` 결과는 바깥 문맥을 물려받음, `&&`·`||` 왼쪽의 NULL 검사도 가드로 인정, `STR_CONTAINS`·`MASTER` key 는 선택, 결과 열 그룹은 열들의 합집합 / (b) `== NULL`·`!= NULL` 리터럴 비교만 선택으로 보고 나머지는 모두 필수 / (c) 함수 표 없이 변수가 한 번이라도 연산자 밑에 있으면 필수
- **택한 것**: (a)
- **근거**: 06:208 의 기준 문장은 "NULL 이 들어오면 식이 깨지는지"이고 예시는 "처럼"으로 열거한 것이다. 실측(§0.2)으로 깨지지 않음이 확인된 자리는 애매하지 않다. engine-contract §5 표(`STR_CONTAINS` 선택, `INSTR` "바깥 연산으로 판정", `MASTER` key 선택, `MIN` 필수)를 그대로 따랐다. `+` 만은 실측과 달리 06 원문 "사칙연산"을 따른다(원문이 더 구체적이다). 06:208 "함수마다 인자가 NULL을 받는지는 함수 화이트리스트에 함께 적는다"에 맞춰 정책을 함수 표(`functions.ts`)에 둔다.
- **반려되면 재작업 방향**: (b) 면 `nullSafety` 에서 `==`·`!=` 의 SAFE 를 "상대가 `NULL` 상수일 때만"으로 좁히고 input-contract #7·#8 의 기대를 필수로 바꾼다. `+` 를 선택으로 바꾸라는 판단이면 INFIX 표에서 `+` 만 SAFE 로 옮기고 #6 에 `A + "x"` 사례를 더한다. 결과 열 그룹을 교집합으로 보라는 판단이면 §6.7 2단계를 바꾸고 #13 을 고친다.

### D9 — 병렬 형제 TSK-03-03 과 규칙이 겹치는 자리를 어떻게 맞추는가
- **질문**: 03-03(미머지)은 op-code 셀 → 텍스트 생성기 `CellTextGenerator`, 값 변환 `ValueConverter`, 예약 키 `RecordKeys`, 셀 요약 `CellSummary` 를 `engine.rule` 에 둔다. 이 Task 의 서버 러너·화면 평가기·입력 계약과 규칙이 겹친다. 03-03 코드 없이 어떻게 맞추는가?
- **확인한 것**: 03-03 설계를 로컬 브랜치 `agent/e1205c87-rule-engine`(69f1a03)에서 읽었다(원격 `origin/agent/*` 는 없다). §6.1 시그니처(F21), §6.11 패턴 규칙(F22), §6.7·§6.8·§6.2 값 변환·키·조건 셀 판정(F23), §6.12 셀 요약(F24)을 인용했다. 03-03 D15 는 "03-04 가 다른 규칙을 이미 구현했다면 코퍼스로 맞춰 보고 서버(이 생성기)를 기준으로 한다"고 적었다.
- **선택지**: (a) 03-03 규칙을 기준으로 이 설계를 맞추고, test 안의 거울(`CellTextOracle`·`CorpusEvalExHarness.toDeclared`)과 TS 구현으로 따라 한다. 03-03 코드를 부르는 부분은 머지 뒤 후속(§6.15)으로 미룬다 / (b) 이 Task 의 처음 규칙을 유지하고 차이는 머지 때 코퍼스로 푼다 / (c) 03-03 머지를 기다린다
- **택한 것**: (a). 처음 설계에서 바꾼 것은 넷이다. ① 셀 값 변환: STRING 변수가 숫자를 평문 문자열로 받고(`cell.type.string-from-number` 기대가 오류에서 F 로 바뀐다), BOOLEAN 변수가 `TRUE`/`FALSE` 문자열을 받고, NUMBER 변수가 지수형 문자열을 받는다. ② `=` 패턴: 홀로 선 `\`·`%` 단독·접은 뒤 `%` 4 개 이상을 거부한다. ③ 대소문자만 다른 레코드 키를 `RESERVED_KEY` 로 거부하고, 미리보기의 입력 계약 키 검사는 정확 일치로 한다. ④ Expression 조건 셀 결과가 불린이 아니면 `EVALUATION_ERROR` 다. 셀 요약은 `CellSummary.of` 를 옮기고 열 이름만 붙인다. 테스트 건수는 바뀌지 않는다.
- **근거**: 서버가 기준이다(EG 8.5 2항, PRD AC-3). 머지 뒤 서버 쪽 텍스트·변환은 03-03 코드가 만든다. 지금 다른 규칙으로 코퍼스를 짜면 머지 때 코퍼스 기대값이 흔들린다((b)). (c) 는 병렬 일정을 막는다. 03-03 도 미승인 선행이라 근거 순위는 가장 낮지만, 두 설계가 06 원문(06:156-160·199·248)과 같은 방향이고 06 이 정하지 않은 가장자리만 03-03 쪽 결정을 따랐다.
- **반려되면 재작업 방향**: (b) 면 §6.2 변환 표·§6.5 패턴 거부·`checkRecordKeys` 중복 키 규칙을 처음 설계로 되돌리고 `cell.type.string-from-number` 기대를 TYPE_CONVERSION 으로 되돌린다. 차이는 03-03 머지 뒤 P1·P3 에서 코퍼스가 드러내고, 그때 어느 쪽을 고칠지 다시 정한다. 03-03 설계가 머지 전에 바뀌면 이 절과 §0.3 을 다시 맞춘다.

### D10 — 함수의 숫자 인자가 문자열·불린이면 화면은 무엇을 하는가 (Build 추가)
- **질문**: 설계 §6.3 의 `num(v)` 는 숫자가 아니면 오류다. 그런데 EvalEx 함수(`ABS`·`ROUND`·`SUM`·`STR_LEFT` 의 길이 등)는 인자를 `getNumberValue()` 로 꺼내고, 이 메서드는 문자열을 `Boolean.parseBoolean` 결과(1/0)로, 불린을 1/0 으로 바꾼다(`javap -c` 확인). 화면은 이 자리에서 무엇을 해야 하는가?
- **선택지**: (a) 폴백한다 / (b) 설계대로 오류 / (c) 서버의 1/0 변환을 재현한다
- **택한 것**: (a). 연산자(`- * / % ^`, 단항)는 서버도 오류를 내므로 설계대로 오류다. NULL 인자는 서버에서 NPE 라 오류다.
- **근거**: (b) 는 서버와 다른 결과(오류 대 값)를 낸다. (c) 는 서버의 비의도적 동작을 화면이 굳히는 일이고, D4 가 정한 "재현할 수 없거나 재현하면 안 되는 자리는 폴백" 원칙에 맞지 않는다. 폴백은 서버 미리보기로 넘어가므로 결과는 늘 서버와 같다.
- **반려되면 재작업 방향**: (b) 면 `functions.ts` 의 `numArg`·`minMax` 에서 `FallbackSignal` 을 `err` 로 바꾸고, 코퍼스에 `ABS("2")` 사례를 서버 값(0)과 함께 넣어 화면이 다르다는 것을 `screenFallback` 없이 드러낸다(그러면 코퍼스가 빨개지므로 (c) 로 가야 한다). (c) 면 `numArg` 에 `getNumberValue` 변환표를 옮기고 코퍼스 사례를 더한다.

### D11 — 미리보기에서 판정 불가 셀 뒤의 셀이 오류일 때 (Build 추가)
- **질문**: 한 행에서 판정 불가(폴백) 셀 뒤의 셀이 평가 오류를 내면 미리보기 전체를 오류로 볼 것인가?
- **선택지**: (a) 그 행을 판정 불가로 둔다 / (b) 미리보기 오류로 둔다
- **택한 것**: (a)
- **근거**: 서버는 조건 셀을 AND 로 평가해 앞 셀이 참일 때만 뒤 셀에 닿는다. 앞 셀 결과를 모르는 화면이 오류를 확정하면, 앞 셀이 실제로 거짓인 경우 서버와 다른 결과(오류 대 거짓)를 보인다.
- **반려되면 재작업 방향**: `rule-preview.ts` `evalCell` 의 `afterUndetermined` 분기를 지우고 오류를 그대로 돌려준다.

### D12 — TS 테스트의 AST 출처 (Build 추가)
- **질문**: TS 단위 테스트(인터프리터·입력 계약·분석·미리보기·성능)는 식 텍스트에서 AST 를 얻어야 하는데 설계가 출처를 정하지 않았다. 어디서 얻을 것인가?
- **선택지**: (a) 테스트 전용 파서를 두고 코퍼스 서버 AST 로 검증한다 / (b) Java 로 AST 를 뽑아 JSON 고정물로 둔다 / (c) 테스트마다 AST 를 손으로 적는다
- **택한 것**: (a)(§8 B1)
- **근거**: (b) 는 식을 바꿀 때마다 Java 로 다시 뽑아야 하고 고정물이 사본이 된다. (c) 는 틀리기 쉽고 설계 §6.14 4단계("AST 를 손으로 쓰지 않는다")의 취지와 어긋난다. (a) 의 파서는 코퍼스 82건의 서버 AST 와 같음이 테스트로 고정된다.
- **반려되면 재작업 방향**: (b) 면 `M/tests/fixtures/` 에 식 → AST JSON 을 두고(파일 이름은 `*corpus*.json` 을 피한다) `parse-expr.ts`·`evalex-test-parser.test.ts` 를 지운다. 프런트 테스트 수는 1건 줄어든다.

---

## 9. Verify 결과

**2026-09-24 재검증(sonnet 승격, 마지막 재시도)**이 직전 기록을 교체한다. 직전 기록(커밋 a597fdb)은 변이 검증 22항목 중 4건만 했고, NFR-1 을 수치 없이 적었으며, B7·B8·B9 판정이 §8 의 실제 이탈 내용과 다른 것을 서술한 부실 기록이었다. 이번에는 전체 스위트 3회 실행, 수용 기준 4항목을 실제 테스트 코드·06 원문(심링크 `docs/mdm/design`, `sed`로 직접 읽었다)과 대조, 지정된 22항목 전부에 변이를 넣어 빨강을 확인한 뒤 되돌렸다. 조언(advisor) 검토를 한 차례 거쳐 I44 확인 누락·성능 계열 빨강의 오귀인·§8 과 같은 변이 재사용을 바로잡았다(아래 각 절에 반영).

### 게이트 결과

게이트 명령을 오케스트레이터 지시대로 각각 실행했다(백엔드는 `--rerun-tasks`, 프런트는 `build:libs` → `test` → `lint` 순).

| 항목 | 기준선(Build 전) | Build 후(이번 재확인) | 상태 |
|---|---|---|---|
| 백엔드 `testAll` 테스트 수 | 518 | 791 | ✓ |
| 백엔드 `testAll` 실패 | 0 | 0 | ✓ Pass(BUILD SUCCESSFUL) |
| 프런트 m-mdm `pnpm build:libs` | — | 성공 | ✓ `dist/evalex/index.js`(62.00 KB)·`dist/evalex/index.d.ts`(7.66 KB) 산출 확인 |
| 프런트 m-mdm 테스트 수 | 6 | 258 | ✓ |
| 프런트 m-mdm 테스트 실패 | 0 | 0 | ✓ |
| 프런트 m-mdm lint(`tsc --noEmit`) | Pass | Pass | ✓ 출력 없음(통과) |

건수 산식과도 일치한다: 백엔드 518+273=791(273 = 169+82+1+4+14+3, §3.4), 프런트 6+252=258(252 = 251(§3.4) + 1(B1 파서 검증 테스트)). 모두 재현했다(백엔드 `python3` 집계 스크립트로 `**/build/test-results/**/*.xml` 합산, 프런트는 `vitest run` 콘솔 `Tests 258 passed (258)`).

### 수용 기준 판정 (§4)

각 항목을 실제 테스트 파일을 읽어 근거 테스트와 그 안의 값이 설계·06 원문과 글자까지 같은지 대조했다.

| 수용 기준 | 근거 테스트(파일:함수) | 대조 결과 | 판정 |
|---|---|---|---|
| ① 06 「저장 시 검사」 겹침·빈틈 예시 통과 | `M/tests/evalex-rule-analysis.test.ts:47-50` `"06 저장 시 검사 예: 2.50 이 빈틈이고 NULL 빈틈은 따로 보인다"` | `sed -n '340,366p' docs/mdm/design/basic/06-business-rule.md`(심링크, `sed`로 직접 읽었다 — F1 대로 `grep -r`은 못 찾는다)로 06 원문을 확인했다. 원문(06:364 부근): "소수 자리수 2인 두께 열에서 `1.6 <= 변수 < 2.5` 다음이 `2.5 < 변수 <= 3.0`이면 2.50이 빈틈이다." 테스트의 두께 열(scale 2) 행 1 `<= 변수 < 1.6 2.5`, 행 2 `< 변수 <= 2.5 3.0`은 이 원문과 글자까지 같다. 기대 `[VALUE_GAP(rowIds[1,2], "2.50", "2.50"), NULL_GAP]`과 실제 이슈 목록 전체가 일치(`toEqual`, 부분 포함 아님) | ✓ 통과 |
| ② 입력 계약이 PROD_WGT_CALC 행별 계약과 일치 | `M/tests/evalex-input-contract.test.ts:13-49` #1~#4 | `sed -n '200,232p' docs/mdm/design/basic/06-business-rule.md`로 06 원문의 「호출하는 쪽에 주는 계약」 JSON 예시를 직접 읽었다: `{"always": ["PROD_TYPE", "CALC_BASIS"], "rows": [{"row": 1, "cond": "PROD_TYPE = COIL · CALC_BASIS = LEN", "required": ["COIL_THK","COIL_WID","COIL_LEN","SPEC_GRAV"], "optional": []}, {"row": 3, ...DIA... "required": ["COIL_WID","COIL_OUT_DIA","COIL_IN_DIA","COIL_VOID_RT","SPEC_GRAV"]}, {"row": 2, ...SHEET... "required": ["COIL_THK","COIL_WID","SHEET_LEN","SHEET_CNT","SPEC_GRAV"]}]}`. 테스트의 `always`·행 순서 `[1,3,2]`·`cond` 3개 문자열·행별 `required` 집합·`optional=[]`가 이 원문 JSON 과 값 하나하나 같다(정렬 비교이므로 원문 required 배열 순서와 달라도 집합은 같다) | ✓ 통과 |
| ③ 코퍼스 불일치 0건 | `R/corpus/engine-corpus.json`(정본), `T/corpus/CorpusConformanceTest.java`, `M/tests/evalex-corpus.test.ts` | 코퍼스 169건(cell 87 + expr 82) 확인(`python3 json.load` 집계). `find`로 `src/frontend/m-mdm`(node_modules·dist 제외) 안에 `*corpus*.json` 이 0개임을 확인 — 사본 없음. `CorpusConformanceTest.java:34` `CORPUS_RESOURCE`와 `M/tests/helpers/engine-paths.ts`의 `CORPUS_PATH`가 같은 엔진 test resources 파일을 가리킨다. `evalex-corpus.test.ts:16-21` `ALLOWED_FALLBACK_IDS` 4건(`cell.code-in.no-set`, `expr.master.data-fallback`, `expr.concat.computed-scale`, `expr.compare.mixed-type`)이 코퍼스의 `screenFallback:true` 4건 id 집합과 정확히 일치. 두 러너 모두 전 항목 통과(백엔드 273건 중 코퍼스 관련 252건·프런트 172건 포함 전체 0 failures) | ✓ 통과 |
| ④ 1만 행 평가 100 ms 이내(NFR-1) | `M/tests/evalex-perf.test.ts` 4건 | 아래 「NFR-1 성능 측정값」 참조. 3회 전체 스위트 실행에서 12회(4건×3회) 모두 중앙값 < 100 ms | ✓ 통과 |

### NFR-1 성능 측정값

측정 방법: `evalex-perf.test.ts`(비수정, 커밋된 그대로)를 포함한 **m-mdm vitest 전체 스위트**를 3회 실행해 게이트 통과를 확인했다. 매회 `Tests 262 passed (262)`였다 — 262 는 258(정식 258건) + 4(진단용 스크래치 파일 `evalex-perf-scratch` 4건)로, 3회 모두 스크래치 파일을 함께 실행했다(1·2회차만이 아니다, 직전 초안의 오기를 바로잡는다). 이 파일의 `expect(median, message).toBeLessThan(100)`는 실패할 때만 수치 메시지를 보여주므로(통과 시엔 수치가 출력에 안 남는다), 실측 수치를 얻으려고 **같은 측정 로직**(워밍업 3회 → 5회 측정 → 중앙값, `evalex-perf.test.ts`의 `measure` 함수와 완전히 동일)을 스크래치 파일 `M/tests/perf-scratch.test.ts`(3회 실행 후 즉시 삭제, `/usr/bin/git status --short` 로 삭제 확인·커밋 대상 아님)로 재현해 `console.log` 로 출력시켰다. 100 ms 기준은 건드리지 않았다.

| 회차 | 항목 | 중앙값 | 5회 표본 | 5회 최댓값 |
|---|---|---|---|---|
| 1회 | R2 | 37.33 ms | 33.37/40.44/37.33/32.08/39.64 | 40.44 ms |
| 1회 | R3 | 19.69 ms | 19.51/19.69/20.08/19.80/19.11 | 20.08 ms |
| 1회 | BASE_SPD_LKP(UNIQUE 7행) | 47.43 ms | 49.95/53.17/47.43/47.43/47.26 | 53.17 ms |
| 1회 | QLTY_GRD_JDG(FIRST) | 40.10 ms | 34.22/40.10/45.36/38.19/40.66 | 45.36 ms |
| 2회 | R2 | 21.20 ms | 23.67/21.20/18.10/22.35/13.63 | 23.67 ms |
| 2회 | R3 | 8.29 ms | 7.39/10.59/15.27/7.39/8.29 | 15.27 ms |
| 2회 | BASE_SPD_LKP(UNIQUE 7행) | 20.97 ms | 20.30/20.70/20.97/26.22/23.09 | 26.22 ms |
| 2회 | QLTY_GRD_JDG(FIRST) | 20.64 ms | 20.37/20.11/22.83/21.37/20.64 | 22.83 ms |
| 3회 | R2 | 21.26 ms | 23.69/44.37/17.56/21.26/17.21 | 44.37 ms |
| 3회 | R3 | 11.89 ms | 12.71/8.98/8.98/14.11/11.89 | 14.11 ms |
| 3회 | BASE_SPD_LKP(UNIQUE 7행) | 25.97 ms | 28.24/25.97/26.22/24.85/25.21 | 28.24 ms |
| 3회 | QLTY_GRD_JDG(FIRST) | 20.53 ms | 23.19/21.65/20.53/19.98/20.40 | 23.19 ms |

12행(4항목×3회) 모두 중앙값·5회 최댓값 둘 다 100 ms 기준을 크게 밑돈다(최악의 단일 표본도 53.17 ms, 기준의 53%). 1회차가 2·3회차보다 느린 것은 콜드 스타트(vitest 프로세스 시작 직후) 영향으로 보이며, `evalex-perf.test.ts` 자체의 워밍업 3회는 각 `it` 안에서만 도는 것이라 파일 간 콜드 스타트까지는 흡수하지 못한다. 그래도 최댓값 기준으로도 100 ms 를 넘지 않는다.

### 변이 검증 결과 — 지정 22항목 전체 + I44

`/usr/bin/git status --short` 로 시작 상태가 깨끗함을 확인한 뒤, 항목마다 구현 파일을 `Edit` 로 고쳐 해당 쪽 전체 러너(백엔드는 `../gradlew test --no-daemon`, 프런트는 `pnpm --filter @dk-oasis/m-mdm test`)를 돌려 빨강을 확인하고, `/usr/bin/git checkout -- <파일>` 로 되돌린 뒤 다시 `git status --short` 로 상태(=state.json·spec.md 외 깨끗)를 확인했다. §8 Build 변이표와 겹치는 변이를 먼저 넣어 22항목 모두 빨강을 확인한 뒤, 조언에 따라 Build 표와 **다른** 변이를 넣어 독립적으로 재확인했다. 22항목 중 5항목은 다른 변형을 추가하지 않았다: I23·I37·I39 는 변형의 여지가 좁아서(각각 폴백 전환·판정 불가 순서·사본 검출), I18 은 §8 이 이미 두 가지 자연스러운 변형(대소문자 무시·`%`·`.` 를 와일드카드로)을 모두 다뤄 더 다를 변형이 마땅치 않아서, I38 은 강도를 높인 바쁜 루프 자체가 §8 B11 이 쓴 확인 방식과 같은 접근이라 새 변형을 따로 넣지 않았다. 나머지 **17항목**을 2차 표로 독립 재확인했다.

**1차: §8 과 같은 계열의 변이 — 22항목**

| I | 변이(파일:위치) | 빨개진 테스트 | 되돌림 |
|---|---|---|---|
| I1 | `decimal.ts` `precision: 68` → `34` | `evalex-contract-parity.test.ts` Decimal 설정=MdmExpressionConfig.MATH_CONTEXT, `evalex-interpreter.test.ts` "숫자 결과는 평문 십진 TypedValue 가 된다", 코퍼스 `expr.divide.precision`·`expr.average.rounding`(4건) | ✓ |
| I4 | `interpreter.ts` `eq()` 숫자·문자열 승격 추가 | 코퍼스 `expr.eq.mixed-type` | ✓ |
| I5 | `cell-compare.ts` `judge()` NE 의 NULL 을 참으로 특례 | 코퍼스 `cell.ne.null` | ✓ |
| I7 | `cell-compare.ts` `<= 변수 <` 를 양쪽 닫힘으로 | 코퍼스 `cell.range.upper-open-boundary`·`cell.range.date-string-upper`. **perf 파일을 단독 실행해 원인을 확인**: `BASE_SPD_LKP` 가 `{"kind":"error","code":"UNIQUE_MULTIPLE_HITS","rowIds":[3,4],...}` 로 9ms 만에 실패했다(느려진 게 아니라 경계가 넓어져 값 하나가 UNIQUE 두 행에 동시 적중한 진짜 논리 오류다) | ✓ |
| I8 | `interpreter.ts` `&&` 단락 평가 제거(양쪽 선평가) | 코퍼스 `expr.and.false-short`·`expr.gen.guard-null` | ✓ |
| I11 | `interpreter.ts` `+` 의 NULL 피연산자를 오류로 | 코퍼스 `expr.null-plus`·`expr.plus-null-right` | ✓ |
| I15 | `interpreter.ts` `checkRecordKeys`·`normalize` 의 예약 키 검사 제거 | `evalex-interpreter.test.ts` 2건, `evalex-rule-preview.test.ts` 1건, 코퍼스 `cell.constant-key`·`expr.constant-key`·`cell.eval-ts-key`·`expr.eval-ts-key`·`cell.reserved-key`·`expr.reserved-key`(총 9건) | ✓ |
| I18 | `cell-compare.ts` CONTAINS·INSTR 를 대소문자 무시로 | 코퍼스 `cell.contains.case`·`cell.instr.case` | ✓ |
| I19 | `pattern.ts` `tokenize()` 이스케이프 처리 제거 | 코퍼스 `cell.eq.pattern.backslash`·`cell.eq.pattern.escaped-percent`·`cell.eq.pattern.escaped-underscore` | ✓ |
| I23(a) | `functions.ts` `str()` 폴백 대신 `toFixed()` | `evalex-interpreter.test.ts` "계산한 숫자를 문자열로 바꾸는 자리는 폴백한다", 코퍼스 `expr.concat.computed-scale` | ✓ |
| I23(b) | `interpreter.ts` `compare()` 혼합 타입 대소 비교를 문자열 비교로(폴백 제거) | `evalex-interpreter.test.ts` "혼합 타입 대소 비교는 폴백한다", 코퍼스 `expr.compare.mixed-type` | ✓ |
| I27 | `input-contract.ts` `alwaysNames()` 조건 열을 seq 대신 이름순 정렬 | `evalex-input-contract.test.ts` #1·#13 | ✓ |
| I28 | `input-contract.ts` 행을 rowId 순 정렬 + `cond` 구분자 `·`→`,` | `evalex-input-contract.test.ts` #2·#3·#13(행 순서·required 집합·always). **perf 2건(R2 1067ms, QLTY 884ms)도 같이 빨개졌으나, `input-contract.ts` 는 `evaluate`·`previewRule` 핫패스를 건드리지 않는다(행 정렬·문자열 join 뿐). perf 파일만 단독 재실행하니 이 변이 상태로도 4건 전부 통과했다 — 게이트 부하 시 흔들리는 잡음이지 이 변이의 영향이 아니다** | ✓ |
| I30 | `rule-analysis.ts` `cellSet()` `NOT_NULL` 을 `full(domain, true)`(NULL 포함)로 | `evalex-rule-analysis.test.ts` "<> A 와 IS NULL 은 겹치지 않는다"(§8 B8 이 더한 `NOT_NULL`·`IS_NULL` 짝 단언, line 106) | ✓ |
| I33 | `rule-analysis.ts` 값 빈틈 격자 `step` 을 `10^-max(s,5)`(사실상 연속)로 | `evalex-rule-analysis.test.ts` "빈틈은 소수 자리수 격자로 판정한다"(scale 1 에서 스퓨리어스 VALUE_GAP 발생) | ✓ |
| I35 | `rule-analysis.ts` `first`(FIRST 전용 UNREACHABLE 제한)를 `true` 로 고정 | `evalex-rule-analysis.test.ts` "UNIQUE 표에는 UNREACHABLE 을 내지 않는다" 외 2건(총 3건) | ✓ |
| I36 | `rule-preview.ts` FIRST 정책의 적중 후 `break` 제거(계속 평가) | `evalex-rule-preview.test.ts` "QLTY FIRST…"·"PRIORITY·COLLECT·ANY…". **perf 1건(BASE_SPD_LKP)도 같이 빨개졌으나 perf 파일 단독 재실행에서는 이 변이 상태로 4건 전부 통과했다 — I28 과 같은 게이트 부하 잡음** | ✓ |
| I37 | `rule-preview.ts` `evalRow()` 판정 불가(null) 셀을 만나면 즉시 반환(뒤 확정 거짓 무시) | `evalex-rule-preview.test.ts` "Expression 조건 셀이 지원 밖이면 폴백하되 다른 셀이 거짓인 행은 확정 거짓이다"(§8 B7 이 열 순서를 바꿔 만든 사례, #11) | ✓ |
| I38 | `interpreter.ts` `evaluate()` 의 `compile({...ast})` 캐시 무력화 + `normalize()` 낭비 `Decimal` 연산. **전체 스위트 안에서는 이 변이만으로 median 이 100ms 를 늘 넘기지는 않았다(부하와 섞여야 넘었다 — 아래 참조). 강도를 `evaluate()` 호출마다 4000회 정수 누적 바쁜 루프로 높여 다시 확인**: perf 파일 단독 2회 실행 모두 R2·R3·BASE_SPD_LKP 가 빨강. 1회차 `R2: 중앙값 176.5ms(421.9/176.0/176.5/165.3/213.2)`, `R3: 125.2ms`, `BASE_SPD_LKP: 121.3ms`. 2회차 `R2: 357.5ms`, `R3: 193.7ms`, `BASE_SPD_LKP: 111.7ms` | ✓(강도 보강 후) |
| I39 | `src/frontend/m-mdm/fake-corpus.json` 사본 추가 | `evalex-corpus.test.ts` "m-mdm 안에 코퍼스 사본이 없고 러너는 엔진 test resources 를 읽는다" | ✓(파일 삭제) |
| I41 | `CellTextOracle.java` `toRegex()` 에서 `REGEX_META` 이스케이프(`\`) 삽입 제거 | `CellTextOracleTest.패턴_정규식형과_정규식_변환_거부`(오라클 #8) | ✓ |
| I42 | `CorpusEvalExHarness.java` `.mathContext(MdmExpressionConfig.MATH_CONTEXT)` → `new MathContext(34, HALF_EVEN)` | `CorpusHarnessTest.하네스_설정값이…`, `CorpusConformanceTest` 의 `expr.power.negative-scale`·`expr.sqrt`·`expr.divide.precision`·`expr.average.rounding`(총 5건) | ✓ |
| I43 | `src/index.ts` 에 `export * from "./evalex";` 추가 | `evalex-entry.test.ts` "package.json exports 에 ./evalex 가…루트 배럴엔 ./evalex 문자열이 없다" | ✓ |

**2차: §8 과 다른 변이 — 17항목 독립 재확인**(같은 항목을 다른 방식으로 틀려도 잡히는지 본다. §8 표의 변이와 겹치지 않는다)

| I | 다른 변이 | 빨개진 테스트 | 되돌림 |
|---|---|---|---|
| I1 | `precision: 68` → `67`(§8 은 34) | parity·interpreter·코퍼스 4건(§8 계열과 같음). 같은 실행에서 perf 1건도 함께 빨개졌으나 `precision` 은 타이밍 경로를 건드리지 않으므로 이 변이의 영향으로 단정하지 않는다(아래 「겪은 문제」 부하 잡음과 같은 종류로 본다, 별도 재확인은 하지 않았다) | ✓ |
| I4 | `eq()` 에서 `a===null\|\|b===null` 을 `return false`(§8 은 숫자 승격) | 코퍼스 `expr.gen.guard-null`·`expr.gen.null-eq`(2건) | ✓ |
| I5 | `judge()` 의 `if (v === null) return false;` 가드를 통째로 삭제(§8 은 NE 만 특례) | `evalex-rule-preview.test.ts` 1건 + 코퍼스 11건(`cell.ne.null`·`cell.not-in.null`·`cell.lt.null`·`cell.le.null`·`cell.gt.null`·`cell.ge.null`·`cell.range.*`·`cell.eq.pattern.null` 등) — 총 12건, §8 변이보다 훨씬 넓게 잡힌다 | ✓ |
| I7 | `< 변수 <` 를 아래쪽만 닫힘으로(§8 은 `<= 변수 <` 양쪽 닫힘) | 코퍼스 `cell.range.oo.lower` + perf `BASE_SPD_LKP`(단독 재실행에서 `UNIQUE_MULTIPLE_HITS rowIds:[1,2]` 확인 — I7 원 변이와 같은 유형의 진짜 논리 오류) | ✓ |
| I8 | `\|\|` 단락 제거(§8 은 `&&`) | 코퍼스 `expr.or.true-short` | ✓ |
| I11 | `str()` 의 NULL → `"null"` 을 `""` 로(§8 은 `+` 를 오류로) | 코퍼스 `expr.null-plus`·`expr.plus-null-right` | ✓ |
| I15 | `_` 접두 검사만 제거(§8 은 검사 전체 삭제) | `evalex-interpreter.test.ts` 1건 + 코퍼스 `cell.reserved-key`·`expr.reserved-key`(총 3건) | ✓ |
| I19 | `_` 를 ANY_ONE 대신 그냥 글자로(§8 은 이스케이프 처리 삭제) | 코퍼스 `cell.eq.pattern.underscore` | ✓ |
| I27 | Expression 조건 셀 참조 수집을 통째로 제거(§8 은 이름순 정렬) | `evalex-input-contract.test.ts` #13 | ✓ |
| I28 | DEFAULT 행을 맨 앞으로(§8 은 rowId 순 정렬) | `evalex-input-contract.test.ts` "기본 행은 마지막에 싣고…" | ✓ |
| I30 | `IS_NULL` 을 `exact([], domain, false)`(NULL 없음, §8 은 `NOT_NULL` 이 NULL 을 덮게) | **빨강 없음** — `evalex-rule-analysis.test.ts` 21건 전부 통과(이 파일만 단독 재실행해도 21건 통과, 직접 확인했다). 같은 전체 스위트 실행에서 perf 1건도 함께 빨개졌으나 **perf 는 별도로 격리 재실행하지 않았다** — I30 은 rule-analysis 로직만 건드리므로 correctness 판정은 rule-analysis 21건으로 충분하다고 보고, perf 쪽 원인 규명은 하지 않은 채 부하 잡음으로 추정만 한다. **rule-analysis 기준으로 덮지 못한 변이로 보고한다**(아래) | ✓ |
| I33 | `iv.lo.open && g1.eq(lo)` 왼쪽 경계 보정 삭제(§8 은 격자 자체를 무시) | `evalex-rule-analysis.test.ts` "빈틈은 소수 자리수 격자로 판정한다" | ✓ |
| I35 | ALL_NA_ROW 행을 뒤 검사에서 빼지 않음(§8 은 FIRST 제한 제거) | `evalex-rule-analysis.test.ts` "조건 셀이 전부 - 인 NORMAL 행은 ALL_NA_ROW ERROR 다" | ✓ |
| I36 | COLLECT·ANY 도 첫 적중에서 멈추게(§8 은 FIRST 계속 평가) | `evalex-rule-preview.test.ts` "PRIORITY·COLLECT·ANY…" + perf 2건(게이트 잡음, I28·I36 §8 계열과 같은 패턴) | ✓ |
| I41 | `MAX_PATTERN_WILDCARDS` 3→4(§8 은 이스케이프 제거) | `CellTextOracleTest.패턴_정규식형과_정규식_변환_거부` | ✓ |
| I42 | `allowOverwriteConstants(true)`(§8 은 precision) | `CorpusHarnessTest.하네스_설정값이…` | ✓ |
| I43 | `decimal.js` 를 `devDependencies` 로 이동(§8 은 루트 배럴 재수출) | `evalex-entry.test.ts` "decimal.js 는 dependencies 에 있고 devDependencies 에 없다" | ✓ |

**I44**(지정 22항목 밖이지만 조언에 따라 이번에 처음으로 실제 명령을 실행해 확인했다 — 직전 기록은 이 명령을 돌리지 않고 "확인했다"고만 적어 부실했다):

```
/usr/bin/git diff --stat 955cef1..HEAD -- src/backend/maru-mdm-engine/src/main src/backend/maru-mdm-engine/build.gradle src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/arch src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/contract src/backend/maru-mdm-engine/src/test/java/kr/dongkuk/maru/mdm/engine/expr src/frontend/m-mdm/src/index.ts src/frontend/m-mdm/src/contract src/frontend/pnpm-workspace.yaml
```

출력이 비어 있음을 실행으로 확인했다(exit 0, 아무 줄도 없음). 보호 파일이 기점 955cef1 대비 바이트 동일이다.

**덮지 못한 변이**: 1건 — **I30 의 2차(다른) 변이**. `IS_NULL` 셀의 값 집합에서 `hasNull` 플래그를 `false` 로 바꿔도(원래는 `{NULL}` 한 점만 있는 집합이어야 한다) `evalex-rule-analysis.test.ts` 21건이 전부 그대로 통과했다. 원인: NULL_GAP 판정은 `cellSet()`의 값 집합이 아니라 `op === "NA" || op === "IS_NULL"`라는 별도의 어휘적 검사(rule-analysis.ts:337 부근)를 쓰고, OVERLAP 판정에서 `IS_NULL`(빈 구간+변경된 hasNull)과 다른 가드된 셀(hasNull 이 이미 false)의 `crosses()` 결과가 이 변이로는 안 바뀐다. 06:354 "`IS NULL`은 `{NULL}` 한 점이라 가드된 다른 셀과 절대 겹치지 않는다"는 지켜지지만, IS_NULL 이 **NA 와** 겹치는지(둘 다 hasNull 이 실제로 같아야 하는 자리)를 붙잡는 사례가 설계 테스트 21건에 없다. §8 계열의 I30 변이(`NOT_NULL`이 NULL을 덮게)는 §8 B8 이 더한 단언(analysis #11, line 106)이 정확히 잡으므로 그쪽은 견고하다. 이 변이는 고치지 않고 그대로 보고한다(지시 5번 "빨강이 나지 않는 변이는 수정하지 말고 그대로 보고한다").

### B7·B8·B9 이탈 대조 — 설계 §8 의 실제 내용과 직접 비교

직전 기록은 B7·B8·B9 의 실제 내용과 다른 것("규칙 문서 부족", "03-03 머지 전", "코퍼스 텍스트 부재")을 서술했다. 이번에는 §8 원문과 실제 소스 코드를 함께 읽어 대조했다.

- **B7**(실제 내용: 미리보기 테스트 #11 의 열 순서를 Expression seq 1·표면등급 seq 2 로 바꿔, 행 1 이 "판정 불가 셀 뒤에 확정 거짓 셀이 온다" 모양이 되게 함): `M/tests/evalex-rule-preview.test.ts` #11(코드상 "Expression 조건 셀이 지원 밖이면 폴백하되 다른 셀이 거짓인 행은 확정 거짓이다")을 직접 읽어 확인했다. I37 변이("판정 불가 셀을 만나면 즉시 폴백, 뒤 셀 무시")를 이 테스트가 정확히 잡아냈다(위 표). B7 이 없었다면 I37 의 핵심 동작(판정 불가 뒤 확정 거짓 → 행 거짓)을 검증할 사례가 없었을 것이다. **수용 기준·불변 규칙을 약화하지 않는다.**
- **B8**(실제 내용: 분석 테스트 #11 에 `NOT_NULL`·`IS_NULL` 짝(겹침 없음) 단언을 추가): `M/tests/evalex-rule-analysis.test.ts:104-107` 를 직접 읽어 106행에서 `[{op:"NOT_NULL"}], [{op:"IS_NULL"}]` 짝이 `[]`(겹침 없음)를 기대함을 확인했다. §8 계열의 I30 변이("NOT_NULL 이 NULL 을 덮게")를 이 단언이 정확히 잡아냈다(위 1차 표). §8 B8 자신이 적은 사유("I30 변이를 잡는 사례가 설계 테스트에 없었다")가 근거다. 다만 I30 의 다른 변이(IS_NULL 쪽 hasNull)는 이 단언으로도 못 잡는다(위 「덮지 못한 변이」) — B8 은 NOT_NULL 쪽만 보강했다. **수용 기준·불변 규칙을 약화하지 않는다.**
- **B9**(실제 내용: 미리보기 테스트 #12 의 `A` 를 문자열 `"0"` 대신 숫자 리터럴 `0` 으로, 인터프리터 테스트 #15·#16 의 값들을 `convertForType(…, "NUMBER")` 로 바꿈): `M/tests/evalex-rule-preview.test.ts:138`(`previewRule(r, { A: 0 })`, 숫자 리터럴)과 `M/tests/evalex-interpreter.test.ts:20`(`const num = (text) => convertForType(text, "NUMBER")`, #15·#16 이 이 헬퍼를 씀)을 직접 읽어 확인했다. B9 가 없었다면(값을 문자열 그대로 두었다면) 각 사례가 검사하려던 것을 검사하지 못하고 매번 혼합 타입 폴백으로 샜을 것이다. 구체적으로: **#15** `validate(ast("value >= 0.1"), {value: "0.5"})`는 NUMBER 리터럴 `0.1`과 문자열 `"0.5"`의 대소 비교가 되어 `{kind:"value", value:true}` 대신 폴백이 됐을 것이다(검사하려던 "결과가 boolean 이 아니면 EVALUATION_ERROR"를 못 본다). **#16** `A + B == 3.1`을 문자열 `A:"1.10", B:"2"`로 넣으면 `+`가 문자열 연결이 되어 `"1.102"` 를 만들고 `== 3.1`이 거짓이 되어(§0.2 혼합 타입 `==`는 거짓), 검사하려던 "prepare 한 scope 재사용 결과가 원본과 같다"를 값 대신 우연한 거짓 일치로만 확인했을 것이다. **미리보기 #12** `IF(A > 1, TRUE, NULL)`에 `A: "0"`을 넣으면 `"0" > 1`이 혼합 타입 비교라 폴백이 되어, 검사하려던 "Expression 셀 결과가 NULL 이면 그 셀만 거짓 + EXPR_CELL_NULL 경고"를 확인하지 못하고 미리보기 전체가 fallback 으로 빠졌을 것이다. B9 는 세 사례가 실제로 의도한 자리(EVALUATION_ERROR·prepare 재사용·EXPR_CELL_NULL)를 검사하게 만든다. **수용 기준·불변 규칙을 약화하지 않는다** — 정확한 타입 표현으로 세 사례를 원래 의도대로 되살린 것이다.

두 B 항목(B7·B8)은 대응하는 불변 규칙(I37·I30)의 §8 계열 변이 검증을 정확히 뒷받침하고, B9 는 인터프리터·미리보기 사례가 의도한 타입으로 정확히 평가되게 한다. 셋 다 약화가 아니다.

### 겪은 문제

- **env**: I7·I28·I36(1차·2차 포함) 변이를 넣었을 때 전체 스위트 실행에서 `evalex-perf.test.ts` 의 성능 테스트 1~3건이 부수적으로 함께 빨개졌다. **원인을 실제로 규명했다.** I7(두 변형 모두)은 부수 효과가 아니라 **진짜 논리 오류**였다 — 경계가 넓어져 `BASE_SPD_LKP` 의 한 값이 UNIQUE 표 두 행에 동시 적중해 `UNIQUE_MULTIPLE_HITS` 가 9~13ms 만에 즉시 뜬다(느려진 게 아니다). I28·I36 은 반대로 **게이트 부하 잡음**이었다 — `input-contract.ts`(I28)는 `evaluate`·`previewRule` 핫패스를 건드리지 않고, `rule-preview.ts`(I36)의 COLLECT/ANY 변형도 BASE_SPD_LKP(UNIQUE)엔 적용되지 않는데도 흔들렸다. `evalex-perf.test.ts` 를 **단독 파일로 재실행**하니 두 변이 상태에서도 4건 전부 통과했다(전체 스위트의 동시 부하가 원인). 처음 초안은 이 둘을 구분하지 않고 뭉뚱그려 "부수 효과"라 적었는데, 조언을 받아 원인을 갈라 이번에 바로잡았다.
- **other**: `evalex-perf.test.ts` 의 `expect(median, message)` 는 통과 시 메시지를 출력하지 않아 실제 ms 수치를 직접 볼 수 없었다. 파일을 고치지 않고 동일 로직의 스크래치 파일(`M/tests/perf-scratch.test.ts`, 3회 실행 후 삭제)로 우회해 수치를 얻었다(위 NFR-1 표).
- **other**: I38 의 원 변이(캐시 무력화 + 낭비 연산)는 전체 스위트 안에서는 R2 를 한 번 크게 넘겼지만(1397ms), perf 파일을 단독 재실행하면 R2 테스트 총 소요가 666ms·633ms(2회, 8회 왕복 워밍업+측정 기준 회당 ~80ms)로 중앙값이 100ms 를 확실히 넘긴다고 말하기 어려웠다(약 1.8배 느려지는 정도라 조용한 조건에서는 경계선). **I38 은 원 변이만으로는 약하게 덮인다**고 정직하게 적는다. 변이 강도를 `evaluate()` 호출마다 4000회 정수 누적 바쁜 루프로 높여 재확인했더니 단독 실행 2회 모두 R2·R3·BASE_SPD_LKP 가 확실히 빨강(중앙값 111~358ms)이 됐다(위 1차 표에 반영). 처음 초안은 이 약한 신호를 강한 신호로 잘못 보고했었다.
- **other**: I30 의 2차(다른) 변이는 어떤 재실행으로도 correctness 테스트를 빨갛게 만들지 못했다(위 「덮지 못한 변이」). 고치지 않고 그대로 보고한다.
- 그 외 tool-error·permission·gate-retry·skill-unclear 범주의 문제는 없었다. 모든 게이트·변이 실행은 완료됐다(다만 조언을 받아 I7·I28·I36·I38·I44 는 최초 판단을 수정했다).

**결함 보고 — NFR-1 게이트가 부하에 민감하다(B11 과 같은 증상)**: 이번 세션에서 핫패스(`evaluate`·`previewRule`)를 건드리지 않은 변이(I28·I36 각 2회, I1·I8·I11·I27·I30 의 2차 변이)를 넣고 **전체 스위트**를 돌렸을 때 `evalex-perf.test.ts` 가 약 9회 곁달아 빨개졌다(테스트 총 소요 823~1642ms, 중앙값으로 환산하면 대략 100~200ms 수준). 같은 변이를 perf 파일만 단독으로 재실행하면 매번 통과했다(I28·I36 은 직접 확인). 재현: `pnpm --filter @dk-oasis/m-mdm test`(전체 스위트, vitest 파일 병렬 실행 + 동시에 gradle 등 다른 부하가 있을 때 재현 확률이 오른다) vs `pnpm --filter @dk-oasis/m-mdm exec vitest run tests/evalex-perf.test.ts`(단독, 항상 통과). **HEAD(변이 없는 상태)에서 실패율을 직접 쟀다**: `for i in 1 2 3 4 5; do pnpm --filter @dk-oasis/m-mdm test; done` 5회 전부 `Tests 258 passed (258)`로 실패 0/5 — 정상 상태에서는 게이트가 흔들리지 않는다. 원인 추정: vitest 파일 병렬 워커 + 이 세션이 백엔드 gradle 을 반복 실행한 부하가 겹치면 `performance.now()` 로 잰 벽시계 중앙값이 흔들려, 부하가 클 때는 100ms 기준을 넘길 수 있다(B11 이 Build 때 이미 겪은 것과 같은 증상 — B11 은 그래서 구현 비용을 줄였지만 근본적으로 벽시계 측정이라 부하가 크면 여전히 흔들릴 수 있다). 이 결함은 이번 재검증의 판정을 바꾸지 않는다(HEAD 5/5 통과, 지정된 NFR-1 3회 측정도 12/12 통과) — 코드를 고치지 말라는 지시를 따라 수정하지 않았고, 다음 CI·자동화에서 이 게이트를 병렬 부하가 큰 환경에 두면 산발적으로 실패할 수 있다는 점만 여기 남긴다.

### 직전 기록 교체 사실

이 절(§9)은 커밋 a597fdb 의 직전 Verify 기록(변이 4건만 검증, NFR-1 수치 없음, B7~B9 판정 오기)을 전면 교체한 것이다.

### 최종 판정

**PHASE_RESULT: ok** — 게이트 5항목 전부 초록(백엔드 791/0, 프런트 258/0·lint 통과), 수용 기준 4항목을 06 원문·실제 테스트 코드로 직접 대조해 전부 통과, NFR-1 3회 실측 12행 전부 중앙값·최댓값 모두 기준 이내, 지정 불변 규칙 22항목을 §8 계열 변이로 전원 빨강 확인 후 원복, 그중 17항목은 §8 과 다른 변이로도 독립 재확인, I44 를 실제 명령으로 확인, B7~B9 실제 내용을 소스 코드로 대조 완료. 덮지 못한 변이 1건(I30 의 IS_NULL hasNull 변형, 분석 테스트 21건이 못 잡는다 — 위에 그대로 보고, 고치지 않았다). 이 1건은 §8 계열 I30 변이(NOT_NULL 쪽)가 이미 잡고 있어 수용 기준·주요 시나리오에 대한 위험은 낮다고 판단해 ok 로 유지한다.
