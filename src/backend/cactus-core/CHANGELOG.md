# cactus-core CHANGELOG

## 1.0.22-SNAPSHOT (2026-05-19 ~ 2026-10-04)

**Major — multi-DS MyBatis 통합 + audit/mastercode 핵심 fix.** 정본 설계: [`docs/cactus/cactus-mybatis-multi-ds-design.md`](../../docs/cactus/cactus-mybatis-multi-ds-design.md) v3.5+, [`docs/cactus/test-scenarios.md`](../../docs/cactus/test-scenarios.md).

### Changed — OASIS 서비스 캐시 교체 (2026-10-04, 리팩토링 항목 2)

**oasis/provider/**
- `CactusConcurrentCacheService` (신규) — oasis-core-api `SizeBaseCacheService` 대체. 적중은 `ConcurrentHashMap.get` 한 번(락 없음), 쓰기만 한 락 아래에서 값 맵과 넣은 순서 큐를 함께 바꾼다. 기존 구현은 적중 때도 전역 락 아래 O(n) 작업을 해 OASIS 호출마다 스레드가 한 줄로 섰다.
- `CactusCachingServiceProvider` — 캐시 저장소를 `CactusConcurrentCacheService` 로 바꾸고, 같은 serviceId 동시 미스를 한 번 로드로 묶는다(`inFlight`).
- `OasisAutoConfiguration` — transactional 모드의 `serviceStarter` 가 `new CactusConcurrentCacheService<>(cacheSize)` 를 넣는다.

**동작 변경 (호스트 확인 필요)**
- ★ `cactus.oasis.cache.size` 가 1 보다 작으면 `cactus.oasis.transactional=true` 일 때 기동이 `IllegalArgumentException` 으로 실패한다(non-transactional 모드는 이 캐시를 만들지 않아 영향 없음). 기존에는 0 도 기동됐다(음수는 기존에도 `HashMap` 생성에서 같은 예외).
- 상한을 실제로 지킨다 — 항목 수가 `cache.size` 를 넘으면 가장 먼저 넣은 키부터 내보낸다(FIFO, 적중은 순서를 바꾸지 않음 — LRU 아님). 기존 구현은 미스마다 키가 순서 목록에 두 번 들어가고 상한 확인이 `==` 라 상한이 사실상 지켜지지 않았다. 운영 BPMN 수(mcm 35개·mdm 52개)가 기본 100 보다 작아 보통 내보내기는 일어나지 않는다.
- 같은 키 동시 미스는 BPMN 을 한 번만 로드한다 — 기다리던 스레드는 같은 인스턴스를 받는다. 로드 실패는 묶지 않아 기다리던 스레드가 각자 다시 로드해 자기 예외를 받는다(실패는 캐시되지 않음). 기존에는 동시 미스마다 각자 로드하고 마지막 put 이 이겼다.

### Added — 신규 클래스

**mybatis/**
- `CactusMultiMybatisAutoConfiguration` — `cactus.datasource.extras.{name}.url` 있는 모든 DS 에 대해 `SqlSessionFactory{Name}` + `SqlSessionTemplate{Name}` 자동 등록. 모든 SqlSessionFactory 에 동일 인터셉터 attach (SqlLogging + CactusMybatisAudit + MasterCode).
- `CactusMultiMyBatisSqlRunner` — `oasis.executors.SqlRunner` 구현. ScriptTask 가 mapper id 호출 시 dataSource → SqlSessionTemplate 동적 매핑.

**resources/**
- `cactus-mybatis-config.xml` — film 동일 settings (callSettersOnNulls=true, mapUnderscoreToCamelCase=true, cacheEnabled=false, jdbcTypeForNull=NULL, localCacheScope=STATEMENT).

### Changed

- `OasisServiceExecutor` — ★ **R-cactus-audit-1 fix**: `sc.setAudit(audit)` 추가. OASIS contract 에 따라 `CoreServiceStarter:96` 가 `AuditHolder.setAudit(serviceContext.audit())` 호출 시 cactus 의 audit 이 전파되도록 보장. 기존엔 `AuditHolder.setAudit` 만 호출하여 OASIS 가 null 로 덮어쓰는 버그. dmes-film `ServiceController` 패턴과 동일.
- `MasterCodeJpaAutoConfiguration` — ★ **R-mybatis-13 fix**: `@Configuration` → `@AutoConfiguration`, `@ConditionalOnMissingBean(self)` 제거, `@EnableJpaRepositories(entityManagerFactoryRef="entityManagerFactory", transactionManagerRef="transactionManager")` 명시. multi-EMF 환경에서 Repository 빈 등록 보장 → MasterCodeMybatisInterceptor 정상 attach.
- `CactusResponseConverter` — **R-mybatis-12 fix**: `List<primitive>` (예: `List<Long>`) 처리 시 `MAPPER.convertValue(item, Map.class)` 실패 → `Number/String/Boolean/Character` → `{"value": item}` 안전 wrap.
- `CactusMybatisProperties` — 신규 필드: `enabled` (true 기본), `mapperLocations` (디폴트 `classpath*:persistence/**/*.xml`), `configLocation` (`classpath:cactus-mybatis-config.xml`).
- `AuditAutoConfiguration` — inner class `MybatisAuditAutoConfiguration` + `MybatisSqlLoggingAutoConfiguration` 삭제 (multi-DS 환경에서 다른 단일 SqlSessionFactory 가정 불일치).
- `MasterCodeMybatisAutoConfiguration` — `InterceptorRegistrar` inner class 삭제. 인터셉터 attach 는 `CactusMultiMybatisAutoConfiguration.build()` 가 전담 (multi-DS 모든 SqlSessionFactory 보장).

### Dependency

- `build.gradle` — `compileOnly 'org.mybatis:mybatis:3.5.16'` → **`api 'org.mybatis.spring.boot:mybatis-spring-boot-starter:3.0.4'`** (transitive 노출).

### Configuration

- `AutoConfiguration.imports` — `CactusMultiMybatisAutoConfiguration` 추가.

### R-issues 해소 (multi-DS mybatis)

- R-mybatis-1~12: multi-DS mybatis 통합 시 발견된 12개 잠재 이슈 모두 해소 (Phase 0~2, π, σ, ω, ψ, Ω).
- **R-cactus-audit-1**: `OasisServiceExecutor.sc.setAudit` 누락 → audit 컬럼 NULL → ι fix.
- **R-mybatis-13**: multi-EMF 환경 `MasterCodeJpaAutoConfiguration` Repository 등록 실패 → κ fix.

### Verified

- 시나리오 A-1~A-5, B-1~B-5, C-1~C-8, D-1~D-6, E-1~E-10, F-1+F-3~F-8 (F-2 의도된 deprecated), G-1~G-5, H-1~H-3 — 모두 실측 검증 완료 ([`test-scenarios.md`](../../docs/cactus/test-scenarios.md)).
- Audit 컬럼 자동 채움: `C_USR_ID=admin / C_SVC_ID=pilotAuditTest / C_PGM_ID=MENU_X / C_AT=epoch_ms / U_*` 모두 정상.
- MasterCode 디코딩: `testSts:"A"` → `testStsNm:"Active"` 자동 매핑 (TB_SEC_CODE_ITEM lookup).
- Cache 효과: 1차 671 / 2차 502 / 3차 471 ms (25% 감소).
- fail-fast: yml `txIF` 누락 시 `IllegalStateException: cactus.tx.managers 표준 3개 중 누락: [txIF]` + BUILD FAILED.

### Migration (1.0.21 → 1.0.22)

- mybatis-spring-boot-starter 의존 명시 불요 (cactus 가 `api` 로 전파).
- 매퍼 xml 위치 컨벤션: `src/main/resources/persistence/{serviceGroup}/{screen}.xml` (필수 아님 — base 디렉토리 0건이어도 부팅 안전).
- BPMN ScriptTask `camunda:resource="insert,namespace.statementId"` (cmd prefix 옵션) 패턴 사용.
- 호스트 측 `@EnableJpaRepositories.basePackages` 에 `com.dongkuk.dmes.cactus.mastercode` 추가 불요 (`MasterCodeJpaAutoConfiguration` 가 `entityManagerFactoryRef` 명시).

---

## 1.0.21-SNAPSHOT (2026-05-14 ~ 2026-05-15)

**Major — Oasis Multi-Transaction-Manager + dmes 표준 multi-DS 옵션 β/δ.** 정본 설계: [`docs/cactus/oasis-multi-tx-design.md`](../../docs/cactus/oasis-multi-tx-design.md), [`docs/cactus/oasis-multi-tx-detailed-design.md`](../../docs/cactus/oasis-multi-tx-detailed-design.md).

### Added — 신규 클래스

**tx/**
- `CactusTxProperties` — `cactus.tx.managers.{name}.data-source` Map + `default-manager` 필드 (옵션 δ — 표준 3개 txBiz/txCmn/txIF 강제).
- `CactusMultiTransactionManagerAutoConfiguration` — `cactus.tx.managers` 의 alias 를 cactus 의 EMF 별 JpaTransactionManager 빈으로 매핑 (primary-alias → `transactionManager`, extras key → `cactusTransactionManager{Name}`).
- `CactusTxConfigValidator` — `ContextRefreshedEvent` 시점에 fail-fast 검증 (managers 누락, default 미존재, data-source 미존재, primary-alias 충돌 등).

**datasource/**
- `CactusDataSourceProperties.extras` (Map) — `cactus.datasource.extras.{name}.url` 다수 DS 등록 지원 (`secondary` 단일 필드 deprecated).
- `CactusMultiDataSourceAutoConfiguration` (BDRPP) — extras 각 key 별 `cactusDataSource{Name}` 빈 등록 + yml-key alias (예: `if` → `cactusDataSourceIf`).
- `DefaultDataSourceResolver` — OASIS 의 default DS lookup (primary-alias 우선).

**jpa/**
- `CactusJpaProperties.extras` (Map) — `cactus.jpa.extras.{name}.packages-to-scan` 등.
- `CactusMultiJpaAutoConfiguration` (BDRPP) — extras 각 key 별 `cactusEntityManagerFactory{Name}` 빈 등록 + 매칭 `cactusTransactionManager{Name}`.

**oasis/**
- `DefaultTxInjectingServiceProvider` — ServiceProvider wrap. BPMN load 단계에서 PropertyContainer 에 `tx=<default>` 자동 inject → oasis-core 의 Tier 2 미명시 시 모든 TxMgr begin 회피 (R-multi-11 해소).
- `CactusCachingServiceProvider` — oasis-core `CachingServiceProvider` 의 `cache.cache()` 호출 누락 (R-multi-22) 대체. cache miss 시 underlying 호출 + 명시적 cache 저장 + thread-safe.
- `OasisProperties.cache.size` — 캐시 크기 yml 노출.

### Changed

- `OasisAutoConfiguration#serviceStarter` — multi-tx 모드 분기:
  - `cactus.tx.managers` 비어있음 → legacy 모드 (1.0.20 호환, single tx).
  - 명시 → multi-tx 모드: 화이트리스트 = managers 의 모든 alias, `DefaultTxInjectingServiceProvider` wrap.
  - 모든 모드에 `CactusCachingServiceProvider` 적용.
- `CactusSecondaryDataSourceAutoConfiguration`, `CactusSecondaryJpaAutoConfiguration` — `@Deprecated`. `extras` 우선, secondary 와 공존 (1.0.21 호환 모드).

### R-issues 해소 (multi-tx)

- R-multi-11: Tier 2 미명시 시 모든 TxMgr begin (DB 커넥션 풀 압박) → `DefaultTxInjectingServiceProvider` 로 default 1개만 begin.
- R-multi-22: `CachingServiceProvider.cache()` 호출 누락 → `CactusCachingServiceProvider` 로 대체.
- R-multi-25/28/29: alias 중복/reserved 빈 충돌/OASIS API 누락 — Validator 가 부팅 시 차단.

### Configuration

- `AutoConfiguration.imports` 추가: `CactusMultiDataSourceAutoConfiguration`, `CactusMultiJpaAutoConfiguration`, `CactusMultiTransactionManagerAutoConfiguration`.

### Verified

- mcm 부팅 로그: `[Cactus Tx] alias — 'txBiz/txCmn/txIF' → ...` 3줄, `[Cactus Oasis] multi-tx mode — managers=[...], default=txBiz`, `[Cactus Tx] config validated`.
- multi-tx C-1~C-7 ✅, multi-DS D-1~D-6 ✅.

### Migration (1.0.20 → 1.0.21)

- `cactus.oasis.transaction-manager-name` 제거 → `cactus.tx.default-manager: txBiz`.
- `cactus.datasource.secondary.*` / `cactus.jpa.secondary.*` 제거 → `extras.{name}.*`.
- `cactus.datasource.primary-alias: biz` 추가 (옵션 β).
- `cactus.tx.managers` 표준 3개 명시 (옵션 δ — 사용 안 해도 `data-source: biz` 매핑하여 의도 명시).
- 호스트 `@EnableJpaRepositories(entityManagerFactoryRef = "cactusSecondaryEntityManagerFactory")` → `"cactusEntityManagerFactoryX"` (X = extras key capitalize).
- 호스트 PropertySource override 키: `cactus.datasource.secondary.url` → `cactus.datasource.extras.{name}.url`.

---

## 1.0.20-SNAPSHOT (2026-05-14)

**Fix — Oasis ServiceProvider 디폴트 결손 수정.** mcm bootRun 에서 BPMN 호출 시 `ServiceNotFoundException: Cannot find the service file. [secUser]` 발생 → oasis-core 5.1.0 jar 디스어셈블 검증 결과 두 가지 결손 확인:

1. `OasisAutoConfiguration#serviceStarter` 의 transactional + filesystem 분기에서 `setServiceDocumentDirectory(path)` 만 호출 → oasis-core 의 `SpringServiceStarterFactory` 가 `setServiceProvider()` 미호출 시 디폴트 `SimpleServiceProvider` (내부적으로 `ClassPathFileServiceLoader` 사용) 로 떨어짐. plan §11-1 매트릭스의 "filesystem loader" 가정이 잘못됨.
2. `OasisProperties.servicePath` 디폴트값 `"resources/services"` 가 `ClassPathFileServiceLoader` 의 검색 패턴 `classpath*:{path}**` 와 호환되지 않음. mcm classpath 에는 `services/security/secUser.bpmn` 이 있으나 prefix `resources/services/` 로 검색하면 0건 매칭.

### Changed
- `OasisProperties#servicePath` 디폴트값: `"resources/services"` → **`"/services"`** (film 검증 컨벤션과 동일, classpath root 의 `services/**` 매칭).
- `OasisAutoConfiguration#serviceStarter` — film `OasisConfig` 패턴을 따라 ServiceProvider 명시 호출:
  - transactional + filesystem: `setServiceProvider(new CachingServiceProvider(new SimpleServiceProvider(path, "bpmn", "^^"), new SizeBaseCacheService()))` 명시. oasis-core 의 디폴트 캐시 손실 방지.
  - transactional + HTTP: 기존 `GenericServiceProvider` 도 `CachingServiceProvider` 로 감싸도록 통일.
  - non-transactional: `setFileDescriptionDelimiter("^^")` 명시 호출 (NonTransactionalServiceStarterFactory 는 setServiceProvider 미지원이라 setter 만 사용. 디폴트값과 동일하지만 코드 의도 명확화).
- 부팅 로그: `[Cactus Oasis] transactional + filesystem loader` → `[Cactus Oasis] transactional + classpath loader` (실제 동작에 맞게 정정).

### Notes
- `service-path` 의 의미가 "file system 상대경로" 에서 **"classpath prefix"** 로 재정의됨. 운영 환경에서 BPMN 파일은 `src/main/resources/services/...` 에 위치 → 빌드 후 jar classpath 의 `/services/**` 로 매칭됨.
- `^^` delimiter 의 **정확한 동작** (oasis-core `AbstractFileServiceLoader.isMatchedServiceName`): 파일 이름에 `^^` 가 포함된 경우 (예: `services/grp^^myService.bpmn`) delimiter 앞 부분 (`grp`) 이 serviceId 로 매칭. **호출 serviceId 와 폴더 path 간 자동 변환은 없음** — 단순 serviceId (예: `secUser`) 는 파일이름 기준 매칭이라 BPMN 폴더 구조 무관. (이전 표현 "`security^^secUser` → `security/secUser.bpmn`" 은 부정확 — 1.0.22 정정. R-cactus-doc-1).
- 향후 file system 로더 (jar 외부 BPMN) 를 정식 지원하려면 yml 키 추가 필요 (예: `cactus.oasis.loader-type: classpath|filesystem`). 본 릴리스 범위 외 — 별도 RFC.

### Migration
- 이전 디폴트 `"resources/services"` 에 의존하던 모듈은 yml 의 `cactus.oasis.service-path` 라인을 제거하거나 `"/services"` 로 명시.
- mcm/api 는 yml 명시값 제거 (디폴트 흡수).

---

## 1.0.19-SNAPSHOT (2026-05-13)

dmes-film 의 4개 `@Configuration` (`BizDataSourceConfig`, `BizDataJpaConfig`,
`BizDataAccessConfig`, `OasisConfig`) 의 기능을 cactus-core 의 AutoConfiguration
체계로 흡수. 상세 의사결정은 `docs/cactus/cactus-core-data-access-migration-plan.md`.

### Added — 신규 클래스 19개

**jpa/**
- `SnakePhysicalNamingStrategy` — camelCase → snake_case 변환 + `Entity` 접미사 제거 (film 이식)
- `CactusJpaProperties` — `cactus.jpa.*` 프로퍼티 바인딩 (snake-naming, secondary)
- `CactusHibernateCustomizerAutoConfiguration` — `cactus.jpa.snake-naming.enabled=true` (기본) 시 `HibernatePropertiesCustomizer` 로 Snake naming 자동 주입
- `CactusSecondaryJpaAutoConfiguration` — `cactus.jpa.secondary.enabled=true` 시 보조 EMF + TxMgr

**mastercode/**
- `MasterCodeDecoder` (interface) — 마스터 코드 디코딩 SPI
- `DefaultMasterCodeDecoder` — `MasterCodeItemRepository` 기반 기본 구현 (`@ConditionalOnMissingBean`)
- `MasterCodeMybatisInterceptor` — MyBatis SELECT 결과의 LoV/`_CD_NM`/`_STS_NM` 자동 디코딩
- `MasterCodeMybatisAutoConfiguration` — `SqlSessionFactory` + `MasterCodeDecoder` 빈 존재 시 인터셉터 등록

**datasource/**
- `CactusDataSourceProperties` — `cactus.datasource.secondary.*` 프로퍼티
- `DialectDetector` — JDBC URL/driver 기반 dialect 추정 유틸 (mssql/sqlite/none)
- `CactusSecondaryDataSourceAutoConfiguration` — `cactus.datasource.secondary.url` 명시 시 HikariDataSource 빈 생성

**mybatis/**
- `CactusMybatisProperties` — `cactus.mybatis.*` 프로퍼티 (master-code-decoding 토글)
- `CactusMybatisAutoConfiguration` — `DefaultDataSourceResolver` 빈 자동 등록 (oasis primary DS 노출)

**tx/**
- `CactusTransactionManagerAutoConfiguration` — `cactus.tx.jpa-unified=true` + 단일 EMF 환경에서 `@Primary JpaTransactionManager` 명시

**oasis/**
- `oasis/loader/HttpServiceDocumentLoader` — JDK 21 `java.net.http.HttpClient` 기반 (film 의 Apache HttpClient 4.x 의존 회피)
- `oasis/util/CaseConverter` — JDK 만 사용한 케이스 변환 유틸 (film 의 Guava CaseFormat 의존 회피)
- `oasis/task/MyBatisSqlRunner` — Oasis BPMN 의 SQL 태스크를 MyBatis SqlSession 으로 실행 (film 이식)
- `oasis/converter/MssqlColumnConverter` — MSSQL `Date/Time/Timestamp` → `LocalDate/LocalTime/Instant` 정규화
- `oasis/converter/SqliteColumnConverter` — SQLite 최소 변환 (TEXT 시간 컬럼은 String 그대로)

### Changed — 수정 2개

- `oasis/OasisProperties` — `serviceLoaderUrl`, `transactionManagerName`, `dialect` 필드 추가
- `oasis/OasisAutoConfiguration` — `serviceStarter()` 가 `OasisProperties` 주입받아 transactional × ServiceProvider 분기.
  - `cactus.oasis.transactional=true` + URL → `SpringServiceStarterFactory` + `HttpServiceDocumentLoader`
  - `cactus.oasis.transactional=true` + URL 없음 → `SpringServiceStarterFactory` + `setServiceDocumentDirectory`
  - `cactus.oasis.transactional=false` → `NonTransactionalServiceStarterFactory` + `setServiceDocumentDirectory`. URL 명시 시 예외 throw (5.1.0 API 제약).
  - `cactus.oasis.dialect` 분기로 `MssqlColumnConverter` / `SqliteColumnConverter` 빈 자동 등록
  - SqlSession 빈 존재 시 `MyBatisSqlRunner` 자동 등록

### Removed — 이식 안 함

- film 의 `MybatisAudit` / `MybatisSqlLogger` — cactus 의 `CactusMybatisAuditInterceptor` / `SqlLoggingInterceptor` 와 동등 기능 이미 존재
- film 의 `OracleColumnConverter` — 현재 aps 환경에 Oracle 사용처 0. 미래 도입 시 `compileOnly` + `@ConditionalOnClass` 패턴으로 추가 가능
- film 의 `SnakeCaseCaseInsensitivePreStructuredMessageBuilder` — oasis-core 5.1.0 에 `MessageBuilder` 인터페이스 부재 (4.18.1 → 5.1.0 에서 제거)
- film 의 `FilmTopicLoader` / `FilmTopicStructureLoader` — oasis-core 5.1.0 에 `TopicLoader`/`TopicStructureLoader` 인터페이스 부재 + film 도메인 의존

### Verified — oasis-core 5.1.0 API

- `NonTransactionalServiceStarterFactory#setServiceProvider` **없음** 확인 (javap 검증, 위험 R-11 해소). 대신 `setServiceDocumentDirectory(String)` 만 노출 — URL 모드는 transactional=true 필수
- `SpringServiceStarterFactory#setServiceProvider(ServiceProvider)` 존재 확인
- 그 외 `Simple/Generic/CamundaBpmnServiceProvider`, `FileSystemFileServiceLoader`, `ColumnConverter`, `DefaultDataSourceResolver`, `SqlRunner` 모두 존재 확인

### Configuration

`AutoConfiguration.imports` 에 5개 신규 등록:
- `MasterCodeMybatisAutoConfiguration`
- `CactusHibernateCustomizerAutoConfiguration`
- `CactusSecondaryJpaAutoConfiguration`
- `CactusSecondaryDataSourceAutoConfiguration`
- `CactusMybatisAutoConfiguration`
- `CactusTransactionManagerAutoConfiguration`

### Consumer Modules — 영향

- **mpp / mqc / mcm**: 자체 `JpaConfig` 삭제 (Phase 6). yml 의 `spring.jpa.*` 가 Spring Boot 자동 EMF 로 전달.
- **mpp / mqc**: `Application` 클래스에 `@EntityScan(basePackages={"com.dongkuk.dmes.cactus","com.dongkuk.dmes.{mpp|mqc}"})` 추가
- **mcm**: 기존 `@EntityScan` 그대로 — cactus 의 `MasterCodeJpaAutoConfiguration` 의 자체 `@EntityScan` 이 통합되어 자동 인식
- **caravan 의존 모듈 (serai)**: 영향 없음. cactus-core 가 caravan transitive 노출 안 함 (build.gradle 에서 이미 제거됨).

### Verified

- ✅ cactus-core clean test: **105 tests, 0 failures, 0 errors**
- ✅ mcm / mpp / mqc / mpn / serai 전체 모듈 빌드 성공
- ✅ mcm / mpp / mqc bootRun (local profile, SQLite) 모두 성공, ERROR 0건
- ✅ `[Cactus Oasis] non-transactional + filesystem loader` 분기 로그 정상 출력

## 1.0.18-SNAPSHOT 및 이전

(이전 변경 이력 — 본 파일 신설 전. git log 참고)
