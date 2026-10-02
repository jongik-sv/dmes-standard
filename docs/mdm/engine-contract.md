# 마루 MDM 평가 엔진 공유 계약

> 작성: 2026-09-24 (mdm/TSK-02-02 평가 엔진 설계 + 임베딩 방식 조사)
> 정본: 엔진 모듈 스키마 `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json` 과 엔진 Java 타입이고, 이 문서는 그 설명이다. 출처는 TSK-02-02 design §6([tasks/TSK-02-02/design.md](tasks/TSK-02-02/design.md))이다.
> 결정 근거: `docs/mdm/decisions.md` D-020~D-023.
> 원천 설계(`/Users/jji/project/mdm/docs/design/basic/`)의 행 번호를 `02:175`·`05:363`·`06:461`·`EG:222` 처럼 인용한다. `02`·`04`·`05`·`06` 은 각각 `02-term-domain-column.md`·`04-master-code-deploy-full.md`·`05-master-data.md`·`06-business-rule.md` 이고, `EG` 는 `evalex-guide.md` 다.

## 1. 범위와 정본

이 계약은 엔진 jar(`maru-mdm-engine`)와 그것을 부르는 서버(mdm), 화면 JS 평가기(`@dk-oasis/m-mdm`), 정합성 코퍼스가 함께 지켜야 하는 인터페이스·설정·JSON 모양을 정한다. 실행 로직은 이 계약에 없다. 식 평가 코어는 TSK-03-02, 룰 판정은 TSK-03-03, 화면 평가기와 코퍼스는 TSK-03-04 가 구현한다. 계약 초안의 구현 자리(`MdmExpressionConfig.create` 등)는 `UnsupportedOperationException` 을 던지는 계약 전용 본문이다.

계약 파일의 정본 위치는 다음과 같다. `docs/mdm/engine-contract/` 폴더는 TSK-02-02 초안 원본이라 정본이 아니다([README](engine-contract/README.md) 의 "정본 아님" 설명).

```
src/backend/maru-mdm-engine/
  src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json   JSON Schema 2020-12 — JSON 모양의 정본
  src/main/java/kr/dongkuk/maru/mdm/engine/                                   Java 계약 타입(spi·expr·code·rule·domain)
src/frontend/m-mdm/src/contract/engine-contract.generated.ts                  스키마에서 생성한 TS 타입(pnpm --filter @dk-oasis/m-mdm gen:contract)
docs/mdm/engine-contract.md                                                   이 문서(설명)
```

정본 관계는 다음과 같다.

| 대상 | 정본 | 거울 | 일치 확인 |
|---|---|---|---|
| Java 인터페이스·record·enum(spi·입구·결과·설정) | 엔진 모듈 Java(`maru-mdm-engine/src/main/java/kr/dongkuk/maru/mdm/engine/**`) | 이 문서 §2~§8 | 엔진 모듈 컴파일과 `ContractTypeShapeTest`·`EngineContractSchemaTest` |
| JSON 모양(AST·셀·코퍼스·판정 결과·오류) | 엔진 모듈 `engine-contract.schema.json` | Java record, `engine-contract.generated.ts` | `EngineContractSchemaTest`(record·enum 과 `$defs` 짝, 적합 검사)와 `gen:contract` 재생성 시 변경 없음 |

## 2. 패키지와 의존 방향

엔진 패키지는 `kr.dongkuk.maru.mdm.engine` 이다(스캐폴드 실물 `src/backend/maru-mdm-engine/build.gradle:6-11`, group `kr.dongkuk.maru.mdm`, version `0.1.0-SNAPSHOT`).

| 패키지 | 계약 파일 | 역할(06:457-461) | 볼 수 있는 패키지 |
|---|---|---|---|
| `engine.spi` | `DefinitionLookup`, `CodeLookup`, `CodeEffLookup`, `MasterLookup`, `FunctionProvider`, `EngineLookups` | 호출자가 구현하는 조회 | 없음. EvalEx 타입도 쓰지 않는다. `java.lang`·`java.util`·`java.math`·`java.time` 만 쓴다 |
| `engine.code` | `CodeResolver` | 기준일 버전 선택·버전 소급·카테고리 소급·REGEX/TABLE 해석·CODE_LIST | `spi`. EvalEx 를 쓰지 않는다 |
| `engine.expr` | `MdmExpressionConfig`, `FunctionSets`, `ReservedNames`, `AstNode`, `EngineWarning`, `EngineEvaluationException` | 설정 팩토리·허용 함수·예약 이름·AST 타입·공통 경고와 오류 | `spi`, `code` |
| `engine.flow` | `FlowParser`, `FlowTree`, `FlowParse`, `FlowIssue`, `Seq`·`RuleStep`·`Split`·`Branch` | 룰 세트 흐름 구조 검사·블록 트리·노드 관계(룰 세트 흐름도 plan C2·C3) | `spi`. EvalEx 를 쓰지 않는다 |
| `engine.rule` | `RuleEngine`, `RuleResult`, `RuleSetResult`, `RuleView` | 룰 판정·세트 판정·정의 조회 입구 | `expr`, `spi`, `flow` |
| `engine.domain` | `DomainValidator` | 도메인 검증기 | `expr`, `spi` |

- 의존 방향은 원천 06:463 을 따른다. `spi` 는 다른 패키지에 의존하지 않고, `code` 는 `spi` 만, `expr` 는 `spi`·`code` 를 보고, `rule`·`domain` 은 `expr`·`spi` 를 본다. `rule` 과 `domain` 은 서로 보지 않는다. `flow` 는 `spi` 만 보고, `flow` 를 보는 것은 `rule` 뿐이다(`EnginePackageDependencyTest`).
- 엔진 main 의존은 `api 'com.ezylang:EvalEx:3.7.0'` 하나다(`maru-mdm-engine/build.gradle:28-31`). ArchUnit 규칙(`MaruMdmEngineArchitectureTest.java:28-46`)이 main 클래스의 의존을 `engine..`·`com.ezylang.evalex..`·`java.lang/util/math/time/text..` 로 제한하고 `java.sql`·`javax.sql`·`java.net`·`java.nio.channels` 를 금지한다. 계약 초안의 import 는 이 허용 목록 안에 있다.
- 엔진 인스턴스는 `EngineLookups`(spi 다섯을 묶은 record) 하나로 만든다. 구현체 선택(원장·사본·저장된 버전·요청 본문)은 호출자 몫이다(06:541). 공장 클래스의 이름과 생성 방식은 TSK-03-02·03 이 정한다. 이 계약은 입구 인터페이스까지만 정한다.

## 3. spi

| 인터페이스 | 메서드 | 원천 근거 |
|---|---|---|
| `DefinitionLookup` | `Optional<ColumnDefinition> column(table, column)`, `Optional<RuleDefinition> rule(ruleId, Instant evalTs)`, `Optional<RuleSetDefinition> ruleSet(setId, Instant evalTs)` | 06:461, 배포 스냅샷 06:1156-1165, 구현체 넷 06:541 |
| `CodeLookup` | `Optional<CodeRows> code(maruCodeId)`: 헤더·VER·ITEM·CATE·CATE_ITEM 다섯 테이블 행을 해석 없이 돌려준다 | 06:461, 04:969-1040 |
| `CodeEffLookup` | `Optional<Set<String>> codes(maruCodeId, BigDecimal ver, cateId)`, 원장 서버용 상수 `NONE`(늘 빈 값) | 06:461, 04:732 |
| `MasterLookup` | `boolean isValid(maruDataId, cateId, key, LocalDateTime baseDt)`, `Optional<String> attr(…, int attrNo)`, 상수 `NONE`(늘 false·빈 값) | 06:461, 05:363-400 |
| `FunctionProvider` | `List<BusinessFunction> functions()`. `BusinessFunction(name, List<Param(name, nullable)>, varArgs, Body)`, `Body.apply(List<Object>)`, 상수 `NONE`(빈 목록) | 06:445·461 |

- `DefinitionLookup.rule(ruleId, evalTs)` 는 `evalTs` 에 적용되는 RELEASED 버전을 돌려준다. 값 테스트 구현체는 DRAFT 나 요청 본문을 돌려준다. 버전을 고르는 것은 구현체이고, 엔진은 `evalTs` 를 넘길 뿐이다(06:471).
- `RuleDefinition` 은 배포 스냅샷 모양(헤더·변수·입력 계약·행)이다. 셀 `RuleCell` 은 셀 JSON 일곱 키(`op, left, right, list, expr, ast, val`)에 스냅샷의 생성 텍스트 `text` 를 더한 것이고, 모든 값은 문자열이다(06:1038). AST 는 `Map` 그대로 싣고 엔진은 읽지 않는다(06:471).
- `CodeEffLookup` 이 빈 값을 돌려주면 "계산해 두지 않았다"는 뜻이고, 빈 집합이면 "소속 코드가 없다"는 뜻이다. 원장 서버는 `NONE` 을 쓰고, 그러면 `engine.code` 가 `CodeLookup` 행으로 해석한다.
- `MASTER` 는 첫 인자 id 가 `CodeLookup.code(id)` 에 있으면 마루 코드 대상으로, 없으면 마루 데이터 대상(`MasterLookup`)으로 판정한다(05:363, 두 원장은 한 이름 공간 05:409).
- **룰 세트 흐름(2026-09-30, 룰 세트 흐름도 1단계).** `RuleSetDefinition(setId, ruleIds, status, flow)` 의 `flow` 는 `FlowDefinition(version, nodes, edges)` 이고 null 이면 `ruleIds` 순서의 한 줄 흐름이다. 노드 `FlowNode(id, kind, ruleId, splitId, label)` 의 `kind` 는 `START`·`END`·`RULE`·`IF`·`PARALLEL`·`MERGE`, 선 `FlowEdge(id, from, to, order, cond, otherwise, label)` 의 `otherwise=true` 가 IF 의 "그 외" 선이다(JSON 키도 `otherwise`). 스키마 정의는 `RuleSetFlow`·`FlowNode`·`FlowEdge`·`FlowNodeKind` 다. 저장 형식(FLOW_JSON)은 여기에 화면 전용 `view` 를 더한 것이다(`docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §3.3). **받는 노드(2026-10-01, D-134).** `NodeKind` 에 `CATCH` 가 더해졌다. `FlowNode(id, kind, ruleId, splitId, label, attachTo, catches)` 의 `attachTo`(붙은 룰 노드 ID)·`catches`(받을 종류 키 `NO_RESULT`·`INPUT_ERROR`·`EVAL_ERROR`·`HIT_CONFLICT`)는 CATCH 노드만 쓰고, 스키마에서 선택 칸이며 FLOW_JSON 정규 글자에도 CATCH 노드에만 있다. 받는 노드는 선이 아니라 `attachTo` 로 룰에 붙고(들어오는 선 0, 나가는 선 1), 옛 형식에서 처리 갈래가 돌아오는 MERGE 의 `splitId` 는 그 룰 노드 ID 다(새 형식은 합류가 없다, 아래 D-136). 구조 해석은 받는 룰을 `flow.Guarded` 블록으로 만들고, 받는 종류·코드 표는 `flow.CatchKind` 한 곳에 있다(`flow` 는 `spi` 만 보므로 코드는 이름 문자열로 둔다). **합류 없애기(2026-10-02, D-136).** MERGE 는 PARALLEL 의 합류만 쓴다. IF 갈래와 돌아오는 처리 갈래는 모이는 자리(갈래가 처음 다시 만나는 노드)·돌아오는 자리(받는 노드가 붙은 노드의 정상 경로 위 노드)로 바로 간다. IF 갈래는 END 로 가서 세트를 끝낼 수 있다(끝내는 갈래 — 정상 완료이고 endedBy 없음, 처리 갈래 안이면 그 받는 노드가 endedBy). 병렬 갈래 안에서 끝내면 받는 노드 끝냄과 같이 남은 형제를 실행하지 않는다. 옛 형식(IF·받는 노드가 붙은 노드를 가리키는 MERGE)도 받는다. 받는 노드는 RULE·TASK 에 붙는다(TASK 는 실패하지 않아 처리 갈래를 타지 않는다). 블록 트리는 flow.Step(RuleStep·TaskStep)·Split.joinId·Branch.ends·Guarded(step, normal, handlers, mergeId, joinId) 다.
- **룰 세트 버전(2026-10-02, D-144 2단계).** `ruleSet(setId, evalTs)` 는 판정 시각에 적용되는 RELEASED 세트 버전(`APPLY_FROM <= evalTs < APPLY_TO`, KST)을 돌려준다. 룰과 같은 판정 시각 해석이다(ADR-0006 K1). 세트 버전은 룰 버전을 박지 않는다 — 세트 안의 룰도 같은 `evalTs` 의 RELEASED 버전이다(K2). 적용되는 세트 버전이 없으면 `SET_NOT_FOUND`("세트가 없다: {setId} @ {evalTs}")다. 편집 중인 정의(DRAFT)의 시험 실행은 이 조회를 쓰지 않고 `traceSet(RuleSetDefinition, …)` 에 정의를 직접 넘긴다. `RuleSetDefinition.status` 는 부모의 계산 상태다(저장 CREATED 라도 적용된 RELEASED 가 있으면 INUSE).

**시간·버전 타입**

| 값 | Java 타입 | 이유 |
|---|---|---|
| 판정 입구의 평가 시각 | `java.time.Instant` | 06:480 과 같다. EvalEx 에서 DATE_TIME 값이 된다 |
| spi 가 돌려주는 업무 일시(`apply_from`·`apply_to` 등), `MasterLookup`·`CodeResolver` 기준일 | KST 벽시계 `LocalDateTime`(초 단위) | naming-dialect-rules §3 #16 과 같은 타입이다. 열린 끝은 `9999-12-31T00:00` |
| 마루 코드 버전(`ver`, `from_ver`, `to_ver`) | `BigDecimal` scale 3 | `DECIMAL(7,3)`, naming-dialect-rules §3 #17. 열린 `to_ver` 는 9999 |
| 룰 버전(`RuleDefinition.ver`, `RuleResult.ver`, `RuleView.ver`, 노드 기록 `ver`) | `BigDecimal` scale 3 | 소수 셋째 자리 버전(예 1.000 major, 1.001 minor, D-144). 스키마는 `number`(노드 기록은 `number`·`null`)이고 기본 Jackson 은 `1.000` 으로 쓴다. 엔진은 받은 값을 그대로 전달하고 비교가 필요하면 `compareTo` 를 쓴다 |

엔진은 `Instant` 를 `MdmExpressionConfig.ZONE`(`Asia/Seoul`)으로 한 번 바꿔 spi 에 넘긴다.

## 4. EvalEx 설정 고정값

설정은 `MdmExpressionConfig` 하나가 만든다. 서버·하위 시스템·정합성 테스트가 같은 값을 써야 결과가 같다(06:438). 빌더 메서드 이름은 EvalEx 3.7.0 jar 를 `javap` 로 확인했다. 아래는 `MdmExpressionConfig.baseBuilder()` 의 값이다.

| 빌더 메서드(3.7.0) | 값 | 근거 |
|---|---|---|
| `mathContext` | `new MathContext(68, HALF_EVEN)` — precision 68 | 06:442, EG §6. 기본값과 같지만 명시해 고정한다 |
| `zoneId` | `Asia/Seoul` | 02:401 KST 고정. EvalEx 기본값은 JVM 기본 시간대라 호스트마다 달라진다(실측) |
| `locale` | `Locale.ROOT` | 06:442 로캘 고정. EvalEx 기본값은 JVM 기본 로캘이다(실측) |
| `allowOverwriteConstants` | `false` | 06:199·423. `false` 면 레코드 키 `NULL`·`null` 이 `UnsupportedOperationException: Can't set value for constant` 로 거부된다. 기본값 `true` 면 상수가 지워져 `V != NULL` 이 조용히 틀린다(실측) |
| `lenientMode` | `false` | 06:197 |
| `regexTimeoutMillis` | `100` | 06:442 "값을 정해 고정". 3.7.0 기본값 100 을 명시한다 |
| `maxRecursionDepth` | `2000` | 3.7.0 기본값을 명시한다 |
| `arraysAllowed` / `structuresAllowed` | `false` / `false` | design D1. 레코드는 평평한 표준 물리명 맵이다 |
| `implicitMultiplicationAllowed` | `false` | design D1. `2x` 같은 표기를 막아 생성 텍스트와 사용자 식의 문법을 하나로 둔다 |
| `singleQuoteStringLiteralsAllowed` | `false` | 06:247 큰따옴표만 쓴다 |
| `binaryAllowed` | `false` | 3.7.0 기본값을 명시한다 |
| `stripTrailingZeros` | `true` | 3.7.0 기본값이다. 숫자 비교는 `compareTo` 로 하고, 직렬화는 `toPlainString()` 으로 해서 `2E+1` 같은 지수 표기를 막는다 |
| `decimalPlacesRounding` | `DECIMAL_PLACES_ROUNDING_UNLIMITED` | EG §6 기본값 |
| `functionDictionary` | `MapBasedFunctionDictionary.ofFunctions(…)` — `FunctionSets.STANDARD` ∪ 비즈니스 함수 | 06:442-443. 사전 밖 함수는 파싱 단계에서 `ParseException: Undefined function` 으로 거부된다(실측) |
| `dataAccessorSupplier` | 기본값(Map 기반, 대소문자 무시) | EG §6. 바꾸지 않는다 |

- 엔진 설정 입구는 `MdmExpressionConfig.create(EngineLookups)` 다. `baseBuilder()` 에 함수 사전을 더한 것이고, `MASTER`·`MASTER_AT` 은 `CodeResolver`·`MasterLookup` 을 쥔 `AbstractFunction` 으로 들어간다.
- 스캐폴드 `ExpressionEvaluator` 는 지금 `new Expression(expression)`(기본 설정)으로 평가한다(`maru-mdm-engine/src/main/java/.../expr/ExpressionEvaluator.java:25-32`). TSK-03-02 가 이 팩토리로 바꾼다.
- 초안 설정으로 원천 예시 식 29개를 실제 EvalEx 3.7.0 으로 파싱해 모두 받아들여졌고, 거부돼야 할 식 9개(`B[0] > 1`, `c.d > 1`, `2x > 1`, `'A' == V`, `DT_NOW()`, `RANDOM()`, `STR_FORMAT(…)`, `STR_SPLIT(…)`, `LOG(V)`)는 모두 `ParseException` 으로 거부됐다(`samples/AstSampleExport.java`).

## 5. 허용 함수 집합

`FunctionSets` 가 집합 넷을 정한다.

| 집합 | 내용 | 근거 |
|---|---|---|
| `BASE` | EG §8.5 목록 24종: `IF SWITCH COALESCE NOT ABS CEILING FLOOR SQRT ROUND MIN MAX SUM AVERAGE` + `STR_*` 11종(3.7.0 표준 사전에서 `STR_FORMAT`·`STR_SPLIT` 을 뺀 것) | EG:222, design D1 |
| `MDM` | 엔진이 구현하는 커스텀 함수 `INSTR`, `MASTER`, `MASTER_AT` | 06:443-444 |
| `STANDARD` | `BASE` ∪ `MDM`. 표준 칸용이다 | 06:443 |
| `GENERATED` | `STR_MATCHES, STR_STARTS_WITH, STR_ENDS_WITH, INSTR, MASTER`. op-code 생성기가 만드는 텍스트에 나올 수 있는 함수이며, 생성기 회귀 테스트가 이 밖을 막는다 | 06:135-145·257 |

함수 사전에는 표준 칸용과 비즈니스 칸용을 모두 넣고, 칸별 제한은 저장 시 검사가 `FunctionSets.Slot` 으로 한다(06:443).

| `Slot` | 허용 | 변수 제한 |
|---|---|---|
| `DOMAIN_STD` (도메인 표준식) | STANDARD | `value` 하나 |
| `DOMAIN_BIZ` (도메인 비즈니스식, 서버 전용) | STANDARD ∪ 비즈니스 함수 | 없음 |
| `RULE_COND_EXPR` (룰 Expression 조건 셀) | STANDARD | 없음 |
| `RULE_RESULT_EXPR` (룰 결과 Expression 셀, DERIVE 결과식 포함) | STANDARD | 없음 |
| `RULE_EXPR_VAR` (식 변수) | STANDARD | 없음 |
| `RULE_GRP_COND` (결과 열 그룹의 열 조건) | STANDARD | 없음 |

원천 02:175 는 표준식을 "8.5 + `MASTER`" 로 적고, 06:443 은 "+ `MASTER`·`MASTER_AT` + `INSTR`" 로 적는다. 엔진을 정의하는 문장이 더 구체적이라 06:443 을 따른다. 다만 표준식은 변수가 `value` 하나라서 `MASTER_AT` 을 써도 기준일을 줄 변수가 없다.

함수마다 서버 구현, 화면 JS, NULL 인자 동작, 입력 계약 판정은 다음과 같다. NULL 인자 동작은 EvalEx 3.7.0 기본 설정에서 실측한 값이다(`samples/evalex-null-probe.txt`). 화면 JS 칸은 원천 인터프리터 샘플(`/Users/jji/project/mdm/js/evalex-ast-interpreter.js`)을 기준으로 적었다.

| 함수 | 집합 | 서버 구현 | 화면 JS(원천 샘플) | NULL 인자(실측) | 입력 계약 판정(06:208) |
|---|---|---|---|---|---|
| `IF` | BASE | 표준(지연) | 있음 | 조건이 NULL 이면 거짓 가지 | 조건·가지 모두 선택 가능(가지 안 NULL 검사 규칙) |
| `SWITCH` | BASE | 표준(지연) | 있음 | 값이 NULL 이면 기본값 | 선택 |
| `COALESCE` | BASE | 표준 | 있음 | NULL 을 건너뛴다 | 마지막이 아닌 인자는 선택 |
| `NOT` | BASE | 표준 | 있음 | NPE(화면은 참) — 서버와 갈린다 | 필수 |
| `ABS` `CEILING` `FLOOR` `SQRT` | BASE | 표준 | 있음 | NPE | 필수 |
| `ROUND` | BASE | 표준 | 있음 | NPE | 필수 |
| `MIN` | BASE | 표준 | 있음 | 첫 인자 NULL 은 무시돼 값이 나오기도 한다(`MIN(X,1)=1`). 화면은 예외 | 필수(애매하면 필수) |
| `MAX` `SUM` `AVERAGE` | BASE | 표준 | 있음 | NPE | 필수 |
| `STR_LENGTH` `STR_UPPER` `STR_LOWER` `STR_TRIM` | BASE | 표준 | 있음 | NPE | 필수 |
| `STR_LEFT` `STR_RIGHT` `STR_SUBSTRING` | BASE | 표준(0부터, 끝 배타. `STR_SUBSTRING("ABCDE", 1, 2)` = `"B"`) | **없음 — TSK-03-04 가 추가한다** | NPE | 필수 |
| `STR_CONTAINS` | BASE | 표준(대소문자 무시) | 있음. 다만 `str(null)`="null" 로 검사해 서버와 갈린다. **false 로 고친다** | false | 선택(서버가 false 를 돌려 실패하지 않는다) |
| `STR_STARTS_WITH` `STR_ENDS_WITH` | BASE | 표준(대소문자 구분) | 있음 | NPE | 필수 |
| `STR_MATCHES` | BASE | 표준(전체 일치, 타임아웃 100 ms) | 있음(`^(?:…)$`) | NPE | 필수 |
| `INSTR(s, sub)` | MDM | 커스텀. 대소문자를 구분하고 위치는 1부터 세며, 없으면 0, 인자가 NULL 이면 NULL 을 돌려준다(06:443, EG:215) | **없음 — TSK-03-04 가 추가한다** | NULL 반환 | NULL 을 전파하므로 바깥 연산으로 판정한다. 비교(`> 0`)에 쓰이면 NULL 비교가 NPE 라서 사실상 필수다 |
| `MASTER(id, cate, key[, attr])` | MDM | 커스텀. `EVAL_TS` 로 판정한다 | 주입(마루 코드 대상이고 받아 둔 집합이 있을 때만) | key 가 NULL 이면 false/NULL | key 는 선택 |
| `MASTER_AT(id, cate, key, base_dt[, attr])` | MDM | 커스텀. base_dt 로 판정한다 | 1차는 폴백(`isSupported=false`) | key·base_dt 가 NULL 이면 false/NULL(design D5) | key·base_dt 는 선택 |

연산자의 NULL 동작도 실측했다. `X + 1` 은 문자열 `"null1"` 이 되고, `X * 2` 는 EvaluationException, `X < 1`·`X && TRUE`·`!X` 는 NPE 를 낸다. `FALSE && X` 는 false 다. 원천 JS 샘플은 `+` 에서 `num(null)` 로 예외를 내므로 서버와 갈린다.

**제외 함수**: 시각·난수(`DT_*`, `RANDOM`), 로캘(`STR_FORMAT`), 배열 반환(`STR_SPLIT`), 수학 확장(`LOG`, `LOG10`, `FACT`, 삼각·쌍곡·각도 함수)은 사전에 넣지 않는다. 그래서 식에 쓰면 파싱 오류가 난다(06:442, EG §8.5 1항, design D1).

**비즈니스 함수(`FunctionProvider`) 적재 규칙**

1. 이름은 `^[A-Z][A-Z0-9_]*$` 이어야 한다. STANDARD·GENERATED·EvalEx 표준 사전의 이름과 겹치면 적재를 거부한다.
2. `nullable=false` 인 인자에 NULL 이 오면 함수를 부르지 않고 `EVALUATION_ERROR` 를 낸다. 입력 계약의 필수·선택 판정(06:208)이 이 표지를 쓴다.
3. 인자와 반환은 `BigDecimal`·`String`·`Boolean`·null 만 쓴다. 함수 안의 예외는 `EVALUATION_ERROR` 로 올라간다.
4. 지연(lazy) 인자는 받지 않는다. spi 에 EvalEx 타입을 쓸 수 없고(06:461), 지연 평가는 EvalEx 부분 트리 평가가 필요하기 때문이다.
5. 시각·난수·로캘·환경을 읽는 구현은 금지다(02:326 결정성). 이 규칙은 구현 jar 의 책임이다.

## 6. 예약 이름

초안 `ReservedNames` 가 정한다.

| 이름 | 규칙 | 오류 코드 | 근거 |
|---|---|---|---|
| 상수 8종 `NULL TRUE FALSE PI E DT_FORMAT_ISO_DATE_TIME DT_FORMAT_LOCAL_DATE_TIME DT_FORMAT_LOCAL_DATE` | 대소문자를 무시하고 레코드 키로 오면 판정 오류다 | `CONSTANT_KEY` | 06:199, EvalEx 3.7.0 표준 상수(실측) |
| `EVAL_TS` | 레코드 키로 오면 판정 오류다. 식에서 직접 쓰면 저장을 거부한다 | `EVAL_TS_KEY` | 06:422 |
| `_` 로 시작하는 키 | 레코드 키로 오면 판정 오류다. 식 변수 값은 엔진이 `_V<var_id>` 키로 넣는다 | `RESERVED_KEY` | 06:424 |
| `CATCH_KIND` `CATCH_RULE` `CATCH_CODE` `CATCH_MSG` | 받는 노드 처리 갈래 안에서만 ctx 에 있다(종류 키·실패한 룰 ID·첫 위반 코드 또는 `NO_RESULT`·첫 위반 문구 또는 `맞는 행과 기본 행이 없다`). 돌아오는 자리에 들어가기 전에(옛 형식이면 돌아오는 MERGE 에서) 룰 직전 값으로 되돌리고 END 에서 지운다. `finalValues` 에 넣지 않는다. 대소문자를 무시하고 레코드 키로 오면 판정 오류다. 세트 실행과 룰 하나 실행이 같은 `RecordKeys.check` 를 쓰므로 어느 쪽에서든 예약 이름이다 | `RESERVED_KEY` | 받는 노드 spec §4·§6, D-134 |
| `value` | 도메인 표준식의 검사 대상 변수다 | — | EG §7 |

## 7. MASTER·MASTER_AT·CODE_LIST 와 평가 시각

```
MASTER(id, cate, key)                     → BOOLEAN   평가 시각(EVAL_TS)에 항목이 유효한가
MASTER(id, cate, key, attr)               → STRING|NULL
MASTER_AT(id, cate, key, base_dt)         → BOOLEAN   base_dt 에 유효한가
MASTER_AT(id, cate, key, base_dt, attr)   → STRING|NULL
  id·cate : 문자열 리터럴(저장 시 검사). id 가 CodeLookup.code(id) 에 있으면 마루 코드 대상(CodeResolver),
            없으면 마루 데이터 대상(MasterLookup). 두 원장은 한 이름 공간(05:409)
  attr    : "attr01"-"attr10" 문자열 리터럴 → attrNo 1-10
  인자 수 : MASTER 3-4, MASTER_AT 4-5. 초과는 저장 시 AST 검사가 거부, 평가에서 만나면 EVALUATION_ERROR(05:400)
CODE_LIST(id, cate, baseDt)               → List<CodeListEntry(code,name,alterName,seq)>  (Java API, 식 함수 아님)
```

- 불리언 형태는 항목이 유효한지 돌려주고, 속성 형태는 `attr01`-`attr10` 문자열을 그대로 돌려준다. 유효하지 않으면 속성 형태는 NULL 이다. key 가 NULL 이거나 데이터·카테고리가 없으면 false/NULL 이다(05:363-400, 02:393-416, EG:223).
- 가변 인자라서 EvalEx 파서는 최소 인자 수만 본다. 초과 인자는 저장 시 AST 검사가 거부한다.
- `CODE_LIST` 는 EvalEx 함수가 아니라 `CodeResolver.codeList(maruCodeId, cateId, baseDt)` Java API 다. 룰 식에는 쓰지 않으므로(06:316) 식 사전에 넣지 않는다. 결과는 seq 오름차순(같으면 code 순)이고, DEPRECATED 마루 코드는 빈 목록이다(02:418-429). 원천은 "현재 시각을 그때그때 읽는다"(02:429)고 적었지만, 엔진은 `baseDt` 를 필수로 받고 기본값(현재 시각)은 서버 API 층이 채운다(§12 X1).

**평가 시각 주입**

1. 판정 입구(`RuleEngine.evaluate`·`evaluateSet`, `DomainValidator.validate`)는 `Instant evalTs` 를 필수 인자로 받는다. 엔진은 시계를 읽지 않는다. 원천의 "주지 않으면 현재 시각"(06:401·422)은 엔진을 부르는 서버 API 층이 `now()` 로 채운다.
2. 엔진은 `evalTs` 의 초 미만을 자르고, 평가마다 한 번 `ctx.put("EVAL_TS", evalTs)` 로 넣는다. EvalEx 에서는 DATE_TIME 값이다.
3. `MASTER` 는 함수 구현의 `evaluate(Expression expression, …)` 인자 `expression` 의 데이터 접근자에서 `EVAL_TS` 를 읽고(EG:223), `ZONE`(`Asia/Seoul`)으로 KST `LocalDateTime` 으로 바꿔 판정한다.
4. 룰 세트 한 번, 검증 한 번은 한 평가 시각이다(06:422). 실행 로그에 평가 시각을 남기는 것은 호출자 몫이다.

**`MASTER_AT` 의 `base_dt` 해석(design D5)**

식 안의 base_dt 는 레코드 값이라 문자열이다. 원천 레코드 값 타입은 String·Number·Boolean 뿐이고(06:125-127), 초 정밀도 일시 문자열 형식은 원천에 없다. 그래서 받는 형식을 둘로 정한다.

| 입력 | 해석 |
|---|---|
| 8자리 숫자 `YYYYMMDD` | 그날 00:00:00 KST(02:401 "일자 타입이면 그날 00:00:00") |
| 14자리 숫자 `YYYYMMDDHHMMSS` | 그 시각 KST |
| 그 밖의 문자열·숫자·불린 | `EVALUATION_ERROR` |
| NULL | 불리언 형태는 false, 속성 형태는 NULL(key NULL 규칙과 같다) |

화면 JS 는 1차에서 `MASTER_AT` 을 서버로 폴백하므로 이 해석을 구현하지 않는다.

## 8. 판정 결과·오류·경고

**룰 판정 결과 `RuleResult(ruleId, ver, evalTs, hits, defaultApplied, results, trace, warnings)`**

| 칸 | 내용 | 근거 |
|---|---|---|
| `hits` | `Hit(rowId, seq, groupChoices)`. `groupChoices` 는 `res_grp → var_id` 이고, 고른 열이 없으면(참인 열도 기본 열도 없음) 값이 null 이다. FIRST·UNIQUE 는 0-1개, PRIORITY·COLLECT·ANY 는 적중한 행 전부, DERIVE 는 행 하나다 | 06:92·69·216 |
| `defaultApplied` | 적중이 없어 기본 행을 썼는가. 기본 행이 없으면 false 이고 결과 변수는 NULL 이다 | 06:31 |
| `results` | 결과 변수 → 값(`BigDecimal`·`String`·`Boolean`·null). 키는 늘 있고 값은 null 일 수 있다. COLLECT LIST 는 `List` 다 | 06:31 |
| `trace` | 평가한 행마다 `RowTrace(rowId, seq, evaluated, hit, firstFalseVarId)`. `firstFalseVarId` 는 조건 열 `seq` 순으로 처음 거짓이 된 셀의 var_id 이고, 적중·미평가 행은 null 이다. FIRST 는 적중 뒤 행을 평가하지 않는다(`evaluated=false`) | 06:319 |
| `warnings` | `EngineWarning(code, ruleId, rowId, varId, message)`. code 는 `EXPR_CELL_NULL`(Expression 조건 셀 결과가 NULL 이라 그 셀만 거짓으로 봄), `GRP_COND_NULL`(열 조건 결과가 NULL 이라 그 열만 거짓으로 봄), 세트 경고 `BRANCH_COND_NULL`(IF 갈래 조건식 결과가 NULL 이라 그 갈래를 거짓으로 봄) | 06:200·425·427 |

**룰 세트 결과 `RuleSetResult(setId, evalTs, steps, finalValues, path, warnings, caught, endedBy)`**: `steps` 는 실제로 실행한 룰마다의 `RuleResult`(실행 순서), `finalValues` 는 마지막 룰 뒤 결과 변수 전체다(입력 레코드 키는 뺀다). `path` 는 방문한 노드 `PathStep(nodeId, kind, chosenEdgeId, stepIndex)` 목록이다. START·RULE·CATCH·TASK·IF·PARALLEL·END 와 병렬 합류 MERGE(옛 형식이면 IF·돌아오는 합류도)를 담고, `chosenEdgeId` 는 IF 에서 고른 선, `stepIndex` 는 RULE 결과가 `steps` 의 몇 번째인지다. 한 줄 흐름(`flow` 가 null)의 노드 ID 는 `start`, `r1`…`rN`, `end` 다. `warnings` 는 세트 경고로 지금은 `BRANCH_COND_NULL` 하나다. 흐름 실행 의미(IF 는 처음 참인 갈래 하나, 병렬은 분기 직전 값의 사본에서 order 순으로 하나씩 실행하고 합류 때 갈래 순서대로 합침, 같은 이름은 뒤 갈래가 이김)는 `docs/superpowers/specs/2026-09-29-rule-set-flow-design.md` §4 와 구현 계획 C5 를 따른다. IF 조건식 변수는 세트 안 룰이 선언한 타입(계약 always·DERIVE 행 required·optional·결과 변수, 이름마다 처음 선언한 타입. 선언 타입 조회와 바꿀 값 찾기는 대소문자를 가리지 않는다. 단 조건식 변수의 입력 키 사전 검사는 레코드 키가 조건식 표기와 같아야 한다)으로 바꾼 사본 값으로 평가하고(룰 조건 열과 같은 변환, ctx 는 바꾸지 않음), 선언이 없는 변수는 레코드 값 그대로 쓴다. 변환에 실패하면 `BRANCH_EVAL_ERROR` 다. 받는 노드(D-134): 룰이 실패했거나 결과가 없는데 그 종류를 받는 노드가 있으면 그 룰 결과를 쓰지 않고(`steps` 에 넣지 않고 `PathStep.stepIndex` 는 null) 룰 직전 ctx 로 처리 갈래를 실행한다. `path` 에 CATCH 노드도 든다. `caught` 는 받아 처리한 exception `CaughtException(ruleNodeId, ruleId, catchNodeId, kind, code, message)` 목록(실행 순서)이고, 처리 갈래 안에서 END 에 닿아 끝났으면(처리 갈래 안 IF 의 끝내는 갈래 포함) `endedBy` 가 가장 안쪽 처리 갈래의 받는 노드 ID 이고, 끝내는 IF 갈래로 끝난 실행(정상 완료)은 null 이다(D-136). 병렬 갈래 안에서 끝내면 남은 형제 갈래는 실행하지 않고 `finalValues` 는 끝난 형제와 지금 갈래의 결과까지다. INPUT_ERROR 를 받는 룰의 입력은 세트 입력 키 사전 검사에서 빠지고 그 룰 실행 직전에 본다. 받는 노드가 없으면 지금처럼 실패는 판정 오류, 결과 없음은 NULL 결과로 진행한다.

**실행 기록 `RuleEngine.traceSet(set, record, evalTs) → RunTrace(setId, evalTs, input, nodes, finalValues, violations)`**: 저장된 세트 ID 가 아니라 정의(`RuleSetDefinition`)를 받으므로 저장하지 않은 흐름도 실행한다. 저장 전 흐름을 실행할 때 `setId` 는 호출자가 정한 표시 이름이다(예: `(저장 전)`). 판정 오류를 던지지 않는다. 구조·존재·입력 키 오류면 `nodes` 가 비고 `violations` 에 위반이 있다. 실행 중 오류면 처리 중이던 노드를 `status=ERROR` 로 남기고 멈춘다. 분기 노드는 갈래 몸체를 실행하기 전에 기록한다(IF 는 갈래를 고르고 진입 키 검사를 지난 뒤이고, 진입 키 검사가 실패하면 그 IF 가 ERROR 다). 끝까지 가면 `violations` 는 null 이다. 노드 기록 `NodeTrace(seq, nodeId, kind, status, ruleId, ver, reads, result, branches, chosenEdgeId, order, splitId, merged, violations)` 는 종류마다 쓰는 칸만 채운다(RULE: `ruleId`·`ver`·`reads`·`result`, IF: `branches`·`chosenEdgeId`, PARALLEL: `order`, MERGE: `splitId`·`merged`). `result` 는 OK 인 RULE 노드에만 있고, 값이 없으면 JSON 에서 키를 뺀다(null 을 쓰지 않는다). 노드 상태 `status` 는 `NodeStatus`(`OK`·`ERROR`)다. IF 갈래 평가 `BranchTrace(edgeId, outcome, message)` 의 `outcome`(`BranchOutcome`)은 `TRUE`·`FALSE`·`NULL`·`ERROR`·`NOT_EVALUATED` 다. `NOT_EVALUATED` 는 앞 갈래가 참이었거나 앞 갈래 평가가 오류로 멈춰 평가하지 않은 선이다(안 고른 그 외 선 포함). 그래서 IF 의 `branches` 는 늘 나가는 선마다 하나씩, 실행 순서대로 있다. 운영 경로 `evaluateSet` 은 기록을 모으지 않는다. 운영 기록 저장은 이 JSON 을 그대로 쓰면 된다(spec §4.2, A8 로 미룸). 받는 노드(D-134): `RunTrace` 에 `endedBy`(없으면 JSON 에서 키를 뺀다), 노드 상태 `CAUGHT`(받는 노드로 넘긴 룰 — `violations` 는 받은 위반, 결과 없음이면 빈 목록, `result` 없음), CATCH 노드 기록은 `status=OK`·`ruleId`(실패한 룰)·`catchKind`·`code`·`message`(세 칸은 CATCH 노드에만 있고 JSON 에서 null 이면 키를 뺀다). 옛 형식 돌아오는 MERGE 기록의 `splitId` 는 받는 룰 노드 ID 이고 `merged` 는 null 이다. 새 형식 흐름은 IF·돌아오는 자리의 MERGE 기록이 없어 그만큼 seq 가 당겨진다(D-136).

**판정 오류 `EngineEvaluationException(violations)`**

- `Violation(stage, code, ruleId, rowId, name, message)`. `name` 은 변수 이름(키 없음·NULL·타입 변환) 또는 함수 이름(평가 오류)이다. `BRANCH_EVAL_ERROR` 는 IF 갈래 선 ID(edgeId), `FLOW_INVALID` 는 구조 오류가 난 노드 ID(nodeId, 없으면 null)다.
- 단계(`Stage`): 룰 하나는 `SET_CHECK`(세트 사전 검사) → `INPUT_CHECK`(조건 검사) → `ROW_SELECT`(행 고르기) → `RESULT_CHECK`(결과 검사) → `RESULT_EVAL`(결과 평가) 순이다. 어긋난 것을 단계마다 모아 한 번에 던진다(06:210-217). `BRANCH_SELECT`(IF 갈래 고르기)는 이 순서 밖의 세트 단계로, 흐름이 IF 에 닿을 때마다 룰 사이에서 일어난다.
- 코드(`Code`) 15종: `RULE_NOT_FOUND`, `SET_NOT_FOUND`, `SET_DEPRECATED`, `MISSING_KEY`, `REQUIRED_NULL`, `TYPE_CONVERSION`, `CONSTANT_KEY`, `RESERVED_KEY`, `EVAL_TS_KEY`, `UNIQUE_MULTIPLE_HITS`, `ANY_CONFLICT`, `EVALUATION_ERROR`, `BRANCH_EVAL_ERROR`(IF 조건식이 불린이 아니거나 평가 실패), `FLOW_INVALID`(세트 흐름 구조 오류), `EDIT_POINT_MISMATCH`(디버거에서 고친 값의 자리가 실행 순서와 어긋남, 단계는 늘 `INPUT_CHECK`). UNIQUE 에서 둘 이상 적중하면 `UNIQUE_MULTIPLE_HITS`, ANY 에서 결과가 어긋나면 `ANY_CONFLICT` 다. 폐기 세트는 `SET_DEPRECATED` 다(06:419). 세트 입력 키(06:420)는 세 번에 나눠 본다. 첫 룰 전에는 반드시 실행되는 부분(IF 조건식 변수 포함, IF 갈래 안은 제외)을 한꺼번에 보고, IF 갈래에 들어갈 때 그 갈래의 반드시 실행되는 부분을 본다. IF 일부 갈래에서만 만들어지는 이름은 그 이름을 읽는 룰 실행 직전에 본다. 모두 `SET_CHECK/MISSING_KEY` 다. 예외로 IF 조건식이 일부 갈래에서만 만든 이름을 읽으면 사전 검사를 지나고, 실제로 없으면 평가 때 `BRANCH_SELECT/BRANCH_EVAL_ERROR` 다. 받는 노드가 받을 수 있는 코드는 MISSING_KEY·REQUIRED_NULL·TYPE_CONVERSION(INPUT_ERROR)·EVALUATION_ERROR(EVAL_ERROR)·UNIQUE_MULTIPLE_HITS·ANY_CONFLICT(HIT_CONFLICT)뿐이다(D-134).

**도메인 검증 `DomainValidator.validate(table, column, record, evalTs)`**

- 값이 틀린 것은 예외가 아니라 결과다. `ValidationResult(valid, value, failures)`, `Failure(step, message)` 로 돌려준다. `value` 는 정규화·타입 변환을 거친 값이다.
- `step`: `NOT_DEFINED`(컬럼 사전에 없음), `REQUIRED`(필수인데 빈 값), `TYPE_CONVERSION`(도메인 데이터 타입으로 바꾸지 못함), `STD_EXPR`(유효 표준식이 거짓), `BIZ_VAR_MISSING`(비즈니스 요구 변수가 레코드에 없음. 통과가 아니라 실패다, 06:448), `BIZ_EXPR`(유효 비즈니스식이 거짓).
- 식을 평가하다 난 예외만 `EngineEvaluationException` 이다. 유일성·DB 제약은 호출자 몫이다.

**JSON 모양**: 값 테스트 API·판정 서비스 응답은 스키마의 `RuleResult`·`EngineError` 정의를 따른다. 값은 `TypedValue` 로 싣고 숫자는 문자열이다(§11).

## 9. AST JSON 스키마

- 정본은 엔진 모듈의 `src/backend/maru-mdm-engine/src/main/resources/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json`(JSON Schema 2020-12)이다. `$defs` 는 `AstNode`(노드 6종 oneOf), `TypedValue`, `CellJson`(셀 모양 oneOf), `ErrorCode`, `CorpusFile`·`CorpusCase`·`ExprCase`·`CellCase`·`CodeSets`·`Expect`, `LocalDateTime`, `VarType`, `InputContract`, `RuleResult`, `EngineError` 등이다.
- AST 노드는 `{type, value, params?}` 이다. 설정이 허용하는 6종만 나온다(design D1 문법 축소의 결과). `ARRAY_INDEX`·`STRUCTURE_SEPARATOR`·`POSTFIX_OPERATOR` 는 나오지 않는다.

| `type` | `value` | `params` |
|---|---|---|
| `NUMBER_LITERAL` | 입력 원문 문자열(`1.60`, `1e-3`, `0xFF`, `.5` 도 원문 그대로) | 없음 |
| `STRING_LITERAL` | 이스케이프를 푼 값 | 없음 |
| `VARIABLE_OR_CONSTANT` | 변수·상수 이름 | 없음 |
| `PREFIX_OPERATOR` | `-` `+` `!` 중 하나 | 정확히 1개 |
| `INFIX_OPERATOR` | `+ - * / % ^ = == != <> < <= > >= && \|\|` 16종 중 하나 | 정확히 2개 |
| `FUNCTION` | 함수 이름 | 인자. 인자가 0개면 `params` 키를 뺀다 |

`AstExporter` 는 자식이 없으면 `params` 키를 뺀다(`/Users/jji/project/mdm/js/AstExporter.java:39-54`). 아래 두 예시는 초안 설정의 EvalEx 3.7.0 이 실제로 낸 AST 다(`samples/AstSampleExport.java` 출력).

음수는 `PREFIX_OPERATOR -` 와 숫자 리터럴로 나온다. `V >= (-1.5)` 부분은 다음과 같다.

```json
{"type": "INFIX_OPERATOR", "value": ">=", "params": [
  {"type": "VARIABLE_OR_CONSTANT", "value": "V"},
  {"type": "PREFIX_OPERATOR", "value": "-", "params": [{"type": "NUMBER_LITERAL", "value": "1.5"}]}]}
```

`-2^2` 는 접두 연산자가 먼저 묶여 `(-2)^2` 가 된다.

```json
{"type": "INFIX_OPERATOR", "value": "^", "params": [
  {"type": "PREFIX_OPERATOR", "value": "-", "params": [{"type": "NUMBER_LITERAL", "value": "2"}]},
  {"type": "NUMBER_LITERAL", "value": "2"}]}
```

**Java·TS 타입 생성 방식(design D6)**

| 대상 | 방식 | 이유 |
|---|---|---|
| TS | 스키마에서 `json-schema-to-typescript` 로 생성해 `@dk-oasis/m-mdm` 에 둔다. devDependency 추가는 TSK-03-01 이 한다. `ts/engine-contract.ts` 는 생성 결과가 가져야 할 모양이다 | 화면 쪽 타입을 스키마 하나에서 뽑는다 |
| Java | 코드 생성기를 쓰지 않고 손으로 쓴 record(`AstNode` 등)를 둔다. 엔진 **테스트 범위**에서 `AstExporter` 출력과 판정 결과 JSON 이 스키마를 통과하는지 검사한다. JSON Schema 검증기는 `testImplementation` 에만 둔다 | 엔진 main 의존은 EvalEx 하나다(TRD §10). 코드 생성기는 Jackson 주석 같은 런타임 의존을 끌고 온다 |

**스키마 버전**: 코퍼스 파일은 `"version": 1` 을 가진다. AST·셀 JSON 에는 버전 칸을 두지 않는다(원천 저장 모양을 바꾸지 않기 위해서다, 06:1038). 모양이 바뀌면 스키마 `$id` 에 버전을 올리고 코퍼스 `version` 을 올린다.

## 10. 화면 JS 평가기 범위

| 대상 | 화면 처리 | 폴백 |
|---|---|---|
| op-code 조건 셀 | 셀 구조를 직접 비교한다(06:271). Number 는 `Decimal`(precision 68, HALF_EVEN), String·일자 String 은 UTF-16 코드유닛 순서, Boolean 은 값으로 견준다. 값이 NULL 이면 `IS_NULL` 만 참이고 `NA` 는 참, 나머지는 거짓이다. `=` 패턴의 단순형은 startsWith/endsWith/indexOf 로, 정규식형은 저장 응답이 준 정규식을 `^(?:…)$` 로 감싸 본다. CONTAINS·INSTR 은 indexOf(대소문자 구분)로 본다. CODE_IN 은 받아 둔 (마루 코드, 카테고리) 코드 집합의 `has` 로 본다 | CODE_IN 집합을 받아 두지 않았으면 서버 |
| Expression 조건 셀, 식 변수, 열 조건 | AST 인터프리터 | `isSupported()` 가 거짓이면(허용 밖 노드·함수, `MASTER` 마루 데이터 대상, `MASTER_AT`, `attr` 형태) 서버 미리보기 API |
| 결과 Expression 셀(원천 미결 06:389) | `isSupported()` 가 참이면 AST 로 미리 보이고 "미리보기" 표시를 붙인다. 정식 값은 값 테스트 API(서버)가 낸다 | 거짓이면 서버 |
| 적중 정책·행 하이라이트·첫 거짓 셀 | 화면 JS(06:724) | — |
| 도메인 표준식 | AST 인터프리터(EG §8.5 0항) | 비즈니스식은 화면에 배포하지 않고 "서버 확인"으로 표시한다 |

- `isSupported(ast, injected)` 는 노드 종류 6종, 연산자 enum, 함수 이름을 훑는다. `MASTER` 는 첫 인자 id 에 대한 코드 집합이 주입돼 있을 때만 지원으로 본다.
- 인터프리터는 원천 샘플을 출발점으로 삼되 `INSTR`·`STR_LEFT`·`STR_RIGHT`·`STR_SUBSTRING` 을 더하고, NULL 동작은 서버(§5 실측)에 맞춘다. 화면과 서버가 다르면 서버가 기준이고 인터프리터를 고친다(EG §8.5 2항). 서버가 예외를 내는 자리(예: `NOT(NULL)` 의 NPE)는 코퍼스에서 `error: EVALUATION_ERROR` 로 기대하고, 화면도 오류로 낸다.
- **예약 키 검사도 화면이 같이 한다.** 원천 샘플의 `prepare()` 는 키를 대문자로 바꾸고 상수가 변수를 가린다(`evalex-ast-interpreter.js:161·257-261`). 그래서 레코드에 `NULL` 키가 오면 서버는 `CONSTANT_KEY` 를 내는데 화면은 조용히 상수를 쓴다. 화면 평가기는 평가 전에 변수 키를 검사해 상수 8종(대소문자 무시)이면 `CONSTANT_KEY`, `EVAL_TS` 면 `EVAL_TS_KEY`, `_` 로 시작하면 `RESERVED_KEY` 로 서버와 같은 코드를 낸다(코퍼스 `expr.constant-key`).

## 11. 정합성 코퍼스 형식

- 파일은 `CorpusFile { version: 1, cases: CorpusCase[] }` 하나다. TSK-03-04 가 `@dk-oasis/m-mdm` 와 엔진 테스트 리소스가 같은 파일을 읽도록 배치한다. 러너는 양쪽에 하나씩 둔다: JUnit(엔진 테스트)과 Vitest(m-mdm).
- 사례는 두 종류다.

| 종류 | 칸 | 서버가 평가하는 것 | 화면이 평가하는 것 |
|---|---|---|---|
| `ExprCase` | `id, kind:"expr", slot?, expr, ast, vars, evalTs?, codeSets?, expect` | `expr` 텍스트 | `ast` |
| `CellCase` | `id, kind:"cell", variable{name, dataType, dateString?, maruCodeId?}, cell, patternRegex?, value, evalTs?, codeSets?, expect` | 생성기가 만든 텍스트 | 셀 구조 |

- **값은 `TypedValue` 로 싣는다.** `{"type":"NUMBER","value":"1.10"}` 처럼 숫자를 문자열로 실어 JS double 오차를 막는다. NUMBER 는 값으로 견준다(`1.10 == 1.1`). NULL 은 `{"type":"NULL"}` 이다. `vars` 의 타입이 변수 선언과 다르면 타입 변환 오류 사례다.
- `expect` 는 `{value: TypedValue}` 또는 `{error: ErrorCode}` 다. `screenFallback: true` 면 화면은 `isSupported=false` 여야 하고, 서버 결과만 견준다.
- `codeSets` 는 `{"PROC_CD|PLATING": ["82","84"]}` 모양이다. 화면은 이것을 CODE_IN·MASTER 주입 집합으로 쓴다. **서버 러너는 키마다 가짜 사본을 합성한다.** `CodeLookup.code(id)` 는 헤더 `status=INUSE`, RELEASED 버전 하나(`ver=1.000`, `apply_from=0001-01-01T00:00`, `apply_to=9999-12-31T00:00`), 집합의 코드마다 ITEM 행(`from_ver 1.000`, `to_ver 9999`)을 돌려주고, `CodeEffLookup.codes(id, 1.000, cate)` 는 그 집합을 돌려준다. 이렇게 해야 `MASTER`·CODE_IN 이 마루 코드 경로(`CodeResolver`)로 가고 `MasterLookup` 으로 새지 않는다. `codeSets` 에 없는 id 는 `CodeLookup` 이 빈 값을 돌려주므로 마루 데이터 대상(`MasterLookup.NONE`, 늘 false)이 된다(`expr.master.data-fallback`).
- **필수 사례**는 06:284-296 목록 전부와, 이번 조사에서 드러난 서버·원천 JS 의 갈림이다: `NULL + 1`(서버는 문자열 `"null1"`), `MIN(NULL, 1)`·`MAX(1, NULL)` 비대칭, `STR_CONTAINS(NULL, "u")`, `IF(NULL, …)`, `NOT(NULL)`, `FALSE && NULL`·`NULL || TRUE`, `STR_SUBSTRING` 경계, `ROUND` HALF_EVEN(`2.345 → 2.34`), `SWITCH` 결과 직렬화(`2E+1` 이 아님), 상수 이름 레코드 키.
- 표본 15건은 [`engine-contract/samples/sample-corpus.json`](engine-contract/samples/sample-corpus.json) 에 있다. 그중 `cell.range.upper-open-boundary` 는 범위 셀의 열린 위 끝을 확인한다.

```json
{
  "id": "cell.range.upper-open-boundary",
  "kind": "cell",
  "variable": { "name": "COIL_THK", "dataType": "NUMBER" },
  "cell": { "op": "<= 변수 <", "left": "1.6", "right": "2.5" },
  "value": { "type": "NUMBER", "value": "2.5" },
  "expect": { "value": { "type": "BOOLEAN", "value": "false" } }
}
```

## 12. 원천과 다른 점

| # | 원천 | 계약 | 이유 |
|---|---|---|---|
| X1 | 평가 시각은 "주지 않으면 현재 시각"(06:401·422)이고, `CODE_LIST(id, cate)` 는 "현재 시각을 그때그때 읽는다"(02:429) | 엔진 입구는 `evalTs`·`baseDt` 를 필수로 받는다. 기본값은 서버 API 층이 `now()` 로 채운다 | 엔진이 시계를 읽지 않아야 같은 입력·같은 사본·같은 시각이면 결과가 같다(02:326, 06:422). 사용자가 보는 동작은 같다 |
| X2 | 도메인 검증 진입점은 `validate(table, column, record)`(06:448) | `validate(table, column, record, Instant evalTs)` | `MASTER` 판정 시각이 필요하다(06:422 "검증 한 번마다 하나") |
| X3 | DefinitionLookup 항목에 데이터 타입이 없다(06:461) | `ColumnDefinition` 에 `dataType`·`scale` 을 더했다 | 02 실행 순서 3단계 타입 변환이 필요로 한다(02:384-386) |
| X4 | FunctionProvider 는 "비즈니스 함수 목록을 준다" | 중립 기술자 `BusinessFunction` + `Body`. 지연(lazy) 인자는 받지 않는다 | spi 에 EvalEx 타입을 쓸 수 없다(06:461). 지연 평가는 EvalEx 부분 트리 평가가 필요해 중립 타입으로 표현할 수 없다. 인자별 NULL 허용 표지는 입력 계약 필수·선택 판정(06:208)이 쓴다 |
| X5 | CodeLookup 항목에 CATE 의 `def_target` 이 없다(06:461) | `CodeCateRow.defTarget` 을 포함한다 | REGEX 해석 대상 칸이다(04:178) |
| X6 | `CODE_LIST` 를 "함수"라 부른다 | EvalEx 함수가 아니라 `CodeResolver.codeList(…)` Java API 다 | 룰 식에 쓰지 않는다(06:316). 식 사전에 넣지 않는다 |
| X7 | 룰 버전은 "엔진이 평가 시각으로 고른다"(06:420) | `DefinitionLookup.rule(ruleId, evalTs)` 구현체가 고른다 | 의존성 규칙 5(06:471)와 맞춘다. 엔진은 evalTs 를 넘길 뿐이다 |

## 13. 후속 Task 인계

| 받는 Task | 인계 |
|---|---|
| TSK-03-01 엔진 공유 계약 | `docs/mdm/engine-contract/java/**` 를 `maru-mdm-engine/src/main/java` 로 옮긴다. `create` 등 `UnsupportedOperationException` 본문은 계약 전용 그대로 둔다. 스키마를 m-mdm 으로 가져가 `json-schema-to-typescript` 로 TS 를 생성하고(design D6), 엔진 테스트에 스키마 적합 검사를 더한다. ArchUnit 은 그대로 통과해야 한다 |
| TSK-03-02 식 평가 코어 | `MdmExpressionConfig.create`, `AstExporter`(06:446, 자식이 없으면 `params` 키를 빼는 규칙), `MASTER`·`MASTER_AT`·`INSTR` `AbstractFunction`, base_dt 해석(§7), `CodeResolver` 구현, `DomainValidator`, `ExpressionEvaluator` 를 팩토리로 전환, 동시 평가 1,000 스레드 `copy()` 검증 |
| TSK-03-03 룰 판정 엔진 | `RuleEngine`·`RuleResult`·`RuleSetResult`·`RuleView`·`EngineEvaluationException` 구현. 생성 텍스트는 `FunctionSets.GENERATED` 안에서 만든다 |
| TSK-03-04 JS 평가기·코퍼스 | §10 범위. 원천 인터프리터에 `INSTR`·`STR_LEFT`·`STR_RIGHT`·`STR_SUBSTRING` 을 더하고 NULL 동작을 서버에 맞춘다. §11 코퍼스 필수 사례 |
| TSK-02-03 DB 설계 | `TB_MDM_TERM` 에 `EMBEDDING`·`EMBEDDING_MODEL`([term-embedding.md](term-embedding.md) §5 DDL) |
| TSK-04-01 02 계약 | Flyway 칼럼(SQLite `BLOB`), JDBC 왕복 실측(naming-dialect-rules §3 #23 상태 갱신), 엔티티 미매핑 |
| TSK-04-02 용어 관리 | ORT 1.30.0·DJL tokenizers 0.38.0 을 `mdm/lib` 에, 모델 경로 설정, [term-embedding.md](term-embedding.md) §6 동작 규칙 1~6, 모델 파일 출처 결정(design D3) 결과, 메모리 산정(RSS 약 1.3 GB) |
