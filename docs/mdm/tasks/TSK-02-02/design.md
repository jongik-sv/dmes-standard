# TSK-02-02 설계 — 평가 엔진 설계 + 임베딩 방식 조사

> 주문 `fae5410a-20f5-4eca-aa0a-71acc017566a` · category design(research) · domain infra · 작성 2026-09-24 (Design Phase, 무인 모드)
> 입력: `spec.md`(요구사항 데이터) · PRD 1.2 · TRD 1.2 · decisions.md(D-001~D-019) · naming-dialect-rules.md · ADR-0001~0003 · wbs.md v1.3(TSK-03-01~04, TSK-04-01·02) · 원천 설계 `/Users/jji/project/mdm/docs/design/basic/`(02·04·05·06·evalex-guide) · 원천 샘플 `/Users/jji/project/mdm/js/`(AstExporter.java, evalex-ast-interpreter.js) · 스캐폴드 `src/backend/maru-mdm-engine/` · EvalEx 3.7.0 jar(javap·실행 확인) · HF `nlpai-lab/KURE-v1`·`thkmon/KURE-v1-onnx-int8` · Microsoft Learn(vector 타입)
> 근거 강약: spec 본문 > 승인된 선행 산출물 > 리포 관례 > 미승인 선행 산출물(TSK-02-01 은 dev 머지·승인 전이나 팀장 지시로 정본 취급)

**운영 판단(오케스트레이터)**: research/docs 특례에 준한다. 게이트 = §3 문서 검증 체크리스트 + `testAll` 회귀(395/0). Refactor 생략. `src/` 는 고치지 않는다(엔진 계약 코드는 TSK-03-01 몫).

**이 Phase 가 이미 만든 것(커밋됨)**: ① 임베딩 PoC `poc/mdm-embedding-bench/`(측정 완료, 원시 결과 포함) ② 엔진 계약 초안 `docs/mdm/tasks/TSK-02-02/contract-draft/`(Java·TS·JSON Schema·검증 도구. 스크래치에서 `javac`·`tsc`·`jsonschema` 통과 확인). Build 는 ②를 `docs/mdm/engine-contract/` 로 옮기고 문서 4곳을 고친다(§2).

---

## 0. 조사로 확인한 사실 (Build 가 다시 조사하지 않아도 되게 적는다)

원천 경로 약어: `02`·`04`·`05`·`06`·`EG` = `/Users/jji/project/mdm/docs/design/basic/{02-term-domain-column,04-master-code-deploy-full,05-master-data,06-business-rule,evalex-guide}.md`, `JS` = `/Users/jji/project/mdm/js/`.

### 0.1 엔진

| # | 사실 | 근거 |
|---|---|---|
| F1 | 엔진 실물 패키지는 `kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}`(group `kr.dongkuk.maru.mdm`, version `0.1.0-SNAPSHOT`, `maven-publish`). TRD §1 의 `com.dongkuk.dmes.mdm.engine` 은 사실과 다르다 | `src/backend/maru-mdm-engine/build.gradle:6-11`, `docs/mdm/TRD.md:18` |
| F2 | 엔진 main 의존은 `api 'com.ezylang:EvalEx:3.7.0'` 하나다. ArchUnit 이 main 클래스의 의존을 `engine..`·`com.ezylang.evalex..`·`java.lang/util/math/time/text..` 로 제한하고 `java.sql`·`javax.sql`·`java.net`·`java.nio.channels` 를 금지한다(`java.io` 도 허용 목록 밖) | `maru-mdm-engine/build.gradle:28-31`, `MaruMdmEngineArchitectureTest.java:28-46` |
| F3 | 스캐폴드 `ExpressionEvaluator` 는 `new Expression(expression)`(기본 설정)으로 평가한다. 설정 팩토리를 거치지 않는다 | `maru-mdm-engine/src/main/java/.../expr/ExpressionEvaluator.java:25-32` |
| F4 | 원천이 정한 패키지 다섯과 의존 방향: `spi` 는 다른 패키지에 의존하지 않고, `code` 는 `spi` 만, `expr` 는 `spi`·`code`, `rule`·`domain` 은 `expr`·`spi` 를 본다. spi 시그니처에 EvalEx 타입을 쓰지 않는다 | `06:455-463` |
| F5 | spi 다섯의 원천 정의: DefinitionLookup = (table, column) → 유효 식 텍스트·종류·유효 코드 참조·비즈니스 요구 변수·ref_kind·ref_target·ref_cate_id·required, 세트 ID → 세트 정의. CodeLookup = 다섯 테이블 행 그대로. CodeEffLookup = (ver, cate_id) 코드 집합(원장 서버 구현체는 비움). MasterLookup = (ID, 카테고리, 키, 기준일) 유효 / + 추가 컬럼 번호 → 값. FunctionProvider = 비즈니스 함수 목록 | `06:461` |
| F6 | 버전 고르기는 spi 구현체·호출자 몫이고 모듈은 "배포된 정의를 받아 실행"만 한다. AST JSON 은 모듈이 만들기만 하고 읽지 않는다. JSON 직렬화는 호출자 몫(Map 반환) | `06:467·471` |
| F7 | 배포 스냅샷 항목: 헤더(`maru_rule_id, ver, rule_kind, hit_policy, apply_from, apply_to`, 엔진 모듈 버전), 변수(var_id·var_kind·var_name·seq·데이터 타입·소수 자리수·도메인 ID·collect_agg·순위 목록·res_grp·열 조건 텍스트·AST·식 변수 텍스트·AST·참조 변수), 입력 계약(이름마다 타입), 행(row_id·seq·row_kind), 셀(op-code 구조 + 생성 텍스트, Expression 텍스트 + AST, 결과 Value 리터럴 텍스트), 세트(`maru_rule_set_id, rule_ids, status`) | `06:1156-1165` |
| F8 | 셀 JSON 키는 `op, left, right, list, expr, ast, val` 일곱뿐이고 **값은 전부 문자열**(JSON 숫자면 화면 JS 가 double 로 읽어 십진 비교가 깨진다). 모양 11종 | `06:1036-1054` |
| F9 | 엔진 골격: ctx = 레코드 사본 + `EVAL_TS`, 행마다 조건 셀 `copy().withValues(ctx).evaluate()` 를 allMatch, 적중 행의 결과 셀을 `ctx.put`, `RuleResult(rowId, seq, ctx)` 반환. 캐시 원본에 값을 넣지 않고 `copy()` 사본에 넣는다 | `06:394-414`, `06:449` |
| F10 | 엔진 계약: 입력 계약 4단계 검사(조건 검사 → 행 고르기 → 결과 검사 → 결과 평가, 어긋난 것을 단계마다 모아 한 번에), 폐기 세트는 판정 오류, 세트는 첫 룰 전에 입력 키 일괄 확인, 타입 변환(Number→BigDecimal·String·Boolean), 평가 시각 `EVAL_TS`(초 단위, "호출자가 주고 주지 않으면 현재 시각"), 상수 이름 키·`EVAL_TS` 키·`_` 시작 키는 판정 오류, 식 변수 `_V<var_id>` 사전 계산, Expression 셀·열 조건의 NULL 결과는 그 셀만 거짓 + 경고 | `06:197-200`, `06:210-219`, `06:416-427` |
| F11 | 적중 행 번호 반환(06:92), 그룹마다 고른 열의 var_id 반환(06:69), 값 테스트 화면은 떨어진 행의 첫 거짓 셀을 표시(06:319), PRIORITY·COLLECT·ANY 는 적중한 행 전부가 결과 검사 대상(06:216) | 각 행 |
| F12 | 설정 고정 요구: `ExpressionConfiguration` 하나를 모듈이 만든다. precision 68·HALF_EVEN, 허용 함수만 넣은 사전(시각·난수·로캘·환경 함수 제외 — `RANDOM`·`DT_NOW`·`DT_TODAY`), `STR_FORMAT` 은 넣으려면 로캘 고정, `allowOverwriteConstants=false`, `regexTimeoutMillis` 값 고정 | `06:442` |
| F13 | 허용 함수: 표준 칸용 = EG §8.5 목록(`IF SWITCH COALESCE NOT ABS CEILING FLOOR SQRT ROUND MIN MAX SUM AVERAGE STR_*`) + `MASTER`·`MASTER_AT` + `INSTR`. 비즈니스 칸용 = 표준 + 등록된 비즈니스 함수. 룰 조건·결과 셀은 표준 칸용. 사전에는 둘 다 넣고 칸별 제한은 저장 시 검사. 02 「검증식 계약」은 표준식을 "8.5 + `MASTER`" 로 적는다(MASTER_AT 언급 없음) | `06:443`, `EG:222`, `02:175` |
| F14 | EvalEx 3.7.0 `ExpressionConfiguration.ExpressionConfigurationBuilder` 공개 메서드(javap): `operatorDictionary, functionDictionary, mathContext, dataAccessorSupplier, defaultConstants, arraysAllowed, structuresAllowed, binaryAllowed, implicitMultiplicationAllowed, singleQuoteStringLiteralsAllowed, lenientMode, powerOfPrecedence, decimalPlacesResult, decimalPlacesRounding, stripTrailingZeros, allowOverwriteConstants, zoneId, locale, maxRecursionDepth, regexTimeoutMillis, dateTimeFormatters, evaluationValueConverter, build`. 사전 도구 `MapBasedFunctionDictionary.ofFunctions(Map.Entry...)`, `ExpressionConfiguration.withAdditionalFunctions(...)` | `javap` on `~/.gradle/caches/modules-2/files-2.1/com.ezylang/EvalEx/3.7.0/37713e92…/EvalEx-3.7.0.jar` |
| F15 | EvalEx 3.7.0 기본값(실행 확인): MathContext precision 68 HALF_EVEN, `DEFAULT_REGEX_TIMEOUT_MILLIS=100`, `maxRecursionDepth=2000`, `allowOverwriteConstants=true`, `stripTrailingZeros=true`, `binaryAllowed=false`, **zoneId·locale 은 JVM 기본값**(이 PC 에서 `Asia/Seoul`·`ko_KR`), 표준 상수 8종 `DT_FORMAT_ISO_DATE_TIME, DT_FORMAT_LOCAL_DATE, DT_FORMAT_LOCAL_DATE_TIME, E, FALSE, NULL, PI, TRUE`, 토큰 종류 `…STRING_LITERAL, NUMBER_LITERAL, VARIABLE_OR_CONSTANT, INFIX_OPERATOR, PREFIX_OPERATOR, POSTFIX_OPERATOR, FUNCTION, …, ARRAY_INDEX, STRUCTURE_SEPARATOR`. 기본 함수 사전에 `STR_CONTAINS` 가 있다 | 스크래치 `Probe.java` 실행 결과 |
| F16 | `allowOverwriteConstants(false)` 면 `with("NULL"|"null", …)` 가 `UnsupportedOperationException: Can't set value for constant` 를 낸다(대소문자 무시). 기본 설정이면 상수를 지워 `V != NULL` 이 조용히 틀린다 | 같은 실행, `contract-draft/samples/AstSampleExport.java` 출력 `constantKey` |
| F17 | 사전 밖 함수는 **파싱 단계**에서 `ParseException: Undefined function 'X'` 로 거부된다. 초안 설정에서 `B[0]`·`c.d`·`'A'` 는 `Undefined operator`, `2x` 는 `Missing operator` 로 거부된다 | `contract-draft/samples/AstSampleExport.java` 실행(`rejected` 9건, unexpected 0) |
| F18 | AST 모양: 숫자 리터럴 value 는 입력 원문(`1.60`, `1e-3`, `0xFF`, `.5` 도 파싱됨), 음수는 `PREFIX_OPERATOR -` + 숫자, `-2^2` 는 `^(PREFIX -(2), 2)`, 문자열 리터럴 value 는 이스케이프를 푼 값, `AstExporter` 는 자식이 없으면 `params` 키를 뺀다 | 같은 실행, `JS/AstExporter.java:39-54` |
| F19 | EvalEx 3.7.0 의 NULL 인자 동작(기본 설정): `X + 1` → 문자열 `"null1"`, `X * 2` → EvaluationException, `X < 1`·`X && TRUE`·`NOT(X)`·`!X`·`ABS·CEILING·FLOOR·SQRT·ROUND·SUM·AVERAGE·STR_LENGTH/UPPER/LOWER/TRIM/LEFT/RIGHT/SUBSTRING/STARTS_WITH/ENDS_WITH/MATCHES` → NPE, `MIN(X, 1)` → 1 이지만 `MAX(N, X)` → NPE, `STR_CONTAINS(X, "a")` → false, `IF(X, 1, 2)` → 2, `COALESCE(X, 5)` → 5, `FALSE && X` → false. `STR_SUBSTRING("ABCDE", 1, 2)` → `"B"`(0부터, 끝 배타) | `contract-draft/samples/evalex-null-probe.txt`(`EvalExNullProbe.java` 출력) |
| F20 | 원천 JS 인터프리터 샘플의 함수 표에 `INSTR`·`STR_LEFT`·`STR_RIGHT`·`STR_SUBSTRING` 이 **없다**(EG 8.5 는 INSTR 을 요구). 또 NULL 처리가 서버와 갈린다: `+` 는 `num(null)` 로 예외(서버는 `"null1"`), `MIN(null,1)` 예외(서버 1), `STR_CONTAINS` 는 `str(null)="null"` 로 검사(서버 false) | `JS/evalex-ast-interpreter.js:94·116-144·58-62` |
| F21 | `MASTER`·`MASTER_AT` 시그니처: `MASTER(id, cate, key[, attr])`, `MASTER_AT(id, cate, key, base_dt[, attr])`. 불리언 형태 / 속성 형태(attr01-10 문자열 그대로, 유효하지 않으면 NULL). key NULL 이면 false/NULL, 데이터·카테고리 없으면 false/NULL. base_dt 는 초 단위, 일자 타입이면 그날 00:00:00, KST 고정. 가변 인자라 파서는 최소 인자 수만 본다(초과는 저장 시 AST 검사) | `05:363-400`, `02:393-416`, `EG:223` |
| F22 | `CODE_LIST(id, cate[, base_dt])` 는 콤보 목록 API 다(열 code·name·alter_name·seq, seq 순, DEPRECATED 는 빈 목록). "현재 시각을 그때그때 읽는다". 룰 식에는 쓰지 않는다 | `02:418-429`, `06:316` |
| F23 | 원천의 소스 레코드 값 타입은 String·Number·Boolean 뿐이다(컬럼 사전 데이터 타입은 String·Number 둘, Boolean 은 결과 변수에만). 초 정밀도 DATE 도메인의 문자열 형식은 원천 어디에도 없다 | `06:125-127`, `02:59` |
| F24 | 화면 미리보기 범위: op-code 셀은 구조 직접 비교(Number→Decimal, String·일자 String→UTF-16 코드유닛 순서, 패턴 단순형은 startsWith/endsWith/indexOf, 나머지는 서버가 준 정규식, CONTAINS·INSTR 은 indexOf, CODE_IN 은 받아 둔 코드 집합), Expression 셀만 AST 인터프리터, `isSupported()` 거짓이면 서버 API. 화면과 서버가 다르면 서버가 기준. "결과 셀 미리보기" 는 원천 미결 | `06:271`, `06:716-731`, `06:389`, `EG:222-225` |
| F25 | 코퍼스 항목 = (셀 JSON, 변수 값, 기대 결과), 필수 사례 목록 11종 | `06:284-296` |
| F26 | 값 테스트 케이스 표본 `input_json` 은 JSON 숫자를 쓴다(`{"COIL_THK":1.8,…}`) — 셀 JSON "값은 전부 문자열" 규칙과 다르다 | `06:1060-1063` 부근 `TB_MDM_RULE_TEST_CASE` |

### 0.2 임베딩

| # | 사실 | 근거 |
|---|---|---|
| E1 | 원천: 2차 의미 추천은 `표기 + 정의 + 영문명` 을 벡터화해 코사인 top-N. 벡터는 별도 벡터 DB 없이 `TB_MDM_TERM.embedding` 칼럼 하나(PostgreSQL 이면 pgvector). "용어는 많아야 수만 건이라 인덱스 없는 전체 비교도 밀리초 수준". 등록·수정 시 1회 인코딩, 조회 시 입력어 1건만 인코딩 | `02:525-535`, `02:817` |
| E2 | 원천: ONNX Runtime Java 로 MDM 서버에 내장, INT8 동적 양자화(사용자 결정 2026-09-22), "변환은 MIT 인 원본 FP32 에서 직접 하고, 풀링(CLS)과 L2 정규화는 Java 쪽에서" | `02:536` |
| E3 | 원천: 모델은 KURE-v1(1024차원, 최대 8192토큰, MIT). `embedding_model` 에 벡터를 만든 모델을 적고, 모델을 바꾸면 그 값이 새 모델이 아닌 행만 다시 만든다. 재구축 중에는 새 모델 이름 행끼리만 비교 | `02:537-540`, `02:818` |
| E4 | `nlpai-lab/KURE-v1` rev `8b418a58414668e75532ed045c22d9ca018ae2b2`: `1_Pooling/config.json` = `pooling_mode_cls_token: true`(mean·max 등 false), `modules.json` = Transformer → Pooling → **Normalize**, `config_sentence_transformers.json` `prompts: {}`(질의·문서 접두어 없음), `similarity_fn_name: cosine`, XLM-RoBERTa 24층·hidden 1024·`type_vocab_size 1` | HF API·파일 직접 읽음 |
| E5 | INT8 변환본 `thkmon/KURE-v1-onnx-int8` rev `118dcc12c125320225de077e57a9f367ce8f6407`(MIT): `model.onnx` 568,451,402 bytes, sha256 `1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b`, `tokenizer.json` sha256 `fb3c3b93…1dfd`, README 가 `quantize_dynamic` QInt8·opset 17·fp32 출력이라고 적는다. **README 는 풀링을 "masked mean pool + L2" 로 적는데, 원본 모델 설정(E4)과 다르다.** `LaraAI-Labs/KURE-v1-onnx-int8`(rev `dbe4aab5…`)도 같은 파일 구성이다 | 다운로드·`shasum`, README |
| E6 | ONNX 그래프(ORT 세션 메타): 입력 `input_ids`·`attention_mask`(INT64 `[batch, seq]`), **`token_type_ids` 없음**, 출력 `last_hidden_state`(FLOAT `[batch, seq, 1024]`) 하나 | `poc/mdm-embedding-bench/results/raw-01-info-tokens.txt` |
| E7 | 토크나이저 `tokenizer.json`: Unigram, TemplateProcessing(`<s> … </s>`), truncation max 2048, pad_id 1. DJL 0.38.0 은 jar 안 osx-aarch64·linux-x86_64·linux-aarch64 네이티브를 `~/.djl.ai/tokenizers/` 로 풀어 쓴다(네트워크 없음). `optMaxLength(2048)` 을 줘도 "modelMaxLength" 경고와 함께 512 로 낮춘다 — 용어 입력 최대 100 토큰이라 영향 없음 | 같은 파일, `~/.djl.ai/tokenizers/0.21.0-0.38.0-cpu-osx-aarch64/` |
| E8 | 측정 결과(Apple M5 10코어·16GB, ORT Java 1.30.0, intra-op 4): 단건 인코딩 전체 입력 p50 29.1/p95 42.1 ms, 표기만 p50 7.5/p95 8.8 ms, **질의 1건(표기 인코딩 + 1만×1024 전수 코사인 top-5) p50 20.0/p95 22.2 ms**, 전체 입력 질의 p95 76.2 ms, **1만 건 일괄 336.2 s(5.6 분, 단독 재측정 — 다른 작업과 겹친 첫 측정은 486.9 s)**, 콜드 로드 0.8-4.8 s, RSS 로드 후 약 1.3 GB·일괄 중 최대 1.4-2.0 GB. CPU 에서는 배치 크기를 키워도 빨라지지 않는다(배치 1: 33.6, 32: 39.8 ms/건), 길이순 정렬을 안 하면 63.1 ms/건, intra 10 은 느려진다 | `poc/mdm-embedding-bench/results/README.md`, `raw-02~06` |
| E9 | 전수 비교(단일 스레드, 인코딩 제외) p95: 1만 4.9 ms · 5만 24.9 ms · 10만 50.9 ms · 25만 124.4 ms · 100만 661.0 ms(행당 약 0.5 µs 선형, 100만이면 행렬 3.9 GB) | `raw-05-scan.txt` |
| E10 | SQLite 3.45.3(sqlite-jdbc 3.45.3.0, mdm/lib 과 같은 버전) `BLOB` 1만 행: 적재 91.7 ms, `WHERE EMBEDDING_MODEL = ?` 전체 읽기 + float32 LE 디코드 23.1 ms, 비트 단위 왕복 일치, 파일 44 MB | `raw-07-sqlite.txt`, `src/backend/mdm/lib/build.gradle:31` |
| E11 | 풀링 정성 확인(유사어 15쌍, 질의 표기만): CLS top-5 12/15, masked mean 11/15. 합성 코퍼스라 품질 근거로 쓰지 않는다 | `raw-08-pooling.txt` |
| E12 | 합성 코퍼스 1만 건 토큰 수(특수 토큰 포함): 전체 입력 p50 55·p95 83·max 100, 표기만 p50 9·p95 11·max 16 | `raw-01-info-tokens.txt` |
| E13 | MSSQL `VECTOR` 타입은 **SQL Server 2025(17.x)**·Azure SQL DB/MI·Fabric 전용이다. 최대 1998 차원, float32 기본, DEFAULT·CHECK·키 제약·B-tree 인덱스 불가. JDBC 네이티브 전송은 Microsoft JDBC **13.1.0** 부터(그 전 드라이버는 `varchar(max)` JSON 배열로 주고받음) | Microsoft Learn "Vector Data Type"(ms.date 2026-02-18) |
| E14 | 운영 MSSQL 버전은 저장소에서 **확인 불가**. 단서는 cactus 문서의 Testcontainers 이미지 `mssql/server:2022-latest` 한 줄뿐이고, 리포 JDBC 드라이버는 `mssql-jdbc 12.8.1.jre11` 이다 | `docs/cactus/001_…/cactus-core-data-access-migration-plan.md:1095`, `src/backend/mdm/lib/build.gradle:37` |
| E15 | 감사 9칼럼은 `CactusAuditEntity` 리스너가 채우고, 엔티티를 거치지 않는 쓰기(네이티브 UPDATE)는 SQL 에 감사 칼럼을 명시적으로 넣는다 | `docs/mdm/naming-dialect-rules.md:31` |
| E16 | 소비자 수용 기준: TSK-04-02 "용어 1만 건 추천 응답 500 ms 이내", "embedding_model 이 다른 행은 재인코딩 대상으로 잡힌다". TSK-04-01 은 02 테이블 7개 Flyway(두 방언)·엔티티, TSK-02-03 은 02 DDL 초안 소유 | `docs/mdm/wbs.md:554-555`, `wbs.md:490-515`, `naming-dialect-rules.md:96` |

### 0.3 D'Flow spec 과 저장소 문서의 차이

| 항목 | spec(서버) | 저장소 | 따른 것 |
|---|---|---|---|
| 선행 산출물 | spec 은 depends 만 적음 | TSK-02-01 이 dev 에 머지(승인 전), 화면 그룹 `dma~dme`, D-012~019 | 저장소(팀장 지시) |
| 엔진 패키지 | 원천 06 링크(`kr.dongkuk.maru.mdm.engine`) | TRD §1 `com.dongkuk.dmes.mdm.engine` | 실물 = 원천(F1). TRD 를 고친다 |

---

## 1. 접근 방식

이 Task 는 두 결정을 낸다. 하나는 **엔진 공유 계약**(TSK-03-01 이 옮겨 쓸 인터페이스·설정·스키마), 다른 하나는 **용어 임베딩 저장·검색 방식**(TRD 가정 T6)이다.

엔진 계약은 글로만 적지 않고 **컴파일되는 초안 파일**로 만들었다. 원천 06·05·02·EG 의 문장을 spi 인터페이스·record·enum 으로 옮기고, 원천 문장마다 파일:행을 주석에 달았다. 기억에 기대지 않도록 EvalEx 3.7.0 jar 를 `javap` 와 실행으로 확인해(F14~F19) 빌더 메서드 이름·기본값·NULL 동작·AST 모양을 사실로 고정했다. JSON 으로 오가는 모양(AST·셀·코퍼스·판정 결과)은 **JSON Schema 하나를 정본**으로 두고, Java record·TS 타입은 그 거울로 둔다. 초안이 "그대로 옮길 수 있다"는 주장을 게이트로 만들기 위해 ① Java 초안을 EvalEx jar 와 `javac -Werror` 로 컴파일 ② 초안 설정으로 원천 예시 식 29개를 실제 파싱해 나온 AST 를 스키마로 검증하고 거부돼야 할 식 9개가 거부되는지 확인 ③ TS 초안이 같은 표본을 `tsc --strict` 로 받아들이고 틀린 모양을 거부하는지 확인한다(§3 V2~V6). 초안은 엔진 모듈에 넣지 않는다.

임베딩은 **측정을 먼저 했다**. 독립 PoC(`poc/mdm-embedding-bench`)로 KURE-v1 INT8 을 ONNX Runtime Java 로 돌려, 1만 건 기준 질의 p95 22 ms(표기만), 전수 비교는 행당 0.5 µs 로 10만 건에서도 51 ms 임을 확인했다(E8·E9). 속도가 500 ms 기준을 20배 넘게 남기므로 ANN 인덱스·DB 네이티브 벡터는 필요 없다. 그래서 선택을 가르는 것은 속도가 아니라 **방언 이식성(NFR-6)과 원천 DDL 불변**이다. 원천 02 가 정한 대로 `TB_MDM_TERM` 에 칼럼을 두되 벡터 타입 대신 `BLOB`/`VARBINARY(4096)`(float32 LE)로 두고, 비교는 서버 메모리에서 한다(선택안 ①). 재검토 임계는 측정값에서 정한다(§6.13).

판단 기준은 근거 순위다. 원천이 정한 것(spi 다섯, 설정 고정 항목, 셀 JSON, MASTER 시그니처, 칼럼 하나 저장)은 그대로 따르고, 원천이 비워 둔 칸(초 정밀도 일시 문자열, 문법 축소, 결과 타입 세부)은 되돌리기 쉬운 쪽을 택해 `## 담당자 확인 필요 결정` 에 남긴다.

---

## 2. 변경 파일 목록

`src/` 는 건드리지 않는다. 모든 변경은 `docs/` 안이다(PoC 는 이 Phase 가 이미 커밋).

### 2.1 생성

| # | 파일 | 내용 | 문안 정본 |
|---|---|---|---|
| C1 | `docs/mdm/engine-contract.md` | 엔진 공유 계약 문서(패키지·spi·설정 고정값·허용 함수 표·예약 이름·MASTER 계열·판정 결과·AST 스키마·화면 JS 범위·코퍼스 형식·원천 이탈·인계) | §6.1~§6.10, 골격 §6.16 |
| C2 | `docs/mdm/engine-contract/` (폴더) | `docs/mdm/tasks/TSK-02-02/contract-draft/` 를 **`git mv` 로 옮긴다**(내용 불변). `schema/engine-contract.schema.json`, `java/kr/dongkuk/maru/mdm/engine/**`(18파일), `ts/engine-contract.ts`, `samples/{AstSampleExport.java, EvalExNullProbe.java, evalex-null-probe.txt, sample-corpus.json, validate.py, tscheck.sh}` | 이미 있음 |
| C3 | `docs/mdm/term-embedding.md` | 용어 임베딩 방식 결정 문서(모델·런타임·입력 형식·측정 요약·저장 방식 비교·DDL·동작 규칙·재검토 임계·인계) | §6.11~§6.13, 골격 §6.16 |

C2 옮긴 뒤 폴더 구조(검증 명령이 이 경로를 쓴다):

```
docs/mdm/engine-contract/
  schema/engine-contract.schema.json
  java/kr/dongkuk/maru/mdm/engine/spi/{DefinitionLookup,CodeLookup,CodeEffLookup,MasterLookup,FunctionProvider,EngineLookups}.java
  java/kr/dongkuk/maru/mdm/engine/expr/{MdmExpressionConfig,FunctionSets,ReservedNames,AstNode,EngineWarning,EngineEvaluationException}.java
  java/kr/dongkuk/maru/mdm/engine/code/CodeResolver.java
  java/kr/dongkuk/maru/mdm/engine/rule/{RuleEngine,RuleResult,RuleSetResult,RuleView}.java
  java/kr/dongkuk/maru/mdm/engine/domain/DomainValidator.java
  ts/engine-contract.ts
  samples/{AstSampleExport.java,EvalExNullProbe.java,evalex-null-probe.txt,sample-corpus.json,validate.py,tscheck.sh}
```

옮긴 뒤 `ts/engine-contract.ts:4-5` 와 `schema/engine-contract.schema.json` 의 `design §6.3` 참조는 그대로 둔다(이 design.md 는 남는다).

### 2.2 수정 (파일:행 → 새 문안)

| # | 파일:행 | 원문(요지) | 새 문안 |
|---|---|---|---|
| M1 | `docs/mdm/decisions.md` 끝 | (D-019 까지) | D-020~D-025 **추가만**(§6.14 문안 그대로). 기존 항목 수정 금지 |
| M2 | `docs/mdm/TRD.md:3` | `> version: 1.2 · … 2026-09-24(전사 아키텍처 확정 — TSK-02-01)` | `> version: 1.3 · … 2026-09-24(전사 아키텍처 확정 — TSK-02-01), 2026-09-24(엔진 계약·임베딩 방식 — TSK-02-02)` |
| M3 | `docs/mdm/TRD.md:18` | `- 엔진 패키지: \`com.dongkuk.dmes.mdm.engine.{expr,rule,domain,code,spi}\` (06 「엔진 모듈」).` | `- 엔진 패키지: \`kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}\` (06 「엔진 모듈」, 스캐폴드 실물 — TSK-01-01 D7). 계약: [engine-contract.md](engine-contract.md)` |
| M4 | `docs/mdm/TRD.md:30` | `\| 식 엔진 \| EvalEx 3.7.0 (precision 68, HALF_EVEN) \| 06, evalex-guide \|` | `\| 식 엔진 \| EvalEx 3.7.0 (precision 68, HALF_EVEN, allowOverwriteConstants=false, 시간대 Asia/Seoul·로캘 ROOT 고정) \| 06, evalex-guide, [engine-contract.md](engine-contract.md) \|` |
| M5 | `docs/mdm/TRD.md:31` | `\| 임베딩(용어 유사어 2차) \| KURE-v1 ONNX INT8 + ONNX Runtime Java(CPU) \| 02 「임베딩」 — 저장 방식은 조사 Task \|` | `\| 임베딩(용어 유사어 2차) \| KURE-v1 ONNX INT8 + ONNX Runtime Java 1.30.0(CPU) + DJL tokenizers 0.38.0, CLS 풀링·L2. mdm 서버 모듈에만 둔다(엔진 jar 금지). 저장은 원장 칼럼 + 서버 메모리 전수 비교 \| 02 「유사어 추천 방식」, [term-embedding.md](term-embedding.md) \|` |
| M6 | `docs/mdm/TRD.md:65` | `\| \`vector\` (용어 임베딩) \| 대응 없음 \| 대응 없음(버전별 상이) → 조사 Task \|` | `\| \`vector\` (용어 임베딩) \| \`BLOB\`(float32 LE 4,096바이트) \| \`VARBINARY(4096)\`(네이티브 \`VECTOR\` 는 SQL Server 2025 이상 전용이라 쓰지 않음) — [term-embedding.md](term-embedding.md) \|` |
| M7 | `docs/mdm/TRD.md:127` | `\| T5 \| 엔진 jar 는 … 1차는 composite build 의존으로 쓴다 \| 엔진 설계 \|` | `\| T5 \| (같은 문장) \| **확정** 2026-09-24 — group \`kr.dongkuk.maru.mdm\`·\`0.1.0-SNAPSHOT\`·\`maven-publish\`, 1차 composite build. 스냅샷 헤더 엔진 버전 검사는 배포와 함께 보류 — [engine-contract.md](engine-contract.md) \|` |
| M8 | `docs/mdm/TRD.md:128` | `\| T6 \| 용어 임베딩은 원장 DB 밖(파일 인덱스 또는 별도 저장)에 둘 수 있다. … \| 임베딩 조사 \|` | `\| T6 \| (같은 문장) \| **확정** 2026-09-24 — 원장 DB 안 \`TB_MDM_TERM.EMBEDDING\`(BLOB/VARBINARY float32 LE) + 서버 메모리 전수 비교. 파일 인덱스·네이티브 vector 는 쓰지 않는다. 활성 벡터 10만 건 또는 추천 p95 250 ms 에서 재검토 — [term-embedding.md](term-embedding.md) \|` |
| M9 | `docs/mdm/TRD.md` §10 끝(현재 마지막 bullet `- 파생값(…)…` 다음 줄) | — | 추가: `- 임베딩 런타임(ONNX Runtime·토크나이저)과 모델 파일은 mdm 서버 모듈 몫이다. 모델 파일(약 568 MB)은 WAR·저장소에 넣지 않고 서버 파일 경로로 준다. 모델이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다.` |
| M10 | `docs/mdm/naming-dialect-rules.md:74` | `\| 23 \| \`vector\`(02:533·600) \| — \| — \| 이 표 범위 밖 \| TSK-02-02(임베딩 조사) \|` | `\| 23 \| \`vector\`(02:533·600) \| \`EMBEDDING BLOB\` NULL 허용 + \`EMBEDDING_MODEL VARCHAR(100)\` \| \`EMBEDDING VARBINARY(4096)\` NULL 허용 + \`EMBEDDING_MODEL VARCHAR(100)\` \| 값은 L2 정규화한 float32 little-endian 1024개(4,096바이트). DB 벡터 함수·네이티브 \`VECTOR\`·확장(sqlite-vec) 금지, 비교는 애플리케이션 메모리. 엔티티는 두 칼럼을 매핑하지 않고 네이티브 SQL 로만 읽고 쓴다([term-embedding.md](term-embedding.md)) \| SQLite 왕복 **확인(TSK-02-02 실측)**. MSSQL 왕복 **실측 필요 → TSK-04-01** \|` |
| M11 | `docs/mdm/naming-dialect-rules.md:97` 다음 줄(§6.1 표 끝) | — | 행 추가: `\| TSK-04-01 · TSK-04-02 \| §3 #23 임베딩 칼럼 DDL·MSSQL 왕복 실측, [term-embedding.md](term-embedding.md) 동작 규칙 \|` |
| M12 | `docs/mdm/README.md:7` 다음 줄 | — | 두 줄 추가: `- [engine-contract.md](engine-contract.md) — 평가 엔진 공유 계약(spi·EvalEx 설정·허용 함수·AST 스키마·화면 JS 범위·코퍼스 형식). 계약 파일 [engine-contract/](engine-contract/)` 와 `- [term-embedding.md](term-embedding.md) — 용어 임베딩 모델·저장·검색 방식(TRD T6)` |

### 2.3 이 Phase 가 이미 만든 것(커밋됨 — Build 는 고치지 않는다)

| 경로 | 내용 |
|---|---|
| `poc/mdm-embedding-bench/{settings.gradle,build.gradle,.gitignore,README.md}` | 독립 Gradle PoC(ORT 1.30.0, DJL tokenizers 0.38.0, sqlite-jdbc 3.45.3.0). `build/`·`.gradle/`·`*.onnx`·`*.db`·`model/` 무시 |
| `poc/mdm-embedding-bench/src/main/java/com/dongkuk/dmes/mdm/poc/embedding/{TermCorpus,KureEncoder,Bench}.java` | 합성 코퍼스·인코더·측정 8모드 |
| `poc/mdm-embedding-bench/results/{README.md,raw-01…09-*.txt}` | 측정 요약과 원시 출력 |
| `docs/mdm/tasks/TSK-02-02/contract-draft/**` | 엔진 계약 초안(C2 로 옮긴다) |

### 2.4 수정하지 않는 것(명시)

- `src/**` 전부(엔진 모듈 `ExpressionEvaluator` 의 기본 설정 사용 F3 도 그대로 — TSK-03-02 몫).
- `docs/mdm/PRD.md`, `docs/mdm/wbs.md`, `docs/mdm/adr/*`, `docs/mdm/screens/*`.
- 외부 원천 `/Users/jji/project/mdm/**`.
- `docs/mdm/tasks/TSK-02-02/state.json`, `spec.md`.

---

## 3. 테스트 전략 — 문서 검증 체크리스트 (Verify 가 순회)

코드 변경이 없으므로 새 테스트 코드는 없다. 아래 항목이 게이트다. 명령은 리포 루트에서 실행한다. 정규식의 `|` 는 `[|]` 로 쓴다(BSD grep). 한 항목에 명령이 둘 이상이면 모두 기대값이어야 통과다. 스크래치 폴더는 세션 스크래치를 쓴다.

```bash
BASE=aec426b1667d18a72ab5b4d6141e61ca99d39951   # 이 Task 착수 직전 dev 머리(TSK-02-01 머지)
EC=docs/mdm/engine-contract
T=/private/tmp/claude-501/-Users-jji-project-dmes-standard-dflow-fae5410a/e52d88d2-81c0-46b5-bca6-f25fe844b83a/scratchpad/verify   # Verify 의 스크래치로 바꿔도 된다
JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
EVALEX=~/.gradle/caches/modules-2/files-2.1/com.ezylang/EvalEx/3.7.0/37713e9200f4a7347e51201adb3606c4cce159b8/EvalEx-3.7.0.jar
TSC=src/frontend/m-mdm/node_modules/.bin/tsc      # 5.9.3. src/frontend/node_modules/.bin/tsc 는 없다
mkdir -p $T
```

- **V1 계약 파일 이동** — `absent` / `18` / `1` / `6`
  ```bash
  test ! -e docs/mdm/tasks/TSK-02-02/contract-draft && echo absent
  find $EC/java -name '*.java' | wc -l
  ls $EC/schema/engine-contract.schema.json $EC/ts/engine-contract.ts | wc -l | awk '{print ($1==2)?1:0}'
  ls $EC/samples | wc -l
  ```
- **V2 Java 초안 컴파일(EvalEx 3.7.0, 경고도 실패)** — 마지막 줄 `JAVAC_OK`
  ```bash
  rm -rf $T/classes && $JAVA_HOME/bin/javac -Xlint:all -Werror --release 21 -d $T/classes -cp $EVALEX \
    $(find $EC/java -name '*.java') && echo JAVAC_OK
  ```
- **V3 import 허용 목록·의존 방향**(ArchUnit 규칙 F2 와 06:463) — 각 `0`
  ```bash
  # 전체: 허용 밖 import 0
  grep -rhE '^import ' $EC/java | grep -vE '^import (static )?(java\.(lang|util|math|time|text)\.|com\.ezylang\.evalex\.|kr\.dongkuk\.maru\.mdm\.engine\.)' | wc -l
  # spi: EvalEx·다른 engine 패키지 0
  grep -rhE '^import ' $EC/java/kr/dongkuk/maru/mdm/engine/spi | grep -E 'com\.ezylang|engine\.(expr|rule|domain|code)' | wc -l
  # code: spi 밖 engine 패키지·EvalEx 0
  grep -rhE '^import ' $EC/java/kr/dongkuk/maru/mdm/engine/code | grep -E 'com\.ezylang|engine\.(expr|rule|domain)' | wc -l
  # expr: rule·domain 0
  grep -rhE '^import ' $EC/java/kr/dongkuk/maru/mdm/engine/expr | grep -E 'engine\.(rule|domain)' | wc -l
  # rule·domain: code 직접 참조 0, 서로 참조 0
  grep -rhE '^import ' $EC/java/kr/dongkuk/maru/mdm/engine/rule $EC/java/kr/dongkuk/maru/mdm/engine/domain | grep -E 'engine\.code' | wc -l
  grep -rhE '^import ' $EC/java/kr/dongkuk/maru/mdm/engine/domain | grep -E 'engine\.rule' | wc -l
  ```
- **V4 초안 설정으로 원천 예시 식 파싱(실제 EvalEx)** — exit 0, 출력 끝 `"unexpected": 0`
  ```bash
  $JAVA_HOME/bin/javac --release 21 -d $T/classes -cp $EVALEX $(find $EC/java $EC/samples -name '*.java') \
    && $JAVA_HOME/bin/java -cp $EVALEX:$T/classes AstSampleExport > $T/ast-samples.json; echo exit=$?
  grep -c '"parseError": "ParseException' $T/ast-samples.json    # 기대 9 (거부돼야 할 식 전부 거부)
  tail -2 $T/ast-samples.json
  ```
- **V5 JSON Schema 가 실제 AST·표본 코퍼스를 받아들이고 틀린 모양은 거부** — `VALIDATE_OK accepted=29 corpus=15 negatives=7`
  ```bash
  python3 $EC/samples/validate.py $EC/schema/engine-contract.schema.json $EC/samples/sample-corpus.json $T/ast-samples.json 2>/dev/null
  ```
- **V6 TS 초안이 같은 표본을 strict 로 받아들이고 틀린 모양은 거부** — `TSC_OK`
  ```bash
  sh $EC/samples/tscheck.sh $TSC $T/tscheck $T/ast-samples.json
  ```
- **V7 engine-contract.md 구조·핵심 문안** — 첫 줄 `13` 이상, 이후 각 `1` 이상
  ```bash
  grep -cE '^## [0-9]+\. ' docs/mdm/engine-contract.md
  for k in 'precision 68' 'HALF_EVEN' 'allowOverwriteConstants' 'regexTimeoutMillis' 'Asia/Seoul' 'EVAL_TS' 'MASTER_AT' 'CODE_LIST' 'isSupported' 'CodeEffLookup' 'FunctionProvider' 'engine-contract.schema.json' 'screenFallback' 'firstFalseVarId' 'YYYYMMDDHHMMSS'; do
    grep -c -- "$k" docs/mdm/engine-contract.md; done
  ```
- **V8 term-embedding.md 구조·DDL·수치** — 첫 줄 `7` 이상, 이후 각 `1` 이상
  ```bash
  grep -cE '^## [0-9]+\. ' docs/mdm/term-embedding.md
  for k in 'EMBEDDING +BLOB' 'EMBEDDING +VARBINARY\(4096\)' 'EMBEDDING_MODEL +VARCHAR\(100\)' 'KURE-v1/int8-1808718e/cls-l2/in1' '1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b' '118dcc12c125320225de077e57a9f367ce8f6407' 'pooling_mode_cls_token' 'SQL Server 2025' '확인 불가' '100,000' '250 ms' 'poc/mdm-embedding-bench'; do
    grep -cE -- "$k" docs/mdm/term-embedding.md; done
  ```
- **V9 decisions.md append-only** — `6` / `0` / `D-025`
  ```bash
  grep -cE '^## D-02[0-5] \(2026-09-2[3-9]T' docs/mdm/decisions.md
  /usr/bin/git diff $BASE -- docs/mdm/decisions.md | grep -E '^-[^-]' | wc -l
  grep -oE '^## D-[0-9]+' docs/mdm/decisions.md | tail -1 | sed 's/## //'
  ```
- **V10 TRD 확정 표기·패키지·방언 행** — 각 `1`, 마지막 `0`
  ```bash
  grep -cE '^[|] T6 .*[*][*]확정[*][*] 2026-09-24.*term-embedding[.]md' docs/mdm/TRD.md
  grep -cE '^[|] T5 .*[*][*]확정[*][*] 2026-09-24' docs/mdm/TRD.md
  grep -c 'kr.dongkuk.maru.mdm.engine.{expr,rule,domain,code,spi}' docs/mdm/TRD.md
  grep -cE '^[|] `vector` .*BLOB.*VARBINARY[(]4096[)]' docs/mdm/TRD.md
  grep -cE '^[|] 임베딩.*term-embedding[.]md' docs/mdm/TRD.md
  grep -c 'com.dongkuk.dmes.mdm.engine' docs/mdm/TRD.md
  ```
- **V11 명명·방언 규칙표 #23·인계 행** — 각 `1`
  ```bash
  grep -cE '^[|] 23 [|] `vector`.*EMBEDDING BLOB.*VARBINARY[(]4096[)].*TSK-04-01' docs/mdm/naming-dialect-rules.md
  grep -cE '^[|] TSK-04-01 · TSK-04-02 [|]' docs/mdm/naming-dialect-rules.md
  ```
- **V12 README 링크가 실재 파일을 가리킴** — `3`
  ```bash
  grep -oE '\]\((engine-contract[.]md|engine-contract/|term-embedding[.]md)\)' docs/mdm/README.md | sed -E 's/.*\((.*)\)/\1/' \
    | while read f; do test -e "docs/mdm/$f" && echo ok; done | wc -l
  ```
- **V13 PoC 격리 — 엔진·backend 빌드에 새지 않음** — 각 `0`
  ```bash
  grep -cE 'onnxruntime|djl' src/backend/maru-mdm-engine/build.gradle
  grep -c 'mdm-embedding-bench' src/backend/settings.gradle src/backend/build.gradle | awk -F: '{s+=$2} END{print s}'
  /usr/bin/git ls-files | grep -cE '[.]onnx$'
  ```
- **V14 PoC 빌드·결과 파일** — `BUILD SUCCESSFUL` / `9` / 각 `1` 이상
  ```bash
  JAVA_HOME=$JAVA_HOME src/backend/gradlew -p poc/mdm-embedding-bench compileJava --no-daemon -q && echo BUILD SUCCESSFUL
  ls poc/mdm-embedding-bench/results/raw-0*.txt | wc -l
  for k in 'p50 20.0 ms' '336.2 s' '1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b' '661.0 ms'; do grep -c -- "$k" poc/mdm-embedding-bench/results/README.md; done
  ```
- **V15 src·PRD·wbs·ADR 불변** — `0`
  ```bash
  /usr/bin/git diff --stat $BASE -- src docs/mdm/PRD.md docs/mdm/wbs.md docs/mdm/adr | wc -l
  ```
- **V16 회귀 — 기준선 395 / 실패 0**
  ```bash
  cd src/backend && JAVA_HOME=$JAVA_HOME ./gradlew testAll --no-daemon
  ```
  집계 — 기대 `tests=395 failures=0 errors=0`(src 가 그대로라 Gradle 이 up-to-date 로 건너뛰어도 결과 XML 은 같은 소스의 것이다. Design Phase 실행 결과 93파일 395/0/0):
  ```bash
  find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' -exec head -c 600 {} \; \
    | grep -oE '(tests|failures|errors)="[0-9]+"' \
    | awk -F'"' '{split($1,k,"=");s[k[1]]+=$2} END{printf "tests=%d failures=%d errors=%d\n",s["tests"],s["failures"],s["errors"]}'
  ```

---

## 4. 수용 기준 매핑

| spec 수용 기준 | 충족 산출물 | 검증 |
|---|---|---|
| 엔진 계약 Task 가 그대로 옮길 수 있는 인터페이스 초안 | C1 `engine-contract.md`, C2 `engine-contract/`(spi 5 + 묶음 1, expr 6, code 1, rule 4, domain 1 — Java 18파일, JSON Schema, TS 타입, 표본 코퍼스). 실제 EvalEx jar 로 컴파일·파싱·스키마 검증, tsc strict 통과 | V1~V7 |
| 선택안과 근거를 decisions.md 에 기록(TRD 가정 T6 확정) | M1 D-024(저장 방식)·D-025(모델·입력·EMBEDDING_MODEL) + D-020~D-023(엔진), M8 T6 확정, M10 규칙표 #23, C3 `term-embedding.md`, PoC 실측 | V8~V11·V13·V14 |

---

## 5. 불변 규칙 — 이 작업에서 바꾸면 안 되는 것

1. **`src/` 는 한 줄도 바꾸지 않는다.** 엔진 모듈에 초안 코드를 넣지 않는다(TSK-03-01 몫). `maru-mdm-engine` 의 main 의존은 EvalEx 3.7.0 하나로 남는다. **ONNX Runtime·토크나이저 의존은 엔진 jar 에 절대 넣지 않는다**(TRD §10).
2. **초안 파일 내용은 옮기기만 한다**(`git mv`). Build 가 초안을 고쳐야 한다고 판단하면 고치지 말고 `.issues` 에 적는다 — V2~V6 이 이 내용으로 통과했다.
3. **decisions.md 의 D-001~D-019 는 수정하지 않는다.** 새 항목은 끝에 D-020 부터. design.md 의 `D1`~`D6`(담당자 확인 필요)과 decisions.md 의 `D-0NN` 을 섞어 쓰지 않는다.
4. **PoC 는 `src/backend` composite build·`testAll` 에 넣지 않는다.** 모델 파일(`*.onnx`)·빌드 산출물·gradle wrapper jar 를 PoC 에 커밋하지 않는다.
5. **원천 DDL 불변**: `TB_MDM_TERM` 의 `embedding`·`embedding_model` 두 칼럼은 원천 이름 그대로(물리명 `EMBEDDING`·`EMBEDDING_MODEL`, D-012) 같은 테이블에 둔다. 칼럼 추가·별도 테이블은 이 결정에 없다.
6. **벡터 형식 고정**: L2 정규화한 float32 little-endian 1024개 = 4,096바이트. 코사인 = 내적. 이 형식이 바뀌면 `EMBEDDING_MODEL` 값이 바뀌어야 한다.
7. **풀링은 CLS + L2 다**(E4). INT8 README 의 masked mean 을 따르지 않는다.
8. **엔진은 시계를 읽지 않는다.** 모든 판정 입구는 `Instant evalTs` 를 필수 인자로 받고, "주지 않으면 현재 시각"은 서버 API 층이 채운다.
9. **셀 JSON·코퍼스·판정 결과의 숫자는 문자열이다**(06:1038). JSON 숫자 필드를 새로 만들지 않는다(정수 id·seq·ver 는 예외).
10. **다른 모듈·가이드 문서는 고치지 않는다**(식별자 사전·backend-standard·RULE.md).

---

## 6. 결정 상세 — Build 가 산출 문서로 옮길 내용

### 6.1 패키지와 의존 방향 (→ C1 §1·§2)

| 패키지 | 계약 초안 파일 | 내용(06:457-461) |
|---|---|---|
| `engine.spi` | `DefinitionLookup`, `CodeLookup`, `CodeEffLookup`, `MasterLookup`, `FunctionProvider`, `EngineLookups` | 호출자가 구현하는 조회. EvalEx 타입·다른 engine 패키지 금지. java.lang/util/math/time 만 |
| `engine.code` | `CodeResolver` | 기준일 버전 선택·소급·REGEX/TABLE 해석·CODE_LIST. EvalEx 금지, spi 만 |
| `engine.expr` | `MdmExpressionConfig`, `FunctionSets`, `ReservedNames`, `AstNode`, `EngineWarning`, `EngineEvaluationException` | 설정 팩토리·허용 함수·예약 이름·AST 타입·공통 경고/오류. spi·code 를 본다 |
| `engine.rule` | `RuleEngine`, `RuleResult`, `RuleSetResult`, `RuleView` | 판정·세트·정의 조회 입구. expr·spi 를 본다 |
| `engine.domain` | `DomainValidator` | 도메인 검증기. expr·spi 를 본다 |

엔진 인스턴스는 `EngineLookups`(spi 다섯 묶음) 하나로 만든다. 공장 클래스 이름과 생성 방식은 TSK-03-02·03 이 정한다(계약은 입구 인터페이스까지).

### 6.2 spi 초안 (→ C1 §3) — 파일은 C2, 여기는 결정과 원천 이탈

| 인터페이스 | 메서드 | 원천 근거 |
|---|---|---|
| `DefinitionLookup` | `Optional<ColumnDefinition> column(table, column)` · `Optional<RuleDefinition> rule(ruleId, Instant evalTs)` · `Optional<RuleSetDefinition> ruleSet(setId)` | 06:461, 스냅샷 06:1156-1165, 구현체 넷 06:541 |
| `CodeLookup` | `Optional<CodeRows> code(maruCodeId)` — 헤더·VER·ITEM·CATE·CATE_ITEM 행 | 06:461, 04:969-1040 |
| `CodeEffLookup` | `Optional<Set<String>> codes(maruCodeId, BigDecimal ver, cateId)`, 상수 `NONE`(원장 서버) | 06:461, 04:732 |
| `MasterLookup` | `boolean isValid(maruDataId, cateId, key, LocalDateTime baseDt)` · `Optional<String> attr(…, int attrNo)`, 상수 `NONE` | 06:461, 05:363-400 |
| `FunctionProvider` | `List<BusinessFunction> functions()` — `BusinessFunction(name, List<Param(name, nullable)>, varArgs, Body)`, `Body.apply(List<Object>)`, 상수 `NONE` | 06:445·461 |

시간 타입: 판정 입구의 평가 시각은 `java.time.Instant`(06:480 과 같음, EvalEx DATE_TIME), spi 가 돌려주는 업무 일시(apply_from 등)와 `MasterLookup` 기준일은 **KST 벽시계 `LocalDateTime`**(naming-dialect-rules §3 #16 과 같은 타입). 엔진이 `MdmExpressionConfig.ZONE` 으로 한 번 바꾼다. 코드 버전은 `BigDecimal` scale 3(#17).

**원천과 다른 점(이탈 — C1 §12 에 그대로 적는다)**

| # | 원천 | 계약 | 이유 |
|---|---|---|---|
| X1 | 평가 시각은 "주지 않으면 현재 시각"(06:401·422), `CODE_LIST(id, cate)` 는 "현재 시각을 그때그때 읽는다"(02:429) | 엔진 입구는 `evalTs`·`baseDt` 필수. 기본값은 서버 API 층이 `now()` 로 채운다 | 엔진이 시계를 읽지 않아야 같은 입력·같은 사본·같은 시각이면 결과가 같다(02:326, 06:422). 사용자 관점 동작은 같다 |
| X2 | 도메인 검증 진입점 `validate(table, column, record)`(06:448) | `validate(table, column, record, Instant evalTs)` | `MASTER` 판정 시각(06:422 "검증 한 번마다 하나") |
| X3 | DefinitionLookup 항목에 데이터 타입이 없음(06:461) | `ColumnDefinition` 에 `dataType`·`scale` 추가 | 02 실행 순서 3단계 타입 변환이 필요로 한다(02:384-386) |
| X4 | FunctionProvider 는 "비즈니스 함수 목록을 준다" | 중립 기술자 `BusinessFunction` + `Body`. 지연(lazy) 인자는 받지 않는다 | spi 에 EvalEx 타입 금지(06:461). 지연 평가는 EvalEx 부분 트리 평가가 필요해 중립 타입으로 표현할 수 없다. 인자별 NULL 허용 표지는 입력 계약 필수·선택 판정(06:208)이 쓴다 |
| X5 | CodeLookup 항목에 CATE 의 `def_target` 이 없음(06:461) | `CodeCateRow.defTarget` 포함 | REGEX 해석 대상 칸(04:178) |
| X6 | `CODE_LIST` 는 "함수"라 부름 | EvalEx 함수가 아니라 `CodeResolver.codeList(…)` Java API | 룰 식에 쓰지 않는다(06:316). 식 사전에 넣지 않는다 |
| X7 | 룰 버전은 "엔진이 평가 시각으로 고른다"(06:420) | `DefinitionLookup.rule(ruleId, evalTs)` 구현체가 고른다 | 의존성 규칙 5(06:471)와 맞춘다. 엔진은 evalTs 를 넘길 뿐 |

### 6.3 AST JSON 스키마와 타입 생성 방식 (→ C1 §9)

- 정본: `docs/mdm/engine-contract/schema/engine-contract.schema.json`(JSON Schema 2020-12). `$defs`: `AstNode`(6종 oneOf), `TypedValue`, `CellJson`(6모양 oneOf), `ErrorCode`, `CorpusFile`/`CorpusCase`/`ExprCase`/`CellCase`/`CodeSets`/`Expect`, `LocalDateTime`, `VarType`, `InputContract`, `RuleResult`, `EngineError`.
- AST 노드는 `{type, value, params?}` 이고 설정이 허용하는 6종(`NUMBER_LITERAL, STRING_LITERAL, VARIABLE_OR_CONSTANT, PREFIX_OPERATOR, INFIX_OPERATOR, FUNCTION`)만 나온다(D1 문법 축소 결과, F17). 중위 연산자 16종·접두 3종 enum, 중위는 자식 정확히 2, 접두 1, 함수는 인자 0개면 `params` 키 없음(F18). 숫자 리터럴 value 는 입력 원문 문자열이다.
- **생성 방식(D6)**: TS 는 스키마에서 `json-schema-to-typescript` 로 생성해 `@dk-oasis/m-mdm` 에 둔다(devDependency 추가는 TSK-03-01). Java 는 엔진이 EvalEx 외 의존을 가질 수 없어(F2) 코드 생성기를 쓰지 않고 **손으로 쓴 record**(초안 `AstNode` 등)를 두고, 엔진 **테스트 범위**에서 `AstExporter` 출력과 판정 결과 JSON 이 스키마를 통과하는지 검사한다(JSON Schema 검증기는 `testImplementation` 에만). 초안 `ts/engine-contract.ts` 는 생성 결과가 가져야 할 모양이며 V6 이 표본으로 확인한다.
- 스키마 버전: 코퍼스 파일은 `"version": 1`. AST·셀 JSON 에는 버전 칸을 두지 않는다(원천 저장 모양 불변, 06:1038). 모양이 바뀌면 스키마 `$id` 에 버전을 올리고 코퍼스 `version` 을 올린다.

### 6.4 EvalEx 설정 고정값 (→ C1 §4) — 초안 `MdmExpressionConfig.baseBuilder()`

| 빌더 메서드(3.7.0, F14) | 값 | 근거 |
|---|---|---|
| `mathContext` | `new MathContext(68, HALF_EVEN)` | 06:442, EG §6(기본값과 같지만 명시) |
| `zoneId` | `Asia/Seoul` | 02:401 KST 고정. 기본값이 JVM 기본이라 호스트마다 달라진다(F15) |
| `locale` | `Locale.ROOT` | 06:442 로캘 고정. 기본값이 JVM 기본(F15) |
| `allowOverwriteConstants` | `false` | 06:199·423, F16 |
| `lenientMode` | `false` | 06:197 |
| `regexTimeoutMillis` | `100` | 06:442 "값을 정해 고정". 3.7.0 기본 100 을 명시(F15) |
| `maxRecursionDepth` | `2000` | 3.7.0 기본을 명시 |
| `arraysAllowed` / `structuresAllowed` | `false` / `false` | D1 — 레코드는 평평한 표준 물리명 맵이다 |
| `implicitMultiplicationAllowed` | `false` | D1 — `2x` 같은 표기를 막아 생성 텍스트와 사용자 식의 문법을 하나로 |
| `singleQuoteStringLiteralsAllowed` | `false` | 06:247 큰따옴표만 |
| `binaryAllowed` | `false` | 3.7.0 기본을 명시 |
| `stripTrailingZeros` | `true` | 3.7.0 기본. 숫자 비교는 `compareTo`, 직렬화는 `toPlainString()`(`2E+1` 방지 — F19 `SWITCH` 결과) |
| `decimalPlacesRounding` | `DECIMAL_PLACES_ROUNDING_UNLIMITED` | EG §6 기본 |
| `functionDictionary` | `MapBasedFunctionDictionary.ofFunctions(…)` — `FunctionSets.STANDARD` ∪ 비즈니스 함수 | 06:442-443. 사전 밖 함수는 파싱 오류(F17) |
| `dataAccessorSupplier` | 기본(Map 기반, 대소문자 무시) | EG §6. 바꾸지 않는다 |

엔진 설정 입구: `MdmExpressionConfig.create(EngineLookups)` — `baseBuilder()` + 함수 사전(`MASTER`·`MASTER_AT` 는 `CodeResolver`·`MasterLookup` 을 쥔 `AbstractFunction`). 스캐폴드 `ExpressionEvaluator`(F3)는 TSK-03-02 가 이 팩토리로 바꾼다.

### 6.5 허용 함수 집합 (→ C1 §5)

칸(`FunctionSets.Slot`)별 허용: `DOMAIN_STD` = STANDARD(변수는 `value` 하나), `DOMAIN_BIZ` = STANDARD ∪ 비즈니스 함수, `RULE_COND_EXPR`·`RULE_RESULT_EXPR`·`RULE_EXPR_VAR`·`RULE_GRP_COND` = STANDARD. op-code 생성 텍스트는 `GENERATED` = {`STR_MATCHES, STR_STARTS_WITH, STR_ENDS_WITH, INSTR, MASTER`} 밖을 만들지 않는다(생성기 회귀 테스트). 02:175 의 "8.5 + MASTER" 와 06:443 의 "+ MASTER·MASTER_AT + INSTR" 가 다르다(F13) — 06:443 을 따른다(엔진 정의 문장이 더 구체적). 표준식은 변수가 `value` 하나라 `MASTER_AT` 을 써도 기준일을 줄 변수가 없다.

| 함수 | 집합 | 서버 구현 | 화면 JS(원천 샘플 F20) | NULL 인자(EvalEx 3.7.0 실측 F19) | 입력 계약 판정(06:208) |
|---|---|---|---|---|---|
| `IF` | BASE | 표준(지연) | 있음 | 조건 NULL → 거짓 가지 | 조건·가지: 선택 가능(가지 안 NULL 검사 규칙) |
| `SWITCH` | BASE | 표준(지연) | 있음 | 값 NULL → 기본값 | 선택 |
| `COALESCE` | BASE | 표준 | 있음 | NULL 건너뜀 | 마지막 아닌 인자 선택 |
| `NOT` | BASE | 표준 | 있음 | NPE(화면은 참) — 갈림 | 필수 |
| `ABS` `CEILING` `FLOOR` `SQRT` | BASE | 표준 | 있음 | NPE | 필수 |
| `ROUND` | BASE | 표준 | 있음 | NPE | 필수 |
| `MIN` | BASE | 표준 | 있음 | 첫 인자 NULL 은 무시돼 값이 나오기도 함(`MIN(X,1)=1`) — 화면은 예외 | 필수(애매하면 필수) |
| `MAX` `SUM` `AVERAGE` | BASE | 표준 | 있음 | NPE | 필수 |
| `STR_LENGTH` `STR_UPPER` `STR_LOWER` `STR_TRIM` | BASE | 표준 | 있음 | NPE | 필수 |
| `STR_LEFT` `STR_RIGHT` `STR_SUBSTRING` | BASE | 표준(0부터, 끝 배타) | **없음 — TSK-03-04 추가** | NPE | 필수 |
| `STR_CONTAINS` | BASE | 표준(대소문자 무시) | 있음(`str(null)`="null" 로 검사 — 갈림, **false 로 고친다**) | false | 선택(서버가 false 를 돌려 실패하지 않는다) |
| `STR_STARTS_WITH` `STR_ENDS_WITH` | BASE | 표준(대소문자 구분) | 있음 | NPE | 필수 |
| `STR_MATCHES` | BASE | 표준(전체 일치, 타임아웃 100 ms) | 있음(`^(?:…)$`) | NPE | 필수 |
| `INSTR(s, sub)` | MDM | 커스텀: 대소문자 구분, 1부터 위치, 없으면 0, 인자 NULL 이면 NULL(06:443, EG:215) | **없음 — TSK-03-04 추가** | NULL 반환 | NULL 전파 — 바깥 연산으로 판정한다. 비교(`> 0`)에 쓰이면 NULL 비교가 NPE 라(F19 `X < 1`) 사실상 필수 |
| `MASTER(id, cate, key[, attr])` | MDM | 커스텀, `EVAL_TS` 로 판정 | 주입(마루 코드 대상·받아 둔 집합만) | key NULL → false/NULL | key 선택 |
| `MASTER_AT(id, cate, key, base_dt[, attr])` | MDM | 커스텀, base_dt 로 판정 | 1차 폴백(`isSupported=false`) | key·base_dt NULL → false/NULL(D5) | key·base_dt 선택 |

제외(사전에 넣지 않음 → 파싱 오류): 시각·난수(`DT_*`, `RANDOM`), 로캘(`STR_FORMAT`), 배열 반환(`STR_SPLIT`), 수학 확장(`LOG`, `LOG10`, `FACT`, 삼각·쌍곡·각도 함수). 근거 06:442, EG §8.5 1항, D1.

비즈니스 함수(`FunctionProvider`) 적재 규칙: 이름 `^[A-Z][A-Z0-9_]*$`, STANDARD·GENERATED·표준 사전 이름과 겹치면 적재 거부, 인자 `nullable=false` 에 NULL 이 오면 함수를 부르지 않고 `EVALUATION_ERROR`, 반환은 BigDecimal·String·Boolean·null 만.

### 6.6 예약 이름 (→ C1 §6) — 초안 `ReservedNames`

- 상수 8종(대소문자 무시): `NULL TRUE FALSE PI E DT_FORMAT_ISO_DATE_TIME DT_FORMAT_LOCAL_DATE_TIME DT_FORMAT_LOCAL_DATE` — 레코드 키로 오면 `CONSTANT_KEY`(06:199, F16).
- `EVAL_TS` — 레코드 키로 오면 `EVAL_TS_KEY`, 식에서 직접 쓰면 저장 거부(06:422).
- `_` 로 시작하는 레코드 키 → `RESERVED_KEY`(06:424). 식 변수 값 키 `_V<var_id>`.
- `value` — 도메인 표준식의 검사 대상(EG §7).

### 6.7 MASTER·MASTER_AT·CODE_LIST 와 평가 시각 주입 (→ C1 §7)

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

**평가 시각 주입**: 판정 입구(`RuleEngine.evaluate/evaluateSet`, `DomainValidator.validate`)가 `Instant evalTs` 를 받아 초 미만을 자르고, 평가마다 한 번 `ctx.put("EVAL_TS", evalTs)` 로 넣는다(EvalEx DATE_TIME). `MASTER` 는 함수 구현의 `evaluate(Expression expression, …)` 인자 `expression` 의 데이터 접근자에서 `EVAL_TS` 를 읽어(EG:223) `ZONE` 으로 KST `LocalDateTime` 으로 바꿔 판정한다. 룰 세트 한 번·검증 한 번은 한 평가 시각이다(06:422). 실행 로그에 남기는 것은 호출자 몫.

**`base_dt` 해석(D5)**: 식 안의 base_dt 는 레코드 값이라 문자열이다(F23). 받는 형식은 둘이다.
- 8자리 숫자 `YYYYMMDD` → 그날 00:00:00 KST(02:401 "일자 타입이면 그날 00:00:00")
- 14자리 숫자 `YYYYMMDDHHMMSS` → 그 시각 KST
- 그 밖의 문자열·숫자·불린 → `EVALUATION_ERROR`. NULL → 불리언 형태 false, 속성 형태 NULL(key NULL 규칙과 같게).
화면 JS 는 1차에서 `MASTER_AT` 을 폴백하므로 이 해석을 구현하지 않는다.

### 6.8 판정 결과·오류·경고 (→ C1 §8) — 초안 `RuleResult`·`RuleSetResult`·`EngineEvaluationException`·`EngineWarning`·`DomainValidator`

- `RuleResult(ruleId, ver, evalTs, hits, defaultApplied, results, trace, warnings)`
  - `hits`: `Hit(rowId, seq, groupChoices: res_grp → var_id|null)`. FIRST·UNIQUE 0-1개, PRIORITY·COLLECT·ANY 적중 전부, DERIVE 는 행 하나(F11).
  - `results`: 결과 변수 → 값. 키는 늘 있고 값은 null 일 수 있다(06:31). COLLECT LIST 는 List.
  - `trace`: `RowTrace(rowId, seq, evaluated, hit, firstFalseVarId)` — 평가한 행마다. 첫 거짓 셀은 조건 열 `seq` 순으로 처음 거짓이 된 셀의 var_id. FIRST 는 적중 뒤 행을 평가하지 않는다(`evaluated=false`).
  - `warnings`: `EngineWarning(code EXPR_CELL_NULL|GRP_COND_NULL, ruleId, rowId, varId, message)`(06:200·425·427).
- `RuleSetResult(setId, evalTs, steps: List<RuleResult>, finalValues)` — 중간 결과는 steps, 최종은 결과 변수 전체(입력 키 제외).
- `EngineEvaluationException(violations)` — `Violation(stage, code, ruleId, rowId, name, message)`. stage: `SET_CHECK, INPUT_CHECK, ROW_SELECT, RESULT_CHECK, RESULT_EVAL`. code 12종(`RULE_NOT_FOUND … EVALUATION_ERROR`). 단계마다 모아 한 번에 던진다(06:210). UNIQUE 둘 이상 적중은 `UNIQUE_MULTIPLE_HITS`, ANY 결과 불일치는 `ANY_CONFLICT`.
- 도메인 검증: 값이 틀린 것은 예외가 아니라 `ValidationResult(valid, value, failures)`, `Failure(step, message)`, step `NOT_DEFINED, REQUIRED, TYPE_CONVERSION, STD_EXPR, BIZ_VAR_MISSING, BIZ_EXPR`. 식 평가 중 예외만 `EngineEvaluationException`.
- JSON 모양(값 테스트 API·판정 서비스 응답)은 스키마 `RuleResult`·`EngineError`. 값은 `TypedValue`(숫자 문자열).

### 6.9 화면 JS 평가기 범위 (→ C1 §10)

| 대상 | 화면 처리 | 폴백 |
|---|---|---|
| op-code 조건 셀 | 셀 구조 직접 비교(06:271): Number `Decimal`(precision 68, HALF_EVEN), String·일자 String UTF-16 코드유닛 순서, Boolean 값, NULL 이면 `IS_NULL` 만 참·`NA` 참·나머지 거짓. `=` 패턴 단순형은 startsWith/endsWith/indexOf, 정규식형은 저장 응답의 정규식을 `^(?:…)$` 로. CONTAINS·INSTR 은 indexOf(대소문자 구분). CODE_IN 은 받아 둔 (마루 코드, 카테고리) 코드 집합의 `has` | CODE_IN 집합을 받아 두지 않았으면 서버 |
| Expression 조건 셀, 식 변수, 열 조건 | AST 인터프리터 | `isSupported()` 거짓(허용 밖 노드·함수, `MASTER` 마루 데이터 대상, `MASTER_AT`, `attr` 형태)이면 서버 미리보기 API |
| 결과 Expression 셀(원천 미결 06:389) | `isSupported()` 참이면 AST 로 미리 보이고 "미리보기" 표시. 정식 값은 값 테스트 API(서버) | 거짓이면 서버 |
| 적중 정책·행 하이라이트·첫 거짓 셀 | 화면 JS(06:724) | — |
| 도메인 표준식 | AST 인터프리터(EG §8.5 0항) | 비즈니스식은 화면에 배포하지 않음, "서버 확인" |

`isSupported(ast, injected)` 는 노드 종류 6종·연산자 enum·함수 이름을 훑는다. `MASTER` 는 첫 인자 id 에 대한 코드 집합이 주입돼 있을 때만 지원으로 본다. 인터프리터는 원천 샘플(F20)을 출발점으로 하되 `INSTR`·`STR_LEFT`·`STR_RIGHT`·`STR_SUBSTRING` 을 더하고, NULL 동작은 서버(F19)에 맞춘다(EG §8.5 2항 "다르면 서버가 기준이고 인터프리터를 고친다"). 서버가 예외를 내는 자리(예: `NOT(NULL)` NPE)는 코퍼스에서 `error: EVALUATION_ERROR` 로 기대하고 화면도 오류로 낸다.

**예약 키 검사도 화면이 같이 한다.** 원천 샘플의 `prepare()` 는 키를 대문자로 바꾸고 상수가 변수를 가린다(`JS/evalex-ast-interpreter.js:161·257-261`). 그래서 레코드에 `NULL` 키가 오면 서버는 `CONSTANT_KEY` 인데 화면은 조용히 상수를 쓴다. 화면 평가기는 평가 전에 변수 키를 검사해 상수 8종(대소문자 무시) → `CONSTANT_KEY`, `EVAL_TS` → `EVAL_TS_KEY`, `_` 로 시작 → `RESERVED_KEY` 로 서버와 같은 코드를 낸다(코퍼스 `expr.constant-key`).

### 6.10 정합성 코퍼스 형식 (→ C1 §11)

- 파일: `CorpusFile { version: 1, cases: CorpusCase[] }` 하나(TSK-03-04 가 `@dk-oasis/m-mdm` 와 엔진 테스트 리소스가 같은 파일을 읽게 배치). 양쪽 러너: JUnit(엔진 테스트) · Vitest(m-mdm).
- 두 종류: `ExprCase{id, kind:"expr", slot?, expr, ast, vars, evalTs?, codeSets?, expect}` — 서버는 `expr` 을, 화면은 `ast` 를 평가. `CellCase{id, kind:"cell", variable{name, dataType, dateString?, maruCodeId?}, cell, patternRegex?, value, evalTs?, codeSets?, expect}` — 서버는 생성기 텍스트를, 화면은 셀 구조를 평가.
- **값은 `TypedValue`**: `{"type":"NUMBER","value":"1.10"}`처럼 숫자를 문자열로 싣는다(JS double 오차 방지). NUMBER 는 값으로 견준다(`1.10 == 1.1`). NULL 은 `{"type":"NULL"}`. `vars` 의 타입이 변수 선언과 다르면 타입 변환 오류 사례다.
- `expect`: `{value: TypedValue}` 또는 `{error: ErrorCode}`, `screenFallback: true` 면 화면은 `isSupported=false` 여야 하고 서버 결과만 견준다.
- `codeSets`: `{"PROC_CD|PLATING": ["82","84"]}` — 화면은 CODE_IN·MASTER 주입 집합으로 쓴다. **서버 러너는 키마다 가짜 사본을 합성한다**: `CodeLookup.code(id)` 가 헤더 `status=INUSE`, RELEASED 버전 하나(`ver=1.000`, `apply_from=0001-01-01T00:00`, `apply_to=9999-12-31T00:00`), 집합의 코드마다 ITEM 행(`from_ver 1.000`, `to_ver 9999`)을 돌려주고, `CodeEffLookup.codes(id, 1.000, cate)` 가 그 집합을 돌려준다. 이렇게 해야 `MASTER`·CODE_IN 이 마루 코드 경로(`CodeResolver`)로 가고 `MasterLookup` 으로 새지 않는다. `codeSets` 에 없는 id 는 `CodeLookup` 이 빈 값 → 마루 데이터 대상(`MasterLookup.NONE`, 늘 false)이다(`expr.master.data-fallback`).
- 필수 사례 = 06:284-296 목록 전부 + 이번 조사로 드러난 갈림(F19·F20): `NULL + 1`(서버 문자열 `"null1"`), `MIN(NULL, 1)`/`MAX(1, NULL)` 비대칭, `STR_CONTAINS(NULL, "u")`, `IF(NULL, …)`, `NOT(NULL)`, `FALSE && NULL`·`NULL || TRUE`, `STR_SUBSTRING` 경계, `ROUND` HALF_EVEN(`2.345 → 2.34`), `SWITCH` 결과 직렬화(`2E+1` 아님), 상수 이름 레코드 키. 표본 15건은 `samples/sample-corpus.json`.

### 6.11 임베딩 모델·런타임·입력 형식 (→ C3 §2)

| 항목 | 값 | 근거 |
|---|---|---|
| 모델 | KURE-v1 (`nlpai-lab/KURE-v1` rev `8b418a58…b2`, MIT) | 02:537, E4 |
| 정밀도 | INT8 동적 양자화(`quantize_dynamic` QInt8) | 02:536 |
| PoC 가 쓴 파일 | `thkmon/KURE-v1-onnx-int8` rev `118dcc12c125320225de077e57a9f367ce8f6407` `model.onnx`(568,451,402 bytes, sha256 `1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b`) | E5. 운영 파일 출처는 D3 |
| 그래프 입출력 | 입력 `input_ids`, `attention_mask`(int64 `[b, s]`), 출력 `last_hidden_state`(`[b, s, 1024]`) | E6 |
| 토크나이저 | 같은 repo `tokenizer.json`(sha256 `fb3c3b93c46fd5a8634e262e1b7de7da11a18b527aa2282b312952b692781dfd`), DJL `ai.djl.huggingface:tokenizers:0.38.0`, 특수 토큰 추가, 최대 512 | E7 |
| 풀링 | **CLS**(0번 토큰) + **L2 정규화** — INT8 README 의 mean 아님 | E4, 02:536 |
| 입력 형식 | `"{표기}: {정의} ({영문명})"` — 표기·정의·영문명은 `strip()`, 정의가 비면 `": {정의}"` 를 빼고 영문명이 비면 `" ({영문명})"` 를 뺀다. 의미 번호·맥락·약어는 넣지 않는다 | 02:530·817 `표기+정의+영문명`, PoC `TermCorpus.encodeInput` |
| 질의 입력 | 추천 API 는 화면이 가진 것만 같은 형식으로 만든다. 표기만 있으면 표기만(질의 p95 22 ms), 인라인 등록 팝업처럼 정의·영문명이 있으면 전체 형식(p95 76 ms) | E8 |
| 런타임 | ORT Java `com.microsoft.onnxruntime:onnxruntime:1.30.0`(CPU), `intraOpNumThreads=4`(설정값, 기본 4), `interOpNumThreads=1`, `SEQUENTIAL`, `ALL_OPT`. 세션 하나를 공유하고 인코딩 호출은 직렬화(세마포어 1)한다 — 동시 실행은 intra 스레드가 겹쳐 느려진다(E8 intra 10) | E8 |
| 배치 인코딩 | 배치 1, 길이순 정렬 불필요(배치 1) — CPU 에서 배치가 이득이 없다 | E8 |
| 두는 곳 | mdm 서버 모듈(`src/backend/mdm/lib`) 의존. 모델 파일은 서버 파일 경로 설정(예: `mdm.embedding.model-dir`), WAR·저장소에 넣지 않는다. DJL 네이티브 캐시 폴더(`~/.djl.ai` 또는 `DJL_CACHE_DIR`)에 쓰기 권한 필요 | TRD §10, E7 |
| 메모리 | 모델 적재 후 프로세스 RSS 약 1.3 GB(대부분 JVM 힙 밖 네이티브), 1만 벡터 캐시 40 MB 힙. WildFly 기동 옵션·서버 메모리 산정에 넣는다 | E8 |
| `EMBEDDING_MODEL` 값(D4) | `KURE-v1/int8-{model.onnx sha256 앞 8자}/cls-l2/in{입력 형식 버전}` — PoC 파일이면 `KURE-v1/int8-1808718e/cls-l2/in1`. 모델 파일·양자화·풀링·입력 형식 중 하나라도 바뀌면 값이 바뀌어 재인코딩 대상이 된다 | 02:540, E16 |

### 6.12 측정 결과 요약 (→ C3 §3) — 원문 `poc/mdm-embedding-bench/results/README.md`

| 항목 | 결과(Apple M5, intra 4) | 500 ms 기준 대비 |
|---|---|---|
| 모델 콜드 로드 | 0.8-4.8 s + 첫 추론 20-27 ms | 기동 시 1회(지연 적재) |
| 단건 인코딩(저장 경로, 전체 입력) | p50 29.1 · p95 42.1 ms | 등록·수정 1건에 체감 없음 |
| 질의 1건 = 표기 인코딩 + 1만×1024 전수 코사인 top-5 | **p50 20.0 · p95 22.2 ms** | 약 22배 여유 |
| 질의 1건 = 전체 입력 인코딩 + 전수 비교 | p50 54.6 · p95 76.2 ms | 약 6배 여유 |
| 1만 건 일괄 인코딩(최초 구축·재인코딩) | 336.2 s(5.6 분), 29.7 건/s(배치 1, 단독 실행) | 배치 작업 |
| 전수 비교만 | 1만 4.9 · 10만 50.9 · 25만 124.4 · 100만 661.0 ms(p95) | 100만에서 기준 초과 |
| SQLite BLOB 1만 행 전체 읽기+디코드 | 23.1 ms | 캐시 적재 |
| RSS | 로드 후 약 1.3 GB, 일괄 중 최대 1.4-2.0 GB | 메모리 산정 |

개발 PC 수치다. 운영 서버 CPU 가 2-3배 느려도 1만 건 질의는 100 ms 안이다.

### 6.13 저장 방식 비교와 선택 (→ C3 §4~§6, D-024)

| 후보 | 방언 | 속도(1만) | 판단 |
|---|---|---|---|
| ① `TB_MDM_TERM` 칼럼 `EMBEDDING`(BLOB/VARBINARY float32 LE) + 서버 메모리 전수 비교 | SQLite·MSSQL 같은 방식 | 질의 p95 22 ms | **선택**. 원천 02:533 "칼럼 하나"·원천 DDL 불변(§5-5)과 맞고, 두 방언이 같은 코드 경로다 |
| ② 별도 테이블(`TB_MDM_TERM_EMB` 등) + 메모리 비교 | 같음 | 같음 | 감사 칼럼·그리드 조회 부담을 떼어 내는 장점은 있으나 원천 DDL 을 바꾼다. ①의 구현 규칙(엔티티 미매핑)으로 같은 이점을 얻는다 |
| ③ 파일 인덱스(HNSW 등 ANN) | DB 밖 | 불필요 | 원장과 동기화·백업 경로가 하나 더 생기고 라이브러리 의존이 는다. 전수 비교가 10만 건 51 ms 라 이득이 없다 |
| ④ MSSQL 네이티브 `VECTOR(1024)` + `VECTOR_DISTANCE` | MSSQL 2025 이상 전용, SQLite 대응 없음 | 미측정 | 운영 버전 **확인 불가**(E14), 2022 면 타입이 없다(E13). 드라이버도 13.1 필요. 방언이 갈라져 NFR-6 위반 |
| ⑤ sqlite-vec | SQLite 로컬 전용 확장 | 미측정 | 확장 적재가 필요하고 MSSQL 대응이 없다. NFR-6 위반 |

**DDL(TSK-02-03 ERD·TSK-04-01 Flyway 가 옮긴다)** — 칼럼 이름은 원천 그대로 대문자(D-012):

```sql
-- SQLite (TB_MDM_TERM 의 다른 칼럼은 02 원문대로)
EMBEDDING        BLOB,             -- float32 LE × 1024 = 4096 bytes, L2 정규화. 인코딩 전 NULL
EMBEDDING_MODEL  VARCHAR(100),     -- 예 'KURE-v1/int8-1808718e/cls-l2/in1'. EMBEDDING 이 NULL 이면 NULL
-- MSSQL
EMBEDDING        VARBINARY(4096) NULL,
EMBEDDING_MODEL  VARCHAR(100) NULL,
```

인덱스·CHECK·DB 벡터 함수는 두지 않는다. 길이 검사(4,096바이트)는 애플리케이션이 쓸 때 한다.

**동작 규칙(TSK-04-02)**
1. JPA 엔티티(`TB_MDM_TERM`)는 `EMBEDDING`·`EMBEDDING_MODEL` 을 **매핑하지 않는다**. 그리드·상세 조회가 4 KB 를 끌어오지 않고, 용어 저장이 벡터를 덮지 않는다. 읽기·쓰기는 전용 리포지토리의 네이티브 SQL 로 한다.
2. 등록·수정: 표기·정의·영문명 중 하나라도 바뀌면 같은 트랜잭션에서 인코딩해 `UPDATE … SET EMBEDDING = ?, EMBEDDING_MODEL = ?, U_USR_ID…, U_AT…` — 네이티브 쓰기라 감사 칼럼을 명시(naming-dialect-rules §2, E15). 모델이 없거나 인코딩이 실패하면 용어 저장은 성공시키고 두 칼럼을 NULL 로 둔다(다음 재인코딩 배치가 채운다).
3. 캐시: 서버 메모리에 `term_id → float[1024]`(현재 `EMBEDDING_MODEL` 값인 행만). 추천 호출마다 **모델 조건 없이** `SELECT COUNT(*), MAX(U_AT) FROM TB_MDM_TERM` 으로 바뀜을 본다. 행 수가 줄었으면(삭제) 전체를 다시 읽는다(1만 행 23 ms, E10). 그 밖에 바뀌었으면 **모델 조건 없이** `U_AT >= 마지막 적재 시각` 인 행을 읽어, `EMBEDDING_MODEL` 이 현재 값인 행은 넣거나 바꾸고 아닌 행(NULL 포함 — 인코딩 실패·재인코딩 대기)은 캐시에서 뺀다. 여러 서버 인스턴스에서도 맞다. 경계 시각은 `>=` 로 겹쳐 읽어 같은 초 안의 쓰기를 놓치지 않는다.
4. 추천: 질의 입력 인코딩 → 캐시 전수 내적 → 자기 자신 제외 top-N(기본 5). 1차 문자열 추천과 합쳐 보이는 것은 화면 몫.
5. 재인코딩 배치(최초 구축·모델 교체): `WHERE EMBEDDING_MODEL IS NULL OR EMBEDDING_MODEL <> :current` 행을 배치 1·직렬로 인코딩(1만 건 약 6분). 진행 중에는 새 값 행끼리만 비교한다(02:540).
6. 재검토 임계: **현재 모델 벡터 100,000 건**(전수 비교 p95 51 ms·캐시 390 MB) 또는 운영 추천 응답 **p95 250 ms**(500 ms 의 절반) 중 먼저 오는 쪽. 그때 병렬 스캔 → ANN(③) 순으로 본다. 원천 전망은 "많아야 수만 건"(02:533)이다.

### 6.14 decisions.md 추가 항목 (→ M1, 문안 그대로. 시각은 Build 가 커밋 시각 UTC 로)

```markdown
## D-020 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 평가 엔진 spi·입구 계약과 평가 시각 주입
- **Decision made**: spi 5종(DefinitionLookup·CodeLookup·CodeEffLookup·MasterLookup·FunctionProvider) + 묶음 EngineLookups, 입구 RuleEngine·DomainValidator·CodeResolver 를 계약 초안으로 고정(docs/mdm/engine-contract/). 엔진은 시계를 읽지 않고 Instant evalTs 를 필수로 받는다 — 원천의 "주지 않으면 현재 시각"은 서버 API 층이 채운다. spi 는 EvalEx 타입 없이 LocalDateTime(KST)·BigDecimal(버전)만 쓰고 FunctionProvider 는 중립 기술자(지연 인자 없음). 원천 이탈 X1~X7 은 engine-contract.md §12
- **Rationale**: 06:461·463·471 의 spi 정의·의존 방향과 02:326 결정성. 초안을 EvalEx 3.7.0 jar 로 javac -Werror 컴파일하고 ArchUnit 허용 목록 밖 import 0 을 확인했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md, docs/mdm/engine-contract/java/**

## D-021 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: EvalEx 설정 고정값·문법 범위·칸별 허용 함수
- **Decision made**: precision 68 HALF_EVEN, zoneId Asia/Seoul, locale ROOT, allowOverwriteConstants=false, lenientMode=false, regexTimeoutMillis 100, maxRecursionDepth 2000, 배열·구조체·암묵 곱셈·작은따옴표·2진 끔(design D1). 사전 = STANDARD(EG 8.5 BASE 24종 + INSTR·MASTER·MASTER_AT) ∪ 비즈니스 함수. STR_FORMAT·STR_SPLIT·DT_*·RANDOM·LOG 등은 사전 밖이라 파싱 오류. 칸별 제한은 Slot 6종
- **Rationale**: 06:442-443. EvalEx 기본 zoneId·locale 이 JVM 기본값이라 호스트마다 달라짐을 실측했다. 사전 밖 함수가 파싱 단계에서 거부됨을 실측했다
- **Reversible**: yes(사전·문법 확장은 기존 식을 깨지 않는다)
- **Source**: docs/mdm/engine-contract.md §4·§5, MdmExpressionConfig.java, FunctionSets.java

## D-022 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: AST JSON·셀·코퍼스·판정 결과의 모양과 Java·TS 타입 출처
- **Decision made**: JSON Schema(docs/mdm/engine-contract/schema/engine-contract.schema.json)가 정본. TS 는 json-schema-to-typescript 로 생성, Java 는 엔진 의존 제약으로 손으로 쓴 record + 엔진 테스트 범위의 스키마 적합 검사(design D6). AST 노드 6종, 숫자는 문자열
- **Rationale**: wbs TSK-03-01 수용 기준 "Java·TS 타입이 같은 JSON 스키마에서 나온다", TRD §10(엔진 의존 EvalEx 하나). 실제 EvalEx 출력 AST 29건이 스키마를 통과했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md §9

## D-023 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 화면 JS 평가기 범위와 정합성 코퍼스 형식, MASTER_AT 기준일 문자열
- **Decision made**: op-code 셀은 구조 직접 비교, Expression·식 변수·열 조건은 AST 인터프리터, 결과 Expression 은 지원되면 미리보기 표시(원천 미결 06:389), MASTER 마루 데이터·MASTER_AT·attr 형태는 isSupported=false 로 서버 폴백, 화면도 예약 키(상수·EVAL_TS·_ 접두)를 서버와 같은 오류 코드로 거부. 코퍼스는 CorpusFile v1(ExprCase·CellCase, TypedValue 숫자 문자열, screenFallback). MASTER_AT base_dt 는 YYYYMMDD(00:00:00)·YYYYMMDDHHMMSS(KST), 그 밖은 평가 오류, NULL 은 false/NULL(design D5)
- **Rationale**: 06:271·716-731, EG 8.5. EvalEx 와 원천 JS 샘플의 NULL 동작 차이 6가지를 실측해 코퍼스 필수 사례에 더했다
- **Reversible**: yes
- **Source**: docs/mdm/engine-contract.md §7·§10·§11

## D-024 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 용어 임베딩 저장·검색 방식(pgvector 전제를 SQLite·MSSQL 로) — TRD 가정 T6
- **Decision made**: TB_MDM_TERM 의 EMBEDDING(SQLite BLOB / MSSQL VARBINARY(4096), L2 정규화 float32 LE 1024) + EMBEDDING_MODEL VARCHAR(100) 칼럼, 비교는 서버 메모리 전수 내적. 엔티티는 두 칼럼을 매핑하지 않고 네이티브 SQL 로만 다룬다. 파일 인덱스·MSSQL VECTOR·sqlite-vec 는 쓰지 않는다. 재검토 임계: 현재 모델 벡터 10만 건 또는 추천 p95 250 ms. T6 확정(design D2)
- **Rationale**: KURE-v1 INT8 PoC(Apple M5) — 1만 건 질의 p95 22 ms(표기 인코딩 포함), 전수 비교 10만 건 p95 51 ms, SQLite BLOB 1만 행 읽기 23 ms. 500 ms 기준 대비 여유가 커서 선택은 방언 이식성(NFR-6)과 원천 DDL 불변(02:533)으로 갈랐다. MSSQL VECTOR 는 SQL Server 2025 이상 전용이고 운영 버전은 저장소에서 확인 불가
- **Reversible**: yes(칼럼을 그대로 두고 인덱스만 더할 수 있다)
- **Source**: docs/mdm/term-embedding.md, poc/mdm-embedding-bench/results/README.md, docs/mdm/TRD.md T6, docs/mdm/naming-dialect-rules.md §3 #23

## D-025 (2026-09-24T..Z)
- **Phase**: design (TSK-02-02)
- **Decision needed**: 임베딩 풀링·입력 형식·모델 식별 값
- **Decision made**: CLS 풀링 + L2(INT8 변환본 README 의 masked mean 이 아님), 입력 "{표기}: {정의} ({영문명})", EMBEDDING_MODEL = "KURE-v1/int8-{onnx sha256 앞 8자}/cls-l2/in{입력 형식 버전}". ORT 1.30.0 intra 4·세션 공유·직렬 호출, 배치 1. 운영 INT8 파일은 원본 FP32 에서 직접 변환하는 것을 권고하되 담당자 확인(design D3·D4)
- **Rationale**: 원본 1_Pooling/config.json pooling_mode_cls_token=true·modules.json Normalize, 02:536. 모델·양자화·풀링·입력 중 하나만 바뀌어도 벡터 공간이 달라지므로 재인코딩 판별 값에 모두 넣는다(02:540)
- **Reversible**: yes(값이 바뀌면 재인코딩 배치가 따라온다)
- **Source**: docs/mdm/term-embedding.md §2
```

### 6.15 이 문서가 인용하는 측정 원시 파일 목록(→ C3 §3 링크)

`poc/mdm-embedding-bench/results/raw-01-info-tokens.txt`(그래프·토큰), `raw-02-single.txt`(콜드 로드·단건), `raw-03-batch-1000.txt`(배치·스레드 비교), `raw-04-batch-10k.txt`(1만 건, 다른 작업과 겹침), `raw-09-batch-10k-rerun.txt`(1만 건 단독 재측정 — 인용 값), `raw-05-scan.txt`(규모별 전수 비교), `raw-06-query.txt`(질의), `raw-07-sqlite.txt`(BLOB 왕복), `raw-08-pooling.txt`(풀링 정성).

### 6.16 새 문서 골격 (→ C1·C3)

`docs/mdm/engine-contract.md` — 첫머리 인용문에 "정본은 `engine-contract/schema/engine-contract.schema.json` 과 `engine-contract/java/**`, 이 문서는 설명이다. 출처 TSK-02-02 design §6" 을 적는다.

```
# 마루 MDM 평가 엔진 공유 계약
## 1. 범위와 정본            — 파일 목록(§2 C2 트리), 정본 관계, 계약 전용(실행 로직은 TSK-03-02·03·04)
## 2. 패키지와 의존 방향      — §6.1 표 + 06:463 방향 + ArchUnit 규칙(F2)
## 3. spi                     — §6.2 표, 시간·버전 타입
## 4. EvalEx 설정 고정값      — §6.4 표
## 5. 허용 함수 집합          — §6.5 표 + Slot + 제외 목록 + 비즈니스 함수 적재 규칙
## 6. 예약 이름               — §6.6
## 7. MASTER·MASTER_AT·CODE_LIST 와 평가 시각 — §6.7 (base_dt 형식 YYYYMMDD·YYYYMMDDHHMMSS 포함)
## 8. 판정 결과·오류·경고     — §6.8
## 9. AST JSON 스키마         — §6.3 + 노드 6종 표(F18 모양 예시 2개: 음수, -2^2)
## 10. 화면 JS 평가기 범위    — §6.9 표
## 11. 정합성 코퍼스 형식     — §6.10 + 표본 1건 인용(samples/sample-corpus.json 의 cell.range.upper-open-boundary)
## 12. 원천과 다른 점         — §6.2 X1~X7 표
## 13. 후속 Task 인계         — §6.17 표
```

`docs/mdm/term-embedding.md` — 첫머리 인용문에 "TRD 가정 T6 확정(D-024·D-025). 출처 TSK-02-02 design §6.11~§6.13".

```
# 용어 임베딩 방식 (2차 유사어 추천)
## 1. 결정 요약               — 선택안 ①, 풀링 CLS+L2, EMBEDDING_MODEL 값, 재검토 임계 한 문단
## 2. 모델·런타임·입력 형식   — §6.11 표(repo·revision·sha256·그래프 이름·pooling_mode_cls_token 인용)
## 3. 측정 요약               — §6.12 표 + §6.15 원시 파일 링크 + PoC 경로 poc/mdm-embedding-bench
## 4. 저장 방식 비교          — §6.13 후보 표(SQL Server 2025·확인 불가 문구 포함)
## 5. 선택안 DDL              — §6.13 SQL 블록
## 6. 동작 규칙               — §6.13 동작 규칙 1~6 (100,000 건·250 ms 임계)
## 7. 인계                    — TSK-02-03(ERD 칼럼), TSK-04-01(Flyway·MSSQL VARBINARY 왕복 실측), TSK-04-02(런타임 의존·캐시·배치·임계 감시)
```

### 6.17 후속 Task 인계 (→ C1 §13, C3 §7)

| 받는 Task | 인계 |
|---|---|
| TSK-03-01 엔진 공유 계약 | `docs/mdm/engine-contract/java/**` 를 `maru-mdm-engine/src/main/java` 로 옮긴다(`create` 등 `UnsupportedOperationException` 본문은 계약 전용 그대로). 스키마를 m-mdm 으로 가져가 `json-schema-to-typescript` 로 TS 생성(D6), 엔진 테스트에 스키마 적합 검사 추가. ArchUnit 은 그대로 통과해야 한다 |
| TSK-03-02 식 평가 코어 | `MdmExpressionConfig.create`, `AstExporter`(06:446, F18 의 params 생략 규칙), MASTER·MASTER_AT·INSTR `AbstractFunction`, base_dt 해석(§6.7), `CodeResolver` 구현, `DomainValidator`, `ExpressionEvaluator` 를 팩토리로 전환(F3), 동시 평가 1,000 스레드 copy() 검증 |
| TSK-03-03 룰 판정 엔진 | `RuleEngine`·`RuleResult`·`RuleSetResult`·`RuleView`·`EngineEvaluationException` 구현, 생성 텍스트는 `FunctionSets.GENERATED` 안 |
| TSK-03-04 JS 평가기·코퍼스 | §6.9 범위, 원천 인터프리터에 INSTR·STR_LEFT·STR_RIGHT·STR_SUBSTRING 추가, NULL 동작을 서버에 맞춤(F19·F20), §6.10 코퍼스 필수 사례 |
| TSK-02-03 DB 설계 | `TB_MDM_TERM` 에 `EMBEDDING`·`EMBEDDING_MODEL`(§6.13 DDL) |
| TSK-04-01 02 계약 | Flyway 두 방언 칼럼, MSSQL `VARBINARY(4096)` JDBC 왕복 실측(naming-dialect-rules #23 상태 갱신), 엔티티 미매핑 |
| TSK-04-02 용어 관리 | ORT 1.30.0·DJL tokenizers 0.38.0 을 mdm/lib 에, 모델 경로 설정, §6.13 동작 규칙 1~6, D3 결과에 따른 모델 파일, 메모리 산정(RSS 약 1.3 GB) |

---

## 담당자 확인 필요 결정

### D1 — EvalEx 문법과 함수 사전을 얼마나 줄일지
- **질문**: 원천이 정하지 않은 문법 옵션(배열 `A[0]`, 구조체 `a.b`, 암묵 곱셈 `2x`)과 `STR_*` 중 `STR_FORMAT`·`STR_SPLIT` 을 허용할 것인가?
- **선택지**: (a) 모두 끈다 — AST 노드 6종, STR_* 는 11종 / (b) EvalEx 기본대로 모두 켠다 — AST 9종, 화면 인터프리터가 배열·구조체도 해석 / (c) 암묵 곱셈만 켠다
- **택한 것**: (a)
- **근거**: 원천 레코드는 표준 물리명 평평한 맵이라 배열·구조체가 들어올 자리가 없고(06:125, F23), 생성 텍스트는 명시 곱셈만 쓴다. 문법을 좁히면 화면 인터프리터·코퍼스가 다룰 범위가 줄어 정합성(AC-3) 위험이 준다. `STR_FORMAT` 은 로캘·Java `String.format` 의존이라 JS 로 같게 못 만들고(06:442), `STR_SPLIT` 은 배열을 돌려 조건·결과 셀에서 쓸 곳이 없다. 원천 EG 8.5 가 `STR_*` 로 뭉뚱그린 것을 구체화한 해석이다(근거 순위: 원천 문장 > 리포 관례, 원천이 비워 둔 칸).
- **반려되면 재작업 방향**: (b) 면 `MdmExpressionConfig.baseBuilder()` 의 세 옵션을 true 로, 스키마 `AstNode` 에 `ARRAY_INDEX`·`STRUCTURE_SEPARATOR` 정의를 더하고(원천 EG 8.3 표 그대로), `FunctionSets.BASE` 에 두 함수를 넣고, TS 타입·AstSampleExport 의 REJECT 목록을 고친다. (c) 면 `implicitMultiplicationAllowed(true)` 와 REJECT 에서 `2x` 만 뺀다.

### D2 — 임베딩 저장 위치
- **질문**: 벡터를 원장 `TB_MDM_TERM` 칼럼에 둘 것인가, 별도 테이블·파일 인덱스·DB 네이티브 벡터에 둘 것인가?
- **선택지**: (a) ① 원장 칼럼 BLOB/VARBINARY + 메모리 전수 비교 / (b) ② 별도 테이블 + 메모리 비교 / (c) ③ 파일 ANN 인덱스 / (d) ④ MSSQL VECTOR(+ SQLite 는 ①)
- **택한 것**: (a)
- **근거**: spec 은 비교와 선택을 요구하고, 원천 02:533 은 "칼럼 하나"를 정했으며 TSK-02-01 이 원천 DDL 불변을 정했다(승인 전 선행, 2순위). 측정(E8·E9)으로 속도는 어느 안이든 충분하므로 갈림은 방언 이식성(NFR-6)이다. ④ 는 운영 버전 확인 불가·SQL Server 2025 전용(E13·E14), ③ 은 동기화 경로가 하나 더 생긴다. ② 의 장점(감사 칼럼·그리드 조회 분리)은 엔티티 미매핑 규칙으로 ①에서도 얻는다.
- **반려되면 재작업 방향**: (b) 면 `term-embedding.md` §5 DDL 을 `TB_MDM_TERM_EMB(TERM_ID PK·FK, EMBEDDING, EMBEDDING_MODEL, 감사 9칼럼)` 으로 바꾸고, naming-dialect-rules #23·D-024 문안의 칼럼 위치를 고치고, ADR-0001 원천 DDL 불변의 예외로 적는다. (c) 면 인덱스 파일 경로·재구축 트리거를 동작 규칙에 더하고 HNSW 라이브러리 의존을 mdm/lib 에 둔다. (d) 면 운영 버전이 2025 이상임을 먼저 확인받고, MSSQL DDL 만 `VECTOR(1024)`·검색을 `VECTOR_DISTANCE` 로, JDBC 13.1 이상으로 올리고, SQLite 는 ① 경로를 유지하는 방언 분기를 적는다.

### D3 — 운영 INT8 모델 파일을 어디서 가져올지
- **질문**: HF 의 제3자 INT8 변환본(`thkmon/KURE-v1-onnx-int8`)을 운영에 그대로 쓸 것인가, 원본 FP32 에서 직접 양자화할 것인가?
- **선택지**: (a) 원본 `nlpai-lab/KURE-v1`(MIT) FP32 에서 직접 ONNX 변환 + `quantize_dynamic` QInt8, 변환 스크립트·sha256 을 저장소에 기록 / (b) 제3자 변환본을 revision·sha256 고정으로 사용 / (c) (b) 로 시작하고 (a) 를 뒤에
- **택한 것**: (a) 권고 — 단 PoC 측정은 (b) 파일로 했다
- **근거**: 원천 02:536 이 "변환은 MIT 인 원본 FP32 에서 직접" 을 정했다(원천, 1순위에 준함). 제3자 README 의 풀링 설명이 원본과 다르다(E5) — 메타데이터를 믿기 어렵다는 증거다. 변환 방식(`quantize_dynamic` QInt8, opset 17)이 같다고 적혀 있어 PoC 속도 수치는 직접 변환본에도 옮겨진다고 본다(구조·양자화 방식이 같음). 파일이 바뀌면 `EMBEDDING_MODEL` 의 sha 부분이 바뀌어 재인코딩이 자동으로 따라온다(D4).
- **반려되면 재작업 방향**: (b) 면 `term-embedding.md` §2 에 repo·revision·sha256 을 운영 값으로 확정하고 D-025 의 "권고" 문장을 지운다. 변환 스크립트 인계를 TSK-04-02 에서 뺀다.

### D4 — EMBEDDING_MODEL 값에 무엇을 넣을지
- **질문**: 원천 예시는 `KURE-v1` 이다(02:818). 모델 이름만 적을 것인가, 파일·풀링·입력 형식까지 적을 것인가?
- **선택지**: (a) `KURE-v1/int8-{sha8}/cls-l2/in{n}` / (b) `KURE-v1` 만 — 파일·형식이 바뀌면 사람이 값을 올린다 / (c) 별도 칼럼(모델 버전·입력 버전)을 더한다
- **택한 것**: (a)
- **근거**: 원천이 이 칼럼을 둔 목적은 "다시 만들 행을 고르는 기준"이다(02:540). 같은 KURE-v1 이라도 양자화 파일·풀링·입력 결합 형식이 바뀌면 벡터 공간이 달라져 비교할 수 없다. 값 하나에 모두 넣으면 TSK-04-02 수용 기준("embedding_model 이 다른 행은 재인코딩 대상")이 자동으로 맞는다. (c) 는 원천 DDL 을 바꾼다.
- **반려되면 재작업 방향**: (b) 면 §6.11 값 규칙을 "모델 이름, 변경 시 수동 증분 접미사(`KURE-v1.2`)" 로 바꾸고 동작 규칙에 "모델 파일·입력 형식을 바꿀 때 값을 올린다" 를 운영 절차로 적는다. (c) 면 TSK-02-03 에 칼럼 추가를 인계하고 ADR-0001 원천 DDL 불변 예외로 적는다.

### D5 — MASTER_AT 기준일 문자열 형식
- **질문**: 식 안의 `base_dt` 는 레코드 문자열이다(F23). 원천은 "일자 타입이면 그날 00:00:00" 만 정했고 초 정밀도 문자열 형식은 정하지 않았다. 무엇을 받을 것인가?
- **선택지**: (a) `YYYYMMDD` 와 `YYYYMMDDHHMMSS`(KST)만, 그 밖은 평가 오류, NULL 은 false/NULL / (b) (a) + `YYYY-MM-DD HH:MM:SS`·ISO-8601 / (c) `YYYYMMDD` 만
- **택한 것**: (a)
- **근거**: 원천 일자 도메인은 고정 길이 숫자 문자열(`YYYYMMDD`, 06:127)이고 초 정밀도도 같은 계열로 두면 사전순 = 시간순이 유지된다. 형식을 좁게 받아야 서버·하위 시스템 해석이 갈리지 않는다. NULL 을 false/NULL 로 둔 것은 key NULL 규칙(05:374)과 06 NULL 정책("어느 조건에도 걸리지 않는다")과 같게 한 것이다.
- **반려되면 재작업 방향**: (b) 면 `engine-contract.md` §7 의 형식 목록에 두 형식을 더하고 코퍼스에 사례를 추가한다. (c) 면 14자리 줄을 지우고 초 정밀도 기준일은 `MASTER`(평가 시각)로만 쓴다고 적는다. NULL 을 오류로 바꾸라는 반려면 §7·D-023 의 NULL 문장을 `EVALUATION_ERROR` 로 바꾼다.

### D6 — Java·TS 타입을 스키마에서 "나오게" 하는 방법
- **질문**: TSK-03-01 수용 기준 "Java·TS 타입이 같은 JSON 스키마에서 나온다" 를 어떻게 지킬 것인가?
- **선택지**: (a) 스키마 정본, TS 는 json-schema-to-typescript 생성, Java 는 손으로 쓴 record + 엔진 테스트의 스키마 적합 검사 / (b) Java·TS 모두 생성(jsonschema2pojo 등) / (c) Java record 가 정본, 스키마·TS 를 Java 에서 생성
- **택한 것**: (a)
- **근거**: 엔진 main 의존은 EvalEx 하나다(TRD §10, F2). 코드 생성기는 Jackson 주석 등 런타임 의존을 끌고 오므로 (b) 는 이 제약과 부딪힌다. (c) 는 스키마 생성 라이브러리를 엔진 빌드에 넣어야 하고, 화면 쪽 정본이 Java 빌드에 묶인다. (a) 는 의존을 테스트 범위에만 두면서 "같은 스키마" 를 테스트로 강제한다.
- **반려되면 재작업 방향**: (b) 면 생성 Java 를 엔진 밖 모듈(예: `maru-mdm-contract`)에 두는 구조를 TRD §1 에 더하고 엔진 ArchUnit 허용 목록을 고친다. (c) 면 스키마 파일을 빌드 산출물로 바꾸고 `engine-contract/schema` 를 생성 결과 보관 위치로 바꾼다.
