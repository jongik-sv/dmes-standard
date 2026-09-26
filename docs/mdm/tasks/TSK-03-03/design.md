# TSK-03-03 설계 — 룰 판정 엔진 (의사결정표·op-code 생성·룰 세트)

> 주문 `e1205c87-681d-44be-90b1-0965067683f3` · category dev · domain backend · model opus · 작성 2026-09-24 (Design Phase, 자동 모드)
> 입력: `spec.md`(요구사항 데이터) · dev-discipline 「Phase 02 — Design」 · TSK-03-01 산출물(`tasks/TSK-03-01/design.md`, `docs/mdm/decisions.md` D-020~D-023, `docs/mdm/engine-contract.md`, 엔진 main 계약 타입) · 원천 `06-business-rule.md`(이하 `06:줄`) · `workrule-column-design.md`(이하 `WR:줄`) · 원천 화면 목업 `design/basic/html/06-business-rule.html`(이하 `H:줄`) · `evalex-guide.md` · PRD FR-E2·E5·E6·E7
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물. TSK-03-01 은 dev 에 머지됐지만 미승인이라 가장 낮다.
> 에이전트 프롬프트: state.json 에 `agent_prompt` 가 없다. 위임 지시는 팀장(오케스트레이터) 메시지이고, 그 "확정된 제약" 7개를 전 Phase 에서 제약으로 지킨다(아래 §1·§5·D1·D2 에 반영).
> RULE.md: 「작업 분기 — 가이드 라우팅」 세 분기(MES 화면 설계·APS·MES 개발)는 화면·업무 모듈 작업용이다. 이 작업은 엔진 jar(`maru-mdm-engine`)의 `engine.rule` 구현만 다루므로 해당 분기가 없다. 패키지는 엔진 group `kr.dongkuk.maru.mdm`(TSK-01-01 D7)을 따른다.
> 겪은 문제는 `.issues` 에 직접 쓰지 않고 Phase 끝 보고에 분류(tool-error·gate-retry·permission·skill-unclear·env·other)와 함께 올린다.
> **개정 2026-09-26 (반려 재작업, Design opus).** 기점 `origin/dev` 6d2110fc(TSK-03-02·03-04·08-04 등 머지 뒤). 아래 「재작업 범위」 가 이번 Build 의 범위이고, 나머지 절은 최초 구현의 설계 기록이다. 개정한 곳에는 `(재작업)` 을 붙였다.

## 재작업 범위 (2026-09-26)

**반려 사유(review_note 원문, 요구사항 데이터):** "이 Task의 설계 D17에 \"03-02 머지 뒤 ExpressionRunner에 캐시 연결\"이 후속 일로 적혀 있는데, 그 연결이 빠졌습니다. 03-02는 MdmEvaluator에 캐시를 만들었지만 룰 판정은 여전히 평가할 때마다 새로 컴파일합니다. 설계에 적힌 \"반려되면 재작업 방향\"대로 연결하도록 요구했습니다."

**이번에 하는 일(요약).**

1. `ExpressionRunner` 가 `new Expression` 대신 주입받은 `MdmEvaluator.evaluate(text, values, evalTs)` 로 평가한다 — 03-02 캐시에서 원본을 꺼내 `copy()` 로 평가하고 타임아웃·`EVAL_TS` 주입이 함께 붙는다(D17 개정·D20).
2. `MdmRuleEngine` 의 생성자를 `MdmRuleEngine(MdmEvaluator, DefinitionLookup)` 하나로 바꾸고 `(ExpressionConfiguration, DefinitionLookup)` 생성자는 지운다. 엔진은 요청마다 새로 만들어도 캐시는 공유 평가기에 있다(D19).
3. mdm 운영 호출부 3곳(`ExprTypeByCaseCheck`·`RuleConfirmChecks`·`RuleValueTestService`)과 mdm 테스트 2곳이 앱에 하나인 `MdmEvaluator` 빈을 엔진에 넘긴다. mdm 쪽 아키텍처 테스트가 "평가기는 `MdmEngineConfig` 만 만든다"를 붙잡는다(D19, I47).
4. 엔진 테스트는 fixture 설정을 `MdmEvaluator` 에 태워(패키지 전용 생성자 + test 도우미, D21) 모두 캐시 경로로 돈다. 캐시 연결 증명 테스트와 운영 설정 대조 테스트를 더한다(D22, §3.6).
5. `## 후속` 의 "03-02 머지 뒤" 항목 넷을 모두 처리하거나 결정으로 남긴다(§후속 개정): 캐시 연결(이번 본체), `ContractOnlyPhaseTest` 기준선(이미 해소, F17), `rule/package-info.java`(이번에 고친다, F11 개정), `TestExpressionConfig`·`TestFunctions` 이관(부분 이관 + 대조 테스트, D22). 03-02 인계 중 `ValueConverter`·`RecordKeys` 통합은 D24 로 결정한다.

**바꾸지 않는 것.** `RuleEngine` 계약·결과 타입·스키마·TS, 판정 규칙(§5 I1-I39), 생성기와 스냅샷, `MdmEvaluator` 의 공개 생성자·공개 메서드(새 생성자는 패키지 전용), 위반의 Stage·Code 와 메시지 형식(D20).

**정본 절.** 파일 §2.5, 동작 §6.17, 테스트 §3.6, 게이트 §3.4 「재작업 게이트」, 불변 규칙 §5.3(I41-I48)과 개정 I28, 결정 D17(개정)·D19-D24, 후속 §후속 개정.

**구현 단위: 표 없음(단위 하나 B1).** 엔진 main 6파일 + 엔진 test 생성자 바꾸기 10개 + 새 테스트 3개 + mdm 5파일 + mdm 새 테스트 1개로, 도구 호출 약 100회 안에 끝날 것으로 본다. mdm 수정은 엔진 새 생성자에 기대므로 병렬로 묶을 수 없고, 나누면 단위 하나가 50회 미만이 된다(phase-design 「구현 단위 표」).

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

### 0.1 리포·아키텍처 테스트

| # | 사실 | 근거 |
|---|---|---|
| F1 | 엔진은 독립 Gradle 빌드다. 백엔드 루트 `testAll` 은 포함 빌드 11개의 `:test` 에 `dependsOn` 만 건다. **실패가 하나라도 나면 Gradle 은 `--continue` 없이 남은 테스트 태스크를 건너뛸 수 있다.** (개정: 이 Task 는 D2 개정에 따라 실패 0 게이트라 `--continue` 가 필요 없다, §3.4) | `src/backend/build.gradle:7,15-19` |
| F2 | main 의존은 `api 'com.ezylang:EvalEx:3.7.0'` 하나, test 는 JUnit 5.11.4·ArchUnit 1.3.0·`jackson-databind:2.18.2`(test 전용)다. `-parameters`, UTF-8 | `maru-mdm-engine/build.gradle` |
| F3 | **영구** `MaruMdmEngineArchitectureTest`: main 은 `kr.dongkuk.maru.mdm.engine..`·`com.ezylang.evalex..`·`java.lang/util/math/time/text..` 만 의존한다. `java.io`·`java.nio`·`java.sql`·`java.net` 은 쓸 수 없다. `java.util.regex`·`java.util.function`·`java.util.concurrent`·`java.time.temporal` 은 된다 | `arch/MaruMdmEngineArchitectureTest.java` |
| F4 | **영구** `EnginePackageDependencyTest`: `..engine.rule..`(하위 포함)은 `engine.domain`·`engine.code` 를 보지 못한다. `engine.expr`·`engine.spi` 는 본다 | `arch/EnginePackageDependencyTest.java` |
| F5 | **영구** `ContractTypeShapeTest`: `CONTRACT_TYPES` 목록에 든 계약 타입에만 형태 규칙을 건다. 새 구현 클래스는 이 목록 밖이라 영향이 없다. 단 계약 record·interface 에 메서드를 더하면(예: `RuleView.row(rowId)`) 빨강이다 | `arch/ContractTypeShapeTest.java` |
| F6 | **영구** `EngineContractSchemaTest.expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다`: main 의 `engine.expr`·`engine.rule` 을 `importPackages` 로 읽고(**하위 패키지까지 재귀**), 그 안의 **모든 record·enum**(중첩·private 포함)이 대응표(R1-R11·E1-E8) 또는 `JAVA_ONLY` 목록에 있어야 한다. 그래서 rule 에 record·enum 을 하나라도 더하면 이 테스트가 빨강이다. test 범위 클래스는 검사 밖이다 | `contract/EngineContractSchemaTest.java:106-113,210-236` |
| F7 | **임시** `ContractOnlyPhaseTest` 5건. 이 Task 가 main 구현 클래스를 넣으면 `main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다` 와 `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다` 가 반드시 빨강이 된다. 나머지 3건(`MdmExpressionConfig_의_메서드는_UnsupportedOperationException_만_던진다`, `baseBuilder_는_UnsupportedOperationException_을_던진다`, `create_는_UnsupportedOperationException_을_던진다`)은 `MdmExpressionConfig` 만 보므로 이 Task 가 그 파일을 건드리지 않으면 초록이다. (개정: 빨강이 되는 2건은 D2 개정에 따라 이 Task 가 메서드째 지운다) | `arch/ContractOnlyPhaseTest.java` |
| F8 | 계약 필드 확인(팀장 제약 4): `RuleCell.ast`(Expression 셀 AST), `RuleVar.exprAst`(식 변수 AST), `RuleVar.grpCondAst`(열 조건 AST), `RuleDefinition.contract`(입력 계약)가 **모두 있다**. view 의 AST·CONTRACT 는 이 필드를 그대로 꺼내면 된다. 반면 `RuleView.ColumnView` 에는 `resGrp`·`grpCond`·`grpCondAst` 칸이 없고, 06:495 의 `RuleView.row(rowId)` 는 계약 record 에 메서드가 필요해 F5 가 막는다(D9) | `spi/DefinitionLookup.java`, `rule/RuleView.java` |
| F9 | `RuleCell.text` 는 `@Nullable` 이 아니다. NA 셀의 텍스트도 null 이 아니라 빈 문자열 `""` 이어야 계약을 지킨다 | `spi/DefinitionLookup.java` RuleCell |
| F10 | `RuleEngine` Javadoc: `evalTs` 필수, 엔진은 초 미만을 잘라 `EVAL_TS` 로 넣는다. 레코드 키는 표준 물리명 그대로다. `text`·`textAndAst` 는 `view` 위임 default 다 | `rule/RuleEngine.java` |
| F11 | `rule/package-info.java` 의 설명("계약 전용 단계")은 이 Task 뒤에는 낡는다. 그러나 TSK-03-04 도 rule 에 파일을 더하므로 충돌을 피하려고 **고치지 않는다**. 머지 뒤 정리 대상으로 끝 보고에 올린다. **(재작업) 03-04 가 dev 에 머지돼(`RuleAnalyzer` 등) 충돌 사유가 사라졌다. 이번에 고친다(§2.5)** | `rule/package-info.java` |
| F12 | 원천 샘플의 출처: md 본문에 전체 정의(변수·행·셀)가 있는 룰은 `QLTY_GRD_JDG`(06:1295-1329) 하나뿐이다. `COIL_WGT_CALC`·`PROD_WGT_CALC`·`BASE_SPD_LKP` 의 전체 정의와 값 테스트 케이스는 화면 목업 데이터(`H:455-535`)에만 있다. `SPD_EXC`·`SPD_JOIN`(세트 `LS_A3` 의 2·3단계)은 메타데이터(`H:532-533`)와 개념(`WR:30-38`)만 있고 행·셀·기대값이 없다(D10) | 06, H, WR |
| F13 | 원천끼리 어긋나는 곳 둘: ① 06:1326 은 3행 결과 식을 `ROUND(BASE_FCT * 0.97, 2)` 로 적었지만 같은 표의 3행 셀(06:1315)과 RELEASED 목업 `QV1`(H:447)은 `0.98` 이다. `0.97` 은 DRAFT 목업 `QV2`(H:451)의 값이다. ② 06:258 은 `A.B%` 를 정규식 `STR_MATCHES(V, "A\\.B.*")` 예로 들었지만, 바로 위 06:257 은 "`%` 가 끝에 하나뿐이고 A 에 `%`·`_` 가 없으면 `STR_STARTS_WITH`" 라고 정한다. `A.B%` 는 단순형 조건을 만족한다(D11) | 06:257-258·1315·1326, H:447·451 |

### 0.2 EvalEx 3.7.0 실측 (스크래치 `Probe.java`, TSK-03-01 설정 상수로 조립한 설정, 2026-09-24)

설정은 `MdmExpressionConfig` 의 상수 14개를 빌더에 그대로 넣고, 함수 사전은 `ExpressionConfiguration.defaultConfiguration().getFunctionDictionary()` 에서 `FunctionSets.BASE` 24종을 꺼내고 테스트 전용 `INSTR`·`MASTER`·`MASTER_AT` 을 더해 `MapBasedFunctionDictionary.ofFunctions(...)` 로 만들었다.

| # | 사실 | 쓰는 곳 |
|---|---|---|
| E1 | 생성자 `new Expression(String, ExpressionConfiguration)`. `validate()`·`getAbstractSyntaxTree()`·`getAllASTNodes()`·`getUsedVariables()`·`copy()` 는 모두 `ParseException` 을 던진다(`copy()` 도 파싱한다). `evaluate()` 는 `EvaluationException, ParseException` | ExpressionRunner |
| E2 | `withValues(Map)` 는 값이 null 인 항목을 받는다(`X == NULL` → true). `Map.of` 는 null 을 못 담으므로 값 맵은 `LinkedHashMap`/`HashMap` 이어야 한다 | 값 맵 조립 |
| E3 | 변수 이름은 대소문자를 가리지 않는다(`coil_thk >= 1.6` 이 `COIL_THK` 값을 읽는다) | 예약 키·중복 키 검사(§6.8) |
| E4 | 상수 이름 키(`NULL`, `null`)를 `withValues` 에 넣으면 `UnsupportedOperationException: Can't set value for constant 'NULL'` | 예약 키 사전 검사 |
| E5 | `_V7` 은 식별자로 허용된다(`_V7 != NULL && _V7 == "A"` → true) | 식 변수 주어 |
| E6 | 결과 숫자는 `stripTrailingZeros` 때문에 음수 scale 을 가진다: 리터럴 `100` → `1E+2`, `MIN(...)` → `7E+1`, `1.00` → `1`, `0.90` → `0.9`. **비교는 `compareTo`, 직렬화는 `toPlainString()`**. `equals` 로 비교하면 틀린다 | 결과 검증, PRIORITY·ANY 비교, 테스트 단언 |
| E7 | `MIN`·`SUM` 은 배열 인자를 펼치고 빈 배열은 무시한다(`MIN(90, [80,70])` = 70, `MIN(90, [])` = 90). `arraysAllowed=false` 여도 `java.util.List` 값은 ARRAY 로 들어간다 | COLLECT LIST 결과를 다음 룰이 읽는 경로 |
| E8 | `MIN(90, NULL)` 은 `NullPointerException`(둘째 인자 NULL). `IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))` 는 `IF` 가 지연 평가라 NULL 이면 90, 목록이면 70 이다. ARRAY 와 `NULL` 의 `==` 는 false | SPD_JOIN 정의(D10) |
| E9 | 정의되지 않은 변수는 `EvaluationException: Variable or constant value for 'Q' not found`. `FALSE && Q` 는 오른쪽을 평가하지 않아 false | 입력 계약 밖 참조 → EVALUATION_ERROR |
| E10 | NULL 대소 비교(`X < 1`)는 `NullPointerException: Can not compare a null value` | 결과 식·Expression 셀의 NULL |
| E11 | 문자열 이스케이프: `\"`·`\\` 는 파싱된다. 모르는 이스케이프(`\q`)는 `ParseException: Unknown escape character` | 문자열 리터럴 규칙(I6) |
| E12 | `V >= (-1.5)` 파싱·평가 정상 | 음수 리터럴(I5) |
| E13 | 조건 식 결과가 NULL 이면 `EvaluationValue.isNullValue()` 가 true 이고 `getValue()` 는 null 이다. 숫자 결과 `2` 에 `getBooleanValue()` 를 부르면 true 가 나온다(타입을 보지 않는다). 그래서 **불린 판정은 `isBooleanValue()` 로 먼저 타입을 본다** | 조건 셀·열 조건 판정(I19) |
| E14 | `Instant` 값은 DATE_TIME 이 된다. 커스텀 함수는 `expression.getDataAccessor().getData("EVAL_TS")` 로 그 값을 읽는다(`DataAccessorIfc.getData(String)` 은 checked 예외가 없다) | EVAL_TS 주입 확인, 테스트 MASTER |
| E15 | 커스텀 함수: `AbstractFunction` 을 상속하고 `evaluate(Expression, Token, EvaluationValue...) throws EvaluationException` 을 구현한다. 인자는 클래스에 `@FunctionParameter(name=…)` 를 반복해 단다. 마지막을 `isVarArg = true` 로 두면 그 자리에 인자가 0개여도 받는다(MASTER_AT 을 고정 3 + 가변 1 로 두면 3·4 인자 모두 받음). 최소 인자보다 적으면 `ParseException: Not enough parameters for function` | 테스트 전용 함수(§6.16) |
| E16 | `EvaluationValue.nullValue()` 는 **제거 예정(deprecated for removal)** 이라 컴파일 경고가 난다. `EvaluationValue.NULL_VALUE`·`TRUE`·`FALSE` 상수와 `numberValue`·`stringValue`·`booleanValue` 를 쓴다. 오류는 `new EvaluationException(Token, String)` | 테스트 전용 함수 |
| E17 | `getAllASTNodes()` 가 돌려주는 `ASTNode.getToken().getType()` 이 `Token.TokenType.FUNCTION` 이면 `getValue()` 가 함수 이름이다 | 생성 텍스트 함수 화이트리스트 검사(I15) |
| E18 | `withValues` 에 지원하지 않는 타입(`new Object()`)을 넣으면 `IllegalArgumentException: Unsupported data type 'java.lang.Object'` | EVALUATION_ERROR 매핑 |
| E19 | 샘플 계산값: `ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)`(1.8·1200·1500·7.85) = **25434**, 외경식(1800·610·1200·1.5·7.85, `PI` 상수 사용) = **20899.7**, 시트식(0.8·1219·2438·120·7.85) = **2239.6**, `ROUND(1.0 * 0.98, 2)` = **0.98** | 샘플 값 테스트 기대값 |
| E20 | `STR_SUBSTRING("ABCDE", 1, 2)` = `"B"`(0부터, 끝 배타). `V == "1"`(V 문자열 "1") true, `V < 3`(V 문자열 "10")은 문자열 비교로 true. 타입이 섞이면 조용히 틀린다(06:198) | 타입 변환 계약의 근거 |
| E21 | 정규식 `STR_MATCHES(V, "A\\.B.*")` 는 EvalEx 문자열 이스케이프를 푼 뒤 `A\.B.*` 로 전체 일치 검사를 한다(`A.BCD` true, `AxBCD` false) | 패턴 정규식(I10) |

### 0.3 (재작업) 기점 6d2110fc 에서 조사한 사실

루트 약어는 §2 와 같다. 추가로 `X` = `E/src/main/java/kr/dongkuk/maru/mdm/engine/expr`, `M` = `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm`.

| # | 사실 | 근거 |
|---|---|---|
| F13a | 지금 룰 판정의 EvalEx 호출은 `R/ExpressionRunner.run` 한 곳이고, 평가마다 `new Expression(text, configuration).withValues(values).evaluate()` 한다. `ParseException`·`EvaluationException`·`RuntimeException` 을 rule 의 `ExpressionFailure`(checked, 메시지 = 원인 단순 이름 + `": "` + 원인 메시지)로 싸고 `Error` 는 잡지 않는다. 부르는 곳은 `RuleEvaluator` 두 곳(`test` — 조건 셀·열 조건, `evaluateValue` — 식 변수·결과 셀)뿐이다 | `R/ExpressionRunner.java:23-29`, `R/RuleEvaluator.java:264·377` |
| F13b | `MdmEvaluator`(03-02, `public final`): 공개 생성자 `(EngineLookups)`·`(EngineLookups, Duration)`, 공개 메서드 `configuration()`·`businessFunctionNames()`·`compile`·`usedVariables`·`evaluate(String, Map<String,?>, Instant)`, 패키지 전용 `cacheSize()`·`cachedOriginal(text)`. 생성자는 `MdmExpressionConfig.create(lookups)` 로 설정을 **직접** 만든다 — 임의의 `ExpressionConfiguration` 을 받는 길이 없다. 캐시는 `ConcurrentHashMap<String, Expression>`(상한 없음), `computeIfAbsent` 안에서 `validate()` 뒤에만 넣고 파싱 실패는 `expr.ExpressionFailure(PARSE)` 로 호출 스레드에서 던진다(캐시에 안 남음) | `X/MdmEvaluator.java:41-146` |
| F13c | `MdmEvaluator.evaluate` 는 원본 `copy()` → `withValues(values)` → `with(EVAL_TS, evalTs 초 절삭)` → `evaluate()` 를 **가상 스레드**(인스턴스당 `newVirtualThreadPerTaskExecutor`)에서 돌리고 `future.get(timeout)` 으로 기다린다(기본 1초). 시간 초과 → `ExpressionFailure(EVALUATION_ERROR, TIMEOUT)` + `cancel(true)`. `ExecutionException` 은 원인이 무엇이든(**`Error` 포함**) `translate` 가 `ExpressionFailure` 로 싼다: 상수 이름 키 UOE → `CONSTANT_KEY`, 그 밖 → `EVALUATION`(cause = 원래 예외). 호출 스레드 인터럽트 → `EVALUATION`(cause = `InterruptedException`), 인터럽트 표지 복원 | `X/MdmEvaluator.java:98-162` |
| F13d | `expr.ExpressionFailure` 는 `public final class … extends RuntimeException`, `code()`·`reason()`(`PARSE`·`EVALUATION`·`TIMEOUT`·`CONSTANT_KEY`)·`name()`. 생성자는 패키지 전용이다. rule 의 `ExpressionFailure`(패키지 전용, checked)와 **단순 이름이 같다** — 한 파일에서 둘을 쓰면 하나는 정규 이름으로 적어야 한다 | `X/ExpressionFailure.java` |
| F13e | 운영 평가기 빈은 앱에 하나다: `MdmEngineConfig.mdmEvaluator(...)`(`@Bean @ConditionalOnMissingBean`). 조회는 빈이 있으면 쓰고 없으면 빈 구현: `CodeLookup` = `EMPTY_CODES`(늘 빈 값), `MasterLookup.NONE`, `FunctionProvider.NONE`, `CodeEffLookup.NONE`. `MdmCodeLookup`(DB 원장 구현)은 **빈으로 등록하지 않는다**(D-077, "운영 등록은 06-05 이후") — 그래서 지금 운영 평가기의 함수는 DB 를 부르지 않는다. `MdmCodeLookup` Javadoc 은 "트랜잭션에 기대지 않는다(엔진은 가상 스레드에서 부를 수 있다)" 라고 이미 적어 두었다. mdm main 에서 `new MdmEvaluator` 는 이 빈 메서드 한 곳뿐이다 | `M/common/engine/MdmEngineConfig.java:61-66`, `M/common/mastercode/MdmCodeLookup.java` |
| F13f | 운영 호출부 셋 모두 `MdmEvaluator` 빈을 이미 생성자 주입으로 갖고 있고, 요청마다 `new MdmRuleEngine(evaluator.configuration(), new SingleRuleDefinitionLookup(def))` 를 만든다: `M/common/rule/check/ledger/ExprTypeByCaseCheck.java:71`, `M/common/rule/confirm/RuleConfirmChecks.java:134`, `M/dme/ruleEdit/service/RuleValueTestService.java:133`. `SingleRuleDefinitionLookup` 은 요청마다 만드는 정의라("스프링 빈으로 등록하지 않는다") 엔진을 싱글턴으로 둘 수 없다 → **캐시는 엔진이 아니라 공유 평가기에 있어야 한다** | 위 파일, `M/common/rule/definition/SingleRuleDefinitionLookup.java:10` |
| F13g | mdm 테스트의 같은 호출: `mdm/lib/src/test/.../common/rule/definition/RuleDefinitionAssemblerTest.java:106`(`EVALUATOR.configuration()`), `mdm/api/src/test/.../itest/CodeDataRuleLedgerChainTest.java:229`(`evaluator.configuration()`, 평가기는 운영 `MdmCodeLookup` + 시험 `DataItemMasterLookup(jdbc)` 로 225행에서 직접 만든다). `DomainMngTestConfig` 는 `CodeLookup`·`FunctionProvider` 빈만 등록하고 `MdmRuleEngine` 을 만들지 않는다 — 고칠 것이 없다 | 위 파일 |
| F13h | 트랜잭션: mdm 서비스는 `@Transactional` 을 쓰지 않고 OASIS 프로세스·`TransactionTemplate` 이 트랜잭션을 건다(`RuleConfirmService`·`RuleEditService` Javadoc I23·I25). 그래서 확정 검사·저장 검사의 룰 판정은 바깥 트랜잭션 안에서 돌 수 있다. `CodeDataRuleLedgerChainTest` 는 `@SpringBootTest(RANDOM_PORT)` 이고 `@Transactional` 이 없다. SQLite 데이터소스는 `hikari` 풀 크기를 적지 않아 기본값(10)이다 — 풀 1 교착 조건이 아니다 | `api/src/main/resources/application-local.yml:1-10` |
| F13i | 도메인 검증기(`DefaultDomainValidator`, 운영 경로)는 이미 `MdmEvaluator.evaluate`(가상 스레드 + 1초)로 평가하고 같은 mdm 테스트 스위트가 기준선에서 초록이다 | `E/src/main/java/.../domain/DefaultDomainValidator.java:116-140` |
| F13j | `RuleEvaluator` 는 값 맵에 `EVAL_TS` 를 직접 넣고(107행), 식 변수의 참조 변수 NULL 검사가 **그 값 맵을 읽는다**(159행 `values.get(ref) == null`). 그래서 값 맵의 `EVAL_TS` 를 지우면 `refVars` 에 `EVAL_TS` 가 든 식 변수가 NULL 로 바뀐다. `MdmEvaluator.evaluate` 는 `withValues` 뒤에 `with(EVAL_TS, …)` 로 같은 값을 다시 넣는다(덮어쓰기, 결과 동일) | `R/RuleEvaluator.java:106-107·159`, `X/MdmEvaluator.java:104-106` |
| F13k | 대조 테스트: `ContractTypeShapeTest.CONTRACT_TYPES` 에 `MdmEvaluator`·`MdmRuleEngine` 은 **없다**(형태 규칙 밖). `EngineContractSchemaTest` 는 main 의 record·enum 만 본다(생성자·메서드를 더해도 무관, 새 record·enum 은 금지). `EnginePackageDependencyTest` 는 rule → expr 를 허용한다. `MaruMdmEngineArchitectureTest` 는 `java.util.concurrent` 를 허용한다. 엔진 테스트에 공개 생성자·메서드를 리플렉션으로 세는 검사는 없다. m-mdm 테스트가 읽는 엔진 Java 파일은 `FunctionSets`·`MdmFunction`·`ReservedNames`·`MdmExpressionConfig`(`tests/helpers/engine-paths.ts` `JAVA_EXPR_DIR`, `evalex-contract-parity.test.ts`)와 test 리소스 코퍼스뿐이다 — `MdmEvaluator`·`MdmRuleEngine` 을 바꿔도 걸리지 않는다 | `arch/ContractTypeShapeTest.java:40-86`, `src/frontend/m-mdm/tests/**` |
| F13l | `ContractOnlyPhaseTest` 는 dev 에 없다 — 03-03 이 2건(789728e6), 03-02 가 파일째(be433b63) 지웠다. §3.4 의 "나머지 3건 뒤 기준선 재설정"은 오케스트레이터가 기점 6d2110fc 에서 다시 잰 기준선(testAll 3960 실패 0)으로 이미 해소됐다 | `/usr/bin/git log -- …/arch/ContractOnlyPhaseTest.java` |
| F13m | 룰 엔진 테스트 fixture: `T/fixture/TestExpressionConfig.create(functions, extra, zone)` 는 `MdmExpressionConfig` 상수 + `FunctionSets.BASE` + `TestFunctions`(가짜 `INSTR`·`MASTER`·`MASTER_AT`, `code(id, cate, keys…)` 코드 집합, `seenEvalTs()` 기록) + `extra`(카운팅 `CountingFn`, 필드 `int calls`)를 넣는다. 엔진을 만드는 테스트 10개: `HitPolicyTest:54`·`SampleRuleValueTest:26`·`ResultGroupTest:50-51`(COUNT_CALL)·`RuleEngineStageTest:60`·`:169-170`(UTC 시간대)·`RuleSetEvaluationTest:34`·`ExpressionVariableTest:43-44`(COUNT_CALL)·`DeriveRuleTest:38`·`SampleRuleSetValueTest:23`·`RuleViewTest:54`. `GeneratedTextParseTest`·`CellTextGeneratorTest` 는 엔진이 아니라 생성 텍스트를 테스트 안에서 `new Expression(text, CONFIG)` 로 바로 평가한다(생성기 테스트, 판정 경로 아님). 샘플 룰(`SampleRules`)에는 CODE_IN 셀이 없다(`SampleRules.java:53`). 03-04 코퍼스 하네스(`corpus/CorpusEvalExHarness.configuration`)도 같은 방식의 fixture 설정을 쓴다 | 위 파일 |
| F13n | main 에 남는 다른 `new Expression`: `X/AstExporter`(AST 내보내기, 파싱만)·`X/ExpressionChecker`(저장 시 검사, 파싱만)·`X/ExpressionEvaluator`(TSK-01-01 스캐폴드 공개 진입점, mdm 이 부르지 않음). 셋 다 03-02 산출물이고 룰 판정 경로가 아니다. rule 패키지에서 `com.ezylang` 을 import 하는 파일은 `ExpressionRunner`·`MdmRuleEngine`(`ExpressionConfiguration`)·`RuleEvaluator`(`EvaluationValue`)·`ValueConverter`(`EvaluationValue`) 넷이다 | grep |
| F13o | 03-02 인계(03-02 design §8): "셀 평가는 `MdmEvaluator.evaluate`(캐시·`copy()`·타임아웃·`EVAL_TS`)를 쓴다. 레코드 값 변환은 `ValueConverter.convert`, 레코드 키 검사는 `RecordKeys.violations` 를 쓴다." rule 에는 자체 `ValueConverter`·`RecordKeys` 가 있고 규칙이 다르다: rule 은 NUMBER 선언에서 문자열을 `new BigDecimal(s)` 로 받아 지수 표기(`1e3`)도 통과시키고, STRING·DATE 선언에서 `Double` 을 `toPlainString()` 문자열로 바꾸고, DATE 를 STRING 과 같게(문자열로) 다루고, `List` 를 그대로 둔다. expr 는 지수·16진 문자열을 거부하고, STRING 에 `Double` 을 받지 않고, DATE 는 `Instant` 만 받는다. `arch/TypeConversionEntryTest` 는 도메인 검증기만 결속하고 "rule 쪽 결속은 TSK-03-03 이 더한다"고 적었다 | `X/ValueConverter.java`, `R/ValueConverter.java`, `arch/TypeConversionEntryTest.java:1-12` |
| F13p | 06:449 안전장치는 "컴파일 결과 캐시, 식 길이 제한, **평가 타임아웃**, … 평가할 때는 `copy()`로 사본"이고, 06:438 은 서버·하위 시스템이 "똑같은 코드로 써야 결과가 일치한다"고 정한다. EvalEx 설정의 `regexTimeoutMillis` 는 100 ms 라 정규식 폭주는 평가기 1초 타임아웃보다 먼저 `EvaluationException` 으로 끊긴다(03-02 §8 표) | 06:436-449, `X/MdmExpressionConfig.java` |

---

## 1. 접근 방식

이 Task 는 `engine.rule` 에 **구현 클래스만** 더한다. 계약 타입(`RuleEngine`·`RuleResult`·`RuleSetResult`·`RuleView`·`DefinitionLookup` 레코드)과 스키마·TS 생성물, `MdmExpressionConfig` 는 한 글자도 고치지 않는다. 판정 엔진 `MdmRuleEngine` 은 생성자에서 `ExpressionConfiguration` 과 `DefinitionLookup` 을 주입받는다. 운영 설정(`MdmExpressionConfig.create`)과 `INSTR`·`MASTER` 계열 함수는 병렬 TSK-03-02 몫이므로, 테스트는 `MdmExpressionConfig` 의 **상수**로 빌더를 조립하고 계약(`MdmFunction`)과 같은 이름·인자 수의 **테스트 전용 함수**를 등록한 fixture 설정을 쓴다(D1). 평가 입력은 원천 의존성 규칙 5(06:471)대로 **배포 스냅샷의 식 텍스트**(`RuleCell.text`, `RuleVar.exprText`·`grpCond`)이고, op-code 셀 → EvalEx 텍스트 생성기 `CellTextGenerator` 는 스냅샷 조립·값 테스트를 위해 서버가 부르는 공개 API 로 둔다(06:273·426, D4). 판정은 06:210-219 의 4단계(조건 검사 → 행 고르기 → 결과 검사 → 결과 평가)를 한 클래스(`RuleEvaluator`)에 순서대로 두고, 단계마다 위반을 모아 한 번에 던진다. 결정성은 두 겹으로 붙잡는다. 생성기는 텍스트 규칙(§6.10-6.11)을 바이트 단위 회귀 스냅샷(JSON 파일)으로 고정하고, 판정은 06 샘플 룰의 값 테스트로 고정한다. 영구 아키텍처 테스트 F6 때문에 rule 의 내부 타입은 **record·enum 없이 final class** 로 만든다(D3). 이 방식을 고른 이유는 셋이다. 첫째, 계약·설정 파일을 건드리지 않아 병렬 Task(03-02·03-04)와 같은 파일에서 충돌하지 않는다. 둘째, 운영과 테스트가 같은 엔진 경로를 돌고 바뀌는 것은 주입한 설정뿐이라, 03-02 머지 뒤 설정만 바꿔 재검증할 수 있다. 셋째, 원천이 "하위 시스템은 생성기를 돌리지 않는다"(06:269·426)고 정했으므로 평가와 생성을 떼어 두어야 판정이 쓴 식과 view 가 보여 주는 식이 같다(06:494).

**(재작업) 캐시 연결.** 반려의 실체는 `ExpressionRunner` 한 줄이 아니라 **엔진을 요청마다 새로 만드는 호출부**다(F13f). 캐시를 엔진이나 `ExpressionRunner` 안에 두면 요청마다 빈 캐시로 시작한다. 그래서 캐시의 주인은 앱에 하나인 `MdmEvaluator` 빈으로 두고, 엔진은 그 평가기를 생성자로 받는다(`MdmRuleEngine(MdmEvaluator, DefinitionLookup)`, D19). 설정만 받던 옛 생성자는 지운다. 남겨 두면 `new Expression` 판정 경로가 공개 API 로 남고, 같은 사유로 다시 반려될 수 있다. `ExpressionRunner` 는 평가를 `MdmEvaluator.evaluate` 에 넘긴다(D20). 그러면 캐시 원본의 `copy()` 평가·`EVAL_TS` 주입·1초 타임아웃이 도메인 검증기와 같은 한 경로에서 붙는다(06:438·449, 03-02 인계). 호출자 스레드에서 사본을 평가하는 방식(선택지 1)은 `MdmEvaluator` 에 캐시 사본을 내주는 공개 메서드를 새로 만들어야 하고 타임아웃을 빼 버린다. 스레드가 바뀌어 생기는 위험(트랜잭션·ThreadLocal 이 따라가지 않음)은 조사해 보니 지금 운영 평가기에서는 일어나지 않고, 앞으로 쓸 DB 조회 구현도 이미 그 전제로 쓰여 있다(F13e·F13h·F13i). 바뀌면 안 되는 동작은 `ExpressionRunner` 가 붙잡는다: `Error` 는 다시 던지고, 원인 예외를 풀어 위반 메시지 형식을 지킨다(D20). 엔진 단위 테스트는 fixture 설정(가짜 `MASTER`·카운팅 함수·UTC 시간대)이 계속 필요하다. 그래서 `MdmEvaluator` 에 설정을 받는 **패키지 전용** 생성자를 두고, test 도우미가 그 생성자로 fixture 평가기를 만든다(D21). 공개 표면은 바뀌지 않고 모든 엔진 테스트가 캐시 경로를 탄다. fixture 와 운영 설정의 차이는 운영 설정 대조 테스트가 붙잡는다(D22).

---

## 2. 변경 파일 목록

루트 약어: `E` = `src/backend/maru-mdm-engine`, `R` = `E/src/main/java/kr/dongkuk/maru/mdm/engine/rule`, `T` = `E/src/test/java/kr/dongkuk/maru/mdm/engine/rule`.

### 2.1 생성 — main (모두 `kr.dongkuk.maru.mdm.engine.rule`, record·enum 금지)

| 파일 | 가시성 | 역할 |
|---|---|---|
| `R/MdmRuleEngine.java` | `public final class … implements RuleEngine` | 입구. 생성자 `MdmRuleEngine(ExpressionConfiguration configuration, DefinitionLookup definitions)`(**재작업: `MdmRuleEngine(MdmEvaluator evaluator, DefinitionLookup definitions)` 로 바꾼다, D19**). `evaluate`·`evaluateSet`·`view`·`setView`. 예약 키 검사, 세트 사전 검사, 세트 순차 실행, view 조립 |
| `R/RuleEvaluator.java` | package-private final | 룰 하나의 4단계 판정(§6.2). 식 변수·열 그룹·적중 정책·기본 행·DERIVE |
| `R/ResultAggregator.java` | package-private final | PRIORITY 행 선택, COLLECT 집계, ANY 일치 검사(§6.3) |
| `R/ExpressionRunner.java` | package-private final | EvalEx 호출 한 곳. `new Expression(text, config)` → `withValues` → `evaluate`, 예외를 `ExpressionFailure` 로 모은다. TSK-03-02 컴파일 캐시가 끼어들 자리(D17). **재작업: `MdmEvaluator.evaluate` 에 넘긴다(§6.17, D20)** |
| `R/ExpressionFailure.java` | package-private final class `extends Exception` | EvalEx 파싱·평가·런타임 예외를 한 타입으로 싣는다(메시지 = 원인 클래스 단순 이름 + `: ` + 원인 메시지) |
| `R/ValueConverter.java` | package-private final | 입력·결과 값을 선언 데이터 타입으로 바꾼다(§6.7). EvalEx 결과 → Java 값 변환도 여기 |
| `R/RecordKeys.java` | package-private final | 예약 키·대소문자 중복 키 검사(§6.8), ctx 에 대소문자 무시로 덮어쓰는 `put` |
| `R/CellTextGenerator.java` | `public final class`(private 생성자, static 메서드) | op-code 셀 → EvalEx 텍스트, 결과 Value 셀 → 리터럴 텍스트, `=` 패턴 → 정규식, 정의 전체에 텍스트 채우기(§6.10-6.11) |
| `R/CellSummary.java` | `public final class`(private 생성자, static 메서드) | 셀 요약 문자열(06:315, §6.12). view 와, 필요하면 TSK-03-04 의 `RowContract.cond` 가 쓴다 |

### 2.2 생성 — test

| 파일 | 역할 |
|---|---|
| `T/fixture/TestExpressionConfig.java` | `MdmExpressionConfig` 상수 14개 + `FunctionSets.BASE`(EvalEx 기본 사전에서 꺼냄) + `TestFunctions` 로 `ExpressionConfiguration` 을 만든다(§6.16) |
| `T/fixture/TestFunctions.java` | 테스트 전용 `INSTR`·`MASTER`·`MASTER_AT`(`AbstractFunction`). 이름·인자 수는 `MdmFunction` 그대로. 코드 집합 주입, 본 `EVAL_TS` 기록 |
| `T/fixture/InMemoryDefinitionLookup.java` | 룰 ID → 버전 목록, 세트 ID → 세트. `rule(id, evalTs)` 는 KST 로 바꿔 `applyFrom ≤ t < applyTo` 인 버전. `ruleSet` 호출·`rule` 호출 횟수를 센다(폐기 세트 검증용) |
| `T/fixture/RuleFixtures.java` | 변수·행·셀을 짧게 만드는 정적 도우미(`cond(...)`, `result(...)`, `row(...)`, `op(...)`, `in(...)`, `range(...)`, `expr(...)`, `val(...)`, `contract(...)`) |
| `T/fixture/SampleRules.java` | 06 샘플 룰 넷 + `SPD_EXC`·`SPD_JOIN` + 세트 `LS_A3`·`WID_OLD` 정의(§6.15). 셀 텍스트는 `CellTextGenerator.withTexts(...)` 로 채운다 |
| `T/CellTextSnapshotTest.java` | 수용 기준 2 — 회귀 스냅샷 대조와 결정성 |
| `E/src/test/resources/kr/dongkuk/maru/mdm/engine/rule/cell-text-snapshot.json` | 회귀 스냅샷(§3.2, 항목 §6.10.4) |
| `T/GeneratedTextParseTest.java` | 수용 기준 3 — 생성 텍스트 EvalEx 파싱, 함수 화이트리스트, 정규식 컴파일, fixture 함수 계약 대조 |
| `T/CellTextGeneratorTest.java` | 생성기 거부 규칙과 의미(생성 텍스트를 실제로 평가해 NULL 정책·경계·패턴·방향 확인) |
| `T/SampleRuleValueTest.java` | 수용 기준 1 — 샘플 룰 넷의 값 테스트 |
| `T/RuleSetEvaluationTest.java` | 수용 기준 4·5 — LS_A3 실행, 입력 키 일괄 확인, 폐기·없는 세트 |
| `T/RuleEngineStageTest.java` | 4단계·예약 키·EVAL_TS·타입 변환·오류 매핑·경고·trace |
| `T/HitPolicyTest.java` | FIRST·UNIQUE·PRIORITY·COLLECT(5종)·ANY·기본 행 |
| `T/ResultGroupTest.java` | 결과 열 그룹 |
| `T/ExpressionVariableTest.java` | 식 변수 `_V<var_id>` |
| `T/DeriveRuleTest.java` | 산출 룰 순차 평가 |
| `T/RuleViewTest.java` | `view`·`setView`·parts 선택 |
| `T/CellSummaryTest.java` | 셀 요약 규칙 |
| `T/ValueConverterTest.java` | 타입 변환 표 |

### 2.3 수정

| 파일 | 변경 |
|---|---|
| `E/src/test/java/kr/dongkuk/maru/mdm/engine/arch/ContractOnlyPhaseTest.java` | 이 Task 의 구현 클래스 때문에 무효가 되는 테스트 메서드 2건(`main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다`, `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다`)을 지운다. 그 2건만 쓰던 import·상수(`SCAFFOLD`, `MASTER_LOOKUP_NONE`)를 정리하고, 클래스 Javadoc 에 삭제 사실 한 줄을 덧붙인다. 나머지 3건과 파일은 남긴다(D2 개정). |

그 밖의 기존 파일은 한 줄도 고치지 않는다.

### 2.4 수정하지 않는 것(명시, 바꾸면 게이트 실패로 본다)

- `E/src/main/java/.../expr/MdmExpressionConfig.java` — TSK-03-02 몫. 고치면 `ContractOnlyPhaseTest` 나머지 3건이 깨지고 03-02 와 충돌한다.
- 계약 타입 전부(`rule/RuleEngine`·`RuleResult`·`RuleSetResult`·`RuleView`, `spi/**`, `expr/**`, `code/**`, `domain/**`), `E/src/main/resources/.../engine-contract.schema.json`, `src/frontend/m-mdm` 의 생성 TS.
- `E/src/test/java/.../arch/**`(`ContractOnlyPhaseTest` 는 §2.3 의 메서드 2건 삭제 외에는 고치지 않는다. 파일을 지우거나 `@Disabled` 하지 않는다, D2), `E/src/test/java/.../contract/**`(`JAVA_ONLY` 목록 포함, D3).
- `rule/package-info.java`(F11), 스캐폴드 `expr/ExpressionEvaluator.java` 와 그 테스트.
- `docs/mdm/engine-contract/**` 초안.
- `state.json`(오케스트레이터 관리).

> (재작업) §2.3·§2.4 는 최초 구현 기준이다. `ContractOnlyPhaseTest` 는 이미 없고(F13l), `rule/package-info.java` 는 이번에 고친다. 이번 Build 의 파일 목록과 금지 목록은 §2.5 가 정본이다.

### 2.5 (재작업) 변경 파일 목록

추가 약어: `X` = `E/src/main/java/kr/dongkuk/maru/mdm/engine/expr`, `XT` = `E/src/test/java/kr/dongkuk/maru/mdm/engine/expr`, `ML` = `src/backend/mdm/lib`, `MA` = `src/backend/mdm/api`, `M` = `ML/src/main/java/com/dongkuk/dmes/mdm`.

**수정 — 엔진 main**

| 파일 | 변경 |
|---|---|
| `X/MdmEvaluator.java` | 패키지 전용 생성자 `MdmEvaluator(ExpressionConfiguration configuration, Set<String> businessFunctionNames, Duration timeout)` 를 더한다(세 인자 모두 `requireNonNull`, 이름 집합은 `Set.copyOf`). 공개 생성자 `(EngineLookups, Duration)` 은 `this(MdmExpressionConfig.create(lookups), 이름 집합(lookups), timeout)` 으로 위임한다. 인자 평가 순서 때문에 예외 순서(설정 IAE → lookups NPE → timeout NPE)가 지금과 같다. 공개 멤버·Javadoc 의 계약 문장은 바꾸지 않는다. 클래스 Javadoc 에 "룰 엔진도 이 평가기로 평가한다(TSK-03-03 D20)" 한 줄만 더한다(D21) |
| `R/ExpressionRunner.java` | 필드 `MdmEvaluator evaluator`. `run(String text, Map<String, Object> values, Instant evalTs)` 가 `evaluator.evaluate(text, values, evalTs)` 를 부른다. 예외 변환은 §6.17(D20). Javadoc 을 새 동작으로 고친다 |
| `R/ExpressionFailure.java` | 생성자는 그대로 `(Throwable cause)` 다. Javadoc 에 "원인은 EvalEx·런타임 예외, 또는 타임아웃·인터럽트면 `expr.ExpressionFailure` 자신"(§6.17) 한 줄을 더한다 |
| `R/RuleEvaluator.java` | `runner.run(text, values)` 두 곳(`test`, `evaluateValue`)에 `evalTs`(Run 필드)를 셋째 인자로 넘긴다. 값 맵의 `EVAL_TS` 넣기(107행)는 **그대로 둔다**(F13j, D23). 그 밖의 줄은 고치지 않는다 |
| `R/MdmRuleEngine.java` | 생성자를 `public MdmRuleEngine(MdmEvaluator evaluator, DefinitionLookup definitions)` 하나로 바꾼다(둘 다 `requireNonNull`, 메시지 `"evaluator"`·`"definitions"`). `ExpressionConfiguration` import 를 지운다. 클래스 Javadoc 의 D1 문단을 "공유 평가기를 받는다(D19), 캐시는 평가기에 있다"로 고친다 |
| `R/package-info.java` | "TSK-03-01 계약 전용 단계. interface·record·enum·상수만 둔다" 를 지금 상태(계약 타입 + 판정 엔진 `MdmRuleEngine`·생성기·겹침 분석 구현, 식 평가는 `MdmEvaluator` 에 맡긴다)로 고친다(F11). 패키지 선언은 그대로 |

**생성 — 엔진 test**

| 파일 | 역할 |
|---|---|
| `XT/MdmEvaluatorFixtures.java` | `public final class`(private 생성자). 같은 패키지라 패키지 전용 멤버를 부른다. `public static final Duration FIXTURE_TIMEOUT = Duration.ofSeconds(10)`, `of(ExpressionConfiguration cfg)`(= `of(cfg, FIXTURE_TIMEOUT)`), `of(ExpressionConfiguration cfg, Duration timeout)`(이름 집합은 빈 집합), `cacheSize(MdmEvaluator)`, `isCached(MdmEvaluator, String text)`(= `cachedOriginal(text) != null`). 다른 로직은 두지 않는다 |
| `T/ExpressionCacheWiringTest.java` | 캐시 연결 증명·동작 동일성(§3.6 표). I41-I46·I48 |
| `T/ProductionConfigParityTest.java` | 운영 설정(`new MdmEvaluator(EngineLookups)`)으로 샘플 판정·LS_A3·스냅샷 파싱·CODE_IN 한 벌을 돌려 fixture 경로와 같은지 본다(§3.6, D22) |

**수정 — 엔진 test (생성자 바꾸기만)**

`T/HitPolicyTest`·`T/SampleRuleValueTest`·`T/ResultGroupTest`·`T/RuleEngineStageTest`(두 곳)·`T/RuleSetEvaluationTest`·`T/ExpressionVariableTest`·`T/DeriveRuleTest`·`T/SampleRuleSetValueTest`·`T/RuleViewTest`: `new MdmRuleEngine(<설정 식>, lookup)` → `new MdmRuleEngine(MdmEvaluatorFixtures.of(<설정 식>), lookup)`. `<설정 식>` 과 단언은 한 글자도 바꾸지 않는다. 예외: `T/ExpressionVariableTest` 에 사례 1건을 더한다(§3.6, I46). `T/fixture/TestExpressionConfig.java` 는 Javadoc 의 "`create()` 는 TSK-03-02 전에는 UOE 라 부르지 않는다" 문장만 "엔진 단위 테스트용 fixture 설정이다. 운영 설정과의 차이는 `ProductionConfigParityTest` 가 본다(D22)" 로 고친다.

**수정 — mdm**

| 파일 | 변경 |
|---|---|
| `M/common/rule/check/ledger/ExprTypeByCaseCheck.java` | 71행 `new MdmRuleEngine(evaluator.configuration(), …)` → `new MdmRuleEngine(evaluator, …)` |
| `M/common/rule/confirm/RuleConfirmChecks.java` | 134행 같은 변경 |
| `M/dme/ruleEdit/service/RuleValueTestService.java` | 133행 같은 변경 |
| `ML/src/test/java/com/dongkuk/dmes/mdm/common/rule/definition/RuleDefinitionAssemblerTest.java` | 106행 `EVALUATOR.configuration()` → `EVALUATOR` |
| `MA/src/test/java/com/dongkuk/dmes/mdm/itest/CodeDataRuleLedgerChainTest.java` | 229행 `evaluator.configuration()` → `evaluator`. 225행 평가기 생성은 그대로 둔다(§7 재작업 함정 참조) |

**생성 — mdm test**

| 파일 | 역할 |
|---|---|
| `ML/src/test/java/com/dongkuk/dmes/mdm/common/engine/MdmEngineWiringArchitectureTest.java` | ArchUnit(lib 에 이미 `archunit-junit5:1.3.0` test 의존이 있다). `com.dongkuk.dmes.mdm` main(`DO_NOT_INCLUDE_TESTS`)을 읽어 ① `MdmEngineConfig` 밖의 클래스는 `MdmEvaluator` 생성자를 부르지 않는다 ② 어느 클래스도 `com.ezylang.evalex.Expression` 생성자를 부르지 않는다(I47). 가져오기 방식은 같은 모듈의 `contract/MdmContractArchitectureTest` 를 따른다 |

**수정하지 않는 것(재작업, 바꾸면 게이트 실패로 본다)**

- 계약 타입(`rule/RuleEngine`·`RuleResult`·`RuleSetResult`·`RuleView`, `spi/**`, `expr/EngineEvaluationException`·`EngineWarning`·`FunctionSets`·`ReservedNames`·`MdmExpressionConfig`·`MdmFunction` 등 `CONTRACT_TYPES`), 스키마·TS 생성물, `engine-contract.md`.
- `MdmEvaluator` 의 공개 생성자 두 개·공개 메서드 다섯 개의 시그니처와 동작, `expr/ExpressionFailure`, `expr/ValueConverter`·`RecordKeys`(D24).
- 판정 규칙 코드: `RuleEvaluator`(§2.5 의 두 호출 인자 외)·`ResultAggregator`·rule `ValueConverter`·`RecordKeys`·`CellTextGenerator`·`CellSummary`·`InputContracts`·`RuleAnalyzer`·`PatternShapes`·`ValueSets`, 스냅샷 JSON.
- 기존 테스트의 단언·기대값·fixture 동작(`TestFunctions`·`InMemoryDefinitionLookup`·`RuleFixtures`·`SampleRules`), `arch/**`·`contract/**`·`corpus/**` 테스트.
- 다른 Task 의 문서(`docs/mdm/tasks/TSK-08-04/**` 등이 옛 생성자를 적은 것은 그 Task 의 기록이라 고치지 않는다), `state.json`.

---

## 3. 테스트 전략

### 3.1 새 테스트와 위치

모든 새 테스트는 `T`(= `E/src/test/java/kr/dongkuk/maru/mdm/engine/rule/`)에 둔다. 같은 패키지라 package-private 클래스(`ValueConverter` 등)를 직접 부를 수 있다. 테스트 메서드 이름은 리포 관례대로 한국어 밑줄 표기다(예: `폐기된_세트는_SET_DEPRECATED_로_거부하고_룰을_조회하지_않는다`). 여러 입력은 `@ParameterizedTest` + `@MethodSource` 로 묶는다. 숫자 단언은 `assertEquals(0, expected.compareTo(actual))` 로 한다(E6).

| 테스트 클래스 | 주요 사례(최소) | 데이터 |
|---|---|---|
| `SampleRuleValueTest` | QLTY 7 케이스(§6.15.1 표), COIL 1, PROD 3 + 결과 검사 위반 1, BASE_SPD 3. 결과 값·적중 행·`defaultApplied`·`groupChoices`·trace | `SampleRules` + `InMemoryDefinitionLookup` + `TestExpressionConfig` |
| `CellTextSnapshotTest` | ① 스냅샷 항목마다 생성 결과 = 기대 텍스트(`String.equals`, UTF-8 바이트 비교와 같다) ② 같은 입력 두 번 생성 결과 동일 ③ 숫자 표기만 다른 두 셀(`1.60`/`1.6`, `+007.10`/`7.1`)의 텍스트 동일 ④ 스냅샷 id 유일, 항목 수 ≥ 50 | `cell-text-snapshot.json` |
| `GeneratedTextParseTest` | ① 스냅샷의 빈 문자열이 아닌 텍스트 전부 `new Expression(text, cfg).validate()` 통과 ② 조건 op-code 항목 텍스트의 FUNCTION 토큰 이름 ⊆ `FunctionSets.GENERATED`(E17) ③ `SampleRules` 모든 셀 텍스트·식 변수·열 조건 파싱 통과 ④ 정규식형 패턴의 `patternRegex` 결과가 `Pattern.compile` 통과 ⑤ `TestFunctions` 이름·최소/최대 인자 수 = `MdmFunction`(최대+1 인자면 평가 오류) | 스냅샷 + 샘플 |
| `CellTextGeneratorTest` | 거부 사례 전부(§6.10.3) → `IllegalArgumentException`. 의미 사례: op 마다 NULL 입력이면 IS_NULL 만 참·NA 는 텍스트 없음, 구간 op 4종 경계값(양 끝 값 그 자체), `1.10 == 1.1`, 패턴 단순형 셋·정규식형·이스케이프·`_` 단독, CONTAINS·INSTR 방향·메타문자·대소문자, CODE_IN 소속·비소속·NULL, 일자 문자열 구간, 원소 하나짜리 IN, `withTexts` 가 모든 셀에 텍스트를 채우고 NA 는 `""` | 생성 → `TestExpressionConfig` 로 평가 |
| `RuleSetEvaluationTest` | LS_A3 2 케이스(적중 있음·없음), 세트 입력 키 누락 두 개가 한 예외에 `SET_CHECK`·`MISSING_KEY` 로 함께, 앞 룰 결과로 채워지는 이름(`BASE_SPD`·`EXC_SPD`)은 요구하지 않음, 폐기 세트 → `SET_DEPRECATED` 이고 `rule()` 호출 0회, 없는 세트 → `SET_NOT_FOUND`, 세트 안 룰 없음 → `RULE_NOT_FOUND`(`SET_CHECK`), 세트 예약 키 → `SET_CHECK`, `finalValues` 에 입력 키 없음·결과 합집합, 단계 결과 순서 | `SampleRules` |
| `RuleEngineStageTest` | 조건 변수 키 누락 여럿이 한 예외에(`INPUT_CHECK`), 타입 변환 실패(`INPUT_CHECK`·`TYPE_CONVERSION`), 예약 키 넷(상수 대소문자 무시·`eval_ts`·`_X`·대소문자 중복), 룰 없음 → `RULE_NOT_FOUND`, EVAL_TS 초 미만 절삭(테스트 MASTER 가 본 값·`RuleResult.evalTs`·lookup 에 넘긴 값), NA 셀 미평가, Expression 셀 NULL → 거짓 + `EXPR_CELL_NULL`, 조건 결과가 불린이 아님 → `EVALUATION_ERROR`, 조건 셀 평가 예외 → `ROW_SELECT`·`EVALUATION_ERROR`, 결과 검사 `MISSING_KEY`·`REQUIRED_NULL` 동시, 결과 식 예외 → `RESULT_EVAL`, 결과 값 선언 타입 변환 실패 → `RESULT_EVAL`·`TYPE_CONVERSION`, 적중하지 않은 행의 결과 식은 평가하지 않음(평가하면 예외가 나는 식을 둔다), 결과 맵 키 순서·null 값 보존 | 테스트 안 작은 정의 |
| `HitPolicyTest` | FIRST(뒤 행 `evaluated=false`), **열 seq 순서 사례**(조건 열 var 9 가 seq 1, var 2 가 seq 2 이고 두 셀이 모두 거짓이면 `firstFalseVarId == 9`), **첫 거짓 셀에서 멈춤 사례**(행의 첫 조건 셀이 거짓이고 그 뒤 셀이 평가하면 예외가 나는 Expression 셀이어도 판정 오류가 나지 않고 `firstFalseVarId` 는 첫 셀), UNIQUE 복수 적중 → `UNIQUE_MULTIPLE_HITS`, PRIORITY(순위·동률·목록 밖 값·NULL·순위 없는 열), COLLECT LIST·SUM·MIN·MAX·COUNT, COLLECT 무적중(기본 행 있음/없음), NULL 값 제외, ANY 일치·불일치(`ANY_CONFLICT`), 기본 행 없는 무적중 → 결과 키 전부 null | 테스트 안 정의 |
| `ResultGroupTest` | seq 순 첫 참 열, 기본 열(빈 열 조건), 참도 기본 열도 없음 → 결과 null·`groupChoices` 값 null, 열 조건 NULL → `GRP_COND_NULL` 경고, 열 조건 예외 → `ROW_SELECT`, 고르지 않은 열의 셀은 평가하지 않음(평가하면 예외인 셀), 고른 열의 셀이 없으면 null(다음 열로 넘어가지 않음), 결과 키 = `res_grp`, 열 조건은 레코드마다 한 번(카운팅 테스트 함수) | 테스트 안 정의 |
| `ExpressionVariableTest` | `_V<var_id>` 계산·셀 텍스트 주어, 참조 변수 NULL → 식 평가 없이 NULL(카운팅 함수로 확인) → `IS NULL` 행 적중, 선언 타입 변환 실패 → `ROW_SELECT`·`TYPE_CONVERSION`(name `_V7`), 식 예외 → `ROW_SELECT`·`EVALUATION_ERROR` | 테스트 안 정의 |
| `DeriveRuleTest` | 결과 열 seq 순 평가, 뒤 식이 앞 결과를 읽음, `hits` 는 행 하나, trace 한 줄 | 테스트 안 정의 |
| `RuleViewTest` | parts 조합 4가지(없음·TEXT·AST·TEXT+AST+CONTRACT)에서 null 칸 규칙, text 는 스냅샷 값 그대로(일부러 생성기와 다른 텍스트를 넣어 확인), AST·contract 는 같은 인스턴스, 열 순서(COND seq → RESULT seq), 행 순서(NORMAL seq → DEFAULT), 식 변수 `exprText`, `text`·`textAndAst` default, `setView` 순서·폐기 세트 허용·없는 룰 `RULE_NOT_FOUND` | `SampleRules` |
| `CellSummaryTest` | 06:315·1320 예시 전부(§6.12 표) | 셀 구조 |
| `ValueConverterTest` | §6.7 표의 칸마다 성공·실패 | 값 |

### 3.2 회귀 스냅샷 파일

- 위치: `E/src/test/resources/kr/dongkuk/maru/mdm/engine/rule/cell-text-snapshot.json`. 읽기는 `getResourceAsStream` + Jackson(test 전용).
- 형식(UTF-8, 들여쓰기 2칸):

```json
{
  "version": 1,
  "cases": [
    {"id": "eq.string", "kind": "cond", "dataType": "STRING", "subject": "SURF_GRD", "maruCodeId": null,
     "cell": {"op": "EQ", "left": "A"}, "text": "SURF_GRD != NULL && SURF_GRD == \"A\""},
    {"id": "result.value.number", "kind": "result", "dataType": "NUMBER",
     "cell": {"val": "1.050"}, "text": "1.05"}
  ]
}
```

- `kind` 는 `cond`(→ `conditionText`) 또는 `result`(→ `resultText`). `cell` 은 `RuleCell` 의 `op·left·right·list·expr·val` 만 싣고 `text` 는 싣지 않는다.
- 필수 항목과 기대 텍스트는 §6.10.4 표가 정본이다. Build 는 그 표를 JSON 으로 옮긴다(JSON 에서는 `\`·`"` 가 한 번 더 이스케이프된다).
- **스냅샷은 자동 재생성하지 않는다.** 생성 규칙을 바꿔 텍스트가 바뀌면 스냅샷 파일을 손으로 고치고 그 이유를 design.md 이탈 기록에 적는다(바뀐 텍스트는 재배포해야 하위 시스템 판정에 반영된다, 06:269).

### 3.3 샘플 룰을 fixture 로 옮기는 방법

- `SampleRules` 가 §6.15 의 표를 그대로 코드로 옮긴다. 변수 ID·seq·표시 타입·데이터 타입·도메인 ID·셀 JSON 은 원천 값을 바꾸지 않는다.
- 셀의 `text` 는 손으로 쓰지 않고 `CellTextGenerator.withTexts(definition, domainId -> 마루코드)` 로 채운다. 그래서 값 테스트가 생성기와 엔진을 함께 탄다(스냅샷 조립과 같은 경로).
- 입력 계약은 03-04 가 계산할 값이지만 아직 없으므로 06:226-229·1326 과 §6.15 표대로 손으로 적는다.
- 모든 샘플 판정의 평가 시각은 `2026-10-01T00:00:00+09:00`(모든 샘플의 적용 시작 뒤)이다.

### 3.4 게이트 명령과 판정

오케스트레이터가 기준선으로 실제 돌린 명령(원문 그대로):

```
# backend — 기준선 518건, 실패 0
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon

# frontend — 기준선 6건, 실패 0, lint 통과
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
```

- **게이트는 위 backend 명령 그대로(`--continue` 없이) 종료 코드 0, 실패 0 이다**(D2 개정, 팀장 지시). 총수는 각 포함 빌드의 `build/test-results/test/TEST-*.xml` 을 테스트 이름 단위로 모아 센다.
- 엔진만 빠르게: `cd src/backend/maru-mdm-engine && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew test --no-daemon`(래퍼 경로는 Build 가 확인한다. 없으면 `cd src/backend && … ./gradlew :maru-mdm-engine:test` 대신 `testAll --continue` 를 쓴다).
- **게이트 = 실패 0 + 테스트 이름 단위로 기준선과 차분했을 때 계획 삭제 2건 외에 사라진 테스트 없음 + 총수 미감소.**
  - 계획 삭제(D2 개정): `ContractOnlyPhaseTest.main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다`, `ContractOnlyPhaseTest.EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다`.
  - 예상 총수: 기준선 518 − 계획 삭제 2 + 새 테스트 539 = **1,055**. "총수 미감소"의 하한은 계획 삭제 2건을 뺀 **516** 이다.
  - 초록 유지 필수: `ContractOnlyPhaseTest` 의 나머지 3건, `ContractTypeShapeTest`·`EnginePackageDependencyTest`·`MaruMdmEngineArchitectureTest`·`EngineContractSchemaTest`·`EngineContractConstantsTest`·`ExpressionEvaluatorTest` 전부.
- **기준선 재설정 규칙:** TSK-03-02 가 먼저 머지되어 이 브랜치가 그 위로 올라가면 `ContractOnlyPhaseTest` 나머지 3건도 사라진다. 그때 기준선은 "518 − 5 = 513 + 03-02 가 더한 테스트 수"이고 게이트는 여전히 실패 0 이다. Verify 는 기준선을 다시 잡은 사실을 보고에 적는다.
- frontend 는 이 Task 가 건드리지 않지만 게이트로 그대로 돌려 6건·lint 통과를 확인한다.
- **브라우저 E2E 스모크 넷: 해당 없음.** 사유: entry-point 없음(`-`), domain backend, 화면이 없다.

**(재작업) 게이트 — 위 명령과 기준선은 최초 구현 때 것이다. 이번 재작업의 정본은 아래다.** 기점 6d2110fc 에서 오케스트레이터가 잰 기준선: testAll 3960건 실패 0 / m-mdm test 1064건 실패 0 / m-mdm lint 통과 / shared test:unit 170건 실패 0 / OASIS 계약 검사 exit 0. 명령(글자 그대로):

```
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test
cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint
cd src/frontend && pnpm test:unit:shared
python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .
```

- 게이트 = 다섯 명령 모두 실패 0·exit 0 + 테스트 이름 단위로 기준선과 차분했을 때 사라진 테스트 없음(이번엔 계획 삭제가 **없다**) + 총수 미감소(testAll ≥ 3960, m-mdm ≥ 1064, shared ≥ 170). 늘어나는 수는 §3.6 의 새 테스트 수다.
- 조사·Build 중 좁힌 명령(무거운 명령 규칙대로 `heavy.sh` 로 감싼다): `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew :maru-mdm-engine:test :mdm:test --no-daemon --console=plain`, 단일 클래스 `… ./gradlew :maru-mdm-engine:test --tests <클래스> --no-daemon --console=plain`.
- frontend·OASIS 는 이 재작업이 건드리지 않지만 기준선 명령 그대로 게이트로 돌린다.

### 3.5 변이 검증 대상

§5 불변 규칙 I1-I40 전부다. 각 항목의 "변이 → 빨강" 칸이 Build·Verify 의 순회 목록이다. 덮지 못하는 변이는 §5 표에 적었고, 발견하면 테스트를 늘리거나 보고한다.

**(재작업)** 이번 Build·Verify 의 변이 순회 목록은 §5.3 의 I41-I48 과 개정한 I28 이다. I1-I27·I29-I39 는 판정 코드를 고치지 않으므로 다시 돌리지 않는다. 대신 생성자를 바꾼 기존 엔진 테스트 10개가 초록이면 그 불변 규칙들이 캐시 경로에서도 지켜진다고 본다(같은 단언이 새 경로를 탄다).

### 3.6 (재작업) 새 테스트

| 테스트 | 사례 | 데이터·방법 |
|---|---|---|
| `T/ExpressionCacheWiringTest` | ① `룰_판정은_주입한_평가기의_캐시로_평가한다`: 빈 fixture 평가기로 QLTY 샘플 Q1(§6.15.1)을 판정 → `cacheSize > 0`, Q1 에서 평가된 조건 셀 텍스트(1행의 NA 가 아닌 첫 조건 셀)와 적중 행의 결과 셀 텍스트가 모두 `isCached`(두 텍스트가 서로 다름을 테스트가 먼저 확인한다) ② `요청마다_새_엔진이어도_평가기_캐시를_공유한다`: 같은 평가기로 엔진 A 를 만들어 Q1 판정 → 캐시 크기 n, 엔진 B 를 **새로** 만들어 같은 판정 → 크기 그대로 n, 결과 동일 ③ `rule_main_은_Expression_을_직접_만들지_않는다`(ArchUnit, main 만): `..engine.rule..` 이 `com.ezylang.evalex.Expression` 의 생성자를 부르지 않는다 ④ `평가_중_Error_는_잡지_않고_그대로_던진다`: extra 함수 `THROW_ERROR()`(본문 `throw new AssertionError("boom")`)를 조건 셀 식에 두고 `assertThrows(AssertionError.class, …)`, 메시지 `boom` ⑤ `평가_타임아웃은_단계의_EVALUATION_ERROR_다`: extra 함수 `BLOCK()`(03-02 `SLOW` 와 같은 모양: `entered` 래치 내림 → 아무도 내리지 않는 래치를 10 초까지 기다림)를 조건 셀·결과 셀에 각각 두고 평가기 타임아웃 50 ms(`MdmEvaluatorFixtures.of(cfg, Duration.ofMillis(50))`) → 조건 셀이면 `ROW_SELECT`·`EVALUATION_ERROR`, 결과 셀이면 `RESULT_EVAL`·`EVALUATION_ERROR`, 메시지에 `ms 안에 끝나지 않았다` 가 든다. `assertTimeoutPreemptively(5 초)` 로 상한 ⑥ `실패_메시지는_원인_예외_형식을_지킨다`: 입력 계약 밖 변수 `Q` 를 읽는 조건 셀 → 위반 메시지에 `EvaluationException: Variable or constant value for 'Q' not found` 가 들고 `ExpressionFailure` 라는 글자는 없다. 파싱 실패 식(`V ==`) → `ParseException: ` 이 든다 ⑦ `MdmEvaluator_의_공개_생성자는_두_개_그대로다`: 리플렉션으로 `MdmEvaluator.class.getConstructors()` 의 인자 타입 목록이 정확히 `[EngineLookups]`·`[EngineLookups, Duration]` 이고, 비즈니스 함수 `THK_OK`(인자 1개) 하나를 주는 `FunctionProvider` 로 만든 `new MdmEvaluator(lookups).businessFunctionNames()` 가 `{"THK_OK"}` 다(위임 뒤에도 이름 집합이 채워진다) | 테스트 안 작은 정의(`RuleFixtures`) + `SampleRules`. extra 함수는 `TestExpressionConfig.create(new TestFunctions(), Map.of(…))` 로 넣는다 |
| `T/ProductionConfigParityTest` | ① `샘플_룰_판정이_운영_설정과_fixture_설정에서_같다`(매개변수화): §6.15 의 QLTY·COIL·PROD·BASE_SPD 레코드 전부(값 테스트와 같은 레코드)를 fixture 엔진(`MdmEvaluatorFixtures.of(TestExpressionConfig.create())`)과 운영 엔진(`new MdmEvaluator(lookups)`)으로 판정해 결과가 같다(숫자 `compareTo`, 적중 rowId·`defaultApplied`·경고 code, 위반이면 Stage·Code 목록) ② `LS_A3_세트가_운영_설정에서_같은_값이다`: §6.15.5 S1·S2 는 `finalValues` 동일, S3·S4 는 같은 위반 ③ `스냅샷_텍스트는_운영_설정으로_파싱된다`: `CellTextSnapshotTest.cases()` 의 빈 문자열이 아닌 텍스트 전부 운영 평가기 `compile(text)` 가 예외 없이 끝난다(수용 기준 3 을 운영 설정으로 확인) ④ `CODE_IN_생성_텍스트는_운영_MASTER_로도_같은_소속을_낸다`: `CellTextGenerator.conditionText`(CODE_IN, 마루 코드 `PROC_CD`, 카테고리 `PLATING`)의 텍스트를 V = `P1`·`P3`·null 로 두 설정에서 평가 → 둘 다 true·false·false | 운영 `lookups` = `new EngineLookups(SampleRules.lookup(), codes, CodeEffLookup.NONE, MasterLookup.NONE, FunctionProvider.NONE)`. `codes` 는 `PROC_CD` 하나만 아는 `CodeLookup` 람다: 헤더 `INUSE`, 버전 v1 RELEASED(적용 2020-01-01 ~ 9999-12-31), 항목 P1·P2·P3, 카테고리 `PLATING`(TABLE) 소속 P1·P2. 행 모양은 mdm `DomainMngTestConfig.procCd()`(F13g)를 그대로 따른다(`lvl` 5칸·`attrs` 10칸은 `Arrays.asList(new String[n])`). fixture 쪽은 `new TestFunctions().code("PROC_CD", "PLATING", "P1", "P2")` |
| `T/ExpressionVariableTest`(사례 추가) | `참조_변수에_EVAL_TS_가_있어도_식_변수를_평가한다`: `refVars = [EVAL_TS]`, `exprText = "EVAL_TS != NULL"`(BOOLEAN) 식 변수 → `_V<id>` 가 true 이고, 그 식 변수 셀 `_V<id> == TRUE` 행이 적중한다(값 맵에서 `EVAL_TS` 를 빼는 변이면 NULL 로 건너뛰어 적중하지 않는다) | 테스트 안 정의 |
| `ML/.../common/engine/MdmEngineWiringArchitectureTest` | ① `평가기는_MdmEngineConfig_만_만든다` ② `mdm_은_EvalEx_Expression_을_직접_만들지_않는다` | ArchUnit, mdm lib main |

- 캐시 증명의 대상 메서드는 `MdmEvaluator` 의 패키지 전용 `cacheSize()`·`cachedOriginal()` 이고, 엔진 test 는 `XT/MdmEvaluatorFixtures` 를 거쳐서만 부른다.
- 가상 스레드와 fixture 상태: `TestFunctions.seenEvalTs`(ArrayList)·`CountingFn.calls`(int)는 가상 스레드에서 쓰고 테스트 스레드에서 읽는다. `Future.get` 이 끝나는 것과 작업 안 쓰기 사이에 happens-before 가 있고, 평가는 한 번에 하나씩(앞 평가의 `get` 뒤에 다음 제출) 돌므로 동기화를 더하지 않는다. 타임아웃 사례(⑤)의 `BLOCK` 은 카운터를 쓰지 않는다.

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 | 원천으로 검증되는 부분 / 설계가 정한 부분 |
|---|---|---|
| 06 샘플 룰 QLTY_GRD_JDG·COIL_WGT_CALC·PROD_WGT_CALC·BASE_SPD_LKP 값 테스트 일치 | `SampleRuleValueTest`. 원천 값 테스트 케이스(06:1322-1323, H:510·521·526-527·530-531)의 결과 변수·적중 행이 그대로 나오는지 본다. 숫자는 `compareTo`. 원천 케이스 외에 적중 행마다 1 케이스·기본 행·NULL 케이스를 더한다 | 원천: 네 룰의 정의와 원천 케이스 기대값 8건(QLTY 1, COIL 1, PROD 3, BASE_SPD 2 + E19 실측 확인). 설계: 추가 케이스(QLTY 2-7, BASE_SPD 3)의 기대값은 원천 표에서 손으로 계산한 값이다(§6.15) |
| 같은 셀 입력에 바이트 동일 출력(회귀 스냅샷 테스트) | `CellTextSnapshotTest` ①-④ | 원천: 06:242-261 생성 규칙과 06:1327-1329 생성 예 3건. 설계: 원천이 정하지 않은 표기(공백·괄호·IN 한 원소·음수 결과 리터럴·패턴 이스케이프 해석)는 §6.10-6.11 로 고정 |
| 생성 텍스트가 EvalEx 파싱을 통과 | `GeneratedTextParseTest` ①-⑤ | 원천: 06:345 "생성해 보기". 설계: 파싱 설정은 테스트 전용 fixture 설정(D1) |
| 세트 LS_A3 샘플 실행 결과 일치 | `RuleSetEvaluationTest` LS_A3 두 케이스 | 원천: 세트 순서(06:1087·1324), 1단계 BASE_SPD 값(H:530-531 → 90), 세트 입력 키 규칙(06:420). **설계: 2·3단계 `SPD_EXC`·`SPD_JOIN` 의 행·셀과 그 기대값(`EXC_SPD`·`LINE_SPD`)은 원천에 없어 이 설계가 정의했다(D10)** |
| 폐기된 세트 판정 시 명시적 오류 | `RuleSetEvaluationTest.폐기된_세트는_…` — `EngineEvaluationException`, 위반 1건 `Stage.SET_CHECK`·`Code.SET_DEPRECATED`, 룰 조회 0회 | 원천: 06:419 "어느 룰도 돌리지 않고 판정 오류", 06:1089. 폐기 세트 예 `WID_OLD`(H:540) |

**(재작업) 매핑 보강.** 수용 기준 다섯은 그대로이고, 모든 엔진 테스트가 캐시 경로(`MdmEvaluator`)로 다시 확인한다. 반려 요구는 아래처럼 붙잡는다.

| 항목 | 검증 방법 | 비고 |
|---|---|---|
| 수용 기준 1·4(샘플 값·LS_A3) — 운영 설정에서도 | 기존 `SampleRuleValueTest`·`SampleRuleSetValueTest`·`RuleSetEvaluationTest`(fixture 평가기, 캐시 경로) + `ProductionConfigParityTest` ①② | fixture 와 운영 설정의 결과가 같음을 직접 비교한다(D22) |
| 수용 기준 3(파싱) — 운영 설정에서도 | 기존 `GeneratedTextParseTest` + `ProductionConfigParityTest` ③ | 운영 평가기 `compile` 은 캐시에 넣는 그 파싱이다 |
| 반려 요구: 룰 판정이 03-02 캐시에서 원본을 받아 `copy()` 로 평가한다 | `ExpressionCacheWiringTest` ①②③, `MdmEngineWiringArchitectureTest` ①②, `MdmRuleEngine` 생성자 제거(컴파일로 보장) | ② 가 "요청마다 새 엔진"인 운영 호출 모양을 그대로 재현한다. 호출부가 평가기를 새로 만드는 회귀는 mdm 아키텍처 테스트 ① 이 잡는다 |
| 반려 요구의 부수 조건: 동작이 바뀌지 않는다 | 생성자만 바꾼 기존 엔진 테스트 10개 초록(단언 불변) + `ExpressionCacheWiringTest` ④⑥ + mdm·api 테스트 초록 | 새로 생기는 동작은 타임아웃 하나(D20, ⑤) |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

각 항목은 "넣을 변이 → 빨강이 되는 테스트"로 적는다. Build·Verify 는 이 표를 순회해 변이를 넣고 빨강을 확인한 뒤 되돌린다.

### 5.1 생성기(텍스트)

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I1 | NULL 가드: NA·IS_NULL·NOT_NULL 을 뺀 모든 op-code 조건 텍스트는 `V != NULL && ` 로 시작한다(06:181) | NE 에서 가드를 뺌 → `CellTextSnapshotTest`(ne.*) + `CellTextGeneratorTest` NULL 사례(`<> C` 에 NULL 이 적중) |
| I2 | IS_NULL = `V == NULL`, NOT_NULL = `V != NULL`, NA = `""`(평가 목록에서 뺀다) | IS_NULL 을 `V != NULL && V == NULL` 로 → 스냅샷. NA 가 null 을 돌려줌 → `CellTextGeneratorTest.withTexts_…NA_는_빈_문자열` |
| I3 | 구간 op 4종: 왼쪽 부등호는 뒤집고(`<=`→`>=`, `<`→`>`) 오른쪽은 그대로, `V != NULL && V ⊙ L && V ⊙ R`(06:154·252) | `< 변수 <=` 의 왼쪽을 `>=` 로 → 스냅샷 + 경계값 평가 사례(L 값이 참이 됨) |
| I4 | IN = `V != NULL && (V == L1 \|\| … )` 괄호 묶음(원소 하나도 괄호), 저장 순서 유지. NOT_IN = `V != NULL && V != L1 && …` 괄호 없음 | IN 괄호 제거 → 스냅샷. 목록 정렬 추가 → 스냅샷(in.string.order) |
| I5 | 숫자 리터럴: 형식 `^[+-]?\d+(\.\d+)?$` 만 받는다(지수·16진·`.5`·`5.` 거부). 선행 `+`·정수부 앞 0·소수 끝 0 을 지우고, 0 은 `0`, 음수는 `(-x)` 괄호(06:248-249) | `stripTrailingZeros` 를 뺌 → 스냅샷(eq.number) + 결정성 ③. 음수 괄호 제거 → 스냅샷. `1e3` 허용 → 거부 사례 |
| I6 | 문자열 리터럴: 큰따옴표, `\`→`\\`, `"`→`\"` 두 가지만, 제어문자(U+0000-U+001F, U+007F)는 거부(06:247) | `"` 이스케이프 누락 → 스냅샷(eq.escape) + 파싱 테스트. 탭 허용 → 거부 사례 |
| I7 | 불린: `TRUE`/`FALSE` 맨 이름(입력은 대소문자 무시), `V == TRUE` 꼴을 유지하고 `V`·`!V` 로 줄이지 않는다(06:250) | `V == TRUE` 를 `V` 로 축약 → 스냅샷(eq.boolean) |
| I8 | `=` 패턴 토큰화(STRING 변수의 EQ 값에만): `\%`·`\_`·`\\` 는 글자, 다른 글자 앞이나 끝의 홀로 선 `\` 는 거부, 연속 `%` 는 하나로 접고, 접은 뒤 `%` 개수 ≤ 3, `%` 단독(접은 뒤)은 거부(06:158·335) | 접기 제거 → 스냅샷(eq.pattern.collapse) + `%%` 거부 사례. 상한을 4 로 → 거부 사례(`%A%B%C%`). 홀로 선 `\` 허용 → 거부 사례 |
| I9 | 단순형 셋: `[글자+, %]` → `STR_STARTS_WITH(V, "A")`, `[%, 글자+]` → `STR_ENDS_WITH(V, "A")`, `[%, 글자+, %]` → `INSTR(V, "A") > 0`. 글자 부분에 `_`(와일드카드)가 있으면 단순형이 아니다(06:257) | 접두형을 `STR_MATCHES` 로 → 스냅샷(eq.pattern.prefix). `_` 가 섞인 `A_%` 를 단순형으로 → 스냅샷(eq.pattern.underscore-prefix) |
| I10 | 정규식형: 글자의 메타문자 14종(`\ ^ $ . \| ? * + ( ) [ ] { }`)만 앞에 `\`, `%`→`.*`, `_`→`.`, 앵커 없음, 그다음 문자열 리터럴 규칙을 한 번 더(06:158·258) | 메타문자 하나 누락(`.`) → 스냅샷(eq.pattern.regex-meta-all) + 의미 사례(`A.B_` 가 `AxB1` 에 적중). `^…$` 앵커 추가 → 스냅샷 |
| I11 | CONTAINS = `V != NULL && INSTR(V, "값") > 0`, INSTR op = `V != NULL && INSTR("값", V) > 0`, 값은 글자 그대로(패턴·이스케이프 해석 없음), 빈 값 거부(06:144-145·159) | 두 방향 뒤바꿈 → 스냅샷 + 방향 의미 사례(06:168-175 표). `STR_CONTAINS` 로 → 스냅샷 + 대소문자 사례 |
| I12 | CODE_IN = `V != NULL && MASTER("<마루 코드>", "<카테고리>", V)`, 마루 코드가 없으면 거부(06:143·157) | 인자 순서 뒤바꿈 → 스냅샷(code_in) + 소속 의미 사례 |
| I13 | 표기: 등호는 `==`·`!=` 만, 이항 연산자 양옆 공백 한 칸, 함수 인자 구분 `, `, 괄호 안쪽 공백 없음(06:256·261) | `==` 를 `=` 로 → 스냅샷 전체. `&&` 앞 공백 제거 → 스냅샷 |
| I14 | 식 변수 주어는 `_V<var_id>`, 이름 변수는 `var_name` 그대로(식별자 `^[A-Za-z_][A-Za-z0-9_]*$` 아니면 거부)(06:254) | `subject()` 가 `_V` 대신 `V_` → `CellTextGeneratorTest.subject_…` + `ExpressionVariableTest` |
| I15 | 생성 텍스트는 EvalEx 파싱을 통과하고, 조건 op-code 텍스트의 함수는 `FunctionSets.GENERATED` 안이다(06:345, TSK-03-01 §5 GENERATED) | CONTAINS 를 `STR_CONTAINS` 로 → `GeneratedTextParseTest` ②. 문자열 이스케이프 누락 → ① |
| I16 | 결정성: 같은 입력은 바이트가 같은 텍스트, 숫자 표기만 다른 입력도 같은 텍스트(06:261) | `HashSet` 으로 IN 원소 순회 → 스냅샷 반복 실행에서 흔들림(원소 5개 이상 항목으로 확인) |

### 5.2 판정 엔진

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I17 | 4단계 순서와 단계별 일괄 수집: 단계 안 위반은 모두 모아 그 단계 끝에 한 번 던진다. 앞 단계 위반이 있으면 뒤 단계를 돌지 않는다(06:210-219). Stage·Code 매핑은 §6.9 표 | 첫 위반에서 바로 던짐 → `RuleEngineStageTest.조건_변수_키가_여럿_없으면_한_예외에_모두_담는다`. MISSING_KEY 의 Stage 를 ROW_SELECT 로 → 같은 테스트 |
| I18 | NA 셀(`op == "NA"`)은 평가하지 않는다. NA 여부는 텍스트가 아니라 op 로 판정한다 | NA 셀 텍스트를 평가 → `RuleEngineStageTest.NA_셀은_평가하지_않는다`(NA 셀 text 에 평가하면 예외인 식을 넣어 둔다) |
| I19 | 조건 셀·열 조건: 결과가 NULL 이면 그 셀만 거짓 + 경고(`EXPR_CELL_NULL`/`GRP_COND_NULL`), 결과가 불린이 아니면(`isBooleanValue()` 거짓) `EVALUATION_ERROR`(06:200·425·427, E13) | NULL 을 예외로 → `…Expression_셀_NULL_은_거짓과_경고`. `getBooleanValue()` 만 봄 → `…불린이_아니면_평가_오류` |
| I20 | FIRST: 첫 적중에서 멈추고 뒤 행은 `evaluated=false`. `firstFalseVarId` 는 조건 열 seq 순 첫 거짓 셀, 적중·미평가 행은 null. 행 평가는 첫 거짓 셀에서 멈춘다 | 적중 뒤 행도 평가 → `HitPolicyTest.FIRST_…` + QLTY 케이스 trace. 열 순서를 var_id 순으로 → `HitPolicyTest` 열 seq 순서 사례(샘플 룰은 var_id 순서와 seq 순서가 같아 이 변이를 잡지 못한다). 거짓 셀 뒤 셀도 평가 → `HitPolicyTest` 첫 거짓 셀에서 멈춤 사례(뒤 셀 예외로 `ROW_SELECT` 오류가 나 빨강) |
| I21 | UNIQUE: 적중이 둘 이상이면 `ROW_SELECT`·`UNIQUE_MULTIPLE_HITS` | 첫 적중을 채택 → `HitPolicyTest.UNIQUE_…` |
| I22 | PRIORITY: 행 순위는 결과 열 seq 순으로 `prio_list` 가 있는 열의 순위 튜플을 사전식으로 견주고(목록 밖 값·NULL 은 가장 낮음), 동률이면 행 seq 가 작은 쪽. `hits` 는 순위 순(승자 먼저), 결과는 승자 행의 값(D6) | 순위를 역순으로 → `HitPolicyTest.PRIORITY_…`. 동률 규칙 제거 → 동률 사례 |
| I23 | COLLECT: 적중 행 seq 순으로 값을 모으고 NULL 은 버린다. LIST=목록, SUM=합, MIN·MAX=최소·최대(숫자는 compareTo, 문자열은 UTF-16 순), COUNT=NULL 이 아닌 값 개수(BigDecimal). 모은 값이 없으면 LIST 는 빈 목록, COUNT 는 0, 나머지는 NULL. `collect_agg` 가 null 이면 LIST. 적중이 없으면 기본 행 값 하나로 같은 집계, 기본 행도 없으면 NULL(D7) | SUM 을 MAX 로 → 해당 사례. NULL 을 버리지 않음 → NULL 사례. 무적중을 빈 목록으로 → 무적중 사례 |
| I24 | ANY: 적중 행마다 결과가 같아야 한다(숫자 compareTo, 목록은 원소별, null==null). 어긋나면 결과 변수마다 `RESULT_EVAL`·`ANY_CONFLICT`. 결과는 첫 적중 행 값 | `equals` 로 숫자 비교 → `1.0` vs `1` 사례가 거짓 불일치로 빨강. 불일치 무시 → 불일치 사례 |
| I25 | 기본 행: 적중이 없을 때만 쓰고 `defaultApplied=true`, `hits` 는 비운다. 기본 행이 없으면 결과 변수 키는 모두 있고 값은 null(06:31, D8) | 기본 행을 적중으로 `hits` 에 넣음 → `HitPolicyTest.기본_행_…`. 결과 키 생략 → 같은 테스트 |
| I26 | 결과 검사: 결과를 낼 행(FIRST·UNIQUE 적중 행, PRIORITY·COLLECT·ANY 적중 행 전부, 없으면 기본 행)의 `RowContract` 만 본다. required 는 키 없음 `MISSING_KEY`·NULL `REQUIRED_NULL`, optional 은 키 없음만. 이 단계에서 그 변수들을 선언 타입으로 바꾼다(06:216, D16) | 모든 행 계약을 봄 → PROD 코일 케이스(시트 키 없음)가 빨강. REQUIRED_NULL 누락 → PROD 결과 검사 사례 |
| I27 | 적중하지 않은 행의 결과 식은 평가하지 않는다(06:219) | 모든 행 결과 평가 → `RuleEngineStageTest.적중하지_않은_행의_결과_식은_평가하지_않는다` |
| I28 | EVAL_TS: `evalTs.truncatedTo(ChronoUnit.SECONDS)` 를 `Instant` 로 값 맵 `EVAL_TS` 에 넣고, `DefinitionLookup.rule` 에도 그 값을 넘기고, `RuleResult.evalTs`·`RuleSetResult.evalTs` 도 그 값이다(06:422). **(재작업) EvalEx 에 넣는 일은 `MdmEvaluator.evaluate` 도 같은 값으로 한 번 더 한다(D23). `ExpressionRunner` 에는 같은 절삭 값(Run 의 `evalTs`)을 넘긴다** | 절삭 제거 → `RuleEngineStageTest.EVAL_TS_는_초_미만을_자른다`(`RuleResult.evalTs`·lookup 에 넘긴 값 단언이 빨강. 식이 본 값은 평가기가 다시 자르므로 가려진다). `LocalDateTime` 으로 넣음 → (재작업) 평가기가 `Instant` 로 덮어써 식 쪽은 가려진다. 값 맵 쪽 변이는 I46 이, 평가기 쪽 변이(`MdmEvaluator` 의 `with(EVAL_TS, …)` 를 `LocalDateTime` 으로)는 `RuleEngineStageTest.EVAL_TS_는_설정_시간대와_무관하게_Instant_로_넣는다` 가 잡는다 |
| I29 | 예약 키: 상수 8종(대소문자 무시) `CONSTANT_KEY`, `EVAL_TS`(대소문자 무시) `EVAL_TS_KEY`, `_` 로 시작 `RESERVED_KEY`, 대소문자만 다른 키 둘 이상 `RESERVED_KEY`(06:199·422·424, D13) | 상수 비교를 대소문자 구분으로 → `pi` 키 사례. `eval_ts` 허용 → 사례. 중복 검사 제거 → 사례 |
| I30 | 식 변수: 행을 돌기 전에 레코드마다 한 번, 참조 변수 중 하나라도 NULL 이면 평가하지 않고 NULL, 결과는 선언 타입으로 변환, 실패 `TYPE_CONVERSION`·예외 `EVALUATION_ERROR`(둘 다 `ROW_SELECT`, name `_V<id>`)(06:121·424) | 참조 NULL 에서도 평가 → `ExpressionVariableTest`(카운팅 함수 호출 0회 단언). 변환 생략 → 변환 실패 사례 |
| I31 | 결과 열 그룹: 그룹마다 열 조건을 열 seq 순으로 평가해 첫 참 열, 빈 열 조건은 기본 열(참), 고른 열 셀만 평가, 결과 키는 `res_grp`, 고른 열이 없으면 값 null·`groupChoices` 값 null, 열 조건은 레코드마다 한 번(06:69·425) | 모든 그룹 열 셀 평가 → `ResultGroupTest.고르지_않은_열_셀은_평가하지_않는다`. 결과 키를 열 코드로 → BASE_SPD 값 테스트. 행마다 열 조건 재평가 → 카운팅 사례 |
| I32 | DERIVE: 결과 열 seq 순으로 평가하고 각 결과를 곧바로 값 맵에 넣어 뒤 식이 읽는다. 적중 정책 없음, `hits` 는 행 하나(06:975, WR:49) | 한꺼번에 평가 후 대입 → `DeriveRuleTest.뒤_식이_앞_결과를_읽는다` |
| I33 | 타입 변환 표(§6.7): NUMBER·STRING·BOOLEAN 변환 규칙, `List` 는 그대로, 실패는 `TYPE_CONVERSION` | Double 을 `BigDecimal.valueOf(double)` 대신 `new BigDecimal(double)` 로 → `ValueConverterTest`(0.1). STRING 에 Boolean 허용 → 사례 |
| I34 | 세트: 폐기(`DEPRECATED`)면 룰을 조회하지도 돌리지도 않고 `SET_CHECK`·`SET_DEPRECATED`. 실행 전 입력 키 일괄 확인 = 룰 순서대로 (조건 변수 ∪ DERIVE 룰 행 변수) − 앞 룰 결과 이름, 없는 키는 모두 `SET_CHECK`·`MISSING_KEY` 한 예외로. 실행은 같은 ctx 로 순차 전파(06:419-420·429) | 폐기 검사를 룰 조회 뒤로 → 조회 0회 단언. 앞 룰 결과 이름을 빼지 않음 → LS_A3 정상 케이스가 MISSING_KEY. 첫 누락에서 던짐 → 누락 둘 사례 |
| I35 | `finalValues` = 단계 결과의 합집합(뒤 룰이 같은 이름을 덮는다), 입력 레코드 키·`EVAL_TS`·`_V*` 는 없다 | ctx 전체를 반환 → `RuleSetEvaluationTest.finalValues_…` |
| I36 | view: 고르지 않은 부분은 null(TEXT → `summary`·`text`·`ColumnView.exprText`, AST → `CellView.ast`·`ColumnView.exprAst`, CONTRACT → `contract`). text·AST·계약은 스냅샷 값을 그대로 꺼내고 다시 만들지 않는다(06:475·490-496) | view 가 생성기로 텍스트를 다시 만듦 → `RuleViewTest.text_는_스냅샷_값_그대로`(스냅샷 텍스트를 일부러 다르게 둔다). AST 를 TEXT 만 골라도 채움 → parts 사례 |
| I37 | 셀 요약 규칙(§6.12) | `IN (A, B)` 구분자를 `,` 로 → `CellSummaryTest`. Equal 셀에 `= ` 접두 → 같은 테스트 |
| I38 | 결과 표현: `results` 키는 결과 열 seq 순(그룹은 첫 열 자리), null 값을 담을 수 있는 불변 맵, 숫자는 EvalEx 가 낸 `BigDecimal` 그대로 | `Map.copyOf` 사용 → null 결과 사례에서 NPE. 키 순서 흔들림 → 키 순서 단언 |
| I39 | 아키텍처: rule main 에 record·enum 이 없고(F6), rule 은 `engine.code`·`engine.domain` 을 보지 않으며(F4), main 의존은 EvalEx·java 표준뿐이다(F3) | rule 에 `private record X(int a)` 추가 → `EngineContractSchemaTest.expr_rule_패키지의_…`. `CodeResolver` import → `EnginePackageDependencyTest.rule_은_…`. `java.io.UncheckedIOException` 사용 → `MaruMdmEngineArchitectureTest` |
| I40 | 계약·설정 불변: `MdmExpressionConfig`·계약 타입·스키마·TS 생성물·arch/contract 테스트 파일은 바이트 동일(단 `ContractOnlyPhaseTest` 는 §2.3 의 메서드 2건 삭제만), `ContractOnlyPhaseTest` 나머지 3건 초록. **(재작업) `ContractOnlyPhaseTest` 는 없다(F13l). 재작업의 파일 불변은 §2.5 「수정하지 않는 것」 이고 Verify 가 `/usr/bin/git diff 6d2110fc -- <경로>` 가 비어 있는지 본다** | `MdmExpressionConfig.baseBuilder` 에 몸체 추가 → `ContractOnlyPhaseTest` 3건 빨강. 자동 테스트가 없는 부분(스키마·TS·테스트 파일 자체)은 Verify 가 `/usr/bin/git diff <머지 기준> -- <경로>` 가 비어 있는지 본다(덮지 못하는 변이로 보고) |

### 5.3 (재작업) 캐시 연결

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I41 | 룰 판정의 모든 식 평가(조건 셀·열 조건·식 변수·결과 셀·DERIVE)는 생성자로 받은 `MdmEvaluator` 의 `evaluate` 를 거친다. rule main 은 `Expression` 을 직접 만들지 않는다 | `ExpressionRunner.run` 을 `new Expression(text, evaluator.configuration()).withValues(values).evaluate()` 로 되돌림 → `ExpressionCacheWiringTest` ①(캐시 0)·③(ArchUnit). `test` 경로만 되돌림 → ①(조건 셀 텍스트 미캐시). `evaluateValue` 경로만 되돌림 → ①(결과 셀 텍스트 미캐시) |
| I42 | 캐시는 평가기 인스턴스에 있고 엔진 인스턴스와 무관하다 — 같은 평가기로 만든 엔진끼리 같은 텍스트를 다시 컴파일하지 않는다 | `ExpressionRunner` 가 엔진 인스턴스마다 자체 캐시(`Map<String, Expression>`)를 두고 거기서 `copy()` 평가 → `ExpressionCacheWiringTest` ①(주입 평가기 캐시 0)·②. 운영 호출부가 요청마다 평가기를 새로 만듦 → I47 |
| I43 | 평가 중 `Error` 는 잡지 않는다 — 평가기가 싼 `Error` 원인을 `ExpressionRunner` 가 그대로 다시 던진다(최초 §6.9 "Error 는 잡지 않는다" 유지) | Error 다시 던지기 제거 → `ExpressionCacheWiringTest` ④(위반으로 바뀌어 `assertThrows` 빨강) |
| I44 | 평가 타임아웃은 그 식을 평가한 단계의 `EVALUATION_ERROR` 위반이다(조건 셀·열 조건·식 변수 → `ROW_SELECT`, 결과 셀 → `RESULT_EVAL`). 단계 안 일괄 수집(I17)도 그대로다 | `ExpressionRunner` 가 `expr.ExpressionFailure` 를 잡지 않고 흘림 → ⑤ 빨강(런타임 예외가 판정 밖으로 샘). `TIMEOUT` 을 `Error` 처럼 다시 던짐 → ⑤ 빨강 |
| I45 | 위반 메시지 형식: 원인이 EvalEx `BaseException`·`RuntimeException` 이면 그 원인의 단순 이름 + `": "` + 메시지(최초와 같다), 타임아웃·인터럽트면 `expr.ExpressionFailure` 자신의 이름·메시지 | 원인을 풀지 않고 `expr.ExpressionFailure` 로 싸기 → `ExpressionCacheWiringTest` ⑥(`ExpressionFailure` 글자가 들어가고 `EvaluationException: Variable…` 이 없음) |
| I46 | `RuleEvaluator` 값 맵의 `EVAL_TS`(절삭 `Instant`)는 그대로 둔다 — 식 변수 참조 NULL 검사가 그 맵을 읽는다(F13j, D23) | 값 맵 `values.put(EVAL_TS, …)` 제거 → `ExpressionVariableTest.참조_변수에_EVAL_TS_가_있어도_식_변수를_평가한다` |
| I47 | mdm 은 평가기를 `MdmEngineConfig` 빈 한 곳에서만 만들고, 룰 엔진은 그 빈으로 만든다. mdm main 은 `Expression` 을 직접 만들지 않는다 | `ExprTypeByCaseCheck` 가 `new MdmEvaluator(MdmEngineConfig.lookups(null, null, null))` 로 엔진을 만듦 → `MdmEngineWiringArchitectureTest` ①. mdm main 에 `new Expression(…)` 추가 → ② |
| I48 | `MdmEvaluator` 의 공개 표면 불변: 공개 생성자 `(EngineLookups)`·`(EngineLookups, Duration)` 둘, 새 생성자는 패키지 전용. 공개 생성자의 동작(설정 = `MdmExpressionConfig.create(lookups)`, 이름 집합, 타임아웃 null 검사)은 그대로 | 새 생성자를 `public` 으로 → `ExpressionCacheWiringTest` ⑦. 위임에서 이름 집합을 빈 집합으로 → ⑦ 의 이름 집합 단언(기점의 expr 테스트에는 `businessFunctionNames` 단언이 없어 ⑦ 이 맡는다) |

---

## 6. 상세 설계

### 6.1 공개 API

```java
public final class MdmRuleEngine implements RuleEngine {
    public MdmRuleEngine(ExpressionConfiguration configuration, DefinitionLookup definitions);  // 둘 다 requireNonNull
    // (재작업) 위 생성자는 지우고 아래 하나만 둔다(D19)
    public MdmRuleEngine(MdmEvaluator evaluator, DefinitionLookup definitions);                 // 둘 다 requireNonNull
    // RuleEngine 네 메서드 구현. text·textAndAst 는 계약 default 그대로 쓴다
}

public final class CellTextGenerator {
    public static final String NA_TEXT = "";                 // NA 셀 텍스트(F9)
    public static final int MAX_PATTERN_WILDCARDS = 3;        // `%` 개수 상한(06:158)
    public static final Set<String> REGEX_META = …;           // `\ ^ $ . | ? * + ( ) [ ] { }` 14종

    /** 이름 변수면 var_name, 식 변수(varName == null && exprText != null)면 "_V" + varId. 그 밖은 IAE. */
    public static String subject(RuleVar var);
    /** 조건 셀 텍스트. NA → NA_TEXT, Expression 셀(op == null, expr != null) → expr 그대로. maruCodeId 는 CODE_IN 에만 쓴다. */
    public static String conditionText(RuleCell cell, @Nullable String subject, DataType dataType, @Nullable String maruCodeId);
    /** 결과 셀 텍스트. val → 리터럴, expr → 그대로. */
    public static String resultText(RuleCell cell, DataType dataType);
    /** `=` 값(저장 문자열)이 정규식형이면 앵커 없는 Java 정규식, 정확 일치·단순형이면 빈 값. 거부 대상이면 IAE. */
    public static Optional<String> patternRegex(String patternValue);
    /** 정의의 모든 셀에 text 를 채운 새 RuleDefinition. maruCodeIdByDomainId 는 CODE_IN 셀에서만 부른다. */
    public static RuleDefinition withTexts(RuleDefinition definition, Function<String, String> maruCodeIdByDomainId);
}

public final class CellSummary {
    /** 셀 요약(§6.12). var 가 null 이면 셀 모양만으로 만든다. */
    public static String of(@Nullable RuleVar var, RuleCell cell);
}
```

- 생성기 오류는 모두 `IllegalArgumentException` 이고 메시지에 사유를 적는다. `withTexts` 는 앞에 `rule <id> row <rowId> var <varId>: ` 를 붙인다.
- `@Nullable` 은 `kr.dongkuk.maru.mdm.engine.spi.Nullable` 이다(rule 이 spi 를 보는 것은 허용).
- 이 시그니처는 TSK-03-04 의 코퍼스 CellCase 서버 러너가 부를 계약이다(engine-contract §11 `variable{name,dataType,maruCodeId}`·`patternRegex`). 바꾸면 03-04 에 알린다(D15).

### 6.2 룰 하나의 판정 절차 (`RuleEvaluator`)

입력: 정의 `def`, ctx(`LinkedHashMap<String,Object>`, 레코드 + 앞 룰 결과), 절삭된 `evalTs`. 예약 키 검사는 부르는 쪽(`MdmRuleEngine`)이 이미 했다.

**값 맵.** EvalEx 에 넘기는 맵은 매 평가 시점에 `new LinkedHashMap<>(ctx)` + `EVAL_TS` → `Instant` + 계산한 `_V<id>` 들이다. DERIVE 는 결과를 낼 때마다 이 맵에 넣는다. 영속 ctx 에는 `EVAL_TS`·`_V*` 를 넣지 않는다.

**열·행 순서.** 조건 열 = `varKind == COND` 를 seq 오름차순. 결과 열 = `RESULT` 를 seq 오름차순. 평가 행 = `rowKind == NORMAL` 을 seq 오름차순(같으면 rowId). 기본 행 = `DEFAULT` 중 목록에서 처음 것.

1. **조건 검사 (`INPUT_CHECK`)**: `contract.always`(계약이 null 이면 빈 계약으로 본다)의 이름마다 ctx 에 **정확히 같은 키**가 없으면 `MISSING_KEY`, 있으면 `ValueConverter` 로 선언 타입 변환(실패 `TYPE_CONVERSION`)하고 ctx 값을 변환값으로 바꾼다. 모아서 던진다.
2. **행 고르기 (`ROW_SELECT`)**:
   1. 식 변수 계산(§6.5). 위반이 있으면 여기서 던진다.
   2. 행마다 조건 열 순서로 셀을 본다. 셀이 없으면(키 없음) 건너뛴다(저장 시 검사가 막는 모양이지만 판정은 무관으로 본다). NA 면 건너뛴다. 아니면 `cell.text` 를 평가한다: 예외 → `EVALUATION_ERROR`(rowId, 메시지에 var_id·원인), NULL → 거짓 + `EXPR_CELL_NULL` 경고(rowId, varId), 불린이 아님 → `EVALUATION_ERROR`, 거짓 → 그 셀이 `firstFalseVarId` 이고 행 평가를 멈춘다.
   3. 적중 정책: FIRST 는 첫 적중에서 멈추고 나머지 행은 `RowTrace(evaluated=false, hit=false, firstFalseVarId=null)`. UNIQUE·PRIORITY·COLLECT·ANY 는 모든 행을 본다. UNIQUE 적중이 둘 이상이면 `UNIQUE_MULTIPLE_HITS`(rowId null, 메시지에 적중 rowId 목록).
   4. 결과를 낼 행이 있으면(적중 또는 기본 행) 결과 열 그룹의 열을 고른다(§6.4).
   5. 이 단계 위반을 모아 던진다. **위반이 있으면 적중 결과와 무관하게 던진다.**
3. **결과 검사 (`RESULT_CHECK`)**: 결과를 낼 행마다 `contract.rows` 에서 같은 rowId 의 `RowContract` 를 찾아(없으면 검사 없음) required·optional 을 본다(I26). 변환값으로 ctx 를 바꾼다. 결과를 낼 행이 없으면(무적중·기본 행 없음) 이 단계와 4단계를 건너뛰고 결과는 모두 null 이다.
4. **결과 평가 (`RESULT_EVAL`)**: 결과를 낼 행마다 결과 열 순서로 셀 텍스트를 평가한다. 그룹 열은 고른 열 하나만 평가한다. 셀이 없으면 null. 평가 값은 `ValueConverter.fromEvalEx` 로 Java 값으로 바꾼 뒤 결과 열 `dataType` 으로 변환한다(실패 `TYPE_CONVERSION`, name = 결과 변수 이름). DECISION 은 행의 결과를 모두 낸 뒤 적중 정책으로 합치고(§6.3), DERIVE 는 셀마다 값 맵에 바로 넣는다(§6.6). 위반을 모아 던진다.
5. **결과 조립**: `RuleResult(ruleId, ver, evalTs, hits, defaultApplied, results, trace, warnings)`. `results` 는 결과 이름(그룹이면 `res_grp`, 아니면 `var_name`)마다 한 칸, 결과 열 seq 순, `Collections.unmodifiableMap(new LinkedHashMap<>(…))`. `hits`·`trace`·`warnings` 는 `List.copyOf`. `Hit.groupChoices` 는 그룹마다 고른 var_id(null 허용) 불변 맵이고 그룹이 없으면 빈 맵이다.

### 6.3 적중 정책 (`ResultAggregator`)

| 정책 | 행 고르기 | 결과 | `hits` 순서 |
|---|---|---|---|
| FIRST | 첫 적중 | 그 행 값 | 0-1개 |
| UNIQUE | 적중 ≥ 2 면 오류 | 그 행 값 | 0-1개 |
| PRIORITY | 모든 적중 | 순위 1위 행 값(I22). 순위 튜플: 결과 열 seq 순으로 `prio_list` 가 비어 있지 않은 열만, 값의 순위 = 목록에서 처음 일치하는 위치(없거나 NULL 이면 목록 길이). 일치: 값이 BigDecimal 이면 원소를 BigDecimal 로 파싱해 compareTo==0(파싱 실패는 불일치), String 이면 equals, Boolean 이면 원소가 `TRUE`/`FALSE`(대소문자 무시)로 같음, List 는 불일치. 순위 열이 하나도 없으면 seq 가 가장 작은 행 | 순위 순(승자 먼저, 동률은 seq 순) |
| COLLECT | 모든 적중 | I23 집계. 숫자가 아닌 값에 SUM 이면 `RESULT_EVAL`·`EVALUATION_ERROR`, MIN·MAX 는 숫자끼리 또는 문자열끼리만(섞이거나 불린이면 `EVALUATION_ERROR`) | seq 순 |
| ANY | 모든 적중 | 결과 변수마다 모든 적중 행 값 동일(I24) | seq 순 |
| DERIVE(`hitPolicy == null`) | 첫 NORMAL 행 하나(조건 없음) | 순차 평가 값 | 행 하나 |

`hitPolicy == null` 인데 `ruleKind == DECISION` 이면 FIRST 로 본다(스냅샷 오류 대비, 한 줄 기본값). 무적중 + 기본 행이면 기본 행 하나를 "결과를 낼 행"으로 삼아 같은 정책 함수를 태운다(COLLECT 는 그 한 값으로 집계).

### 6.4 결과 열 그룹

- 그룹 = `resGrp` 가 비어 있지 않은 결과 열을 `resGrp` 값으로 묶은 것. 그룹의 자리는 첫 열(seq 최소)의 자리다.
- 고르기(행 고르기 단계 끝, 결과를 낼 행이 있을 때 한 번): 열 seq 순으로 `grpCond` 가 null·빈 문자열이면 그 열을 고른다(기본 열). 아니면 평가: 예외 → `ROW_SELECT`·`EVALUATION_ERROR`, NULL → 거짓 + `GRP_COND_NULL` 경고(rowId null, varId = 그 열), 불린 아님 → `EVALUATION_ERROR`, 참 → 고른다. 끝까지 없으면 null.
- 결과: 결과를 낼 행에서 고른 열의 셀만 평가한다. 고른 열이 null 이거나 그 행에 셀이 없으면 값 null. 선언 타입은 고른 열의 `dataType`(고른 열이 없으면 변환 없음).
- 정책 제한(FIRST·UNIQUE 전용, 06:81)은 저장 시 검사 몫이다. 엔진은 정책과 무관하게 같은 규칙으로 고른다.

### 6.5 식 변수

- 대상: `varKind == COND`, `dispType` ∈ {EQUAL, ONE, TWO}, `varName == null`, `exprText != null`. seq 순으로 계산.
- `refVars`(null 이면 빈 목록)의 이름 중 하나라도 ctx 값이 null(키 없음 포함)이면 평가하지 않고 `_V<id>` = null.
- 아니면 `exprText` 를 값 맵(ctx + EVAL_TS)으로 평가 → `fromEvalEx` → `dataType` 변환. 예외 `EVALUATION_ERROR`, 변환 실패 `TYPE_CONVERSION`. 둘 다 Stage `ROW_SELECT`, name `"_V" + varId`.

### 6.6 산출 룰(DERIVE)

- `ruleKind == DERIVE`. 조건 검사는 계약 `always`(보통 빈 목록)로 똑같이 한다. 행 고르기는 첫 NORMAL 행을 적중으로 삼는다(trace 한 줄 `evaluated=true, hit=true`).
- 결과 검사는 그 행의 `RowContract`. 결과 평가는 결과 열 seq 순이고, 각 값을 변환한 즉시 값 맵과 결과 맵에 넣는다.
- NORMAL 행이 없으면 hits·trace 는 비고 결과는 모두 null.

### 6.7 타입 변환 (`ValueConverter`)

`toDeclared(Object value, DataType type)` — 실패하면 `IllegalArgumentException`(부르는 쪽이 `TYPE_CONVERSION` 으로 바꾼다).

| 선언 타입 | null | BigDecimal | Integer·Long·Short·Byte | BigInteger | Double·Float | String | Boolean | List | 그 밖 |
|---|---|---|---|---|---|---|---|---|---|
| NUMBER | null | 그대로 | `BigDecimal.valueOf(long)` | `new BigDecimal(bi)` | 유한이면 `new BigDecimal(v.toString())`, NaN·무한 실패 | `new BigDecimal(s)`(공백·빈 문자열 실패) | 실패 | 그대로 | 실패 |
| STRING·DATE | null | `toPlainString()` | NUMBER 로 바꾼 뒤 `toPlainString()` | 같음 | 같음 | 그대로 | 실패 | 그대로 | 실패 |
| BOOLEAN | null | 실패 | 실패 | 실패 | 실패 | `TRUE`/`FALSE` 대소문자 무시 → Boolean, 그 밖 실패 | 그대로 | 그대로 | 실패 |
| `type == null` | 변환 없이 그대로 |

- `List` 는 COLLECT LIST 결과가 뒤 룰로 흘러가는 모양이라 변환하지 않는다.
- `fromEvalEx(EvaluationValue v)`: NULL → null, NUMBER → `getNumberValue()`, STRING → String, BOOLEAN → Boolean, ARRAY → 원소마다 같은 변환을 한 불변 목록(원소 null 허용 `Collections.unmodifiableList`), DATE_TIME → `Instant`(선언 타입 변환에서 NUMBER·STRING·BOOLEAN 이면 실패), 그 밖(DURATION·STRUCTURE·BINARY·EXPRESSION_NODE) → `EVALUATION_ERROR`.
- 도메인 소수 자리수(`scale`) 검사는 하지 않는다(원천에 룰 입력의 자리수 검사 규칙이 없다, 한 줄 기본값).

### 6.8 예약 키와 대소문자 (`RecordKeys`)

- `check(Collection<String> keys, Stage stage, String ruleId)` → 위반 목록.
  - `ReservedNames.CONSTANTS` 에 `key.toUpperCase(Locale.ROOT)` 가 있으면 `CONSTANT_KEY`.
  - `key.equalsIgnoreCase(ReservedNames.EVAL_TS)` 면 `EVAL_TS_KEY`.
  - `key.startsWith(ReservedNames.RESERVED_PREFIX)` 면 `RESERVED_KEY`.
  - `toUpperCase(Locale.ROOT)` 가 같은 키가 둘 이상이면 그 묶음마다 `RESERVED_KEY` 하나(name = 정렬해 `,` 로 이은 키들, D13).
- `putReplacing(Map ctx, String name, Object value)`: ctx 에서 `equalsIgnoreCase(name)` 인 다른 키를 지운 뒤 `put`. 세트에서 앞 룰 결과를 ctx 에 넣을 때 쓴다(E3 충돌 방지).
- 입력 계약의 키 확인(`MISSING_KEY`)은 대소문자를 구분하는 **정확 일치**다(`RuleEngine` Javadoc "표준 물리명 그대로").

### 6.9 오류·경고 매핑 (`EngineEvaluationException.Violation` / `EngineWarning`)

| 상황 | Stage | Code | ruleId | rowId | name |
|---|---|---|---|---|---|
| `evaluate`·`view` 의 룰 없음 | INPUT_CHECK | RULE_NOT_FOUND | 요청 ID | null | null |
| 세트 없음 | SET_CHECK | SET_NOT_FOUND | null | null | null |
| 세트 폐기 | SET_CHECK | SET_DEPRECATED | null | null | null |
| 세트 안 룰 없음(`evaluateSet`·`setView`) | SET_CHECK | RULE_NOT_FOUND | 그 룰 ID | null | null |
| 세트 입력 키 없음 | SET_CHECK | MISSING_KEY | 그 키를 요구한 룰 | null | 키 |
| 세트 예약 키 | SET_CHECK | CONSTANT_KEY / EVAL_TS_KEY / RESERVED_KEY | null | null | 키 |
| 단일 룰 예약 키 | INPUT_CHECK | 같음 | 룰 ID | null | 키 |
| 조건 변수 키 없음 | INPUT_CHECK | MISSING_KEY | 룰 ID | null | 키 |
| 조건 변수 변환 실패 | INPUT_CHECK | TYPE_CONVERSION | 룰 ID | null | 키 |
| 식 변수 예외 / 변환 실패 | ROW_SELECT | EVALUATION_ERROR / TYPE_CONVERSION | 룰 ID | null | `_V<id>` |
| 조건 셀 예외·불린 아님 | ROW_SELECT | EVALUATION_ERROR | 룰 ID | 행 | null |
| UNIQUE 복수 적중 | ROW_SELECT | UNIQUE_MULTIPLE_HITS | 룰 ID | null | null |
| 열 조건 예외·불린 아님 | ROW_SELECT | EVALUATION_ERROR | 룰 ID | null | null |
| 결과 행 키 없음 | RESULT_CHECK | MISSING_KEY | 룰 ID | 행 | 키 |
| 결과 행 필수 NULL | RESULT_CHECK | REQUIRED_NULL | 룰 ID | 행 | 키 |
| 결과 행 변수 변환 실패 | RESULT_CHECK | TYPE_CONVERSION | 룰 ID | 행 | 키 |
| 결과 셀 예외 | RESULT_EVAL | EVALUATION_ERROR | 룰 ID | 행 | null |
| 결과 값 선언 타입 변환 실패 / COLLECT 집계 타입 오류 | RESULT_EVAL | TYPE_CONVERSION / EVALUATION_ERROR | 룰 ID | 행(집계면 null) | 결과 이름 |
| ANY 불일치 | RESULT_EVAL | ANY_CONFLICT | 룰 ID | null | 결과 이름 |

- `EVALUATION_ERROR` 의 name 은 원천 계약상 "함수 이름"이지만 EvalEx 예외에서 함수 이름을 안정적으로 뽑을 수 없어 null 로 두고, 메시지에 var_id·식 텍스트·원인을 적는다(한 줄 기본값).
- 경고: `EXPR_CELL_NULL(ruleId, rowId, varId)`, `GRP_COND_NULL(ruleId, null, varId)`. 평가 순서대로 쌓는다.
- `ExpressionRunner` 가 잡는 예외: `ParseException`, `EvaluationException`, `RuntimeException`(NPE·UOE·IAE·ArithmeticException 포함). `Error` 는 잡지 않는다. **(재작업) 평가기 경유 뒤의 변환은 §6.17. 타임아웃(`EVALUATION_ERROR`)이 새로 생긴다.**

### 6.10 생성기 명세 (`CellTextGenerator`)

#### 6.10.1 조건 셀

`V` = 주어(`subject`), `L`·`R` = 리터럴(아래 6.10.2), `T` = 데이터 타입.

| op | 피연산자 | 텍스트 |
|---|---|---|
| `NA` | 없음 | `""` |
| (op 없음, `expr` 있음) | Expression 셀 | `expr` 그대로 |
| `EQ` | `left` | T 가 STRING 이면 §6.11 패턴 규칙. 그 밖은 `V != NULL && V == L` |
| `NE` | `left` | `V != NULL && V != L` |
| `LT`·`LE`·`GT`·`GE` | `left` | `V != NULL && V < L` / `<=` / `>` / `>=` |
| `IN` | `list`(비지 않음) | `V != NULL && (V == L1 \|\| V == L2 \|\| …)` |
| `NOT_IN` | `list`(비지 않음) | `V != NULL && V != L1 && V != L2 && …` |
| `CODE_IN` | `left`(카테고리), `maruCodeId` | `V != NULL && MASTER("<maruCodeId>", "<left>", V)` |
| `CONTAINS` | `left`(비지 않음) | `V != NULL && INSTR(V, "<left>") > 0` |
| `INSTR` | `left`(비지 않음) | `V != NULL && INSTR("<left>", V) > 0` |
| `IS_NULL` | 없음 | `V == NULL` |
| `NOT_NULL` | 없음 | `V != NULL` |
| `<= 변수 <=` | `left`, `right` | `V != NULL && V >= L && V <= R` |
| `<= 변수 <` | 같음 | `V != NULL && V >= L && V < R` |
| `< 변수 <=` | 같음 | `V != NULL && V > L && V <= R` |
| `< 변수 <` | 같음 | `V != NULL && V > L && V < R` |

- CODE_IN·CONTAINS·INSTR 의 값과 CODE_IN 의 마루 코드·카테고리는 T 와 무관하게 **문자열 리터럴**이다. NE·IN·NOT_IN 의 STRING 값은 글자 그대로(패턴·이스케이프 해석 없음)다.
- 결과 셀: `val` 이 있으면 `L(val)`(T 로 리터럴화, 음수는 괄호), `expr` 이 있으면 그대로. 둘 다 없으면 IAE.
- 생성기가 보지 않는 것(저장 시 검사 몫): 표시 타입과 op 의 허용 조합, 구간 하한 < 상한, 목록 중복·정렬·원소 수 상한, 값 길이 상한, 도메인 범위, 코드 참조.

#### 6.10.2 리터럴

| T | 받는 값 | 텍스트 |
|---|---|---|
| NUMBER | `^[+-]?\d+(\.\d+)?$` 만. 그 밖(지수·16진·`.5`·`5.`·공백)은 IAE | `new BigDecimal(s).stripTrailingZeros()`, signum 0 이면 `0`, 아니면 `toPlainString()`. 음수면 `(` + 그 문자열 + `)` |
| STRING·DATE | 제어문자(U+0000-U+001F, U+007F) 없는 문자열, null 은 IAE | `"` + (`\`→`\\`, `"`→`\"`) + `"` |
| BOOLEAN | `TRUE`/`FALSE`(대소문자 무시) | `TRUE` / `FALSE` |

#### 6.10.3 거부 사례(모두 `IllegalArgumentException`)

제어문자가 든 문자열 값, EQ STRING 값의 홀로 선 `\`(`A\B`, 끝의 `A\`), `%`·`%%` 단독 패턴, 접은 뒤 `%` 4개 이상(`%A%B%C%`), 빈 CONTAINS·INSTR 값, 숫자 `1e3`·`0x1F`·`.5`·`5.`·`1 0`, NUMBER EQ 값 `1%`, BOOLEAN `Y`, IN·NOT_IN 목록 null·빈 목록, 구간 op 에 `right` 없음, `maruCodeId` 없는 CODE_IN, 모르는 op(`LIKE`, `BETWEEN`), 주어 null(Expression 셀 제외)·식별자 아님(`1ABC`), 결과 셀에 `val`·`expr` 둘 다 없음, `subject()` 에 varName·exprText 가 모두 null 인 변수.

#### 6.10.4 스냅샷 필수 항목(정본)

주어: `SURF_GRD`(STRING), `COIL_THK`(NUMBER), `IS_WIDE`(BOOLEAN), `_V7`(STRING 식 변수), `_V8`(NUMBER 식 변수), `PROC_CD`(STRING, 마루 코드 `PROC_CD`), `SPEC_NM`·`STL_GRD`·`DLV_DT`(STRING). 아래 "값"은 저장 문자열 그대로(Java·JSON 이스케이프 전), "텍스트"는 생성 결과 그대로다.

| id | kind·T·주어 | 셀 | 텍스트 |
|---|---|---|---|
| na | cond·STRING·SURF_GRD | `{op:NA}` | (빈 문자열) |
| eq.string | cond·STRING·SURF_GRD | EQ `A` | `SURF_GRD != NULL && SURF_GRD == "A"` |
| eq.number | cond·NUMBER·COIL_THK | EQ `1.60` | `COIL_THK != NULL && COIL_THK == 1.6` |
| eq.number.same | cond·NUMBER·COIL_THK | EQ `1.6` | `COIL_THK != NULL && COIL_THK == 1.6` |
| eq.number.negative | cond·NUMBER·COIL_THK | EQ `-1.50` | `COIL_THK != NULL && COIL_THK == (-1.5)` |
| eq.number.zero | cond·NUMBER·COIL_THK | EQ `-0.00` | `COIL_THK != NULL && COIL_THK == 0` |
| eq.number.plus | cond·NUMBER·COIL_THK | EQ `+007.10` | `COIL_THK != NULL && COIL_THK == 7.1` |
| eq.number.integer | cond·NUMBER·COIL_THK | EQ `1000` | `COIL_THK != NULL && COIL_THK == 1000` |
| eq.boolean | cond·BOOLEAN·IS_WIDE | EQ `true` | `IS_WIDE != NULL && IS_WIDE == TRUE` |
| eq.exprvar | cond·STRING·_V7 | EQ `A` | `_V7 != NULL && _V7 == "A"` |
| eq.escape | cond·STRING·SURF_GRD | EQ `a"b\\c` | `SURF_GRD != NULL && SURF_GRD == "a\"b\\c"` |
| eq.korean | cond·STRING·SURF_GRD | EQ `가나*` | `SURF_GRD != NULL && SURF_GRD == "가나*"` |
| eq.pattern.prefix | cond·STRING·SURF_GRD | EQ `SGC%` | `SURF_GRD != NULL && STR_STARTS_WITH(SURF_GRD, "SGC")` |
| eq.pattern.prefix-dot | cond·STRING·SURF_GRD | EQ `A.B%` | `SURF_GRD != NULL && STR_STARTS_WITH(SURF_GRD, "A.B")` |
| eq.pattern.suffix | cond·STRING·SURF_GRD | EQ `%CC` | `SURF_GRD != NULL && STR_ENDS_WITH(SURF_GRD, "CC")` |
| eq.pattern.contains | cond·STRING·SURF_GRD | EQ `%G3302%` | `SURF_GRD != NULL && INSTR(SURF_GRD, "G3302") > 0` |
| eq.pattern.collapse-prefix | cond·STRING·SURF_GRD | EQ `SGC%%` | `SURF_GRD != NULL && STR_STARTS_WITH(SURF_GRD, "SGC")` |
| eq.pattern.middle | cond·STRING·SURF_GRD | EQ `A%B` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A.*B")` |
| eq.pattern.collapse | cond·STRING·SURF_GRD | EQ `A%%%B` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A.*B")` |
| eq.pattern.three | cond·STRING·SURF_GRD | EQ `%A%B%` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, ".*A.*B.*")` |
| eq.pattern.underscore-only | cond·STRING·SURF_GRD | EQ `_` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, ".")` |
| eq.pattern.underscore | cond·STRING·SURF_GRD | EQ `A_C` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A.C")` |
| eq.pattern.underscore-prefix | cond·STRING·SURF_GRD | EQ `A_%` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A..*")` |
| eq.pattern.regex-dot | cond·STRING·SURF_GRD | EQ `A.B_` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A\\.B.")` |
| eq.pattern.regex-meta-all | cond·STRING·SURF_GRD | EQ (아래 코드 블록) | (아래 코드 블록) |
| eq.pattern.escaped-percent | cond·STRING·SURF_GRD | EQ `A\%` | `SURF_GRD != NULL && SURF_GRD == "A%"` |
| eq.pattern.escaped-underscore | cond·STRING·SURF_GRD | EQ `A\_B%` | `SURF_GRD != NULL && STR_STARTS_WITH(SURF_GRD, "A_B")` |
| eq.pattern.escaped-backslash | cond·STRING·SURF_GRD | EQ `A\\B%` | `SURF_GRD != NULL && STR_STARTS_WITH(SURF_GRD, "A\\B")` |
| eq.pattern.regex-backslash | cond·STRING·SURF_GRD | EQ `A\\_` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A\\\\.")` |
| eq.pattern.regex-quote | cond·STRING·SURF_GRD | EQ `A"B_` | `SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "A\"B.")` |
| ne.string | cond·STRING·SURF_GRD | NE `C` | `SURF_GRD != NULL && SURF_GRD != "C"` |
| ne.string.literal-percent | cond·STRING·SURF_GRD | NE `A%` | `SURF_GRD != NULL && SURF_GRD != "A%"` |
| lt.number | cond·NUMBER·COIL_THK | LT `2.5` | `COIL_THK != NULL && COIL_THK < 2.5` |
| le.number | cond·NUMBER·COIL_THK | LE `2.50` | `COIL_THK != NULL && COIL_THK <= 2.5` |
| gt.number | cond·NUMBER·COIL_THK | GT `1000` | `COIL_THK != NULL && COIL_THK > 1000` |
| ge.number | cond·NUMBER·COIL_THK | GE `2.5` | `COIL_THK != NULL && COIL_THK >= 2.5` |
| ge.date-string | cond·STRING·DLV_DT | GE `20260907` | `DLV_DT != NULL && DLV_DT >= "20260907"` |
| in.string.one | cond·STRING·SURF_GRD | IN `[A]` | `SURF_GRD != NULL && (SURF_GRD == "A")` |
| in.string.order | cond·STRING·SURF_GRD | IN `[C, A, E, B, D]` | `SURF_GRD != NULL && (SURF_GRD == "C" \|\| SURF_GRD == "A" \|\| SURF_GRD == "E" \|\| SURF_GRD == "B" \|\| SURF_GRD == "D")` |
| in.number | cond·NUMBER·COIL_THK | IN `[1.0, 2]` | `COIL_THK != NULL && (COIL_THK == 1 \|\| COIL_THK == 2)` |
| not_in.one | cond·STRING·SURF_GRD | NOT_IN `[C]` | `SURF_GRD != NULL && SURF_GRD != "C"` |
| not_in.many | cond·STRING·SURF_GRD | NOT_IN `[C, D]` | `SURF_GRD != NULL && SURF_GRD != "C" && SURF_GRD != "D"` |
| code_in | cond·STRING·PROC_CD(maru `PROC_CD`) | CODE_IN `PLATING` | `PROC_CD != NULL && MASTER("PROC_CD", "PLATING", PROC_CD)` |
| contains | cond·STRING·SPEC_NM | CONTAINS `SGCC` | `SPEC_NM != NULL && INSTR(SPEC_NM, "SGCC") > 0` |
| contains.meta | cond·STRING·SPEC_NM | CONTAINS `G3302%.*\` | `SPEC_NM != NULL && INSTR(SPEC_NM, "G3302%.*\\") > 0` |
| instr | cond·STRING·STL_GRD | INSTR `SGCC,SGHC,SGCH` | `STL_GRD != NULL && INSTR("SGCC,SGHC,SGCH", STL_GRD) > 0` |
| is_null | cond·STRING·SURF_GRD | IS_NULL | `SURF_GRD == NULL` |
| not_null | cond·STRING·SURF_GRD | NOT_NULL | `SURF_GRD != NULL` |
| range.le-le | cond·NUMBER·COIL_THK | `<= 변수 <=` `1.6`·`2.5` | `COIL_THK != NULL && COIL_THK >= 1.6 && COIL_THK <= 2.5` |
| range.le-lt | cond·NUMBER·COIL_THK | `<= 변수 <` `1.6`·`2.5` | `COIL_THK != NULL && COIL_THK >= 1.6 && COIL_THK < 2.5` |
| range.lt-le | cond·NUMBER·COIL_THK | `< 변수 <=` `0`·`0.5` | `COIL_THK != NULL && COIL_THK > 0 && COIL_THK <= 0.5` |
| range.lt-lt | cond·NUMBER·COIL_THK | `< 변수 <` `0.5`·`0.6` | `COIL_THK != NULL && COIL_THK > 0.5 && COIL_THK < 0.6` |
| range.negative | cond·NUMBER·COIL_THK | `<= 변수 <` `-1.5`·`0` | `COIL_THK != NULL && COIL_THK >= (-1.5) && COIL_THK < 0` |
| range.exprvar | cond·NUMBER·_V8 | `<= 변수 <` `1`·`2` | `_V8 != NULL && _V8 >= 1 && _V8 < 2` |
| range.date-string | cond·STRING·DLV_DT | `<= 변수 <` `20260101`·`20270101` | `DLV_DT != NULL && DLV_DT >= "20260101" && DLV_DT < "20270101"` |
| expression | cond·BOOLEAN·(없음) | `{expr: COIL_THK * COIL_WID > 3000}` | `COIL_THK * COIL_WID > 3000` |
| result.value.string | result·STRING | `{val: A}` | `"A"` |
| result.value.number | result·NUMBER | `{val: 1.050}` | `1.05` |
| result.value.negative | result·NUMBER | `{val: -0.5}` | `(-0.5)` |
| result.value.boolean | result·BOOLEAN | `{val: FALSE}` | `FALSE` |
| result.value.date | result·DATE | `{val: 20260907}` | `"20260907"` |
| result.expression | result·NUMBER | `{expr: ROUND(BASE_FCT * 0.98, 2)}` | `ROUND(BASE_FCT * 0.98, 2)` |
| qlty.cell-1-1 | cond·NUMBER·COIL_THK | `<= 변수 <` `1.6`·`2.5` | `COIL_THK != NULL && COIL_THK >= 1.6 && COIL_THK < 2.5`(06:1327) |
| qlty.cell-3-1 | cond·NUMBER·COIL_THK | GE `2.5` | `COIL_THK != NULL && COIL_THK >= 2.5`(06:1328) |
| qlty.cell-3-3 | cond·STRING·SURF_GRD | NOT_IN `[C]` | `SURF_GRD != NULL && SURF_GRD != "C"`(06:1329) |

`eq.pattern.regex-meta-all` 은 파이프 문자가 표를 깨므로 여기 원문으로 적는다(정규식 = `\(a\)\[b\]\{c\}\^\$\|\?\*\+\..`, 그 뒤 문자열 리터럴 규칙으로 백슬래시가 두 배가 된다).

```
값:     (a)[b]{c}^$|?*+._
텍스트: SURF_GRD != NULL && STR_MATCHES(SURF_GRD, "\\(a\\)\\[b\\]\\{c\\}\\^\\$\\|\\?\\*\\+\\..")
```

`expression` 항목의 T·주어는 쓰이지 않는다(스냅샷 JSON 에서 `subject` 를 null 로 둔다). 표 안의 `\|` 는 마크다운 표 이스케이프이고 실제 문자는 `|` 다(`in.string.order` 의 `||`, §6.10.1 IN 행).

### 6.11 `=` 패턴 규칙 (STRING 변수의 EQ 값)

1. **토큰화**: 값을 앞에서부터 읽는다. `\` 다음 글자가 `%`·`_`·`\` 면 그 글자를 **글자 토큰**으로 하고 둘을 소비한다. `\` 다음이 다른 글자이거나 `\` 가 끝이면 IAE. `%` 는 ANY, `_` 는 ONE, 그 밖은 글자 토큰.
2. **접기**: 연속한 ANY 를 하나로 접는다.
3. **검사**: 토큰이 ANY 하나뿐이면 IAE. ANY 개수가 3 을 넘으면 IAE.
4. **모양**(와일드카드 = ANY·ONE):
   - 와일드카드 없음 → 정확 일치 `V != NULL && V == "<글자들>"`.
   - `[글자+, ANY]`(글자에 ONE 없음) → `V != NULL && STR_STARTS_WITH(V, "<글자들>")`.
   - `[ANY, 글자+]` → `V != NULL && STR_ENDS_WITH(V, "<글자들>")`.
   - `[ANY, 글자+, ANY]` → `V != NULL && INSTR(V, "<글자들>") > 0`.
   - 그 밖 → 정규식: 글자 토큰은 `REGEX_META` 에 들면 앞에 `\` 를 붙이고, ANY → `.*`, ONE → `.`. 앵커는 붙이지 않는다(EvalEx `STR_MATCHES` 는 전체 일치, 화면은 `^(?:…)$` 로 감싼다, 06:158). 텍스트 = `V != NULL && STR_MATCHES(V, "<정규식에 문자열 리터럴 규칙 적용>")`.
5. `patternRegex(value)` 는 1-3 을 같이 돌리고 4 에서 정규식형일 때만 정규식 문자열(문자열 리터럴 규칙 적용 전)을 돌려준다.
6. 패턴 길이 상한은 생성기가 보지 않는다. 원천이 운영 설정 미결로 남긴 저장 시 검사다(06:335·386).

### 6.12 셀 요약 규칙 (`CellSummary.of`)

| 셀 | 요약 | 예 |
|---|---|---|
| op `NA` | `-` | `-` |
| Equal 열(`dispType == EQUAL`)의 EQ | 값 그대로 | `COIL`, `SGC%` |
| EQ·NE·LT·LE·GT·GE | `= L`·`<> L`·`< L`·`<= L`·`> L`·`>= L` | `> 1000`, `>= 2.5`, `= SGC%` |
| IN·NOT_IN | `IN (a, b)`·`NOT IN (a, b)`(원소 구분 `, `) | `IN (A)`, `NOT IN (C)` |
| CODE_IN | `IN 카테고리 L` | `IN 카테고리 PLATING` |
| CONTAINS·INSTR | `CONTAINS L`·`INSTR L` | `CONTAINS CC` |
| IS_NULL·NOT_NULL | `IS NULL`·`IS NOT NULL` | |
| 구간 op | `L <op> R` | `1.6 <= 변수 < 2.5` |
| Expression 셀(op 없음, expr) | expr 그대로 | `COIL_THK * COIL_WID > 3000` |
| 결과 Value 셀 | val 그대로(따옴표 없음, 06:314) | `A`, `1.05` |
| 결과 Expression 셀 | expr 그대로 | `ROUND(BASE_FCT * 0.98, 2)` |
| 모르는 op | op 문자열 | |

값은 저장 문자열 그대로 쓴다(정규화·따옴표·이스케이프 해석 없음). null 값 칸은 빈 문자열로 본다.

### 6.13 룰 세트 (`MdmRuleEngine.evaluateSet`)

1. `requireNonNull`, `ts = evalTs.truncatedTo(SECONDS)`.
2. `ruleSet(setId)` 없음 → 즉시 `SET_NOT_FOUND`. `status == DEPRECATED` → 즉시 `SET_DEPRECATED`(룰 조회 없음). `CREATED`·`INUSE` 는 실행한다(원천 세트 상태는 INUSE·DEPRECATED 둘, 06:1089).
3. `SET_CHECK` 위반을 모은다: 레코드 키 예약 검사(§6.8), 룰마다 `rule(id, ts)` 없음 → `RULE_NOT_FOUND`, 입력 키 일괄 확인(아래). 하나라도 있으면 던진다.
4. 입력 키 일괄 확인: `produced` = 빈 집합. 룰 순서대로 `needed` = `contract.always` 이름 + (DERIVE 면 모든 `RowContract` 의 required·optional 이름). `needed` 가운데 `produced` 에 없고 레코드에 정확한 키가 없고 아직 보고하지 않은 이름마다 `MISSING_KEY`(ruleId = 그 룰). 그다음 이 룰의 결과 이름(그룹이면 `res_grp`, 아니면 `var_name`)을 `produced` 에 더한다. 조회에 실패한 룰은 건너뛴다.
5. 실행: `ctx = new LinkedHashMap<>(record)`. 룰마다 `RuleEvaluator` 를 돌리고, 결과 맵의 항목을 `RecordKeys.putReplacing` 으로 ctx 에 넣고 `finalValues` 에도 넣는다(`LinkedHashMap`, 같은 이름은 값만 바뀐다). 룰의 예외는 그대로 올린다(앞 룰 결과는 버린다, 06:221).
6. `RuleSetResult(setId, ts, List.copyOf(steps), Collections.unmodifiableMap(finalValues))`.
7. 빈 `ruleIds` 는 빈 단계·빈 결과를 돌려준다(저장 시 검사가 막는 모양, 한 줄 기본값).

### 6.14 정의 조회 (`view`·`setView`)

- `view(ruleId, evalTs, parts)`: `requireNonNull` 셋, `ts` 절삭, `rule(ruleId, ts)` 없으면 `RULE_NOT_FOUND`(INPUT_CHECK). 식을 컴파일하지도 평가하지도 않는다.
- `columns`: 조건 열(seq 순) 다음 결과 열(seq 순). `ColumnView(varId, varKind, dispType, varName, dataType, scale, domainId, seq, exprText = TEXT ? var.exprText : null, exprAst = AST ? var.exprAst : null)`. `resGrp`·`grpCond` 는 담을 칸이 없어 싣지 않는다(D9).
- `rows`: NORMAL(seq 순) 다음 DEFAULT. `RowView(rowId, seq, rowKind, cells)`, `cells` 는 `LinkedHashMap` 으로 열 순서(조건 열 → 결과 열), 변수 정의에 없는 var_id 는 뒤에 var_id 오름차순. `CellView(summary = TEXT ? CellSummary.of(var, cell) : null, text = TEXT ? cell.text : null, ast = AST ? cell.ast : null)`.
- `contract` = CONTRACT ? `def.contract` : null. AST·contract 는 같은 인스턴스를 그대로 넘긴다.
- `setView`: 세트 없음 `SET_NOT_FOUND`. **폐기 세트도 조회는 허용한다**(판정이 아니라 이력 조회라서, 한 줄 기본값). 룰마다 `view`, 없는 룰은 모아 `SET_CHECK`·`RULE_NOT_FOUND` 로 한 번에 던진다. 결과는 세트 순서.

### 6.15 샘플 fixture 정의 (`SampleRules`)

공통: `engineVersion = "0.1.0-SNAPSHOT"`, `applyTo = 9999-12-31T00:00`. 도메인 → 마루 코드 해석 함수는 `PROC_CD_DOM → PROC_CD` 하나만 안다(나머지는 CODE_IN 이 없어 부르지 않는다). 계약의 `RowContract.cond` 는 사람이 읽는 문자열이라 값만 싣고 검증하지 않는다.

#### 6.15.1 QLTY_GRD_JDG v1 (06:1295-1329, H:440-449) — FIRST, applyFrom 2026-09-01T00:00

| var | kind | disp | var_name | dataType | domain | seq |
|---|---|---|---|---|---|---|
| 1 | COND | TWO | COIL_THK | NUMBER | - | 1 |
| 2 | COND | ONE | COIL_WID | NUMBER | - | 2 |
| 3 | COND | ONE | SURF_GRD | STRING | - | 3 |
| 4 | RESULT | VALUE | QLTY_GRD | STRING | QLTY_GRD_CD | 1 |
| 5 | RESULT | EXPRESSION | PRC_FCT | NUMBER | FCT | 2 |

행: 1(seq 1) `{1:<= 변수 < 1.6·2.5, 2:GT 1000, 3:IN [A], 4:val A, 5:expr 1.05}`, 2(seq 2) `{… 3:IN [B], 4:val B, 5:expr 1.00}`, 3(seq 3) `{1:GE 2.5, 2:NA, 3:NOT_IN [C], 4:val B, 5:expr ROUND(BASE_FCT * 0.98, 2)}`, 4(seq 0, DEFAULT) `{4:val C, 5:expr 0.90}`. 계약: always `COIL_THK:NUMBER, COIL_WID:NUMBER, SURF_GRD:STRING`, rows 1·2·4 빈 목록, row 3 required `BASE_FCT:NUMBER`.

| 케이스 | 입력 | 결과 | hits | 기본 행 | trace(rowId: evaluated/hit/firstFalse) |
|---|---|---|---|---|---|
| Q1 원천 06:1322 | THK 1.8, WID 1200, SURF A, BASE_FCT 1.0 | QLTY_GRD A, PRC_FCT 1.05 | [1] | false | 1:T/T/-, 2:F/F/-, 3:F/F/- |
| Q2 | 1.8, 1200, B, 1.0 | B, 1 | [2] | false | 1:T/F/3, 2:T/T/-, 3:F/F/- |
| Q3 | 2.5, 900, A, 1.0 | B, 0.98 | [3] | false | 1:T/F/1, 2:T/F/1, 3:T/T/- |
| Q4 | 2.0, 900, A, 1.0 | C, 0.9 | [] | true | 1:T/F/2, 2:T/F/2, 3:T/F/1 |
| Q5 NULL | 3.0, 900, SURF null, BASE_FCT 키 없음 | C, 0.9 | [] | true | 1:T/F/1, 2:T/F/1, 3:T/F/3 |
| Q6 결과 검사 | 2.5, 900, A, BASE_FCT 키 없음 | `RESULT_CHECK`·`MISSING_KEY` name BASE_FCT rowId 3 | | | |
| Q7 변환 | THK `"1.8"`(String), WID 1200(Integer), SURF A, BASE_FCT `"1.0"` | A, 1.05 | [1] | false | |

#### 6.15.2 COIL_WGT_CALC v1 (H:456-461·520-521) — DERIVE, applyFrom 2026-09-15T00:00

var 1 RESULT EXPRESSION `COIL_WGT` NUMBER domain WGT_KG seq 1. 행 1(seq 1) `{1: expr ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)}`. 계약: always 빈 목록, row 1 required `COIL_THK, COIL_WID, COIL_LEN, SPEC_GRAV`(NUMBER). 케이스(H:521): 1.8·1200·1500·7.85 → `COIL_WGT` 25434(원천 표기 `25434.0`, compareTo), hits `[Hit(1, 1, {})]`, trace `[1:T/T/-]`.

#### 6.15.3 PROD_WGT_CALC v1 (H:465-474·522-527, 06:207·226-229) — UNIQUE, applyFrom 2026-09-20T00:00

| var | kind | disp | var_name | dataType | domain | seq |
|---|---|---|---|---|---|---|
| 1 | COND | EQUAL | PROD_TYPE | STRING | - | 1 |
| 3 | COND | EQUAL | CALC_BASIS | STRING | - | 2 |
| 2 | RESULT | EXPRESSION | PROD_WGT | NUMBER | WGT_KG | 1 |

행(var_id 와 열 seq 가 어긋난다: CALC_BASIS 는 var 3 이지만 seq 2): 1(seq 1) `{1:EQ COIL, 3:EQ LEN, 2:expr ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)}`, 3(seq 2) `{1:EQ COIL, 3:EQ DIA, 2:expr ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)}`, 2(seq 3) `{1:EQ SHEET, 3:NA, 2:expr ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)}`. 계약(06:226-229): always `PROD_TYPE, CALC_BASIS`(STRING), row 1 required `COIL_THK, COIL_WID, COIL_LEN, SPEC_GRAV`, row 3 required `COIL_WID, COIL_OUT_DIA, COIL_IN_DIA, COIL_VOID_RT, SPEC_GRAV`, row 2 required `COIL_THK, COIL_WID, SHEET_LEN, SHEET_CNT, SPEC_GRAV`(모두 NUMBER).

| 케이스 | 입력 | 결과 | hits |
|---|---|---|---|
| P1 원천 | COIL, LEN, 1.8, 1200, 1500, 7.85 (시트 키 없음) | 25434 | [1] |
| P2 원천 | COIL, DIA, WID 1200, OUT 1800, IN 610, VOID 1.5, 7.85 | 20899.7 | [3] |
| P3 원천 | SHEET, CALC_BASIS null, 0.8, 1219, 2438, 120, 7.85 | 2239.6 | [2] |
| P4 결과 검사 | SHEET, null, 0.8, 1219, 2438, SHEET_CNT 키 없음, SPEC_GRAV null | `RESULT_CHECK` 위반 둘: `MISSING_KEY` SHEET_CNT(row 2), `REQUIRED_NULL` SPEC_GRAV(row 2) | |

P2 의 trace 는 1 행 `firstFalseVarId = 3`(CALC_BASIS 셀, 열 seq 2)이다. PROD 의 조건 열(var 1 = seq 1, var 3 = seq 2)과 QLTY 의 조건 열은 var_id 순서와 seq 순서가 같다. 그래서 열 순서를 var_id 순으로 잘못 돌려도 샘플 테스트는 같은 값을 낸다. 열 seq 확인은 `HitPolicyTest` 의 전용 사례(§3.1, var 9 = seq 1, var 2 = seq 2)로 한다.

#### 6.15.4 BASE_SPD_LKP v1 (06:71-79, H:476-497·528-531) — UNIQUE, applyFrom 2026-09-01T00:00

var 1 COND TWO `COIL_THK` NUMBER seq 1. 결과 열 8개(RESULT VALUE, NUMBER, domain SPEED_MPM, `resGrp = BASE_SPD`):

| var | var_name | seq | grpCond |
|---|---|---|---|
| 2 | TEXTURE | 1 | `STR_STARTS_WITH(TOP_RESIN_CD, "2")` |
| 3 | AKZO | 2 | `STR_STARTS_WITH(TOP_RESIN_CD, "6")` |
| 4 | FLUORO | 3 | `TOP_RESIN_CD == "F"` |
| 5 | WXL1 | 4 | `STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "1"` |
| 6 | WXL2 | 5 | `STR_STARTS_WITH(TOP_RESIN_CD, "W") && COAT_SIDE == "2"` |
| 7 | BACK1 | 6 | `STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "1"` |
| 8 | BACK2 | 7 | `STR_STARTS_WITH(TOP_RESIN_CD, "B") && COAT_SIDE == "2"` |
| 9 | GENERAL | 8 | (null, 기본 열) |

행 i(1-7, seq i): 조건 셀 1 = `THK_BANDS[i]`, 결과 셀 j+2 = `val SPD_VALS[i][j]`(H:486-487).

| 행 | 조건 op·left·right | TEXTURE AKZO FLUORO WXL1 WXL2 BACK1 BACK2 GENERAL |
|---|---|---|
| 1 | `< 변수 <=` 0·0.5 | 100 100 90 110 110 110 110 120 |
| 2 | `< 변수 <` 0.5·0.6 | 100 100 90 110 110 110 110 110 |
| 3 | `<= 변수 <` 0.6·0.7 | 90 90 80 100 100 100 100 100 |
| 4 | `<= 변수 <` 0.7·0.8 | 80 80 70 90 90 90 90 90 |
| 5 | `<= 변수 <` 0.8·0.9 | 70 70 60 80 80 80 80 80 |
| 6 | `<= 변수 <` 0.9·1 | 60 60 50 70 70 70 70 70 |
| 7 | `<= 변수 <=` 1·1.2 | 50 50 50 70 70 60 60 60 |

계약: always `COIL_THK:NUMBER, TOP_RESIN_CD:STRING, COAT_SIDE:STRING`, rows 1-7 빈 목록.

| 케이스 | 입력 | BASE_SPD | hits(groupChoices) |
|---|---|---|---|
| B1 원천 H:530 | 0.65, `2A`, `1` | 90 | [Hit(3, 3, {BASE_SPD: 2})] |
| B2 원천 H:531 | 1.1, `SF`, `1` | 60 | [Hit(7, 7, {BASE_SPD: 9})] |
| B3 | 0.3, `W1`, `2` | 110 | [Hit(1, 1, {BASE_SPD: 6})] |

`results` 의 키는 `BASE_SPD` 하나뿐이고 열 코드(`TEXTURE` 등)는 없다.

#### 6.15.5 SPD_EXC v1·SPD_JOIN v1 (설계 정의, D10) — applyFrom 2026-08-01T00:00

SPD_EXC (DECISION, COLLECT, 메타 H:532 · WR:33): var 1 COND EXPRESSION(varName null, dataType null) seq 1, var 2 RESULT VALUE `EXC_SPD` NUMBER `collectAgg = LIST` seq 1. 행 1(seq 1) `{1: expr COIL_WID >= 1250, 2: val 70}`, 행 2(seq 2) `{1: expr BASE_SPD > 80 && COIL_WID >= 1200, 2: val 85}`. 기본 행 없음. 계약: always `BASE_SPD:NUMBER, COIL_WID:NUMBER`, rows 1·2 빈 목록.

SPD_JOIN (DERIVE, 메타 H:533 · WR:34): var 1 RESULT EXPRESSION `LINE_SPD` NUMBER seq 1. 행 1 `{1: expr IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))}`(E8). 계약: always 빈 목록, row 1 required `BASE_SPD:NUMBER`, optional `EXC_SPD:NUMBER`.

세트: `LS_A3` = `[BASE_SPD_LKP, SPD_EXC, SPD_JOIN]` INUSE(06:1087·1324), `WID_OLD` = `[WID_CHK]` DEPRECATED(H:540, `WID_CHK` 정의는 두지 않는다: 폐기 세트는 룰을 조회하지 않아야 하므로).

| 케이스 | 입력 | steps | finalValues |
|---|---|---|---|
| S1 | COIL_THK 0.65, TOP_RESIN_CD `2A`, COAT_SIDE `1`, COIL_WID 1250 | BASE_SPD 90(hit 3) → EXC_SPD [70, 85](hits 1, 2) → LINE_SPD 70 | `{BASE_SPD: 90, EXC_SPD: [70, 85], LINE_SPD: 70}`(입력 키 없음) |
| S2 | 0.65, `2A`, `1`, COIL_WID 1000 | 90 → EXC_SPD null(무적중, 기본 행 없음) → LINE_SPD 90 | `{BASE_SPD: 90, EXC_SPD: null, LINE_SPD: 90}` |
| S3 | COIL_THK 0.65, TOP_RESIN_CD `2A`(COAT_SIDE·COIL_WID 없음) | `SET_CHECK` 위반 둘 `MISSING_KEY` COAT_SIDE(ruleId BASE_SPD_LKP), COIL_WID(ruleId SPD_EXC). `BASE_SPD`·`EXC_SPD` 는 요구하지 않음 | |
| S4 | WID_OLD, 아무 레코드 | `SET_CHECK`·`SET_DEPRECATED` 1건, `rule()` 호출 0회 | |

### 6.16 테스트 전용 설정·함수 (`TestExpressionConfig`·`TestFunctions`)

- 설정: `ExpressionConfiguration.builder()` 에 `MdmExpressionConfig` 상수를 한 줄씩 넣는다: `mathContext(MATH_CONTEXT)`, `zoneId(ZONE)`, `locale(LOCALE)`, `regexTimeoutMillis(REGEX_TIMEOUT_MILLIS)`, `maxRecursionDepth(MAX_RECURSION_DEPTH)`, `allowOverwriteConstants(ALLOW_OVERWRITE_CONSTANTS)`, `lenientMode(LENIENT_MODE)`, `arraysAllowed(ARRAYS_ALLOWED)`, `structuresAllowed(STRUCTURES_ALLOWED)`, `implicitMultiplicationAllowed(IMPLICIT_MULTIPLICATION_ALLOWED)`, `singleQuoteStringLiteralsAllowed(SINGLE_QUOTE_STRING_LITERALS_ALLOWED)`, `binaryAllowed(BINARY_ALLOWED)`, `stripTrailingZeros(STRIP_TRAILING_ZEROS)`, `decimalPlacesRounding(DECIMAL_PLACES_ROUNDING)`, `functionDictionary(dict)`. `dict` = `FunctionSets.BASE` 이름마다 `ExpressionConfiguration.defaultConfiguration().getFunctionDictionary().getFunction(name)` + 아래 셋. `MdmExpressionConfig.baseBuilder()`·`create()` 는 부르지 않는다(UOE).
- `INSTR`: `@FunctionParameter(name="s")`, `@FunctionParameter(name="sub")`. 어느 쪽이든 NULL 이면 `NULL_VALUE`, 아니면 `s.indexOf(sub) + 1`(대소문자 구분, 없으면 0).
- `MASTER`: `id`, `cate`, `key`, `attr`(`isVarArg = true`) → 3·4 인자. 5 이상이면 `EvaluationException`. `EVAL_TS` 를 데이터 접근자에서 읽어 기록 목록에 넣는다(E14). 3 인자: key NULL 이면 FALSE, 아니면 `codeSets.get(id + "|" + cate)` 에 key 문자열이 있으면 TRUE. 4 인자: 소속이면 `attrs` 맵(없으면 NULL), 아니면 NULL.
- `MASTER_AT`: `id`, `cate`, `key`, `base_dt`, `attr`(vararg) → 4·5 인자, 6 이상이면 오류. base_dt 는 NULL 검사만 하고 소속 판정은 MASTER 와 같다.
- 카운팅 함수(`COUNT_CALL(x)` 같은 이름은 `FunctionSets` 와 겹치지 않게 테스트 안에서만): I30·I31 의 "평가하지 않음" 단언용. 이 함수를 쓰는 식은 생성 텍스트가 아니라 식 변수·열 조건 텍스트다.
- 이름을 `TestFunctions`·`TestExpressionConfig` 로 두어 TSK-03-02 가 expr 에 만들 이름(`MasterFunction`, `InstrFunction` 류)과 겹치지 않게 한다. 03-02 머지 뒤에는 D1 대로 교체한다.
- **(재작업)** fixture 설정은 엔진에 바로 넣지 않고 `XT/MdmEvaluatorFixtures.of(cfg)` 로 평가기에 태워 넣는다(D21). 전면 교체 대신 부분 이관 + 운영 설정 대조 테스트로 정했다(D22).

### 6.17 (재작업) `ExpressionRunner` — 평가기 경유와 예외 변환

```java
final class ExpressionRunner {
    ExpressionRunner(MdmEvaluator evaluator)                       // requireNonNull
    EvaluationValue run(String text, Map<String, Object> values, Instant evalTs) throws ExpressionFailure
}
```

`run` 은 `evaluator.evaluate(text, values, evalTs)` 를 부르고 결과를 그대로 돌려준다. 값 맵은 복사하지 않는다(평가기는 작업 안에서 `withValues` 로 곧바로 자기 데이터 접근자에 옮겨 담고, 호출은 한 번에 하나다). 예외는 아래 순서로 바꾼다. 두 `ExpressionFailure` 의 이름이 같으므로(F13d) expr 쪽은 정규 이름 `kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure` 로 적는다.

| 잡은 것 | 처리 |
|---|---|
| `expr.ExpressionFailure f`, `f.getCause() instanceof Error e` | `throw e` — `Error` 는 잡지 않는다(I43). 평가기가 가상 스레드의 `Error` 를 `EVALUATION` 으로 싸기 때문에 여기서 푼다 |
| `expr.ExpressionFailure f`, 원인이 `com.ezylang.evalex.BaseException`(= `ParseException`·`EvaluationException`) 또는 `RuntimeException` | `throw new ExpressionFailure(f.getCause())` — 메시지가 최초와 같다(원인 단순 이름 + `": "` + 원인 메시지, I45). reason `PARSE`·`EVALUATION`·`CONSTANT_KEY` 가 여기로 온다 |
| `expr.ExpressionFailure f`, 그 밖(원인 없음·`TimeoutException`·`InterruptedException`) | `throw new ExpressionFailure(f)` — 메시지 `ExpressionFailure: 식 평가가 N ms 안에 끝나지 않았다: …` 처럼 평가기 메시지가 그대로 실린다(I44). 인터럽트 표지는 평가기가 이미 되살렸다 |
| 그 밖의 `RuntimeException e`(평가기가 싸지 않고 흘린 것, 예: `requireNonNull`) | `throw new ExpressionFailure(e)` — 최초 `catch RuntimeException` 과 같다 |

- 부르는 쪽(`RuleEvaluator.test`·`evaluateValue`)의 위반 조립·Stage·Code 는 바꾸지 않는다. 그래서 타임아웃은 그 식이 속한 단계의 `EVALUATION_ERROR` 가 된다(I44).
- `CONSTANT_KEY` 는 엔진이 예약 키를 먼저 막으므로(§6.8) 실제로는 오지 않는다. 오면 위 둘째 행대로 `EVALUATION_ERROR` 위반이 된다(최초의 UOE 처리와 같다).
- 타임아웃 뒤 멈추지 않은 작업(CPU 만 쓰는 식)은 평가기 Javadoc 의 한계 그대로다. 엔진은 다음 식을 계속 평가한다.

---

## 7. Build 가 주의할 함정

- **rule main 에 record·enum 을 만들지 않는다.** 중첩·private 도 걸린다(F6). 값 묶음은 `private static final class` 로, 상수 묶음은 `static final` 필드로 둔다. `switch` 로 계약 enum(`HitPolicy` 등)을 가르는 것은 괜찮다(합성 클래스는 enum 이 아니다).
- **`Map.of`·`List.copyOf`·`Map.copyOf` 는 null 을 거부한다.** `results`·`groupChoices`·`finalValues`·값 맵·ARRAY 변환 결과는 `Collections.unmodifiableMap(new LinkedHashMap<>(…))`·`Collections.unmodifiableList(new ArrayList<>(…))` 를 쓴다.
- **숫자 비교는 `compareTo`.** EvalEx 결과는 `1E+2` 처럼 음수 scale 이다(E6). 테스트 단언도 같다.
- **불린 판정은 `isBooleanValue()` 먼저.** `getBooleanValue()` 는 숫자에도 true 를 준다(E13).
- **`EvaluationValue.nullValue()` 금지**(E16, 제거 예정 경고). `NULL_VALUE` 상수를 쓴다.
- **`java.io` 금지**(F3). `Serializable` 구현, `UncheckedIOException`, 리소스 읽기를 main 에 두지 않는다. 스냅샷 파일은 test 만 읽는다.
- **`MdmExpressionConfig` 를 import 해도 되지만 고치지 않는다.** main rule 코드는 그 클래스가 필요 없다.
- **ContractOnlyPhaseTest 는 무효가 된 메서드 2건만 지운다**(D2 개정). 파일을 지우거나 `@Disabled` 하지 않고, 나머지 3건은 초록이어야 한다.
- **게이트는 `--continue`** 로 돌리고 XML 보고서로 센다(F1, §3.4). (재작업: 게이트 명령은 §3.4 「재작업 게이트」 다섯 줄 그대로다. `--continue` 를 붙이지 않는다)
- **스냅샷 JSON 이스케이프**: §6.10.4 의 텍스트는 원문이다. JSON 에 옮길 때 `\` 는 `\\`, `"` 는 `\"` 로 한 번 더 이스케이프한다. 스냅샷을 코드로 재생성하지 않는다.
- **샘플 기대값의 출처를 테스트 주석에 적는다**(06 줄 번호·H 줄 번호·"설계 정의 D10"). D10 의 값은 원천이 아니다.
- **`copy()` 도 `ParseException` 을 던진다**(E1). 캐시 없이 매번 `new Expression` 으로 평가하므로 `copy()` 는 쓰지 않아도 된다. (재작업: `copy()` 는 `MdmEvaluator` 안에서만 부른다. rule 은 `Expression` 을 만들지도 복사하지도 않는다, I41)
- **(재작업) `ExpressionFailure` 이름이 둘이다**(F13d). `ExpressionRunner` 에서 expr 쪽은 정규 이름으로 적고 import 하지 않는다. rule 쪽 `ExpressionFailure` 는 이름·가시성·생성자를 바꾸지 않는다(`RuleEvaluator` 두 곳이 checked 예외로 잡는다).
- **(재작업) 옛 생성자를 `@Deprecated` 로 남기지 않는다.** 남기면 `new Expression` 판정 경로가 공개로 남아 같은 사유로 반려된다(D19). 지운 뒤 컴파일 오류가 나는 곳이 §2.5 의 호출부 목록과 같아야 한다 — 다른 곳이 나오면 build-log 에 적고 같은 방식(공유 평가기 넘기기)으로 고친다.
- **(재작업) 엔진 test 가 `MdmEvaluator` 의 패키지 전용 멤버를 부르는 길은 `XT/MdmEvaluatorFixtures` 하나다.** rule test 에서 리플렉션으로 `cacheSize` 를 열지 않는다.
- **(재작업) 타임아웃 테스트는 유한하게 기다린다.** `BLOCK()` 은 10 초 상한 래치, 테스트는 `assertTimeoutPreemptively(5 초)`(03-02 §7 과 같은 이유). 무한 대기면 변이 검증에서 테스트 스레드가 남는다.
- **(재작업) `CodeDataRuleLedgerChainTest` 의 평가기 타임아웃은 기본 1초 그대로 둔다**(운영과 같은 조건). MASTER 판정이 SQLite 를 5번 읽는 가상 스레드 작업이라 게이트에서 이 테스트가 `TIMEOUT` 위반으로 실패하면, 기대값을 바꾸지 말고 225행 평가기만 `new MdmEvaluator(…, Duration.ofSeconds(10))` 로 바꾼 뒤 그 사실과 실패 출력을 build-log 「설계 이탈」 에 적고 보고에 올린다(fixture 의 시간 여유이고 단언 완화가 아니다).
- **(재작업) 무거운 명령은 `heavy.sh` 로 감싼다.** 엔진·mdm 을 함께 보는 좁힌 명령은 §3.4 「재작업 게이트」 의 조사용 명령이다. mdm 은 엔진을 포함 빌드로 읽으므로 엔진을 따로 설치할 필요가 없다.
- 커밋에서 뺄 것: `state.json`, `.dflow*`, `.result`, `.issues`, 빌드 산출물. `git add -A` 금지. 모든 커밋에 `--trailer "DFlow-Order: e1205c87-681d-44be-90b1-0965067683f3"`.

---

## 담당자 확인 필요 결정

### D1 — EvalEx 설정과 MDM 함수를 TSK-03-02 완성 전에 어떻게 얻는가
- **질문**: 운영 설정 팩토리(`MdmExpressionConfig.create`)와 `INSTR`·`MASTER`·`MASTER_AT` 구현은 병렬 TSK-03-02 몫이고 지금은 UOE 다. 룰 엔진과 그 테스트는 설정·함수를 어디서 얻는가?
- **선택지**: (a) 엔진이 생성자로 `ExpressionConfiguration` 을 주입받고, 테스트는 `MdmExpressionConfig` 상수로 조립한 fixture 설정 + 계약(`MdmFunction`·06:443) 이름·인자를 따른 테스트 전용 함수를 쓴다 / (b) 이 Task 가 `MdmExpressionConfig` 몸체를 채운다 / (c) main 에 런타임 스텁 함수를 둔다 / (d) 03-02 머지를 기다린다
- **택한 것**: (a). 런타임 스텁도 Spring bean 같은 운영 배선도 만들지 않는다.
- **근거**: 오케스트레이터 확정 제약 2. (b) 는 03-02 와 같은 파일을 고쳐 충돌하고 `ContractOnlyPhaseTest` 3건을 깬다. (c) 는 운영 경로에 가짜 판정을 남긴다. (d) 는 병렬 일정을 막는다. 주입 방식이면 운영과 테스트가 같은 엔진 코드를 돌고 설정만 다르다.
- **반려되면 재작업 방향**: 03-02 머지 뒤 `TestExpressionConfig` 를 `MdmExpressionConfig.create(new EngineLookups(…코드 사본 fixture…))` 로 바꾸고, `TestFunctions` 를 지우고, `SampleRuleValueTest`·`GeneratedTextParseTest`·`RuleSetEvaluationTest` 를 다시 돌린다. CODE_IN 사례는 코퍼스 규칙(engine-contract §11 가짜 사본 합성)으로 `CodeLookup`·`CodeEffLookup` fixture 를 만든다.
- **(재작업 2026-09-26)** 03-02 가 머지돼 이 결정의 후속을 처리한다. 전면 교체 대신 부분 이관 + 운영 설정 대조 테스트로 정했다 — D22.

### D2 — `ContractOnlyPhaseTest` 를 어떻게 다루는가
> **개정(Build, 2026-09-24, 팀장 지시).** 처음 택한 (a) "허용 실패 2건"은 폐기했다. dev 에 실패 테스트가 들어가면 뒤에 착수하는 모든 워커의 기준선이 깨지기 때문이다.

- **질문**: 테스트 파일 주석은 "먼저 구현하는 Task 가 지운다"인데, 이 Task 가 main 구현을 넣으면 그중 2건이 반드시 실패한다. 어떻게 다루는가?
- **선택지**: (a) 지우지도 `@Disabled` 하지도 않고 2건을 허용 실패로 보고한다(최초 선택, 폐기) / (b) 이 Task 가 파일째 지운다 / (c) 2건만 `@Disabled` / (d) 이 Task 구현 때문에 무효가 되는 테스트 메서드 2건만 지우고 나머지 3건과 파일은 남긴다
- **택한 것**: (d). 지우는 것은 `main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다`, `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다` 두 건이다. `MdmExpressionConfig` 만 보는 나머지 3건은 초록을 유지하고 TSK-03-02 가 지운다. 그 2건만 쓰던 import·상수를 정리하고 클래스 Javadoc 에 한 줄을 덧붙이며, 그 밖의 줄은 건드리지 않는다(§2.3). 게이트는 실패 0 이다(§3.4).
- **근거**: TSK-03-01 D2 는 "main 구현 클래스를 먼저 넣는 Task 가 그 커밋에서 이 파일을 지운다"고 정했다. 팀장 지시는 게이트를 실패 0 으로 두고, 이 Task 가 무효로 만드는 2건만 지우고, 나머지 3건의 삭제 주체는 TSK-03-02 로 두라는 것이다. (b) 는 03-02 가 아직 지키는 3건(`MdmExpressionConfig` 가 UOE 인지)의 보호를 먼저 없앤다. (c) 는 실패를 감출 뿐 무효가 된 규칙을 남긴다. (d) 는 같은 파일을 고치는 03-02 와의 diff 를 가장 작게 한다.
- **반려되면 재작업 방향**: (b) 면 `ContractOnlyPhaseTest.java` 를 파일째 지우고 예상 총수를 3 더 줄인다(1,052). 03-02 에 "이미 지웠다"를 알린다.

### D3 — rule 의 내부 타입을 record·enum 없이 만든다
- **질문**: 영구 `EngineContractSchemaTest`(F6)는 expr·rule(하위 포함)의 모든 record·enum 이 대응표나 `JAVA_ONLY` 목록에 있기를 요구한다. 내부 값 묶음과 토큰 종류를 무엇으로 만드는가?
- **선택지**: (a) record·enum 없이 final class·static 상수로 만든다 / (b) record·enum 을 쓰고 `JAVA_ONLY` 목록에 더한다 / (c) rule 밖 새 패키지(`engine.ruleimpl`)에 둔다
- **택한 것**: (a).
- **근거**: (b) 는 TSK-03-01 테스트 파일을 고쳐야 하고, 03-02·03-04 도 같은 `Set.of(…)` 줄을 고칠 수 있어 머지 충돌 위험이 크다. (c) 는 원천 06:451-463 "패키지 다섯"과 팀장 지시("rule 패키지 안")를 벗어나고 `EnginePackageDependencyTest` 가 새 패키지를 보지 않아 의존 방향 보호가 빠진다. (a) 는 표현력이 조금 줄 뿐 어떤 테스트도 고치지 않는다.
- **반려되면 재작업 방향**: (b) 면 내부 값 묶음을 record 로 바꾸고 `EngineContractSchemaTest.JAVA_ONLY` 에 이름을 더한다. 03-02·03-04 와 같은 줄을 고치므로 머지 순서를 팀장이 정한다.

### D4 — 평가 입력은 스냅샷 텍스트, 생성기는 별도 공개 API
- **질문**: 엔진이 op-code 셀을 평가할 때 `RuleCell.text` 를 쓰는가, 셀 구조에서 매번 생성하는가?
- **선택지**: (a) `text` 를 평가하고, 생성기는 스냅샷 조립·값 테스트 구현체가 부르는 공개 API(`CellTextGenerator.withTexts` 포함) / (b) 엔진이 평가 때마다 구조에서 생성 / (c) text 가 비면 생성, 있으면 text
- **택한 것**: (a).
- **근거**: 원천 06:269·426 "하위 시스템은 생성기를 돌리지 않는다. 생성기 버그를 고치면 재배포해야 판정이 바뀐다", 06:471 "평가 입력은 식 텍스트다", 06:494 "판정이 쓴 식과 조회가 보여 주는 식이 같다". (b) 는 이 셋을 모두 어긴다. (c) 는 두 경로가 생겨 결정성이 흐려지고 `text` 는 계약상 필수라 빈 경우가 없어야 한다. 값 테스트(06:270)는 "요청 본문 구현체"가 `withTexts` 로 텍스트를 채워 같은 엔진 경로를 탄다.
- **반려되면 재작업 방향**: (b) 면 `RuleEvaluator` 가 조건 셀마다 `CellTextGenerator.conditionText` 를 부르고 마루 코드 해석 함수를 엔진 생성자로 받는다. view 의 text 도 생성 결과로 바꾸고 I36 을 고친다.

### D5 — CODE_IN 의 마루 코드 ID 를 어디서 얻는가
- **질문**: 생성 텍스트 `MASTER("<마루 코드>", …)` 의 마루 코드는 셀에 없고 "스냅샷 조립 때 도메인에서 읽는다"(06:157). `RuleVar` 에는 `domainId` 만 있다. 생성기는 이것을 어떻게 받는가?
- **선택지**: (a) 셀 단위 API 는 `maruCodeId` 인자, 정의 단위 `withTexts` 는 `Function<domainId, maruCodeId>` 인자 / (b) `DefinitionLookup.column` 으로 찾는다 / (c) `RuleVar` 계약에 칸을 더한다
- **택한 것**: (a). 해석 함수는 CODE_IN 셀에서만 부른다.
- **근거**: 룰 변수는 테이블에 묶이지 않아 `column(table, column)` 으로 찾을 수 없다((b) 탈락). 계약은 고정이다((c) 탈락, 제약 3). 도메인 → 코드 참조는 서버가 이미 아는 값이다.
- **반려되면 재작업 방향**: 계약 변경이 승인되면 `RuleVar` 에 `maruCodeId` 를 더하는 TSK-03-01 후속을 요청하고, `withTexts` 의 함수 인자를 없앤다.

### D6 — PRIORITY 의 선택 단위와 동률
- **질문**: 원천은 "결과값에 우선순위를 두고 가장 높은 것 채택"(06:50)과 결과 변수별 `prio_list`(06:1016)만 정했다. 결과 변수가 여럿이면 변수마다 따로 고르는가, 행 하나를 고르는가? 동률·목록 밖 값·NULL 은?
- **선택지**: (a) DMN 방식 행 하나: 결과 열 seq 순 순위 튜플을 사전식으로 견주고, 목록 밖·NULL 은 가장 낮고, 동률은 행 seq 가 작은 쪽 / (b) 결과 변수마다 따로 최고 순위 값 / (c) 첫 결과 변수만 본다
- **택한 것**: (a). `hits` 는 순위 순(승자 먼저)으로 둔다. `RuleResult` 에 승자 표시 칸이 없기 때문이다.
- **근거**: 원천이 DMN 용어를 쓴다고 밝혔다(06:44 "DMN 표준 용어 사용"). DMN PRIORITY 는 행 하나를 고르고, 그래야 결과 변수끼리 서로 다른 행에서 섞이지 않는다((b) 는 존재하지 않는 조합을 만든다).
- **반려되면 재작업 방향**: (b) 면 `ResultAggregator.priority` 를 변수별 선택으로 바꾸고 `hits` 를 seq 순으로 되돌린다. I22 와 해당 테스트를 고친다.

### D7 — COLLECT 의 무적중·기본 행·NULL 처리
- **질문**: 원천은 집계 방식 5종(06:1015)만 정했다. 적중이 없을 때, 기본 행이 있을 때, 값이 NULL 일 때는?
- **선택지**: (a) NULL 은 버리고, 모은 값이 없으면 LIST 빈 목록·COUNT 0·나머지 NULL, 무적중은 기본 행 값 하나로 집계, 기본 행도 없으면 NULL(06:31) / (b) 무적중이면 LIST 빈 목록·COUNT 0(DMN 관례) / (c) NULL 도 LIST 에 담는다
- **택한 것**: (a).
- **근거**: 무적중·기본 행 없음 → NULL 은 원천 06:31 "기본 행이 없으면 결과 변수는 NULL" 을 문자 그대로 따른 것이라 원천 근거가 가장 강하다. NULL 을 버리는 것은 뒤 결합식(`MIN`)이 NULL 원소에서 NPE 를 내기 때문이다(E8). 기본 행을 한 값 집계로 두면 LIST 결과가 늘 목록 타입이라 뒤 룰이 타입을 가르지 않아도 된다.
- **반려되면 재작업 방향**: (b) 면 무적중·기본 행 없음 분기에서 LIST → 빈 목록, COUNT → 0 을 돌려주고, SPD_JOIN 식을 `MIN(BASE_SPD, EXC_SPD)` 로 줄이고 LS_A3 S2 기대값의 `EXC_SPD` 를 `[]` 로 바꾼다. (c) 면 NULL 제외를 지우고 집계 함수에서 NULL 을 오류로 본다.

### D8 — 기본 행을 쓸 때 `hits` 와 `groupChoices`
- **질문**: `RuleResult.hits` 는 "적중 행"이고 `defaultApplied` 가 따로 있다. 기본 행을 쓰면 `hits` 에 넣는가? 그룹에서 고른 열은 어디에 담는가?
- **선택지**: (a) `hits` 는 비우고 `defaultApplied=true`, 기본 행의 그룹 선택은 결과 값에만 반영하고 따로 싣지 않는다 / (b) 기본 행을 `Hit` 로 넣는다
- **택한 것**: (a).
- **근거**: 계약 Javadoc 이 `defaultApplied` 를 "적중이 없어 기본 행을 썼는가"로 정의하고 FIRST·UNIQUE `hits` 를 "0-1개 적중 행"이라 했다. 기본 행을 넣으면 "적중 없음"을 `hits` 로 판별할 수 없다. 계약은 고정이라 칸을 더할 수 없다(제약 3).
- **반려되면 재작업 방향**: (b) 면 기본 행 `Hit(rowId, seq, groupChoices)` 를 `hits` 에 넣고 `defaultApplied` 는 그대로 true 로 둔다. I25 와 QLTY Q4·Q5 기대값을 고친다.

### D9 — `RuleView` 의 결과 열 그룹 칸과 `row(rowId)` 가 없다
- **질문**: 06:490-495 는 열 정의와 `RuleView.row(rowId)` 를 말하지만, 계약 `ColumnView` 에는 `res_grp`·`grp_cond`·`grp_cond_ast` 칸이 없고 `row()` 는 계약 record 에 메서드가 필요해 `ContractTypeShapeTest` 가 막는다. 어떻게 하는가?
- **선택지**: (a) 싣지 않고 계약 후속으로 넘긴다 / (b) 그룹 열이면 `exprText`·`exprAst` 에 `grp_cond`·AST 를 실어 우회 / (c) 계약을 고친다
- **택한 것**: (a).
- **근거**: 계약·스키마·TS 는 고정이다(제약 3, (c) 탈락). (b) 는 같은 칸이 열 종류에 따라 뜻이 바뀌어 소비자가 오해하고, 그룹 이름(`res_grp`)은 여전히 실을 곳이 없다. `row(rowId)` 는 호출자가 `rows()` 에서 rowId 로 찾으면 된다.
- **반려되면 재작업 방향**: TSK-03-01 후속으로 `ColumnView` 에 `resGrp`·`grpCond`·`grpCondAst` 를, 스키마·TS 에 같은 칸을 더한 뒤 이 Task 의 view 조립에 세 칸을 채운다(TEXT → `grpCond`, AST → `grpCondAst`). `row()` 는 정적 도우미(`RuleViews.row(view, rowId)`)로 rule 에 둔다.

### D10 — LS_A3 2·3단계(`SPD_EXC`·`SPD_JOIN`) 정의와 기대값은 설계가 정했다
- **질문**: 수용 기준 "세트 LS_A3 샘플 실행 결과 일치"의 비교 대상이 원천에 1단계뿐이다. 2·3단계는 메타데이터(H:532-533)와 개념(WR:33-34)만 있다. 무엇과 견주는가?
- **선택지**: (a) 원천 메타와 개념을 지키는 최소 정의를 fixture 로 만들고 기대값을 설계에 고정(§6.15.5) / (b) 1단계만 세트로 돌린다 / (c) 수용 기준을 보류한다
- **택한 것**: (a). SPD_EXC = COLLECT(LIST), Expression 조건 셀 둘(`COIL_WID >= 1250` → 70, `BASE_SPD > 80 && COIL_WID >= 1200` → 85), SPD_JOIN = DERIVE `LINE_SPD = IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))`.
- **근거**: 메타의 조건 변수(`BASE_SPD`, `COIL_WID`)·결과 변수(`EXC_SPD`·`LINE_SPD` Number)·정책(COLLECT·DERIVE)과 WR:34 결합식 `MIN(BASE_SPD, EXC_SPD…)` 을 그대로 지킨다. `IF` 가드는 D7 의 무적중 NULL 때문에 필요하다(E8). (b) 는 세트의 핵심인 ctx 전파·COLLECT 목록 전달을 검증하지 못한다.
- **반려되면 재작업 방향**: 현업이 실제 예외 조건 표를 주면 `SampleRules` 의 두 룰과 S1·S2 기대값만 바꾼다. 엔진 코드는 바뀌지 않는다.

### D11 — 원천끼리 어긋나는 두 곳
- **질문**: ① 06:1326 의 `ROUND(BASE_FCT * 0.97, 2)` 와 3행 셀(06:1315)의 `0.98` ② 06:258 의 `A.B%` → 정규식 예와 06:257 의 단순형 규칙. 어느 쪽을 따르는가?
- **선택지**: ① (a) `0.98` / (b) `0.97` ② (a) 06:257 단순형(`STR_STARTS_WITH(V, "A.B")`) / (b) 06:258 예대로 정규식
- **택한 것**: ① (a), ② (a). 정규식 이스케이프 회귀는 `A.B_`(단순형이 아닌 모양)로 대신 고정한다(스냅샷 eq.pattern.regex-dot).
- **근거**: ① 3행 셀 JSON 과 RELEASED 목업 `QV1`(H:447)이 `0.98` 이고, `0.97` 은 DRAFT `QV2`(H:451)의 값이다. 06:1326 은 버전을 섞은 서술로 본다. ② 06:257 이 "정규식으로 가기 전에 모양을 본다… 전부 정규식으로 만들지 않도록 여기 적어 둔다"며 규칙을 명시했고, 06:258 은 이스케이프를 설명하는 예다. 규칙 문장이 예보다 강하다.
- **반려되면 재작업 방향**: ① (b) 면 QLTY Q3 기대값을 `0.97` 로(`ROUND(1.0 * 0.97, 2)`) 바꾼다. ② (b) 면 단순형 판정에 "글자에 정규식 메타문자가 있으면 정규식형" 조건을 더하고 스냅샷 prefix-dot 항목을 `STR_MATCHES(…, "A\\.B.*")` 로 바꾼다. 03-04 화면 판정도 같이 바꿔야 한다.

### D12 — 샘플 출처: md 본문 대 화면 목업
- **질문**: 수용 기준의 네 룰 중 셋은 md 본문에 정의가 없다(F12). 무엇을 원천으로 삼는가?
- **선택지**: (a) QLTY 는 06 md, 나머지 셋은 원천 화면 목업 `html/06-business-rule.html` 의 데이터(줄 번호 인용) / (b) md 에 있는 QLTY 만 검증
- **택한 것**: (a). 기대값은 목업 케이스의 값을 EvalEx 실측(E19)으로 확인했다.
- **근거**: PRD(152행)와 spec 이 네 룰을 이름으로 지정했고, 원천 설계 폴더 안에 정의가 있는 곳은 목업뿐이다. 목업 값은 06 본문 서술(06:71-79·207·226-229)과 맞는다.
- **반려되면 재작업 방향**: 원천 md 에 네 룰의 정식 샘플 데이터가 추가되면 `SampleRules` 를 그 값으로 맞추고 차이를 이 절에 기록한다.

### D13 — 대소문자만 다른 레코드 키
- **질문**: EvalEx 는 변수 이름의 대소문자를 가리지 않는다(E3). 레코드에 `COIL_THK` 와 `coil_thk` 가 함께 오면 `withValues` 순회 순서에 따라 값이 갈린다. 예약 키 `eval_ts`·`_v7` 도 엔진이 넣는 키와 충돌한다. 어떻게 막는가?
- **선택지**: (a) 예약 키 검사를 대소문자 무시로 하고, 대소문자만 다른 키가 둘 이상이면 `RESERVED_KEY` 로 거부 / (b) 정렬 순서로 결정적으로 덮어쓴다 / (c) 무시
- **택한 것**: (a). 입력 계약 키 확인은 정확 일치로 둔다.
- **근거**: 결정성(06:422 "같은 레코드면 결과가 같다")이 깨지는 입력은 거부해야 한다. 오류 코드 enum 은 고정이라 새 코드를 만들 수 없어, 키 이름 규칙 위반 계열 중 `RESERVED_KEY` 를 쓴다. (b) 는 호출자 버그를 숨긴다.
- **반려되면 재작업 방향**: (b) 면 중복 검사를 지우고 값 맵을 `TreeMap`(자연 순서)으로 만들어 마지막 키가 이기게 한다. 전용 코드가 필요하면 TSK-03-01 후속으로 `DUPLICATE_KEY` 를 enum·스키마에 더한다.

### D14 — 식 변수·열 조건 오류의 Stage, 룰 없음의 Stage
- **질문**: Stage enum 은 원천 4단계 + 세트 검사뿐이다. 식 변수 계산·열 조건 평가 오류, 단일 룰 조회 실패는 어느 단계인가?
- **선택지**: (a) 식 변수·열 조건 → `ROW_SELECT`(행 고르기의 일부), 단일 룰 없음 → `INPUT_CHECK`, 세트 안 룰 없음 → `SET_CHECK` / (b) 식 변수 → `INPUT_CHECK`
- **택한 것**: (a).
- **근거**: 06:122·424 는 식 변수를 "행을 돌기 전에" 계산한다고 했고, 06:219 는 열 고르기를 "2단계 끝"에 둔다. 둘 다 조건 셀 평가와 같은 평가 오류다. 1단계(06:214)는 키와 타입 변환만 본다.
- **반려되면 재작업 방향**: (b) 면 식 변수 계산을 1단계 끝으로 옮기고 §6.9 표와 `ExpressionVariableTest` 의 Stage 단언을 바꾼다.

### D15 — `=` 패턴 가장자리 규칙과 TSK-03-04 와의 공유
- **질문**: 원천은 `\%`·`\_`·`\\` 이스케이프만 정했다. 홀로 선 백슬래시(`A\B`), 와일드카드가 없는 값의 백슬래시, `%` 개수를 접기 전·후 어느 쪽에서 셀지는 정하지 않았다. 03-04 의 화면 직접 비교와 코퍼스 러너도 같은 규칙이어야 한다.
- **선택지**: (a) STRING EQ 값은 늘 토큰화하고 홀로 선 `\` 는 거부, `%` 개수는 접은 뒤에 센다, 패턴 길이 상한은 생성기가 보지 않는다(§6.11), 공개 API(§6.1)를 03-04 와 공유 / (b) 와일드카드가 있을 때만 이스케이프를 해석
- **택한 것**: (a).
- **근거**: (b) 는 `A\%` 가 와일드카드 없는 값인지 이스케이프인지를 판정하려면 이미 해석해야 해서 순환한다. 거부가 조용한 해석보다 두 엔진의 갈림을 덜 만든다. 접은 뒤에 세는 것은 06:158 "연속한 `%`를 하나로 접고 … 3개로 제한" 순서를 따른 것이다. 길이 상한 값은 원천이 운영 설정 미결로 남겼다(06:386).
- **반려되면 재작업 방향**: (b) 면 토큰화를 "`%`·`_` 가 이스케이프 없이 있을 때만"으로 바꾸고 스냅샷 escape 항목을 고친다. 03-04 가 다른 규칙을 이미 구현했다면 코퍼스로 맞춰 보고 서버(이 생성기)를 기준으로 한다(engine-contract §10 "서버가 기준").

### D16 — 행별 결과 변수의 타입 변환 시점
- **질문**: 06:214 는 "1단계에서 타입 변환"이라 했지만 행별 결과 변수는 결과를 낼 행이 정해져야 필요한지 안다. 적중하지 않은 행의 변수에 잘못된 값이 와도 오류인가?
- **선택지**: (a) 조건 변수(`always`)는 1단계, 행별 변수는 결과를 낼 행에 대해서만 3단계에서 변환 / (b) 계약의 모든 이름을 1단계에서 변환
- **택한 것**: (a). `List` 값은 변환하지 않는다(COLLECT LIST 결과 전달).
- **근거**: 06:207·219 "적중하지 않은 행의 변수는 없어도 된다"는 정신과 맞다. 키가 없어도 되는 변수의 값 형식 때문에 판정이 막히면 모순이다.
- **반려되면 재작업 방향**: (b) 면 1단계에서 모든 `RowContract` 이름 중 레코드에 있는 것을 변환하고, 실패는 `INPUT_CHECK`·`TYPE_CONVERSION` 으로 낸다.

### D17 — 컴파일 캐시를 이 Task 에 두지 않는다
> **개정(2026-09-26, 반려 재작업).** 승인 심사가 이 결정의 후속을 이유로 반려했다(review_note 원문): "이 Task의 설계 D17에 \"03-02 머지 뒤 ExpressionRunner에 캐시 연결\"이 후속 일로 적혀 있는데, 그 연결이 빠졌습니다. 03-02는 MdmEvaluator에 캐시를 만들었지만 룰 판정은 여전히 평가할 때마다 새로 컴파일합니다. 설계에 적힌 \"반려되면 재작업 방향\"대로 연결하도록 요구했습니다." 03-02 가 이미 머지됐으므로 이 결정의 전제("캐시는 03-02 몫, 아직 없다")가 끝났다. 이제 택한 것은 **(c) 03-02 의 캐시를 쓴다**이고, 방법은 D19(평가기 주입)·D20(평가기 `evaluate` 에 넘김)이다. 최초 방향 문장의 "공개 API 는 바뀌지 않는다"는 지키지 못한다. 조사해 보니 캐시를 쓰려면 엔진 생성자가 공유 평가기를 받아야 한다(F13f, D19). 계약 인터페이스 `RuleEngine` 은 바뀌지 않는다.

- **질문**: 06:449 는 컴파일 결과 캐시 + `copy()` 평가를 요구한다. 이 Task 가 캐시를 만드는가?
- **선택지**: (a) 두지 않고 평가마다 `new Expression(text, config)`, 캐시가 끼어들 자리는 `ExpressionRunner` 하나로 모은다 / (b) rule 에 자체 캐시
- **택한 것**: (a).
- **근거**: 컴파일 캐시는 TSK-03-02 요구사항("컴파일 캐시 + copy()")이다. rule 에 따로 두면 03-02 의 캐시와 두 벌이 된다. 새 인스턴스 평가는 스레드 안전하다.
- **반려되면 재작업 방향**: 03-02 머지 뒤 `ExpressionRunner` 가 03-02 캐시에서 원본을 받아 `copy()` 로 평가하게 바꾼다. 공개 API 는 바뀌지 않는다.
- **(개정) 선택지 추가·택한 것**: (c) 03-02 머지 뒤 `MdmEvaluator` 의 캐시를 쓴다 — 택함(D19·D20). (a) 는 전제가 끝나 폐기, (b) 는 캐시가 두 벌이 되어 계속 탈락.
- **(개정) 반려되면 재작업 방향**: 캐시 경로 자체가 거부되면(예: 룰 판정은 타임아웃 없이 호출자 스레드에서만) D20 의 (1) 로 바꾼다. 캐시 연결은 D19 그대로 둔다.

### D18 — 세트 입력 키 일괄 확인이 DERIVE 행 계약의 optional 이름까지 요구하는가
- **질문**: §6.13 4 는 세트 실행 전 입력 키 확인의 대상을 "조건 변수 ∪ DERIVE 룰 행 변수(required·optional)"로 정했다. 그러면 앞 룰이 채우지 않는 optional 이름(예: `SPD_JOIN` 만 담은 세트의 `EXC_SPD`)도 레코드 키로 있어야 한다. optional 의 뜻인 "키가 없어도 된다"(§6.2 3단계, I26)와 어긋나는가?
- **선택지**: (a) 설계대로 optional 이름도 요구한다(값은 null 허용) / (b) 세트 사전 검사에서 optional 이름은 빼고 required 만 요구한다
- **택한 것**: (a). 설계 §6.13 그대로 구현했다(Build 이탈 기록 6).
- **근거**: 원천 06:420 "세트 입력 키를 한꺼번에 본다"는 DERIVE 행 변수의 required·optional 구분을 따로 말하지 않는다. 사전 검사는 판정 도중 "변수 없음" 오류가 나지 않게 하는 목적이므로 넓게 요구하는 쪽이 안전하다. LS_A3 는 `EXC_SPD` 를 앞 룰(`SPD_EXC`)이 채우므로 영향이 없다.
- **반려되면 재작업 방향**: (b) 면 `MdmRuleEngine.missingInputKeys` 에서 DERIVE `RowContract.optional()` 을 `needed` 에 넣지 않는다. `RuleSetEvaluationTest.CREATED_세트는_실행하고_빈_세트는_빈_결과` 의 레코드에서 `EXC_SPD` 를 빼고, optional 누락이 오류가 아님을 확인하는 사례를 더한다. 이 경우 단독 DERIVE 식이 optional 이름을 참조하면 판정 중 `EVALUATION_ERROR` 가 날 수 있으니 식 작성 규칙을 함께 정해야 한다.

### D19 — (재작업) 엔진은 공유 `MdmEvaluator` 를 받고, 설정만 받는 생성자는 지운다
- **질문**: 운영 호출부 셋은 요청마다 `new MdmRuleEngine(evaluator.configuration(), new SingleRuleDefinitionLookup(def))` 를 만든다(F13f). `ExpressionRunner` 에 캐시를 달아도 엔진이 요청마다 새로 생기면 캐시는 늘 비어 있다. 캐시를 어디에 두고, 기존 `MdmRuleEngine(ExpressionConfiguration, DefinitionLookup)` 생성자는 어떻게 하는가?
- **선택지**: (a) 새 생성자 `MdmRuleEngine(MdmEvaluator, DefinitionLookup)` 하나만 두고 옛 생성자는 지운다. 호출부는 앱에 하나인 평가기 빈을 넘긴다 / (b) 새 생성자를 더하고 옛 생성자는 남긴다(유지·`@Deprecated`) / (c) 옛 생성자가 설정으로 평가기를 만들어 새 생성자에 위임한다 / (d) 엔진을 싱글턴 빈으로 두고 정의 조회를 호출마다 넘긴다
- **택한 것**: (a). 호출부 5곳(운영 3, 테스트 2)과 엔진 테스트 10개를 새 생성자로 바꾼다(§2.5). mdm 쪽은 ArchUnit 으로 "평가기는 `MdmEngineConfig` 만 만든다"를 붙잡는다(I47).
- **근거**: 캐시는 인스턴스 필드라서 캐시가 공유되는지는 누가 인스턴스를 만드는지에 달렸다. 앱에 하나인 평가기 빈(F13e)이 이미 도메인 검증·저장 시 검사·AST 내보내기의 공유 캐시다("평가기는 앱에 하나다 — 파싱 캐시를 모든 API 가 공유한다", `MdmEngineConfig` Javadoc). (b) 는 `new Expression` 판정 경로를 공개로 남긴다. 누가 다시 설정으로 엔진을 만들면 반려 사유가 그대로 돌아온다. (c) 는 불가능하다: `MdmEvaluator` 는 `EngineLookups` 로 설정을 스스로 만들 뿐 설정을 받지 않는다(F13b). 받게 하더라도 엔진마다 새 평가기, 곧 새 빈 캐시가 된다. (d) 는 계약 `RuleEngine.evaluate(ruleId, record, evalTs)` 에 정의 조회를 넘길 자리가 없다. 요청마다 정의를 만드는 `SingleRuleDefinitionLookup` 구조(F13f)도 바꿔야 해 범위를 넘는다.
- **반려되면 재작업 방향**: 옛 생성자를 꼭 남겨야 한다면 (b) 로 되돌리되, 설정만으로는 판정할 수 없게 `@Deprecated(forRemoval = true)` + 몸체에서 즉시 `UnsupportedOperationException` 을 던진다. 엔진 싱글턴이 요구되면 (d) 를 계약 변경(TSK-03-01 후속)으로 올린다.

### D20 — (재작업) 평가 스레드: `MdmEvaluator.evaluate` 에 넘긴다(타임아웃 동반)
- **질문**: 캐시 원본을 어떻게 평가하는가? (1) 캐시 원본의 `copy()` 를 받아 호출자 스레드에서 평가(D17 최초 방향 문구 그대로) (2) `MdmEvaluator.evaluate()` 에 넘긴다 — 가상 스레드에서 돌고 1초 타임아웃이 붙는다. (2) 면 CODE_IN·MASTER 같은 조회 함수가 호출자의 Spring 트랜잭션·ThreadLocal 밖에서 돈다.
- **선택지**: (1) `MdmEvaluator` 에 캐시 사본을 내주는 공개 메서드(예: `Expression copyOf(text)` 또는 `evaluateInCallerThread(...)`)를 더하고 `ExpressionRunner` 가 호출자 스레드에서 평가 / (2) `evaluate(text, values, evalTs)` 에 넘기고, 바뀌면 안 되는 동작(`Error` 전파·메시지 형식)은 `ExpressionRunner` 의 변환으로 지킨다(§6.17)
- **택한 것**: (2).
- **근거**: 조사 결과(F13e·F13h·F13i). ① 운영 평가기 빈의 조회는 `EMPTY_CODES`·`MasterLookup.NONE`·`FunctionProvider.NONE` 이라 지금 판정 중에 DB·트랜잭션·ThreadLocal 을 읽는 함수가 없다. ② 앞으로 붙을 DB 구현 `MdmCodeLookup` 은 "트랜잭션에 기대지 않는다(엔진은 가상 스레드에서 부를 수 있다)"를 전제로 이미 쓰였다. ③ SQLite 풀은 기본값(10)이라 바깥 트랜잭션이 커넥션 하나를 쥐어도 가상 스레드가 다른 커넥션을 받는다. 풀 1 교착 조건이 아니다. ④ 도메인 검증기가 이미 같은 경로(가상 스레드 + 1초)로 운영·테스트에서 돈다. ⑤ 원천 06:449 가 평가 타임아웃을 안전장치로 요구하고, 06:438·03-02 인계가 "서버·룰 엔진이 같은 평가기 한 곳"을 요구한다(F13o·F13p). (1) 은 타임아웃을 빼고, 캐시 사본(`Expression`)을 공개 API 로 내보내 03-02 의 "캐시 원본은 밖으로 내보내지 않는다, 공개 메서드는 늘 사본에만 값을 넣는다" 규칙을 약하게 만든다. 동작 차이는 셋이고 모두 설계로 정한다. `Error` 는 평가기가 싸므로 `ExpressionRunner` 가 풀어 다시 던진다(I43). 위반 메시지는 원인 예외를 풀어 최초 형식을 지킨다(I45). 타임아웃은 새로 생기는 동작이며 `EVALUATION_ERROR` 위반이다(I44). 정규식 폭주는 EvalEx `regexTimeoutMillis`(100 ms)가 먼저 끊으므로 1초 타임아웃과 겹치지 않는다(F13p). 부하 민감성은 fixture 평가기의 넉넉한 타임아웃(10 초, D21)으로 테스트에서 떼어 낸다.
- **남는 위험(보고 대상)**: DB 를 읽는 조회 빈(`MdmCodeLookup` 등)을 운영에 등록하면(06-05 이후), 확정·저장 검사 중의 MASTER 판정은 바깥 `TransactionTemplate` 의 **커밋 전 쓰기를 보지 못한다**(다른 커넥션). 지금은 조회 빈이 없어 드러나지 않는다. 조회 빈을 등록하는 Task 가 이 전제를 확인해야 한다(§후속).
- **반려되면 재작업 방향**: (1) 로 바꾼다. `MdmEvaluator` 에 `public EvaluationValue evaluateInCallerThread(String text, Map<String,?> values, Instant evalTs)`(캐시 원본 `copy()` → `withValues` → `with(EVAL_TS)` → `evaluate`, 예외 변환은 `evaluate` 와 같게, 타임아웃 없음)를 더하고 `ExpressionRunner` 가 그것을 부른다. I44 와 `ExpressionCacheWiringTest` ⑤ 는 "타임아웃이 없다"로 바꾼다. 03-02 문서 인계와 달라지므로 담당자에게 알린다.

### D21 — (재작업) fixture 설정을 평가기에 태우는 길: 패키지 전용 생성자 + test 도우미
- **질문**: 엔진이 평가기만 받으면 엔진 단위 테스트는 fixture 설정(`TestExpressionConfig` — 가짜 `MASTER`·`INSTR`, 카운팅 함수, UTC 시간대)을 어떻게 넣는가? `MdmEvaluator` 는 `MdmExpressionConfig.create(lookups)` 로만 설정을 만들고, `create` 는 표준 이름(`MASTER`·`INSTR`)과 겹치는 함수를 거부하며 시간대가 KST 로 고정이다(F13b).
- **선택지**: (a) `MdmEvaluator` 에 패키지 전용 생성자 `(ExpressionConfiguration, Set<String>, Duration)` 을 두고 공개 생성자가 그것에 위임한다. test 소스의 같은 패키지 도우미 `MdmEvaluatorFixtures` 만 부른다 / (b) 공개 생성자로 연다 / (c) 엔진 테스트용으로 옛 `MdmRuleEngine(ExpressionConfiguration, …)` 생성자를 남긴다 / (d) 모든 엔진 테스트를 운영 설정으로 옮긴다(D22 전면 이관)
- **택한 것**: (a). 도우미의 기본 타임아웃은 10 초(`FIXTURE_TIMEOUT`)이고, 타임아웃 사례만 50 ms 로 만든다.
- **근거**: (a) 는 공개 표면을 바꾸지 않는다(I48, `ContractTypeShapeTest` 목록 밖이라 형태 규칙에도 안 걸린다, F13k). 모든 엔진 테스트가 운영과 같은 캐시·`copy()`·가상 스레드 경로를 탄다. 새 생성자는 공개 생성자가 실제로 거치는 길이라 테스트 전용 뒷문이 아니다. (b) 는 06 「설정 고정」(설정은 모듈이 만든다)을 약하게 한다. 누구든 다른 사전·시간대로 평가기를 만들 수 있게 된다. (c) 는 D19 에서 탈락한 `new Expression` 경로를 다시 남긴다. (d) 는 D22 에서 다룬다. 기본 10 초는 03-02 가 1,000 스레드 테스트에 30 초를 둔 것과 같은 이유다(전체 스위트 부하에서 거짓 타임아웃 방지). 운영 기본값(1초)은 대조 테스트(D22)와 mdm·api 테스트가 그대로 쓴다.
- **반려되면 재작업 방향**: 03-02 산출물에 생성자를 더하는 것이 거부되면, 엔진 테스트를 (d) 로 옮긴다(D22 반려 방향과 같다). UTC 시간대 사례는 `MdmEvaluatorTest`(expr)로 옮겨 평가기의 `EVAL_TS` 주입을 직접 검사한다.

### D22 — (재작업) D1 후속(`TestExpressionConfig`·`TestFunctions` 이관): 부분 이관 + 운영 설정 대조 테스트
- **질문**: D1 의 반려 방향은 "03-02 머지 뒤 `TestExpressionConfig` 를 `MdmExpressionConfig.create(...)` 로 바꾸고 `TestFunctions` 를 지운 뒤 샘플·파싱·세트 테스트를 다시 돌린다"였다. 전면 이관하는가?
- **선택지**: (a) 전면 이관: 모든 엔진 테스트를 `new MdmEvaluator(EngineLookups)` 로 만들고 `TestFunctions` 를 지운다 / (b) 부분 이관: 엔진 단위 테스트는 fixture 설정을 평가기에 태워(D21) 쓰고, 운영 설정(`new MdmEvaluator(lookups)`)으로 샘플 판정·LS_A3·스냅샷 파싱·CODE_IN 한 벌을 돌려 fixture 결과와 같은지 보는 대조 테스트를 더한다 / (c) 그대로 둔다
- **택한 것**: (b). `ProductionConfigParityTest`(§3.6). `TestExpressionConfig` 의 낡은 Javadoc 한 문장만 고친다.
- **근거**: D1 반려 방향의 목적은 "운영 설정에서 다시 확인한다"이고 (b) 의 대조 테스트가 그것을 직접 한다(수용 기준 1·3·4 를 운영 설정으로). 전면 이관을 하지 않는 이유는 fixture 에만 있는 도구 넷이다. ① 카운팅 함수(`COUNT_CALL`, I30·I31 "평가하지 않음" 단언). 비즈니스 함수로 옮길 수는 있지만 이름 규칙·칸 제한이 따라붙는다. ② UTC 시간대 엔진(`RuleEngineStageTest.EVAL_TS_는_설정_시간대와_무관하게_…`). `create` 는 시간대를 KST 로 고정해 만들 수 없다. ③ `MASTER` 가 본 `EVAL_TS` 기록(`seenEvalTs`, I28). 운영 `MASTER` 는 이 값을 밖에 드러내지 않는다. ④ 코드 집합 한 줄 선언(`code(id, cate, keys…)`). 운영 `MASTER` 로 옮기면 CODE_IN 사례 전부에 `CodeRows`(헤더·버전·항목·카테고리·소속)를 합성해야 한다. 이 넷을 옮기면 기존 단언을 다시 써야 하고, 반려 사유(캐시)와 무관한 테스트 재작성이 커진다. (c) 는 D1 후속을 조용히 남겨 같은 논리로 다시 반려될 수 있다. 03-04 코퍼스 하네스도 같은 방식의 fixture 설정을 쓴다(F13m).
- **반려되면 재작업 방향**: (a) 로 간다. `TestFunctions` 의 코드 집합을 `CodeLookup` fixture(`CodeRows` 합성 도우미, engine-contract §11)로, `COUNT_CALL` 을 `FunctionProvider` 비즈니스 함수로 바꾼다. UTC·`seenEvalTs` 사례는 `MdmEvaluatorTest` 로 옮긴다(D21 반려 방향). 그 뒤 `TestFunctions`·`TestExpressionConfig` 를 지우고 `GeneratedTextParseTest`·`CellTextGeneratorTest` 의 `CONFIG` 도 운영 설정으로 바꾼다.

### D23 — (재작업) `EVAL_TS` 는 값 맵과 평가기 두 곳에서 넣는다
- **질문**: `RuleEvaluator` 는 값 맵에 `EVAL_TS` 를 넣고 `MdmEvaluator.evaluate` 도 `with(EVAL_TS, …)` 로 넣는다(F13j). 한 곳을 지우는가?
- **선택지**: (a) 둘 다 둔다(값이 같은 절삭 `Instant` 라 결과가 같다) / (b) 값 맵에서 지운다 / (c) 평가기 쪽을 끈다
- **택한 것**: (a).
- **근거**: (b) 는 식 변수의 참조 NULL 검사(`values.get(ref) == null`)가 `EVAL_TS` 를 NULL 로 보게 만들어 `refVars` 에 `EVAL_TS` 가 든 식 변수가 평가되지 않는다. 동작이 바뀐다(I46). (c) 는 03-02 산출물의 공개 동작을 바꾼다. 두 값은 같은 `Run.evalTs`(이미 절삭)에서 오고 평가기가 한 번 더 자르는 것은 멱등이다. `with` 가 `withValues` 뒤라 평가기 값이 이긴다.
- **반려되면 재작업 방향**: (b) 면 참조 NULL 검사를 `ctx` + `EVAL_TS` 예외 처리로 바꾸고 I46 사례의 기대를 그대로 유지한다.

### D24 — (재작업) 03-02 인계의 `ValueConverter.convert`·`RecordKeys.violations` 통합은 이번에 하지 않는다
- **질문**: 03-02 인계(F13o)는 룰 엔진도 expr 의 `ValueConverter.convert`·`RecordKeys.violations` 를 쓰라고 했다. rule 에는 자체 변환·키 검사가 있다. 이번 재작업에서 통합하는가?
- **선택지**: (a) 하지 않고 결정으로 남긴다 / (b) rule 의 `ValueConverter.toDeclared`·`RecordKeys.check` 를 expr 것으로 바꾼다
- **택한 것**: (a).
- **근거**: 반려 사유는 캐시 연결 하나다. 두 변환기는 규칙이 다르다(F13o). NUMBER 문자열의 지수 표기, STRING·DATE 에 들어오는 `Double`, DATE 의 문자열 처리, `List` 통과가 갈린다. 통합하면 판정 결과(입력 검사 위반 여부·결과 값 타입)가 바뀐다. 캐시 재작업에 판정 규칙 변경을 섞으면 "동작 동일"을 증명할 수 없다. 키 검사도 rule 은 대소문자만 다른 키 거부(D13)와 `_` 접두 예약을 더 본다. 어느 규칙이 맞는지는 담당자가 정할 일이다(06:198 "같은 함수" 요구 vs 이 Task 의 §6.7·D13 결정).
- **반려되면 재작업 방향**: (b) 로 간다. 먼저 두 표의 차이를 사례로 적어 담당자가 기준 쪽을 정하고, rule `ValueConverter.toDeclared` 가 `expr.ValueConverter.convert` 를 부르되 `List` 통과·DATE 처리만 rule 에 남긴다. `arch/TypeConversionEntryTest` 에 rule 결속 규칙을 더한다. `ValueConverterTest`(rule)의 기대값 변경은 그 결정에 따른다.

## 도커 금지로 생략한 검증

- 금지 모드 출처: 워커 기본(DOCKER=allow 아님)
- 생략한 명령 없음 — 이 재작업이 닿는 `maru-mdm-engine`·`mdm`(lib·api) 테스트에는 docker·Testcontainers 를 쓰는 테스트가 없다(`testcontainers` grep 0건, mdm 은 SQLite 만). 게이트는 §3.4 「재작업 게이트」 의 기준선 명령 다섯 줄을 제외 없이 그대로 쓴다. 이 절 때문에 확인하지 못하는 수용 기준은 없다.

---

## Build 모델 권고

**opus.** spec 의 model 이 opus 이고 Design 도 opus 였다(dev-discipline 모델 배정 "Design 이 opus 였으면 Build 도 opus"). 판정 절차·생성기·스냅샷·fixture 가 모두 정밀한 명세 이행이라 격하하지 않는다.

---

## 이탈 기록 (Build, 2026-09-24)

설계 본문과 다르게 했거나 설계가 정하지 않은 자리를 채운 것을 적는다. 계약·설정·스냅샷 기대 텍스트는 바꾸지 않았다.

1. **테스트 전용 설정에 시간대 인자 오버로드를 더했다.** `TestExpressionConfig.create(functions, extra, zoneId)` 를 추가했고, 기존 `create(...)` 는 그대로 `MdmExpressionConfig.ZONE` 을 쓴다(§6.16). 이유는 변이 검증이다. I28 에 "EVAL_TS 를 KST 벽시계 `LocalDateTime` 으로 넣는" 변이를 넣으면 설정 시간대가 KST 라서 EvalEx 가 같은 순간으로 되돌려 바꾸고, 결과가 달라지지 않는다. UTC 설정 엔진으로 `RuleEngineStageTest.EVAL_TS_는_설정_시간대와_무관하게_Instant_로_넣는다` 를 더해 이 변이를 빨강으로 만들었다. 운영 경로에는 영향이 없다.
2. **§3.1 에 없는 테스트 사례를 더했다.** `ResultAggregator.rank`·`collect`·`sameValue` 를 직접 부르는 단위 사례(`HitPolicyTest`)를 넣었다. `stripTrailingZeros=true` 때문에 엔진 경로에서는 `1.0` 과 `1` 이 같은 scale 로 정규화되어, I24 의 "`equals` 로 숫자 비교" 변이가 엔진 경로로는 드러나지 않는다.
3. **스냅샷 로더를 별도 파일로 두지 않았다.** `CellTextSnapshotTest.cases()`(test 전용 record `SnapshotCase`)를 `GeneratedTextParseTest` 가 같이 쓴다. §2.2 의 파일 목록은 그대로다.
4. **매개변수화 테스트 이름에 메서드 이름을 넣었다.** `@ParameterizedTest(name = "{displayName} [{0}]")` 로, 기존 `EngineContractSchemaTest` 관례를 따랐다. JUnit XML 의 testcase 이름이 메서드끼리 겹치면(`[1] 7` 등) 게이트의 "테스트 이름 단위 차분"이 틀어지기 때문이다.
5. **설계가 순서를 정하지 않은 자리.** `evaluate` 는 룰 조회(`RULE_NOT_FOUND`)를 먼저 하고 레코드 예약 키 검사를 그다음에 한다. 예약 키 위반은 그 자리에서 던지며, 1단계 계약 키 검사와 한 예외로 합치지 않는다(§6.2 "예약 키 검사는 부르는 쪽이 이미 했다"). 결과 열 그룹 고르기는 DERIVE 에서도 같은 규칙으로 한다(§6.4 "정책과 무관").
6. **세트 입력 키 확인은 §6.13 4 그대로 DERIVE 행 계약의 optional 이름도 요구한다.** 그래서 `SPD_JOIN` 을 단독으로 담은 세트는 `EXC_SPD` 키(값 null 허용)가 레코드에 있어야 한다. 설계대로 구현한 결과이며, 테스트 `CREATED_세트는_실행하고_빈_세트는_빈_결과` 가 이 전제를 따른다. optional 을 세트 입력 키에서 빼야 한다면 원천 06:420 해석을 담당자가 정해야 한다.
7. **F11 후속.** `rule/package-info.java` 의 "계약 전용 단계" 설명은 이 Task 뒤에 낡았지만 고치지 않았다(병렬 03-04 충돌 회피). 머지 뒤 정리 대상이다.
8. **I40 은 변이를 넣지 않았다.** `MdmExpressionConfig` 는 이 Phase 의 수정 금지 파일이라 몸체 추가 변이를 넣지 않았다. 보호는 `ContractOnlyPhaseTest` 나머지 3건 초록과 `/usr/bin/git diff` 공백 확인으로 대신한다.
9. **D2 를 개정했다(팀장 지시).** 허용 실패 2건 방식을 폐기하고, `ContractOnlyPhaseTest` 의 무효가 된 메서드 2건만 지웠다. 게이트는 실패 0 이고 예상 총수는 1,055, 하한은 516 이다(§2.3·§3.4). 이탈 기록 6의 질문은 D18 로 올렸다.

## 후속 (이 Task 에서 하지 않는다)

TSK-03-02 머지 뒤에 할 일이다.

- `TestExpressionConfig`·`TestFunctions` 를 `MdmExpressionConfig.create(...)` 와 03-02 의 함수 구현으로 바꾸고 샘플·파싱·세트 테스트를 다시 돌린다(D1).
- `ExpressionRunner` 에 03-02 의 컴파일 캐시 + `copy()` 를 연결한다(D17).
- `ContractOnlyPhaseTest` 나머지 3건이 사라진 뒤 기준선을 다시 잡는다(§3.4).
- `rule/package-info.java` 의 "계약 전용 단계" 설명을 정리한다(F11).

**(재작업 2026-09-26) 위 네 항목의 처리.** 조용히 남기는 항목은 없다.

| 항목 | 처리 |
|---|---|
| `TestExpressionConfig`·`TestFunctions` 이관(D1) | 부분 이관 + 운영 설정 대조 테스트 `ProductionConfigParityTest`(D22). 전면 이관은 D22 의 반려 방향 |
| `ExpressionRunner` 캐시 연결(D17) | 이번 재작업의 본체(D17 개정·D19·D20·D21) |
| `ContractOnlyPhaseTest` 뒤 기준선(§3.4) | 이미 해소 — 파일이 dev 에 없고 기준선은 6d2110fc 에서 다시 쟀다(F13l, §3.4 「재작업 게이트」) |
| `rule/package-info.java`(F11) | 이번에 고친다(§2.5) |

**(재작업) 새로 남는 후속(이 재작업에서 하지 않는다).**

- 03-02 인계의 `ValueConverter`·`RecordKeys` 통합(D24) — 담당자가 기준 규칙을 정한 뒤.
- DB 조회 빈(`MdmCodeLookup` 등)을 운영에 등록하는 Task(06-05 이후)는 룰·도메인 판정이 가상 스레드에서 바깥 트랜잭션의 커밋 전 쓰기를 보지 못한다는 전제를 확인한다(D20 남는 위험).
- `MdmEvaluator` 캐시는 상한이 없다(03-02 설계). 값 테스트·저장 검사가 편집 중인 DRAFT 식을 평가할 때마다 새 텍스트가 쌓인다. 상한·축출 정책은 03-02 쪽 결정으로 올린다.
