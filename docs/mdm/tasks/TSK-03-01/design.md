# TSK-03-01 설계 — 엔진 공유 계약 (계약 전용)

> 주문 `ddb95b54-377e-417d-a694-d0fd8475c370` · category infra · domain backend · 작성 2026-09-24 (Design Phase, 자동 모드)
> 입력: `spec.md`(요구사항 데이터) · dev-discipline 「Phase 02 — Design」 · TSK-02-02 산출물(`tasks/TSK-02-02/design.md` §0·§6·§13, `docs/mdm/engine-contract.md`, `docs/mdm/engine-contract/**`) · TSK-01-01 스캐폴드(`src/backend/maru-mdm-engine`, `src/frontend/m-mdm`) · 원천 `06-business-rule.md`(436-500 엔진 모듈 절) · `wbs.md` TSK-03-02~04 · `RULE.md`
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 기존 관례 > 미승인 선행 산출물(TSK-02-02·TSK-01-01 은 머지됐지만 미승인이라 가장 낮다)
> 에이전트 프롬프트: state.json 에 `agent_prompt` 가 없다. 위임 지시는 팀장 메시지이고, 그 제약(스캐폴드 `ExpressionEvaluator` 불변, docs 초안은 복사만, 커밋 규칙)을 전 Phase 에서 지킨다.
> RULE.md: 「작업 분기 — 가이드 라우팅」 세 분기(MES 화면 설계·APS·MES 개발)는 화면·업무 모듈 작업용이다. 이 작업은 엔진 jar 와 프런트 라이브러리의 계약 타입만 다루므로 해당 분기가 없다. 패키지 명명은 엔진 group `kr.dongkuk.maru.mdm`(TSK-01-01 D7)을 그대로 따른다.

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

| # | 사실 | 근거 |
|---|---|---|
| F1 | 엔진은 독립 Gradle 빌드다(`maru-mdm-engine/settings.gradle` rootProject). 백엔드 루트 `testAll` 이 `includedProjectNames` 에 `maru-mdm-engine` 을 넣어 `:test` 를 부른다 | `src/backend/build.gradle:7,15-19` |
| F2 | 엔진 main 의존은 `api 'com.ezylang:EvalEx:3.7.0'` 하나, test 는 JUnit BOM 5.11.4·`archunit-junit5:1.3.0` 이다. `-parameters` 컴파일 옵션, UTF-8 | `maru-mdm-engine/build.gradle` |
| F3 | 기존 ArchUnit 규칙 1(EvalEx·java.lang/util/math/time/text 외 의존 금지)과 규칙 2(DB·네트워크 금지)는 `ImportOption.Predefined.DO_NOT_INCLUDE_TESTS` 로 **main 클래스만** 검사한다. 그래서 test 범위 Jackson 은 규칙 1 을 깨지 않는다. `java.io` 는 허용 목록 밖이다(main 에서 파일을 읽을 수 없다) | `MaruMdmEngineArchitectureTest.java:24-46` |
| F4 | 스캐폴드 `expr.ExpressionEvaluator` 는 `new Expression(expression).evaluate()` 로 평가하는 구체 클래스다. `mdm/lib` 의 `MdmEngineDependencySmokeTest` 가 이 클래스를 직접 부른다. 지우거나 바꾸면 mdm 테스트가 깨진다 | `ExpressionEvaluator.java`, `mdm/lib/src/test/.../MdmEngineDependencySmokeTest.java` |
| F5 | 엔진 main 에는 `ExpressionEvaluator` 와 다섯 `package-info.java` 만 있다. `src/main/resources` 폴더는 아직 없다 | `find src/backend/maru-mdm-engine/src` |
| F6 | ArchUnit 1.3.0 `JavaClass` 에 `isRecord()`·`isEnum()`·`isInterface()`·`isAnnotation()`·`isAnonymousClass()`·`getEnclosingClass()`·`getModifiers()`·`getStaticInitializer()`·`getMethodCallsFromSelf()`·`getConstructorCallsFromSelf()` 가 있고, `JavaModifier.SYNTHETIC` 이 있다. ArchUnit 1.x 는 `failOnEmptyShould` 가 기본 true 라서 대상 클래스가 0건이면 규칙이 실패한다 | `javap` on `archunit-1.3.0.jar` |
| F7 | EvalEx 3.7.0 `ExpressionConfiguration` 공개 static 멤버: `StandardConstants`(Map), `DECIMAL_PLACES_ROUNDING_UNLIMITED`(int), `DEFAULT_MATH_CONTEXT`, `DEFAULT_MAX_RECURSION_DEPTH`, `DEFAULT_REGEX_TIMEOUT_MILLIS`, `defaultConfiguration()`, `builder()`. `FunctionDictionaryIfc.hasFunction(String)` 이 default 메서드로 있다 | `javap` on `EvalEx-3.7.0.jar` |
| F8 | Jackson: `com.fasterxml.jackson.core:jackson-databind` 2.18.2 가 Gradle 캐시에 있고 `oasis/build.gradle:23` 이 같은 버전을 고정해 쓴다(리포 선례). mavenCentral 최신은 2.22.3 이다 | `~/.gradle/caches/.../jackson-databind/2.18.2`, maven-metadata.xml |
| F9 | `json-schema-to-typescript` 최신은 16.0.0 이다(의존: `@apidevtools/json-schema-ref-parser`, `prettier ^3.9.6` 등, node ≥16). 초안 스키마로 스크래치 실행한 결과 `$defs`(2020-12)를 읽고, `unreachableDefinitions: true` 이면 모든 `$defs` 를 이름 있는 타입으로 내보낸다. `const`→리터럴 타입, `oneOf`→유니온, `minItems/maxItems`→튜플, `["integer","null"]`→`number \| null` 로 나온다. 루트 인터페이스 이름은 스키마 `title` 에서 나온다(초안 title 이면 `MaruMdmEngineTSK0202` 라는 이름이 나온다) | 스크래치 `j2ts/out.ts` |
| F10 | 같은 실행에서 인라인 객체(`RuleResult.hits.items`, `warnings.items`, `EngineError.violations.items`, `InputContract.rows.items`)는 이름 없는 익명 타입으로 나오고, `violations` 는 `minItems: 1` 때문에 같은 객체 타입이 두 번 펼쳐진다 | 스크래치 `j2ts/out.ts` |
| F11 | m-mdm: 스크립트 `lint = tsc --noEmit`(tsconfig `include: src, pages, app` — `tests`·`scripts` 는 타입 검사 밖), `test = vitest run`(vitest 설정 파일 없음 → 기본 node 환경, `**/*.test.ts`), tsup 은 `src/index.ts`·페이지 엔트리를 번들한다(`dts: true`). `src/index.ts` 는 지금 `export {};` 뿐이다. `.prettierignore` 가 없다. `.tsbuildinfo`·`dist/` 는 git 추적 대상이 아니다 | `src/frontend/m-mdm/*`, `git ls-files` |
| F12 | `src/frontend/pnpm-workspace.yaml` 의 `allowBuilds:` 에 `set this to true or false` 자리표시 값이 있다. `pnpm add` 가 이 파일을 건드릴 수 있다 | `pnpm-workspace.yaml` |
| F13 | 원천 06:463 의존 방향: `spi` 는 다른 패키지에 의존하지 않고, `code` 는 `spi` 만, `expr` 는 `spi`·`code`, `rule`·`domain` 은 `expr`·`spi` 를 본다. `domain` 은 `code` 를 직접 보지 않는다. 초안 Java 의 실제 참조: `expr.MdmExpressionConfig → spi.EngineLookups`, `rule.RuleResult → expr.EngineWarning`, `rule.RuleView → spi.DefinitionLookup.*`. 나머지 패키지 간 참조는 없다 | 06:463, 초안 import |
| F14 | 초안 `MasterLookup.NONE` 은 익명 클래스(`MasterLookup$1`)를 만든다. `CodeEffLookup.NONE`(람다)은 인터페이스 안에 synthetic 메서드 `lambda$static$0` 을 만들고, `FunctionProvider.NONE = List::of` 는 메서드 참조라 추가 클래스가 없다. `RuleEngine.text`·`textAndAst` 는 default 메서드다(원천 06:480 이 `view(…, EnumSet.of(TEXT))` 위임으로 정의) | 초안 소스, 06:476-483 |
| F15 | 원천 06 에는 있지만 초안에 없는 것: `RuleView.row(rowId)`(06:495, record 에 몸체가 필요), 모듈이 공개하는 엔진 버전 상수(06:469 의존성 규칙 4) | 06:469·495 |
| F16 | spec.md 는 선행 Task 에서 Phase 경계 상태 커밋(`chore(mdm): … 상태를 기록한다`)에 들어갔다. design 커밋에는 넣지 않는다 | `git log -- docs/mdm/tasks/TSK-02-02/spec.md` |

---

## 1. 접근 방식

TSK-02-02 가 docs 에 남긴 계약 초안(Java 21 개, JSON Schema 1 개)을 **복사해서** 엔진 main 으로 옮기고, 실행 몸체가 필요한 자리는 interface·시그니처·`UnsupportedOperationException` 으로만 둔다. JSON 모양의 정본은 엔진 `src/main/resources` 의 스키마 **한 벌**이다. TS 는 m-mdm 의 생성 스크립트가 그 파일을 상대경로로 읽어 `json-schema-to-typescript` 로 만들고, vitest 가 "다시 생성한 결과 = 커밋된 파일"을 검사한다. Java 는 엔진 main 의존을 EvalEx 하나로 유지해야 하므로(F2·F3) 생성기를 쓰지 않고, 손으로 쓴 record·enum 을 엔진 테스트(Jackson 은 `testImplementation`)가 스키마 `$defs` 와 양방향으로 대조한다. "실행 로직 없음"은 ArchUnit 으로 기계 검증한다. 이 검증은 두 종류로 나눈다. 계약 타입의 형태 규칙은 후속 Task 이후에도 남기는 영구 규칙이다. "구현 클래스가 하나도 없다"는 폐쇄 규칙은 TSK-03-02 가 첫 구현을 넣을 때 지우는 임시 규칙이다(D2). 이 방식을 고른 이유는 세 가지다. 첫째, spec 수용 기준 두 줄을 모두 자동 테스트로 붙잡는다. 둘째, 스키마 사본이 하나뿐이라 어긋남이 다시 생길 자리가 없다. 셋째, 엔진 jar 의 의존 제약(PRD FR-E7·TRD §10)을 건드리지 않는다.

---

## 2. 변경 파일 목록

### 2.0 범위 가르기 — 초안 파일마다 누구 몫인가

| 초안 파일(`docs/mdm/engine-contract/…`) | 이 Task(TSK-03-01) | 후속 몫 |
|---|---|---|
| `java/…/spi/{DefinitionLookup,CodeLookup,CodeEffLookup,MasterLookup,FunctionProvider,EngineLookups}.java` | 복사. interface·record·enum·`NONE` 상수 그대로. 매핑 record 에 `@Nullable` 표지 추가(§6.3) | 구현체(원장·사본·값 테스트)는 mdm 서버와 하위 시스템 |
| `java/…/expr/{AstNode,EngineWarning,EngineEvaluationException,FunctionSets,ReservedNames}.java` | 복사. 매핑 record 에 `@Nullable` 추가 | 사용처는 TSK-03-02·03 |
| `java/…/expr/MdmExpressionConfig.java` | **모양을 바꿔 복사**: 고정값 14개를 `public static final` 상수로 두고, `baseBuilder()`·`create(EngineLookups)` 는 시그니처만 두고 둘 다 UOE 를 던진다(D1, §6.2) | 두 몸체는 TSK-03-02 |
| `java/…/code/CodeResolver.java` | 복사(interface + `CodeListEntry` record) | 구현은 TSK-03-02 |
| `java/…/rule/{RuleEngine,RuleResult,RuleSetResult,RuleView}.java` | 복사(interface·record·enum). `RuleEngine.text`·`textAndAst` default 위임은 유지(F14) | `RuleEngine` 구현·`RuleView.row(rowId)`(F15)는 TSK-03-03 |
| `java/…/domain/DomainValidator.java` | 복사(interface·record·enum) | 구현은 TSK-03-02 |
| `schema/engine-contract.schema.json` | 엔진 `src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` 으로 **복사한 뒤 고친다**. 모양(JSON 적합성)은 바꾸지 않고, 이름 끌어올리기·title·`RuleSetResult` 추가만 한다(D5, §6.4). 이 사본이 정본이다 | — |
| `ts/engine-contract.ts` | 옮기지 않는다. 생성 결과(`m-mdm/src/contract/engine-contract.generated.ts`)가 대신한다. 초안은 TSK-02-02 참고 자료로 남는다 | — |
| `samples/AstSampleExport.java`, `EvalExNullProbe.java`, `evalex-null-probe.txt` | 옮기지 않는다(TSK-02-02 조사 도구) | `AstExporter` 는 TSK-03-02 |
| `samples/sample-corpus.json` | 옮기지 않는다 | 코퍼스 배치·러너는 TSK-03-04 |
| `samples/validate.py`, `tscheck.sh` | 옮기지 않는다(TSK-02-02 검증 도구) | — |
| `docs/mdm/engine-contract.md` | 머리말에 "정본 이전" 한 줄만 더한다(D4). 본문은 고치지 않는다 | — |
| (초안 밖) 엔진 버전 상수(06:469) | 만들지 않는다. spec 요구사항에 없다 | TSK-03-03 이후(스냅샷 적재 쪽) |
| (초안 밖) JSON Schema 검증기로 실제 JSON 적합 검사 | 만들지 않는다. JSON 을 만드는 코드가 아직 없다(D6) | `AstExporter` 출력은 TSK-03-02, 코퍼스는 TSK-03-04 |

### 2.1 생성

경로 앞머리 `E` = `src/backend/maru-mdm-engine`, `M` = `src/frontend/m-mdm`, `J` = `E/src/main/java/kr/dongkuk/maru/mdm/engine`, `T` = `E/src/test/java/kr/dongkuk/maru/mdm/engine`.

| 파일 | 내용 |
|---|---|
| `J/spi/DefinitionLookup.java`, `CodeLookup.java`, `CodeEffLookup.java`, `MasterLookup.java`, `FunctionProvider.java`, `EngineLookups.java` | 초안 복사 + §6.3 표지 |
| `J/spi/Nullable.java` | 표지 annotation(§6.3, D3) |
| `J/expr/AstNode.java`, `EngineWarning.java`, `EngineEvaluationException.java`, `FunctionSets.java`, `ReservedNames.java` | 초안 복사 + §6.3 표지 |
| `J/expr/MdmExpressionConfig.java` | §6.2 모양 |
| `J/code/CodeResolver.java` | 초안 복사 |
| `J/rule/RuleEngine.java`, `RuleResult.java`, `RuleSetResult.java`, `RuleView.java` | 초안 복사 + §6.3 표지 |
| `J/domain/DomainValidator.java` | 초안 복사 |
| `E/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` | 스키마 정본(§6.4) |
| `T/arch/EnginePackageDependencyTest.java` | 패키지 의존 방향 5규칙(§3) |
| `T/arch/ContractTypeShapeTest.java` | 계약 타입 형태 영구 규칙(§3) |
| `T/arch/ContractOnlyPhaseTest.java` | 계약 전용 폐쇄 임시 규칙(§3). 클래스 Javadoc 에 "TSK-03-02 가 첫 구현을 넣는 커밋에서 이 클래스를 지운다"를 적는다 |
| `T/contract/EngineContractSchemaTest.java` | Java↔스키마 양방향 대조(§3, §6.5) |
| `T/contract/EngineContractConstantsTest.java` | 설정 고정값·함수 집합·예약 이름 고정(§3) |
| `M/scripts/gen-engine-contract.mjs` | TS 생성 스크립트(§6.6) |
| `M/src/contract/engine-contract.generated.ts` | 생성 결과(커밋 대상) |
| `M/tests/engine-contract.generated.test.ts` | 어긋남·단일 사본·export 목록 테스트(§3) |
| `M/.prettierignore` | `src/contract/engine-contract.generated.ts` 한 줄(포맷터가 생성물을 바꾸면 어긋남 테스트가 깨진다) |

### 2.2 수정

| 파일 | 변경 |
|---|---|
| `E/build.gradle` | `testImplementation 'com.fasterxml.jackson.core:jackson-databind:2.18.2'` 한 줄 추가(주석: 스키마 대조 전용, main 의존 아님). `testImplementation 'org.junit.jupiter:junit-jupiter-params'` 는 BOM 의 `junit-jupiter` 집합에 이미 들어 있으므로 추가하지 않는다. `@ParameterizedTest` import 가 안 풀리면 그때 BOM 버전 없이 추가한다 |
| `J/{spi,expr,rule,domain,code}/package-info.java` | Javadoc 의 "TSK-01-01 스캐폴드 단계 — 빈 골격" 문장을 "TSK-03-01 계약 전용 — interface·record·enum·상수만. 구현은 TSK-03-02·03" 취지로 바꾼다. 코드 변경 없음 |
| `M/package.json` | `devDependencies` 에 `"json-schema-to-typescript": "^16.0.0"`, `scripts` 에 `"gen:contract": "node scripts/gen-engine-contract.mjs"` |
| `M/src/index.ts` | `export {};` 를 `export type * from "./contract/engine-contract.generated";` 로 바꾸고 머리 주석을 갱신한다(§6.6) |
| `src/frontend/pnpm-lock.yaml` | `pnpm add` 결과(커밋 대상) |
| `docs/mdm/engine-contract.md` | 4행 「정본」 머리말 다음에 한 줄 추가: `> 정본 이전(TSK-03-01): JSON 모양의 정본은 src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json, Java 계약은 src/backend/maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/** 로 옮겼다. TS 타입은 @dk-oasis/m-mdm 이 그 스키마에서 생성한다. 이 폴더(engine-contract/)는 TSK-02-02 초안 원본으로 남긴다.`(D4) |

### 2.3 수정하지 않는 것(명시)

- `J/expr/ExpressionEvaluator.java`, `T/expr/ExpressionEvaluatorTest.java`, `T/arch/MaruMdmEngineArchitectureTest.java` — 스캐폴드와 기존 규칙은 그대로 둔다. `ExpressionEvaluator` 교체는 TSK-03-02 몫이다.
- `docs/mdm/engine-contract/**` 전체 — 바이트 동일로 둔다(mv·삭제·수정 금지).
- `mdm/lib/**`, `M/tests/tsup-entries.smoke.test.ts`, `M/tsup.config.ts`, `M/tsconfig.json`, `src/frontend/pnpm-workspace.yaml`.
- `docs/mdm/tasks/TSK-03-01/state.json`, `spec.md` — 커밋하지 않는다.

---

## 3. 테스트 전략

기준선: 백엔드 `testAll` 395건 실패 0(엔진 5건 포함), 프런트 m-mdm 1건 실패 0. 화면 작업이 아니므로 **브라우저 E2E 는 해당 없음**이다. 새 테스트를 먼저 쓰고, 계약 파일을 옮기기 전에 빨강(컴파일 실패 포함)을 확인한 뒤 구현한다.

### 3.1 백엔드 — 새 테스트 70건 (엔진 5 → 75, testAll 395 → 465)

모든 ArchUnit 테스트는 기존 테스트와 같은 import 를 쓴다: `new ClassFileImporter().withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS).importPackages("kr.dongkuk.maru.mdm.engine")`.

**`T/arch/EnginePackageDependencyTest.java` — 5건(영구)**

| 테스트 | 규칙(`noClasses().that().resideInAPackage(X).should().dependOnClassesThat().resideInAnyPackage(…)`) |
|---|---|
| `spi_는_EvalEx_와_다른_engine_패키지를_보지_않는다` | X=`..engine.spi..` → `com.ezylang..`, `..engine.code..`, `..engine.expr..`, `..engine.rule..`, `..engine.domain..` |
| `code_는_spi_만_보고_EvalEx_를_쓰지_않는다` | X=`..engine.code..` → `com.ezylang..`, `..engine.expr..`, `..engine.rule..`, `..engine.domain..` |
| `expr_는_rule_과_domain_을_보지_않는다` | X=`..engine.expr..` → `..engine.rule..`, `..engine.domain..` |
| `rule_은_domain_과_code_를_보지_않는다` | X=`..engine.rule..` → `..engine.domain..`, `..engine.code..` |
| `domain_은_rule_과_code_를_보지_않는다` | X=`..engine.domain..` → `..engine.rule..`, `..engine.code..` |

**`T/arch/ContractTypeShapeTest.java` — 5건(영구)**

테스트 안에 계약 타입 목록 `CONTRACT_TYPES`(§6.1 의 이름 있는 클래스 전부, 중첩 포함, FQN 문자열)를 둔다. 아래 규칙은 이 목록의 클래스에만 적용한다. 그래서 TSK-03-02·03 이 구현 클래스를 더해도 깨지지 않고, 계약 타입에 로직을 넣을 때만 깨진다.

| 테스트 | 검사 |
|---|---|
| `계약_타입은_interface_record_enum_annotation_상수홀더_예외뿐이다` | 각 클래스가 `isInterface()`(annotation 포함) ∨ `isRecord()` ∨ `isEnum()` ∨ 상수 홀더 ∨ `EngineEvaluationException` 중 하나다 |
| `상수_홀더는_final_이고_생성자가_private_이며_필드가_static_final_이다` | 상수 홀더 = `FunctionSets`, `ReservedNames`, `MdmExpressionConfig`. `FINAL` 수정자, 모든 생성자 `PRIVATE`, 모든 필드 `STATIC`+`FINAL` |
| `계약_record_는_접근자와_equals_hashCode_toString_외_메서드가_없다` | record 의 선언 메서드 이름 ⊆ 컴포넌트 이름 ∪ {`equals`,`hashCode`,`toString`}. `RuleView.row` 같은 몸체 메서드를 막는다 |
| `계약_record_생성자는_Record_생성자만_부른다` | record 생성자의 `getMethodCallsFromSelf()` 가 비어 있고 `getConstructorCallsFromSelf()` 의 대상이 `java.lang.Record.<init>` 뿐이다(compact 생성자 로직 금지) |
| `계약_interface_의_몸체_있는_메서드는_RuleEngine_text_textAndAst_뿐이다` | 계약 interface 들의 메서드 중 `ABSTRACT` 가 아니고 `SYNTHETIC` 도 아닌 것(static 초기화 블록 제외)의 집합 = {`RuleEngine.text`, `RuleEngine.textAndAst`} |

**`T/arch/ContractOnlyPhaseTest.java` — 5건(임시, TSK-03-02 가 지운다)**

| 테스트 | 검사 |
|---|---|
| `main_클래스_집합이_계약_타입과_스캐폴드로_닫혀_있다` | main 클래스 전체(package-info 제외) = `CONTRACT_TYPES` ∪ {`expr.ExpressionEvaluator`} ∪ {익명 클래스이면서 둘러싼 클래스가 spi 의 계약 interface 인 것 = `MasterLookup$1`}. **양방향**: 더해진 클래스도, 빠진 클래스도 실패. `CONTRACT_TYPES` 는 `ContractTypeShapeTest` 의 것을 공유한다(같은 패키지 package-private 상수) |
| `MdmExpressionConfig_의_메서드는_UnsupportedOperationException_만_던진다` | `MdmExpressionConfig` 의 메서드(생성자·static 초기화 제외)마다 `getMethodCallsFromSelf()` 가 비어 있고 `getConstructorCallsFromSelf()` 대상이 `UnsupportedOperationException.<init>` 뿐이다. 메시지는 문자열 리터럴 하나여야 한다(연결 연산은 invokedynamic 이 된다) |
| `EvalEx_실행_타입은_스캐폴드_ExpressionEvaluator_만_쓴다` | `ExpressionEvaluator` 를 뺀 main 클래스는 `com.ezylang..` 중 `com.ezylang.evalex.config.ExpressionConfiguration` 과 `ExpressionConfiguration$ExpressionConfigurationBuilder` 에만 의존한다(시그니처 반환 타입) |
| `baseBuilder_는_UnsupportedOperationException_을_던진다` | `assertThrows(UnsupportedOperationException.class, MdmExpressionConfig::baseBuilder)` |
| `create_는_UnsupportedOperationException_을_던진다` | `assertThrows(…, () -> MdmExpressionConfig.create(null))` |

**`T/contract/EngineContractSchemaTest.java` — 46건(영구)**

스키마는 `EngineContractSchemaTest.class.getResourceAsStream("/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json")` 로 읽고 Jackson `ObjectMapper.readTree` 로 파싱한다. 대응표와 판정 알고리즘은 §6.5 에 있다.

| 테스트 | 건수 |
|---|---|
| `@ParameterizedTest` `enum_상수_집합이_스키마와_같다` — E1~E8 | 8 |
| `@ParameterizedTest` `record_컴포넌트_이름이_스키마_속성과_같다` — R1~R11 | 11 |
| `@ParameterizedTest` `Nullable_표지가_스키마의_선택_또는_null_허용과_같다` — R1~R11 | 11 |
| `@ParameterizedTest` `record_컴포넌트_타입_종류가_스키마와_맞는다` — R1~R11 | 11 |
| `CellOp_는_op_네_묶음의_합집합이고_묶음끼리_겹치지_않는다` | 1 |
| `모든_defs_는_Java_대응이_있거나_스키마_전용_목록에_있다` | 1 |
| `expr_rule_패키지의_record_enum_은_스키마_대응이_있거나_Java_전용_목록에_있다` | 1 |
| `모든_ref_는_defs_안에서_풀린다` | 1 |
| `스키마는_2020_12_이고_title_이_EngineContract_다` | 1 |

**`T/contract/EngineContractConstantsTest.java` — 9건(영구)**

| 테스트 | 검사 |
|---|---|
| `설정_고정값이_06_442_와_같다` | `assertAll` 로 §6.2 상수 14개 값 전부 |
| `STANDARD_는_BASE_와_MDM_의_서로소_합집합이다` | `STANDARD == BASE ∪ MDM`, `BASE ∩ MDM = ∅`, `BASE.size()==24`, `MDM == {INSTR, MASTER, MASTER_AT}` |
| `GENERATED_는_STANDARD_의_부분집합이다` | `GENERATED ⊆ STANDARD`, `GENERATED == {STR_MATCHES, STR_STARTS_WITH, STR_ENDS_WITH, INSTR, MASTER}` |
| `제외_함수는_STANDARD_에_없다` | `DT_NOW, DT_TODAY, RANDOM, STR_FORMAT, STR_SPLIT, LOG, LOG10, FACT, SIN, COS, TAN` 가 없다 |
| `BASE_는_EvalEx_3_7_0_표준_사전에_모두_있다` | `ExpressionConfiguration.defaultConfiguration().getFunctionDictionary().hasFunction(n)` (test 에서만 EvalEx 를 부른다) |
| `MDM_함수는_EvalEx_표준_사전에_없다` | 위 사전에서 `INSTR`·`MASTER`·`MASTER_AT` 가 false |
| `CONSTANTS_는_EvalEx_표준_상수와_같다` | `ReservedNames.CONSTANTS` == `ExpressionConfiguration.StandardConstants.keySet()`(대문자로 맞춰 비교) |
| `예약_키_상수가_06_422_424_와_같다` | `EVAL_TS="EVAL_TS"`, `RESERVED_PREFIX="_"`, `EXPR_VAR_PREFIX="_V"`, `DOMAIN_VALUE="value"` |
| `Slot_표지는_DOMAIN_BIZ_만_비즈니스_함수_DOMAIN_STD_만_value_전용이다` | `FunctionSets.Slot` 6개 값의 두 boolean |

### 3.2 프런트 — 새 테스트 5건 (m-mdm 1 → 6)

**`M/tests/engine-contract.generated.test.ts`** — 생성 스크립트가 export 한 함수·경로를 그대로 쓴다. 파일 단위 timeout 은 30 초(`{ timeout: 30_000 }`, prettier 포함 생성이 수 초 걸린다).

| 테스트 | 검사 |
|---|---|
| `스키마로 다시 생성한 결과가 커밋된 생성 파일과 같다` | `await generateEngineContract()` === `readFileSync(OUTPUT_PATH, "utf8")` |
| `생성 스크립트는 엔진 resources 의 스키마 정본을 읽는다` | `SCHEMA_PATH` === `path.resolve(__dirname, "../../../backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json")` 이고 파일이 있다 |
| `m-mdm 안에 스키마 사본이 없다` | `node_modules`·`dist` 를 뺀 m-mdm 트리에 `*.schema.json` 이 0개다 |
| `생성 파일의 export 이름이 설계 목록과 같다` | `/^export (?:type\|interface) (\w+)/gm` 로 뽑은 이름 집합 == §6.4 「생성 TS export 목록」 |
| `index.ts 가 생성 파일을 타입으로 재수출한다` | `src/index.ts` 에 `export type * from "./contract/engine-contract.generated";` 가 있다 |

### 3.3 게이트 명령과 번들 확인

```bash
# 백엔드 — 465건 실패 0 기대
cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon
# 엔진만 빠르게
cd src/backend/maru-mdm-engine && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew test --no-daemon

# 프런트 — 6건 실패 0, lint 통과 기대
cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test && pnpm --filter @dk-oasis/m-mdm lint
# 번들 확인(테스트가 아니라 Build·Verify 가 눈으로 확인하고 결과를 보고에 적는다)
grep -cE "AstNode|RuleResult|CellJson" src/frontend/m-mdm/dist/index.d.ts   # 1 이상
grep -vE "^\s*$|sourceMappingURL" src/frontend/m-mdm/dist/index.js | wc -l   # 0 기대(런타임 코드 없음)
```

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 검증 방법 |
|---|---|
| 실행 로직 없음 (contract-only) | ① `ContractOnlyPhaseTest` — main 클래스가 계약 타입과 스캐폴드로 닫혀 있고, `MdmExpressionConfig` 메서드는 UOE 만 던지며, EvalEx 실행 타입(`Expression`·파서·함수)은 스캐폴드만 쓴다 ② `ContractTypeShapeTest` — 계약 타입이 interface·record·enum·상수 홀더·예외뿐이고 record·interface 에 몸체 메서드가 없다(허용 예외 3건은 §6.1) ③ 프런트는 `dist/index.js` 에 런타임 코드가 없다(§3.3) |
| Java·TS 타입이 같은 JSON 스키마에서 나온다 | ① 스키마 파일은 엔진 resources 한 벌이다(프런트 테스트 2·3) ② TS 는 그 파일에서 생성되고 커밋본과 같다(프런트 테스트 1·4) ③ Java record·enum 은 같은 파일의 `$defs` 와 이름·집합·필수/null·타입 종류가 양방향으로 같다(`EngineContractSchemaTest` 46건) ④ 대응 없는 `$defs`·Java 타입은 사유가 적힌 목록에 있어야 한다(적용 범위 검사 2건) |
| (요구사항) engine.spi 인터페이스 | `spi` 6개 파일 + `EnginePackageDependencyTest` 의 spi 격리 규칙 |
| (요구사항) EvalEx 설정 팩토리 시그니처 | `MdmExpressionConfig.baseBuilder()`·`create(EngineLookups)` 시그니처 + 고정값 상수(`EngineContractConstantsTest`) |
| (요구사항) AST JSON 스키마 타입 | Java `AstNode`(E1~E3, R1) ↔ 스키마 `AstNode` ↔ TS `AstNode` |
| (요구사항) MASTER/MASTER_AT/CODE_LIST 함수 시그니처 | `CodeResolver`(`isMember`·`attr`·`codeList`·`CodeListEntry`), `MasterLookup`, `FunctionSets.MDM` 고정 테스트. 식 함수 시그니처(인자 수·형태)는 `engine-contract.md` §7 이 문서 계약이고 `AbstractFunction` 구현은 TSK-03-02 다 |
| (요구사항) 판정 결과 타입(적중 row_id·seq, 첫 거짓 셀, 경고) | `RuleResult.Hit(rowId, seq, …)`, `RowTrace.firstFalseVarId`, `EngineWarning` ↔ 스키마 `RuleHit`·`RowTrace`·`EngineWarning`(R7~R10) |
| (요구사항) JS 평가기와 공유할 AST·셀 구조 TS 타입 | 생성 TS 의 `AstNode`·`CellJson`·`CellOp`·`TypedValue`·코퍼스 타입, `@dk-oasis/m-mdm` 배럴에서 export |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

각 항목은 "변이 → 빨강이 되는 테스트"로 적는다. Build·Verify 는 이 표를 순회해 변이를 넣고 빨강을 확인한 뒤 되돌린다.

| # | 불변 규칙 | 넣을 변이 → 빨강이 되는 테스트 |
|---|---|---|
| I1 | spi 는 EvalEx 타입과 다른 engine 패키지를 보지 않는다(06:461·463) | `FunctionProvider.Body.apply` 인자를 `List<com.ezylang.evalex.data.EvaluationValue>` 로 → `spi_는_EvalEx_와…`. `DefinitionLookup` 에서 `expr.FunctionSets.Slot` 을 참조 → 같은 테스트 |
| I2 | 패키지 의존 방향(06:463): code→spi 만, expr→spi·code, rule·domain→expr·spi, rule↮domain, domain↛code | `CodeResolver` 가 `expr.ReservedNames` 참조 → `code_는…`. `EngineWarning` 이 `rule.RuleResult` 참조 → `expr_는…`. `RuleResult` 가 `code.CodeResolver.CodeListEntry` 참조 → `rule_은…`. `DomainValidator` 가 `rule.RuleResult` 참조 → `domain_은…` |
| I3 | 기존 엔진 규칙 1·2(main 은 EvalEx·java 표준만, DB·네트워크 금지)가 그대로 통과한다 | main 계약 파일에 `java.io.File` 참조 → 기존 `engine_은_EvalEx_와_java_표준_외에…`. `java.sql.Timestamp` 참조 → 기존 규칙 2 |
| I4 | 계약 타입은 interface·record·enum·annotation·상수 홀더·`EngineEvaluationException` 뿐이다 | `CodeResolver` 를 `abstract class` 로 → `계약_타입은…` |
| I5 | 상수 홀더는 final·private 생성자·static final 필드만 | `FunctionSets` 에서 `final` 제거 또는 `public static Set<String> EXTRA` (non-final) 추가 → `상수_홀더는…` |
| I6 | 계약 record 에 몸체 메서드·생성자 로직이 없다 | `RuleView` 에 `row(int rowId)` 추가 → `계약_record_는_접근자와…`. `RuleResult` 에 `hits = List.copyOf(hits)` compact 생성자 추가 → `계약_record_생성자는…` |
| I7 | 계약 interface 의 몸체 메서드는 `RuleEngine.text`·`textAndAst` 뿐이다 | `DomainValidator` 에 default 메서드 추가 → `계약_interface_의…`. `RuleEngine.text` 를 abstract 로 바꿈 → 같은 테스트(집합이 달라짐) |
| I8 | (임시) main 클래스 집합이 계약 타입 + 스캐폴드 + `MasterLookup$1` 로 닫혀 있다 | `rule/SimpleRuleEngine implements RuleEngine` 추가 → `main_클래스_집합이…`. `CodeResolver.java` 삭제 → 같은 테스트(빠진 쪽). `ExpressionEvaluator` 삭제 → 같은 테스트 + `ExpressionEvaluatorTest` 컴파일 실패 |
| I9 | (임시) `MdmExpressionConfig.baseBuilder()`·`create()` 는 UOE 만 던진다 | `baseBuilder()` 에 초안 빌더 체인 복원 → `MdmExpressionConfig_의_메서드는…` + `baseBuilder_는…`. `create` 가 `baseBuilder().build()` 반환 → 두 테스트 |
| I10 | (임시) EvalEx 실행 타입은 스캐폴드만 쓴다 | `MdmExpressionConfig.create` 에서 `new com.ezylang.evalex.Expression("1")` → `EvalEx_실행_타입은…` |
| I11 | 스캐폴드 `ExpressionEvaluator`·그 테스트·`MaruMdmEngineArchitectureTest` 는 바이트 동일 | 자동 테스트 없음. Verify 가 `git diff main -- <세 파일>` 이 비어 있는지 본다(덮지 못하는 변이로 보고) |
| I12 | Java enum·상수 집합 = 스키마 enum(E1~E8) | `EngineEvaluationException.Code` 에 `TIMEOUT` 추가 → `enum_상수_집합이…[E5]`. 스키마 `InfixOperator` 에서 `"<>"` 제거 → `[E2]`. 스키마 `ExprSlot` 에 값 추가 → `[E8]` |
| I13 | record 컴포넌트 이름 = 스키마 속성 이름(R1~R11, 양방향) | `Violation.name` 을 `varName` 으로 → `record_컴포넌트_이름이…[R6]`. 스키마 `RuleHit` 에 `note` 속성 추가 → `[R9]` |
| I14 | `@Nullable` ⇔ (스키마에서 required 아님 ∨ null 허용) | `EngineWarning.ruleId` 의 `@Nullable` 제거 → `Nullable_표지가…[R7]`. 스키마 `RuleResult.required` 에서 `ruleId` 제거 → `[R8]`. 스키마 `RuleHit.rowId` 타입에 `"null"` 추가 → `[R9]` |
| I15 | 컴포넌트 타입 종류가 스키마와 맞는다(§6.5 표) | `RowTrace.seq` 를 `String` 으로 → `record_컴포넌트_타입_종류가…[R10]` |
| I16 | 모든 `$defs` 는 대응이 있거나 스키마 전용 목록에, expr·rule 의 record·enum 은 대응이 있거나 Java 전용 목록에 있다 | 스키마에 `$defs/Foo` 추가 → `모든_defs_는…`. `rule` 에 `record Bar(int x)` 추가 → `expr_rule_패키지의…`(+ I8) |
| I17 | `CellOp` = `NoValueOp ∪ SingleValueOp ∪ ListOp ∪ RangeOp`, 묶음끼리 서로소 | `CellOp` 에만 `"BETWEEN"` 추가 → `CellOp_는…`. `"IN"` 을 `SingleValueOp` 에도 추가 → 같은 테스트(겹침) |
| I18 | 스키마 내부 `$ref` 가 전부 풀린다, `$schema` 2020-12, title `EngineContract` | `"$ref": "#/$defs/Nope"` → `모든_ref_는…`. title 변경 → `스키마는_2020_12…` + 프런트 export 목록 테스트(루트 인터페이스 이름) |
| I19 | 설정 고정값(06:442, TSK-02-02 §4 표) | `MATH_CONTEXT` precision 34 → `설정_고정값이…`. `ALLOW_OVERWRITE_CONSTANTS=true` → 같은 테스트. `ZONE=UTC` → 같은 테스트 |
| I20 | 함수 집합: `STANDARD = BASE ∪ MDM`, `GENERATED ⊆ STANDARD`, 제외 함수 없음, BASE 는 EvalEx 표준 사전 안, MDM 은 밖 | `BASE` 에 `DT_NOW` 추가 → `제외_함수는…`(+ `STANDARD_는…` 크기). `STANDARD` 에서 `INSTR` 제거 → `STANDARD_는…`. `BASE` 에 `FOO` → `BASE_는_EvalEx…` |
| I21 | 예약 이름: 상수 8종 = EvalEx 표준 상수, `EVAL_TS`·`_`·`_V`·`value` | `CONSTANTS` 에서 `PI` 제거 → `CONSTANTS_는…`. `EXPR_VAR_PREFIX="_X"` → `예약_키_상수가…` |
| I22 | Slot 표지(06:443·EG §7) | `RULE_COND_EXPR(true, false)` → `Slot_표지는…` |
| I23 | TS 생성물 = 스키마에서 다시 생성한 결과 | 생성 파일 한 줄 손수정 → 프런트 `스키마로 다시 생성한…`. 스키마만 고치고 재생성 안 함 → 같은 테스트 |
| I24 | 스키마 사본은 엔진 resources 한 벌 | 스키마를 `M/src/contract/` 에 복사 → `m-mdm 안에 스키마 사본이 없다`. `SCHEMA_PATH` 를 docs 초안으로 → `생성 스크립트는…` |
| I25 | 생성 TS export 이름 목록(§6.4) | 스키마 `RuleHit` 를 `Hit` 로 개명 후 재생성 → 프런트 `생성 파일의 export 이름이…`(+ Java R9) |
| I26 | 배럴이 생성 타입을 재수출하고 런타임 코드를 내지 않는다 | `index.ts` 의 재수출 제거 → 프런트 `index.ts 가 생성 파일을…`. `export *` 로 바꿔 런타임 코드 발생 여부는 §3.3 번들 확인으로만 본다(자동 테스트 없음) |
| I27 | docs 초안(`docs/mdm/engine-contract/**`)은 바이트 동일 | 자동 테스트 없음. Verify 가 `git diff main -- docs/mdm/engine-contract/` 가 비어 있는지 본다 |

---

## 6. 상세 설계

### 6.1 계약 타입 목록(`CONTRACT_TYPES`)과 허용 예외

이름 있는 main 클래스 전부다(FQN 은 `kr.dongkuk.maru.mdm.engine.` 뒤만 적는다. 중첩은 `$`).

- spi: `DefinitionLookup`, `$ColumnDefinition`, `$CodeRef`, `$DomainKind`, `$DataType`, `$RuleDefinition`, `$RuleKind`, `$HitPolicy`, `$VarKind`, `$DispType`, `$CollectAgg`, `$RuleVar`, `$RowKind`, `$RuleRow`, `$RuleCell`, `$InputContract`, `$RowContract`, `$VarType`, `$RuleSetDefinition`, `$SetStatus` · `CodeLookup`, `$CodeRows`, `$CodeHeader`, `$CodeVersionRow`, `$CodeItemRow`, `$CodeCateRow`, `$CodeCateItemRow` · `CodeEffLookup` · `MasterLookup` · `FunctionProvider`, `$BusinessFunction`, `$Param`, `$Body` · `EngineLookups` · `Nullable`
- expr: `AstNode`, `$Type` · `EngineWarning`, `$Code` · `EngineEvaluationException`, `$Stage`, `$Code`, `$Violation` · `FunctionSets`, `$Slot` · `ReservedNames` · `MdmExpressionConfig`
- code: `CodeResolver`, `$CodeListEntry`
- rule: `RuleEngine`, `$Part` · `RuleResult`, `$Hit`, `$RowTrace` · `RuleSetResult` · `RuleView`, `$ColumnView`, `$RowView`, `$CellView`
- domain: `DomainValidator`, `$ValidationResult`, `$Failure`, `$Step`

Build 는 이 목록을 옮긴 뒤 실제 `javac` 결과(`build/classes/java/main`)와 한 번 대조한다. 목록과 실물이 다르면 실물이 아니라 목록 쪽 오기인지 확인하고, 이탈을 design.md 에 추기한다.

**허용 예외 3건(명시)** — 없애거나 바꾸면 어느 테스트가 반응하는지 함께 적는다.

| 예외 | 왜 허용하나 | 제거·변경 시 |
|---|---|---|
| `EngineEvaluationException` 생성자 로직(`List.copyOf`, 첫 위반 메시지 고르기) | 예외 타입은 class 여야 하고, 위반 목록을 불변으로 싣는 것은 값 운반이지 판정 로직이 아니다 | 이 클래스를 `CONTRACT_TYPES` 에서 빼면 `main_클래스_집합이…` 빨강 |
| `MasterLookup$1`(`MasterLookup.NONE` 익명 클래스, 늘 false·빈 값) | 원천·초안이 정한 null 객체 상수다. 추상 메서드가 둘이라 람다로 바꿀 수 없다 | 익명 클래스를 spi interface 밖(예: `FunctionSets`)에 만들면 `main_클래스_집합이…` 빨강 |
| `RuleEngine.text`·`textAndAst` default 위임 | 원천 06:480 이 `view(…, EnumSet.of(TEXT))` 위임으로 정의했다 | 다른 default 메서드를 더하면 `계약_interface_의…` 빨강 |

`CodeEffLookup.NONE` 람다가 만드는 synthetic `lambda$static$0` 과 `FunctionProvider.NONE`(메서드 참조)은 `SYNTHETIC` 수정자로 걸러지거나 클래스가 생기지 않아 규칙 대상이 아니다. enum 의 `values`·`valueOf`·`$values` 와 `FunctionSets.Slot` 의 생성자·접근자는 enum 이라 형태 규칙(record·interface 규칙) 대상이 아니다.

### 6.2 `MdmExpressionConfig` 모양 (D1)

```java
public final class MdmExpressionConfig {
    public static final MathContext MATH_CONTEXT = new MathContext(68, RoundingMode.HALF_EVEN);
    public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    public static final Locale LOCALE = Locale.ROOT;
    public static final int REGEX_TIMEOUT_MILLIS = 100;
    public static final int MAX_RECURSION_DEPTH = 2000;
    public static final boolean ALLOW_OVERWRITE_CONSTANTS = false;
    public static final boolean LENIENT_MODE = false;
    public static final boolean ARRAYS_ALLOWED = false;
    public static final boolean STRUCTURES_ALLOWED = false;
    public static final boolean IMPLICIT_MULTIPLICATION_ALLOWED = false;
    public static final boolean SINGLE_QUOTE_STRING_LITERALS_ALLOWED = false;
    public static final boolean BINARY_ALLOWED = false;
    public static final boolean STRIP_TRAILING_ZEROS = true;
    public static final int DECIMAL_PLACES_ROUNDING = ExpressionConfiguration.DECIMAL_PLACES_ROUNDING_UNLIMITED;

    private MdmExpressionConfig() {}

    /** 함수 사전을 뺀 고정 설정 — 위 상수를 빌더에 그대로 넣는다(TSK-03-02 구현). */
    public static ExpressionConfiguration.ExpressionConfigurationBuilder baseBuilder() {
        throw new UnsupportedOperationException("TSK-03-02 에서 구현한다");
    }

    /** 엔진 설정 — baseBuilder() + 함수 사전(STANDARD ∪ 비즈니스 함수). */
    public static ExpressionConfiguration create(EngineLookups lookups) {
        throw new UnsupportedOperationException("TSK-03-02 에서 구현한다");
    }
}
```

- 각 상수 Javadoc 에 초안 `engine-contract.md` §4 표의 근거(06:442, 06:197·199, D1 등)와 대응 빌더 메서드 이름(F14: `allowOverwriteConstants`, `lenientMode`, … `decimalPlacesRounding`)을 적는다. TSK-03-02 는 빌더 메서드 하나에 상수 하나를 넣으면 된다.
- `dataAccessorSupplier` 는 기본값을 바꾸지 않으므로 상수가 없다. `functionDictionary` 는 `create` 몸체 몫이다.
- `DECIMAL_PLACES_ROUNDING_UNLIMITED` 는 컴파일 시 상수라 바이트코드에 EvalEx 참조가 남지 않을 수 있다. 남더라도 `ExpressionConfiguration` 은 I10 허용 목록 안이다.

### 6.3 `@Nullable` 표지 (D3)

```java
package kr.dongkuk.maru.mdm.engine.spi;
/** 이 값은 null 일 수 있다(JSON 에서는 키가 빠지거나 null). 엔진 테스트가 스키마 required·null 허용과 대조한다. */
@Documented
@Retention(RetentionPolicy.RUNTIME)
@Target({ElementType.RECORD_COMPONENT, ElementType.PARAMETER, ElementType.METHOD})
public @interface Nullable {}
```

- spi 에 두는 이유: 모든 패키지가 spi 를 볼 수 있어 의존 방향(I1·I2)을 어기지 않는다. `java.lang.annotation` 은 `java.lang..` 라 기존 규칙 1 허용 목록 안이다.
- **표지를 다는 곳은 스키마 대응 record(R1~R11)뿐이다.** 다른 record·interface 인자는 이번에 달지 않는다(검사 대상이 아닌 표지는 표류한다).
- 달 컴포넌트(스키마 기준으로 도출한 결과, Build 는 테스트가 알려 주는 대로 맞춘다):
  - `RuleCell`: `op, left, right, list, expr, ast, val` 7개(`CellJson` 유니온에서 어느 속성도 모든 변형에서 필수가 아니다). `text` 는 Java 전용 추가 컴포넌트라 검사 밖이고 표지를 달지 않는다.
  - `VarType`: `scale`, `domainId`
  - `Violation`: `ruleId`, `rowId`, `name`
  - `EngineWarning`: `ruleId`, `rowId`, `varId`
  - `RowTrace`: `firstFalseVarId`
  - `AstNode`, `RowContract`, `InputContract`, `RuleResult`, `Hit`, `RuleSetResult`: 없음

### 6.4 스키마 정본 (D4·D5)

- **위치**: `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`. main resources 라 엔진 jar 에 함께 실린다(하위 시스템도 같은 스키마를 jar 에서 읽을 수 있다). 엔진 테스트는 classpath 로, m-mdm 스크립트는 상대경로로 **같은 파일**을 읽는다.
- **만드는 법**: `cp docs/mdm/engine-contract/schema/engine-contract.schema.json <위치>` 뒤 아래 표만 고친다. 모양(어떤 JSON 이 통과·거부되는가)은 `RuleSetResult` 추가 외에는 바꾸지 않는다.

| # | 초안 | 엔진 정본 |
|---|---|---|
| S1 | `title`: `maru-mdm-engine 공유 계약 (초안, TSK-02-02)` | `title`: `EngineContract`(TS 루트 이름이 된다, F9). `description` 첫 문장에 "정본 위치 = 이 파일(TSK-03-01). 원본 초안은 docs/mdm/engine-contract/schema/" 를 더한다. `$id` 는 그대로 |
| S2 | `AstInfix.value.enum` 인라인 16종 | `$defs/InfixOperator` 로 끌어올리고 `$ref` |
| S3 | `AstPrefix.value.enum` 인라인 3종 | `$defs/PrefixOperator` |
| S4 | `CellJson` 변형의 `op.enum` 인라인 4묶음 | `$defs/NoValueOp`(`NA, IS_NULL, NOT_NULL`), `$defs/SingleValueOp`(`EQ, NE, LT, LE, GT, GE, CODE_IN, CONTAINS, INSTR`), `$defs/ListOp`(`IN, NOT_IN`), `$defs/RangeOp`(범위 4종). `$defs/CellOp` 는 초안 그대로 전체 enum 을 유지한다(I17 이 합집합을 확인) |
| S5 | `ExprCase.slot.enum` 인라인 | `$defs/ExprSlot` |
| S6 | `InputContract.rows.items` 인라인 | `$defs/RowContract` |
| S7 | `RuleResult.hits.items`, `trace.items`, `warnings.items`, `warnings.items.code.enum` 인라인 | `$defs/RuleHit`, `$defs/RowTrace`, `$defs/EngineWarning`, `$defs/EngineWarningCode` |
| S8 | `EngineError.violations.items`, `…stage.enum` 인라인 | `$defs/Violation`, `$defs/ViolationStage` |
| S9 | (없음) | `$defs/RuleSetResult` 추가: `{type: object, properties: {setId: string, evalTs: $ref LocalDateTime, steps: array of $ref RuleResult, finalValues: object additionalProperties $ref TypedValue}, required: [4개 전부], additionalProperties: false}`. Java `RuleSetResult` 와 짝(D5) |

- **생성 TS export 목록**(프런트 테스트 4 가 고정한다, 39개): `EngineContract`(루트, 인덱스 시그니처), `AstNode`, `AstNumberLiteral`, `AstStringLiteral`, `AstVariable`, `AstPrefix`, `AstInfix`, `AstFunction`, `InfixOperator`, `PrefixOperator`, `DataType`, `TypedValue`, `CellOp`, `NoValueOp`, `SingleValueOp`, `ListOp`, `RangeOp`, `CellJson`, `ErrorCode`, `CorpusFile`, `CorpusCase`, `ExprCase`, `ExprSlot`, `CellCase`, `CodeSets`, `Expect`, `LocalDateTime`, `VarType`, `RowContract`, `InputContract`, `RuleResult`, `RuleHit`, `RowTrace`, `EngineWarning`, `EngineWarningCode`, `RuleSetResult`, `EngineError`, `Violation`, `ViolationStage`. 실제 생성 결과가 이 목록과 다르면(예: 생성기가 이름을 바꿈) 스키마를 고쳐 맞추고, 못 맞추면 목록을 고치고 design.md 에 추기한다.
- 초안 `ts/engine-contract.ts` 와 이름 차이: `RangeOp`·`SingleValueOp`·`InfixOperator` 는 같은 이름으로 나온다. 초안의 인라인 `Hit` 류는 `RuleHit`·`RowTrace` 로 이름이 생긴다.

### 6.5 Java ↔ 스키마 대응표와 판정 알고리즘

**enum·상수 집합(E)**

| # | Java | 스키마 |
|---|---|---|
| E1 | `AstNode.Type` 상수 이름 | `$defs/AstNode.oneOf[*]` 를 `$ref` 로 풀어 `properties.type.const` 모은 집합 |
| E2 | `AstNode.INFIX_OPERATORS` | `$defs/InfixOperator.enum` |
| E3 | `AstNode.PREFIX_OPERATORS` | `$defs/PrefixOperator.enum` |
| E4 | `DefinitionLookup.DataType` | `$defs/DataType.enum` |
| E5 | `EngineEvaluationException.Code` | `$defs/ErrorCode.enum` |
| E6 | `EngineEvaluationException.Stage` | `$defs/ViolationStage.enum` |
| E7 | `EngineWarning.Code` | `$defs/EngineWarningCode.enum` |
| E8 | `FunctionSets.Slot` | `$defs/ExprSlot.enum` |

**record(R)**

| # | Java record | 스키마 | 예외 |
|---|---|---|---|
| R1 | `expr.AstNode` | `$defs/AstNode`(유니온) | `params`: Java 는 빈 목록(null 아님), JSON 은 자식이 없으면 키를 뺀다(AstExporter 규칙). 표지 규칙에서 제외 |
| R2 | `spi.DefinitionLookup.RuleCell` | `$defs/CellJson`(유니온) | `text` 는 Java 전용 컴포넌트(스냅샷 생성 텍스트, 06:1164). 이름 대조에서 제외 |
| R3 | `spi.DefinitionLookup.VarType` | `$defs/VarType` | |
| R4 | `spi.DefinitionLookup.RowContract` | `$defs/RowContract` | |
| R5 | `spi.DefinitionLookup.InputContract` | `$defs/InputContract` | |
| R6 | `expr.EngineEvaluationException.Violation` | `$defs/Violation` | |
| R7 | `expr.EngineWarning` | `$defs/EngineWarning` | |
| R8 | `rule.RuleResult` | `$defs/RuleResult` | |
| R9 | `rule.RuleResult.Hit` | `$defs/RuleHit` | |
| R10 | `rule.RuleResult.RowTrace` | `$defs/RowTrace` | |
| R11 | `rule.RuleSetResult` | `$defs/RuleSetResult` | |

**판정 알고리즘**(테스트 헬퍼로 구현)

1. def 해석: `$ref` 를 따라간다. def 에 `oneOf` 가 있으면 변형마다 `$ref` 를 풀어 **유니온 뷰**를 만든다 — 속성 = 변형 속성의 합집합, required = 모든 변형에서 required 인 속성, null 허용 = 어느 변형이든 그 속성 `type` 배열에 `"null"` 이 있음.
2. 이름: `Class.getRecordComponents()` 이름 집합 − 예외 = 스키마 속성 집합(양방향, 차집합을 메시지에 찍는다).
3. 표지: 대조 컴포넌트마다 `component.isAnnotationPresent(Nullable.class)` ⇔ (속성 ∉ required ∨ null 허용). primitive 컴포넌트에 표지가 있으면 실패.
4. 타입 종류: 속성 스키마를 `$ref` 로 풀고 종류를 정한다 — `type` 이 있으면 `"null"` 이 아닌 첫 값, 없고 `const`·`enum` 이면 `string`(값이 모두 문자열일 때), `oneOf` 면 첫 변형의 종류. Java 쪽 허용 타입:

| 스키마 종류 | Java 타입 |
|---|---|
| `string` | `String`, enum, `java.time.Instant`·`LocalDateTime`(`$ref LocalDateTime` 일 때만) |
| `integer` | `int`, `Integer` |
| `boolean` | `boolean`, `Boolean` |
| `array` | `java.util.List` |
| `object` | `java.util.Map`, record |

   `RuleResult.evalTs`·`RuleSetResult.evalTs` 는 Java `Instant`, 스키마 `LocalDateTime`(KST 벽시계 문자열)이다. 엔진은 `Map`·record 를 돌려주고 JSON 직렬화는 호출자 몫(06:467)이라, 직렬화 층이 `MdmExpressionConfig.ZONE` 으로 바꾼다. 이 대응을 테스트 표에 사유 주석과 함께 둔다.

**대응으로 세는 `$defs`**: E1~E8·R1~R11 이 가리키는 정의(`InfixOperator`·`PrefixOperator` 는 Java 쪽이 enum 이 아니라 `Set<String>` 상수지만 E2·E3 대응으로 센다).

**스키마 전용 목록**(대응 Java 없음, 사유를 테스트 상수 옆 주석에 적는다): `AstNumberLiteral`·`AstStringLiteral`·`AstVariable`·`AstPrefix`·`AstInfix`·`AstFunction`(R1 유니온 뷰로 대조), `TypedValue`(Java 값은 `Object`, 직렬화는 호출자), `CellOp`·`NoValueOp`·`SingleValueOp`·`ListOp`·`RangeOp`(Java `RuleCell.op` 는 `String`, op 해석은 TSK-03-03 생성기), `CorpusFile`·`CorpusCase`·`ExprCase`·`CellCase`·`CodeSets`·`Expect`(코퍼스, TSK-03-04 러너), `LocalDateTime`(형식), `EngineError`(예외 래퍼, 내용은 R6 으로 대조).

**Java 전용 목록**(expr·rule 패키지의 record·enum 중 스키마 대응 없음): `rule.RuleView`·`$ColumnView`·`$RowView`·`$CellView`(정의 조회 JSON 은 서버 API 가 정한다, TSK-03-03), `rule.RuleEngine.Part`(입구 인자, JSON 아님).

### 6.6 TS 생성 파이프라인

- **설치**: `cd src/frontend && pnpm --filter @dk-oasis/m-mdm add -D json-schema-to-typescript@^16.0.0`. 끝나면 `git status --short src/frontend` 로 `pnpm-workspace.yaml` 등 다른 파일이 바뀌었는지 보고, 바뀌었으면 그 파일만 `git checkout -- <파일>` 로 되돌린다. 커밋은 `m-mdm/package.json`·`pnpm-lock.yaml` 로 한정한다.
- **스크립트** `M/scripts/gen-engine-contract.mjs`(ESM, 타입 검사 밖):

```js
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compile } from "json-schema-to-typescript";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SCHEMA_PATH = path.resolve(HERE, "../../../backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json");
export const OUTPUT_PATH = path.resolve(HERE, "../src/contract/engine-contract.generated.ts");
const BANNER = `/* 생성 파일 — 직접 고치지 않는다.
 * 정본: src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json
 * 재생성: pnpm --filter @dk-oasis/m-mdm gen:contract (어긋나면 tests/engine-contract.generated.test.ts 가 실패한다) */`;

export async function generateEngineContract() {
  const schema = JSON.parse(readFileSync(SCHEMA_PATH, "utf8"));
  return compile(schema, "EngineContract", { bannerComment: BANNER, unreachableDefinitions: true, cwd: path.dirname(SCHEMA_PATH) });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeFileSync(OUTPUT_PATH, await generateEngineContract());
}
```

  배너에 절대경로·시각을 넣지 않는다(어긋남 테스트가 환경마다 달라진다). 경로는 `cwd` 가 아니라 모듈 위치(`import.meta.url`)에서 계산한다. 옵션은 스크립트 한 곳에만 두고 테스트는 같은 함수를 부른다.
- **생성**: `pnpm --filter @dk-oasis/m-mdm gen:contract` → `M/src/contract/engine-contract.generated.ts` 커밋.
- **배럴** `M/src/index.ts`:
  ```ts
  /**
   * @dk-oasis/m-mdm 패키지 배럴.
   *
   * 엔진 공유 계약 타입(TSK-03-01)만 재수출한다 — 런타임 코드 없음. 화면 컴포넌트는 pages/* 서브패스 엔트리로
   * 로드한다(배럴 경유 금지 — 번들 분리 유지, m-mls/m-mqc 관례와 동일).
   */
  export type * from "./contract/engine-contract.generated";
  ```
  tsup 의 dts 빌드가 `export type *` 를 처리하지 못하면(빌드 오류 또는 `dist/index.d.ts` 에 타입 없음) `export * from "./contract/engine-contract.generated";` 로 바꾸고, 프런트 테스트 5 의 기대 문자열도 같이 바꾸고, §3.3 번들 확인으로 런타임 코드가 없는지 다시 본다. 이탈은 design.md 에 추기한다.
- **포맷 보호**: `M/.prettierignore` 에 `src/contract/engine-contract.generated.ts`. m-mdm `format` 스크립트(`prettier --write .`)가 생성물을 바꾸지 않게 한다.

### 6.7 Java 이식 절차 (Build 순서)

1. 테스트 5개 파일을 먼저 쓴다. 계약 클래스가 없어 컴파일 실패(빨강)를 확인한다. `ContractOnlyPhaseTest`·`EngineContractSchemaTest` 는 스키마·계약 파일이 없으면 실패한다.
2. `cp -R docs/mdm/engine-contract/java/kr <E>/src/main/java/` 로 복사한다(스캐폴드 `ExpressionEvaluator`·`package-info` 와 파일 이름이 겹치지 않는다). 복사 뒤 `git diff --stat main -- docs/mdm/engine-contract/` 가 비어 있어야 한다.
3. `MdmExpressionConfig` 를 §6.2 로 바꾸고, `spi/Nullable.java` 를 만들고, §6.3 표지를 단다. 초안 Javadoc 의 "design §6.x" 는 TSK-02-02 design 을 가리킨다. 문구는 그대로 두되 모호하면 `TSK-02-02 design §6.x` 로 한정한다.
4. 스키마를 §6.4 대로 만든다. `build.gradle` 에 Jackson 을 더한다.
5. 엔진 테스트 → m-mdm 설치·생성·테스트 → `testAll` 순서로 초록을 확인한다.
6. §5 불변 규칙 변이를 하나씩 넣어 빨강을 확인하고 되돌린다. 결과를 표로 보고한다.

---

## 7. Build 가 주의할 함정

- **스캐폴드를 건드리지 않는다.** `ExpressionEvaluator` 를 계약 규칙에 맞추려고 고치거나 지우지 않는다. 폐쇄 규칙이 스캐폴드를 명시적으로 허용한다. `mdm/lib` 스모크 테스트도 이 클래스를 부른다(F4).
- **ArchUnit 빈 대상**: 규칙이 가리키는 패키지·클래스가 0건이면 ArchUnit 1.x 는 실패한다(F6). 이것은 막힘이 아니라 보호 장치이므로 `allowEmptyShould(true)` 로 우회하지 않는다.
- **record 판정**: `JavaClass.isRecord()` 를 쓴다. 중첩 record(`RuleResult$Hit`)도 `importPackages` 로 들어온다.
- **UOE 메시지**: 문자열 연결을 쓰면 `invokedynamic`(`makeConcatWithConstants`)이 생겨 B-uoe 규칙이 오판할 수 있다. 리터럴 하나만 쓴다.
- **Jackson 은 test 전용**: `testImplementation` 에만 둔다. main 코드에서 `com.fasterxml` 을 import 하면 기존 규칙 1 이 빨강이 된다(정상 동작).
- **`java.io` 금지**: main 에서 스키마를 읽는 코드를 만들지 않는다(규칙 1 허용 목록 밖, F3). 스키마를 읽는 것은 test 뿐이다.
- **생성물 결정성**: 어긋남 테스트는 `json-schema-to-typescript` 가 내부에서 쓰는 prettier 버전에 따라 결과가 바뀐다. lockfile 이 버전을 고정하므로 lockfile 변경을 반드시 커밋한다. 생성 파일을 손으로 고치거나 m-mdm `format` 을 돌리지 않는다.
- **테스트 경로**: vitest 는 `tests/**/*.test.ts` 를 기본으로 잡는다. `tests`·`scripts` 는 `tsc` lint 대상 밖이라 `.mjs` import 의 타입 오류가 lint 를 깨지 않는다.
- **lint 선행 조건**: m-mdm lint 는 `pnpm build:libs` 뒤에만 통과한다(shared dist 필요, 기준선 기록).
- **커밋 제외**: `.tsbuildinfo`, `dist/`, `state.json`, `spec.md`, `.dflow*`, `.result`, `.issues`, 심링크. `pnpm-workspace.yaml` 변경은 되돌린다.
- **docs 초안**: 복사만 한다. `git mv`·삭제·수정 금지(`engine-contract.md` 머리말 한 줄만 예외, D4).

---

## 담당자 확인 필요 결정

### D1 — `MdmExpressionConfig` 의 설정 팩토리를 어디까지 이 Task 에 둘 것인가
- **질문**: 초안 `baseBuilder()` 는 빌더에 고정값을 채우는 몸체가 있고 `create()` 만 UOE 다. 수용 기준 "실행 로직 없음"과 spec "EvalEx 설정 팩토리 **시그니처**"에 맞게 어떻게 둘 것인가?
- **선택지**: (a) 초안 그대로(baseBuilder 몸체 유지, create 만 UOE) / (b) 고정값 14개를 `public static final` 상수로 올리고 baseBuilder·create 모두 UOE / (c) 팩토리를 interface(`ExpressionConfigFactory`)로 두고 상수 홀더 분리 / (d) baseBuilder 를 없애고 create 시그니처만
- **택한 것**: (b)
- **근거**: spec 본문이 "팩토리 시그니처"라고 적었고 수용 기준이 contract-only 다(가장 강한 근거). TSK-03-02 spec 이 "precision 68/HALF_EVEN, allowOverwriteConstants=false 설정 팩토리"를 자기 요구사항으로 적어 몸체가 그쪽 몫임을 뒷받침한다. 값은 상수로 남으므로 고정값 자체는 이 Task 에서 테스트로 고정된다(I19). TSK-02-02 §13 인계("UOE 본문은 계약 전용 그대로")는 baseBuilder 몸체를 두는 쪽이지만 미승인 선행이라 근거 순위가 가장 낮다. (c) 는 원천 06:442 "모듈이 `ExpressionConfiguration` 하나를 만든다"에 없는 추상화를 더한다.
- **반려되면 재작업 방향**: (a) 면 `baseBuilder()` 에 초안 빌더 체인을 복원하되 값은 상수를 참조하게 하고, `ContractOnlyPhaseTest` 의 UOE 규칙을 `create` 한 메서드로 좁히고, EvalEx 제한 규칙은 그대로(빌더 타입은 이미 허용) 둔다. `baseBuilder_는…` 테스트는 "빌더 결과 설정값 = 상수" 테스트로 바꾼다. (d) 면 `baseBuilder` 를 지우고 TSK-03-02 에 "공개 여부를 정하라"고 인계한다.

### D2 — "실행 로직 없음"을 무엇으로 기계 검증하고, 후속 Task 와 어떻게 나눌 것인가
- **질문**: 계약 전용을 테스트로 붙잡되, TSK-03-02·03 이 구현 클래스를 넣으면 그 테스트는 반드시 깨진다. 규칙을 어떻게 나눌 것인가?
- **선택지**: (a) 계약 타입 목록에만 적용하는 영구 형태 규칙(`ContractTypeShapeTest`) + "구현 클래스가 없다" 임시 폐쇄 규칙(`ContractOnlyPhaseTest`, TSK-03-02 가 첫 구현 커밋에서 지운다) / (b) 전부 영구 규칙으로 두고 후속 Task 가 목록을 늘린다 / (c) 기계 검증 없이 리뷰로만 / (d) 전부 임시 규칙
- **택한 것**: (a)
- **근거**: spec 수용 기준이 contract-only 이므로 검증은 자동이어야 한다((c) 탈락). 폐쇄 규칙을 영구로 두면 후속 Task 가 구현할 때마다 계약 테스트를 고쳐야 해서 계약 테스트의 의미가 흐려진다((b)). 형태 규칙까지 임시로 두면 이후 계약 record 에 로직이 스며드는 것을 막지 못한다((d)). (a) 는 계약 타입의 모양은 영구히 지키고, "이 시점에 구현이 없다"는 사실만 한시적으로 지킨다. `ContractOnlyPhaseTest` Javadoc 과 이 문서에 "TSK-03-02 가 지운다"를 적어 둔다.
- **반려되면 재작업 방향**: (b) 면 `ContractOnlyPhaseTest` 를 `ContractTypeShapeTest` 에 합치고 폐쇄 규칙을 "계약 패키지의 새 클래스는 `impl` 하위 패키지에만" 같은 영구 규칙으로 바꾼다. (d) 면 `ContractTypeShapeTest` 를 `ContractOnlyPhaseTest` 로 합치고 Javadoc 에 삭제 시점을 적는다.

### D3 — Java record 의 필수·null 여부를 스키마와 어떻게 대조할 것인가
- **질문**: Java 는 컴포넌트가 null 가능한지 표현하지 못한다. primitive·참조 타입만으로 대조하면 "스키마 required 에서 참조 타입 속성을 뺀다"·"참조 타입 속성에 null 을 허용한다" 변이를 잡지 못한다. 무엇으로 대조할 것인가?
- **선택지**: (a) spi 에 RUNTIME 표지 annotation `@Nullable` 을 두고 `표지 ⇔ (required 아님 ∨ null 허용)` 으로 양방향 대조 / (b) primitive 휴리스틱만 쓰고 두 변이는 "덮지 못하는 변이"로 보고 / (c) 테스트 안에 컴포넌트별 필수·null 표를 하드코딩 / (d) 외부 표지(jspecify 등)를 main 의존으로 추가
- **택한 것**: (a)
- **근거**: 수용 기준 "같은 스키마에서 나온다"를 Java 쪽에서 증명하려면 필수·null 도 양방향이어야 한다. (b) 는 알려진 구멍을 남긴다. (c) 는 Java 선언과 떨어진 세 번째 사본이 되어 어긋남이 다시 생긴다. (d) 는 엔진 main 의존 EvalEx 단일 원칙(TRD §10, 기존 규칙 1)을 깬다. (a) 의 annotation 은 interface 라 계약 전용 조건을 지키고, spi 에 두면 의존 방향도 지킨다. 후속 Task 에게 null 가능성 문서 역할도 한다.
- **반려되면 재작업 방향**: (b) 면 `Nullable.java` 와 표지를 지우고, 표지 테스트를 "primitive ⇒ required ∧ non-null, (required 아님 ∨ null) ⇒ 참조 타입" 휴리스틱으로 바꾸고, §5 에 I14 의 두 변이를 "덮지 못함"으로 적는다. (c) 면 표지 대신 테스트에 `Map<String, Set<String>> NULLABLE` 을 두고 표지 검사를 그 표와의 대조로 바꾼다.

### D4 — 스키마 정본 위치와 docs 초안의 관계
- **질문**: 스키마 정본을 어디에 한 벌 두고, docs 초안(TSK-02-02 산출물, 머리말이 "docs 스키마가 정본"이라고 말함)은 어떻게 둘 것인가?
- **선택지**: (a) 엔진 `src/main/resources` 에 정본, docs 초안 파일은 바이트 동일로 두고 `engine-contract.md` 머리말에 "정본 이전" 한 줄만 추가 / (b) (a) 와 같되 docs 는 한 글자도 고치지 않는다 / (c) docs 초안을 정본으로 두고 엔진 테스트·m-mdm 이 docs 경로를 읽는다 / (d) 엔진 `src/test/resources` 에 정본
- **택한 것**: (a)
- **근거**: 팀장 지시가 "초안은 복사, 옮기거나 지우지 않는다"이고 "정본 이전 표기"를 예로 들었다. 후속 Task(TSK-03-02~04)는 `engine-contract.md` 를 원천으로 읽는데, 머리말이 계속 docs 스키마를 정본이라 하면 후속 작업자가 낡은 사본을 고칠 위험이 있다. 한 줄 추가는 본문을 바꾸지 않는 최소 편집이다. (c) 는 빌드 산출물이 docs 에 의존하게 하고 jar 에 스키마가 실리지 않는다. (d) 는 하위 시스템이 jar 에서 스키마를 읽을 수 없다. main resources 는 ArchUnit 대상이 아니라 규칙 1 에 영향이 없다.
- **반려되면 재작업 방향**: (b) 면 `engine-contract.md` 한 줄 추가를 되돌리고, 정본 이전 사실은 엔진 스키마 `description` 과 이 design.md 에만 남긴다. (c) 면 스키마를 엔진에서 지우고 테스트는 `../../../docs/...` 파일 경로로, m-mdm 스크립트도 docs 경로로 읽게 바꾼다(엔진 테스트가 모듈 밖 파일을 읽게 된다). (d) 면 파일을 `src/test/resources` 로 옮기고 m-mdm 경로 상수만 바꾼다.

### D5 — 엔진 정본 스키마를 초안에서 얼마나 바꿀 것인가
- **질문**: 초안 스키마를 그대로 복사하면 TS 가 익명 타입·중복 펼침·`MaruMdmEngineTSK0202` 루트 이름으로 나오고(F9·F10), Java 대응 지점이 인라인 경로에 흩어진다. 또 Java `RuleSetResult` 에 대응하는 스키마 정의가 없다. 어디까지 바꿀 것인가?
- **선택지**: (a) JSON 적합성은 그대로 두고 이름만 끌어올림(S2~S8) + title 변경(S1) + `RuleSetResult` 정의 추가(S9) / (b) 바이트 동일 복사(대조는 JSON 포인터로 인라인 위치를 가리킴) / (c) (a) 에서 `RuleSetResult` 추가만 뺌
- **택한 것**: (a)
- **근거**: spec 요구사항이 "판정 결과 타입"과 "JS 평가기와 공유할 AST·셀 구조 TS 타입"을 적었다. 이름 없는 TS 타입은 후속 TSK-03-04 가 가져다 쓸 수 없고, 룰 세트 결과도 판정 결과이므로 스키마에 있어야 Java·TS 가 같은 스키마에서 나온다. 끌어올리기는 검증 의미를 바꾸지 않는다. 초안 TS 의 `InfixOperator`·`RangeOp`·`SingleValueOp` 이름을 그대로 살린다.
- **반려되면 재작업 방향**: (b) 면 엔진 스키마를 초안과 바이트 동일로 되돌리고, `EngineContractSchemaTest` 의 대응표를 JSON 포인터(`#/$defs/RuleResult/properties/hits/items` 등)로 바꾸고, R11·I17 을 지우고, 프런트 export 목록을 실제 생성 이름으로 다시 적는다. (c) 면 S9 와 R11 을 지우고 `RuleSetResult` 를 Java 전용 목록으로 옮긴다.

### D6 — 이 Task 에서 JSON Schema 검증기로 "실제 JSON 이 스키마를 통과한다"를 검사할 것인가
- **질문**: TSK-02-02 §13 은 이 Task 에 "엔진 테스트에 스키마 적합 검사를 더한다"를 인계했다. 그런데 엔진에는 아직 JSON 을 만드는 코드(`AstExporter`, 판정 결과 직렬화)가 없다. 검증기를 지금 넣을 것인가?
- **선택지**: (a) Jackson 파서만 넣고 Java 타입↔스키마 구조 대조까지만 한다. 검증기는 JSON 생산자가 생기는 TSK-03-02(`AstExporter`)·TSK-03-04(코퍼스)가 넣는다 / (b) `com.networknt:json-schema-validator` 를 test 에 넣고 docs 표본(`sample-corpus.json`)을 엔진 스키마로 검증한다 / (c) (b) + 스키마 자체의 2020-12 메타 검증
- **택한 것**: (a)
- **근거**: spec 수용 기준은 "Java·TS 타입이 같은 스키마에서 나온다"이고, 이것은 타입 구조 대조로 증명된다. 검증 대상 JSON 을 엔진이 아직 만들지 않으므로, 지금 검증기를 넣으면 모듈 밖 docs 표본을 읽는 테스트가 된다. 이런 테스트는 docs 초안에 의존하므로 D4 의 단일 사본 원칙과 부딪힌다. §13 인계는 미승인 선행이라 근거가 가장 약하다. JSON 라이브러리는 리포 선례(`oasis/build.gradle:23`)와 캐시가 있는 `jackson-databind:2.18.2` 로 정했다(명백한 기본값).
- **반려되면 재작업 방향**: (b)·(c) 면 `maven-metadata.xml` 로 `json-schema-validator` 버전을 확인하고, 그 버전의 2020-12 지원과 요구 Jackson 버전을 확인한 뒤 `testImplementation` 에 더한다. 표본은 docs 를 읽지 말고 `E/src/test/resources/` 에 최소 표본(AST 3건, RuleResult 1건, 틀린 모양 2건)을 새로 만들어 검증한다. 테스트 수는 그만큼 늘린다.
