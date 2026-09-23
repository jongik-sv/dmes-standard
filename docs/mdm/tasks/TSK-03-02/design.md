# TSK-03-02 설계 — 식 평가 코어 (EvalEx 설정·MASTER 계열·카테고리 해석·도메인 검증기)

> 주문 `ea440494-a2ed-42c5-9842-4c1dce2f9972` · category dev · domain backend · 작성 2026-09-24 (Design Phase)
> 입력: `spec.md`(요구사항 데이터, 수용 기준 6개) · 원천 `docs/mdm/design/basic/`(evalex-guide §6·§7·§8, 02·04·05·06 해당 절, `sql/04-code-exists.sql`) · 계약 `docs/mdm/engine-contract.md`, `decisions.md` D-020~D-023 · 선행 `tasks/TSK-03-01/design.md` · 엔진 `src/backend/maru-mdm-engine` · 팀장 지시(2026-09-24)
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물. TSK-03-01·TSK-02-02 는 dev 에 머지됐지만 미승인이라 가장 약한 근거다.
> 원천 행 번호는 `02:55`·`04:723`·`05:464`·`06:448`·`EG:110` 처럼 적는다(`EG` = evalex-guide.md). 원천은 `docs/mdm/design` 심링크(메인 체크아웃, git 추적 밖)에 있다. **테스트는 이 경로를 런타임에 읽지 않는다.** 필요한 표는 엔진 `src/test/resources` 로 복사한다(§3.4).
> 겪은 문제는 `.issues` 에 적지 않고 Phase 끝 보고에 분류와 함께 올린다.

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

### 0.1 EvalEx 3.7.0 (`javap` on `~/.gradle/caches/modules-2/files-2.1/com.ezylang/EvalEx/3.7.0/37713e92…/EvalEx-3.7.0.jar`)

| # | 사실 | 설계에 주는 뜻 |
|---|---|---|
| F1 | `Expression` 필드: `final configuration`, `final expressionString`, `final dataAccessor`, `final constants`(`TreeMap(CASE_INSENSITIVE_ORDER)`), 그리고 `final` 이 아닌 `abstractSyntaxTree`. 생성자 `Expression(String, ExpressionConfiguration)` 는 `configuration.getDataAccessorSupplier().get()` 으로 **인스턴스마다 새 데이터 접근자**를 만들고, 상수 맵에 `getDefaultConstants()` 를 복사한다 | 값은 인스턴스 안(데이터 접근자)에 쌓인다. 캐시 원본을 여러 스레드가 같이 쓰면 값이 섞인다(06:449) |
| F2 | `copy()` = `new Expression(this)`. 복사 생성자는 `this(getExpressionString(), getConfiguration())` 를 부른 뒤 `abstractSyntaxTree = other.getAbstractSyntaxTree()` 로 **AST 만 공유**한다. 선언은 `throws ParseException` | 사본은 접근자·상수 맵을 새로 가지므로 스레드끼리 안전하다. AST 는 공유하지만 읽기 전용이다 |
| F3 | `getAbstractSyntaxTree()` 는 필드가 null 이면 그때 `Tokenizer` → `ShuntingYardConverter` 로 파싱해 필드에 넣는다(동기화 없음). `validate()` 는 이 메서드를 부를 뿐이다 | 캐시에 넣기 **전에** `validate()` 로 AST 를 만들어 두어야 한다. 그러지 않으면 여러 스레드가 동시에 지연 초기화를 한다 |
| F4 | `with(name, value)`: 상수 맵에 이름이 있으면 `isAllowOverwriteConstants()` 가 false 일 때 `UnsupportedOperationException("Can't set value for constant '%s'")` 를 던진다. `withValues(map)` 는 항목마다 `with` 를 부른다 | 상수 이름 레코드 키는 EvalEx 가 UOE 로 막는다(06:442). 엔진은 이것을 `CONSTANT_KEY` 로 올린다 |
| F5 | 변수 조회 `getVariableOrConstant`: 상수 맵 → 데이터 접근자 순으로 찾고, 없으면 lenient 가 아닐 때 `EvaluationException("Variable or constant value for '%s' not found")` 를 던진다 | 비즈니스 요구 변수 누락을 이 예외로 두면 "판정 오류"가 된다. 그래서 검증기는 평가 전에 키를 먼저 본다(§6.9) |
| F6 | `getUsedVariables()` 는 `TreeSet(CASE_INSENSITIVE_ORDER)` 에 `VARIABLE_OR_CONSTANT` 노드 중 **상수 맵에 없는 이름만** 담는다 | 비즈니스 요구 변수 계산에 그대로 쓴다. 상수는 저절로 빠진다 |
| F7 | 공개 API: `evaluate()`, `evaluateSubtree(ASTNode)`, `getAbstractSyntaxTree()`, `getAllASTNodes()`, `getUsedVariables()`, `getUndefinedVariables()`, `getDataAccessor()`, `getConstants()`, `copy()`, `validate()` | AST 검사·내보내기·변수 목록을 모두 공개 API 로 할 수 있다 |
| F8 | `ASTNode(Token, ASTNode...)`: `getToken()`, `getParameters()`, `toJSON()`. `Token`: `getType()`, `getValue()`, `getFunctionDefinition()`. `Token.TokenType` 15종(BRACE_OPEN·BRACE_CLOSE·COMMA·STRING_LITERAL·NUMBER_LITERAL·VARIABLE_OR_CONSTANT·INFIX_OPERATOR·PREFIX_OPERATOR·POSTFIX_OPERATOR·FUNCTION·FUNCTION_PARAM_START·ARRAY_OPEN·ARRAY_CLOSE·ARRAY_INDEX·STRUCTURE_SEPARATOR) | `AstExporter` 는 원천 샘플 `js/AstExporter.java` 와 같이 `token.getType().name()`·`token.getValue()` 를 쓴다 |
| F9 | `ExpressionConfiguration$ExpressionConfigurationBuilder` 메서드: `operatorDictionary`, `functionDictionary`, `mathContext`, `dataAccessorSupplier`, `defaultConstants`, `arraysAllowed`, `structuresAllowed`, `binaryAllowed`, `implicitMultiplicationAllowed`, `singleQuoteStringLiteralsAllowed`, `lenientMode`, `powerOfPrecedence`, `decimalPlacesResult`, `decimalPlacesRounding`, `stripTrailingZeros`, `allowOverwriteConstants`, `zoneId`, `locale`, `maxRecursionDepth`, `regexTimeoutMillis`, `dateTimeFormatters`, `evaluationValueConverter`, `build` | `MdmExpressionConfig` 상수 14개는 빌더 메서드 하나에 하나씩 들어간다(`functionDictionary` 는 별도) |
| F10 | `ExpressionConfiguration` 읽기 메서드: `getFunctionDictionary`, `getMathContext`, `getDefaultConstants`, `isArraysAllowed`, `isStructuresAllowed`, `isBinaryAllowed`, `isImplicitMultiplicationAllowed`, `isSingleQuoteStringLiteralsAllowed`, `isLenientMode`, `getDecimalPlacesRounding`, `isStripTrailingZeros`, `isAllowOverwriteConstants`, `getZoneId`, `getLocale`, `getMaxRecursionDepth`, `getRegexTimeoutMillis` | 설정 팩토리 테스트가 이 메서드로 결과 설정을 읽는다 |
| F11 | 빌더에서 `functionDictionary` 를 부르지 않으면 `build()` 결과는 **EvalEx 표준 사전 전체**를 가진다(`DT_NOW`·`RANDOM` 포함). `MapBasedFunctionDictionary.ofFunctions(Map.Entry...)` 로 사전을 만든다 | `baseBuilder()` 가 사전을 비워 두면 표준 사전이 새어 나온다(D3) |
| F12 | `FunctionIfc`: `getFunctionParameterDefinitions()`, `evaluate(Expression, Token, EvaluationValue...)`, `validatePreEvaluation(...)`, `hasVarArgs()`, default `isParameterLazy(int)`·`getCountOfNonVarArgParameters()`. `AbstractFunction` 은 클래스에 붙인 `@FunctionParameter(name, isLazy, isVarArg, nonZero, nonNegative)`(반복은 `@FunctionParameters`)로 인자를 선언한다. `FunctionParameterDefinition.builder().name().isVarArg().isLazy().nonZero().nonNegative().build()` 는 공개다 | `MASTER`·`MASTER_AT`·`INSTR` 는 `AbstractFunction` + 주석으로, 인자 수가 실행 시에 정해지는 비즈니스 함수는 `FunctionIfc` 직접 구현 + 빌더로 만든다 |
| F13 | `EvaluationValue` 팩토리: `nullValue()`, `numberValue(BigDecimal)`, `stringValue(String)`, `booleanValue(Boolean)`, `dateTimeValue(Instant)`, `of(Object, ExpressionConfiguration)`. 조회: `isNullValue`·`isNumberValue`·`isStringValue`·`isBooleanValue`·`isDateTimeValue`, `getNumberValue`·`getStringValue`·`getBooleanValue`·`getDateTimeValue`·`getValue` | 함수 구현이 인자를 판별하고 결과를 만든다 |
| F14 | 예외: `ParseException extends BaseException extends Exception`(검사 예외), `EvaluationException(Token, String)`. **범용 평가 타임아웃은 없다.** 타임아웃이 있는 것은 정규식뿐이다(`functions/string/util/RegularExpressionUtils$TimeoutRegexCharSequence`, `regexTimeoutMillis`) | 평가 타임아웃은 엔진이 `java.util.concurrent` 로 만든다(06:449, 02 안전장치 4) |
| F15 | `DataAccessorIfc`: `getData(String)`·`setData(String, EvaluationValue)`. 기본 `MapBasedDataAccessor` 는 대소문자를 가리지 않는다(EG:120) | `MASTER` 는 `expression.getDataAccessor().getData("EVAL_TS")` 로 평가 시각을 읽는다(EG:223) |

### 0.2 리포·계약

| # | 사실 | 근거 |
|---|---|---|
| F16 | 엔진만 따로 돌리는 명령을 이번 Phase 에서 실측했다: `cd src/backend/maru-mdm-engine && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew test --no-daemon` → 테스트 클래스 7개, **76건, 실패 0**. 백엔드 루트 `testAll` 은 `includedProjectNames` 에 `maru-mdm-engine` 을 넣어 `:test` 를 부른다 | 실측, `src/backend/build.gradle:7,15-19` |
| F17 | 영구 테스트 `ContractTypeShapeTest` 는 `CONTRACT_TYPES` 목록 안의 클래스에만 형태 규칙을 건다. 상수 홀더 `FunctionSets`·`ReservedNames`·`MdmExpressionConfig` 는 final·private 생성자·**모든 필드 static final** 이어야 한다. 메서드 몸체는 막지 않는다 | `arch/ContractTypeShapeTest.java:36-107` |
| F18 | 영구 테스트 `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다` 는 `expr`·`rule` 패키지(하위 패키지 포함, 중첩 포함)의 **모든 record·enum** 을 모아 대응표 ∪ `JAVA_ONLY` 와 양방향으로 대조한다. `code`·`domain`·`spi` 는 대상이 아니다 | `contract/EngineContractSchemaTest.java:106-113,209-235` |
| F19 | `EnginePackageDependencyTest`: spi 는 아무것도 보지 않고, code 는 spi 만, expr 는 spi·code, rule·domain 은 expr·spi 를 본다. domain 은 code 를 직접 보지 못한다 | `arch/EnginePackageDependencyTest.java` |
| F20 | `MaruMdmEngineArchitectureTest` 규칙 1: main 의존은 `com.ezylang.evalex..`·`java.lang/util/math/time/text..` 뿐이다. `java.util.concurrent`·`java.util.regex`·`java.util.function`·`java.time.format` 은 허용 목록 안이다. `java.io` 는 밖이다. ArchUnit 은 `DO_NOT_INCLUDE_TESTS` 라 테스트 클래스는 검사하지 않는다 | `arch/MaruMdmEngineArchitectureTest.java` |
| F21 | `ContractOnlyPhaseTest` 는 `ContractTypeShapeTest` 의 `CONTRACT_TYPES`·`ENGINE`·`PREFIX` 를 static import 한다. 반대 방향 참조는 없다. 그래서 이 파일을 지워도 `ContractTypeShapeTest` 는 그대로 컴파일된다. `ContractTypeShapeTest` Javadoc(33행, 42행)에 `{@code ContractOnlyPhaseTest}` 언급이 두 번 있으나 `{@code}` 라 컴파일에 영향이 없다 | 두 파일 import 절 |
| F22 | 스캐폴드 `expr.ExpressionEvaluator.evaluate(String) → BigDecimal` 을 `mdm/lib` 의 `MdmEngineDependencySmokeTest`(`"10 + 5"` = 15)가 직접 부른다. engine-contract §13 은 이 클래스를 "팩토리로 전환"하라고 이 Task 에 넘겼다 | `mdm/lib/src/test/java/com/dongkuk/dmes/mdm/MdmEngineDependencySmokeTest.java`, engine-contract.md:340 |
| F23 | 계약에 **값 변환 함수 자리가 없다.** `RuleEngine` Javadoc 에 "엔진이 입력 계약의 데이터 타입으로 바꾼다(06:198 엔진 계약 2)" 한 줄만 있다. `DataType` enum 은 `NUMBER, STRING, BOOLEAN, DATE` 이고 DATE 는 "결과 변수 선언에만 온다" | `rule/RuleEngine.java:21-22`, `spi/DefinitionLookup.java:794-795` |
| F24 | `MasterLookup` Javadoc 은 "판정 규칙(①~④, 최초 행 소급)은 구현체가 05 「판정 참고 구현」 대로 한다"고 적었다. spi 에는 마루 데이터 행을 돌려주는 인터페이스가 없다 | `spi/MasterLookup.java:38-45` |
| F25 | 스키마 루트는 `$schema`·`$id`·`title`·`description` 만 갖고 제약이 없다. `$defs/AstNode` 는 여섯 변형의 `oneOf` 이고 각 변형은 `additionalProperties: false`, 함수 변형의 `params` 는 `minItems: 1` 이다 | `src/main/resources/.../engine-contract.schema.json` |
| F26 | JSON Schema 검증기는 Gradle 캐시에 없다. mavenCentral `com.networknt:json-schema-validator` 최신은 3.0.7(Jackson 3, `tools.jackson`)이고, **1.5.9 는 Jackson 2.18.3**(`com.fasterxml.jackson.core:jackson-databind`)을 쓴다. 엔진 test 는 이미 `jackson-databind:2.18.2` 를 쓴다 | `maven-metadata.xml`, `json-schema-validator-1.5.9.pom` |
| F27 | 원천 샘플 `/Users/jji/project/mdm/js/AstExporter.java`(리포 밖): `export(String, ExpressionConfiguration) throws ParseException`, `toMap(ASTNode)`(자식이 없으면 `params` 키를 뺀다), `assertDomainRule(...)`(변수·함수 화이트리스트). `toUpperCase()` 를 로캘 없이 부른다 | 원천 파일 |

### 0.3 원천 설계 — 이 Task 가 옮기는 규칙

| # | 규칙 | 근거 |
|---|---|---|
| S1 | 설정: precision 68 HALF_EVEN, 허용 함수만 넣은 사전, `allowOverwriteConstants=false`, `regexTimeoutMillis` 고정 | 06:442, EG:106-120 |
| S2 | 허용 함수: 표준 칸용 = EG 8.5 + `MASTER`·`MASTER_AT` + `INSTR`, 비즈니스 칸용 = 표준 + 비즈니스 함수. 사전에는 둘 다 넣고 칸별 제한은 저장 시 검사가 한다 | 06:443 |
| S3 | `INSTR(s, sub)`: 대소문자 구분, 1부터, 없으면 0, 인자가 NULL 이면 NULL | 06:443, EG:215 |
| S4 | `MASTER`·`MASTER_AT`: 첫 인자 ID 가 TB_MDM_CODE 에 있으면 `engine.code`, 없으면 `MasterLookup`. 마지막 인자 가변. `MASTER` 는 ctx `EVAL_TS`, `MASTER_AT` 은 넷째 인자 | 06:444, 05:361-415, EG:223 |
| S5 | 저장 시 검사: 파싱 → 변수·함수 화이트리스트 → AST JSON. `STR_MATCHES` 정규식은 Java 전용 문법(`(?i)`, 소유 한정자, 원자 그룹)을 거부하고 중첩 수량자 검사를 함께 한다. 변수명은 상수 8종·`_` 접두 금지. `MASTER` 인자 수·리터럴·`attr` 모양 검사 | 06:446, 06:339·346·347·348(「저장 시 검사」 MDM 참조·Expression·변수명·상수 사전 회귀 행), EG:144 |
| S6 | 안전장치: 컴파일 캐시(키 = 식 텍스트, 단위 = 파싱된 `Expression`), 평가는 `copy()` 사본, 평가 타임아웃, 동시 평가 케이스 | 06:449, 02 안전장치 4 |
| S7 | 도메인 검증기 순서: 빈 값 정규화 → 필수 → 타입 변환 → 유효 표준식 → 유효 비즈니스식. NULL 이면 필수로만 판정. 비즈니스 요구 변수가 없으면 검증 실패. CODE 종류는 자동 생성 `MASTER` 식을 표준식 자리에서 평가 | 06:448, 02:381-389 |
| S8 | 유효 식은 저장하지 않는 파생값이다. 유효 텍스트 = 부모 유효 식 `&&` 자신의 식. 유효 AST = 조상 `std_ast` 를 AND 노드로 잇기만 한다(재파싱 없음). 깊이 3 이면 `AND(AND(조부, 부), 자신)`. CODE 종류는 조립할 때 유효 참조로 `MASTER("<마루 코드>", "<카테고리>", value)` 를 끼워 넣는다. 유효 참조 = 부모 체인에서 가장 가까운 지정값 | 02:79, 02:103-134, 02:84-101 |
| S9 | 04 버전 선택: `apply_from <= base_dt < apply_to` 인 RELEASED(CANCELLED 제외), 없으면 최초 RELEASED(버전 소급). 카테고리: V 에 유효한 행, 아직 생기기 전이면 최초 정의(카테고리 소급), V 에서 이미 닫혔으면 false. 코드는 늘 V 기준. TABLE 은 `eff_ver = GREATEST(cate.from_ver, V)` 로 CATE_ITEM 을 본다 | 04:670-734, `sql/04-code-exists.sql` |
| S10 | 04 REGEX: 그 버전에 유효한 코드 행마다 `def_target`(CODE·LVL1-5·ATTR01-10) 칸 값에 **전체 일치**(`Pattern.compile(expr).matcher(value).matches()`), 칸이 NULL 이면 불일치. BASE 는 예약 카테고리이고 REGEX `.*`·대상 CODE 로 자동 생성되며 해석 결과는 그 버전의 코드 전체다 | 04:95, 04:176-200 |
| S11 | 05 판정: ① 데이터가 있고 `closed_at IS NULL OR base_dt < closed_at` ② 항목 선분 행 ③ 카테고리 선분 행 ④ 소속(REGEX 는 대상 칸 값 전체 일치, TABLE 은 소속 선분 행). 선분 = `valid_from <= base_dt < valid_to`, 가장 이른 행보다 앞이면 그 행(최초 행 소급). 대상 칸 이름은 KEY·LVL1-5·ATTR01-10 | 05:361-415, 05:417-470, 05:147-166, 05:220-245 |
| S12 | 04 예제 실행 결과 표(4 기준일 × 코드 3 + 목록)와 "v1.000 에만 있다가 v1.001 에서 닫힌 카테고리는 2025-03-01 에 true, 2026-07-15 에 false" | 04:719-728 |
| S13 | 05 PORT 판정 7케이스와 샘플 데이터(항목 선분·카테고리·소속) | 05:460-470, 05:705-760 |
| S14 | 02 도메인 종류 예시: QTY `value >= 0.1 && value <= 3.5 && value % 0.1 == 0`, CODE 자동 생성 `MASTER`, ID `STR_MATCHES(value, "^[A-Z0-9]{10,20}$")`, TEXT `STR_TRIM(value) != ""`, DATE 일자 정규식(219자)과 비즈니스식 `value >= PROD_START_DT`, FLAG `value == "Y" \|\| value == "N"`·`1/2/3/4/D` | 02:55-60, 02:998-1025 |
| S15 | 02 상속 예: 코일 두께(10)·원재료 코일 두께(11), 중량 트리(WGT·COIL_WGT·COIL_GRS_WGT·COIL_PAK_WGT) | 02:91-101, 02:994-999, 02:1055 |
| S16 | `MASTER_AT` 의 `base_dt` 는 문자열 `YYYYMMDD`(그날 00:00:00 KST)·`YYYYMMDDHHMMSS`(KST)만 받고, 그 밖의 문자열·숫자·불린은 평가 오류, NULL 은 false/NULL | engine-contract.md §7, D-023 |

---

## 1. 접근 방식

EvalEx 를 직접 부르는 일은 모두 `expr` 한 패키지에 모은다. 설정 팩토리(`MdmExpressionConfig`)가 사전과 고정값을 만들고, 평가기(`MdmEvaluator`)가 컴파일 캐시·`copy()`·`EVAL_TS` 주입·타임아웃을 한곳에서 처리한다. 저장 시 검사(`ExpressionChecker`·`RegexPolicy`)와 AST 내보내기(`AstExporter`)도 같은 설정으로 파싱한다. 이렇게 하면 서버·하위 시스템·룰 엔진(TSK-03-03)이 같은 설정과 같은 캐시 규칙을 쓰게 된다(06:438). 원천 06:463 의존 방향을 지키기 위해 코드 해석(04)은 EvalEx 를 모르는 `code` 에 두고, `MASTER`·`MASTER_AT` 함수가 `code` 를 부른다. 도메인 검증기는 `code` 를 직접 보지 못하므로 CODE 종류도 `MASTER` 식으로 평가한다(06:448 이 정한 방식 그대로다).

05 마루 데이터 판정은 spi 계약상 `MasterLookup` 구현체의 몫이지만, spec 은 이 Task 에 "05 PORT 판정 7케이스 통과"를 요구한다. 그래서 spi 는 바꾸지 않고, 행을 받아 05 규칙대로 판정하는 참고 구현 `code.MasterDataResolver implements MasterLookup` 을 엔진에 둔다(D1). 원장 서버와 사본 서버는 이것을 그대로 쓰거나 같은 규칙으로 구현한다.

타입 변환은 도메인 검증과 룰 판정이 같은 함수를 써야 하므로(수용 기준 6), 두 패키지가 모두 볼 수 있는 `expr` 에 공개 단일 진입점 `ValueConverter.convert` 를 둔다(D2).

영구 테스트 두 개가 구현 모양을 제약한다. 첫째, `expr` 에는 record·enum 을 새로 둘 수 없다(F18). 그래서 `expr` 의 값 타입은 final class 로 만들고, 오류 분류는 기존 `EngineEvaluationException.Code` 를 재사용한다. record 가 필요한 05 행 타입은 스캔 대상이 아닌 `code` 에 둔다. 둘째, `MdmExpressionConfig` 는 상수 홀더라 static final 이 아닌 필드를 가질 수 없다(F17). 그래서 캐시는 `MdmEvaluator` 인스턴스가 갖고, `MdmExpressionConfig` 의 두 팩토리 몸체는 package-private 헬퍼(`FunctionDictionaries`)에 위임한다.

이 방식을 고른 이유는 세 가지다. 첫째, spec 수용 기준 6개를 모두 엔진 단위 테스트로 붙잡는다. 둘째, 계약 타입의 시그니처와 스키마를 바꾸지 않아 TS 재생성·프런트 테스트에 영향이 없다. 셋째, 병렬 형제 Task 의 범위(TSK-03-03 `rule` 패키지 구현, TSK-03-04 화면 JS 평가기·정합성 코퍼스)에 손대지 않는다. **이 Task 는 `rule` 패키지, `src/frontend/**`, 코퍼스 파일을 만들거나 고치지 않는다.**

**범위 밖(명시)**: 06:449 안전장치의 "식 길이 제한"은 spec 요구사항에 없으므로 이 Task 에서 만들지 않는다. op-code 셀 생성기·겹침·빈틈·입력 계약 계산은 `rule` 몫(TSK-03-03·03-04)이다. 비즈니스 함수 구현 jar(`maru-mdm-functions`)는 별도 산출물이다.

---

## 2. 변경 파일 목록

경로 앞머리: `E` = `src/backend/maru-mdm-engine`, `J` = `E/src/main/java/kr/dongkuk/maru/mdm/engine`, `T` = `E/src/test/java/kr/dongkuk/maru/mdm/engine`, `R` = `E/src/test/resources/kr/dongkuk/maru/mdm/engine`.

### 2.1 삭제 — `ContractOnlyPhaseTest` 계획 삭제 (팀장 배정)

TSK-03-01 design.md 결정 D2(526-531행)의 원문이다.

> **택한 것**: (a) 계약 타입 목록에만 적용하는 영구 형태 규칙(`ContractTypeShapeTest`) + "구현 클래스가 없다" 임시 폐쇄 규칙(`ContractOnlyPhaseTest`, TSK-03-02·03-03·03-04 중 main 구현 클래스를 먼저 넣는 Task 가 그 커밋에서 파일째 지운다)

팀장이 2026-09-24 이 삭제를 **TSK-03-02 에 배정**했고, TSK-03-03·03-04 에는 지우지 말라고 지시했다(`state.json` `planned_removal` 에도 같은 내용이 있다).

| 파일 | 지우는 테스트 5건 |
|---|---|
| `T/arch/ContractOnlyPhaseTest.java`(파일째) | 1. `main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다` · 2. `MdmExpressionConfig_의_메서드는_UnsupportedOperationException_만_던진다` · 3. `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다` · 4. `baseBuilder_는_UnsupportedOperationException_을_던진다` · 5. `create_는_UnsupportedOperationException_을_던진다` |

- **순서**: Build 의 첫 구현 커밋 **직전의 별도 커밋**으로 지운다(커밋 메시지 예: `test(mdm): TSK-03-02 계약 전용 임시 규칙 ContractOnlyPhaseTest 를 지운다`). 그 커밋 뒤 엔진 테스트는 71건 초록이어야 한다. 구현이 들어가면 1·2·3·4·5 가 모두 빨강이 되므로, 삭제를 구현 뒤로 미루지 않는다.
- **공존 확인**: 이 파일은 `ContractTypeShapeTest` 의 `CONTRACT_TYPES`·`ENGINE`·`PREFIX` 를 가져다 쓰기만 하고, 반대 방향 참조는 없다(F21). 삭제 커밋에서 엔진 테스트를 돌려 `ContractTypeShapeTest` 5건이 컴파일·통과하는지 확인하고 결과를 보고에 적는다.
- `ContractTypeShapeTest` 의 Javadoc 두 곳(33·42행)에 남는 `ContractOnlyPhaseTest` 언급은 **고치지 않는다.** 영구 테스트 파일을 바이트 동일로 두어 형제 Task 와의 충돌 여지를 없애는 편이 낫다. 이 사실은 보고에 한 줄 적는다.
- **예상 총수 변화**: 엔진 76 → 76 − 5 + N, 백엔드 `testAll` 518 → 518 − 5 + N. N = **309**(§3 합계, Build 에서 305 → 309, §9 이탈 6·11). 따라서 엔진 **380건**, `testAll` **822건**을 기대한다. Verify 는 총수에서 빠진 5건을 이 계획 삭제로 설명한다.

### 2.2 생성 — main

| 파일 | 공개 여부 | 내용 |
|---|---|---|
| `J/expr/MdmEvaluator.java` | public final | 컴파일 캐시(`ConcurrentHashMap<String, Expression>`) + `copy()` 평가 + `EVAL_TS` 주입 + 타임아웃(§6.3) |
| `J/expr/ExpressionFailure.java` | public final, `extends RuntimeException` | 평가기가 던지는 실패. `code()`(`EngineEvaluationException.Code`), `reason()`(문자열 상수 `PARSE`·`EVALUATION`·`TIMEOUT`·`CONSTANT_KEY`), `name()`(함수·변수 이름, 없으면 null) |
| `J/expr/ExpressionChecker.java` | public final | 저장 시 검사: 파싱, 칸별 함수 화이트리스트, `DOMAIN_STD` 의 `value` 전용, 예약 변수, `MASTER` 인자 모양, `STR_MATCHES` 정규식. 중첩 final class `Problem(kind, detail)`(§6.4) |
| `J/expr/RegexPolicy.java` | public final | Java 전용 정규식 문법·중첩 수량자·Java 문법 오류 검사(§6.5) |
| `J/expr/AstExporter.java` | public final | 원천 샘플 이식: `export`, `toMap`, `toAstNode`(§6.6) |
| `J/expr/ValueConverter.java` | public final | 타입 변환 공개 단일 진입점(§6.7, D2) |
| `J/expr/ValueConversionException.java` | public final, `extends IllegalArgumentException` | 변환 실패 |
| `J/expr/RecordKeys.java` | public final | 레코드 예약 키 검사: 상수 8종 → `CONSTANT_KEY`, `EVAL_TS` → `EVAL_TS_KEY`, `_` 접두 → `RESERVED_KEY`(대소문자 무시) |
| `J/expr/InstrFunction.java` | package-private | `INSTR`(`AbstractFunction`, 인자 `s`·`sub`) |
| `J/expr/MasterFunction.java`, `MasterAtFunction.java` | package-private | `MASTER`(`id, cate, key, attr…`)·`MASTER_AT`(`id, cate, key, base_dt, attr…`). 마지막 인자 `isVarArg = true` |
| `J/expr/MasterQuery.java` | package-private | 두 함수가 공유하는 조회 코드 하나(06:444): 코드·데이터 가르기, `attr` 번호 해석, `base_dt` 해석 |
| `J/expr/BusinessFunctionAdapter.java` | package-private | `FunctionProvider.BusinessFunction` → `FunctionIfc`(engine-contract §5 적재 규칙 1-5) |
| `J/expr/FunctionDictionaries.java` | package-private | `BASE` 사전, `STANDARD ∪ 비즈니스` 사전 조립. `MdmExpressionConfig` 가 위임한다 |
| `J/code/DefaultCodeResolver.java` | public final | `CodeResolver` 구현(04, §6.10) |
| `J/code/MasterDataRows.java` | public record(+ 중첩 record 4) | 05 행 묶음: `DataHeader`, `DataItemRow`, `DataCateRow`, `DataCateItemRow`(§6.11). `code` 패키지라 스키마 적용 범위 밖이다(F18) |
| `J/code/MasterDataResolver.java` | public final, `implements MasterLookup` | 05 참고 판정(D1, §6.11) |
| `J/code/Segments.java` | package-private | 04·05 공용 "선분 고르기·최초 소급" 도우미(버전 선분·일시 선분) |
| `J/domain/DefaultDomainValidator.java` | public final, `implements DomainValidator` | 02 실행 순서 1-4단계(§6.9) |
| `J/domain/EffectiveExpressions.java` | public final | 상속 체인 AND 누적 조립(텍스트·AST), CODE 종류 `MASTER` 식 생성, 유효 코드 참조, 비즈니스 요구 변수(§6.8) |

### 2.3 수정 — main·빌드

| 파일 | 변경 |
|---|---|
| `J/expr/MdmExpressionConfig.java` | `baseBuilder()`·`create(EngineLookups)` 몸체를 채운다(§6.1). 상수 14개·시그니처·클래스 모양(final, private 생성자, static final 필드뿐)은 그대로다. 클래스 Javadoc 의 "TSK-03-01 은 계약 전용…몸체는 TSK-03-02 가 채운다" 문단과 `baseBuilder` Javadoc 의 "함수 사전을 뺀"을 D3 결과("사전은 BASE 24종")로 고친다 |
| `J/expr/ExpressionEvaluator.java` | 공개 시그니처 `evaluate(String) → BigDecimal`·예외 규약은 그대로 두고, 몸체만 `new Expression(expression, CONFIG)` 로 바꾼다. `CONFIG = MdmExpressionConfig.baseBuilder().build()`(static final). 클래스 Javadoc 의 "스캐폴드 단계" 문장을 갱신한다(F22) |
| `J/expr/package-info.java`, `J/code/package-info.java`, `J/domain/package-info.java` | "계약 전용 단계 — interface·record·enum·상수만" 문장을 "계약 + TSK-03-02 구현" 취지로 바꾼다. 코드 변경 없음 |
| `E/build.gradle` | `testImplementation 'com.networknt:json-schema-validator:1.5.9'` 한 줄과 주석(스키마 적합 검사 전용, main 의존 아님, D5) |

### 2.4 생성 — 테스트·리소스

| 파일 | 건수 | 절 |
|---|---|---|
| `T/expr/MdmExpressionConfigTest.java` | 9 | §3.1 |
| `T/expr/BusinessFunctionTest.java` | 9 | §3.1 |
| `T/expr/WhitelistParseTest.java` | 17 | §3.1 |
| `T/expr/ExpressionCheckerTest.java` | 26 | §3.1 |
| `T/expr/RegexPolicyTest.java` | 30 | §3.1 |
| `T/expr/AstExporterTest.java` | 16 | §3.1 |
| `T/expr/MdmEvaluatorTest.java` | 15 | §3.1 |
| `T/expr/InstrFunctionTest.java` | 6 | §3.1 |
| `T/expr/MasterFunctionTest.java` | 16 | §3.1 |
| `T/expr/ValueConverterTest.java` | 28 | §3.1 |
| `T/arch/TypeConversionEntryTest.java` | 2 | §3.1 |
| `T/code/DefaultCodeResolverTest.java` | 43 | §3.2 |
| `T/code/MasterDataResolverTest.java` | 19 | §3.2 |
| `T/domain/DefaultDomainValidatorTest.java` | 17 | §3.3 |
| `T/domain/DomainKindExamplesTest.java` | 45 | §3.3 |
| `T/domain/EffectiveExpressionsTest.java` | 11 | §3.3 |
| `T/testsupport/InMemoryLookups.java`, `CodeFixtures.java`(PROC_CD·보조 코드), `PortFixtures.java`(05 PORT), `DomainFixtures.java`(02 도메인) | 0 | 테스트 전용 spi 구현·고정 데이터. `@Test` 없음 |
| `R/code/04-code-exists-expected.csv` | — | 04:721-726 표 복사(§3.4) |
| `R/code/05-port-cases.csv` | — | 05:462-470 표 복사(§3.4) |
| `R/domain/02-domain-kind-cases.csv` | — | 02 예시 사례(§3.4) |

### 2.5 수정하지 않는 것(명시)

- 영구 테스트 `T/arch/ContractTypeShapeTest.java`, `EnginePackageDependencyTest.java`, `MaruMdmEngineArchitectureTest.java`, `T/contract/EngineContractSchemaTest.java`, `EngineContractConstantsTest.java`, 스캐폴드 테스트 `T/expr/ExpressionEvaluatorTest.java`: 바이트 동일.
- 계약 타입 전부(`spi/**`, `code/CodeResolver.java`, `domain/DomainValidator.java`, `expr/{AstNode,EngineWarning,EngineEvaluationException,FunctionSets,ReservedNames,MdmFunction}.java`)의 시그니처·Javadoc. `MdmExpressionConfig` 는 몸체와 Javadoc 만 바꾼다. **계약 시그니처 변경은 없다.**
- 스키마 `E/src/main/resources/**` 와 프런트 `src/frontend/**`(생성 TS 포함). 그래서 m-mdm 테스트 6건은 그대로다.
- `J/rule/**`(TSK-03-03 몫), 코퍼스·JS 평가기(TSK-03-04 몫).
- `docs/mdm/engine-contract.md`, `docs/mdm/engine-contract/**`, `docs/mdm/decisions.md`, `mdm/lib/**`.
- `docs/mdm/tasks/TSK-03-02/state.json`·`spec.md`: 커밋하지 않는다(오케스트레이터 몫).

---

## 3. 테스트 전략

기준선: 백엔드 `testAll` 518건 실패 0(엔진 76건), 프런트 m-mdm 6건 실패 0·lint 통과. **화면 작업이 아니므로 브라우저 E2E 는 해당 없음이다.** 이 Task 는 엔진 jar(순수 Java 라이브러리)만 바꾸고 화면·서버 엔드포인트를 만들지 않는다. 동작은 모두 엔진 단위 테스트로 검증한다.

TDD 순서: 영역마다 테스트를 먼저 쓰고 빨강(컴파일 실패 포함)을 확인한 뒤 구현한다. 영역 순서는 §6.12 를 따른다.

**건수 규칙**: 건수는 JUnit XML 의 `tests` 합계 기준이다. `@ParameterizedTest` 는 호출 한 번이 1건이다. 아래 표는 사례를 하나씩 적어 합계를 검산할 수 있게 했다. **Build 가 사례를 더하거나 빼면 이 design.md 의 표와 N 을 같은 커밋에서 고친다.**

모든 테스트는 원천 docs 경로를 읽지 않는다. 표가 필요하면 `R/**` 리소스를 `@CsvFileSource(resources = "/kr/dongkuk/maru/mdm/engine/…", numLinesToSkip = 1)` 로 읽는다. 첫 줄 앞의 `#` 줄은 JUnit 이 주석으로 건너뛴다.

### 3.1 `expr`·`arch` — 174건

**`MdmExpressionConfigTest` — 9건**

| 테스트 | 검사 |
|---|---|
| `create_설정이_고정값_14개와_같다` | `create(lookups)` 결과의 `getMathContext`·`getZoneId`·`getLocale`·`getRegexTimeoutMillis`·`getMaxRecursionDepth`·`isAllowOverwriteConstants`·`isLenientMode`·`isArraysAllowed`·`isStructuresAllowed`·`isImplicitMultiplicationAllowed`·`isSingleQuoteStringLiteralsAllowed`·`isBinaryAllowed`·`isStripTrailingZeros`·`getDecimalPlacesRounding` 가 상수와 같다(`assertAll`) |
| `baseBuilder_사전은_BASE_24종뿐이다` | `baseBuilder().build().getFunctionDictionary().getAvailableFunctionNames()`(대문자로 맞춤) == `FunctionSets.BASE` (D3) |
| `create_사전은_STANDARD_와_비즈니스_함수다` | 비즈니스 함수 `THK_OK` 하나를 준 `create` 의 사전 이름 집합 == `STANDARD ∪ {THK_OK}` |
| `상수_사전이_남고_상수_이름_값_넣기가_거부된다` | 06:348 「상수 사전 회귀」: `getDefaultConstants().keySet()`(대문자) ⊇ `ReservedNames.CONSTANTS`, `new Expression("x", cfg).with("null", 1)` 이 `UnsupportedOperationException` |
| `ROUND_는_HALF_EVEN_이고_정밀도는_68_이다` | `ROUND(2.345, 2)` = 2.34, `ROUND(2.355, 2)` = 2.36, `1 / 3` 의 유효 자리 수 = 68 |
| `문법_축소는_파싱_오류다` `@ParameterizedTest` 4건 | `B[0] > 1`, `c.d > 1`, `2x > 1`, `'A' == V` 가 `ParseException`(D-021, engine-contract §4 실측 재현) |

**`BusinessFunctionTest` — 9건**

| 테스트 | 검사 |
|---|---|
| `적재를_거부하는_이름` `@ParameterizedTest` 5건 | `thk_ok`(소문자), `1ABC`(형식), `MASTER`(MDM), `IF`(BASE), `DT_NOW`(EvalEx 표준 사전 이름) → `create` 가 `IllegalArgumentException` |
| `등록된_함수는_DOMAIN_BIZ_식에서_평가된다` | `THK_OK(value)` 가 본문 결과를 돌려준다 |
| `nullable_false_인자에_NULL_이면_부르지_않고_평가_오류다` | 본문 호출 횟수 0, `ExpressionFailure.code() == EVALUATION_ERROR` |
| `허용_밖_반환_타입은_평가_오류다` | 본문이 `Integer` 를 돌려주면 `EVALUATION_ERROR` |
| `본문_예외는_평가_오류다` | 본문이 `IllegalStateException` → `EVALUATION_ERROR`, `name() == "THK_OK"` |

**`WhitelistParseTest` — 17건 (수용 기준 1)**

| 테스트 | 사례 |
|---|---|
| `사전_밖_함수는_파싱_단계에서_거부된다` `@ParameterizedTest` 9건 | `DT_NOW()`, `DT_TODAY()`, `RANDOM()`, `STR_FORMAT("%s", 1)`, `STR_SPLIT("a,b", ",")`, `LOG(2)`, `LOG10(2)`, `FACT(3)`, `SIN(1)`. `ExpressionChecker.check(text, DOMAIN_BIZ)`(가장 넓은 칸)가 `PARSE` 문제 하나를 돌려주고 detail 에 `Undefined function` 이 있다. 같은 텍스트를 `MdmEvaluator.evaluate` 로 부르면 `ExpressionFailure(reason = PARSE)` |
| `비즈니스_함수는_비즈니스_칸_밖에서_거부된다` `@ParameterizedTest` 5건 | `THK_OK(value)` 를 `DOMAIN_STD`, `RULE_COND_EXPR`, `RULE_RESULT_EXPR`, `RULE_EXPR_VAR`, `RULE_GRP_COND` 에 검사 → `FUNCTION` 문제 |
| `비즈니스_함수는_DOMAIN_BIZ_에서_통과한다` | 문제 0건 |
| `거부된_식은_평가되지_않는다` | 위 두 거부 경로 뒤 `THK_OK` 본문 호출 횟수 0 |
| `STANDARD_함수는_여섯_칸_모두에서_통과한다` | `FunctionSets.STANDARD` 27종마다 최소 인자 식을 만들어 여섯 칸 모두 문제 0건. 식은 **리터럴과 `value` 만으로** 만든다(`DOMAIN_STD` 가 다른 변수를 거부하기 때문이다). 예: `ABS(value)`, `SWITCH(value, 1, "a", "b")`, `MASTER("A", "BASE", value)`, `MASTER_AT("A", "BASE", value, "20260101")` |

**`ExpressionCheckerTest` — 26건**

| 테스트 | 사례 |
|---|---|
| `DOMAIN_STD_는_value_외_변수를_거부한다` | `value >= COIL_NET_WGT` → `VARIABLE` 문제(detail 에 `COIL_NET_WGT`) |
| `DOMAIN_BIZ_는_다른_컬럼_변수를_받는다` | 같은 식 → 문제 0건 |
| `식_안의_예약_변수를_거부한다` `@ParameterizedTest` 4건 | `EVAL_TS > 0`, `eval_ts > 0`, `_V1 > 0`, `_x == 1`(칸 `RULE_COND_EXPR`) → `RESERVED` |
| `선언_변수명_검사` `@ParameterizedTest` 9건 | 거부 8: `NULL`, `null`, `TRUE`, `Pi`, `e`, `DT_FORMAT_LOCAL_DATE`, `_V1`, `EVAL_TS` / 통과 1: `COIL_THK` (`ExpressionChecker.checkVariableName`) |
| `MDM_인자_모양` `@ParameterizedTest` 11건 | 거부 7: `MASTER("A", "B", value, "attr01", "x")`(인자 5), `MASTER_AT("A", "B", value, D, "attr01", "x")`(인자 6), `MASTER(X, "B", value)`(id 비리터럴), `MASTER("A", C, value)`(cate 비리터럴), `MASTER("A", "B", value, "attr11")`, `MASTER("A", "B", value, "ATTR01")`, `MASTER("A", "B", value, A1)`(attr 비리터럴) → `MDM_ARGUMENT` / 통과 4: `MASTER("A", "B", value)`, `MASTER("A", "B", value, "attr10")`, `MASTER_AT("A", "B", value, ORDER_DT)`, `MASTER_AT("A", "B", value, ORDER_DT, "attr01")`(칸 `RULE_COND_EXPR`) |

**`RegexPolicyTest` — 30건**

| 테스트 | 사례 |
|---|---|
| `거부하는_패턴` `@ParameterizedTest` 20건 | `(?i)abc`, `(?i:abc)`, `a++`, `a*+`, `a?+`, `a{2,}+`, `(?>ab)`, `\Qa.b\E`, `\Aabc`, `abc\z`, `abc\Z`, `\Gabc`, `[a-z&&[^b]]`, `\p{Lu}`, `(a+)+`, `(a*)*`, `(\w+\s?)+`, `([a-z]+)*$`, `(a{1,})+`, `[`(Java 문법 오류) |
| `받는_패턴` `@ParameterizedTest` 8건 | 02 일자 정규식(219자, 한 줄), `^[A-Z0-9]{10,20}$`, `^(S\|B)$`, `^KR$`, `(a{2})+`, `[+*?]+`, `\+\*`, `^(?:ab\|cd){1,3}$` |
| `STR_MATCHES_리터럴에_Java_전용_문법이_있으면_검사가_거부한다` | `STR_MATCHES(value, "(?i)a")`(칸 `DOMAIN_STD`) → `REGEX` |
| `STR_MATCHES_패턴이_리터럴이_아니면_거부한다` | `STR_MATCHES(value, PAT)`(칸 `RULE_COND_EXPR`) → `REGEX` |

**`AstExporterTest` — 16건**

| 테스트 | 검사 |
|---|---|
| `evalex_guide_8_3_예시와_같다` | `value >= 0.1 && value <= 3.5` 의 `export` 결과 = EG:178-186 JSON(Map 비교) |
| `숫자_리터럴은_입력_원문이다` | `1.60`, `1e-3`, `0xFF` 의 `value` 가 원문 그대로 |
| `음수는_접두_연산자와_숫자다` | `V >= (-1.5)` = engine-contract §9 첫 예시 |
| `접두_연산자가_거듭제곱보다_먼저_묶인다` | `-2^2` = engine-contract §9 둘째 예시 |
| `자식_없는_노드와_인자_0개_함수는_params_키가_없다` | 리터럴·변수 노드, 테스트용 0인자 비즈니스 함수 `ZERO()` 노드에 `params` 키 없음 |
| `toAstNode_는_toMap_과_같은_트리다` | 같은 식의 `AstNode` record 와 Map 이 노드마다 type·value·자식 수가 같다 |
| `내보낸_AST_는_스키마_AstNode_를_통과한다` `@ParameterizedTest` 8건 | `value >= 0.1 && value <= 3.5 && value % 0.1 == 0`, `STR_MATCHES(value, "^[A-Z0-9]{10,20}$")`, `IF(GRADE == "A", value <= 2.0, value <= 3.5)`, `MASTER("PROC_CD", "BASE", value)`, `!(A != B) \|\| C <> 1`, `-2^2 + 0xFF`, `"a\"b" == S`, `ZERO()` → networknt 검증기(스키마 정본 `$defs/AstNode`) 오류 0건(D5) |
| `스키마가_틀린_모양을_거부한다` `@ParameterizedTest` 2건 | 손으로 만든 `{"type":"ARRAY_INDEX","value":"[","params":[…]}`, `{"type":"FUNCTION","value":"F","params":[]}` → 오류 1건 이상(검증기가 실제로 검증하는지 확인하는 음성 대조) |

**`MdmEvaluatorTest` — 15건 (수용 기준 2)**

| 테스트 | 검사 |
|---|---|
| `같은_텍스트는_한_번만_컴파일한다` | 같은 텍스트를 세 번 평가하면 `cacheSize()` 1, 다른 텍스트 하나를 더하면 2 |
| `평가_뒤_캐시_원본에는_값이_남지_않는다` | `evaluate("A + 1", {A: 5})` 뒤 package-private `cachedOriginal("A + 1").getDataAccessor().getData("A")` 가 null(copy 변이를 **결정적으로** 잡는 짝 테스트) |
| `동시_평가_1000_스레드_결과가_단일_스레드와_같다` | §6.3 절차. 식 `value * 3 + OFFSET` 과 `IF(value % 2 == 0, "E" + value, "O")`, 입력 i = 0..999. 단일 스레드 기대값 배열과 1,000 개 플랫폼 스레드 결과 배열이 같다. 타임아웃 30 초짜리 평가기를 쓴다. `assertTimeoutPreemptively(60 초)` |
| `EVAL_TS_는_초_미만을_자르고_KST_로_MASTER_에_간다` | `evalTs = 2026-09-05T15:00:00.900Z`, 마루 데이터 `PORT` 대상 `MASTER` → 기록용 `MasterLookup` 이 받은 `baseDt == 2026-09-06T00:00:00` |
| `타임아웃을_넘으면_평가_오류이고_작업을_끊는다` | §6.3 느린 함수, 타임아웃 50 ms → `ExpressionFailure(reason = TIMEOUT, code = EVALUATION_ERROR)`, 이어서 본문의 인터럽트 신호 래치가 5 초 안에 내려간다. 전체를 `assertTimeoutPreemptively(5 초)` 로 감싼다 |
| `타임아웃_안이면_값을_돌려준다` | 같은 평가기로 `1 + 2` = 3 |
| `상수_이름_값은_CONSTANT_KEY_다` | `evaluate("x", {"null": 1, "x": 1})` → `ExpressionFailure(code = CONSTANT_KEY, name = "null")` |
| `평가_중_런타임_예외는_EVALUATION_ERROR_로_감싼다` | `NOT(X)` 에 X = null(EvalEx NPE) → `EVALUATION_ERROR` |
| `레코드_예약_키` `@ParameterizedTest` 6건 | `NULL`→`CONSTANT_KEY`, `pi`→`CONSTANT_KEY`, `EVAL_TS`→`EVAL_TS_KEY`, `eval_ts`→`EVAL_TS_KEY`, `_V1`→`RESERVED_KEY`, `_x`→`RESERVED_KEY` (`RecordKeys.violations`) |
| `레코드_예약_키_위반은_한_번에_모두_모은다` | 세 종류가 섞인 레코드 → 위반 3건, 키 이름순 |

**`InstrFunctionTest` — 6건** (`@ParameterizedTest`)

`INSTR("ABCDE", "CD")` = 3, `INSTR("ABCDE", "cd")` = 0(대소문자 구분), `INSTR("ABC", "")` = 1, `INSTR("A", NULL)` = NULL, `INSTR(NULL, "A")` = NULL, `INSTR("가나다", "다")` = 3.

**`MasterFunctionTest` — 16건**

| 테스트 | 검사 |
|---|---|
| `첫_인자가_마루_코드면_코드_해석으로_간다` | `MASTER("PROC_CD", "COATING", "82")` true, 기록용 `MasterLookup` 호출 0 |
| `첫_인자가_코드에_없으면_MasterLookup_으로_간다` | `MASTER("PORT", "BASE", "KRPUS")` → `MasterLookup.isValid` 호출 1 |
| `key_가_NULL_이면` `@ParameterizedTest` 2건 | 불리언 형태 false, 속성 형태 NULL |
| `attr_형태는_저장된_문자열을_돌려준다` | 코드 대상 `attr01`, 데이터 대상 `attr01` 각각 문자열 |
| `MASTER_AT_base_dt` `@ParameterizedTest` 8건 | 받음 3: `"20260906"` → `baseDt 2026-09-06T00:00`, `"20260906093000"` → `09:30:00`, NULL → false(조회 호출 0) / 평가 오류 5: `"2026-09-06"`, `"20260231"`, `"2026090"`, 숫자 `20260906`, `TRUE` |
| `인자_수_초과를_평가에서_만나면_평가_오류다` | `MASTER("PROC_CD", "BASE", "82", "attr01", "x")` 를 검사 없이 평가 → `EVALUATION_ERROR` |
| `EVAL_TS_KST_경계` `@ParameterizedTest` 2건 | `MASTER("PROC_CD", "COATING", "83")`: `2026-08-31T14:59:59Z`(KST 08-31 23:59:59, v1.001) false, `2026-08-31T15:00:00Z`(KST 09-01 00:00, v1.002) true |

**`ValueConverterTest` — 28건** (`@ParameterizedTest`, D2 표 그대로)

| 대상 타입 | 받는 사례(결과) | 거부 사례(`ValueConversionException`) |
|---|---|---|
| NUMBER | `BigDecimal("1.10")`→1.10(scale 유지), `Integer 3`→3, `Long 30000000000`→30000000000, `Double 0.1`→0.1, `"1.60"`→1.60, `"-2"`→-2 (6) | `"1e3"`, `"0xFF"`, `" 1"`, `"1,000"`, `"abc"`, `Boolean.TRUE`, `Double.NaN` (7) |
| STRING | `"A"`→"A", `BigDecimal("82.0")`→"82.0", `Integer 82`→"82" (3) | `Boolean.TRUE` (1) |
| BOOLEAN | `Boolean.TRUE`→TRUE, `"true"`→TRUE, `"FALSE"`→FALSE (3) | `"Y"`, `Integer 1` (2) |
| DATE | `Instant`→같은 값 (1) | `"20260101"` (1) |
| 모든 타입 | null → null (4) | — |

**`T/arch/TypeConversionEntryTest` — 2건 (수용 기준 6)**

| 테스트 | 규칙(ArchUnit, `DO_NOT_INCLUDE_TESTS`) |
|---|---|
| `도메인_검증기는_ValueConverter_convert_를_부른다` | `classes().that().implement(DomainValidator.class).should(callMethod(ValueConverter.class, "convert", Object.class, DataType.class))` — 커스텀 `ArchCondition`, 대상 1건 이상 |
| `domain_은_값_변환을_직접_하지_않는다` | `noClasses().that().resideInAPackage("..engine.domain..").should().callConstructor(BigDecimal.class, String.class)` / `callMethod(BigDecimal.class, "valueOf", …)` / `callMethod(Boolean.class, "parseBoolean", String.class)` / `callMethod(Boolean.class, "valueOf", String.class)` |

rule 패키지를 겨냥한 규칙은 두지 않는다. 지금은 대상이 비어 `failOnEmptyShould` 에 걸리고, 형제 Task 가 머지되는 순간 dev 를 빨강으로 만들 수 있다(D2).

### 3.2 `code` — 62건

**`DefaultCodeResolverTest` — 43건** (고정 데이터 `CodeFixtures.procCd()` = `sql/04-code-exists.sql` INSERT 그대로 + BASE 의 `def_target = CODE`(04:95))

| 테스트 | 사례 |
|---|---|
| `원천04_판정_표와_같다` `@CsvFileSource` 12건 (수용 기준 3) | `R/code/04-code-exists-expected.csv`: 기준일 {2024-06-01, 2025-03-01, 2026-07-15, 2026-09-10} × 코드 {82, 83, 84}, 카테고리 `COATING`. 기대값은 04:723-726 |
| `원천04_목록_열과_같다` `@ParameterizedTest` 4건 | 같은 네 기준일의 `codeList("PROC_CD", "COATING", dt)` 코드 = `82` / `82` / `82,84` / `82,83,84` |
| `버전_선택` `@ParameterizedTest` 8건 | `2024-06-01T00:00`→1.000(소급), `2024-12-31T23:59:59`→1.000(소급), `2025-01-01T00:00`→1.000, `2026-06-30T23:59:59`→1.000, `2026-07-01T00:00`→1.001, `2026-08-31T23:59:59`→1.001, `2026-09-01T00:00`→1.002, `2030-01-01T00:00`→1.002 |
| `apply_from_경계의_카테고리_소속` `@ParameterizedTest` 2건 | `83` in `COATING`: `2026-08-31T23:59:59` false, `2026-09-01T00:00` true |
| `CANCELLED_버전은_고르지_않는다` | 1.001 을 CANCELLED 로 바꾼 데이터에서 `2026-07-15` → 1.000 |
| `RELEASED_가_없으면_빈_값이고_false_다` | 모든 버전 DRAFT → `selectVersion` 빈 값, `isMember` false |
| `v1_000_에만_있다가_닫힌_카테고리` `@ParameterizedTest` 2건 | 보조 카테고리 `OLD`(REGEX `8[0-9]`, CODE, from 1.000 to 1.001)에서 `82`: `2025-03-01` true, `2026-07-15` false(04:728) |
| `REGEX_는_def_target_칸에_전체_일치다` `@ParameterizedTest` 5건 | 보조 코드 `STEEL`(lvl·attr 있음): CODE `8[0-9]`/`82` true, CODE `8`/`82` false(부분 일치 아님), LVL2 `KS-3`/lvl2=`KS-3` true, ATTR01 `^KR$`/attr01=`KR` true, ATTR01 `.*`/attr01=null false |
| `BASE_해석은_그_버전의_코드_전체다` | 1.000 → {81,82,83}, 1.001 → {81,82,83,84}(D4) |
| `카테고리가_비면_BASE_다` | `isMember("PROC_CD", null, "81", dt)` == `isMember(…, "BASE", …)`, 빈 문자열도 같다(D4) |
| `CodeEffLookup_집합이_있으면_그것을_쓴다` | 사본 집합 {81} 을 주면 `COATING` 에서 81 true |
| `CodeEffLookup_의_빈_집합은_소속_없음이다` | 빈 집합 → 82 false |
| `attr_는_소속일_때만_돌려준다` | 소속이면 `attrNN` 값, 비소속이면 빈 값 |
| `CODE_LIST_는_seq_다음_code_순이다` | seq 가 섞인 보조 데이터 → seq 오름차순, 같으면 code 순, seq NULL 은 뒤 |
| `DEPRECATED_마루_코드의_CODE_LIST_는_빈_목록이다` | 헤더 DEPRECATED → 빈 목록(02:426) |
| `effectiveCodes_는_CodeEffLookup_을_보지_않는다` | 사본 집합 {81} 을 줘도 `effectiveCodes("PROC_CD", 1.001, "COATING")` = {82, 84} |

**`MasterDataResolverTest` — 19건** (고정 데이터 `PortFixtures.port()`, §3.4 가정 시각)

| 테스트 | 사례 |
|---|---|
| `원천05_PORT_판정_7케이스` `@CsvFileSource` 7건 (수용 기준 4) | `R/code/05-port-cases.csv`: 05:464-470 표 그대로 |
| `REGEX_는_대상_칸_값에_전체_일치다` `@ParameterizedTest` 2건 (Build 추가, §9 이탈 6) | `KR`/KRPUS `2026-09-06` true(05:746 PORT.KR = {KRPUS}), `KR`/KRINC `2026-08-30` true(05:747 KRINC 는 09-01 09:00 전이면 PORT.KR 에서 true). 원천 7케이스에는 ATTR01 REGEX 가 참이 되는 사례가 없어 변이 I24a 가 살아남았다 |
| `선분_경계` `@ParameterizedTest` 3건 | `BASE`/KRINC `2026-09-01T08:59:59` true, `BASE`/KRINC `2026-09-01T09:00:00` false(valid_to 배타), `BASE`/KRPUS `2026-08-25T09:00:00` true(둘째 행 valid_from 포함) |
| `attr_형태` `@ParameterizedTest` 2건 | KRPUS `attr01` at `2026-09-06` → "KR", KRINC `attr01` at `2026-09-06` → 빈 값 |
| `폐기된_마루_데이터는_closed_at_부터_false_다` | `closedAt = 2026-09-05T00:00` → `09-04T23:59:59` true, `09-05T00:00` false |
| `닫았다_다시_연_빈_구간은_false_다` | 항목 행 [08-20, 08-25), [08-28, ∞) → `08-26` false |
| `대상이_없으면_false_다` `@ParameterizedTest` 3건 | key null, 없는 마루 데이터 `NOPE`, 없는 카테고리 `NOPE` |

### 3.3 `domain` — 73건

**`DefaultDomainValidatorTest` — 17건**

| 테스트 | 검사 |
|---|---|
| `컬럼_사전에_없으면_NOT_DEFINED_다` | `valid=false`, `value=null`, failures `[NOT_DEFINED]` |
| `공백만_있는_값은_NULL_로_보고_필수면_REQUIRED_다` `@ParameterizedTest` 3건 | `""`, `"   "`, `"\t\n"` + `required=true` → `[REQUIRED]` |
| `필수가_아니면_NULL_은_통과하고_식은_돌지_않는다` | 평가하면 예외가 나는 식을 둬도 `valid=true`, 식 호출 0 |
| `타입_변환_실패는_TYPE_CONVERSION_이고_식은_돌지_않는다` | NUMBER 컬럼에 `"abc"` → `[TYPE_CONVERSION]`, `value=null` |
| `표준식이_거짓이면_비즈니스식을_돌리지_않는다` | failures `[STD_EXPR]` 하나, 비즈니스 함수 호출 0 |
| `비즈니스_요구_변수_키가_없으면_BIZ_VAR_MISSING_이다` | message 에 변수 이름 |
| `키가_있고_값이_NULL_이면_누락이_아니다` | `COIL_NET_WGT = null` 을 넣으면 `BIZ_VAR_MISSING` 이 아니다(식이 NULL 을 막으면 통과) |
| `요구_변수_키는_대소문자를_가리지_않는다` | 레코드 키 `coil_net_wgt` 로도 찾는다 |
| `식_평가_예외는_EngineEvaluationException_RESULT_EVAL_이다` | `Violation.stage == RESULT_EVAL`, `code == EVALUATION_ERROR` |
| `레코드_예약_키는_EngineEvaluationException_INPUT_CHECK_이다` | 키 `_x` → `stage == INPUT_CHECK`, `code == RESERVED_KEY` |
| `결과의_value_는_변환된_값이다` | NUMBER 컬럼 `"1.60"` → `BigDecimal 1.60` |
| `식_결과가_NULL_이면_검증_실패다` | `STD_EXPR` failure(예외 아님) |
| `식_결과가_불린이_아니면_판정_오류다` | 식 `value + 1` → `EngineEvaluationException(EVALUATION_ERROR)` |
| `식_파싱_실패는_EngineEvaluationException_RESULT_EVAL_이다` `@ParameterizedTest` 2건 (Build 추가, §9 이탈 11) | 표준식 `NOPE_FN(value)`·비즈니스식 `NOPE_FN(value)`(비즈니스 함수가 빠진 경우) → 둘 다 `stage == RESULT_EVAL`, `code == EVALUATION_ERROR`. 비즈니스식 쪽은 요구 변수 계산에서 나는 파싱 실패가 `ExpressionFailure` 그대로 새던 결함을 잡는다 |

**`DomainKindExamplesTest` — 45건 (수용 기준 5)**

도메인 정의는 `DomainFixtures` 가 02 의 **자신의 식**만 적고, 유효 식은 `EffectiveExpressions` 로 조립한다(S8). 사례는 `R/domain/02-domain-kind-cases.csv`(`domain,value,extraVars,evalTs,valid,step`)이다. `value` 는 레코드에 넣는 원시 문자열이고(NUMBER 도메인은 `ValueConverter` 가 바꾼다), 공백이 뜻을 갖는 TEXT 사례 `" a "` 는 큰따옴표로 감싼다. `extraVars` 표기: 빈 칸 = 추가 키 없음, `NAME:N:19` = 키 `NAME` 에 `BigDecimal("19")`, `NAME:S:20260901` = 문자열, `NAME:NULL` = 키는 있고 값이 null, 여럿은 `;` 로 잇는다. 비즈니스 요구 변수는 변환하지 않고 그대로 들어가므로(§6.9) 숫자 변수는 반드시 `N`(`BigDecimal`)으로 준다. 문자열로 주면 EvalEx 의 타입 간 암묵 비교에 기대어 통과해 버린다(06:198 이 경고하는 모양).

| 02 칸 | 도메인(자신의 식 → 유효 식) | 사례 (값 → 결과) | 건수 |
|---|---|---|---|
| QTY | COIL_THK(10) `value >= 0.1 && value <= 3.5 && value % 0.1 == 0` | 0.1 T, 3.5 T, 2.0 T, 0.05 F(STD), 3.6 F(STD), 1.25 F(STD) | 6 |
| QTY 상속 | RMTL_COIL_THK(11) `value >= 1.6`(10 AND 11) | 1.6 T, 1.5 F(STD), 3.5 T | 3 |
| QTY 상속 | COIL_WGT: WGT `value > 0` AND `value <= 30` | 30 T, 30.001 F(STD), 0 F(STD) | 3 |
| QTY 상속 | COIL_PAK_WGT: 위 AND `value >= 1 && value <= 25` | 25 T, 26 F(STD), 0.5 F(STD) | 3 |
| QTY 비즈니스 | COIL_GRS_WGT: 표준 = COIL_WGT 유효 식, 비즈니스 `value >= COIL_NET_WGT` | 20·NET 19 T, 20·NET 21 F(BIZ_EXPR), 20·NET 없음 F(BIZ_VAR_MISSING) | 3 |
| CODE | PROC_CD·COATING, 자동 생성 `MASTER("PROC_CD", "COATING", value)` | 82 @09-10 T, 81 @09-10 F(STD), 83 @09-10 T, 83 @07-15 F(STD) | 4 |
| ID | COIL_ID(20) `STR_MATCHES(value, "^[A-Z0-9]{10,20}$")` | `ABCDE12345` T, 20자 `ABCDEFGHIJ0123456789` T, `abcde12345` F, `AB12` F | 4 |
| TEXT | CUST_NM `STR_TRIM(value) != ""` | `동국` T, ` a ` T | 2 |
| DATE 정규식 | DT(30) 일자 정규식 | `20240229` T, `20000229` T, `99991231` T, `20230229` F, `19000229` F, `20260231` F, `20261301` F, `2026-01-01` F | 8 |
| DATE 비즈니스 | SHIP_DT: 표준 = DT 유효 식, 비즈니스 `value >= PROD_START_DT` | `20260905`·`20260901` T, `20260830`·`20260901` F(BIZ_EXPR) | 2 |
| FLAG | USE_YN `value == "Y" \|\| value == "N"` | Y T, N T, y F | 3 |
| FLAG | GRADE_FLAG `value == "1" \|\| … \|\| value == "D"` | 1 T, D T, 5 F | 3 |
| TEXT 거짓 가지 | `STR_TRIM(value) != ""` 를 `MdmEvaluator` 로 직접 평가 | 값 `"   "` → false | 1(별도 `@Test`) |

TEXT 식의 거짓 가지는 `validate` 경로로는 닿지 않는다. 공백만 있는 값은 1단계 정규화에서 NULL 이 되어 식을 돌리지 않기 때문이다(02:384). 그래서 이 한 건은 식 수준에서 평가한다. 표의 칸마다 통과와 실패가 한 건 이상 있다.

**`EffectiveExpressionsTest` — 11건**

| 테스트 | 검사 |
|---|---|
| `두_단계_유효_텍스트는_02_예시와_같다` | [10 식, 11 식] → `(value >= 0.1 && value <= 3.5 && value % 0.1 == 0) && (value >= 1.6)`(02:343 예시 원문) |
| `한_단계는_자신의_식_그대로다` | [`value > 0`] → `value > 0` |
| `빈_식은_건너뛴다` | [`value > 0`, `value <= 30`, null] → 두 단계 결과와 같다 |
| `AST_조립은_유효_텍스트를_다시_파싱한_AST_와_같다` `@ParameterizedTest` 3건 | 한·두·세 단계 체인: `ast(자신 AST 목록)` == `AstExporter.export(text(자신 식 목록))` |
| `세_단계_AST_는_AND_AND_조부_부_자신_이다` | 루트 `&&` 의 왼쪽 자식이 `&&`, 오른쪽이 자신 AST(02:125) |
| `CODE_종류_MASTER_식` | `codeRefText(PROC_CD, COATING)` = `MASTER("PROC_CD", "COATING", value)`, `codeRefAst` = 그 텍스트의 `export` 결과 |
| `유효_코드_참조는_가장_가까운_지정값이다` `@ParameterizedTest` 2건 | [부모 A, 자식 null] → A, [부모 A, 자식 B] → B |
| `비즈니스_요구_변수는_value_와_상수를_뺀다` | `value >= COIL_NET_WGT && GRADE != NULL` → [`COIL_NET_WGT`, `GRADE`] |

### 3.4 테스트 리소스(원천 표 복사)와 가정

- `R/code/04-code-exists-expected.csv`: 머리 행 뒤의 `#` 주석에 출처(`04-master-code-deploy-full.md:719-726`, `sql/04-code-exists.sql`)를 적는다. 열: `baseDt,code,expected`. 12행. 기대값은 04 표의 82·83·84 열을 옮긴 것이다. 표 머리가 "`sql/04-code-exists.sql` 의 실행 결과(PostgreSQL 18 확인)"이므로 이 표가 곧 SQL 결과다. SQL 을 엔진 테스트에서 돌리지 않는다(04 SQL 은 PostgreSQL `~` 정규식을 쓰고, 엔진은 DB 없는 순수 Java 다). **H2·SQLite 는 추가하지 않는다.** 원천에 결과표가 있으므로 표 복사가 팀장 지시의 우선 방식이다.
- 04 SQL 과 Java 해석의 차이 한 가지: SQL 4단계는 REGEX 를 `p_value`(코드값)에 대조하지만, 04:187 은 `def_target` 칸에 대조하라고 정한다. 예제 데이터의 REGEX 는 BASE(`def_target = CODE`) 하나뿐이라 결과가 같다. Java 는 04:187 을 따른다.
- `R/code/05-port-cases.csv`: 머리 행 뒤의 `#` 주석에 출처 `05-master-data.md:460-470`. 열: `id,cate,key,baseDt,expected`. 기준일은 날짜라 `T00:00:00` 을 붙인다(05:380 "일자 타입이면 그날 00:00:00").
- **05 PORT 사건 시각 가정**: 원천은 사건 3(2026-08-20 09:00)·5(2026-08-25 09:00)·6(2026-09-01 09:00)의 시각만 준다(05:738). 나머지는 다음으로 정한다: 사건 1 BASE 생성 `2026-08-19T09:00`, 사건 4 KR 등록 `2026-08-21T09:00`, 사건 7 MAJOR 등록 `2026-09-02T09:00`, 사건 8 MAJOR 소속 저장 `2026-09-03T09:00`. 손 계산 결과 7케이스가 모두 원천 기대값과 같다. 특히 소급에 기대는 두 건을 확인했다: `BASE KRINC 08-15` 는 항목(08-20)과 BASE 행(08-19) 모두 최초 행 소급으로 true, `MAJOR KRINC 08-15` 는 MAJOR 행이 최초 행 소급으로 잡히지만 KRINC 소속 행이 없어 false.
- `R/domain/02-domain-kind-cases.csv`: 머리 행 뒤의 `#` 주석에 출처 `02-term-domain-column.md:55-60, 91-101, 994-1025`. 일자 정규식 219자는 CSV 가 아니라 `DomainFixtures` 상수로 둔다(정규식의 `|` 와 CSV 구분자가 섞이지 않게). CODE 사례의 `evalTs` 는 KST `2026-09-10T00:00` = `2026-09-09T15:00:00Z`, `2026-07-15T00:00` = `2026-07-14T15:00:00Z` 이다.

### 3.5 합계와 게이트 명령

| 영역 | 건수 |
|---|---|
| expr(`MdmExpressionConfigTest` 9 + `BusinessFunctionTest` 9 + `WhitelistParseTest` 17 + `ExpressionCheckerTest` 26 + `RegexPolicyTest` 30 + `AstExporterTest` 16 + `MdmEvaluatorTest` 15 + `InstrFunctionTest` 6 + `MasterFunctionTest` 16 + `ValueConverterTest` 28) | 172 |
| arch(`TypeConversionEntryTest`) | 2 |
| code(`DefaultCodeResolverTest` 43 + `MasterDataResolverTest` 19) | 62 |
| domain(`DefaultDomainValidatorTest` 17 + `DomainKindExamplesTest` 45 + `EffectiveExpressionsTest` 11) | 73 |
| **N(새 테스트)** | **309** (설계 305 + Build 추가 4, §9 이탈 6·11) |
| 계획 삭제(`ContractOnlyPhaseTest`) | −5 |
| **엔진 총수** | 76 − 5 + 309 = **380** |
| **백엔드 `testAll` 총수** | 518 − 5 + 309 = **822** |
| 프런트 m-mdm | 6(변화 없음, 스키마·TS 를 바꾸지 않는다) |

```bash
# 엔진만 빠르게 — 380건 실패 0 기대 (기준선 76건은 이번 Phase 에서 실측)
cd src/backend/maru-mdm-engine && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew test --no-daemon
grep -ho 'tests="[0-9]*"' build/test-results/test/*.xml | awk -F'"' '{s+=$2} END {print s}'   # 380
grep -ho 'failures="[0-9]*"\|errors="[0-9]*"' build/test-results/test/*.xml | sort | uniq -c   # 전부 0

# 백엔드 전체 — 822건 실패 0 기대 (mdm/lib 스모크가 ExpressionEvaluator 를 부른다)
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon

# 프런트 — 6건 실패 0, lint 통과(변화 없음 확인용)
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```

`be-run.sh`·`fe-run.sh`·`gradlew --stop`·`pkill` 은 쓰지 않는다. 명령은 포그라운드로 끝까지 돌린다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 테스트 |
|---|---|
| 1. 화이트리스트 밖 함수는 파싱 단계에서 거부 | `WhitelistParseTest` 17건: 사전 밖 함수 9종이 파싱에서 `Undefined function` 으로 거부되고(`check` 의 `PARSE`, `evaluate` 의 `ExpressionFailure(PARSE)`), 비즈니스 함수는 비즈니스 칸 밖 다섯 칸에서 저장 시 검사(파싱 직후 AST 검사)가 거부하며, 거부된 식은 한 번도 평가되지 않는다. 보조: `MdmExpressionConfigTest.baseBuilder_사전은_BASE_24종뿐이다`·`create_사전은_…`, `ExpressionCheckerTest`(`MASTER` 인자 모양·예약 변수) |
| 2. 동시 평가 1,000 스레드에서 결과 일치(캐시 copy 검증) | `MdmEvaluatorTest.동시_평가_1000_스레드_결과가_단일_스레드와_같다` + 결정적 짝 `평가_뒤_캐시_원본에는_값이_남지_않는다` + `같은_텍스트는_한_번만_컴파일한다` |
| 3. 04 판정 표(2024-06-01~2026-09-10)가 `sql/04-code-exists.sql` 결과와 일치 | `DefaultCodeResolverTest.원천04_판정_표와_같다` 12건 + `원천04_목록_열과_같다` 4건(04:721-726 을 리소스로 복사). 경계 보강: `버전_선택` 8건, `apply_from_경계의_카테고리_소속` 2건, `v1_000_에만_있다가_닫힌_카테고리` 2건(04:728) |
| 4. 05 PORT 판정 7케이스 통과 | `MasterDataResolverTest.원천05_PORT_판정_7케이스` 7건(05:464-470 을 리소스로 복사). 경계 보강 `선분_경계` 3건, REGEX 대상 칸 보강 `REGEX_는_대상_칸_값에_전체_일치다` 2건 |
| 5. 02 「도메인 종류」 예시 전부 테스트 | `DomainKindExamplesTest` 45건: QTY·CODE(자동 생성 MASTER)·ID·TEXT·DATE(정규식·비즈니스식)·FLAG(두 식)마다 통과·실패 사례, 02 상속 예(10·11, 중량 트리) 포함. 유효 식 조립은 `EffectiveExpressionsTest` 11건 |
| 6. 타입 변환 계약이 06 룰 엔진과 같은 함수를 쓴다 | 공개 단일 진입점 `expr.ValueConverter.convert(Object, DataType)`(rule·domain 이 모두 볼 수 있는 `expr`). `ValueConverterTest` 28건이 변환 표를 고정하고, `TypeConversionEntryTest` 2건이 도메인 검증기가 이 함수를 부르며 직접 변환하지 않음을 ArchUnit 으로 묶는다. rule 쪽 결속은 TSK-03-03 인계(D2) |

요구사항 줄별 대응(수용 기준 밖 요구사항):

| spec 요구사항 | 구현 · 테스트 |
|---|---|
| precision 68/HALF_EVEN, allowOverwriteConstants=false 설정 팩토리 | `MdmExpressionConfig.baseBuilder()`·`create()` · `MdmExpressionConfigTest` |
| 칸별 허용 함수 화이트리스트, Java 전용 정규식 거부, 예약 변수명 금지 | `ExpressionChecker`·`RegexPolicy`·`RecordKeys` · `WhitelistParseTest`·`ExpressionCheckerTest`·`RegexPolicyTest`·`MdmEvaluatorTest`(예약 키) |
| AstExporter, 컴파일 캐시 + copy(), 평가 타임아웃 | `AstExporter`·`MdmEvaluator` · `AstExporterTest`·`MdmEvaluatorTest` |
| REGEX(전체 일치, def_target 칸)·TABLE 카테고리 해석, BASE 예약 | `DefaultCodeResolver`·`MasterDataResolver` · `REGEX_는_def_target_칸에_전체_일치다`·`BASE_해석은…`·`카테고리가_비면_BASE_다` |
| 기준일 버전 선택(04 선분), 일시 선분(05) 판정, 최초 행 소급 | `DefaultCodeResolver`·`MasterDataResolver`·`Segments` · §3.2 |
| `MASTER`·`MASTER_AT`·`CODE_LIST`, 첫 인자로 코드·데이터 구분 | `MasterFunction`·`MasterAtFunction`·`MasterQuery`·`CodeResolver.codeList` · `MasterFunctionTest`·`CODE_LIST_…` |
| `validate` 순서 | `DefaultDomainValidator` · `DefaultDomainValidatorTest` |
| 상속 체인 AND 누적 유효 식 조립 | `EffectiveExpressions` · `EffectiveExpressionsTest` |
| 비즈니스식 변수 누락은 검증 실패 | `DefaultDomainValidator` · `비즈니스_요구_변수_키가_없으면_BIZ_VAR_MISSING_이다`, CSV COIL_GRS_WGT 사례 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

Build·Verify 는 규칙마다 변이를 넣어 빨강을 확인하고 되돌린다. 결과는 표로 보고한다.

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I1 | 설정 고정값 14개가 실제 설정에 들어간다(06:442, S1) | `baseBuilder()` 에서 `.allowOverwriteConstants(ALLOW_OVERWRITE_CONSTANTS)` 줄 삭제 → `create_설정이_고정값_14개와_같다` + `상수_사전이_남고…`. `.zoneId(ZONE)` 삭제 → 첫 테스트 |
| I2 | 엔진 사전 = `STANDARD` ∪ 비즈니스 함수. 사전 밖 함수는 파싱 오류다(S2) | `create` 가 `ExpressionConfiguration.defaultConfiguration().getFunctionDictionary()` 에 MDM 함수를 더한 사전을 쓰게 → `사전_밖_함수는_파싱_단계에서_거부된다` 9건 + `create_사전은_…` |
| I3 | `baseBuilder()` 사전 = `BASE` 24종(D3) | `baseBuilder()` 에서 `functionDictionary(...)` 호출 삭제 → `baseBuilder_사전은_BASE_24종뿐이다` |
| I4 | 비즈니스 함수는 `Slot.businessFunctions()` 가 참인 칸(`DOMAIN_BIZ`)에서만 허용 | 검사기가 칸을 무시하고 사전 전체를 허용 → `비즈니스_함수는_비즈니스_칸_밖에서_거부된다` 5건 |
| I5 | `DOMAIN_STD` 는 변수 `value` 하나만(EG §7) | `valueOnly()` 검사 삭제 → `DOMAIN_STD_는_value_외_변수를_거부한다` |
| I6 | 식 안의 `EVAL_TS`·`_` 접두 변수와 선언 변수명의 상수 8종·`_` 접두·`EVAL_TS` 는 거부(대소문자 무시, 06:347·422·424) | `_` 접두 검사 삭제 → `식_안의_예약_변수를_거부한다`(`_V1`·`_x`) + `선언_변수명_검사`(`_V1`). `equalsIgnoreCase` → `equals` → `eval_ts`·`null`·`Pi`·`e` 사례 |
| I7 | `MASTER` 3-4·`MASTER_AT` 4-5 인자, id·cate·attr 문자열 리터럴, attr ∈ `attr01`-`attr10`(06:339, `MdmFunction`) | 최대 인자 비교를 `> maxArgs + 1` 로 → `MDM_인자_모양`(인자 5·6 사례). attr 정규식에 대소문자 무시 추가 → `"ATTR01"` 사례 |
| I8 | `STR_MATCHES` 정규식: Java 전용 문법·중첩 수량자·Java 문법 오류 거부, 리터럴이 아니면 거부(S5) | 소유 한정자 검사 삭제 → `거부하는_패턴`(`a++`·`a*+`·`a?+`·`a{2,}+`). 중첩 수량자 검사 삭제 → 같은 테스트(`(a+)+` 등 5건). 비리터럴 허용 → `STR_MATCHES_패턴이_리터럴이_아니면_거부한다` |
| I9 | AST 내보내기: 자식이 없으면 `params` 키가 없고, 숫자 리터럴은 원문, 결과는 스키마 `AstNode` 를 통과한다 | 늘 `params` 를 넣게 → `자식_없는_노드와…` + `내보낸_AST_는_스키마…`(리터럴에 `params` → `additionalProperties`·`minItems`). 숫자 value 를 `new BigDecimal(v).toPlainString()` 으로 → `숫자_리터럴은_입력_원문이다` |
| I10 | 컴파일 캐시는 텍스트당 하나, 평가는 늘 `copy()` 사본이다(06:449) | `evaluate` 가 캐시 원본에 `withValues` → `평가_뒤_캐시_원본에는_값이_남지_않는다`(결정적) + 대개 `동시_평가_1000_스레드…`. 캐시 없이 매번 `new Expression` → `같은_텍스트는_한_번만_컴파일한다` |
| I11 | `EVAL_TS` 는 초 미만을 자르고, `MASTER` 는 `ZONE`(Asia/Seoul)으로 바꿔 판정한다(06:422, engine-contract §7) | `truncatedTo(SECONDS)` 삭제 → `EVAL_TS_는_초_미만을_자르고…`. `ZoneOffset.UTC` 사용 → `EVAL_TS_KST_경계` + 같은 테스트 |
| I12 | 평가 타임아웃을 넘으면 `EVALUATION_ERROR`(reason `TIMEOUT`)이고 작업을 인터럽트한다 | `future.get(timeout)` → `future.get()` → `타임아웃을_넘으면…`(선점 5 초 초과로 빨강). `cancel(true)` → `cancel(false)` → 같은 테스트의 인터럽트 래치 확인 |
| I13 | 레코드 예약 키: 상수 8종 → `CONSTANT_KEY`, `EVAL_TS` → `EVAL_TS_KEY`, `_` 접두 → `RESERVED_KEY`, 모두 모아 키 이름순 | `_` 접두 검사 삭제 → `레코드_예약_키`(`_V1`·`_x`) + `레코드_예약_키는_EngineEvaluationException_INPUT_CHECK_이다` |
| I14 | `INSTR` = 대소문자 구분 1부터, 없으면 0, NULL 인자면 NULL(S3) | `toUpperCase` 후 비교 → `INSTR("ABCDE", "cd")` 사례. NULL 인자에 0 반환 → NULL 사례 2건 |
| I15 | `MASTER` 첫 인자 가르기: `CodeLookup.code(id)` 가 있으면 코드 해석, 없으면 `MasterLookup`(S4) | 늘 `MasterLookup` 으로 → `첫_인자가_마루_코드면…` + 04 CODE 도메인 사례 |
| I16 | `MASTER_AT` 의 `base_dt` 는 8·14자리 숫자 문자열만, 달력상 없는 날짜·다른 타입은 평가 오류, NULL 은 false/NULL(S16) | 숫자 값 허용 → `MASTER_AT_base_dt`(숫자 사례). `ResolverStyle.STRICT` 대신 `SMART` → `"20260231"` 사례 |
| I17 | 속성 형태는 소속(유효)일 때만 값, 아니면 NULL | 소속 확인 없이 행 값 반환 → `attr_는_소속일_때만_돌려준다` + `MasterDataResolverTest.attr_형태`(KRINC) |
| I18 | 04 버전 선택: `apply_from <= dt < apply_to` 인 RELEASED, 없으면 최초 RELEASED(S9) | `dt < applyTo` → `dt <= applyTo` → `버전_선택`(`2026-07-01T00:00`·`2026-09-01T00:00`). CANCELLED 포함 → `CANCELLED_버전은…`. 소급 삭제 → `원천04_판정_표와_같다`(2024-06-01 행) + `버전_선택` 소급 2건 |
| I19 | 04 카테고리: V 에 유효한 행, 생기기 전이면 최초 정의, 닫혔으면 없음. TABLE 은 `eff_ver = max(cate.from_ver, V)`(S9) | TABLE 조회를 `eff_ver` 대신 V 로 → `원천04_판정_표와_같다`(2024-06-01·2025-03-01 의 82). 카테고리 소급 삭제 → 같은 행들. 닫힌 행도 소급 후보로 → `v1_000_에만_있다가_닫힌_카테고리`(2026-07-15) |
| I20 | REGEX 는 `def_target` 칸에 전체 일치, 칸이 NULL 이면 불일치(S10) | `matches()` → `find()` → `REGEX_는_def_target…`(CODE `8`/`82`). 늘 코드값에 대조 → 같은 테스트(LVL2·ATTR01) |
| I21 | `CodeEffLookup` 이 값을 주면 그것을 쓰고(빈 집합 = 소속 없음), `effectiveCodes` 는 늘 행으로 계산한다 | 빈 집합을 "계산 안 함"으로 취급 → `CodeEffLookup_의_빈_집합은…`. `effectiveCodes` 가 `CodeEffLookup` 을 먼저 보게 → `effectiveCodes_는…` |
| I22 | `CODE_LIST` 는 seq 오름차순(NULL 뒤), 같으면 code 순. DEPRECATED 는 빈 목록 | code 순만 → `CODE_LIST_는_seq_다음_code_순이다`. DEPRECATED 검사 삭제 → `DEPRECATED_마루_코드의…` |
| I23 | 05 선분: `valid_from <= dt < valid_to`, 가장 이른 행보다 앞이면 그 행, 데이터 `closed_at` 이후 false(S11) | `dt < validTo` → `<=` → `선분_경계`(KRINC 09:00:00). `validFrom <= dt` → `<` → 같은 테스트(KRPUS 08-25 09:00). 최초 행 소급 삭제 → `원천05_PORT_판정_7케이스`(KRINC 08-15). `closedAt` 무시 → `폐기된_마루_데이터는…` |
| I24 | 05 소속: REGEX 는 대상 칸 전체 일치, TABLE 은 소속 선분 행 | REGEX 대상 칸을 늘 KEY 로 → `REGEX_는_대상_칸_값에_전체_일치다`(Build 추가 — 원천 7케이스의 KR·CNSHA 는 거짓이라 이 변이를 잡지 못한다, §9). TABLE 소속 확인 삭제 → 같은 테스트(MAJOR·KRINC) |
| I25 | `validate` 순서: NOT_DEFINED → 예약 키 → 정규화 → 필수 → 변환 → 유효 표준식 → 유효 비즈니스식, 앞 단계 실패에서 멈춘다(S7) | 정규화 삭제 → `공백만_있는_값은…` 3건. 필수 검사를 식 뒤로 → `필수가_아니면_NULL_은…`. 표준식 실패 뒤에도 비즈니스식 평가 → `표준식이_거짓이면…` |
| I26 | 비즈니스 요구 변수 = 정의 목록 ∪ 유효 비즈니스식의 사용 변수 − `value`. 키가 없으면(대소문자 무시) `BIZ_VAR_MISSING`, 값이 NULL 이면 누락 아님 | 누락 검사 삭제 → `비즈니스_요구_변수_키가_없으면…` + CSV COIL_GRS_WGT(NET 없음, 판정 오류로 바뀜). `containsKey` → `get(...) != null` → `키가_있고_값이_NULL_이면…`. 대소문자 구분 맵 → `요구_변수_키는_대소문자를…` |
| I27 | 값 변환 표(D2): 숫자 문자열은 `^[+-]?[0-9]+(\.[0-9]+)?$` 만, 지수·16진·공백·구분 기호 거부, BOOLEAN 문자열은 `true`/`false`(대소문자 무시)만 | `new BigDecimal(s)` 로 바로 변환 → `ValueConverterTest`(`1e3`). `Boolean.parseBoolean` → `"Y"` 사례(false 로 받아들여짐) |
| I28 | 도메인 검증기는 `ValueConverter.convert` 만으로 변환한다 | 검증기에서 `new BigDecimal((String) raw)` → `TypeConversionEntryTest` 2건 |
| I29 | 유효 식 조립: 2개 이상이면 `(a) && (b)…`, 1개면 그대로, null·빈 식은 건너뜀. AST 는 왼쪽 중첩 AND 이고 텍스트 재파싱 결과와 같다(S8) | AST 를 오른쪽 중첩으로 → `AST_조립은…`(세 단계) + `세_단계_AST_는…`. 괄호 생략 → `두_단계_유효_텍스트는_02_예시와_같다` |
| I30 | CODE 종류 자동 식은 `MASTER("<마루 코드>", "<카테고리>", value)`, 카테고리가 비면 `BASE`, 유효 참조는 가장 가까운 지정값(S8, D4) | 가장 먼 값 선택 → `유효_코드_참조는…`[부모 A, 자식 B]. cate null 을 그대로 → `카테고리가_비면_BASE_다` |
| I31 | `expr` 에 record·enum 을 새로 두지 않는다(F18) | `ExpressionChecker.Problem` 을 record 로 → 영구 `EngineContractSchemaTest.expr_rule_패키지의_record_enum…` |
| I32 | `MdmExpressionConfig` 는 상수 홀더 모양 그대로다(F17) | `private static Map<…> CACHE = new HashMap<>()`(final 아님) 추가 → 영구 `상수_홀더는_final_이고…` |
| I33 | 패키지 의존 방향(F19): domain 은 code 를 보지 않는다 | `DefaultDomainValidator` 가 `DefaultCodeResolver` 를 import → 영구 `domain_은_rule_과_code_를_보지_않는다` |
| I34 | main 의존은 EvalEx·java 표준뿐, networknt 는 test 전용(F20) | main 에서 `com.networknt` import → 영구 `engine_은_EvalEx_와_java_표준_외에…` |
| I35 | 스캐폴드 `ExpressionEvaluator.evaluate(String) → BigDecimal` 시그니처 유지 | 메서드 이름·반환 타입 변경 → `ExpressionEvaluatorTest` 컴파일 실패 + `mdm/lib` 스모크(`testAll`) |
| I36 | 비즈니스 함수 적재 규칙(engine-contract §5 1-3) | 이름 충돌 검사 삭제 → `적재를_거부하는_이름`(`MASTER`·`IF`·`DT_NOW`). nullable 검사 삭제 → `nullable_false_…` |

덮지 못하는 변이(보고에 적는다): 1,000 스레드 테스트는 값 섞임을 확률적으로만 잡는다(I10 의 결정적 짝이 보완한다). 영구 테스트 파일·계약 파일이 바이트 동일인지는 자동 테스트가 없다. Verify 가 `/usr/bin/git diff origin/dev -- <§2.5 목록>` 이 비어 있는지 본다.

---

## 6. 상세 설계

### 6.1 `MdmExpressionConfig` 몸체 (D3)

```java
public static ExpressionConfiguration.ExpressionConfigurationBuilder baseBuilder() {
    return ExpressionConfiguration.builder()
            .mathContext(MATH_CONTEXT).zoneId(ZONE).locale(LOCALE)
            .regexTimeoutMillis(REGEX_TIMEOUT_MILLIS).maxRecursionDepth(MAX_RECURSION_DEPTH)
            .allowOverwriteConstants(ALLOW_OVERWRITE_CONSTANTS).lenientMode(LENIENT_MODE)
            .arraysAllowed(ARRAYS_ALLOWED).structuresAllowed(STRUCTURES_ALLOWED)
            .implicitMultiplicationAllowed(IMPLICIT_MULTIPLICATION_ALLOWED)
            .singleQuoteStringLiteralsAllowed(SINGLE_QUOTE_STRING_LITERALS_ALLOWED)
            .binaryAllowed(BINARY_ALLOWED).stripTrailingZeros(STRIP_TRAILING_ZEROS)
            .decimalPlacesRounding(DECIMAL_PLACES_ROUNDING)
            .functionDictionary(FunctionDictionaries.base());          // D3 — EvalEx 표준 사전이 새지 않게
}

public static ExpressionConfiguration create(EngineLookups lookups) {
    return baseBuilder().functionDictionary(FunctionDictionaries.engine(lookups)).build();
}
```

- `FunctionDictionaries.base()` 는 `ExpressionConfiguration.defaultConfiguration().getFunctionDictionary()` 에서 `FunctionSets.BASE` 24개 이름만 골라 `MapBasedFunctionDictionary.ofFunctions(...)` 로 만든다. 표준 함수 객체는 상태가 없어 공유해도 된다.
- `FunctionDictionaries.engine(lookups)` = BASE 24 + `INSTR` + `MASTER` + `MASTER_AT` + 비즈니스 함수. `MASTER`·`MASTER_AT` 는 `new MasterQuery(lookups.codes(), new DefaultCodeResolver(lookups.codes(), lookups.codeEff()), lookups.masters())` 하나를 공유한다.
- 비즈니스 함수 적재 규칙(engine-contract §5): 이름 `^[A-Z][A-Z0-9_]*$`, `STANDARD`·EvalEx 표준 사전 이름과 겹치면 `IllegalArgumentException`. 같은 이름이 둘이어도 거부한다.
- `MdmExpressionConfig` 에는 필드를 더하지 않는다(I32). 사전 조립 코드는 모두 `FunctionDictionaries` 에 둔다.

### 6.2 식 함수

| 함수 | 선언 | 동작 |
|---|---|---|
| `INSTR` | `@FunctionParameter(name = "s")`, `@FunctionParameter(name = "sub")` | 인자 중 하나라도 `isNullValue()` 면 `EvaluationValue.nullValue()`. 아니면 `numberValue(BigDecimal.valueOf(s.indexOf(sub) + 1))`(UTF-16 위치, 1부터) |
| `MASTER` | `id`, `cate`, `key`, `attr`(`isVarArg = true`) | 인자 수가 3·4 가 아니면 `EvaluationException`(05:400 "평가에서 만나면 평가 오류"). `baseDt` = `expression.getDataAccessor().getData(ReservedNames.EVAL_TS)` 의 `Instant` → `LocalDateTime.ofInstant(…, MdmExpressionConfig.ZONE)`. `EVAL_TS` 가 없으면 `EvaluationException` |
| `MASTER_AT` | `id`, `cate`, `key`, `base_dt`, `attr`(`isVarArg = true`) | 인자 수 4·5. `base_dt` 해석은 S16: NULL → 불리언 false·속성 NULL, 문자열 8자리 `uuuuMMdd` → 그날 00:00, 14자리 `uuuuMMddHHmmss` → 그 시각(`ResolverStyle.STRICT`), 그 밖(다른 길이·비숫자·숫자 타입·불린·달력상 없는 날짜) → `EvaluationException` |

`MasterQuery` 공통 규칙(S4):

1. `id`·`cate` 는 문자열 값이어야 한다(아니면 `EvaluationException`). `cate` 가 null·빈 문자열이면 `"BASE"`(D4).
2. `key` 가 NULL 이면 불리언 형태 false, 속성 형태 NULL. 숫자 key 는 `toPlainString()` 문자열로 본다.
3. `attr` 는 `attr(0[1-9]|10)` 이어야 하고 번호 1-10 으로 바꾼다. 아니면 `EvaluationException`.
4. `codes.code(id).isPresent()` 면 코드 대상: `resolver.isMember(...)`·`resolver.attr(...)`. 아니면 데이터 대상: `masters.isValid(...)`·`masters.attr(...)`.
5. 속성 결과가 빈 값이면 `nullValue()`, 있으면 `stringValue(v)`.

`BusinessFunctionAdapter`(engine-contract §5 규칙 2-4): 인자 정의는 `FunctionParameterDefinition.builder()` 로 만들고 `varArgs` 면 마지막을 가변으로 둔다. 인자는 NUMBER → `BigDecimal`, STRING → `String`, BOOLEAN → `Boolean`, NULL → null 로 바꾸고 그 밖(DATE_TIME 등)은 `EvaluationException`. `nullable=false` 자리에 NULL 이 오면 본문을 부르지 않고 `EvaluationException`. 반환이 허용 타입이 아니거나 본문이 예외를 던지면 `EvaluationException`(메시지에 함수 이름).

### 6.3 `MdmEvaluator` — 캐시·`copy()`·`EVAL_TS`·타임아웃

```java
public final class MdmEvaluator {
    public static final Duration DEFAULT_TIMEOUT = Duration.ofSeconds(1);
    public MdmEvaluator(EngineLookups lookups)                       // DEFAULT_TIMEOUT
    public MdmEvaluator(EngineLookups lookups, Duration timeout)
    public ExpressionConfiguration configuration()                   // MdmExpressionConfig.create(lookups) 한 번
    public Set<String> businessFunctionNames()                       // 대문자
    public void compile(String text)                                 // 캐시에 넣기만. 파싱 실패는 ExpressionFailure(PARSE)
    public Set<String> usedVariables(String text)                    // 캐시 원본의 getUsedVariables() 복사본(대소문자 무시 TreeSet)
    public EvaluationValue evaluate(String text, Map<String, ?> values, Instant evalTs)
    int cacheSize()                                                  // 테스트용 package-private
    Expression cachedOriginal(String text)                           // 테스트용 package-private
}
```

- **캐시**: `ConcurrentHashMap<String, Expression>`. `computeIfAbsent(text, t -> { Expression e = new Expression(t, config); e.validate(); return e; })`. `validate()` 로 AST 를 만든 뒤에만 넣는다(F3). `ParseException` 은 람다 안에서 `ExpressionFailure(PARSE, EVALUATION_ERROR)` 로 감싸 던지고, 그러면 캐시에 들어가지 않는다. 캐시 원본은 밖으로 내보내지 않는다(테스트용 package-private 접근자만 있다).
- **평가**: `Expression copy = original.copy()` → `copy.withValues(values)` → `copy.with(EVAL_TS, evalTs.truncatedTo(ChronoUnit.SECONDS))` → `copy.evaluate()`. 레코드에 이미 `EVAL_TS` 키가 있으면 호출자가 `RecordKeys` 로 먼저 막는다(엔진 내부 키 `_V<id>` 를 넣는 룰 엔진 때문에 `evaluate` 는 키를 따로 검사하지 않는다).
- **타임아웃**: 인스턴스마다 `ExecutorService executor = Executors.newVirtualThreadPerTaskExecutor()` 하나. `Future<EvaluationValue> f = executor.submit(() -> …평가…)`, `f.get(timeout)`. `TimeoutException` 이면 `f.cancel(true)` 후 `ExpressionFailure(TIMEOUT, EVALUATION_ERROR)`. `ExecutionException` 은 원인에 따라 `UnsupportedOperationException`("Can't set value for constant") → `CONSTANT_KEY`(name = 그 키), `EvaluationException`·`ParseException`·그 밖 `RuntimeException`(EvalEx NPE 포함) → `EVALUATION_ERROR`. 호출 스레드가 인터럽트되면 인터럽트 표지를 되살리고 `EVALUATION_ERROR` 로 던진다. CPU 만 쓰며 끝나지 않는 평가는 인터럽트로 멈추지 않는다(호출자는 타임아웃으로 풀려난다). 이 한계는 Javadoc 에 적는다.
- **1,000 스레드 테스트 절차**: ① 같은 평가기로 i = 0..999 의 기대값을 한 스레드에서 먼저 계산한다. ② `CountDownLatch start = new CountDownLatch(1)`, `done = new CountDownLatch(1000)`. ③ 플랫폼 스레드 1,000 개가 `start.await()` 후 자기 i 로 두 식을 평가해 `results[i]` 에 넣고 `done.countDown()`. ④ `start.countDown()`, `done.await(60, SECONDS)` 가 참이어야 한다. ⑤ 두 배열이 같다(숫자는 `compareTo`). 실패한 스레드의 예외는 `ConcurrentLinkedQueue` 에 모아 비어 있는지 본다. 평가기 타임아웃은 30 초로 넉넉히 둔다(스레드 1,000 개가 몰려도 거짓 타임아웃이 나지 않게).
- **타임아웃 테스트의 느린 함수**: `FunctionProvider` 로 0인자 비즈니스 함수 `SLOW()` 를 준다. 본문은 `entered.countDown()` 후 `release.await(10, SECONDS)`(아무도 내리지 않는 래치)를 기다리고, `InterruptedException` 이 나면 `interrupted.countDown()` 을 한다. 평가기 타임아웃 50 ms. 기다림은 유한(10 초)해서 타임아웃을 없애는 변이에서도 스레드가 결국 끝난다. 테스트는 `assertTimeoutPreemptively(5 초)` 로 상한을 둔다.

### 6.4 `ExpressionChecker` — 저장 시 검사

`check(String text, FunctionSets.Slot slot) → List<Problem>`(빈 목록이면 통과). 문제를 모두 모아 돌려준다. `Problem` 은 중첩 **final class**(record 금지, I31)이고 `kind()`·`detail()` 을 갖는다. kind 는 문자열 상수 `PARSE`·`FUNCTION`·`VARIABLE`·`RESERVED`·`MDM_ARGUMENT`·`REGEX` 이다.

1. `new Expression(text, evaluator.configuration())` 를 만들고 `validate()`. `ParseException` 이면 `PARSE` 하나로 끝낸다(사전 밖 함수·인자 부족·문법 축소 위반이 여기서 걸린다).
2. `getAllASTNodes()` 를 돈다. `FUNCTION` 노드 이름(대문자, `Locale.ROOT`)이 `STANDARD ∪ (slot.businessFunctions() ? 비즈니스 이름 : ∅)` 밖이면 `FUNCTION`.
3. `MASTER`·`MASTER_AT` 노드: 인자 수가 `MdmFunction.minArgs()..maxArgs()` 밖이면 `MDM_ARGUMENT`. 첫째·둘째 인자가 `STRING_LITERAL` 이 아니면 `MDM_ARGUMENT`. `attr` 자리(MASTER 넷째, MASTER_AT 다섯째)가 있으면 `STRING_LITERAL` 이고 `attr(0[1-9]|10)` 이어야 한다. ID·카테고리·라벨이 실제로 있는지는 원장을 봐야 하므로 서버 몫이다(06:339).
4. `STR_MATCHES` 노드: 둘째 인자가 `STRING_LITERAL` 이면 `RegexPolicy.violations(value)` 를 `REGEX` 로 옮긴다. 리터럴이 아니면 `REGEX`(패턴을 검사할 수 없기 때문이다. 기본값 결정, 06:346 의 검사 목적에 맞춘 것이다).
5. `getUsedVariables()`: `EVAL_TS`(대소문자 무시)·`_` 접두는 `RESERVED`. `slot.valueOnly()` 면 `value`(대소문자 무시) 밖의 변수는 `VARIABLE`.

`static List<Problem> checkVariableName(String name)`: 상수 8종(대소문자 무시)·`_` 접두·`EVAL_TS` 면 `RESERVED`(06:347).

결과 타입(boolean 인지)은 정적으로 알 수 없어 테스트 케이스 평가로 확인하는 서버 몫이다(06:446). 이 Task 는 검사기를 만들 뿐 저장 트랜잭션을 만들지 않는다.

### 6.5 `RegexPolicy`

`static List<String> violations(String pattern)`: 비었으면 통과. 검사 항목은 다음과 같다.

| 항목 | 판정 | 이유 |
|---|---|---|
| Java 문법 오류 | `Pattern.compile` 이 `PatternSyntaxException` | 04:200 REGEX 저장 검사와 같다 |
| 인라인 플래그 | `(?` 뒤에 영문자·`-` 가 오고 `)` 또는 `:` 로 끝나는 꼴(`(?i)`, `(?i:…)`, `(?-i)`) | 06:346. `(?:`·`(?=`·`(?!`·`(?<=`·`(?<!` 는 JS 도 있어 허용 |
| 원자 그룹 | `(?>` | 06:346 |
| 소유 한정자 | 수량자(`*`·`+`·`?`·`}`) 바로 뒤의 `+` | 06:346 |
| Java 전용 이스케이프 | `\Q`·`\E`·`\A`·`\Z`·`\z`·`\G`·`\p`·`\P` | JS `RegExp`(u 플래그 없음)에서 글자 그대로 읽혀 조용히 결과가 갈린다 |
| 문자 클래스 교집합 | 클래스 안의 `&&` | JS 에 없다 |
| 중첩 수량자 | 수량자(`*`·`+`·`{n,}`·`{n,m}` m ≥ 2)가 붙은 그룹 안에 무한 수량자(`*`·`+`·`{n,}`)가 있다 | EG:144, 06:449. 길이는 기준이 아니다 |

구현 요령: 문자를 한 번 훑으며 이스케이프(`\x` 두 글자)와 문자 클래스(`[...]`, 중첩 `[`·이스케이프 고려)를 건너뛰고, 그룹 스택에 "안에 무한 수량자가 있었는가"를 쌓는다. `(a|aa)+` 같은 겹치는 선택지는 잡지 못한다(한계, Javadoc 에 적는다). 02 일자 정규식은 그룹에 수량자가 붙지 않아 통과한다.

### 6.6 `AstExporter`

- `static Map<String, Object> export(String text, ExpressionConfiguration configuration) throws ParseException`: 원천 샘플 그대로(F27). `toMap(ASTNode)` 는 `LinkedHashMap` 에 `type`(`token.getType().name()`), `value`(`token.getValue()`), 자식이 있을 때만 `params` 를 넣는다.
- `static AstNode toAstNode(ASTNode node)`: 계약 record 로 바꾼다. 토큰 타입이 `AstNode.Type` 여섯 밖이면 `IllegalArgumentException`(설정상 나오지 않는다). 자식이 없으면 `List.of()`.
- 원천 샘플의 `assertDomainRule` 은 옮기지 않는다. `ExpressionChecker` 가 칸 단위로 대신한다. 대문자 변환은 `Locale.ROOT` 로 한다.
- 스키마 적합 검사(D5)는 테스트에서 한다: 스키마 정본을 Jackson 으로 읽어 루트에 `"$ref": "#/$defs/AstNode"` 를 더한 노드를 만들고, `JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(node)` 로 스키마를 얻어 `validate(mapper.valueToTree(map))` 결과가 비었는지 본다. 1.5.9 API 이름이 다르면 Build 가 jar 를 `javap` 로 확인해 맞추고 이탈을 추기한다.

### 6.7 `ValueConverter` — 타입 변환 공개 단일 진입점 (D2)

`public static Object convert(Object value, DefinitionLookup.DataType type)`: 실패하면 `ValueConversionException`(메시지에 값 타입과 대상 타입). 도메인 검증(02 3단계)과 룰 판정(06:198 엔진 계약 2)이 같은 함수를 쓴다.

| 대상 | 입력 → 결과 | 거부 |
|---|---|---|
| (모든 타입) | null → null | — |
| NUMBER | `BigDecimal` → 그대로(scale 유지) · `Integer`·`Long`·`Short`·`Byte` → `BigDecimal.valueOf(long)` · `BigInteger` → `new BigDecimal(bi)` · `Double`·`Float` → `new BigDecimal(Double.toString(d))`(유한값만) · `String` 이 `^[+-]?[0-9]+(\.[0-9]+)?$` 에 맞으면 `new BigDecimal(s)` | 지수(`1e3`)·16진(`0xFF`)·앞뒤 공백·천 단위 구분 기호·빈 문자열·`.5` 꼴·NaN·무한대·`Boolean`·그 밖 타입 |
| STRING | `String` → 그대로 · `BigDecimal` → `toPlainString()` · 정수 `Number` → `toString()` | `Boolean`, `Double`·`Float`(표기 모호), 그 밖 타입 |
| BOOLEAN | `Boolean` → 그대로 · `String` 이 `true`/`false`(대소문자 무시) → `Boolean` | 그 밖 문자열(`Y`, `1`), `Number`, 그 밖 타입 |
| DATE | `Instant` → 그대로 | 그 밖 전부(DATE 는 결과 변수 선언에만 온다, F23) |

- 소수 자리수(`scale`)로 반올림하거나 자르지 않는다. 자리수 검사는 도메인 식(`value % 0.1 == 0`)과 DDL 의 몫이다(기본값 결정).
- 1단계 빈 값 정규화는 이 함수가 아니라 도메인 검증기가 한다(공백만 있는 문자열 → NULL). 룰 판정은 정규화를 하지 않는다(06 에 해당 규칙이 없다).

### 6.8 `EffectiveExpressions` — 상속 체인 AND 누적 조립

| 메서드 | 규칙 |
|---|---|
| `static String text(List<String> ownRootFirst)` | null·공백 식은 건너뛴다. 0개면 null, 1개면 그 식 그대로, 2개 이상이면 `"(" + a + ") && (" + b + ")"…` 왼쪽부터 잇는다(02 예: `(10 식) && (11 식)`) |
| `static Map<String, Object> ast(List<Map<String, Object>> ownAstsRootFirst)` | null 은 건너뛴다. 0개면 null, 1개면 그대로(복사), 2개 이상이면 왼쪽 중첩 `{"type":"INFIX_OPERATOR","value":"&&","params":[acc, next]}`. 재파싱하지 않는다(02:125) |
| `static String codeRefText(CodeRef ref)` | `MASTER("<id>", "<cate>", value)`. cate 가 null·빈 값이면 `BASE`. 문자열 리터럴 안의 `"`·`\` 는 이스케이프 |
| `static Map<String, Object> codeRefAst(CodeRef ref)` | 위 텍스트와 같은 모양의 FUNCTION 노드(STRING_LITERAL 둘 + VARIABLE_OR_CONSTANT `value`) |
| `static CodeRef effectiveCodeRef(List<CodeRef> rootFirst)` | 뒤(자신)에서부터 첫 non-null(02:115 "가장 가까운 지정값") |
| `static List<String> bizRequiredVars(String effectiveBizText, MdmEvaluator evaluator)` | `evaluator.usedVariables(text)` 에서 `value`(대소문자 무시)를 뺀 이름, 정렬 |

EvalEx AST 에는 괄호 노드가 없으므로 `ast(목록)` 과 `AstExporter.export(text(목록))` 은 같아야 한다(`EffectiveExpressionsTest` 가 고정). 만약 EvalEx 가 괄호를 노드로 남기는 사실이 드러나면 Build 는 이 테스트의 비교 기준을 "괄호 노드를 걷어 낸 트리"로 바꾸고 이탈을 추기한다.

### 6.9 `DefaultDomainValidator`

생성자 `DefaultDomainValidator(DefinitionLookup definitions, MdmEvaluator evaluator)`. domain 은 code 를 보지 않는다(I33).

```
validate(table, column, record, evalTs):
  def = definitions.column(table, column)         없으면 → (false, null, [NOT_DEFINED])
  keyViolations = RecordKeys.violations(record)   있으면 → throw EngineEvaluationException(위반마다 Violation(INPUT_CHECK, code, null, null, key, msg))
  ci = 대소문자 무시 TreeMap 으로 record 복사
  raw = ci.get(column)
  1 raw 가 String 이고 isBlank() → null
  2 raw == null → required ? (false, null, [REQUIRED]) : (true, null, [])
  3 v = ValueConverter.convert(raw, def.dataType())       실패 → (false, null, [TYPE_CONVERSION])
  4 std = def.effectiveStdExpr() ?? (def.domainKind() == CODE && def.codeRef() != null ? EffectiveExpressions.codeRefText(def.codeRef()) : null)
    std != null 이고 evalBoolean(std, {value: v}) 가 거짓 → (false, v, [STD_EXPR])
  5 biz = def.effectiveBizExpr()
    biz != null:
      need = def.bizRequiredVars() ∪ EffectiveExpressions.bizRequiredVars(biz, evaluator)
      missing = need 중 ci 에 키가 없는 것 → 있으면 (false, v, [BIZ_VAR_MISSING(이름 목록)])
      ctx = {value: v} + need 마다 ci 의 값(그대로)
      evalBoolean(biz, ctx) 가 거짓 → (false, v, [BIZ_EXPR])
  → (true, v, [])

evalBoolean(text, ctx):
  r = evaluator.evaluate(text, ctx, evalTs)     ExpressionFailure → throw EngineEvaluationException(Violation(RESULT_EVAL, f.code(), null, null, f.name(), msg))
  r.isNullValue() → false        (06 Expression 셀 규칙과 같이 NULL 은 거짓으로 본다)
  r.isBooleanValue() → 그 값
  그 밖 → throw EngineEvaluationException(RESULT_EVAL, EVALUATION_ERROR, …)
```

- **Stage 매핑(기본값)**: `Violation.stage` 는 필수인데 enum 다섯 값이 모두 룰 단계다. enum 을 바꾸면 스키마 E6 과 TS 재생성으로 번지므로 바꾸지 않고, 레코드 키 위반은 `INPUT_CHECK`, 식 평가 오류는 `RESULT_EVAL` 로 옮긴다.
- CODE 종류는 유효 표준식이 비어 있을 때만 자동 `MASTER` 식을 쓴다. 서버가 조립 때 이미 `MASTER` 를 끼워 넣었다면(02:114) 그 텍스트를 그대로 평가한다. 어느 쪽이든 결과가 같다(기본값 결정).
- 비즈니스 요구 변수 값은 변환하지 않고 그대로 넣는다. 그 변수의 도메인 타입을 이 컬럼 정의로는 알 수 없고, 값은 백엔드가 표준 물리명으로 채워 넣는 것이기 때문이다(02:180). EvalEx 가 `Number` 를 `BigDecimal` 로 바꾼다(EG §5).
- 표준식이 거짓이면 비즈니스식을 돌리지 않는다. 02:387 "유효 표준식 → 유효 비즈니스식 순"을 앞 단계 실패에서 멈추는 순서로 읽었다(기본값 결정).

### 6.10 `DefaultCodeResolver` (04)

생성자 `DefaultCodeResolver(CodeLookup codes, CodeEffLookup codeEff)`. 정규식은 `ConcurrentHashMap<String, Pattern>` 로 캐시한다.

| 메서드 | 규칙 |
|---|---|
| `selectVersion(id, dt)` | RELEASED 행 중 `applyFrom <= dt < applyTo` 인 것. 없으면 RELEASED 중 가장 작은 ver. RELEASED 가 없거나 마루 코드가 없으면 빈 값. 조건에 맞는 행이 둘 이상이면(데이터 오류) 가장 작은 ver 를 쓴다 |
| `resolve(rows, cate, V)`(내부) | ① `codeEff.codes(id, V, cate)` 가 값을 주면 그것(빈 집합 = 소속 없음). ② 아니면 행으로 계산: 유효 코드 = `fromVer <= V < toVer` 인 ITEM. 카테고리 행 = `fromVer <= V < toVer` 인 것, 없고 `V < min(fromVer)` 이면 가장 이른 행(소급), 그 밖이면 빈 집합. `effVer = max(행.fromVer, V)`. REGEX 는 유효 ITEM 마다 `defTarget` 칸 값(CODE → code, LVLn → `lvl.get(n-1)`, ATTRnn → `attrs.get(nn-1)`)이 null 이 아니고 `matches()`. TABLE 은 `cateId` 가 같고 `fromVer <= effVer < toVer` 인 CATE_ITEM 의 code ∩ 유효 코드 |
| `isMember(id, cate, code, dt)` | code null → false. V 없음 → false. `resolve` 에 code 가 있으면 true |
| `attr(id, cate, code, dt, n)` | `isMember` 가 참일 때 V 에 유효한 그 code ITEM 의 `attrs.get(n-1)`(null 이면 빈 값) |
| `codeList(id, cate, dt)` | 헤더 DEPRECATED → 빈 목록. V 의 `resolve` 결과를 V 에 유효한 ITEM 과 이어 `CodeListEntry(code, name, alterName, seq)`, seq 오름차순(NULL 뒤) → code 순 |
| `effectiveCodes(id, ver, cate)` | ② 행 계산만 한다(`CodeEffLookup` 을 보지 않는다. 사본 적재가 이 결과로 `TB_MDM_CODE_CATE_EFF` 를 만든다, 04:732) |

`cate` 가 null·빈 문자열이면 `"BASE"` 로 바꾼다(D4). BASE 도 다른 REGEX 카테고리처럼 행으로 해석한다.

### 6.11 `MasterDataRows`·`MasterDataResolver` (05, D1)

```java
public record MasterDataRows(DataHeader header, List<DataItemRow> items, List<DataCateRow> categories,
                             List<DataCateItemRow> cateItems) {
    public record DataHeader(String maruDataId, String status, LocalDateTime closedAt) {}
    public record DataItemRow(String code, String name, String alterName, Integer seq,
                              List<String> lvl, List<String> attrs, LocalDateTime validFrom, LocalDateTime validTo) {}
    public record DataCateRow(String cateId, String defKind, String defExpr, String defTarget,
                              LocalDateTime validFrom, LocalDateTime validTo) {}
    public record DataCateItemRow(String cateId, String code, LocalDateTime validFrom, LocalDateTime validTo) {}
}

public final class MasterDataResolver implements MasterLookup {
    public MasterDataResolver(Function<String, Optional<MasterDataRows>> source)
}
```

- 모양은 05 ERD(05:599-705)의 판정에 쓰는 칸만 옮겼다. `lvl` 길이 5, `attrs` 길이 10(빈 칸 null)은 `CodeLookup.CodeItemRow` 와 같다.
- `isValid(id, cate, key, dt)`: key null → false. 행 없음 → false. `closedAt != null && !dt.isBefore(closedAt)` → false. 항목 선분 = 그 key 의 행 중 `validFrom <= dt < validTo`, 없고 dt 가 가장 이른 행의 `validFrom` 보다 앞이면 그 행. 카테고리 선분도 같은 규칙. 없으면 false. REGEX 는 항목 선분 행의 대상 칸(KEY → code, LVLn, ATTRnn) 값에 `matches()`, TABLE 은 (cate, key) 소속 행 중 같은 선분 규칙으로 행이 있으면 참. cate 가 null·빈 값이면 `BASE`.
- `attr(…, n)`: `isValid` 가 참일 때 항목 선분 행의 `attrs.get(n-1)`.
- 04·05 가 공유하는 "선분 고르기 + 최초 소급"은 `code.Segments` 에 두 형태(버전 `BigDecimal`, 일시 `LocalDateTime`)로 둔다.
- 사본 서버의 `TB_MDM_DATA_CATE_EFF` 캐시 경로는 만들지 않는다. 이 판정기는 원장 방식(정규식 직접 대조, 05:457)이다. 결과는 같다.

### 6.12 Build 순서

1. **삭제 커밋**: `ContractOnlyPhaseTest.java` 를 지우고 엔진 테스트 71건 초록을 확인한다(§2.1).
2. `ValueConverter`·`RecordKeys`·`RegexPolicy`(EvalEx 없이 도는 것) 테스트 → 구현.
3. `MdmExpressionConfig`·`FunctionDictionaries`·`InstrFunction`·`BusinessFunctionAdapter` → `MdmExpressionConfigTest`·`BusinessFunctionTest`·`InstrFunctionTest`.
4. `code` 패키지(`Segments`·`DefaultCodeResolver`·`MasterDataRows`·`MasterDataResolver`) → §3.2.
5. `MasterQuery`·`MasterFunction`·`MasterAtFunction`·`MdmEvaluator` → `MasterFunctionTest`·`MdmEvaluatorTest`.
6. `ExpressionChecker`·`AstExporter`(+ `build.gradle` networknt) → `WhitelistParseTest`·`ExpressionCheckerTest`·`RegexPolicyTest` 통합 2건·`AstExporterTest`.
7. `EffectiveExpressions`·`DefaultDomainValidator` → §3.3, `TypeConversionEntryTest`.
8. `ExpressionEvaluator` 몸체 전환, package-info·Javadoc 갱신.
9. 엔진 테스트(380) → `testAll`(822) → 프런트(6, 변화 없음 확인).
10. §5 변이를 하나씩 넣어 빨강을 확인하고 되돌린다. 결과를 표로 보고한다.

커밋은 영역 단위로 나눈다(예: `feat(mdm): TSK-03-02 코드 해석기와 05 마루 데이터 판정기를 둔다`). 모든 커밋에 `--trailer "DFlow-Order: ea440494-a2ed-42c5-9842-4c1dce2f9972"` 를 붙이고 파일을 이름으로 stage 한다.

---

## 7. Build 가 주의할 함정

- **`expr` 에 record·enum 금지**(F18, I31). 중첩 타입도 걸린다. `Problem`·`ExpressionFailure`·`ValueConversionException` 은 final class 로 만든다. 오류 분류는 `EngineEvaluationException.Code` 를 재사용한다. record 가 꼭 필요하면 `code`·`domain` 에 둔다.
- **`MdmExpressionConfig` 에 필드를 더하지 않는다**(F17, I32). 캐시·지연 초기화 필드가 static final 이 아니면 영구 테스트가 빨강이 된다.
- **캐시에 넣기 전에 `validate()`**(F3). 지연 파싱 필드는 동기화되지 않는다. `computeIfAbsent` 안에서 파싱하면 CHM 이 안전하게 공개한다.
- **캐시 원본을 밖으로 내주지 않는다.** 공개 메서드는 늘 `copy()` 사본에만 값을 넣는다.
- **1,000 스레드 테스트의 평가기 타임아웃은 넉넉히**(30 초). 기본 1 초면 부하에서 거짓 타임아웃이 날 수 있다.
- **느린 함수는 유한하게 기다린다**(10 초). 무한 대기면 타임아웃 제거 변이에서 테스트 스레드가 남는다.
- **`Locale.ROOT`**: 함수·변수 이름 대문자 변환은 모두 `toUpperCase(Locale.ROOT)`. 원천 샘플은 로캘 없이 불렀다(F27).
- **`List.of` 는 null 을 받지 않는다.** 고정 데이터의 `lvl`(5)·`attrs`(10)는 `Arrays.asList(…)` 로 만든다.
- **BigDecimal 비교는 `compareTo`**. `equals` 는 scale 까지 본다(`ExpressionEvaluatorTest` 주석과 같다). 다만 `ValueConverterTest` 의 "scale 유지" 사례는 `equals` 로 본다.
- **docs 를 런타임에 읽지 않는다.** 표는 `R/**` 로 복사하고 `#` 주석에 출처 행을 적는다. `docs/mdm/design` 은 심링크라 CI·다른 체크아웃에서 없을 수 있다.
- **`java.io` 는 main 에서 금지**(F20). 리소스 읽기는 테스트에서만 한다.
- **networknt 는 test 전용**(I34). 1.5.9 는 캐시에 없어 첫 빌드에서 mavenCentral 을 받는다. 받지 못하면 D5 반려 방향(구조 대조)으로 바꾸고 보고에 올린다. 1.5.9 가 끌고 오는 `jackson-databind:2.18.3` 이 test 클래스패스의 2.18.2 를 올린다. 스키마 대조 테스트 46건이 그대로 도는지 확인한다.
- **ArchUnit 빈 대상**: `TypeConversionEntryTest` 는 domain 구현이 있어야 통과한다. `allowEmptyShould(true)` 로 우회하지 않는다. rule 패키지를 겨냥한 규칙을 만들지 않는다(D2).
- **스캐폴드 시그니처 유지**(I35). `mdm/lib` 스모크가 `new ExpressionEvaluator().evaluate("10 + 5")` 를 부른다.
- **형제 Task 충돌 회피**: `rule/**`·`spi/**`·스키마·프런트·영구 테스트·`engine-contract.md` 를 고치지 않는다. `build.gradle` 은 한 줄만 더한다(형제가 같은 파일에 줄을 더하면 머지 때 두 줄이 모두 남아야 한다).
- **커밋 제외**: `state.json`, `spec.md`, `.dflow*`, `.result`, `.issues`, `build/`, `.gradle/`, 심링크. `git add -A` 금지.

---

## 8. 형제 Task 인계(참고)

| 받는 Task | 인계 |
|---|---|
| TSK-03-03 룰 판정 엔진 | 셀 평가는 `MdmEvaluator.evaluate`(캐시·`copy()`·타임아웃·`EVAL_TS`)를 쓴다. 레코드 값 변환은 `ValueConverter.convert`, 레코드 키 검사는 `RecordKeys.violations` 를 쓴다. `ExpressionFailure.code()` 를 `Violation` 의 code 로 옮기고 stage 는 룰 단계로 채운다. rule 쪽 결속 테스트(D2)를 그 Task 에서 더한다 |
| TSK-03-04 겹침·빈틈·JS 평가기·코퍼스 | 코퍼스의 타입 변환 사례는 §6.7 표를 따른다. 서버 러너는 `MdmEvaluator`·`AstExporter` 를 쓴다. 화면 정규식 제약은 §6.5 표와 같다 |

---

## 9. Build 이탈

Build Phase(2026-09-24)에서 설계와 달라진 점과 그 이유다. 계약 타입 시그니처·스키마·프런트는 바꾸지 않았다. 새로 정한 "담당자 확인 필요 결정"은 없다(아래는 모두 기본값 안의 구현 선택이거나 불가피한 이름 조정이다).

| # | 설계 | Build 에서 한 것 | 이유 |
|---|---|---|---|
| 1 | 테스트 이름 `04_판정_표와_같다`·`04_목록_열과_같다`·`05_PORT_판정_7케이스` | `원천04_판정_표와_같다`·`원천04_목록_열과_같다`·`원천05_PORT_판정_7케이스` | Java 메서드 이름은 숫자로 시작할 수 없다(컴파일 오류). 본문 표·§4·§5 의 이름도 같이 고쳤다 |
| 2 | §6.12 순서(설정·사전 → code → MASTER·평가기) | code 패키지를 설정 팩토리보다 먼저 구현했다. `RecordKeys` 는 `MdmEvaluatorTest` 와 함께, `RegexPolicyTest` 의 검사기 통합 2건은 `ExpressionChecker` 와 함께 넣었다 | `create()` 가 `MASTER` 함수를 통해 `DefaultCodeResolver` 를 만들어야 하므로 code 가 먼저 있어야 컴파일된다. 영역마다 테스트를 먼저 쓰고 컴파일 실패(빨강)를 확인한 뒤 구현한 순서는 지켰다 |
| 3 | `EvaluationValue.nullValue()` | `EvaluationValue.NULL_VALUE` | 3.7.0 에서 `nullValue()` 는 `@Deprecated(forRemoval)` 이다(컴파일 경고 확인). 같은 값을 주는 공개 상수를 쓴다 |
| 4 | `create_설정이_고정값_14개와_같다` 는 `create(lookups)` 결과를 본다 | 같은 검사를, 호스트 기본 시간대·로캘을 잠시 UTC·`Locale.US` 로 바꾼 상태에서 만든 설정에 한다(`try/finally` 로 되돌림) | EvalEx 기본 `zoneId` 는 JVM 기본 시간대다. KST 호스트에서는 `.zoneId(ZONE)` 삭제 변이(I1b)가 살아남는다. 호스트와 무관하게 빨강이 나게 했다 |
| 5 | `TypeConversionEntryTest` 첫 규칙은 "커스텀 `ArchCondition`" | ArchUnit 내장 `ArchConditions.callMethod(ValueConverter.class, "convert", Object.class, DataType.class)` | 내장 조건이 "그 메서드를 부르는 호출이 있다"를 그대로 표현한다. `failOnEmptyShould` 기본값(참)으로 대상 1건 이상도 그대로 강제된다. 변이 I28 로 빨강을 확인했다 |
| 6 | `MasterDataResolverTest` 17건, N = 305 | `REGEX_는_대상_칸_값에_전체_일치다` 2건을 더해 19건(이 시점 N = 307, 최종 수치는 11번) | 변이 I24a("05 REGEX 대상 칸을 늘 KEY 로")가 처음에 살아남았다. 원천 7케이스의 REGEX 사례(KR·CNSHA)는 거짓이라 대상 칸을 KEY 로 바꿔도 결과가 같다. 05 샘플 판정(05:746-747 "PORT.KR = {KRPUS}", "KRINC 는 09-01 09:00 전이면 PORT.KR 에서 true")을 2건으로 옮겨 덮었다. §2.1·§2.4·§3.2·§3.5·§4·§5·§6.12 의 수치를 같은 커밋에서 고쳤다 |
| 7 | `ExpressionChecker.Problem` 의 kind 는 "문자열 상수" | 상수 `PARSE`·`FUNCTION`·`VARIABLE`·`RESERVED`·`MDM_ARGUMENT`·`REGEX` 를 `ExpressionChecker` 에 둔다. `ExpressionFailure` 의 reason 상수는 `ExpressionFailure` 에 둔다 | 설계가 위치를 정하지 않았다. 검사기 쪽 상수는 검사기에, 평가기 실패 상수는 실패 타입에 둔다 |
| 8 | §5 I12 변이 "`future.get(timeout)` → `future.get()`" | `future.get(Long.MAX_VALUE, NANOSECONDS)` 로 넣었다 | `future.get()` 은 `TimeoutException` 을 던지지 않아 `catch (TimeoutException)` 이 컴파일 오류가 된다. 컴파일 실패는 I35 외에는 빨강으로 치지 않으므로, 같은 뜻(사실상 무한 대기)의 컴파일되는 변이로 바꿨다 |
| 9 | §5 I34 변이 "main 에서 `com.networknt` import" | main 에 `java.io.Serializable` 필드를 더했다 | networknt 는 `testImplementation` 이라 main 컴파일 클래스패스에 없어 컴파일 오류가 된다. 같은 영구 규칙(허용 목록 밖 의존)을 건드리는 컴파일되는 변이로 바꿨다 |
| 10 | §5 I9 변이 "숫자 value 를 `new BigDecimal(v).toPlainString()` 으로" | `0x` 로 시작하는 리터럴은 빼고 바꿨다 | `new BigDecimal("0xFF")` 는 예외라 "예외로만 빨강"이 된다. 행동 변이(`1e-3` → `0.001`)로 빨강이 나는지 보려고 뺐다 |
| 11 | §6.9 의사코드는 요구 변수 계산(`bizRequiredVars`)을 판정 오류 변환 밖에 둔다 | 요구 변수 계산도 `ExpressionFailure` → `EngineEvaluationException(RESULT_EVAL)` 변환 안에 넣었다(`requiredVars`·`judgmentError` 도우미). 테스트 `식_파싱_실패는_EngineEvaluationException_RESULT_EVAL_이다` 2건 추가 → `DefaultDomainValidatorTest` 17건, N = **309**, 엔진 **380**, `testAll` **822** | Build 마감 검토에서 찾은 계약 결함이다. 비즈니스 함수 jar 에서 함수가 빠지면 저장된 비즈니스식이 판정 때 `Undefined function` 으로 파싱에 실패하는데, 요구 변수 계산(`MdmEvaluator.usedVariables` → 컴파일)에서 난 `ExpressionFailure(PARSE)` 가 `validate()` 밖으로 그대로 나갔다. `DomainValidator` 계약은 식 오류를 `EngineEvaluationException` 으로 약속한다. 테스트를 먼저 넣어 비즈니스식 사례만 빨강(17건 중 1건 실패)인 것을 확인한 뒤 고쳤다. 표준식 사례는 이미 초록인 짝이다 |

그 밖의 구현 선택(설계 범위 안): `MasterFunctionTest` 의 기록용 `MasterLookup` 은 `MasterDataResolver`(PORT)에 판정을 위임하며 받은 `baseDt` 를 기록한다. `DomainFixtures` 의 CODE 컬럼은 유효 표준식을 비워 검증기가 자동 `MASTER` 식을 만드는 경로를 탄다. `bizRequiredVars` 는 정의에 싣지 않아 유효 비즈니스식에서 계산하는 경로를 탄다. `MdmEvaluator` 의 가상 스레드 실행기는 닫지 않는다(가상 스레드는 JVM 종료를 막지 않는다). 평가가 가상 스레드에서 돌므로, 서버의 조회 구현체(`CodeLookup`·`MasterLookup` 등)는 호출 스레드에 묶인 문맥(트랜잭션·보안 문맥·MDC)을 `MASTER` 조회 안에서 보지 못한다 — TSK-03-03 과 서버 구현체에 넘기는 주의 사항이다(설계가 정한 타임아웃 방식의 결과라 바꾸지 않았다).

### 변이 검증 결과(Build)

방법: 스크립트가 변이마다 원문 한 곳이 **정확히 한 번** 맞는지 확인하고 바꾼 뒤, 해당 테스트 클래스만 `--tests` 로 돌려 JUnit XML 의 실패 사례를 모으고 `/usr/bin/git checkout --` 로 되돌렸다. 전 변이 뒤 `/usr/bin/git diff --stat` 이 비어 있음(잔여 변이 없음)을 확인했다. 컴파일 실패는 I35 에서만 빨강으로 친다.

- 결과: 불변 규칙 **36/36 빨강**(변이 67개 모두 빨강, I35 는 설계대로 컴파일 실패). 처음 실행에서 살아남은 변이는 I24a 하나였고 테스트 2건을 더해 덮었다(§9 이탈 6). §9 이탈 11 수정 뒤 `DefaultDomainValidator` 에 걸린 변이 8개(I25a-c·I26a-c·I28·I33)는 수정 커밋 위에서 다시 돌려 빨강을 확인했다. 수정 자체는 테스트를 먼저 넣어 비즈니스식 사례가 빨강인 것을 본 뒤 넣었다.
- 덮지 못한 것(자동 테스트 밖): ① 1,000 스레드 테스트는 값 섞임을 확률적으로만 잡는다 — I10a 에서는 결정적 짝 `평가_뒤_캐시_원본에는_값이_남지_않는다` 와 함께 1,000 스레드 테스트도 빨강이었다. ② 영구 테스트·계약 파일이 바이트 동일인지는 자동 테스트가 없다 — Verify 가 `/usr/bin/git diff origin/dev -- <§2.5 목록>` 으로 본다. ③ I18a·I19c·I23b 는 04·05 가 공유하는 `Segments` 한 곳의 변이라 04·05 테스트가 함께 빨강이 된다(규칙 I18·I23 을 한 변이가 같이 덮는다).

| 변이 ID | 규칙 | 넣은 변이 | 결과 | 빨강이 난 테스트(클래스.사례) |
|---|---|---|---|---|
| I1a | I1 | baseBuilder 에서 allowOverwriteConstants 줄 삭제 | 빨강 2/9 | `MdmExpressionConfigTest.create_설정이_고정값_14개와_같다()`, `MdmExpressionConfigTest.상수_사전이_남고_상수_이름_값_넣기가_거부된다()` |
| I1b | I1 | baseBuilder 에서 zoneId 줄 삭제 | 빨강 1/9 | `MdmExpressionConfigTest.create_설정이_고정값_14개와_같다()` |
| I2 | I2 | 엔진 사전을 EvalEx 표준 사전 전체 + MDM 으로 | 빨강 11/26 | `WhitelistParseTest.거부된_식은_평가되지_않는다()`, `WhitelistParseTest.DT_NOW()`, `WhitelistParseTest.DT_TODAY()`, `WhitelistParseTest.RANDOM()`, 외 7건 |
| I3 | I3 | baseBuilder 의 functionDictionary 호출 삭제 | 빨강 1/9 | `MdmExpressionConfigTest.baseBuilder_사전은_BASE_24종뿐이다()` |
| I4 | I4 | 검사기가 칸을 무시하고 비즈니스 함수를 늘 허용 | 빨강 6/17 | `WhitelistParseTest.거부된_식은_평가되지_않는다()`, `WhitelistParseTest.DOMAIN_STD`, `WhitelistParseTest.RULE_COND_EXPR`, `WhitelistParseTest.RULE_RESULT_EXPR`, 외 2건 |
| I5 | I5 | DOMAIN_STD 의 value 전용 검사 삭제 | 빨강 1/26 | `ExpressionCheckerTest.DOMAIN_STD_는_value_외_변수를_거부한다()` |
| I6a | I6 | 식·선언 변수의 _ 접두 검사 삭제 | 빨강 3/26 | `ExpressionCheckerTest._V1 → true`, `ExpressionCheckerTest._V1 > 0`, `ExpressionCheckerTest._x == 1` |
| I6b | I6 | EVAL_TS 비교를 대소문자 구분으로 | 빨강 1/26 | `ExpressionCheckerTest.eval_ts > 0` |
| I6c | I6 | 선언 변수명 상수 비교를 대소문자 구분으로 | 빨강 3/26 | `ExpressionCheckerTest.null → true`, `ExpressionCheckerTest.Pi → true`, `ExpressionCheckerTest.e → true` |
| I7a | I7 | MASTER 최대 인자 비교를 maxArgs + 1 로 | 빨강 2/26 | `ExpressionCheckerTest.MASTER("A", "B", value, "attr01", "x") → true`, `ExpressionCheckerTest.MASTER_AT("A", "B", value, D, "attr01", "x") → true` |
| I7b | I7 | attr 정규식에 대소문자 무시 추가 | 빨강 1/26 | `ExpressionCheckerTest.MASTER("A", "B", value, "ATTR01") → true` |
| I8a | I8 | 소유 한정자 검사 삭제 | 빨강 4/30 | `RegexPolicyTest.a++`, `RegexPolicyTest.a*+`, `RegexPolicyTest.a?+`, `RegexPolicyTest.a{2,}+` |
| I8b | I8 | 중첩 수량자 검사 삭제 | 빨강 5/30 | `RegexPolicyTest.(a+)+`, `RegexPolicyTest.(a*)*`, `RegexPolicyTest.(\w+\s?)+`, `RegexPolicyTest.([a-z]+)*$`, 외 1건 |
| I8c | I8 | STR_MATCHES 비리터럴 패턴 허용 | 빨강 1/30 | `RegexPolicyTest.STR_MATCHES_패턴이_리터럴이_아니면_거부한다()` |
| I9a | I9 | 자식이 없어도 params 키를 넣는다 | 빨강 12/16 | `AstExporterTest.접두_연산자가_거듭제곱보다_먼저_묶인다()`, `AstExporterTest.자식_없는_노드와_인자_0개_함수는_params_키가_없다()`, `AstExporterTest.evalex_guide_8_3_예시와_같다()`, `AstExporterTest.음수는_접두_연산자와_숫자다()`, 외 8건 |
| I9b | I9 | 숫자 value 를 new BigDecimal(v).toPlainString() 으로 | 빨강 1/16 | `AstExporterTest.숫자_리터럴은_입력_원문이다()` |
| I10a | I10 | evaluate 가 캐시 원본에 withValues | 빨강 2/15 | `MdmEvaluatorTest.평가_뒤_캐시_원본에는_값이_남지_않는다()`, `MdmEvaluatorTest.동시_평가_1000_스레드_결과가_단일_스레드와_같다()` |
| I10b | I10 | 캐시 없이 매번 new Expression | 빨강 2/15 | `MdmEvaluatorTest.같은_텍스트는_한_번만_컴파일한다()`, `MdmEvaluatorTest.평가_뒤_캐시_원본에는_값이_남지_않는다()` |
| I11a | I11 | EVAL_TS truncatedTo(SECONDS) 삭제 | 빨강 1/31 | `MdmEvaluatorTest.EVAL_TS_는_초_미만을_자르고_KST_로_MASTER_에_간다()` |
| I11b | I11 | MASTER 가 ZoneOffset.UTC 로 변환 | 빨강 2/31 | `MdmEvaluatorTest.EVAL_TS_는_초_미만을_자르고_KST_로_MASTER_에_간다()`, `MasterFunctionTest.2026-08-31T15:00:00Z → true` |
| I12a | I12 | future.get(timeout) → 사실상 무한 대기 | 빨강 1/15 | `MdmEvaluatorTest.타임아웃을_넘으면_평가_오류이고_작업을_끊는다()` |
| I12b | I12 | 타임아웃 때 cancel(true) → cancel(false) | 빨강 1/15 | `MdmEvaluatorTest.타임아웃을_넘으면_평가_오류이고_작업을_끊는다()` |
| I13 | I13 | 레코드 키 _ 접두 검사 삭제 | 빨강 4/30 | `DefaultDomainValidatorTest.레코드_예약_키는_EngineEvaluationException_INPUT_CHECK_이다()`, `MdmEvaluatorTest._V1 → RESERVED_KEY`, `MdmEvaluatorTest._x → RESERVED_KEY`, `MdmEvaluatorTest.레코드_예약_키_위반은_한_번에_모두_모은다()` |
| I14a | I14 | INSTR 를 대문자로 바꿔 비교 | 빨강 1/6 | `InstrFunctionTest.INSTR("ABCDE", "cd") → 0` |
| I14b | I14 | INSTR NULL 인자에 0 반환 | 빨강 2/6 | `InstrFunctionTest.INSTR("A", NULL) → null`, `InstrFunctionTest.INSTR(NULL, "A") → null` |
| I15 | I15 | MASTER 가 늘 MasterLookup 으로 | 빨강 5/61 | `DomainKindExamplesTest.PROC_CD '82' null → true null`, `DomainKindExamplesTest.PROC_CD '83' null → true null`, `MasterFunctionTest.attr_형태는_저장된_문자열을_돌려준다()`, `MasterFunctionTest.첫_인자가_마루_코드면_코드_해석으로_간다()`, 외 1건 |
| I16a | I16 | MASTER_AT base_dt 숫자 값 허용 | 빨강 1/16 | `MasterFunctionTest.20260906 → ERROR` |
| I16b | I16 | YYYYMMDD 해석을 STRICT → SMART | 빨강 1/16 | `MasterFunctionTest.20260231 → ERROR` |
| I17a | I17 | 코드 attr 가 소속 확인 없이 행 값 반환 | 빨강 1/59 | `DefaultCodeResolverTest.attr_는_소속일_때만_돌려준다()` |
| I17b | I17 | 데이터 attr 가 유효 확인 없이 첫 행 값 반환 | 빨강 1/17 | `MasterDataResolverTest.KRINC → null` |
| I18a | I18/I23 | 선분 끝 dt < to → dt <= to (04·05 공용) | 빨강 5/60 | `DefaultCodeResolverTest.2026-09-01T00:00:00 → true`, `DefaultCodeResolverTest.2026-07-01T00:00:00 → 1.001`, `DefaultCodeResolverTest.2026-09-01T00:00:00 → 1.002`, `DefaultCodeResolverTest.2026-07-15T00:00:00 → false`, 외 1건 |
| I18b | I18 | CANCELLED 버전도 고른다 | 빨강 1/43 | `DefaultCodeResolverTest.CANCELLED_버전은_고르지_않는다()` |
| I18c | I18 | 버전 소급 삭제 | 빨강 5/43 | `DefaultCodeResolverTest.2024-06-01T00:00 → 82`, `DefaultCodeResolverTest.2024-06-01T00:00:00 → 1.000`, `DefaultCodeResolverTest.2024-12-31T23:59:59 → 1.000`, `DefaultCodeResolverTest.2024-06-01T00:00:00 82 → true`, 외 1건 |
| I19a | I19 | TABLE 조회를 eff_ver 대신 V 로 | 빨강 4/43 | `DefaultCodeResolverTest.2024-06-01T00:00 → 82`, `DefaultCodeResolverTest.2025-03-01T00:00 → 82`, `DefaultCodeResolverTest.2024-06-01T00:00:00 82 → true`, `DefaultCodeResolverTest.2025-03-01T00:00:00 82 → true` |
| I19b | I19 | 카테고리 소급 삭제 | 빨강 4/43 | `DefaultCodeResolverTest.2024-06-01T00:00 → 82`, `DefaultCodeResolverTest.2025-03-01T00:00 → 82`, `DefaultCodeResolverTest.2024-06-01T00:00:00 82 → true`, `DefaultCodeResolverTest.2025-03-01T00:00:00 82 → true` |
| I19c | I19/I23 | 닫힌 행도 소급 후보로(가장 이른 행을 늘 고른다) | 빨강 5/60 | `DefaultCodeResolverTest.2026-07-15T00:00:00 → false`, `MasterDataResolverTest.KRINC → null`, `MasterDataResolverTest.KRINC 2026-09-01T09:00:00 → false`, `MasterDataResolverTest.PORT BASE KRINC 2026-09-06T00:00:00 → false`, 외 1건 |
| I20a | I20 | REGEX matches() → find() | 빨강 2/43 | `DefaultCodeResolverTest.CODE_8 82 → false`, `DefaultCodeResolverTest.attr_는_소속일_때만_돌려준다()` |
| I20b | I20 | REGEX 를 늘 코드값에 대조 | 빨강 3/43 | `DefaultCodeResolverTest.LVL2_KS3 82 → true`, `DefaultCodeResolverTest.ATTR01_KR 82 → true`, `DefaultCodeResolverTest.ATTR01_ANY 83 → false` |
| I21a | I21 | CodeEffLookup 빈 집합을 계산 안 함으로 | 빨강 1/43 | `DefaultCodeResolverTest.CodeEffLookup_의_빈_집합은_소속_없음이다()` |
| I21b | I21 | effectiveCodes 가 CodeEffLookup 을 먼저 본다 | 빨강 1/43 | `DefaultCodeResolverTest.effectiveCodes_는_CodeEffLookup_을_보지_않는다()` |
| I22a | I22 | CODE_LIST 를 code 순만 | 빨강 1/43 | `DefaultCodeResolverTest.CODE_LIST_는_seq_다음_code_순이다()` |
| I22b | I22 | DEPRECATED 검사 삭제 | 빨강 1/43 | `DefaultCodeResolverTest.DEPRECATED_마루_코드의_CODE_LIST_는_빈_목록이다()` |
| I23b | I23 | 선분 시작 from <= dt → from < dt (04·05 공용) | 빨강 15/60 | `DefaultCodeResolverTest.2026-09-01T00:00:00 → true`, `DefaultCodeResolverTest.CODE_8X 82 → true`, `DefaultCodeResolverTest.LVL2_KS3 82 → true`, `DefaultCodeResolverTest.ATTR01_KR 82 → true`, 외 11건 |
| I23c | I23 | 05 항목 최초 행 소급 삭제 | 빨강 1/17 | `MasterDataResolverTest.PORT BASE KRINC 2026-08-15T00:00:00 → true` |
| I23d | I23 | closedAt 무시 | 빨강 1/17 | `MasterDataResolverTest.폐기된_마루_데이터는_closed_at_부터_false_다()` |
| I24a | I24 | 05 REGEX 대상 칸을 늘 KEY 로 | 빨강 2/19 (첫 실행은 생존 0/17 → 테스트 2건 추가 후 재실행) | `MasterDataResolverTest.KR KRPUS 2026-09-06T00:00:00 → true`, `MasterDataResolverTest.KR KRINC 2026-08-30T00:00:00 → true` |
| I24b | I24 | 05 TABLE 소속 확인 삭제 | 빨강 1/17 | `MasterDataResolverTest.PORT MAJOR KRINC 2026-08-15T00:00:00 → false` |
| I25a | I25 | 빈 값 정규화 삭제 | 빨강 3/17 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.''`, `DefaultDomainValidatorTest.'   '`, `DefaultDomainValidatorTest.'	
'` |
| I25b | I25 | 필수 아닌 NULL 도 식까지 간다(필수 검사를 식 뒤로) | 빨강 1/17 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.필수가_아니면_NULL_은_통과하고_식은_돌지_않는다()` |
| I25c | I25 | 표준식 실패 뒤에도 비즈니스식 평가 | 빨강 1/17 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.표준식이_거짓이면_비즈니스식을_돌리지_않는다()` |
| I26a | I26 | 비즈니스 요구 변수 누락 검사 삭제 | 빨강 2/62 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.비즈니스_요구_변수_키가_없으면_BIZ_VAR_MISSING_이다()`, `DomainKindExamplesTest.COIL_GRS_WGT '20' null → false BIZ_VAR_MISSING` |
| I26b | I26 | containsKey → get(...) != null | 빨강 1/17 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.키가_있고_값이_NULL_이면_누락이_아니다()` |
| I26c | I26 | 레코드 복사본을 대소문자 구분 맵으로 | 빨강 1/17 (§9 이탈 11 수정 커밋 뒤 재실행) | `DefaultDomainValidatorTest.요구_변수_키는_대소문자를_가리지_않는다()` |
| I27a | I27 | 숫자 문자열을 new BigDecimal(s) 로 바로 | 빨강 5/28 | `ValueConverterTest.NUMBER ← 1e3`, `ValueConverterTest.NUMBER ← 0xFF`, `ValueConverterTest.NUMBER ←  1`, `ValueConverterTest.NUMBER ← 1,000`, 외 1건 |
| I27b | I27 | BOOLEAN 문자열을 Boolean.parseBoolean | 빨강 1/28 | `ValueConverterTest.BOOLEAN ← Y` |
| I28 | I28 | 검증기가 new BigDecimal((String) raw) 로 직접 변환 | 빨강 2/2 (§9 이탈 11 수정 커밋 뒤 재실행) | `TypeConversionEntryTest.domain_은_값_변환을_직접_하지_않는다()`, `TypeConversionEntryTest.도메인_검증기는_ValueConverter_convert_를_부른다()` |
| I29a | I29 | 유효 AST 를 오른쪽 중첩으로 | 빨강 2/11 | `EffectiveExpressionsTest.세_단계_AST_는_AND_AND_조부_부_자신_이다()`, `EffectiveExpressionsTest.[value > 0, value <= 30, value >= 1 && value <= 25]` |
| I29b | I29 | 유효 텍스트 괄호 생략 | 빨강 2/11 | `EffectiveExpressionsTest.[value > 0, value <= 30, value >= 1 && value <= 25]`, `EffectiveExpressionsTest.두_단계_유효_텍스트는_02_예시와_같다()` |
| I30a | I30 | 유효 코드 참조를 가장 먼 값으로 | 빨강 1/11 | `EffectiveExpressionsTest.[CodeRef[maruCodeId=PROC_CD, cateId=A], CodeRef[maruCodeId=PROC_CD, cateId=B]] → CodeRef[maruCodeId=PROC_CD, cateId=B]` |
| I30b | I30 | 카테고리 null·빈 값을 그대로(BASE 로 안 바꿈) | 빨강 1/43 | `DefaultCodeResolverTest.카테고리가_비면_BASE_다()` |
| I31 | I31 | ExpressionChecker.Problem 을 record 로 | 빨강 1/46 | `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다()` |
| I32 | I32 | MdmExpressionConfig 에 static final 아닌 필드 | 빨강 1/5 | `ContractTypeShapeTest.상수_홀더는_final_이고_생성자가_private_이며_필드가_static_final_이다()` |
| I33 | I33 | DefaultDomainValidator 가 DefaultCodeResolver 를 본다 | 빨강 1/5 (§9 이탈 11 수정 커밋 뒤 재실행) | `EnginePackageDependencyTest.domain_은_rule_과_code_를_보지_않는다()` |
| I34 | I34 | main 이 허용 목록 밖(java.io)에 의존 — networknt 는 main 클래스패스에 없어 대체 | 빨강 1/2 | `MaruMdmEngineArchitectureTest.engine_은_EvalEx_와_java_표준_외에_의존하지_않는다()` |
| I35 | I35 | 스캐폴드 evaluate → evaluateExpression(이름 변경) | 컴파일 실패(I35 는 설계상 허용) | `ExpressionEvaluatorTest` 컴파일 실패(`cannot find symbol evaluate`) |
| I36a | I36 | 비즈니스 함수 이름 충돌 검사 삭제 | 빨강 3/9 | `BusinessFunctionTest.MASTER`, `BusinessFunctionTest.IF`, `BusinessFunctionTest.DT_NOW` |
| I36b | I36 | nullable=false 검사 삭제 | 빨강 1/9 | `BusinessFunctionTest.nullable_false_인자에_NULL_이면_부르지_않고_평가_오류다()` |

---

## 담당자 확인 필요 결정

### D1 — 05 마루 데이터 판정(일시 선분·최초 행 소급)을 어디에 둘 것인가
- **질문**: spi `MasterLookup` Javadoc 은 "05 판정 규칙은 구현체가 한다"고 적었고 spi 에는 마루 데이터 행을 주는 인터페이스가 없다(F24). 그런데 spec 은 이 Task 에 "일시 선분(05 valid_from–to) 판정, 최초 행 소급"과 "05 PORT 판정 7케이스 통과"를 요구한다. 판정 코드를 엔진에 둘 것인가, 둔다면 어떤 모양으로 둘 것인가?
- **선택지**: (a) spi 는 그대로 두고 `code` 에 행 record `MasterDataRows` 와 참고 판정기 `MasterDataResolver implements MasterLookup`(행 공급 함수 `Function<String, Optional<MasterDataRows>>` 를 받음)를 둔다 / (b) spi 에 `MasterDataLookup`(행 조회) 인터페이스를 새로 두고 `MASTER` 가 그것으로 판정한다 / (c) 엔진에는 두지 않고 테스트 전용 구현으로 7케이스만 확인한다
- **택한 것**: (a)
- **근거**: spec 본문이 05 판정을 이 Task 요구사항과 수용 기준으로 적었다(가장 강한 근거). 06:461·468 도 "버전 선택·소급·카테고리 해석은 엔진 `engine.code` 가 하고 구현체는 행만 읽는다"는 방향이라, 05 규칙을 엔진이 한 벌 갖는 쪽이 원천 의도와 맞다. (b) 는 계약 시그니처를 바꿔 스키마·형제 Task 에 영향이 간다. `MasterLookup` Javadoc(미승인 선행, 가장 약한 근거)과도 어긋나지 않는다. 구현체가 이 판정기를 쓰면 그대로 "05 대로 하는 구현"이 되기 때문이다. (c) 는 테스트가 테스트 코드를 검증하는 꼴이라 수용 기준의 뜻을 채우지 못한다.
- **반려되면 재작업 방향**: (b) 면 `spi/MasterDataLookup` 을 계약 타입으로 추가하고 `EngineLookups` 에 칸을 더한 뒤(스키마·TS 영향 없음, record 컴포넌트 추가라 `CONTRACT_TYPES` 갱신 필요) `MasterDataResolver` 를 그 인터페이스로 받게 바꾼다. (c) 면 `MasterDataRows`·`MasterDataResolver` 를 `T/testsupport` 로 옮기고, §4 수용 기준 4 를 "테스트 구현으로 확인"으로 고치며 N 은 그대로다.

### D2 — 타입 변환 함수의 소유·규칙과 "룰 엔진과 같은 함수"를 이 Task 안에서 어떻게 검증할 것인가
- **질문**: 계약에 변환 함수 자리가 없다(F23). 도메인 검증(02 3단계)과 룰 판정(06:198)이 같은 함수를 쓰게 하려면 어디에 어떤 규칙으로 두고, rule 구현이 아직 없는(형제 TSK-03-03) 상태에서 무엇으로 검증할 것인가?
- **선택지**: (a) `expr.ValueConverter.convert(Object, DataType)` 공개 단일 진입점 + §6.7 변환 표 + 이 Task 의 검증은 ① 변환 표 테스트 28건 ② domain 이 이 함수를 부르고 직접 변환하지 않는다는 ArchUnit 2건, rule 쪽 결속 테스트는 TSK-03-03 에 인계 / (b) (a) + rule 패키지 대상 ArchUnit 규칙("rule 은 BigDecimal(String)·Boolean.parseBoolean 을 직접 부르지 않는다")을 지금 영구 테스트로 넣는다 / (c) `spi` 에 변환 함수를 둔다 / (d) 계약 interface(`expr.ValueConversion`)를 새로 두고 구현을 따로 둔다
- **택한 것**: (a)
- **근거**: 의존 방향(06:463)상 rule 과 domain 이 함께 볼 수 있는 곳은 `expr`·`spi` 인데, spi 는 호출자가 구현하는 조회 인터페이스 자리라(06:461) 엔진 로직을 두기에 맞지 않는다((c) 탈락). (b) 는 지금 rule 에 구현 클래스가 없어 `failOnEmptyShould` 에 걸리고, 형제 Task 가 셀 리터럴을 `BigDecimal` 로 읽는 코드를 넣으면 머지 순간 dev 를 빨강으로 만든다. 형제 범위에 손대지 말라는 팀장 지시와도 부딪힌다. (d) 는 구현이 하나뿐인 추상화를 계약에 더한다. 변환 규칙은 06 「저장 시 검사」 타입 행(06:325 "지수·16진 표기는 거부", "Boolean 열에 TRUE/FALSE 밖의 값을 넣지 못한다")을 레코드 값에도 똑같이 적용했다. 두 엔진(서버·화면)이 같은 문자열을 같은 수로 읽게 하려는 정합성 조건이기 때문이다. **경계**: 도메인 검증의 비즈니스 요구 변수 값은 이 함수로 바꾸지 않고 그대로 넣는다(§6.9). 그 변수의 데이터 타입을 이 컬럼의 정의로는 알 수 없기 때문이다. 그래서 호출자(백엔드)가 `BigDecimal`·`String`·`Boolean` 으로 넣어야 하고, 이 경계는 변환 계약 밖이다.
- **반려되면 재작업 방향**: (b) 면 `TypeConversionEntryTest` 에 rule 규칙 1건을 더하되 `allowEmptyShould` 를 쓰지 말고, 머지 순서상 TSK-03-03 뒤에 넣도록 오케스트레이터와 조율한다(N +1). 변환 표 자체가 반려되면(예: 지수 표기 허용) `ValueConverter` 의 숫자 정규식과 `ValueConverterTest` 사례를 고치고, TSK-03-04 코퍼스 인계 문구도 같이 고친다. 비즈니스 요구 변수도 변환해야 한다면 `DefinitionLookup.column(table, 변수)` 로 그 변수의 타입을 찾아 `ValueConverter.convert` 를 거치게 하고(정의가 없으면 그대로), 변환 실패를 `TYPE_CONVERSION` 으로 돌려주는 사례 1건을 `DefaultDomainValidatorTest` 에 더한다(N +1).

### D3 — `MdmExpressionConfig.baseBuilder()` 가 함수 사전을 가질 것인가
- **질문**: 계약 Javadoc 은 `baseBuilder()` 를 "함수 사전을 뺀 고정 설정"이라 적었다. 그런데 EvalEx 빌더는 `functionDictionary` 를 부르지 않으면 표준 사전 전체(`DT_NOW`·`RANDOM` 포함)를 넣는다(F11). 글자 그대로 따를 것인가?
- **선택지**: (a) `baseBuilder()` 가 `BASE` 24종 사전을 넣고, `create()` 가 그것을 `STANDARD ∪ 비즈니스` 로 바꾼다. Javadoc 을 고친다 / (b) Javadoc 그대로 사전을 넣지 않는다(`baseBuilder().build()` 는 표준 사전 전체) / (c) 빈 사전을 넣는다
- **택한 것**: (a)
- **근거**: 06:442 "함수 사전은 표준 사전을 그대로 쓰지 않고 허용 함수만 넣어 만든다", "시각·난수·로캘·환경을 읽는 함수는 넣지 않는다"(원천 규칙)가 "함수 사전을 뺀"(미승인 선행 Javadoc)보다 강하다. (b) 는 `baseBuilder()` 를 쓰는 호출자(스캐폴드 `ExpressionEvaluator`, 형제 Task)에게 `DT_NOW` 를 열어 준다. (c) 는 `ABS` 같은 기본 함수도 막아 스캐폴드 평가기의 쓸모가 없어진다. BASE 는 MDM 조회 함수가 필요 없는 식에서 안전한 최소 집합이다.
- **반려되면 재작업 방향**: (b) 면 `baseBuilder()` 에서 `functionDictionary` 줄을 지우고, `ExpressionEvaluator` 는 `create(…)` 를 쓰도록 바꾸며(빈 조회 묶음), `baseBuilder_사전은_BASE_24종뿐이다` 테스트를 "`create` 만 쓰라"는 Javadoc 확인으로 바꾸거나 지운다(N −1). (c) 면 빈 `MapBasedFunctionDictionary` 를 넣고 같은 테스트 기대값을 빈 집합으로 바꾼다.

### D4 — "BASE 예약"을 어떻게 구현할 것인가
- **질문**: spec 은 "REGEX·TABLE 카테고리 해석, BASE 예약"을 요구하지만 동작을 따로 정의하지 않았다. 원천은 BASE 를 "마루 코드마다 자동 생성되는 REGEX `.*`·대상 CODE 카테고리, 해석 결과는 그 버전의 코드 전체, 편집·닫기 불가"로 정하고(04:95), 05 는 "카테고리를 비우면 BASE"라고 적었다(05:160). 엔진은 BASE 를 특례로 다룰 것인가?
- **선택지**: (a) 특례 없이 BASE 도 행으로 해석한다(SQL 과 같다). 예약의 뜻은 ① 카테고리 인자가 null·빈 값이면 `BASE` 로 본다 ② "BASE 해석 = 그 버전의 코드 전체"를 테스트로 고정한다 / (b) BASE 는 행을 보지 않고 늘 "V 의 유효 코드 전체"로 본다 / (c) (b) + 행이 있으면 행과 결과가 같은지 검사해 다르면 오류
- **택한 것**: (a)
- **근거**: 수용 기준 3 은 `sql/04-code-exists.sql` 결과와의 일치다. SQL 은 BASE 를 다른 REGEX 행과 똑같이 해석하므로, 행이 없거나 정의가 다르면 (b) 는 SQL 과 결과가 갈린다(spec 수용 기준이 가장 강한 근거). 정상 데이터에서는 BASE 행이 늘 `.*`·CODE 라 두 방식의 결과가 같고, 그 사실을 `BASE_해석은_그_버전의_코드_전체다` 가 고정한다. 05:160 의 "비우면 BASE"는 원천 규칙이라 그대로 옮긴다. (c) 는 원천에 없는 오류 경로를 만든다.
- **반려되면 재작업 방향**: (b) 면 `DefaultCodeResolver.resolve` 와 `MasterDataResolver` 에서 cate 가 `BASE` 면 행을 보지 않고 유효 코드(05 는 항목 선분이 있는 키) 전체를 돌려주게 하고, "BASE 행이 없어도 전체 코드" 사례 1건을 더한다(N +1). 04 판정 표 12건은 그대로 통과한다(예제 데이터에 BASE 행이 있다).

### D5 — `AstExporter` 출력의 스키마 적합 검사를 어떻게 할 것인가
- **질문**: TSK-03-01 D6 와 engine-contract §9·D-022 는 "`AstExporter` 출력이 스키마를 통과하는지 엔진 테스트에서 검사하고, JSON Schema 검증기는 testImplementation 에 둔다"를 이 Task 에 넘겼다. 검증기는 Gradle 캐시에 없다(F26). 어떻게 할 것인가?
- **선택지**: (a) `com.networknt:json-schema-validator:1.5.9`(Jackson 2 계열, 2020-12 지원)를 testImplementation 으로 더해 `$defs/AstNode` 로 검증하고, 틀린 모양 2건을 음성 대조로 둔다 / (b) 검증기 없이 Jackson 으로 스키마의 enum·required 를 읽어 구조를 손으로 대조한다 / (c) 이번에는 검사하지 않는다
- **택한 것**: (a)
- **근거**: spec 본문은 검사 방법을 정하지 않았다. 남은 근거는 선행 산출물(D-022·engine-contract §9·TSK-03-01 D6, 모두 미승인)인데 세 곳이 모두 "검증기를 test 에 둔다"로 일치한다. 3.x 는 Jackson 3(`tools.jackson`)을 써서 엔진 test 의 Jackson 2.18.2 와 섞이므로, 같은 계열(2.18.3)을 쓰는 1.5.9 를 고른다. main 의존은 늘지 않는다(I34). (b) 는 스키마 해석기를 손으로 다시 만드는 셈이라 `oneOf`·`additionalProperties`·`minItems` 를 빠뜨리기 쉽다. (c) 는 명시적 인계를 조용히 버린다.
- **반려되면 재작업 방향**: (b) 면 `build.gradle` 줄을 지우고, `AstExporterTest` 의 스키마 테스트 10건을 "스키마 `$defs` 의 `const`·`enum`·`required`·`minItems` 를 Jackson 으로 읽어 노드마다 대조"로 바꾼다(건수 유지). (c) 면 그 10건을 지우고(N −10) 검사를 TSK-03-04 코퍼스 러너에 인계한다고 §8 에 적는다.
