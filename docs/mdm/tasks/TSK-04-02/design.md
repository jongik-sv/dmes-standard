# TSK-04-02 설계 — 용어·단위 관리 (유사어 추천 포함)

> Phase 02 Design. 작업 디렉터리 `/Users/jji/project/dmes-standard/dflow-91b83c83`(브랜치 `agent/91b83c83-term-unit-mng`, 기점 origin/dev 3d08db7).

> **화면 설계 산출물(팀장 지시, 담당자 확인 필요 결정 D14)**: 5종 대신 기능설계서 1종만 작성했다 —
> [단위 마스터 기능설계서](../../screens/unitMng/unitMng_기능설계서.md),
> [용어 관리 기능설계서](../../screens/termMng/termMng_기능설계서.md).

## 0. entry-point 정정 — `mdt` 는 낡은 값이다

`spec.md:4` 는 `entry-point: /portal → mdt/unitMng ...; mdt/termMng ...` 라고 적었지만, 이 `mdt` 그룹 코드는
TSK-02-01(ADR-0003)이 식별자 사전 §A.2.1 규칙에 맞춰 `mdt→dma` 로 전면 치환하기로 확정한 옛 TRD 가정
값이다. `docs/mdm/wbs.md:531`(v1.3, 정본)과 `docs/mdm/screens/README.md:35-36`(화면 그룹·screenId 목록의
정본)는 이미 **`dma/unitMng`**, **`dma/termMng`** 로 등재해 두었다. `TSK-01-03`이 실제로
`DataInitializer.migrateMdmSampleGroupToDma()`(옛 `mdt` 데이터를 `dma` 로 옮기는 마이그레이션)까지 코드에
반영했고, 자매 작업 TSK-04-05 도 같은 사유로 `mdt/dictSystemMng` 를 `dma/dictSystemMng` 로 읽기로 했다
(`docs/mdm/tasks/TSK-04-05/design.md:12`). 본 설계는 이하 전부 **`dma/unitMng`**, **`dma/termMng`** 를
정본으로 쓴다.

## 1. 접근 방식

두 화면은 서로 독립적이지만 같은 그룹(`dma` 용어·도메인)·같은 패턴을 공유하므로 한 설계로 묶는다.

- **백엔드**: mdm 모듈에 실제 OASIS 서비스가 하나도 없다(`src/backend/mdm/api/.../services/` 가 비어
  있음, TSK-01-03 F14). 이 작업이 mdm 최초의 실제 OASIS 서비스이므로, 이미 실전 검증된 `m-mls` 의
  `noticeMgmt` 서비스(BPMN `exclusiveGateway` action 라우팅 + `@Service` 빈 + `@Transactional` 금지)를
  그대로 이식한다. `TB_MDM_UNIT`/`TB_MDM_TERM` 엔티티·리포지터리는 TSK-04-01 이 이미 만들어 두었으므로
  CRUD 는 그 위에 얹는다. `contract.dictionary` SPI(5개 인터페이스)는 이 작업이 구현·소비하지 않는다
  (TB_MDM_UNIT/TB_MDM_TERM 은 그 SPI 의 대상 테이블이 아니다) — SPI 변경 없음, BLOCKED 후보 아님.
- **OASIS action 이름은 mls 를 그대로 베끼면 안 된다.** mls 는 자기 모듈 전용 권한 어휘를 쓰지만 mdm 은
  TSK-01-03 이 이미 `PERM_MDM_READ/EDIT/CONFIRM` 3세트로 딱 13개 액션 문자열(`MdmActions`: search, view,
  export, compare, save, delete, reg, import, validate, execute, copy, restore, confirm)만 시드해 뒀다.
  BFF(`evaluateApiPolicy`)는 URL 의 `{action}` 세그먼트를 이 13개 중 사용자가 가진 것과 **문자열 그대로**
  비교하므로, `get`·`dimensions`·`recommend1`·`recommend2`·`reencodeBatch` 처럼 어휘 밖 이름을 액션으로
  쓰면 관리자든 담당자든 전부 403 이 난다(§5 I14). **BPMN 의 `action`(라우팅·RBAC 키)과 서비스의
  `method`(자바 메서드명)는 별개**이므로, action 은 13개 안에서 고르고 method 는 원하는 대로 서술적으로
  짓는다(§2 표).
- **임베딩**: TSK-02-02 는 저장 형식(EMBEDDING BLOB/VARBINARY 4096, CLS+L2, float32 LE 1024)과 성능
  전제(서버 메모리 전수 비교로 충분)만 확정했고 **인코더의 인터페이스·구현은 전혀 설계하지 않았다** — 이
  작업이 처음 만든다. `TermEmbeddingEncoder` 인터페이스 뒤에 운영 기본(비활성 no-op)·테스트 전용
  결정적 가짜·ONNX 실 구현(수동 게이트 전용) 세 구현을 둔다. **운영 기본을 가짜로 두지 않는다** —
  TRD.md:137 "모델이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다"를 그대로 지켜야 하므로, 실제 배포
  환경에 모델 파일 없이 fake 벡터가 `EMBEDDING` 에 박히는 사고를 막는다.
- **프런트**: `m-mdm` 은 아직 스캐폴드 화면(`mdmSample`) 하나뿐이라 실전 CRUD 화면 선례가 없다. 구조가
  동일한 `m-mls/noticeMgmt`(좌측 그리드 read-only + 우측 상세 폼, `@dk-oasis/shared/*` 만 사용, 행 선택은
  이미 받아 둔 그리드 데이터로 폼을 채우고 별도 조회 왕복을 하지 않는다)를 그대로 이식하고,
  `MdmPageLayout` 공통 셸(TSK-01-03)을 얹는다. 디바운스 유사어 추천 패널은 리포에 선례가 없어 새로
  만든다(순수 `setTimeout`+`AbortController`, `@mantine/hooks` 는 화면 모듈에서 import 금지라 못 쓴다).
- **환산 계산은 서버가 유일한 근원이다.** FE 는 계산하지 않고 서버 응답을 그대로 보여준다(§5 I2) —
  02 설계 문서가 "환산은 decimal 연산으로 한다"고 명시했고, 계산이 두 곳에 있으면 반올림·스케일이
  갈릴 위험이 있다.
- **스키마**: TSK-04-01 이 만든 V3 를 고치지 않는다. 다만 `UX_TB_MDM_TERM_ABBR`(영문 약어 부분 유일
  인덱스)가 수용 기준 "약어 중복 경고"(거부 아님)와 정면으로 상충한다(담당자 확인 필요 결정 D1) — V5 를
  새로 채번해 유일 인덱스를 비유일로 교체하고, 이 인덱스의 유일성을 전제로 하던 기존 회귀 테스트 2개를
  함께 고친다(§2, §3.2).
- **MSSQL 의 `UNIT_CODE`/`BASE_UNIT`/`DIMENSION` 은 비유니코드 콜레이션이다.** 02 설계 문서 예시대로
  한글 차원명("질량" 등)을 그대로 저장하면 MSSQL 에서 뭉개져 I1(차원 다름 판정)이 무력화될 수 있다
  (담당자 확인 필요 결정 D11) — 이 세 칼럼 값은 ASCII 코드로만 받고, 한글은 FE 상수 맵으로만 보여준다.

## 2. 변경 파일 목록

### 생성 — 화면 설계 산출물(팀장 지시, D14)

| 경로 | 내용 |
|---|---|
| `docs/mdm/screens/unitMng/unitMng_기능설계서.md` | 단위 마스터 기능설계서(5종 중 1종, DEC-001 선례). `docs/guide/design/templates/기능설계서.template.md` 구조 준수 |
| `docs/mdm/screens/termMng/termMng_기능설계서.md` | 용어 관리 기능설계서(동일) |

### 생성 — 백엔드

| 경로 | 내용 |
|---|---|
| `src/backend/mdm/api/src/main/resources/services/dma/unitMng.bpmn` | `action`(RBAC 키)=`search→search`, `save→save`, `delete→delete`, `compare→convertPreview`(method) |
| `src/backend/mdm/api/src/main/resources/services/dma/termMng.bpmn` | `action`=`search→search`, `save→save`, `delete→delete`, `compare→recommend`(1차+2차 결합), `execute→reencodeBatch`(관리자 전용, EDIT 세트에만 있고 READ 세트엔 없음) |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/unitMng/service/UnitMngService.java` | `@Service("unitMngService")`, `@Transactional` 금지. `search`(필터+차원별 확립된 base_unit 목록도 같이 반환), `save`, `delete`, `convertPreview` |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/unitMng/dto/{UnitSearchRequest,UnitSearchResult,UnitRow,DimensionOption,UnitSaveRequest,UnitDeleteRequest,ConvertPreviewRequest,ConvertPreviewResult}.java` | |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/unitMng/UnitForbiddenCodes.java` | 월/년/영업일/근무시간에 대응하는 ASCII 금지 단위 코드 상수(`MONTH`,`MON`,`YEAR`,`YR`,`BIZDAY`,`WORKHOUR`, I4·I20) |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/termMng/service/TermMngService.java` | `@Service("termMngService")`. `search`, `save`, `delete`, `recommend`(1차 문자열+2차 임베딩을 한 응답으로 결합), `reencodeBatch`(청크 500건, 진행 상태 반환) |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/termMng/dto/{TermSearchRequest,TermSearchResult,TermRow,TermSaveRequest,TermSaveResult,TermDeleteRequest,RecommendRequest,RecommendCandidate,ReencodeBatchRequest,ReencodeBatchResult}.java` | `TermSaveResult` 에 `warnings:["ENG_ABBR_DUP"]` 같은 비차단 경고 필드(I8). `RecommendCandidate` 에 `stage:"1"\|"2"` |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/TermEmbeddingEncoder.java` | interface `boolean isEnabled()`, `float[] encode(String text)`, `String modelId()` |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/NoopTermEmbeddingEncoder.java` | **운영 기본값.** `isEnabled()=false`, `encode`/`modelId` 는 호출되지 않아야 하지만 방어적으로 `UnsupportedOperationException`. `@ConditionalOnProperty(name="mdm.embedding.encoder", havingValue="none", matchIfMissing=true)` |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/DeterministicHashTermEmbeddingEncoder.java` | **테스트 전용.** 입력 문자열 해시 시드 PRNG → 1024차원 → L2 정규화, 결정적(같은 입력 → 같은 벡터). `modelId()`="fake-hash/test-only". `@ConditionalOnProperty(name="mdm.embedding.encoder", havingValue="fake")` — main `application.yml` 에는 이 값을 두지 않고, 필요한 테스트 클래스에 `@TestPropertySource(properties="mdm.embedding.encoder=fake")` 로만 켠다 |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/OnnxKureEmbeddingEncoder.java` | **실 구현(수동 게이트 전용).** ORT 1.30.0 + DJL tokenizers 0.38.0, CLS+L2, 입력 `"{표기}: {정의} ({영문명})"`(D-025). 기동 시 로드한 모델 파일의 sha256 을 실제로 계산해 `modelId()="KURE-v1/int8-{sha8}/cls-l2/in1"` 을 만든다(하드코딩 금지, I9). `@ConditionalOnProperty(name="mdm.embedding.encoder", havingValue="onnx")` |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/TermEmbeddingCodec.java` | `byte[](4096)` ↔ `float[](1024)` 변환, L2 노름 검증 |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/common/embedding/TermEmbeddingRepository.java` | EMBEDDING/EMBEDDING_MODEL 전용 네이티브 SQL(`JdbcTemplate`) — JPA 로는 못 다룸(I10) |
| `src/backend/mdm/lib/src/main/java/com/dongkuk/dmes/mdm/dma/termMng/TermRecommendationCache.java` | 인메모리 캐시(`termId → {termName, senseNo, engName, synonyms[], aliases[], embedding float[]|null}`). **`ApplicationReadyEvent` 리스너에서 전체 적재한다(`@PostConstruct` 아님 — 부팅 초기에는 Flyway 마이그레이션이 아직 끝나지 않았을 수 있어 `JdbcTemplate` 조회가 부팅을 실패시킬 위험이 있다)**, save/delete 때 해당 행만 갱신(전체 재적재 아님) — 1차·2차 추천이 매 요청 DB 를 훑지 않게 하는 성능 전제(I19) |
| `src/backend/mdm/api/src/main/resources/db/migration/mdm/sqlite/V5__term_abbr_index_relax.sql` | `DROP INDEX UX_TB_MDM_TERM_ABBR;`<br>`CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;`(비유일, 필터는 그대로 유지 — NULL 행은 색인 안 함) |
| `src/backend/mdm/api/src/main/resources/db/migration/mdm/mssql/V5__term_abbr_index_relax.sql` | `DROP INDEX UX_TB_MDM_TERM_ABBR ON TB_MDM_TERM;`<br>`CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;`(양쪽 방언 동일 의미: 비유일·필터 유지) |
| `src/backend/mdm/api/src/onnxTest/java/com/dongkuk/dmes/mdm/embedding/OnnxKureEmbeddingEncoderManualTest.java` | 수동 게이트 전용(§3.3). **스프링 컨텍스트를 띄우지 않는 순수 JUnit 테스트** — `OnnxKureEmbeddingEncoder` 를 `new` 로 직접 만든다. `mdm.embedding.encoder=onnx` 로 스프링 컨텍스트를 띄우면 모델 경로가 비어 있을 때 빈 생성 자체가 실패해 SKIPPED 대신 빨강이 난다. 모델 파일 유무 확인(`Assumptions.assumeTrue`)은 `@BeforeAll` 에서 하고, 없으면 이후 전부 스킵 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/unitMng/UnitMngServiceTest.java` | I3~I5 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/unitMng/UnitConvertPreviewTest.java` | I1, I2 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/termMng/TermMngServiceTest.java` | I6, I7, I8, I12 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/termMng/TermReencodeBatchTest.java` | I11, I12 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/dma/termMng/TermRecommendPerformanceTest.java` | I9, I18, I19, 수용 기준 AC7 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmOasisActionVocabularyTest.java` | I14 정적 검사 — `services/dma/unitMng.bpmn`·`termMng.bpmn` 을 파싱해 모든 `sequenceFlow` 의 액션 이름(게이트웨이에서 나가는 flow 의 `name`)이 `MdmActions` 상수 13개의 부분집합인지 단언한다. 스프링 컨텍스트 없이 XML 파싱만 하는 순수 단위 테스트(빠르다) |
| `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/embedding/TermEmbeddingCodecTest.java` | I9 |
| `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/embedding/DeterministicHashTermEmbeddingEncoderTest.java` | 결정성·차원·노름 검증 |
| `src/backend/mdm/lib/src/test/java/com/dongkuk/dmes/mdm/common/embedding/NoopTermEmbeddingEncoderTest.java` | I12, I13 — `lib` 은 `@SpringBootApplication`·Flyway 리소스가 없어 `@SpringBootTest` 컨텍스트를 못 띄운다(TSK-04-01 F6). 스프링 `ApplicationContextRunner` 로 임베딩 설정 클래스만 올려서 확인한다: 프로퍼티 없음 → `NoopTermEmbeddingEncoder` 빈, `mdm.embedding.encoder=fake` → `DeterministicHashTermEmbeddingEncoder` 빈. DB 불필요 |

### 수정 — 백엔드

| 경로 | 내용 |
|---|---|
| `src/backend/mcm/api/src/main/java/com/dongkuk/dmes/mcm/init/DataInitializer.java` | `seedMdmMenus()` 에 `unitMng`(`"002"`,`"5010200"`)·`termMng`(`"003"`,`"5010300"`) leaf 3줄씩 추가(mdmSample 선례 패턴, "코드베이스 지식" 절 참고), `seedMdmObjectRbac("unitMng","dma")`, `seedMdmObjectRbac("termMng","dma")` |
| `src/backend/mdm/lib/build.gradle` | ORT 1.30.0, DJL tokenizers 0.38.0 의존성 추가(라이브러리 jar 만 — 모델 파일 아님, 항상 의존해도 testAll 영향 없음) |
| `src/backend/mdm/api/src/main/resources/application.yml` | `mdm.embedding.encoder: none`(운영 기본), `mdm.embedding.model-dir: ""` 추가 |
| `src/backend/mdm/api/build.gradle` | `mssqlTest` 와 같은 패턴으로 `onnxTest` sourceSet(`compileClasspath`/`runtimeClasspath` 에 `sourceSets.main.output + sourceSets.test.output` 추가, `onnxTestImplementation.extendsFrom testImplementation`)을 신설하고, `onnxEmbeddingManualTest` Test 태스크를 등록한다(`testClassesDirs = sourceSets.onnxTest.output.classesDirs`, testAll 미포함). 태스크 안에서 `systemProperty 'mdm.embedding.model-dir', System.getenv('MDM_EMBEDDING_MODEL_DIR') ?: ''`, `systemProperty 'mdm.embedding.encoder', 'onnx'` 로 환경변수를 JVM 시스템 프로퍼티로 전달한다 |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMigrationTest.java` | **두 메서드** 수정: ① `UX_TB_MDM_TERM_ABBR_만_NULL_다건_허용_동일_비NULL_은_거부한다()` → V5 이후 사실이 바뀌었으므로 이름·본문을 "동일 비NULL 중복은 이제 허용되고 비유일 인덱스로만 존재한다"로 고친다(요구사항이 시킨 교정이지 완화가 아니다, D1). ② `제약_인덱스_이름이_규칙표를_따른다()`(84행)의 `indexNames.containsAll(Set.of("UX_TB_MDM_TERM_ABBR", ...))` 도 `"IX_TB_MDM_TERM_ABBR"` 로 바꾼다 — 안 바꾸면 이 단언도 V5 이후 사라진 이름을 찾다 빨강이 된다 |
| `src/backend/mdm/api/src/mssqlTest/java/com/dongkuk/dmes/mdm/MdmTermDomainColumnMssqlMigrationTest.java` | `필터_인덱스는_UX_TB_MDM_TERM_ABBR_만이고_NULL_다건_중복_비NULL_거부를_강제한다()` → 동일 취지로 고친다(`is_unique=1` 단언 제거, 중복 INSERT 가 이제 성공하는지로 단언 반전) |
| `src/backend/mdm/api/src/test/java/com/dongkuk/dmes/mdm/MdmSharedContractMigrationTest.java` | `flyway_가_V1_V2_V3_를_적용했다()` 의 `assertEquals(Set.of("1","2","3"), versions)` → `Set.of("1","2","3","4")`(F18 이 이미 예고한 대로, 이름도 `...V5_를_적용했다` 로 바꾼다) |
| `docs/mdm/erd/verify/expected-columns.json`, `docs/mdm/erd/verify/Verify.java` | `expected-columns.json:162` 의 `{"name": "UX_TB_MDM_TERM_ABBR", ...}` 를 `"IX_TB_MDM_TERM_ABBR"` 로 바꾼다. `Verify.java` 의 "약어 중복 거부" 스모크(879-883행 부근)는 docs 전용 검증기이므로 실제 게이트는 아니지만, 문서 자체가 모순된 채로 남지 않도록 "V5 로 비유일 전환, 중복 허용" 으로 고친다(팀장 지시 #8) |
| `docs/mdm/erd/02-term-domain-column.sqlite.sql`, `docs/mdm/erd/02-term-domain-column.mssql.sql` | `CREATE UNIQUE INDEX UX_TB_MDM_TERM_ABBR ...` 줄에 "TSK-04-02 V5 로 비유일 전환" 주석 추가(원문은 TSK-02-03 스냅샷이라 고치지 않고 각주만 단다) |
| `docs/mdm/naming-dialect-rules.md` | `UX_TB_MDM_TERM_ABBR` 예시 각주에 "TSK-04-02 V5 에서 비유일 `IX_TB_MDM_TERM_ABBR` 로 교체" 인계 한 줄 추가 |

### 생성 — 프런트

| 경로 | 내용 |
|---|---|
| `src/frontend/m-mdm/pages/dma/unitMng/{page.tsx,api.ts,types.ts}` | noticeMgmt 패턴, `MdmPageLayout`. 환산 미리보기는 서버 `compare` 응답을 그대로 표시(클라이언트 계산 없음). "차원" 입력은 `@dk-oasis/shared/form` `ComboBox`(`onCreateNew` prop 확인됨 — 자유 입력 지원, shared 수정 불필요)로 기존 `search` 응답의 `dimensionOptions` 를 후보로 자동완성하면서 새 ASCII 코드도 입력받는다 + 로컬 상수 맵(`DIMENSION_LABELS`: `MASS→질량`, `LENGTH→길이`, `TIME→시간`, `COUNT→개수`)으로 한글 라벨만 표시한다(I20·I21, D11) |
| `src/frontend/m-mdm/pages/dma/termMng/{page.tsx,api.ts,types.ts}` | 상동 + 유사어 추천 패널(디바운스 → `compare` 액션 1회 호출, 응답의 `stage`별로 표를 나눠 그린다) |
| `src/frontend/m-mdm/src/hooks/use-debounced-effect.ts` | 순수 `useEffect`+`setTimeout`, cleanup 시 clearTimeout + 이전 요청 `AbortController.abort()`(LookupModal 취소 패턴 차용) |
| `src/frontend/m-mdm/tests/dma/unitMng/unit-mng-page.test.ts` | 렌더 스모크(`mdm-page-layout.test.ts` 패턴). 폼 필수값 검증(클라이언트 사이드 필수 입력 표시)만 다루고 환산 계산은 다루지 않는다 |
| `src/frontend/m-mdm/tests/dma/termMng/term-mng-page.test.ts` | 렌더 스모크 |
| `src/frontend/m-mdm/tests/hooks/use-debounced-effect.test.ts` | `vi.useFakeTimers` |
| `src/frontend/e2e/mdm-unitMng.spec.ts` | 수용 기준에 파일명 고정. 스모크 4종(§3.1) |
| `src/frontend/e2e/mdm-termMng.spec.ts` | 상동 |
| `docs/mdm/tasks/TSK-04-02/screens/*.png` | E2E 스크린샷(Verify 단계 산출) |

### 수정 — 프런트

| 경로 | 내용 |
|---|---|
| `src/frontend/m-mdm/tsup.config.ts` | `pages/dma/unitMng/page`, `pages/dma/termMng/page` 엔트리 2줄 추가(안 하면 `tsup-entries.smoke.test.ts` 가 즉시 빨강) |

FE 라우트 레지스트리(`m-mcm/lib/generated/page-registry.ts`)는 codegen 산출물이라 손으로 고치지 않는다.
`mdm-shell-rbac-smoke.spec.ts`(`MDM_MENU_IDS`/`toContain("dma")`)와 `mdm-rbac-seed-check.sql`(`OBJECT_ID=
'mdmSample'` 만 대조)은 **둘 다 새 leaf 를 추가해도 그대로 통과한다** — 확인했으므로 수정 목록에 넣지
않는다.

## 3. 테스트 전략

### 3.1 화면 스모크 넷(dev-discipline 「화면 작업의 브라우저 E2E」)

두 화면 다 그리드·입력이 있으므로 4항목 전부 해당한다. E2E 서버 절차는 "E2E 서버 절차" 절 참고. 재실행 안전성을 위해
등록 데이터에는 실행마다 다른 접미사를 붙인다 — `Date.now().toString(36)`(약 8자)처럼 짧게 쓴다.
`UNIT_CODE`/`BASE_UNIT` 은 20자, `DIMENSION` 은 50자 한도(I20)라 13자리 10진수 타임스탬프를 그대로
붙이면 `TESTKG_`(7자)+13자=20자로 한도에 딱 맞아 여유가 없다 — 36진수로 줄여 여유를 둔다.

**`mdm-unitMng.spec.ts`**
1. 메뉴 이동: 로그인(표준 관리자, `e2e_mdm_stdadmin`/`admin123` — admin/SYSADMIN 만으로 돌리면 I14
   RBAC 결함이 가려진다) → 사이드바 `MDM > 용어·도메인 > 단위 마스터` 클릭 → `dma/unitMng` 화면 로드.
2. 빈 상태: 존재할 리 없는 키워드(`__E2E_NOMATCH_<suffix>__`)로 검색해 빈 상태 문구를 확인한다(DB 가
   이미 다른 실행의 데이터를 갖고 있어도 항상 참이라 재실행에 안전하다).
3. 화면 조작만으로 등록 1회 + 서버 데이터로 채워짐 확인: 필터를 지우고, 차원 `TEST_MASS_<suffix>`
   (매 실행 고유), 단위 코드 `TESTG_<suffix>`, 기준 단위 자기 자신(새 차원 첫 등록), 계수 1 → 저장 →
   같은 차원의 파생 단위(`TESTKG_<suffix>`, 화면이 기준 단위를 `TESTG_<suffix>` 로 자동 고정해 보여줌,
   계수 500) 등록 → 그리드에 두 행 반영 확인(이것으로 "서버 데이터로 채워짐"도 같이 확인한다).
4. 서버 오류 노출: 금지 단위 코드 `MONTH`(다른 어떤 차원을 골라도)로 등록 시도 → 오류 메시지 노출 확인
   (I4, AC2 를 e2e 로도 겸해 확인).

**`mdm-termMng.spec.ts`**
1. 메뉴 이동: `MDM > 용어·도메인 > 용어 관리` 클릭 → `dma/termMng` 화면 로드.
2. 빈 상태: 존재할 리 없는 키워드로 검색해 빈 상태 문구 확인(재실행 안전).
3. 화면 조작만으로 등록 1회 + 채워짐 확인: 필터를 지우고 표기 `테스트용어_<suffix>`, 의미 번호 1, 정의
   "e2e 확인용 <suffix>" 입력 → 저장 → 그리드 반영 확인. 이어서 정의·표기가 비슷한 두 번째 용어를
   등록하며 유사어 추천 패널에 방금 등록한 용어가 1차 후보로 뜨는지 확인(`page.waitForResponse` 로
   `/api/mdm/oasis/termMng/compare` 응답을 기다린다 — real-timer 디바운스 지연을 그대로 견딘다) →
   "동의어로 확정" 클릭 → 동의어 필드 반영 확인.
4. 서버 오류 노출: 3번에서 등록한 (표기, 의미 번호) 그대로 한 번 더 저장 시도 → 오류 메시지 노출 확인
   (I6, AC4 e2e 겸용).

### 3.2 백엔드 단위/통합 테스트(testAll, 가짜 인코더 또는 no-op만 사용)

**격리 방식(신규 테스트 클래스 전부에 적용, `MdmEntityJpaRoundtripTest` 선례 그대로 복제).** 서비스
(`UnitMngService`/`TermMngService`)는 OASIS 제약상 `@Transactional` 을 못 붙이므로, 격리는 테스트
쪽에서 만든다: 클래스마다 `@TempDir static Path tempDir` + `@DynamicPropertySource` 로
`spring.datasource.url` 을 `jdbc:sqlite:` + `tempDir.resolve("<클래스별 고유 파일명>.db")` 로 오버라이드
한다(`MdmEntityJpaRoundtripTest.java:50,65-67` 와 동일 패턴). `@TempDir` 는 Gradle 이 테스트를 실행할
때마다(즉 Verify 의 변이 검증 재실행마다) 새 임시 디렉터리를 만들어 주므로 실행 간 데이터가 절대
누적되지 않고, 클래스마다 `@DynamicPropertySource` 값(파일 경로)이 달라 스프링 `TestContext` 캐시가
클래스 간에 컨텍스트(따라서 `TermRecommendationCache` 싱글턴도)를 공유하지 않는다 — 성능 테스트의
10,000건 캐시가 다른 테스트 클래스로 새는 사고를 원천 차단한다. `UnitMngServiceTest`·
`UnitConvertPreviewTest`(캐시와 무관한 순수 단위 CRUD)는 클래스 단위 `@Transactional` 을 붙여 메서드마다
rollback 한다(같은 클래스 안 여러 `@Test` 간 중복 이름 충돌 방지). **`TermMngServiceTest`(I8·I12 처럼
캐시 갱신을 확인하는 케이스)는 `@Transactional` 을 붙이지 않는다** — I19 가 캐시 갱신을 커밋 후
(`afterCommit`)로 미루므로, 테스트가 트랜잭션을 롤백해 버리면 커밋 콜백 자체가 안 일어나 캐시가 절대
갱신되지 않는다(save 후 즉시 recommend 를 확인하는 테스트가 항상 거짓 실패한다). 대신 `@BeforeEach` 가
관련 테이블을 지우고(같은 temp DB 를 메서드 간 재사용), 필요하면 `TermRecommendationCache.reloadAll()`
을 직접 불러 상태를 리셋한다. `TermRecommendPerformanceTest` 도 같은 이유로 `@Transactional` 을 붙이지
않고 10,000건을 커밋한 뒤 `reloadAll()` 로 캐시를 채운다(§3.2 성능 테스트 항목 참고) — 이 클래스 전용
temp DB 라 다른 클래스에 영향이 없다.

- `UnitMngServiceTest`: I3(차원별 기준 단위 고정), I4(금지 단위 코드), I5(삭제 시 참조 무결성 — FK 참조,
  자기 차원의 base_unit 이면서 형제 단위가 남아 있는 경우 둘 다 거부).
- `UnitConvertPreviewTest`: I1(차원 다름 거부), I2(35 min → 0.583333... h, `MathContext(34, HALF_UP)` 로
  나눈 뒤 `setScale(9, HALF_UP)`, ton/kg/g 등 다경로 왕복이 일치하는지).
- `TermMngServiceTest`: I6((표기,의미번호) 중복 거부), I7(정의 필수), I8(약어 중복은 저장을 막지 않고
  `TermSaveResult.warnings`에 `ENG_ABBR_DUP` 가 실리는지 — V5 전제), I12(인코더가 `NoopTermEmbeddingEncoder`
  인 상태에서 저장해도 성공하고 EMBEDDING 이 NULL 로 남는지, `recommend` 호출 시 2차 결과가 빈 배열 +
  `stage2Enabled:false` 인지).
- `TermReencodeBatchTest`: I11(EMBEDDING_MODEL 이 NULL 이거나 현재 활성 모델과 다른 행만 대상), I12
  (encoder 가 비활성이면 `reencodeBatch` 가 즉시 `{enabled:false, processed:0}` 를 반환하고 아무 것도
  건드리지 않는지 — 이 테스트만 `@TestPropertySource(properties="mdm.embedding.encoder=fake")` 로 활성화한
  케이스와 비활성 케이스 둘 다 확인).
- `TermRecommendPerformanceTest`(I9, I18, I19 + 수용 기준 AC7): 자체 temp DB(§3.2 격리 방식), `@Transactional`
  **없이**. `@TestPropertySource(properties="mdm.embedding.encoder=fake")` 로 켠 뒤, JDBC 배치 insert 로
  용어 10,000건 + 미리 계산한 결정적 가짜 벡터를 커밋하고(서비스의 `save()` 경로를 10,000번 태우지
  않는다 — 그 자체가 별도 성능 변수가 된다), `TermRecommendationCache.reloadAll()`(부팅 시
  `ApplicationReadyEvent` 리스너가 호출하는 것과 같은 공개 메서드, I19)을 호출해 캐시를 채운다.
  **측정 대상은 `TermMngService.recommend(...)` 를 직접 호출하는 것**(HTTP·OASIS 봉투를 거치지 않고
  서비스 메서드 시간만 잰다 — OASIS/네트워크 오버헤드는 이 기준의 관심사가 아니다)로 명시한다. 워밍업
  호출 1회 후 5회 반복 호출의 **중앙값**이 500ms 미만인지 확인한다(흔들림 방지). `recommend` 하나가
  1차 문자열·2차 임베딩을 모두 포함해 응답하므로(§1), spec.md acceptance 문구가 1차/2차를
  구분하지 않는 문제(담당자 확인 필요 결정 D4)가 설계상 자연히 해소된다 — 어느 해석으로 읽어도 같은 한
  응답의 시간을 재는 셈이다.
- `TermEmbeddingCodecTest`/`DeterministicHashTermEmbeddingEncoderTest`: I9(1024차원·4096바이트·L2 노름
  1·little-endian 왕복), 같은 입력이면 같은 벡터(결정성).
- `NoopTermEmbeddingEncoderTest`: I12, I13 — `ApplicationContextRunner`(DB 없이) 로 프로퍼티 오버라이드가
  전혀 없으면 `NoopTermEmbeddingEncoder`, `mdm.embedding.encoder=fake` 면 `DeterministicHashTermEmbeddingEncoder`
  가 뜨는지(운영 기본이 fake 로 새는 사고 방지).
- 기존 회귀(수정): `MdmTermDomainColumnMigrationTest`(V5 반영, 약어 중복 이제 허용),
  `MdmTermDomainColumnMssqlMigrationTest`(동일), `MdmSharedContractMigrationTest`(V5 포함 4개 버전 확인),
  `MdmEntityJpaRoundtripTest`(I10 가드, 회귀만 — 신규 아님).

### 3.3 수동 게이트(testAll 밖)

- `cd src/backend/mdm && JAVA_HOME=... ../gradlew :api:mssqlMigrationTest --no-daemon --console=plain`
  — V5 포함 마이그레이션 MSSQL 실제 적용 확인(기존 태스크 재사용, docker 필요).
- `cd src/backend/mdm && MDM_EMBEDDING_MODEL_DIR=<모델 경로> JAVA_HOME=... ../gradlew :api:onnxEmbeddingManualTest --no-daemon --console=plain`
  — 신설(환경변수는 반드시 `cd` 뒤·같은 논리 줄에서 준다 — `cd` 앞에 두면 `cd` 에만 적용되고 `gradlew`
  는 못 본다). 실제 ONNX 모델 파일로 단건 인코딩 p50/p95, `recommend` 1만 건 p50/p95 를 재측정하고
  로그에 남긴다. 이 워크트리에는 모델 파일이 없다(`find . -iname "*.onnx"` 로 확인함, `poc/mdm-embedding-bench/`
  는 `.gitignore` 로 모델·DB 를 빼놓았다) — 실행자는 HuggingFace `thkmon/KURE-v1-onnx-int8`(rev
  `118dcc12c125320225de077e57a9f367ce8f6407`)에서 `model.onnx`(568,451,402 bytes, sha256
  `1808718e3d54308c8d7bf67fbad5632e08e44b029653e3e31cdd7ed0180d171b`, term-embedding.md:17,26) **와
  DJL tokenizers 가 요구하는 토크나이저 파일(예: `tokenizer.json`/`vocab.txt`, 같은 리포의 토크나이저
  아티팩트)을 함께** `MDM_EMBEDDING_MODEL_DIR` 폴더에 받아 둬야 한다(모델 파일 하나만으로는 인코딩이
  안 된다). 파일이 없으면 `Assumptions.assumeTrue(false)` 로 스킵(빨강 아님, SKIPPED). 이 PC(macOS)
  에서는 Windows 네이티브 토크나이저 확인이 원천적으로 불가능하다(담당자 확인 필요 결정 D8) — 한계로
  기록하되 설계를 멈추지 않는다.

### 3.4 프런트 audit·lint·build (mantine-aggrid-ui SKILL.md §4, RULE.md 무조건 적용 스킬)

바뀐 FE 파일에 한해(`M`/`A` 는 SKILL.md 의 축약 표기이고 실제 실행 명령은 아래다)
`python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바뀐 파일·폴더>` 와
`python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바뀐 파일·폴더>` 를 커밋 전에
돌려 옛 API·금지 import·색 값 직접 사용을 잡는다(0건이어야 함). 그다음 `pnpm -C src/frontend/m-mdm lint`,
`build`.

### 3.5 E2E 전체 스위트 변이 검증

Verify 단계에서 mdm e2e 전체(`mdm-sample-smoke`, `mdm-shell-rbac-smoke`, `mdm-unitMng`, `mdm-termMng`)를
한 번에 돌려 상태 간섭을 확인한다(dev-discipline "E2E 의 변이 검증은 반드시 전체 스위트로"). "E2E 서버
절차" 의 1)이 매 실행 시작 시 `mcm.db`·`mdm.db` 를 둘 다 옮겨 새 DB 로 시작하므로, 전체 재실행 자체는
항상 빈 DB 에서 시작한다 — 그래도 §3.1 의 실행별 접미사는 같은 세션 안에서 Playwright 가 테스트를 재시도
(retry)할 때를 대비한 이중 방어다.

## 4. 수용 기준 매핑

| # | 수용 기준(spec.md) | 검증 방법 |
|---|---|---|
| AC1 | 차원이 다른 변환 거부 | `UnitConvertPreviewTest`(I1) |
| AC2 | 월·년·영업일 단위 등록 거부 | `UnitMngServiceTest`(I4, `UnitForbiddenCodes`) + e2e `mdm-unitMng.spec.ts` 스모크4 |
| AC3 | 포털 메뉴에서 화면이 열리고 `mdm-unitMng.spec.ts` 통과 | e2e 스모크1 + 전체 통과 |
| AC4 | (표기, 의미 번호) 중복 저장 거부 | `TermMngServiceTest`(I6) + e2e `mdm-termMng.spec.ts` 스모크4 |
| AC5 | 약어 중복 경고 | `TermMngServiceTest`(I8) — 담당자 확인 필요 결정 D1(V5 로 유일 인덱스 제거) 전제 |
| AC6 | 포털 메뉴에서 화면이 열리고 `mdm-termMng.spec.ts` 통과 | e2e 스모크1 + 전체 통과 |
| AC7 | 용어 1만 건 추천 응답 500 ms 이내 | `TermRecommendPerformanceTest`(`compare` 액션 하나가 1차+2차 결합 응답이므로 해석 무관하게 커버, 담당자 확인 필요 결정 D4) |
| AC8 | embedding_model 이 다른 행은 재인코딩 대상으로 잡힌다 | `TermReencodeBatchTest`(I11) |

## 5. 불변 규칙

Build·Verify 의 변이 검증이 이 목록을 순회한다.

- **I1**: 서로 다른 차원(dimension)의 단위 간 환산은 항상 거부한다. — `UnitConvertPreviewTest`.
- **I2**: 환산 계산식은 `value_target = value_source × factor_source ÷ factor_target` 이고, 나눗셈은
  `MathContext(34, RoundingMode.HALF_UP)` 로 계산한 뒤 최종값을 `setScale(9, RoundingMode.HALF_UP)` 로
  맺는다. 예: 35 min × 60 ÷ 3600 = 0.583333333 h(HTML 시안 "0.583333"과 표시 반올림만 다르고 일치).
  **이 계산의 유일한 근원은 서버(`UnitMngService.convertPreview`)이고 FE 는 계산하지 않는다.** —
  `UnitConvertPreviewTest`.
- **I3**: 같은 차원의 모든 단위는 하나의 `base_unit` 값을 공유한다. 새 차원의 첫 단위 등록은
  `unit_code == base_unit` 이고 `factor = 1` 이어야 하며, 기존 차원에 등록할 때는 그 차원에 이미 확립된
  `base_unit` 과 다른 값을 주면 거부한다. — `UnitMngServiceTest`.
- **I4**: 월·년·영업일·근무시간 등 고정 계수가 없는 단위는 어떤 차원으로도 등록을 거부한다(코드 대소문자
  무관: `MONTH`/`MON`/`YEAR`/`YR`/`BIZDAY`/`WORKHOUR`, I20 이 `UNIT_CODE` 를 ASCII 로 제한하므로 목록도
  ASCII 로만 둔다 — 한글 표기는 애초에 I20 이 먼저 막는다). — `UnitMngServiceTest`, e2e 스모크4.
- **I5**: 단위 삭제는 (a) `TB_MDM_DOMAIN.UNIT_CODE` FK 참조가 있으면 거부 (b) 그 단위가 자기 차원의
  `base_unit` 이면서 같은 차원에 다른 단위가 남아 있으면 거부한다. — `UnitMngServiceTest`.
- **I6**: `(term_name, sense_no)` 키 중복은 저장을 거부한다(애플리케이션 사전 조회 + DB
  `UX_TB_MDM_TERM_NAME_SENSE` 이중 방어). — `TermMngServiceTest`, e2e 스모크4.
- **I7**: `definition` 은 필수다(NULL·빈 문자열 거부). — `TermMngServiceTest`.
- **I8**: `eng_abbr` 중복은 저장을 막지 않고 `TermSaveResult.warnings` 로 경고만 낸다(V5 이후 DB 도
  비유일 `IX_TB_MDM_TERM_ABBR`). — `TermMngServiceTest`, `MdmTermDomainColumnMigrationTest`(수정).
- **I9**: 임베딩 벡터는 L2 정규화 float32 little-endian 1024개(4,096바이트), 풀링은 CLS+L2, 인코딩 입력
  문자열은 `"{표기}: {정의} ({영문명})"` 고정이다(TSK-02-02 D-024·D-025 계승, 이 작업에서 바꾸지 않음).
  `EMBEDDING_MODEL` 문자열 포맷은 `KURE-v1/int8-{sha256 앞 8자}/cls-l2/in{입력형식버전}` 이고, sha256 은
  실제 로드한 모델 파일에서 계산한다(하드코딩 금지 — 안 그러면 모델 파일이 바뀌어도 AC8 의 "모델이
  다른 행" 판정이 트리거되지 않는다). — `TermEmbeddingCodecTest`, `DeterministicHashTermEmbeddingEncoderTest`,
  `OnnxKureEmbeddingEncoderManualTest`.
- **I10**: `EMBEDDING`/`EMBEDDING_MODEL` 두 칼럼은 JPA 엔티티에 매핑하지 않고 네이티브 SQL(`JdbcTemplate`)
  로만 다룬다(TSK-04-01 D7 계승). — 기존 `MdmEntityJpaRoundtripTest` 가드 유지(회귀만, 신규 아님).
- **I11**: 재인코딩 배치는 `EMBEDDING_MODEL` 이 NULL 이거나 현재 활성 인코더의 `modelId()` 와 다른 행만
  대상으로 잡는다(최초 일괄 구축·모델 교체 재인코딩 공통 규칙). — `TermReencodeBatchTest`.
- **I12**: 인코더 비활성(`mdm.embedding.encoder=none`, 운영 기본값) 또는 인코딩 실패 시: 저장은 그대로
  성공하고 `EMBEDDING`/`EMBEDDING_MODEL` 은 NULL 로 남으며(다음 배치의 재인코딩 대상이 됨),
  `recommend` 의 2차(임베딩) 결과는 빈 배열 + `stage2Enabled:false` 를 반환한다(TRD.md:137). **수정
  저장에서 `term_name`/`definition`/`eng_name`(인코딩 입력 문자열을 구성하는 세 필드) 중 하나라도
  바뀌면, 먼저 `EMBEDDING`/`EMBEDDING_MODEL` 을 NULL 로 지운 뒤 인코더가 활성이면 그 자리에서 다시
  인코딩한다** — 그래야 "옛 벡터 + 지금 `modelId()`" 조합이 남아 I11(재인코딩 대상 판정)을 영영
  못 걸리게 하는 사고를 막는다. — `TermMngServiceTest`, `TermReencodeBatchTest`.
- **I13**: `mdm.embedding.encoder` 의 운영 기본값은 `none`(`NoopTermEmbeddingEncoder`)이다. `fake` 는
  테스트 클래스의 `@TestPropertySource` 로만 켜고, main `application.yml` 에는 두지 않는다. `onnx` 는
  `onnxEmbeddingManualTest` 전용이며 testAll 은 이 값을 절대 활성화하지 않는다. — `NoopTermEmbeddingEncoderTest`.
- **I14**: OASIS `action`(BFF RBAC 키)은 `MdmActions` 13개(search, view, export, compare, save, delete,
  reg, import, validate, execute, copy, restore, confirm) 안에서만 고른다. `unitMng`={search, save,
  delete, compare}, `termMng`={search, save, delete, compare, execute} — `execute` 는 `PERM_MDM_EDIT`
  에만 있고 `PERM_MDM_READ` 에는 없으므로 재인코딩 배치가 자연히 표준 관리자 전용이 된다(02 설계 문서
  "표준 관리자 역할만 등록·수정"과 일치). 서비스의 자바 `method` 이름은 이 제약과 무관하게 서술적으로
  짓는다. — `MdmOasisActionVocabularyTest`(BPMN 을 정적으로 파싱해 이 목록 밖 액션이 없는지 확인 —
  e2e 스모크1 은 `search` 하나만 실행하므로 이것만으로는 `compare`/`execute` 오타를 못 잡는다),
  e2e 스모크1(비관리자 로그인으로 403 없이 화면이 뜨는지), 서비스 테스트는 액션 문자열을 상수로 참조.
- **I15**: `contract.dictionary` SPI(5개 인터페이스, `MdmColumnDictionaryLookup` 등)는 이 작업에서 구현·
  변경하지 않는다. — 기존 스텁·ArchUnit 테스트 회귀만 확인.
- **I16**: `TB_MDM_UNIT`/`TB_MDM_TERM` 의 감사 9칼럼·`VER` 낙관적 잠금은 `CactusAuditEntity` 상속만으로
  얻으며 엔티티에 재선언하지 않는다(TSK-04-01 계승). `CHG_SEQ` 는 등록 시 0으로 명시하고 수정 시 건드리지
  않는다(decisions.md "활성 테이블 배포 칸은 DEFAULT 0" — 실제 배포 순번 증가 메커니즘은 이 작업 범위
  밖). — 정적 확인, 신규 테스트 없음.
- **I17**: `V3__create_mdm_term_domain_column.sql`(sqlite·mssql)의 기존 칼럼·타입·제약은 고치지 않는다.
  변경이 필요한 지점(D1)은 `V5` 로만 한다. — `MdmTermDomainColumnMigrationTest`/`MssqlMigrationTest`
  (수정분 제외 나머지 케이스) 그대로 초록이어야 함.
- **I18**: `recommend` 호출의 질의는 두 갈래다 — **1차(문자열) 질의는 편집 폼의 "표기"(termName) 입력
  값 하나**이고, 후보의 `termName`·`synonyms`(각 항목에서 `"(시스템)"` 접미사를 잘라낸 순수 명칭)·
  `aliases`·`engName` 각각과 비교한다. **2차(임베딩) 질의는 `"{표기}: {정의} ({영문명})"`**(I9 의
  인코딩 입력과 같은 조합)이다. 1차 점수는 `[0,1]` 정규화 값이고, 위 네 비교 대상 각각에 대해 다음 중
  **최댓값**을 후보 점수로 채택한다: 대소문자 무시 정확 일치 = `1.0`, 비교 대상 문자열이 질의를
  포함하거나 질의가 비교 대상을 포함(양방향 부분 일치) = `0.9`, 그 외
  `1 − Levenshtein(질의, 비교대상) ÷ max(len(질의), len(비교대상))`(문자 단위 편집 거리). 점수가 `0.5`
  미만인 후보는 제외한다. "표기" 입력이 2자 미만이면 1차 추천을 실행하지 않고 빈 배열을 반환한다(정의
  입력은 1차 질의에 쓰지 않는다 — 2차 질의 조합에만 들어간다). 편집 중인 `term_id` 자기 자신은 두
  단계 모두에서 후보에서 제외한다. 두 단계 모두 **상위 5건**(점수 내림차순, 동점이면 `term_id`
  오름차순)만 반환한다(TSK-02-02 §6.13 "top-N(기본 5)"와 맞춘다). 2차 후보 점수는 코사인 유사도
  값을 그대로 쓴다. FE 디바운스는 "표기"·"정의"·"영문명" 세 필드 중 하나라도 바뀌면(그리고 최소 하나가
  비어 있지 않으면) 트리거한다. — `TermRecommendPerformanceTest`,
  `TermMngServiceTest`(경계값: 편집거리로 0.5 언저리 점수가 나뉘는 두 문자열 쌍으로 포함/제외 확인,
  `"배치(ERP)"` 형식 동의어가 접미사를 뗀 `"배치"` 로 매치되는지).
- **I19**: `TermRecommendationCache` 는 부팅 시(`ApplicationReadyEvent`) 전체 적재하고, 저장·삭제·
  `reencodeBatch` 가 처리한 행 각각에 대해 해당 행만 갱신한다(요청마다 DB 전체 재조회 금지) — 500ms
  성능 기준(AC7)의 전제. **`cactus.oasis.transactional: true`(현재 application.yml)이라 모든 OASIS
  액션이 트랜잭션으로 묶인다 — 캐시 갱신은 `TransactionSynchronizationManager` 의
  `registerSynchronization(... afterCommit ...)` 안에서 하거나, 활성 트랜잭션이 없으면 즉시 한다.**
  DB 가 롤백됐는데 캐시만 갱신되는 "유령 항목"을 막기 위함이다. — `TermReencodeBatchTest`,
  `TermRecommendPerformanceTest`(§3.2 의 `reloadAll()` 직접 호출 경로), 그리고 `TermMngServiceTest` 에
  **롤백 시 캐시도 갱신되지 않는지 직접 확인하는 케이스**를 추가한다:
  `transactionTemplate.execute(status -> { service.save(req); throw new RuntimeException("강제 롤백"); })`
  로 저장을 강제 롤백시킨 뒤, DB 에 그 행이 없을 뿐 아니라 `TermRecommendationCache` 에도 해당
  `term_id` 항목이 없는지 단언한다(캐시를 무조건 즉시 갱신하는 변이가 있으면 이 케이스만 빨강이 되고
  나머지는 다 초록이라, 이 케이스가 없으면 그 변이를 못 잡는다).
- **I20**: `UNIT_CODE`·`BASE_UNIT` 은 ASCII 20자, `DIMENSION` 은 ASCII 50자 이내만 허용한다
  (`^[A-Za-z0-9_]{1,20}$`/`^[A-Za-z0-9_]{1,50}$`, 서비스가 DB 에 넣기 전에 검증 — SQLite 는 길이를
  강제하지 않으므로 애플리케이션 검증이 없으면 testAll·e2e 는 통과하고 MSSQL 만 잘라내기/오류가 난다).
  MSSQL V3 의 이 세 칼럼이 `VARCHAR ... COLLATE Latin1_General_100_BIN2`(비유니코드)
  라 한글을 그대로 넣으면 코드페이지 변환에서 뭉개져 서로 다른 한글 차원명이 같은 값으로 저장될 수
  있고, 그러면 I1(차원 다름 판정)이 조용히 무력화된다(담당자 확인 필요 결정 D11). — `UnitMngServiceTest`
  (ASCII 아닌 입력 거부), `mssqlMigrationTest`(한글 입력이 애초에 서비스단에서 막히는지, 혹시 막히지
  않고 DB 까지 가면 라운드트립이 깨지는지 확인하는 회귀 추가).
- **I21**: 화면의 "차원" 표시 라벨은 DB 값(ASCII 코드)과 별개로 FE 상수 맵(예: `MASS→질량`,
  `LENGTH→길이`, `TIME→시간`, `COUNT→개수`)으로만 한글을 보여준다. 맵에 없는 코드는 코드 문자열 그대로
  보여준다(별도 라벨 관리 테이블 신설은 이 작업 범위 밖, D11). — FE 렌더 테스트(`unit-mng-page.test.ts`).

## 담당자 확인 필요 결정

- **D1. 영문 약어(ENG_ABBR) 중복 처리 — V5 로 유일 인덱스 제거**
  - 질문: 기존 V3 의 `UX_TB_MDM_TERM_ABBR`(부분 유일 인덱스, `ENG_ABBR IS NOT NULL`)와 수용 기준 "약어
    중복 경고"(거부 아님)가 상충한다. 어떻게 조정하는가.
  - 선택지: (a) V5 로 유일 인덱스를 비유일로 교체하고 애플리케이션 경고로 대체 (b) 요구사항을 "중복
    거부"로 재해석해 기존 유일 인덱스를 그대로 쓴다.
  - 택한 것: (a).
  - 근거: spec.md 수용 기준(근거 강도 최상) 원문이 "약어 중복 경고"라고 명시했고, prd-ref 시안
    HTML(`design/basic/html/02-term-domain-column.html`)도 "영문 약어 … 중복이면 경고"라고 적었다.
    유일 인덱스는 ERD 원문(TSK-02-03)을 그대로 옮긴 것일 뿐 이 요구사항을 검토하고 정한 결정이 아니다
    (미승인 선행 산출물 중에서도 근거 강도가 가장 약함). V5 를 만들면 기존 회귀 테스트 2개(§2)가 깨지는
    것을 확인했다 — 이건 완화가 아니라 요구사항이 강제하는 교정이므로 Verify 가 빨강으로 오판하지
    않도록 이 D1 을 근거로 남긴다.
  - 반려되면: V5 를 되돌리고, 서비스가 저장 전 사전 조회로 중복이면 즉시 거부하도록 구현해 "경고"를
    "확인 후 진행 가능한 거부"로 재정의한다. 되돌린 테스트 2개도 원래 단언으로 복원한다. spec.md 문구를
    담당자와 재확인해야 한다.

- **D2. 단위 등록 시 "차원 선택 시 기준 단위 고정" 구현 — 새 차원의 첫 단위가 기준 단위**
  - 질문: `TB_MDM_UNIT` 에 차원별 기준 단위를 명시하는 별도 칼럼·테이블이 없다(기준 단위는 각 행의
    `base_unit` 값으로만 존재). 차원의 기준 단위를 어떻게 "고정"하는가.
  - 선택지: (a) 그 차원에 이미 있는 임의 행의 `base_unit` 값을 그대로 신뢰하고, 없으면 첫 등록 행이
    스스로 기준 단위가 된다(`unit_code == base_unit`, `factor = 1`) (b) `TB_MDM_DIMENSION` 마스터
    테이블을 신설해 차원↔기준 단위를 명시적으로 관리한다.
  - 택한 것: (a).
  - 근거: 02 설계 문서(773-798행)와 HTML 시안이 차원별 기준 단위를 `TB_MDM_UNIT` 행들의 집합적 사실로
    다루고, TSK-04-01 이 이미 `TB_MDM_UNIT` 하나만 두기로 확정했다(별도 차원 마스터 없음). 새 테이블
    신설은 이 작업 범위(스키마 최소 변경)를 벗어난다.
  - 반려되면: `TB_MDM_DIMENSION(DIMENSION, BASE_UNIT)` 마스터를 V5 에 추가하고 `TB_MDM_UNIT.dimension`
    을 그 테이블 참조로 바꾸는 재작업이 필요하다(스키마 영향 큼).

- **D3. 금지 단위 코드 목록을 코드 상수로 하드코딩**
  - 질문: "월·년·영업일 단위 등록 거부"를 어떤 자료로 판정하는가.
  - 선택지: (a) 서비스 코드에 문자열 상수 목록(`MONTH`/`MON`/`YEAR`/`YR`/`BIZDAY`/`WORKHOUR` — I20 이
    `UNIT_CODE` 를 ASCII 로 제한하므로 한글 표기는 목록에 넣지 않아도 이미 막힌다)을 두고 `unit_code`
    를 대소문자 무시 비교 (b) 별도 관리 테이블로 운영자가 목록을 수정할 수 있게 한다.
  - 택한 것: (a).
  - 근거: 02 설계 문서(798행) "넣으면 안 되는 것"이 고정된 개념적 목록(달력 의존)이라 운영 중 추가될
    가능성이 낮고, 관리 테이블을 신설하면 스키마·화면이 하나 더 늘어 이 작업 범위를 넘는다.
  - 반려되면: `TB_MDM_FORBIDDEN_UNIT` 테이블을 신설하고 화면에 관리 UI 를 추가하는 재작업이 필요하다.

- **D4. "1만 건 추천 응답 500 ms" 적용 대상 — 결합 응답 하나로 해소**
  - 질문: spec.md 수용 기준 문구는 1차(문자열)·2차(임베딩) 를 구분하지 않는다. 어느 쪽을 대상으로
    시험을 설계하는가.
  - 선택지: (a) 2차(임베딩)만 (b) 1차만 (c) 서버가 1차+2차를 한 액션(`compare`)으로 묶어 응답하고, 그
    응답 시간 하나를 잰다.
  - 택한 것: (c).
  - 근거: TSK-02-02 design.md §6.13 "1차 문자열 추천과 합쳐 보이는 것은 화면 몫이다"는 서버가 두 결과를
    각각 주고 화면이 합친다는 뜻으로도 읽히지만, RBAC 액션 어휘가 13개로 제한된 상황(I14)에서 화면이
    조회할 때마다 두 번(각각 다른 액션)을 호출하게 하는 것보다, 서버가 한 응답에 `stage` 태그를 붙여
    묶어 주는 편이 액션 수를 아끼고 화면 구현도 단순해진다. 이러면 어느 해석(1차/2차/둘 다)으로 읽어도
    같은 한 번의 응답 시간을 재는 셈이라 해석 논쟁 자체가 사실상 사라진다.
  - 반려되면: `compare` 를 1차 전용으로 좁히고 2차를 `execute` 같은 별도 액션으로 분리 — 화면이 두 번
    호출하고 합치는 구조로 재작업(§1 노트가 원래 시나리오였다).
  - **측정 범위 명시**: `TermRecommendPerformanceTest`(§3.2)가 재는 500ms 는 `TermMngService.recommend(...)`
    **서비스 메서드 호출 시간**이고, OASIS 봉투·HTTP·네트워크 왕복은 포함하지 않는다. spec.md 문구는
    "응답"이라 엄밀히는 API 왕복까지 포함할 수도 있게 읽히지만, 이 저장소의 다른 성능 기준(예:
    term-embedding.md 의 p50/p95 수치)도 전부 서버 내부 처리 시간 기준이라 그 관례를 따랐다 — 기준을
    몰래 완화한 것이 아니라는 점을 승인자가 알 수 있도록 여기 남긴다.

- **D5. 임베딩 인코더 추상화 — 이 작업이 처음 설계, 운영 기본은 비활성**
  - 질문: TSK-02-02 는 인코더 인터페이스를 전혀 설계하지 않았다(엔진의 `spi` 패턴과 달리 공백). 어떻게
    추상화하고, 운영 기본값은 무엇인가.
  - 선택지: (a) `TermEmbeddingEncoder` 인터페이스 + 운영 기본 `NoopTermEmbeddingEncoder`(비활성) +
    테스트 전용 결정적 가짜 + ONNX 실구현(수동 게이트, 프로퍼티로만 활성화) (b) 운영 기본을 가짜
    인코더로 두고 나중에 ONNX 로 교체.
  - 택한 것: (a).
  - 근거: 팀장 지시 3번이 "인코더는 인터페이스 뒤에 두고 testAll 은 가짜만 쓴다"를 요구했고,
    TRD.md:137 이 "모델 없으면 2차 추천을 끄고 1차만"이라고 명시했다. (b)는 실제 운영 서버에 모델
    파일이 없을 때 가짜 벡터가 `EMBEDDING` 에 영구히 박히는 사고로 이어진다.
  - 반려되면: 해당 없음(팀장 지시·TRD 를 그대로 따른 결정이라 반려 가능성 낮음). 다만 가짜 구현의 해시
    알고리즘 대신 소규모 실제 모델을 쓰라면 인터페이스는 유지한 채 구현체만 교체한다.

- **D6. 재인코딩 배치 트리거 — OASIS `execute` 액션(관리자 전용) + 청크 폴링**
  - 질문: "최초 일괄 구축 배치, 모델 교체 시 재인코딩 배치"의 트리거 방식(OASIS 액션·스케줄 등)을
    저장소 관례로 정하라는 지시가 있었다. 리포에 기존 배치/스케줄 인프라가 있는가.
  - 선택지: (a) `termMng` 화면의 관리자 전용 버튼 → OASIS `execute` 액션을 청크(500건) 단위로 반복
    호출(폴링) (b) Spring `@Scheduled` cron 배치 (c) 별도 배치 실행기 프로세스.
  - 택한 것: (a).
  - 근거: 조사 범위에서 리포 안에 `@Scheduled`/cron 관례를 찾지 못했다(새 인프라 도입 필요). 실제 ONNX
    기준 1만 건 인코딩은 5.6분(term-embedding.md 측정)이 걸려 동기 HTTP 요청 하나로 처리하면 타임아웃
    위험이 크므로, 진행 상태를 돌려주는 청크 방식으로 안전하게 나눈다. `execute` 는 `PERM_MDM_EDIT`
    에만 있어(I14) 별도 역할 검사 코드 없이도 관리자 전용이 된다.
  - 반려되면: `@Scheduled` cron 배치로 재작업 — 스케줄 인프라(고정 실행 시각, 중복 실행 방지 락)를
    이 작업에서 새로 설계해야 하므로 범위가 커진다.

- **D7. 운영 임베딩 모델 파일 출처 — 이 작업 범위 밖으로 이월**
  - 질문: TSK-02-02 D3(운영 INT8 모델 파일의 출처: PoC 다운로드본 재사용 vs 원본 FP32 직접 변환)가
    미확정인 채 인계됐다. 이 작업이 정하는가.
  - 선택지: (a) 이 작업은 `mdm.embedding.model-dir` 프로퍼티로 경로만 받는 설계까지 하고 실제 파일
    조달·변환 여부는 정하지 않는다 (b) 이 작업이 직접 정한다.
  - 택한 것: (a).
  - 근거: 파일 조달은 배포/운영 결정이지 화면·서비스 코드 설계와 독립적이다. 코드는 어느 출처의 파일이
    와도 경로만 맞으면 동작하도록 만들면 된다.
  - 반려되면: 별도 배포 절차 문서(모델 파일 다운로드·변환·서버 배치 스크립트)를 이 작업 산출물에
    추가해야 한다.

- **D8. Windows 네이티브 토크나이저 미확보 — 한계로 기록, 진행**
  - 질문: DJL tokenizers 0.38.0 jar 에 Windows 네이티브가 없다(TSK-02-02 인계). 이 PC(macOS)에서
    확인·해결 가능한가.
  - 선택지: (a) 한계로 기록하고 멈추지 않는다 (b) Windows 네이티브를 직접 빌드/확보한다.
  - 택한 것: (a).
  - 근거: 이 PC 는 macOS 이고 팀장 지시가 "Windows 네이티브 확인은 할 수 없다 — 한계로 남기되 멈추지
    않는다"고 명시했다.
  - 반려되면: 해당 없음(운영 서버가 Windows 로 확정되는 시점에 별도 작업으로 다룬다).

- **D9. 1차 문자열 유사도 — 자바 내장 구현(외부 라이브러리·DB 네이티브 미사용)**
  - 질문: "동의어·별칭·영문명 정확/부분 매치 + 문자열 유사도(편집 거리, 자모 분해, trigram 인덱스)"를
    어떻게 구현하는가.
  - 선택지: (a) 자바로 편집 거리(Levenshtein) + 정확/부분 매치를 직접 구현, trigram/자모 분해는 이번
    범위에서 생략하고 정확도가 부족하면 후속 작업에서 보강 (b) SQLite FTS5/MSSQL CONTAINS 같은 DB
    네이티브 텍스트 검색 기능을 도입.
  - 택한 것: (a).
  - 근거: 조사에서 리포에 기존 trigram/전문 검색 의존성이 발견되지 않았고, 방언(SQLite/MSSQL)마다 다른
    네이티브 텍스트 검색 문법을 새로 익히는 것보다 순수 자바 구현이 이식성이 높다(NFR-6). 10,000건
    규모에서 인메모리(`TermRecommendationCache`, I19) 편집 거리 계산은 500ms 여유가 충분하다(AC7 시험).
  - 반려되면: 자모 분해·trigram 인덱스를 추가 구현하거나 DB 네이티브 검색으로 교체 — `compare` 액션의
    입출력 계약은 바뀌지 않으므로 구현 교체만 필요하다.

- **D10. 화면별 설계 산출물 5종(`docs/mdm/screens/{screenId}/`) 생략 — [팀장 지시로 D14 가 대체]**
  - **후속**: 이 D10(산출물을 아예 안 만듦)은 팀장이 직접 전파한 지시로 D14("기능설계서 1종만
    만든다")로 바뀌었다. 근거·질문은 기록으로 남기고, 실제 채택은 D14 를 따른다.
  - 질문: `docs/mdm/screens/README.md` §1 은 화면별 분석 리포트·기능·디자인·BPMN·정합 체크 5종을
    `docs/mdm/screens/{screenId}/` 에 두라고 정했고, `Mes-Guide.md` §4 "개발 진입 가드"는 이 5종 중
    하나라도 없으면 구현을 금지한다고 정했다. 이번 작업도 만드는가.
  - 선택지: (a) 만들지 않는다(이 design.md + wbs.md + 02 설계 문서 + decisions.md + HTML 시안이 그
    역할을 대신한다) (b) `docs/mdm/screens/unitMng/`, `docs/mdm/screens/termMng/` 에 5종을 새로 작성한다.
  - 택한 것: (a).
  - 근거: `Mes-Guide.md` §4 의 가드는 RULE.md 분기3(일반 MES 모듈, mcm/mls/mqc/mpp/mas)이 분기1 의
    5종 템플릿을 거쳐 들어오는 경로를 전제한다. mdm 모듈은 이 D'Flow 작업(TSK-04-02) 자체가 다른
    설계 경로(`docs/mdm/design/basic/01~08` + `PRD.md`/`TRD.md`/`wbs.md`/`decisions.md`/ADR 로 이미
    이 화면의 요구사항·데이터모델·성능기준·UI 시안을 확정해 둔 모듈 단위 설계 산출물 체계)로 들어온다.
    리포 기존 관례가 이를 뒷받침한다 — 이미 코드까지 만든 선행 dev 작업(TSK-01-02 의 `mdmSample`,
    TSK-01-03, TSK-04-01) 어느 것도 `docs/mdm/screens/{screenId}/` 폴더를 만들지 않았다(`find
    docs/mdm/screens` 로 확인, `README.md` 하나뿐). **근거 강도는 중간**이다 — Mes-Guide 자체는 이
    예외를 명문화하지 않았으므로, 이 판단이 틀렸다면 이미 머지된 3개 선행 작업도 같은 결함을 안고
    있다는 뜻이다.
  - 반려되면: 두 화면 각각에 5종 설계 산출물을 추가로 작성해야 하고(범위·기간 증가), 선행 3개 작업도
    소급 보완이 필요한지 팀장이 별도로 판단해야 한다.

- **D11. `UNIT_CODE`/`BASE_UNIT`/`DIMENSION` 을 ASCII 코드로 제한 — 한글 라벨은 FE 상수 맵으로만**
  - 질문: MSSQL V3(TSK-04-01)에서 이 세 칼럼은 `VARCHAR(...) COLLATE Latin1_General_100_BIN2`(비유니코드)
    다. 02 설계 문서·HTML 시안의 예시 차원명("질량","길이","시간","개수")은 한글인데, 이 콜레이션에
    한글을 그대로 넣으면 드라이버가 표현 불가 문자를 `?` 로 뭉개 서로 다른 한글 차원명이 DB 안에서 같은
    값이 될 수 있다(예: "질량"→"??", "길이"도 글자 수에 따라 "??"). 그러면 I1(차원이 다르면 환산 거부)
    이 MSSQL 에서 조용히 무력화된다 — SQLite 는 전부 UTF-8 이라 이 문제가 재현되지 않으므로 testAll·
    e2e 어느 것도 이 결함을 잡지 못한다. 어떻게 막는가.
  - 선택지: (a) `UNIT_CODE`/`BASE_UNIT`/`DIMENSION` 값 자체를 ASCII 코드로 강제하고(서비스 레벨 정규식
    검증, I20) 화면은 FE 상수 맵으로 한글 라벨만 보여준다(I21) (b) V5 에서 이 세 칼럼을
    `NVARCHAR`(+ 유니코드 콜레이션)로 바꾼다.
  - 택한 것: (a).
  - 근거: (b)는 `UNIT_CODE` 가 PK 이자 `TB_MDM_DOMAIN.UNIT_CODE` 의 FK 대상이라 칼럼 타입을 바꾸면
    그 FK 관계까지 재검증해야 해서 이 작업 범위(V5 = 인덱스 하나 교체)를 크게 벗어난다. 02 설계 문서
    예시의 실제 단위 코드(kg, ton, g, mm, day, h, min, s, ms, us, EA)는 전부 원래 ASCII 라 (a)로도
    실사용에 지장이 없고, 차원명도 짧은 ASCII 코드(MASS/LENGTH/TIME/COUNT)로 못 쓸 이유가 없다 —
    화면에서 한글로 보여주는 것과 DB 에 한글을 저장하는 것은 다른 문제다.
  - 반려되면: V5 를 `UNIT_CODE`(및 이를 참조하는 `TB_MDM_DOMAIN.UNIT_CODE` FK)·`BASE_UNIT`·`DIMENSION`
    까지 `NVARCHAR` 로 바꾸는 재작업이 필요하다 — 기존 FK·인덱스를 전부 다시 만들어야 하므로 TSK-04-01
    산출물에 대한 상당한 재작업이다.

- **D12. "동의어로 확정" 이 SYNONYMS 에 적는 방식 — 후보의 시스템을 쓴다**
  - 질문: 02 설계 문서 예시(800-818행) 는 "코일"(사용 시스템 MES/ERP/APS/L2)의 동의어로 `배치(ERP)`
    를 든다 — 괄호 안은 그 이름("배치")을 쓰는 **동의어 후보 쪽의 시스템**이지, 편집 중인 용어("코일")
    의 시스템 전체가 아니다. 유사어 추천 패널의 "동의어로 확정" 버튼을 누르면 무엇을 적는가.
  - 선택지: (a) 후보의 `systems` 를 괄호 안에 쓴다(`"{후보 termName}({후보 systems 콤마 조인})"`),
    시스템이 없으면 괄호를 생략하고 이름만 적는다 (b) 편집 중인 용어 자신의 `systems` 를 쓴다.
  - 택한 것: (a).
  - 근거: 02 예시가 그렇게 읽힌다는 것 외에는 이 저장소에 명시적 규칙이 없다(**근거 강도 약** — 표기
    사례 하나뿐이다). (b)를 쓰면 예시와 다른 결과(`배치(MES, ERP, APS, L2)`)가 나온다.
  - 반려되면: (b)로 바꾸거나, 화면에서 두 값을 모두 제안하고 사용자가 저장 전에 고르게 한다(저장 전
    편집 가능 필드이므로 어느 쪽이든 되돌리기는 쉽다).

- **D13. `TB_MDM_COLUMN.TERM_IDS` 가 참조하는 용어의 삭제 — 이번 작업은 막지 않는다**
  - 질문: `TB_MDM_COLUMN.TERM_IDS` 는 JSON 배열로 term_id 목록을 담지만 FK 가 없다(방언마다 JSON
    질의 문법이 달라 FK 로 못 건다). 그 용어를 이 작업(termMng)에서 삭제하면 `TB_MDM_COLUMN` 이 죽은
    참조를 갖게 될 수 있다. 이 작업이 막는가.
  - 선택지: (a) 이번 범위(TB_MDM_UNIT/TB_MDM_TERM CRUD)에서는 검사하지 않고, TSK-04-04(컬럼 사전,
    `TERM_IDS` 의 실제 소유자)에게 인계 사항으로 남긴다 (b) `TermMngService.delete` 가 방언별 JSON
    질의로 `TB_MDM_COLUMN.TERM_IDS` 를 훑어 참조 중이면 거부한다.
  - 택한 것: (a).
  - 근거: `TB_MDM_COLUMN` 은 TSK-04-04 소관이고 아직 존재하지 않을 화면(컬럼 사전)의 데이터다 — 이
    작업이 다른 화면의 테이블까지 뒤져 참조 무결성을 지키는 것은 범위 밖이다. `TB_MDM_DOMAIN.UNIT_CODE`
    처럼 실제 FK 가 걸린 참조(I5)만 이 작업이 책임진다.
  - 반려되면: `TermMngService.delete` 에 방언별(SQLite `json_each`/MSSQL `OPENJSON`) 네이티브 질의를
    추가해 참조 중인 용어의 삭제를 거부한다 — TSK-04-04 가 아직 없으므로 검증 없이 구현만 앞서가는
    모양이 된다는 점에 유의.

- **D14. 화면 설계 산출물을 기능설계서 1종으로 축소(팀장 전파 지시)**
  - 질문: `RULE.md`·`Mes-Guide.md` §4 개발 진입 가드는 화면마다 분석리포트·기능설계서·디자인설계서·
    BPMN설계서·정합체크서 5종을 요구한다. MDM 의 `unitMng`/`termMng` 는 As-Is 레거시가 없는 신규
    화면이라 분석리포트가 성립하지 않고 G1~G7 게이트도 채울 수 없다(D10 이 이미 지적한 문제와 같은
    뿌리). 5종을 그대로 요구할 수 없다면 무엇을 만드는가.
  - 선택지: (a) `docs/ai-build-log/DEC-001_noticeMgmt-on-mls.md`(mls `noticeMgmt` 선례 — "설계 산출물을
    기능설계서 1종으로 축소") 그대로 따라 기능설계서 1종만 만든다 (b) 5종을 전부 만들되 분석리포트는
    "해당 없음" 형해화한 문서로 채운다 (c) 산출물을 아예 만들지 않는다(D10 의 원래 판단).
  - 택한 것: (a) — **팀장이 직접 지시**했다(자동 모드 판단이 아니라 위임자 지시, D10 을 대체·보강).
  - 근거: DEC-001 이 이미 같은 상황(To-Be only 신규 화면, `Mes-Guide.md` §4 게이트 불성립)에서
    "기능설계서 1종 + 축소 사유를 기록"으로 확정한 선례이고, 팀장이 이 선례를 그대로 적용하라고
    명시했다(근거 강도: 위임자 지시 — spec.md 본문보다 직접적). D10(산출물 자체 생략)은 이 지시로
    대체된다 — 다만 산출물 위치(`docs/mdm/screens/{screenId}/`)와 "리포 기존 관례(선행 3개 작업이
    아무것도 안 만듦)"라는 D10 의 관찰은 그대로 유효하며, 이번에 처음으로 그 관례에 기능설계서 1종을
    더한다.
  - 산출물: `docs/mdm/screens/unitMng/unitMng_기능설계서.md`, `docs/mdm/screens/termMng/termMng_기능설계서.md`
    (`docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md` 형식·`docs/guide/design/templates/기능설계서.template.md`
    구조 준수, 표 근거 칸에 `docs/mdm/design/basic/02-term-domain-column.md`·HTML 시안·본 design.md
    파일/행 번호를 인용).
  - 반려되면: 5종 전부를 만들거나(분석리포트의 As-Is 부재를 어떻게 채울지 별도 결정 필요), 또는 D10
    으로 되돌려 산출물을 아예 만들지 않는다 — 모듈 전체 규칙(신규 화면 트랙)은 팀장이 사람에게 확인받는
    사안이라 이 D14 는 이번 두 화면에 한정된 적용이다.

## E2E 서버 절차

TSK-01-03 design.md §3.6 을 이 워크트리·이 작업 전용 값으로 옮긴다. `be-run.sh`·`fe-run.sh` 는 쓰지
않는다. 아래 값(워크트리 경로·포트)은 Build/Verify 실행 시점에 그때 비어 있는 포트로 다시 골라야 한다
(아래 번호는 예시). **TSK-01-03 원문과 다른 점(재실행 안전성): 1)에서 `mcm.db` 뿐 아니라 `mdm.db` 도
같이 옮긴다** — 안 옮기면 이 작업이 등록한 테스트 단위·용어가 다음 실행에서 중복으로 걸려 스모크3·4 가
거짓 실패한다.

```bash
W=/Users/jji/project/dmes-standard/dflow-91b83c83
SP=<Build/Verify 실행자의 scratchpad>
J=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
# 0) 빈 포트 고르기 — 셋 다 LISTEN 이 없어야 한다(예: mcm BE 18203, mdm BE 18296, FE 15203). 있으면 다른 번호.
lsof -iTCP:18203 -sTCP:LISTEN; lsof -iTCP:18296 -sTCP:LISTEN; lsof -iTCP:15203 -sTCP:LISTEN
# 1) 격리 DB 자리 — mcm.db·mdm.db 둘 다 옮긴다(둘 중 하나라도 남으면 메인 체크아웃과 공유하거나
#    이전 실행의 테스트 데이터가 남아 스모크가 거짓 실패/거짓 통과한다). gitignore 대상, 새 DB 로 시작.
mkdir -p $W/src/backend/data
[ -f $W/src/backend/data/mcm.db ] && mv $W/src/backend/data/mcm.db $W/src/backend/data/mcm.db.bak-$(date +%Y%m%d%H%M%S)
[ -f $W/src/backend/data/mdm.db ] && mv $W/src/backend/data/mdm.db $W/src/backend/data/mdm.db.bak-$(date +%Y%m%d%H%M%S)
# 2) mcm 백엔드
cd $W/src/backend/mcm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18203 --mcm.bff.invalidate-role-url=http://127.0.0.1:15203/api/mcm/internal/cache/invalidate-role --cactus.notify.publish-url=http://127.0.0.1:18203/notify/publish' > $SP/be-mcm.log 2>&1 &
BE_MCM_PID=$!   # 기동 로그의 sqlite 경로가 $W/src/backend/data/mcm.db 인지 반드시 확인(아니면 즉시 중단)
# 3) mdm 백엔드(8096 대신 빈 포트). SQLite 는 ../data/mdm.db = $W/src/backend/data/mdm.db
cd $W/src/backend/mdm && JAVA_HOME=$J ../gradlew :api:bootRun --no-daemon --console=plain \
  --args='--spring.profiles.active=local --server.port=18296' > $SP/be-mdm.log 2>&1 &
BE_MDM_PID=$!
# 4) mcm 기동 완료(DataInitializer 로그) 뒤 시드 대조와 시험 사용자 픽스처.
#    unitMng/termMng leaf 를 추가해도 이 대조 SQL·mdm-shell-rbac-smoke 는 그대로 통과한다(§2 확인 완료,
#    OBJECT_ID='mdmSample' 만 필터하고 toContain("dma") 만 검사하기 때문 — 대조 파일을 고칠 필요 없음).
cd $W/src/frontend && sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-seed-check.sql | diff - e2e/fixtures/mdm-rbac-seed-check.expected.txt   # 출력 없음 = 통과
sqlite3 $W/src/backend/data/mcm.db < e2e/fixtures/mdm-rbac-users.sql
# 5) 포털 — m-mdm 을 먼저 build, 레지스트리는 커밋된 것 사용
cd $W/src/frontend && pnpm build:libs
cd $W/src/frontend/m-mcm && AUTH_SECRET=$(openssl rand -hex 32) NEXTAUTH_URL=http://127.0.0.1:15203 OIDC_ISSUER=http://127.0.0.1:15203 \
  MCM_WAS_URL=http://127.0.0.1:18203 MDM_WAS_URL=http://127.0.0.1:18296 BACKEND_API_URL=http://127.0.0.1:18203 \
  BACKEND_CLIENT_KEY=dmes-bff-local-client-key-2026 pnpm exec next dev --turbopack --port 15203 > $SP/fe.log 2>&1 &
FE_PID=$!
# 6) 스모크 — 반드시 자기 포털(기본값 5100 은 메인 체크아웃 포털 → 거짓 통과). mdm 전체 e2e 를 한 번에 돈다.
#    --workers=1: 여러 스펙이 병렬로 로그인하면 mcm SQLite 가 SQLITE_BUSY 로 로그인을 500 으로 떨어뜨린다.
#    SMOKE_LOGIN_USER/PASSWORD 는 mdm-sample-smoke.spec.ts 가 쓰는 전역 기본값(admin, 기존 그대로 — 손대지
#    않는다). 신설하는 mdm-unitMng.spec.ts·mdm-termMng.spec.ts 는 이 전역 값을 쓰지 않고, mdm-shell-rbac-
#    smoke.spec.ts 의 login(page, user) 패턴을 그대로 가져와 자체적으로 `e2e_mdm_stdadmin`/`admin123`
#    (mdm-rbac-users.sql 픽스처, 비밀번호는 admin 행 복사라 admin123) 으로 로그인한다 — I14(RBAC 액션
#    어휘) 회귀를 admin/SYSADMIN 프리패스 뒤에 숨기지 않기 위함이다.
cd $W/src/frontend && SMOKE_MCM_BASE_URL=http://127.0.0.1:15203 SMOKE_LOGIN_USER=admin SMOKE_LOGIN_PASSWORD=admin123 \
  pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts e2e/mdm-unitMng.spec.ts e2e/mdm-termMng.spec.ts --workers=1
# 7) 선행 Task 추적 파일 복원 — mdm-sample-smoke 가 TSK-01-02 스크린샷을, mdm-shell-rbac-smoke 가
#    TSK-01-03 스크린샷을 덮어쓴다. stage 하지 않고 되돌린다(이번 작업 산출물인
#    docs/mdm/tasks/TSK-04-02/screens/*.png 는 예외 — 그건 새로 커밋한다).
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png
cd $W && /usr/bin/git checkout -- docs/mdm/tasks/TSK-01-03/screens/   # 디렉터리 형태 — 파일 glob(*.png)은
  # zsh 에서 매치가 없으면 확장 실패로 스텝이 죽고, 새 파일이 섞여 있으면 checkout 이 그 파일엔 안 먹는다
cd $W && /usr/bin/git status --porcelain docs/mdm/tasks/   # TSK-04-02/screens/*.png 만 남아야 한다(새 파일, 이번에 stage 할 것) — 다른 Task 폴더가 여기 나오면 복원이 빠진 것
# 8) 정리 — 자기가 띄운 프로세스만 거둔다. 전역 gradlew --stop·pkill·killall·pgrep -f 종료 금지.
kill $FE_PID $BE_MDM_PID $BE_MCM_PID
lsof -tiTCP:15203 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18296 -sTCP:LISTEN | xargs -r kill
lsof -tiTCP:18203 -sTCP:LISTEN | xargs -r kill
```

- 통과 기준: mdm e2e 스펙 4개 전부 passed, skipped·failed 0. 시드 대조 `diff` 출력 없음.
- **함정**: `mdm-sample-smoke.spec.ts`/`mdm-shell-rbac-smoke.spec.ts` 는 실행할 때마다 각각
  `docs/mdm/tasks/TSK-01-02/screens/dma-mdmSample.png`, `docs/mdm/tasks/TSK-01-03/screens/*.png`(git
  추적 파일)를 덮어쓴다. 신설하는 `mdm-unitMng.spec.ts`/`mdm-termMng.spec.ts` 는 스크린샷을
  `docs/mdm/tasks/TSK-04-02/screens/*.png` 로 저장한다(이번 작업 산출물이므로 되돌리지 않고 새로 stage
  한다). 전체 mdm e2e 를 돈 뒤 **자기 것이 아닌** Task 폴더 스크린샷만 `git checkout --` 로 되돌린다.
- 이 SQLite 데이터가 이 워크트리 경로(`$W/src/backend/data/*.db`) 안인지 2)·3) 기동 로그로 반드시
  확인한다 — 아니면 메인 체크아웃 DB 를 공유해 거짓 통과·데이터 오염이 난다.

## 코드베이스 지식

- **`SYNONYMS`/`ALIASES`/`SYSTEMS` 의 JSON 모양은 이 작업이 처음 정한다**(기존 마이그레이션 테스트는
  "유효한 JSON 인지"만 확인하고 구체적 모양을 고정하지 않았다). 셋 다 **문자열 배열**로 통일한다:
  `ALIASES`/`SYSTEMS` 는 `["코일ID","COIL_ID"]` 처럼 값 그대로, `SYNONYMS` 는 02 설계 문서 표기 그대로
  `"명칭(시스템)"` 형식 문자열의 배열 `["배치(ERP)","배치넘버(ERP)"]` 이다. 저장은 `ObjectMapper` 로
  직렬화해 그냥 JPA 필드에 넣는다(이 세 칼럼은 EMBEDDING 과 달리 엔티티에 매핑돼 있어 네이티브 SQL 이
  필요 없다). 유사어 추천 패널의 "동의어로 확정" 버튼은 후보의 `termName` 과 **편집 중인 용어 자신의
  `systems`** 를 합쳐 `"{후보 termName}({편집 중인 용어의 systems 콤마 조인})"` 형식으로 `SYNONYMS`
  배열에 append 한다(후보 자신의 시스템이 아니라 지금 편집 중인 용어 관점에서 "이 동의어를 어느
  시스템에서 이 이름으로 쓰는지"를 적는 것이 02 문서 예시 "배치(ERP)"의 의미에 맞다).
- **mdm 은 OASIS 서비스가 이번이 최초다.** `services/` 디렉터리가 지금 비어 있으므로 BPMN·서비스 빈
  둘 다 mls `noticeMgmt` 를 그대로 베낀다(구조만 — action 어휘는 다르다, 아래 참고). `@Transactional`
  을 서비스 클래스에 절대 붙이지 않는다 — CGLIB 프록시가 파라미터명을 지워 OASIS 바인딩이
  `ParameterName must not be null` 로 죽는다(mls `NoticeMgmtService.java:42-46` 주석).
- **mdm 의 RBAC 액션 어휘는 mls 와 다르다.** mls `noticeMgmt.bpmn` 은 자기 모듈 전용 액션(`changeStatus`
  등)을 자유롭게 쓰지만, mdm 은 TSK-01-03 이 `MdmActions`(13개) + `MdmPermissions`(READ/EDIT/CONFIRM
  3세트) 로 액션 어휘를 이미 고정해 뒀다. `UserPermCache.toKeyStrings()`(mcm-core)가 `SecPerm` 의
  4개 텍스트 필드(콤마 분할)를 그대로 권한키 액션 토큰으로 쓰므로, OASIS `action` 파라미터는 반드시 이
  13개 문자열 중 하나여야 BFF `evaluateApiPolicy` 가 통과시킨다. **BPMN 라우팅 액션(RBAC 키)과 서비스
  자바 메서드명은 별개** — `camunda:property name="method"` 값은 자유롭게 짓는다.
  `MdmPermissions.MATRIX` 의 `DMA` 그룹은 `STD_ADMIN→EDIT`, `STEWARD→READ` 이고 `EDIT_ACTIONS` 만
  `execute` 를 포함하므로, action `execute` 를 재인코딩 배치에 배정하면 그 자체로 "관리자만 실행"이
  구현된다(추가 역할 검사 코드 불필요).
- **권한 가드는 mdm 백엔드가 하지 않는다.** BFF(`m-mcm/proxy.ts`)의 `evaluateApiPolicy` 가 메뉴 leaf
  RBAC 매핑으로 403 을 판정한다. mdm 서비스 코드에 별도 `@PreAuthorize` 류를 추가하지 않는다(TSK-01-03
  D6). 버전 확정류에만 쓰는 `VersionPreconditions.requireSteward()` 는 이 작업 대상(단순 CRUD)에는
  해당 없다.
- **메뉴 시드는 `DataInitializer.java` 자바 코드**(`src/backend/mcm/.../init/DataInitializer.java`)
  뿐이다. 별도 SQL 시드·정적 설정 파일이 없다. `insertMcmSecObjIfAbsent`→`insertMcmSecMenuIfAbsent`→
  `seedMdmObjectRbac` 3줄 세트가 mdmSample 선례(`:884-899` 부근)다. `OBJECT_ID`(=screenId)는
  `^[a-z][a-zA-Z0-9]*$` 를 만족해야 부팅이 성공한다(`unitMng`/`termMng` 는 이미 만족).
  `MENU_SEQ`/`FULL_SEQ` 는 손으로 예측하지 않는다 — `fixModuleRootMenuSeqOrder`/`recomputeMenuFullSeq`
  가 재계산할 수 있어 e2e 시드 대조 SQL 에서 이 두 칼럼은 비교하지 않는다.
- **`contract.dictionary` SPI 는 관련 없다.** `MdmColumnDictionaryLookup` 등 5개 인터페이스는 구현체가
  아직 없고(테스트 스텁만 존재), TB_MDM_UNIT/TB_MDM_TERM CRUD 와 무관하다 — 건드리지 않는다.
- **`MdmTermRepository`/`MdmUnitRepository` 는 지금 파생 쿼리가 0개다**(TSK-04-01 이 자기 범위에서 안
  써서 그런 것뿐, "리포지터리에 조립 로직 금지"는 이 리포지터리 자체에 쿼리 메서드를 못 넣는다는 뜻이
  아니다). 이 작업은 `findByTermNameAndSenseNo`, `findByEngAbbr` 같은 파생 쿼리를 정상적으로 추가한다.
- **ERD 문서(`docs/mdm/erd/02-term-domain-column.*`)와 실제 스키마가 다르다.** `.mmd`/`.sqlite.sql`
  파일에는 `EMBEDDING`/`EMBEDDING_MODEL` 이 없지만 실제 V3 마이그레이션·엔티티에는 있다(TSK-04-01 D7,
  decisions.md D-036, ERD 문서 갱신은 안 됨). **항상 실제 V3 마이그레이션 파일 + 엔티티를 스키마 기준
  으로 삼는다.** 이번 작업이 V5 로 `UX_TB_MDM_TERM_ABBR` 를 비유일로 바꾸면 이 divergence 가 하나 더
  생기므로 ERD 문서·naming-dialect-rules.md 에 각주를 남긴다(§2).
  - **`EMBEDDING`/`EMBEDDING_MODEL` 은 JPA 로 못 만진다.** `MdmTerm.java` 가 의도적으로 매핑을 안 했다
  (주석에 이유 명시). `JdbcTemplate` 네이티브 SQL 전용.
- **기존 회귀 테스트 2개가 `UX_TB_MDM_TERM_ABBR` 의 유일성을 실제로 단언한다.**
  `MdmTermDomainColumnMigrationTest.UX_TB_MDM_TERM_ABBR_만_NULL_다건_허용_동일_비NULL_은_거부한다()` 와
  `MdmTermDomainColumnMssqlMigrationTest.필터_인덱스는_UX_TB_MDM_TERM_ABBR_만이고_...`. V5 를 만들면 이
  둘을 반드시 함께 고쳐야 하고(§2), `MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_를_적용했다()`
  의 `assertEquals(Set.of("1","2","3"), versions)` 도 `"4"` 를 더해야 한다(TSK-04-05 design.md F18 이
  이미 이 테스트의 존재를 경고해 뒀다).
- **`m-mdm` 화면 모듈은 `@mantine/*`·`ag-grid-react`·`ag-grid-community` 를 직접 import 할 수 없다**
  (SKILL.md Part B). `@dk-oasis/shared/*` 만 쓴다 — 그리드는 `AgDataGrid`(열은 `GridColumn`, ag-grid
  `ColDef` 아님), 폼은 `Input`/`Select`/`Textarea`/`DatePicker`, 레이아웃은 `PageLayout`/`SearchArea`.
  커밋 전 `mantine_docs.py audit`/`aggrid_docs.py audit`(바뀐 파일만, §3.4 의 실제 명령)를 0건으로
  통과시킨다.
- **`m-mdm` 새 화면은 `tsup.config.ts` 엔트리 등록을 빠뜨리면 즉시 걸린다.**
  `tests/tsup-entries.smoke.test.ts` 가 디스크의 `pages/**/page.tsx` 와 엔트리 키 1:1 대응을 강제한다.
- **`pnpm build:libs` 선행 없이 `m-mdm` vitest 를 돌리면 3 files 실패한다**(shared 등 lib 빌드 산출물에
  의존, `.issues` 에도 이미 기록됨).
- **디바운스 선례가 리포에 없다.** 가장 가까운 것은 `LookupModal.tsx`(`AbortController` + generation
  카운터로 stale 응답 무시)인데, 이건 요청 취소 패턴이지 키 입력마다 자동 조회하는 디바운스가 아니다.
  이번에 새로 만드는 `use-debounced-effect.ts` 는 이 취소 패턴을 같이 적용한다(디바운스 타이머 +
  이전 요청 abort).
- **FE 라우트는 codegen 이다.** `m-mcm/scripts/generate-page-registry.mjs` 가 `pages/**/page.tsx` 를
  스캔해 `page-registry.ts` 를 자동 생성한다 — 새 화면을 만들면 사람이 라우트를 등록할 필요가 없다
  (빌드/`predev` 훅이 자동 처리).
- **`mssqlMigrationTest`(`src/backend/mdm/api/build.gradle`)는 mdm 마이그레이션 전체를 도는 범용
  게이트다.** 이 작업이 V5 를 추가하면 이 태스크가 자동으로 V5 도 검증한다(임베딩 인코딩 성능은
  별도로 이 작업이 새로 만드는 `onnxEmbeddingManualTest` 가 다룬다). mdm api 의 `src/test` 아래에는
  프로파일별 `application-*.yml` 이 없다 — 기존 테스트는 전부 `@ActiveProfiles("local")` + main
  `application.yml` 을 쓴다. 새 임베딩 테스트가 `fake` 인코더를 켤 때는 새 yml 을 만들지 않고
  `@TestPropertySource(properties="mdm.embedding.encoder=fake")` 로 그 테스트 클래스에서만 켠다.
- **500ms 성능 근거는 원문 설계 문서(02.md)가 아니라 `wbs.md` 수용 기준·`decisions.md` D-024·
  `term-embedding.md` 세 곳에만 있다.** 02.md 본문에는 "500ms" 문자열이 아예 없다.
- **이 워크트리에는 실제 ONNX 모델 파일이 없다**(`find . -iname "*.onnx"` 확인, `poc/mdm-embedding-bench/`
  는 `.gitignore` 로 모델·DB 를 뺀다). `onnxEmbeddingManualTest` 를 처음 돌리는 사람은 HuggingFace 에서
  직접 받아야 한다(§3.3 의 repo/rev/sha256).
- **flyway-migration-add 스킬은 mdm 에 적용되지 않는다**(`SKILL.md` 에 `mdm` 언급이 전혀 없고
  `aps-core`/`mcm-core` 전용이라고 RULE.md 가 명시한다). mdm 은 TSK-04-01 선례대로 버전 번호를 손으로
  채번한다(양쪽 방언 파일명 동일하게). V5 는 이 시점 기준 어느 병렬 mdm 작업도 아직 채번하지 않았다
  (TSK-04-03/04 는 `phase:"ready"`, TSK-04-05 는 F18 에서 V5 를 "만들면 깨진다"고 경고만 했을 뿐 실제로
  만들지는 않았다 — `docs/mdm/tasks/TSK-04-0{3,4}/state.json` 확인 완료).

## 게이트 명령 표

| 항목 | 명령 | 기준선 |
|---|---|---|
| 백엔드 전체 | `cd src/backend && JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ./gradlew testAll --no-daemon --console=plain` | 1274 tests / 0 failures |
| 백엔드 테스트 집계 | `find src/backend -path '*/build/test-results/*' -name 'TEST-*.xml' \| xargs grep -h -o '<testsuite [^>]*'`(tests/failures/errors 합산) | 위와 동일 |
| MSSQL 수동 게이트 | **사용자 결정으로 실행 금지**(도커가 시스템 부하를 유발) — 대체 검증은 "MSSQL/SQLite 방언 대조" 표(Build 이탈) 참고 | 게이트 비교 대상에서 제외 |
| ONNX 수동 게이트(신설) | `cd src/backend/mdm && MDM_EMBEDDING_MODEL_DIR=<모델 경로> JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home ../gradlew :api:onnxEmbeddingManualTest --no-daemon --console=plain` | 모델 파일(+토크나이저 파일) 있으면 pass(macOS 재측정치를 로그에 남김), 없으면 SKIPPED(testAll 비포함) |
| 프런트 m-mdm 테스트 | `cd src/frontend && pnpm build:libs && pnpm --filter @dk-oasis/m-mdm test` | 5 files/26 passed 이상(신규 테스트 추가분 포함) — build:libs 선행 없으면 3 files 실패 |
| 프런트 m-mdm lint | `cd src/frontend && pnpm --filter @dk-oasis/m-mdm lint` | tsc --noEmit pass |
| 프런트 shared 테스트 | `cd src/frontend && pnpm test:unit:shared` | 23 files/156 passed |
| 프런트 UI 감사 | `python3 .claude/skills/mantine-aggrid-ui/scripts/mantine_docs.py audit <바뀐 파일·폴더>`, `python3 .claude/skills/mantine-aggrid-ui/scripts/aggrid_docs.py audit <바뀐 파일·폴더>`(mantine-aggrid-ui SKILL.md §4) | 0건 |
| OASIS 계약 검사 | `python3 .claude/skills/oasis-contract-check/scripts/check_oasis_contract.py --root .` | ERROR 0 / WARN 0 |
| E2E | §"E2E 서버 절차". `pnpm exec playwright test e2e/mdm-shell-rbac-smoke.spec.ts e2e/mdm-sample-smoke.spec.ts e2e/mdm-unitMng.spec.ts e2e/mdm-termMng.spec.ts --workers=1` | 전체 passed, skipped·failed 0 |

## Build 이탈

- **V4 → V5 재채번 + origin/dev 머지(팀장 지시)**: 이 작업이 처음 채번한 마이그레이션 V4 가
  origin/dev 에 이미 머지된 TSK-05-01(`V4__create_mdm_interface_layout.sql`, 03 인터페이스 레이아웃
  5테이블)와 번호가 겹쳤다. 팀장 배정표대로 이 작업의 파일을 V5 로 재채번했다(`term_abbr_index_relax`,
  두 방언, `git mv`). `origin/dev` 를 `merge --no-ff` 로 반영하며 충돌 2건을 해소했다 —
  `MdmSharedContractMigrationTest`(버전 집합을 `{1,2,3,4}`→`{1,2,3,4,5}` 로, 양쪽 코멘트 결합)와
  `MdmTermDomainColumnMssqlMigrationTest`(동일 패턴, 메서드명도 `...V4_가_적용된다`→`...V4_V5_가_적용된다`).
  design.md·ERD 각주·테스트 코멘트의 "이 작업의 V4" 표현을 전부 "V5" 로 바꾸고, dev 쪽 V4(interface_layout)
  언급은 그대로 뒀다(해당 없음 — 이 문서엔 언급이 없었다).
- **사용자 결정: 도커 금지로 MSSQL 실측 생략** — `mssqlMigrationTest`(Testcontainers, docker 필요)는
  시스템 부하 문제로 이후 어디서도 실행하지 않는다. 대체로 sqlite 쪽 testAll 통과 + 아래 "MSSQL/SQLite
  방언 대조" 표로 V5 두 방언 파일의 동등성을 리뷰로 확인한다.

  **MSSQL/SQLite 방언 대조 — `V5__term_abbr_index_relax.sql`**(`diff -y` 실측, 실행문 2줄만 존재)

  | 줄 | SQLite | MSSQL | 대조 |
  |---|---|---|---|
  | DROP | `DROP INDEX UX_TB_MDM_TERM_ABBR;` | `DROP INDEX UX_TB_MDM_TERM_ABBR ON TB_MDM_TERM;` | 문법 차이만(MSSQL 은 `DROP INDEX` 에 대상 테이블 명시가 필수) — 의미 동일 |
  | CREATE | `CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;` | `CREATE INDEX IX_TB_MDM_TERM_ABBR ON TB_MDM_TERM(ENG_ABBR) WHERE ENG_ABBR IS NOT NULL;` | 완전히 동일한 문자열(필터 조건 포함) |

  결론: 두 방언 파일은 `DROP INDEX` 구문(방언 고유 문법)만 다르고 나머지는 완전히 동일하다 — MSSQL
  쪽만 별도로 틀릴 여지가 구조적으로 없다(TSK-04-01 이 이미 검증한 `UX_TB_MDM_TERM_ABBR`·필터 인덱스
  문법을 그대로 역으로 적용했을 뿐이므로 신규 문법 리스크가 없다).
- **테스트 파일 수 정정(팀장 지시 "기존 테스트 2개"보다 많음)**: 팀장 지시는 "D1 로 인해 사실이 바뀐 기존 테스트
  2개"라고 했으나, 실제로 V5(약어 유일 인덱스→비유일)를 반영하면 4곳이 깨진다 — ①
  `MdmTermDomainColumnMigrationTest.UX_TB_MDM_TERM_ABBR_만_NULL_다건_허용_동일_비NULL_은_거부한다()`(이름·본문
  교정) ② 같은 파일의 `제약_인덱스_이름이_규칙표를_따른다()`(인덱스 이름 문자열 하나만 교정) ③
  `MdmTermDomainColumnMssqlMigrationTest.필터_인덱스는_UX_TB_MDM_TERM_ABBR_만이고_...()`(이름·본문 교정) ④
  같은 파일의 `local_db_설정으로_V1_V2_V3_가_적용된다()`(V5 포함 버전 집합, 팀장 지시에 명시되지 않았던
  누락분) ⑤ `MdmSharedContractMigrationTest.flyway_가_V1_V2_V3_를_적용했다()`(V5 포함, 지시에 있던 것).
  모두 완화가 아니라 V5 반영이 강제하는 사실 교정이라 그대로 고쳤다.
- **D12 실제 채택 확인**: design.md 본문에 D12(동의어 확정 시 "후보의 termName+후보의 systems")와
  "코드베이스 지식" 절(§"동의어로 확정...편집 중인 용어 자신의 systems")이 서로 반대로 적혀 있었다(advisor
  지적). 기능설계서(`termMng_기능설계서.md` §5.2 B-005, GAP-103)가 D12(a)를 명시적으로 구현 대상으로
  적어 뒀고 D12 결정 블록 자체가 정식 기록이므로 D12(a)(후보의 termName+후보의 systems)를 따른다. 프런트
  구현 시 "코드베이스 지식" 절의 반대 서술은 무시한다.
- **저장소가 Spring Boot 4 + Jackson 3(`tools.jackson`) 기본 스택이라 classic
  `com.fasterxml.jackson.databind.ObjectMapper` 빈이 자동 등록되지 않는다**(실측 확인 — `@Autowired
  ObjectMapper` 로 생성자 주입하면 `NoSuchBeanDefinitionException`). 설계 시점에는 예상하지 못한
  프레임워크 사실이다. 리포 기존 관례(`GridConverter`, `AuditLogger` 등)를 따라 `TermMngService`·
  `TermRecommendationCache` 모두 `private static final ObjectMapper OBJECT_MAPPER = new ObjectMapper()`
  직접 인스턴스로 바꿨다(Spring 빈 주입 포기).
- **`UnitForbiddenCodes`/`MdmDomainRepository.existsByUnitCode`/`MdmTermRepository.findByTermNameAndSenseNo`
  /`findByEngAbbr`/`MdmUnitRepository.findByDimension`**: design.md §2 변경 파일 목록에 별도 항목으로
  없었지만, UnitMngService/TermMngService 구현에 최소한으로 필요한 파생 쿼리·상수 클래스라 함께 추가했다
  ("이 작업은 findByTermNameAndSenseNo, findByEngAbbr 같은 파생 쿼리를 정상적으로 추가한다"는 "코드베이스
  지식" 절의 사전 허용 범위 안).
- **`DataInitializer`의 SYSADMIN×OBJECT×PERM_ALL 매핑**: mdmSample 선례가 3줄 블록(OBJECT·MENU·
  ROLE_MAPPING)이므로 unitMng·termMng 도 동일하게 SYSADMIN 몫 `TB_MCM_SEC_ROLE_MAPPING` 행을 추가했다
  (반복문으로 3개 OBJECT 를 순회하도록 리팩터링). e2e 는 `e2e_mdm_stdadmin`/`e2e_mdm_steward` 로 돌려
  이 SYSADMIN 경로를 직접 검증하지 않지만, admin 계정이 이 화면들을 열 수 있어야 한다는 리포 관례를
  mdmSample 과 어긋나지 않게 유지하기 위함이다.
- **버그 수정(설계 이탈이라기보다 구현 중 발견)**: `UnitMngService.save()` 초안이 수정 시에도 `CHG_SEQ`
  를 0 으로 강제 덮어써 불변 규칙 I16("수정 시에는 건드리지 않는다")을 위반했다. 변이 검증 대상 항목으로
  직접 다루다 발견해 즉시 고쳤다(신규 등록일 때만 0, 수정 시 로드된 값 유지) — 커밋 `240bac3`.
- **`OnnxKureEmbeddingEncoderManualTest`의 측정 범위 축소**: design.md §3.3 은 "단건 인코딩 p50/p95,
  `recommend` 1만 건 p50/p95" 둘 다 재측정하라고 했으나, 이 테스트는 스프링 컨텍스트 없는 순수 JUnit
  이어야 한다는 같은 절의 요구(모델 경로가 비었을 때 빈 생성 실패로 SKIPPED 대신 빨강이 나는 사고 방지)와
  충돌한다 — `recommend` 측정에는 `TermMngService`+`TermRecommendationCache`+DB(스프링 컨텍스트)가
  필요하다. 이 워크트리에는 애초에 모델 파일이 없어 이 게이트 자체가 SKIPPED 로 끝나므로(§3.3, `find .
  -iname "*.onnx"` 재확인 완료) 실측 불가 상태는 동일하다. 단건 인코딩 p50/p95 측정만 남기고 `recommend`
  1만 건 재측정은 이 수동 테스트에서 제외했다 — 모델 파일을 실제로 구해 이 게이트를 처음 돌리는 사람이
  필요하다면 별도로 `@SpringBootTest` 통합 시험을 추가해야 한다(인계 사항).
- **OASIS `params` 는 배열도 `null` 도 못 받는다(실제 서버 기동+curl 로 실측, advisor 지적) — 두 건**:
  ① `CactusRequestConverter.convert()` 가 `params` 의 각 값을 타입 힌트 없는
  `new TypedObject(value)` 로 감싸는데, 값이 `List`(JSON 배열)이면 "Generic type. You must explicitly
  specify the type" 로 죽는다 — `TermSaveRequest.synonyms/aliases/systems` 를 `List<String>` 에서
  콤마 구분 `String` 으로 바꾸고 서비스가 split 하도록 고쳤다(커밋 `6688348`). ② 같은 `TypedObject`
  단일 인자 생성자는 값이 `null` 이면(신규 등록의 `termId` 등) "The type cannot be determined because
  object is null" 로 죽는다 — FE `api.ts` 의 `callAction` 에 `omitNullish()` 를 추가해 null/undefined
  키를 아예 `params` 에서 빼도록 고쳤다(커밋 `5c39a0e`). 두 버그 모두 백엔드 단위 테스트는 서비스 메서드를
  직접 호출해 OASIS 바인딩 계층을 거치지 않으므로 잡지 못했고, 실제 서버를 띄워 curl 로 두드려 보고서야
  드러났다 — Build 규율의 "가짜 인코더만 쓰는 단위 테스트"가 이 계층의 결함까지 보장하지 않는다는 한계를
  그대로 인계한다(e2e 는 실제 HTTP 경로를 타므로 이 두 버그가 있었다면 e2e 최초 실행에서 반드시 잡혔을
  것이다 — 실제로 e2e 작성·실행 중 발견했다).

## Build 변이 검증

Build 단계에서 §5 불변 규칙 각각에 일부러 틀린 구현을 넣어 관련 테스트가 빨강이 나는지 확인했다(항목별
1개 파일만 되돌리는 `git checkout --`로 원복, 원복 후 해당 테스트 재실행으로 초록 확인). I10·I15·I17 은
이 작업이 새로 만든 코드가 아니라(기존 스키마·SPI·계약을 그대로 쓰는 회귀 대상) design.md 원안이 이미
"정적 확인/회귀만, 신규 테스트 없음"으로 명시했으므로 새로 변이를 넣지 않았다 — testAll 전체가 그린임을
반복 확인해 회귀만 유지됨을 대신 확인했다. I21(FE 라벨맵)은 프런트 Build 뒤 별도로 검증한다.

| 항목 | 넣은 변이 | 잡은 테스트 | 빨강 |
|---|---|---|---|
| I1 | `UnitMngService.convertPreview` 의 차원 다름 거부 분기를 `if(false)`로 무력화 | `UnitConvertPreviewTest.I1_서로_다른_차원끼리는_환산을_거부한다` | 예 |
| I2 | 최종 반올림 `setScale(9, HALF_UP)` → `setScale(6, HALF_UP)` | `UnitConvertPreviewTest`(2건: 35분→h, ton/kg/g 왕복) | 예 |
| I3 | 기존 차원 `baseUnit` 불일치 거부 분기를 `if(false)`로 무력화 | `UnitMngServiceTest.기존_차원에_등록시_확립된_기준단위와_다르면_거부한다` | 예 |
| I4 | `UnitForbiddenCodes.isForbidden()` 을 항상 `false` 로 | `UnitMngServiceTest.금지_단위_코드는_어떤_차원으로도_등록을_거부한다` | 예 |
| I5(a) | `domainRepository.existsByUnitCode(...)` 분기를 `if(false)`로 무력화 | `UnitMngServiceTest.FK_참조가_있는_단위는_삭제를_거부한다` | 예 |
| I5(b) | `hasSiblings` 분기를 `if(false)`로 무력화 | `UnitMngServiceTest.기준단위이면서_형제단위가_남아있으면_삭제를_거부한다` | 예 |
| I6 | `(termName,senseNo)` 중복 거부(애플리케이션 레벨) 분기를 `if(false)`로 무력화 | `TermMngServiceTest.I6_같은_표기_의미번호_중복_저장은_거부한다` | 예(DB `UX_TB_MDM_TERM_NAME_SENSE` 유일 인덱스가 대신 막아 예외 타입이 달라지며 여전히 빨강 — 이중 방어가 실제로 작동함을 보여준다) |
| I7 | `definition == null` 거부 분기를 `if(false)`로 무력화 | `TermMngServiceTest.I7_정의가_없으면_저장을_거부한다` | 예(DB `NOT NULL` 제약이 대신 막아 예외 타입이 달라지며 여전히 빨강) |
| I8 | `warnings.add("ENG_ABBR_DUP")` 분기를 `if(false)`로 무력화 | `TermMngServiceTest.I8_영문약어_중복은_저장을_막지_않고_경고만_낸다` | 예 |
| I9 | `TermEmbeddingCodec` 의 `ByteOrder.LITTLE_ENDIAN` → `BIG_ENDIAN`(encode·decode 둘 다) | `TermEmbeddingCodecTest.encode_decode_는_little_endian_으로_왕복한다`(수작업으로 만든 LE 기대 버퍼와 바이트 비교) | 예 |
| I11 | `TermEmbeddingRepository.findStaleTermIds` 의 SQL 조건을 `WHERE 1=1`(전건)로 무력화 | `TermReencodeBatchTest.I11_EMBEDDING_MODEL이_NULL이거나_다른_행만_대상으로_잡는다` + 청크 테스트 연쇄 실패 | 예 |
| I12 | `TermMngService.reencodeBatch` 의 `!encoder.isEnabled()` 조기 반환 분기를 `if(false)`로 무력화 | `TermReencodeBatchTest.I12_인코더가_비활성이면_즉시_반환하고_아무것도_건드리지_않는다` | 예 |
| I13 | `application.yml` 의 `mdm.embedding.encoder`를 `none`→`fake` 로 변경 | `NoopTermEmbeddingEncoderTest.main_application_yml_의_운영_기본값은_none_이다`(advisor 가 지적한 대로 이 테스트가 없으면 `ApplicationContextRunner` 계열 테스트는 이 변이를 못 잡는다) | 예 |
| I14 | `termMng.bpmn` 의 `compare` sequenceFlow `name` 을 `"compaer"` 오타로 변경 | `MdmOasisActionVocabularyTest`(어휘 포함 여부·5개 액션 존재 여부 2건) | 예 |
| I16 | (구현 버그로 실제 발생) `UnitMngService.save()` 가 수정 시에도 `CHG_SEQ=0` 강제 | `UnitMngServiceTest.I16_등록_시_CHG_SEQ는_0이고_수정_시에는_건드리지_않는다` | 예 — 실제 버그를 잡아 즉시 수정(커밋 `240bac3`), 재검증 초록 확인 |
| I18 | `MIN_STAGE1_SCORE` 를 `0.5`→`0.99` 로 상향 | `TermMngServiceTest.I18_편집거리_점수_0_5_경계값_포함_그_아래는_제외된다` | 예 |
| I19 | `afterCommitOrNow` 의 트랜잭션 동기화 분기를 `if(false)`로 무력화(항상 즉시 실행) | `TermMngServiceTest.I19_트랜잭션이_롤백되면_DB에도_캐시에도_남지_않는다` | 예 |
| I20 | `UnitMngService.CODE_20` 정규식을 문자 종류 제한 없이 길이만 검사(`^.{1,20}$`)하도록 완화 | `UnitMngServiceTest.UNIT_CODE_DIMENSION_이_ASCII_가_아니면_거부한다` | 예 |

advisor 재검토로 아래 4개 공백을 추가로 발견해 커버리지를 보강했다(TermMngServiceTest·
TermReencodeBatchTest 에 테스트 추가, 커밋 `4e5a3f4`) — `save()` 가 인코더 "활성" 상태로 실제로 호출되는
경로(신규 등록 시 즉시 인코딩, `definition` 수정 시 재인코딩, 활성→비활성 전환 시 NULL 로 정리)와
I19 의 커밋(성공) 분기, termMng `delete` 의 캐시 제거, I18 상위 5건·동점 처리 규칙 어느 것도 새 테스트가
없었다(saveAndFlush→updateEmbedding==1 자체를 실행하는 테스트조차 없었다).

| 항목 | 넣은 변이 | 잡은 테스트 | 빨강 |
|---|---|---|---|
| I12(재인코딩 분기) | `save()` 의 `inputChanged` 를 `isNew` 로만 축소(수정 시 입력 변경 감지 무력화) | `TermReencodeBatchTest.definition을_수정하면_EMBEDDING_벡터가_바뀐다`, `...인코더가_비활성인_서비스로_수정하면_EMBEDDING이_NULL로_지워진다` | 예(2건) |
| I19(커밋 분기) | `afterCommit()` 콜백 본문을 아무 것도 안 하게 무력화(등록 분기는 그대로 두어 롤백 테스트는 안 건드림) | `TermReencodeBatchTest.트랜잭션이_커밋되면_임베딩과_캐시가_모두_반영된다` | 예 |
| delete 캐시 제거 | `TermMngService.delete()` 의 `cache.remove` 호출을 삭제 | `TermMngServiceTest.삭제_후_DB에도_캐시에도_남지_않는다` | 예 |
| I18(상위 5건) | `TOP_N` 을 `5`→`50` 으로 확대 | `TermMngServiceTest.I18_상위_5건만_반환하고_동점이면_termId_오름차순이다` | 예 |

**못 덮은 항목(정직하게 기록, D1·D2 판단 아님 — 실제 공백)**:
- **I2** — "FE 는 계산하지 않는다"는 프런트 코드가 서버 응답값을 그대로 표시하는지를 보는 것이라, 백엔드
  단위 테스트로는 원천적으로 검증할 수 없다(FE 가 값을 재계산해도 백엔드 테스트는 여전히 그린이다).
  e2e(`mdm-unitMng.spec.ts` T3)가 "서버가 계산한 값이 화면에 그대로 뜨는지"는 보지만, "화면이 그 값을
  다시 계산하지 않는지"까지 적극적으로 반증하는 테스트는 없다 — 코드 리뷰(단위 화면이 `Number()` 연산을
  하지 않고 서버 응답 문자열을 그대로 렌더한다는 사실)로만 확인했다.
- **I15** — design.md 원안이 "정적 확인, 신규 테스트 없음"으로 이미 명시한 항목이라 변이를 넣지 않았다.
- I10·I17 은 앞 절 그대로(신규 코드가 아님, testAll 그린 유지로 회귀만 확인).

**프런트 변이 검증(I21)**: `dimensionLabel()` 을 `code => code`(맵 조회 무력화)로 바꾸고
`pnpm --filter @dk-oasis/m-mdm test` 실행 → `dimension-label.test.ts` 4건 모두 빨강(맵 매핑 4종) 확인,
원복 후 재실행 초록 확인.

## 담당자 확인 필요 결정(Build 추가분)

- **D15. I18 의 0.5 컷오프는 1차(문자열) 추천에만 적용, 2차(임베딩)는 컷오프 없음**
  - 질문: 불변 규칙 I18 원문("점수가 0.5 미만인 후보는 제외한다")이 1차·2차 공통인지 1차 전용인지
    design.md 문장 구조만으로는 확정하기 어렵다.
  - 선택지: (a) 0.5 컷오프를 1차에만 적용, 2차는 코사인 유사도 값을 그대로 써서 상위 5건만 자른다
    (b) 1차·2차 모두에 0.5 컷오프를 적용한다.
  - 택한 것: (a).
  - 근거: I18 원문에서 "점수가 0.5 미만인 후보는 제외한다" 문장이 1차 채점 방식을 설명하는 단락 안에
    있고, 그 뒤에 이어지는 "2차 후보 점수는 코사인 유사도 값을 그대로 쓴다" 문장은 컷오프를 다시
    언급하지 않는다 — "그대로 쓴다"는 표현이 추가 가공(컷오프 포함) 없이 원값을 쓴다는 뜻으로 더 자연
    스럽게 읽힌다.
  - 반려되면: `recommendStage2` 에도 `if (cosine < 0.5) continue;` 한 줄을 추가한다 — 나머지 로직(top5,
    동점 처리)은 그대로 재사용 가능.

- **D16. "코드베이스 지식" 절과 D12 가 반대로 적혀 있던 자기모순 — D12(기능설계서가 명시한 쪽)를 따른다**
  - 질문: design.md 본문에 "동의어로 확정" 버튼이 채우는 값의 방향(후보의 systems vs 편집 중인 용어의
    systems)이 D12 결정 블록과 "코드베이스 지식" 절에서 서로 반대로 적혀 있었다(advisor 지적). 어느
    쪽을 구현 기준으로 삼는가.
  - 선택지: (a) D12 결정 블록(후보의 termName+후보의 systems) (b) "코드베이스 지식" 절(편집 중인 용어
    자신의 systems).
  - 택한 것: (a).
  - 근거: 기능설계서(`termMng_기능설계서.md` §5.2 B-005, GAP-103)가 D12(a)를 명시적으로 구현 대상으로
    적어 뒀다 — 기능설계서는 Design Phase 의 확정 산출물이고 팀장이 직접 지시한 축소(D14)를 거쳐 나온
    문서라, 같은 Phase 안에서 서로 다른 절끼리 충돌할 때 화면 계약을 직접 서술한 기능설계서 쪽이 더
    구체적 증거다. "코드베이스 지식" 절은 근거 강도가 이미 D12 자체에서 "약함(표기 사례 하나뿐)"으로
    기록돼 있었다.
  - 반려되면: `TermMngPage.handleConfirmSynonym` 한 곳만 고치면 된다 — `candidate.systems` 대신 현재
    편집 중인 `form.systems` 를 콤마 분해해 붙이도록 바꾼다. DB·API 계약 변경은 없다.
