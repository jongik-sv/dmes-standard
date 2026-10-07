# Cactus-Core 데이터 액세스 통합 마이그레이션 플랜

> **DB 전제 안내 (2026-10-03)**: 이 문서의 「MSSQL 운영」 서술은 dmes-ksm(MSSQL) 이관 시절 전제이며 이력으로 남긴다. 운영 DB 는 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않는다. 새 SQL 은 [`oracle-sql-rules.md`](../../guide/Database/oracle-sql-rules.md) 를 따른다.

> dmes-film 의 4개 `@Configuration`(`BizDataSourceConfig`, `BizDataJpaConfig`,
> `BizDataAccessConfig`, `OasisConfig`) 을 **cactus-core** 의 `@AutoConfiguration`
> 체계로 흡수해, MyBatis 기반 소비 모듈(MSSQL 운영 / SQLite 로컬)에 일관된
> 데이터 액세스 + Oasis 통합 환경을 제공한다.

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-12 |
| 대상 모듈 | `src/backend/cactus-core` (v1.0.18-SNAPSHOT 이후) |
| 영향 모듈 | mcm, mpn, mpp, mqc, serai, kmc-core, mcm-core, caravan 소비측 |
| 참고 원본 | `dmes-fwk/workspace-fwk/dmes-film/dmes-film-biz/.../cmn/config/**` |
| 진행 옵션 | **옵션 B — 기존 cactus AutoConfig 확장** |

> **1.0.20-SNAPSHOT 사후 정정 (2026-05-14).** 본 plan §11-1 의 분기 매트릭스에 두 가지 가정 오류가 있었음이 oasis-core 5.1.0 jar 디스어셈블로 확인됨:
> 1. `setServiceDocumentDirectory(path)` 만 호출해도 `FileSystemFileServiceLoader` 가 활성된다는 가정 → 실제로는 `setServiceProvider()` 미호출 시 oasis-core 가 디폴트 `SimpleServiceProvider`(내부 `ClassPathFileServiceLoader`) 를 그대로 사용. setter 는 ServiceProvider/Loader 종류를 바꾸지 못함.
> 2. `OasisProperties.servicePath` 디폴트 `"resources/services"` 가 file system 상대경로로 해석된다는 가정 → 실제로는 ClassPath prefix. 빌드된 classpath 에 `resources/services/` 라는 prefix 가 없어서 매칭 0건 → `ServiceNotFoundException`.
>
> 정정: §11-1 의 "filesystem loader" 표현은 실제 ClassPath 동작을 가리키며, 1.0.20-SNAPSHOT 부터 `OasisAutoConfiguration` 이 film 패턴을 따라 `setServiceProvider(new CachingServiceProvider(new SimpleServiceProvider(path, "bpmn", "^^"), ...))` 를 명시 호출 + `OasisProperties.servicePath` 디폴트값 `"/services"` 로 변경. 자세한 내용은 `cactus-core/CHANGELOG.md` 의 1.0.20-SNAPSHOT 항목 참조.

> **1.0.22-SNAPSHOT 사후 정정 (2026-05-20).** 본 plan §15-3-2 의 mcm `JpaConfig` outdated 처리 + 본 plan 의 A-3 (MasterCode 디코딩) / A-4 (Audit 컬럼) 시나리오 정본 표시:
>
> 1. **A-3 (MasterCode 디코딩) — ✅ 1.0.22 κ fix 완료** ([`test-scenarios.md`](./test-scenarios.md) 의 A-3, [`cactus-mybatis-multi-ds-design.md`](./cactus-mybatis-multi-ds-design.md) v3.6 의 R-mybatis-13).
>    - 원인: multi-EMF 환경에서 `MasterCodeJpaAutoConfiguration` 의 `@Configuration` + `@EnableJpaRepositories(basePackages)` 가 timing 이슈로 Repository 빈 미등록 → `MasterCodeMybatisInterceptor` 미attach.
>    - 해결: `@AutoConfiguration` + `entityManagerFactoryRef="entityManagerFactory"` + `transactionManagerRef="transactionManager"` 명시.
>    - 검증: `interceptors=[..., MasterCodeMybatisInterceptor]` 양쪽 SqlSessionFactory + `testSts:"A" → testStsNm:"Active"` 자동 디코딩.
>
> 2. **A-4 (Audit 컬럼) — ✅ 1.0.22 ι fix 완료** (R-cactus-audit-1).
>    - 원인: cactus `OasisServiceExecutor` 가 `AuditHolder.setAudit()` 만 호출하고 `sc.setAudit()` 누락 → OASIS `CoreServiceStarter:96` 가 `AuditHolder.setAudit(sc.audit() = null)` 으로 덮어씀 → 모든 audit 컬럼 NULL.
>    - 해결: `DefaultServiceContext sc = ...; sc.setAudit(audit);` 1-line 추가 (dmes-film `ServiceController` 패턴).
>    - 검증: OASIS 경유 INSERT/UPDATE 의 `C_USR_ID=admin / C_SVC_ID=pilotXxx / C_PGM_ID=MENU_X / C_AT/U_*` 정상 채움.
>
> 두 fix 모두 cactus 1.0.22-SNAPSHOT 에 포함. 호스트 측 추가 작업 0 (cactus 의존성 버전만 갱신).

---

## 0. 개요

dmes-film 의 4개 설정 클래스는 *모놀리식 앱의 컴포넌트 스캔* 으로만 동작
하도록 만들어져 있다(`@AutoConfiguration` 미사용, `AutoConfiguration.imports`
파일도 없음, `BizApplication` 의 `@SpringBootApplication` 컴포넌트 스캔에
의존). 이를 cactus-core 에 그대로 옮기면 **빈 이름 중복**(`serviceStarter`),
**MyBatis 인터셉터 중복**(`AuditAutoConfiguration` vs `BizDataAccessConfig`),
**Oracle 하드코딩**(`OracleColumnConverter`), **`txBiz` 전역 강제** 같은
문제가 발생한다.

본 플랜은 그 충돌을 모두 회피하면서 film 의 기능을 **빠진 자리에만 채워
넣는** 방식이다(옵션 B). 기존 소비 모듈의 코드 수정 없이도 동작하도록
`@ConditionalOn*` 로 활성 조건을 좁히고, **`cactus.*` 프로퍼티로 점진 도입**
가능하도록 설계한다.

### 0-1. 사전 환경 점검 결과 (2026-05-12)

소스 + oasis-core 5.1.0 jar 직접 검증 결과 다음 사실이 확인됨:

| 항목 | 결과 |
|---|---|
| oasis-core 버전 | **5.1.0** (film 은 4.18.1 → 5.1.0 사이 API 변화 존재) |
| `NonTransactionalServiceStarterFactory`, `SpringServiceStarterFactory` | jar 에 존재 ✅ |
| `Simple/Generic/CamundaBpmnServiceProvider`, `FileSystemFileServiceLoader`, `ColumnConverter`, `DefaultDataSourceResolver`, `SqlRunner` | jar 에 존재 ✅ |
| `MessageBuilder` / `TopicLoader` / `TopicStructureLoader` 인터페이스 | jar 에 **없음** ❌ (5.1.0 에서 삭제됨) — plan 의 `SnakeCaseInsensitiveMessageBuilder` 이식 항목 취소 |
| BPMN 파일 | 38개 사용 중 (mcm 14, mpn 7, 기타 17) |
| `OasisServiceExecutor` / `OasisAutoConfiguration#serviceStarter()` | 현재 `OasisProperties` 미주입 — `servicePath` placeholder. 본 마이그레이션의 일부로 연결 추가 필요 |
| `setServiceProvider` 메서드 시그니처 | 클래스 존재 확인. 메서드는 Phase 1 첫 작업에서 직접 검증 (위험 R-11) |
| caravan 분리 | cactus-core, mcm 양쪽에서 **이미 완료** (2026-05-12). SERAI 등은 caravan 의존 유지 — `src/backend/caravan/` 및 `settings.gradle` 의 `includeBuild('caravan')` 정상 |
| mcm/mpp/mqc 의 `JpaConfig` | 여전히 존재 — 본 플랜 Phase 6 에서 삭제 작업 |

→ 본 plan 의 모든 결정사항은 위 사실 위에서 *구현 가능* 으로 검증됨.

---

## 1. 결정 사항 (입력)

| # | 결정 | 함의 |
|---|---|---|
| 1 | 목적은 (a)+(b) — film 코드를 부분 참고하면서 cactus 의 부족분을 채움 | 1:1 이식 금지. 충돌 없는 기능만 흡수. |
| 2 | DB dialect 1순위 **MSSQL**, 로컬은 **SQLite** | `OracleColumnConverter` 직접 사용 불가. dialect-aware 분기 필요. |
| 3 | 소비 모듈은 대부분 **MyBatis** 사용 | `SqlSessionFactory` 가 사실상 상시 존재. MyBatis AutoConfig 가 강한 기본값. |
| 4 | Oasis **트랜잭션 모드** 필요. `JpaTransactionManager` 사용. | 기존 `OasisAutoConfiguration` 은 NonTransactional 전용 → 분기 추가. |
| 5 | **다중 DataSource** 지원, 개발계/운영계 DB 가변 | primary + secondary DataSource 패턴 표준화. 환경별 yml 분기 명세. |

---

## 2. 현황 분석

### 2-1. cactus-core 가 이미 가진 것

| 자동설정 | 위치 | 역할 |
|---|---|---|
| `CactusAutoConfiguration` | `autoconfigure` | `@ComponentScan(basePackages="com.dongkuk.dmes.cactus")` + `CactusProperties` 바인딩 |
| `AuditAutoConfiguration` | `audit` | MyBatis: `SqlLoggingInterceptor` + `CactusMybatisAuditInterceptor` 등록 (`@ConditionalOnBean(SqlSessionFactory.class)`) |
| `OasisAutoConfiguration` | `oasis` | `NonTransactionalServiceStarterFactory` 기반 `ServiceStarter` + Request/Response 컨버터 + Executor (`@ConditionalOnClass(ServiceStarter.class)`) |
| `MasterCodeJpaAutoConfiguration` | `mastercode` | `@EntityScan` + `@EnableJpaRepositories` (Entity / Repository 만) |
| `MasterCodeCacheAutoConfiguration` | `web.inbound` | LoV 캐시 (Caffeine) |
| `InboundAutoConfiguration` | `web.inbound` | RequestMappingHandlerMapping 확장 등 |
| `CactusAuth*` 시리즈 | `autoconfigure` | 보안/JWT/필터 — DataSource 와 무관 |

### 2-2. cactus-core 가 가지지 못한 것 (film 에는 있는 것)

| film 항목 | film 위치 | cactus 상태 |
|---|---|---|
| Hikari DataSource 빈 (`dataSourceBiz`) | `BizDataSourceConfig` | **없음** — Spring Boot `DataSourceAutoConfiguration` 에 의존 |
| Profile-aware DataSource 분기 | `BizDataSourceConfig` 내부 | **없음** |
| 커스텀 `EntityManagerFactory`(`entityManagerFactoryBiz`) | `BizDataJpaConfig` | **없음** — Spring Boot `HibernateJpaAutoConfiguration` 에 의존 |
| `SnakePhysicalNamingStrategy` | `cmn.config` | **없음** — Hibernate 기본 사용 중 |
| `SqlSessionFactory` 빈 + 인터셉터 체인 | `BizDataAccessConfig` | **없음** — 소비 모듈이 `mybatis-spring-boot-starter` 로 자체 등록 |
| `MasterCodeIntercept`(MyBatis 인터셉터) | `cmn.master` | **없음** — Entity/Repo 만 있음 |
| `MasterCodeDecoder` 인터페이스/기본 구현 | `cmn.master` | **없음** |
| `DefaultDataSourceResolver` (oasis-core 용) | `BizDataAccessConfig` | **없음** |
| `JpaTransactionManager`(`txBiz`) — JPA+MyBatis 통합 | `BizDataAccessConfig` | **없음** — Spring Boot 기본 `transactionManager` 사용 |
| `OracleColumnConverter` (oasis-core `ColumnConverter` 구현) | `cmn.oasis.converter` | **없음** |
| `MyBatisSqlRunner` (oasis-core `SqlRunner` 구현) | `cmn.oasis.task` | **없음** |
| Transactional `ServiceStarter` (`SpringServiceStarterFactory(ctx, "txBiz")`) | `OasisConfig` | **없음** — NonTransactional 만 |
| `FilmTopicLoader` / `FilmTopicStructureLoader` (DB 기반 메시지 정의) | `cmn.oasis.message` | **없음** — film 도메인 SPI, cactus 에는 기본 구현 부재 |
| `MessageBuilder` (snake-case + case-insensitive) | `cmn.oasis.message` | **없음** |

### 2-3. 환경 차이

| 항목 | film | aps |
|---|---|---|
| Java / `*.persistence` | 11 / `javax.*` | **21 / `jakarta.*`** |
| Spring Boot | 2.x | **4.0.6** |
| DB | Oracle 고정 | MSSQL / SQLite |
| 프로퍼티 prefix | `dmes.film.db.biz.*` | `spring.datasource.*` (Spring Boot 표준) |
| 배포 형태 | 모놀리식 jar (컴포넌트 스캔) | **AutoConfiguration 라이브러리** |

---

## 3. 목표 아키텍처

### 3-1. 레이어 구성

```
┌───────────────────────────────────────────────────────────────────────┐
│ 소비 모듈 (mcm, mpn, mpp, mqc, serai …)                                 │
│   - @SpringBootApplication                                            │
│   - application-{profile}.yml (spring.datasource.*, cactus.*)         │
│   - 자체 MyBatis Mapper.xml, JPA Entity, Domain Service               │
└────────────────────────────▲──────────────────────────────────────────┘
                             │ AutoConfiguration.imports 로 자동 활성
┌────────────────────────────┴──────────────────────────────────────────┐
│ cactus-core (라이브러리, java-library + AutoConfiguration)            │
│                                                                       │
│  [신규 / 확장]                                                        │
│  ├ datasource/                                                        │
│  │   ├ CactusDataSourceProperties        (cactus.datasource.*)        │
│  │   ├ CactusSecondaryDataSourceAutoConfig — 보조 DataSource 옵셔널   │
│  │   └ DialectDetector                   — URL/driver → MSSQL/SQLite  │
│  ├ jpa/                                                               │
│  │   ├ SnakePhysicalNamingStrategy       (film 이식, 일반화)          │
│  │   ├ CactusHibernateCustomizerAutoConfig — naming/properties 자동주입│
│  │   └ CactusSecondaryJpaAutoConfig      — 보조 EMF 패턴 (옵셔널)     │
│  ├ mybatis/                                                           │
│  │   ├ CactusMybatisAutoConfiguration    — 인터셉터 체인 + DataSourceResolver│
│  │   └ CactusMybatisProperties           (cactus.mybatis.*)           │
│  ├ mastercode/                                                        │
│  │   ├ MasterCodeDecoder (SPI)                                        │
│  │   ├ DefaultMasterCodeDecoder          — Entity 기반 기본 구현      │
│  │   ├ MasterCodeMybatisInterceptor      — film MasterCodeIntercept 일반화│
│  │   └ MasterCodeMybatisAutoConfiguration                             │
│  ├ tx/                                                                │
│  │   └ CactusTransactionManagerAutoConfig — JpaTxMgr 통합 모드 (옵셔널)│
│  └ oasis/  (기존 OasisAutoConfiguration 확장)                         │
│      ├ converter/                                                     │
│      │   ├ MssqlColumnConverter          (신규, dialect=mssql)        │
│      │   └ SqliteColumnConverter         (신규, dialect=sqlite)       │
│      ├ loader/HttpServiceDocumentLoader  — film 이식 (HTTP BPMN 로더) │
│      ├ task/MyBatisSqlRunner             — film 이식                  │
│      └ OasisAutoConfiguration            — transactional +            │
│                                            ServiceProvider 분기 추가  │
└───────────────────────────────────────────────────────────────────────┘
```

### 3-2. 활성 모드 매트릭스

| 모드 | 조건 | 결과 |
|---|---|---|
| **최소 모드 (기본)** | 신규 프로퍼티 미설정 | 기존 cactus 동작 그대로. 이번 작업의 변경점은 *모두 비활성*. |
| **MyBatis 강화** | `SqlSessionFactory` 빈 존재 (소비 모듈이 `mybatis-spring-boot-starter` 사용) | 기존 audit/logging + 신규 `MasterCodeMybatisInterceptor` + `DefaultDataSourceResolver` 자동 등록 |
| **Snake Naming** | `cactus.jpa.snake-naming.enabled=true` | `SnakePhysicalNamingStrategy` 가 모든 EMF 에 적용 |
| **Oasis 트랜잭션 모드** | `cactus.oasis.transactional=true` | `NonTransactionalServiceStarterFactory` 대신 `SpringServiceStarterFactory(ctx, ["transactionManager"])` |
| **Oasis ServiceProvider 분기** | (항상) | URL 명시 → `GenericServiceProvider(HttpServiceDocumentLoader)` / 그 외 → `CamundaBpmnServiceProvider(FileSystemFileServiceLoader(servicePath))` — `servicePath` 기본 `"resources/services"` (미결 #6/#7 결정) |
| **Oasis dialect 변환** | `cactus.oasis.dialect=mssql\|sqlite` | 해당 `ColumnConverter` 빈 등록 (기본은 등록 안 함) |
| **보조 DataSource** | `cactus.datasource.secondary.url` 존재 (Phase 3 범위. N개 보조는 §9-2 별도 RFC) | 보조 Hikari DataSource(`cactusSecondaryDataSource`) + EMF + TxMgr 생성 |
| **MasterCode 디코딩** | MyBatis 강화 + `MasterCodeDecoder` 빈 존재 | LoV 결과/`_CD_NM`/`_STS_NM` 자동 채움 |

---

## 4. 신규/수정 자동설정 카탈로그

| 분류 | 클래스 | 종류 | 활성 조건 | film 대응 |
|---|---|---|---|---|
| jpa | `SnakePhysicalNamingStrategy` | 신규 (이식) | — (POJO) | `cmn.config.SnakePhysicalNamingStrategy` |
| jpa | `CactusJpaProperties` | 신규 | — | (film: yml 직접) |
| jpa | `CactusHibernateCustomizerAutoConfiguration` | 신규 | `@ConditionalOnClass(HibernateProperties.class)` + `cactus.jpa.snake-naming.enabled=true` (`matchIfMissing=true`) | `BizDataJpaConfig` 의 naming/format/comments 부분 |
| jpa | `CactusSecondaryJpaAutoConfiguration` | 신규 | `@ConditionalOnProperty("cactus.jpa.secondary.enabled")` | `BizDataJpaConfig.entityManagerFactoryBiz` |
| datasource | `CactusDataSourceProperties` | 신규 | — | `BizDataSourceConfig` |
| datasource | `CactusSecondaryDataSourceAutoConfiguration` | 신규 | `@ConditionalOnProperty("cactus.datasource.secondary.url")` | `BizDataSourceConfig` 의 빈 등록 부분 |
| datasource | `DialectDetector` | 신규 (유틸) | — | (film: profile 분기) |
| mybatis | `CactusMybatisProperties` | 신규 | — | — |
| mybatis | `CactusMybatisAutoConfiguration` | 신규 | `@ConditionalOnBean(SqlSessionFactory.class)` | `BizDataAccessConfig` (의 인터셉터 + DataSourceResolver) |
| mybatis | `CactusDefaultDataSourceResolver` | 신규 | `@ConditionalOnClass(name="com.dongkuk.oasis.jdbc.DefaultDataSourceResolver")` (CactusMybatisAutoConfiguration 내부 빈) | `BizDataAccessConfig.defaultDataSourceResolver` |
| mybatis | (참고) `AuditAutoConfiguration` | **수정** | (기존) — 등록 순서 명시화 | `MybatisAudit` 위치 일치 |
| mastercode | `MasterCodeDecoder` (interface) | 신규 (이식) | — | `cmn.master.MasterCodeDecoder` |
| mastercode | `DefaultMasterCodeDecoder` | 신규 | `@ConditionalOnMissingBean(MasterCodeDecoder.class)` + `@ConditionalOnBean(MasterCodeItemRepository.class)` | `CsvMasterCodeDecoder` 패턴 일반화 |
| mastercode | `MasterCodeMybatisInterceptor` | 신규 (이식) | — (POJO) | `cmn.master.MasterCodeIntercept` |
| mastercode | `MasterCodeMybatisAutoConfiguration` | 신규 | `@ConditionalOnBean({SqlSessionFactory.class, MasterCodeDecoder.class})` | (film: BizDataAccessConfig 안에 직접) |
| tx | `CactusTransactionManagerAutoConfiguration` | 신규 | `@ConditionalOnProperty("cactus.tx.jpa-unified=true")` + `@ConditionalOnBean(EntityManagerFactory.class)` | `BizDataAccessConfig.txBiz` |
| oasis | `OasisProperties` | **수정** | (기존) `dialect`, `transactional`, `transactionManagerName`, `serviceLoaderUrl` 추가 | `OasisConfig` 의 yml 의도 |
| oasis | `OasisAutoConfiguration` | **수정** | transactional 분기 + ServiceProvider 분기 + ColumnConverter dialect 분기 | `OasisConfig.serviceStarter` 분기 (film 의 `OasisConfigLocal` 로직 재현) |
| oasis | `OasisServiceExecutor` | **수정** | (기존) — `OasisProperties` 주입 + `servicePath` 가 `ServiceStarter` 에 연결되도록 수정 (현재 placeholder, 위험 R-15) | — |
| oasis | `HttpServiceDocumentLoader` | 신규 (이식, JDK HttpClient 재작성) | (POJO) — `cactus.oasis.service-loader-url` 지정 시 `GenericServiceProvider` 의 loader 로 사용. 미결 #8 결정 | `cmn.oasis.loader.HttpServiceDocumentLoader` |
| oasis | `MyBatisSqlRunner` | 신규 (이식) | (POJO) — AutoConfig 에서 빈 등록. oasis-core 5.1.0 의 `JdbcTemplateSqlRunner` 와 양자택일 | `cmn.oasis.task.MyBatisSqlRunner` |
| ~~oasis~~ | ~~`SnakeCaseInsensitiveMessageBuilder`~~ | **제거 (2026-05-12)** | oasis-core 5.1.0 에 `MessageBuilder` 인터페이스 없음 (4.18.1 → 5.1.0 에서 삭제). 이식 불가 | (이식 안 함) |
| oasis | `MssqlColumnConverter` | **신규** | `@ConditionalOnProperty("cactus.oasis.dialect", havingValue="mssql")` | (film 없음 — 신규 작성 필요) |
| oasis | `SqliteColumnConverter` | **신규** | `@ConditionalOnProperty("cactus.oasis.dialect", havingValue="sqlite")` | (film 없음 — 신규 작성 필요) |

> 토픽 로더(`FilmTopicLoader/Structure`)는 **이식하지 않는다** — film 도메인 의존이고,
> oasis-core 5.1.0 에 `TopicLoader`/`TopicStructureLoader` 인터페이스 자체가 없음
> (4.18.1 → 5.1.0 에서 삭제됨, 2026-05-12 jar 검증). 미래 메시지 SPI 필요 시
> 5.1.0 의 새 패키지 구조 재검토 필요.

---

## 5. 패키지/클래스 설계

### 5-1. 최종 패키지 트리

```
com.dongkuk.dmes.cactus
├── audit/                                       (기존 — 그대로)
├── autoconfigure/                               (기존 — 그대로)
├── common/                                      (기존)
├── local/                                       (기존, LocalSqliteDataSource)
├── mastercode/                                  (기존 확장)
│   ├── MasterCodeGroupEntity.java               (기존)
│   ├── MasterCodeItemEntity.java                (기존)
│   ├── MasterCodeItemRepository.java            (기존)
│   ├── MasterCodeJpaAutoConfiguration.java      (기존)
│   ├── MasterCodeDecoder.java                   ★ 신규 (interface)
│   ├── DefaultMasterCodeDecoder.java            ★ 신규
│   ├── MasterCodeMybatisInterceptor.java        ★ 신규 (film 이식 + 제네릭화)
│   └── MasterCodeMybatisAutoConfiguration.java  ★ 신규
├── datasource/                                  ★ 신규 패키지
│   ├── CactusDataSourceProperties.java
│   ├── CactusSecondaryDataSourceAutoConfiguration.java
│   └── DialectDetector.java
├── jpa/                                         ★ 신규 패키지
│   ├── SnakePhysicalNamingStrategy.java         (film 이식)
│   ├── CactusJpaProperties.java
│   ├── CactusHibernateCustomizerAutoConfiguration.java
│   └── CactusSecondaryJpaAutoConfiguration.java
├── mybatis/                                     ★ 신규 패키지
│   ├── CactusMybatisProperties.java
│   ├── CactusMybatisAutoConfiguration.java
│   └── CactusDefaultDataSourceResolver.java     (oasis DefaultDataSourceResolver 이식)
├── tx/                                          ★ 신규 패키지
│   └── CactusTransactionManagerAutoConfiguration.java
├── oasis/                                       (기존 확장)
│   ├── OasisAutoConfiguration.java              ◇ 수정
│   ├── OasisProperties.java                     ◇ 수정 (dialect 필드 추가)
│   ├── CactusRequestConverter.java              (기존)
│   ├── CactusResponseConverter.java             (기존)
│   ├── OasisServiceExecutor.java                (기존)
│   ├── converter/                               ★ 신규 서브패키지
│   │   ├── MssqlColumnConverter.java            ★ 신규 작성
│   │   └── SqliteColumnConverter.java           ★ 신규 작성
│   ├── loader/                                  ★ 신규 서브패키지
│   │   └── HttpServiceDocumentLoader.java       (film 이식)
│   └── task/MyBatisSqlRunner.java               (film 이식)
│       (message/ 패키지: oasis-core 5.1.0 에 MessageBuilder 인터페이스 없음 — 이식 안 함)
└── (기존 나머지)
```

### 5-2. 핵심 클래스 시그니처 (개요)

#### `CactusDataSourceProperties`

```yaml
cactus:
  datasource:
    secondary:               # 보조 DataSource 1개 (필요 시 활성)
      enabled: false
      driver-class-name: ...
      url: ...
      username: ...
      password: ...
      maximum-pool-size: 10
      auto-commit: false
    # 향후 N 개 확장은 Map<String, ...> 으로 (Phase 3 이후)
```

#### `CactusSecondaryDataSourceAutoConfiguration` (스케치)

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass(HikariDataSource.class)
@ConditionalOnProperty(prefix = "cactus.datasource.secondary", name = "url")
@EnableConfigurationProperties(CactusDataSourceProperties.class)
public class CactusSecondaryDataSourceAutoConfiguration {
    @Bean
    public DataSource cactusSecondaryDataSource(CactusDataSourceProperties props) { ... }
}
```

> primary DataSource 는 **Spring Boot 의 `DataSourceAutoConfiguration`** 가
> 그대로 처리. `cactus.datasource.secondary.*` 가 등장한 경우에만 추가 DataSource
> 빈을 만들어 host 의 EMF/TxMgr 와 충돌 없이 사이드 등록.

#### `CactusMybatisAutoConfiguration` (스케치)

```java
@AutoConfiguration(after = AuditAutoConfiguration.class)   // audit 인터셉터 먼저
@ConditionalOnClass(SqlSessionFactory.class)
@ConditionalOnBean(SqlSessionFactory.class)
@EnableConfigurationProperties(CactusMybatisProperties.class)
public class CactusMybatisAutoConfiguration {

    /** Oasis 가 사용할 기본 DataSourceResolver — primary DataSource 노출. */
    @Bean
    @ConditionalOnClass(name = "com.dongkuk.oasis.jdbc.DefaultDataSourceResolver")
    @ConditionalOnMissingBean(name = "defaultDataSourceResolver")
    public DefaultDataSourceResolver defaultDataSourceResolver(DataSource dataSource) {
        return () -> dataSource;
    }
}
```

> film 의 `BizDataAccessConfig.sqlSessionFactoryBiz` 처럼 *SqlSessionFactory 를
> 직접 만들지 않는다.* 소비 모듈은 `mybatis-spring-boot-starter` 의 기본
> 동작을 그대로 쓰고, cactus 는 **이미 만들어진 SqlSessionFactory 에 인터셉터/리졸버만 첨가**.
> 이렇게 해야 caravan / kmc-core 의 기존 빈 그래프와 충돌 없음.

#### `CactusTransactionManagerAutoConfiguration` (스케치)

```java
@AutoConfiguration(after = HibernateJpaAutoConfiguration.class)
@ConditionalOnProperty(prefix = "cactus.tx", name = "jpa-unified", havingValue = "true")
@ConditionalOnBean(EntityManagerFactory.class)
public class CactusTransactionManagerAutoConfiguration {

    /** 기본 transactionManager 를 JpaTransactionManager 로 명시 등록.
     *  Spring Boot 가 이미 JpaTransactionManager 를 등록하는 경우 ConditionalOnMissingBean
     *  으로 보호 — film 의 txBiz 와 동일 효과 (단일 EMF 환경 한정). */
    @Bean
    @Primary
    @ConditionalOnMissingBean(PlatformTransactionManager.class)
    public PlatformTransactionManager transactionManager(EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
```

> **중요**: multi-EMF 환경(caravan EMF + host EMF)에서는 자동 적용을 피한다.
> `cactus.tx.jpa-unified=true` 는 **단일 EMF** 환경에서만 켜는 옵션. 다중 EMF
> 모듈(mcm 등)은 모듈 자체 `JpaConfig.transactionManager` 를 그대로 유지.

#### `OasisAutoConfiguration` 확장 (스케치)

```java
@AutoConfiguration
@ConditionalOnClass(ServiceStarter.class)
@EnableConfigurationProperties(OasisProperties.class)
public class OasisAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ServiceStarter serviceStarter(OasisProperties props,
                                         ApplicationContext ctx) {
        if (props.isTransactional()) {
            String tmName = props.getTransactionManagerName(); // 기본 "transactionManager"
            SpringServiceStarterFactory f = new SpringServiceStarterFactory(ctx, new String[]{tmName});
            // ServiceProvider 등은 OasisProperties.serviceGroup/servicePath 기반으로 구성
            return f.generateServiceStarter();
        }
        return new NonTransactionalServiceStarterFactory().generateServiceStarter();
    }

    @Bean
    @ConditionalOnProperty(prefix = "cactus.oasis", name = "dialect", havingValue = "mssql")
    public ColumnConverter mssqlColumnConverter() { return new MssqlColumnConverter(); }

    @Bean
    @ConditionalOnProperty(prefix = "cactus.oasis", name = "dialect", havingValue = "sqlite")
    public ColumnConverter sqliteColumnConverter() { return new SqliteColumnConverter(); }

    // Oracle Converter 는 미결 #5 결정사항에 따라 이식하지 않음

    @Bean
    @ConditionalOnBean(SqlSession.class)
    @ConditionalOnMissingBean(SqlRunner.class)
    public SqlRunner sqlRunner(SqlSession sqlSession) {
        return new MyBatisSqlRunner(sqlSession);
    }

    // MessageBuilder 빈 등록은 제거됨 (2026-05-12) — oasis-core 5.1.0 에 인터페이스 없음
}
```

---

## 6. 프로퍼티 스키마

```yaml
# ===== Cactus 데이터 액세스 통합 =====
cactus:
  # 보조(secondary) DataSource — 다중 DB 환경에서만 활성
  datasource:
    secondary:
      enabled: false                      # 기본 false. true 일 때만 빈 생성.
      driver-class-name: net.sourceforge.jtds.jdbc.Driver
      url: jdbc:jtds:sqlserver://...
      username: ...
      password: ...
      maximum-pool-size: 10
      auto-commit: false

  jpa:
    # film 의 SnakePhysicalNamingStrategy 자동 적용 여부 (host EMF)
    snake-naming:
      enabled: true                       # 기본 true (cactus 도입 모듈의 합의된 컨벤션)
    # 보조 EMF (보조 DataSource 가 활성일 때만 의미)
    secondary:
      enabled: false
      packages-to-scan:
        - com.example.legacy
      hibernate:
        dialect: org.hibernate.dialect.SQLServerDialect
        ddl-auto: none

  mybatis:
    # MasterCode 인터셉터 활성화 (MasterCodeDecoder 빈 있을 때만 실 적용)
    master-code-decoding:
      enabled: true                       # 기본 true

  tx:
    # 단일 EMF 환경에서만 사용. 다중 EMF(예: mcm + caravan) 모듈에서는 false 유지.
    jpa-unified: false

  oasis:
    transactional: false                  # film 처럼 트랜잭션 ServiceStarter 가 필요하면 true
    transaction-manager-name: transactionManager   # 기본 host transactionManager
    dialect: mssql                         # mssql | sqlite | none  (oracle: 현재 미지원 — 미결 #5 결정사항)
    service-group: app                     # 기존 키 유지
    service-path: resources/services       # 명시 시 FileSystemFileServiceLoader 사용
    service-loader-url:                    # 명시 시 HttpServiceDocumentLoader 사용 (URL 과 PATH 동시 지정 금지)
```

### 6-1. 환경별 권장 조합 (개발계/운영계 분리)

| 프로파일 | `spring.datasource.*` | `cactus.oasis.dialect` | `cactus.tx.jpa-unified` | 보조 DS |
|---|---|---|---|---|
| `local`(단독) | SQLite (LocalSqliteDataSource 가 처리) | `sqlite` | false (보통) | 보통 미사용 |
| `local,mssql` | MSSQL 로컬 인스턴스 | `mssql` | false | 미사용 |
| `dev` | MSSQL 개발 DB | `mssql` | true (옵션) | 필요 시 |
| `prod` | MSSQL 운영 DB | `mssql` | true (옵션) | 필요 시 (ERP 등) |

---

## 7. 빈 등록 흐름 & Conditional 매트릭스

```
Spring Boot 기본 라이프사이클
  └─ DataSourceAutoConfiguration                  (spring.datasource.*)
     └─ HibernateJpaAutoConfiguration              (단일 EMF)
        └─ MybatisAutoConfiguration                (소비 모듈 starter)
           ├─ AuditAutoConfiguration              (cactus 기존)
           │   ├─ SqlLoggingInterceptor 등록      (#1 — 로깅 최외곽)
           │   └─ CactusMybatisAuditInterceptor   (#2 — audit 컬럼 주입)
           ├─ MasterCodeMybatisAutoConfiguration  (cactus 신규)
           │   └─ MasterCodeMybatisInterceptor    (#3 — 결과 디코딩)
           └─ CactusMybatisAutoConfiguration      (cactus 신규)
               └─ defaultDataSourceResolver        (oasis 입력)
         └─ HibernateCustomizerAutoConfiguration   (Snake naming)
         └─ OasisAutoConfiguration                 (확장됨)
             ├─ ServiceStarter (transactional + ServiceProvider 분기)
             ├─ ColumnConverter (dialect 분기)
             └─ SqlRunner (MyBatis SqlSession 존재 시)
   [옵셔널]
   ├─ CactusSecondaryDataSourceAutoConfiguration   (cactus.datasource.secondary.url)
   ├─ CactusSecondaryJpaAutoConfiguration           (cactus.jpa.secondary.enabled)
   └─ CactusTransactionManagerAutoConfiguration     (cactus.tx.jpa-unified=true)
```

**MyBatis 인터셉터 실행 순서**(MyBatis 는 `addInterceptor` 호출 *역순* 으로
체인을 감싼다 → 위 등록 순서대로 #1 → #3 이 외곽 → 내곽 적용된다).

| 순서 | 인터셉터 | 역할 |
|---|---|---|
| outer | `SqlLoggingInterceptor` | 모든 호출 로깅 |
| mid | `CactusMybatisAuditInterceptor` | INSERT/UPDATE 파라미터에 audit 값 주입 |
| inner | `MasterCodeMybatisInterceptor` | SELECT 결과의 LoV / `_CD_NM` 디코딩 |

> **주의**: 위 등록 순서는 **AutoConfiguration 의 `@AutoConfiguration(after=...)`
> 로 보장**한다. 현재 `AuditAutoConfiguration` 은 안에서 `MybatisAuditAutoConfiguration`,
> `MybatisSqlLoggingAutoConfiguration` 을 별도 static config 로 등록 중 — 신규
> `MasterCodeMybatisAutoConfiguration` 은 `@AutoConfiguration(after = AuditAutoConfiguration.class)`
> 로 명시.

---

## 8. MSSQL/SQLite Dialect 매핑

### 8-1. ColumnConverter 책임

`com.dongkuk.oasis.jdbc.ColumnConverter` 는 `ResultSet` 의 컬럼을 Map/Bean
으로 채울 때 `(java.sql.Types int, Object raw) → Object normalized` 변환을
담당. cactus 는 MSSQL/SQLite 두 dialect 에 대한 구현만 제공
(미결 #5 결정사항 — Oracle 은 현재 환경에 없어 이식 안 함).

### 8-2. MSSQL 용 규칙 (`MssqlColumnConverter`)

| `java.sql.Types` | 원본 클래스 (JDBC: mssql-jdbc / jTDS) | 변환 결과 |
|---|---|---|
| `DATE` | `java.sql.Date` | `LocalDate` |
| `TIME` | `java.sql.Time` | `LocalTime` |
| `TIMESTAMP` | `java.sql.Timestamp` | `Instant` |
| `TIMESTAMP_WITH_TIMEZONE`(`-101`) | `microsoft.sql.DateTimeOffset` 또는 `OffsetDateTime` | `OffsetDateTime.toInstant()` |
| `BIT` | `Boolean` | 그대로 |
| `NCHAR/NVARCHAR` | `String` | 그대로 |
| `MONEY/SMALLMONEY`(`-148/-149`) | `BigDecimal` | 그대로 |

### 8-3. SQLite 용 규칙 (`SqliteColumnConverter`)

**미결 #3 결정사항 반영 (2026-05-12)**: 옵션 A — **최소 변환**.

SQLite JDBC(`org.sqlite.JDBC`) 는 type affinity 가 약하다.
`ResultSetMetaData.getColumnType()` 은 **declared type** 을 반환하며,
실제 코드베이스 점검 결과:
- 모든 SQLite 마이그레이션 SQL 27개에서 컬럼 declared type 명시 (`Types.NULL`(0) 사실상 발생 안 함)
- 시간 컬럼(`C_AT`, `U_AT` 등)은 모두 **`TEXT`** 로 선언 → `getColumnType()` = `Types.VARCHAR`(12)

따라서 변환 규칙:

| `getColumnType()` | 원본 | 변환 결과 |
|---|---|---|
| `Types.BOOLEAN` (16) | `Integer` 0/1 | `Boolean` |
| `Types.DATE` (91) — 드문 케이스 | `java.sql.Date` 또는 `String` | `LocalDate` (실패 시 원본) |
| `Types.TIMESTAMP` (93) — 드문 케이스 | `Timestamp` 또는 `String` | `Instant` (실패 시 원본) |
| **`Types.VARCHAR` (12) — 시간 컬럼 포함** | `String` | **그대로 String** (← 가장 흔한 케이스) |
| **`Types.NULL` (0) / 그 외** | 원본 | **그대로 반환** |

> **SQLite 로컬 환경의 알려진 제약**: 시간 컬럼이 `TEXT` 로 선언되어 있으면
> 운영(MSSQL `Timestamp` → `Instant`)과 달리 *String 으로 반환됨*. 화면/도메인
> 코드가 이 차이를 받아들이는 현재 동작을 그대로 유지. cactus 가 그 차이를
> 마법으로 메우려 시도하지 않는다.

### 8-4. `DialectDetector` 동작

`spring.datasource.url` 또는 `spring.datasource.driver-class-name` 으로
자동 추정. `cactus.oasis.dialect` 가 명시되어 있으면 그것을 우선.

```
jdbc:sqlserver://...        → mssql
jdbc:jtds:sqlserver:...      → mssql
jdbc:sqlite:...              → sqlite
그 외 (oracle 포함)          → "none" (Converter 미등록)
```

> DialectDetector 는 yml 에서 명시 지정하지 못한 환경(테스트 등)을 위한
> 보조. AutoConfiguration 의 `@ConditionalOnProperty` 는 명시 값을 우선
> 사용하고, *미명시*일 때만 detector 의 결과를 EnvironmentPostProcessor 로
> `cactus.oasis.dialect` 에 주입(Phase 5 에서 검토).

---

## 9. 다중 DataSource 지원 패턴

### 9-1. 단순 보조 1개 (Phase 1 범위)

```yaml
spring:
  datasource:                 # primary
    url: jdbc:sqlserver://prod-mcm/...
    username: ...
cactus:
  datasource:
    secondary:
      enabled: true
      url: jdbc:sqlserver://erp-readonly/...
      driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
      username: erp_ro
      maximum-pool-size: 5
  jpa:
    secondary:
      enabled: true
      packages-to-scan: [ com.example.erp.entity ]
      hibernate:
        dialect: org.hibernate.dialect.SQLServerDialect
```

→ 결과 빈:
- primary: `dataSource`(Spring Boot 기본), `entityManagerFactory`, `transactionManager`
- secondary: `cactusSecondaryDataSource`, `cactusSecondaryEntityManagerFactory`, `cactusSecondaryTransactionManager`

### 9-2. N개 보조 (Phase 3 이후 — 본 플랜에서는 미포함)

`Map<String, DataSourceProps>` 로 동적 등록. caravan 이 이미 자체 패턴을 갖고
있으므로 cactus 가 강제하지 않고, 필요 시 Phase 3 별도 RFC 로 분리.

### 9-3. 개발계/운영계 분리

여러 환경의 DB 가 다른 것은 **환경별 yml** 로 해결 (Spring Boot 표준 패턴).
cactus 자동설정의 분기 대상이 아님 — 즉 아래처럼 운영.

```
application.yml           # 공통, placeholder
application-local.yml     # SQLite override (LocalSqliteDataSource 가 자동)
application-mssql.yml     # MSSQL 로컬 인스턴스
application-dev.yml       # MSSQL 개발 DB
application-prod.yml      # MSSQL 운영 DB
```

---

## 10. JpaTransactionManager + MyBatis 트랜잭션 통합

### 10-1. 원리

`JpaTransactionManager` 는 내부적으로 `EntityManager` 의 `Connection` 을
`DataSourceUtils` 를 통해 노출하므로, **같은 DataSource 를 쓰는 MyBatis
SqlSession 은 자동으로 같은 트랜잭션에 묶인다**(film 의 통합 모드).

→ 별도 `DataSourceTransactionManager` 를 두지 않아도 MyBatis 호출이
`@Transactional` 메서드 안에서 같은 트랜잭션을 공유.

### 10-2. 강제 활성 조건

`cactus.tx.jpa-unified=true` 일 때만 `CactusTransactionManagerAutoConfiguration`
가 `@Primary PlatformTransactionManager` 를 `JpaTransactionManager` 로 명시
등록. **다중 EMF 환경** 에서는 host EMF 가 어느 것인지 모호하므로 자동 적용
금지 — 모듈이 자체 `transactionManager` 빈을 정의해야 함(현재 mcm/mpp 가
이미 그렇게 함).

### 10-3. Spring Boot 4.x 의 자동설정과의 관계

Spring Boot 가 단일 EMF 환경에서는 이미 `JpaTransactionManager` 를 자동
등록한다. 따라서 본 AutoConfig 의 효용은 **명시적 활성화 신호** + 추후
모듈이 secondary EMF 를 추가해도 `@Primary` 가 흔들리지 않도록 고정하는
방어 효과.

### 10-4. 다중 DataSource 환경에서의 동기화 한계 (미결 #4 결정사항 반영)

`JpaTransactionManager` 의 동기화는 **단일 DataSource 단위**로 동작.
`TransactionSynchronizationManager` 가 `dataSource` 를 key 로 connection 을
bind 하므로:

| 시나리오 | MyBatis 호출의 트랜잭션 동기화 |
|---|---|
| primary DS 만 사용 | ✅ 자동. cactus 가 별도 설정 없이 보장. |
| primary DS + secondary DS, MyBatis 가 primary 만 호출 | ✅ primary 쪽 자동 동기화. secondary 는 호출 안 되어 무관. |
| primary DS + secondary DS, MyBatis 가 secondary 도 호출 | ⚠️ secondary 쪽은 별도 `SqlSessionFactory` + `cactusSecondaryTransactionManager` 와 함께 *소비 모듈이 자체 구성* 필요. cactus 의 자동설정 범위 밖. |

→ cactus 는 **primary DS 의 트랜잭션 자동 동기화만 보장**. secondary DS 의
MyBatis 호출이 필요한 모듈은 직접 `@Bean SqlSessionFactory secondarySqlSessionFactory`
를 정의하고 `@Transactional(transactionManager = "cactusSecondaryTransactionManager")`
로 명시적 트랜잭션을 시작해야 함.

---

## 11. Oasis 통합 확장 상세

### 11-1. ServiceStarter — transactional × ServiceProvider 분기

이 절이 본 마이그레이션의 **가장 핵심 작업**이다. 현재 cactus 의
`OasisAutoConfiguration#serviceStarter()` 는 `NonTransactionalServiceStarterFactory()`
만 호출 → 트랜잭션 없는 ServiceStarter + oasis-core 기본 ServiceProvider 사용.
film 의 `OasisConfig` 처럼 **(a) 트랜잭션 vs 비트랜잭션** 과 **(b) ServiceProvider
로딩 위치(URL/PATH/기본)** 두 축으로 분기시킨다.

#### 분기 매트릭스 (미결 #6/#7 + R-11 검증 결과 반영 — 2026-05-12)

R-11 jar 검증 결과: **`NonTransactionalServiceStarterFactory` 에는 `setServiceProvider`
메서드 없음**. `setServiceDocumentDirectory(String)` + `setFileDescriptionDelimiter(String)`
만 노출. `SpringServiceStarterFactory` 만 `setServiceProvider(ServiceProvider)` 보유.

→ **URL 모드(`HttpServiceDocumentLoader` 주입)는 transactional 모드에서만 사용 가능**.
→ PATH 모드는 두 factory 모두 `setServiceDocumentDirectory(servicePath)` 로 단순화.

|  | `service-loader-url` 명시 | URL 미명시 (PATH 기본/명시) |
|---|---|---|
| `transactional=false` | **예외 throw** — "URL 모드는 cactus.oasis.transactional=true 필요" | `NonTransactionalServiceStarterFactory` + `setServiceDocumentDirectory(servicePath)` |
| `transactional=true` | `SpringServiceStarterFactory(ctx,[tmName])` + `setServiceProvider(GenericServiceProvider(HttpServiceDocumentLoader))` | `SpringServiceStarterFactory(ctx,[tmName])` + `setServiceDocumentDirectory(servicePath)` |

#### 코드 스케치

```java
@Bean
@ConditionalOnMissingBean
public ServiceStarter serviceStarter(OasisProperties props,
                                     ApplicationContext ctx) {

    String url  = props.getServiceLoaderUrl();
    String path = props.getServicePath();   // 기본 "resources/services"

    if (props.isTransactional()) {
        String tmName = props.getTransactionManagerName();   // 기본 "transactionManager"
        SpringServiceStarterFactory factory =
                new SpringServiceStarterFactory(ctx, new String[]{tmName});

        if (url != null) {
            log.info("Oasis: HTTP 원격 BPMN 로더 사용 — {}", url);
            factory.setServiceProvider(new GenericServiceProvider(
                    new CamundaBpmnServiceUnmarshaller(),
                    new HttpServiceDocumentLoader(url, 10)));
        } else {
            log.info("Oasis: 파일 시스템 BPMN 로더 사용 — {}", path);
            factory.setServiceDocumentDirectory(path);
        }
        return factory.generateServiceStarter();
    }

    // non-transactional
    if (url != null) {
        throw new IllegalStateException(
                "cactus.oasis.service-loader-url 은 cactus.oasis.transactional=true 일 때만 사용 가능합니다. " +
                "oasis-core 5.1.0 의 NonTransactionalServiceStarterFactory 는 setServiceProvider 미지원.");
    }
    log.info("Oasis: NonTransactional 파일 시스템 BPMN 로더 — {}", path);
    NonTransactionalServiceStarterFactory factory =
            new NonTransactionalServiceStarterFactory();
    factory.setServiceDocumentDirectory(path);
    return factory.generateServiceStarter();
}
```

#### film 과의 차이점

| 항목 | film | cactus |
|---|---|---|
| 프로파일 분기 | `@Profile({"local","localtst"})` 와 `@Profile({"tst","prd"})` 로 *static config* 분리 | 단일 메서드 + 프로퍼티 분기. 프로파일 분리는 yml 측면에서. |
| 환경변수 이름 | `dmes.film.db.frm.service.loader.url`, `dmes.film.db.frm.service.path` | `cactus.oasis.service-loader-url`, `cactus.oasis.service-path` |
| 둘 다 미설정 시 | `SimpleServiceProvider("/services","bpmn","^^")` 명시 등록 | servicePath 기본값(`"resources/services"`)이 항상 채워져 있어 PATH 분기 발동 — `CamundaBpmnServiceProvider(FileSystemFileServiceLoader)` (미결 #6/#7 결정) |
| TX 매니저 이름 | `txBiz` 하드코딩 | `cactus.oasis.transaction-manager-name` (기본 `transactionManager`) |
| URL/PATH 동시 명시 시 | 예외 throw | URL 우선 + PATH 무시 (servicePath 가 항상 기본값으로 채워져 충돌 검출 의미 없음) |

### 11-2. ColumnConverter dialect 분기

위 §8 참고. `cactus.oasis.dialect` 가 `none` 또는 미설정이면 ColumnConverter
빈을 등록하지 않는다(oasis-core 가 기본 변환 사용).

### 11-3. SqlRunner

- `MyBatisSqlRunner` 는 SqlSession 빈 존재 시 등록.
- oasis-core 5.1.0 에는 `JdbcTemplateSqlRunner` 도 기본 제공 — JdbcTemplate 빈 있고 SqlSession 없으면 fallback 으로 활용 가능. 다만 cactus 의 MyBatis-centric 컨벤션상 `MyBatisSqlRunner` 가 우선.

> **MessageBuilder 는 제거됨 (2026-05-12)**: oasis-core 5.1.0 에 `com.dongkuk.oasis.message.MessageBuilder` 인터페이스가 없음 (4.18.1 → 5.1.0 에서 삭제). 5.1.0 에는 구체 클래스 `SerializedMessageObjectMessageBuilder` 만 존재. film 의 `SnakeCaseInsensitiveMessageBuilder` 이식은 컴파일 실패 → **이식 자체 취소**. 현재 cactus 가 messageBuilder 빈을 사용하지 않으므로 기능 손실 없음.

**트랜잭션 동기화 (미결 #4 결정사항)**: `MyBatisSqlRunner` 가 주입받는 `SqlSession`
빈은 mybatis-spring-boot-starter 의 기본 빈으로, **primary DataSource 와 묶임**.
`cactus.oasis.transactional=true` 모드에서 Oasis 서비스가 시작한 트랜잭션은
`JpaTransactionManager` 를 통해 primary DS connection 을 bind 하고, `MyBatisSqlRunner`
의 SqlSession 은 같은 connection 을 자동으로 공유 → 동일 트랜잭션 보장. **단일
DS 환경 / primary DS 의 쿼리에 한정** (다중 DS 환경에서 secondary DS 호출은 §10-4
참고).

**SqlSession 빈 이름 주의**: 소비 모듈이 빈 이름을 커스텀(예: `sqlSessionBiz`)으로
변경하면 cactus 의 `@Autowired SqlSession` 주입이 실패. 권장은 mybatis-spring-boot-starter
의 기본 이름(`sqlSession`)을 그대로 사용. 부득이 변경해야 한다면 `@Bean SqlSession
sqlSession` 으로 alias 추가.

### 11-4. HttpServiceDocumentLoader

film 의 `cmn.oasis.loader.HttpServiceDocumentLoader` 를 cactus 의
`oasis/loader/` 로 *재작성 이식* (미결 #8 결정사항). HTTP GET 으로 BPMN XML 을
가져와 oasis 의 `GenericServiceProvider` 입력으로 사용. 생성자 시그니처는 보존:
`(String serviceUri, int timeoutSecond)`. `serviceUri` 의 `{serviceId}` 토큰은
런타임에 실제 serviceId 로 치환.

**HTTP 클라이언트**: **JDK 21 의 `java.net.http.HttpClient`** 사용. film 의
Apache HttpClient 4.x 의존을 cactus 로 가져오지 않음 (라이브러리 추가 0,
HttpClient 4.x EOL 회피).

```java
public class HttpServiceDocumentLoader implements ServiceDocumentLoader {
    private final HttpClient client;
    private final String serverUri;
    private final Duration timeout;

    public HttpServiceDocumentLoader(String serviceUri, int timeoutSecond) {
        this.timeout = Duration.ofSeconds(timeoutSecond);
        this.client = HttpClient.newBuilder()
                .connectTimeout(timeout)
                .followRedirects(HttpClient.Redirect.NORMAL)
                .build();
        this.serverUri = serviceUri;
    }

    @Override
    public String serviceDocument(String serviceId) {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(serverUri.replace("{serviceId}", serviceId)))
                .timeout(timeout)
                .GET()
                .build();
        try {
            HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
            int status = response.statusCode();
            if (status >= 200 && status < 300) return response.body();
            throw new ServiceLoadException("Status : " + status);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ServiceLoadException(e);
        } catch (IOException e) {
            throw new ServiceLoadException(e);
        }
    }
}
```

### 11-5. TopicLoader / TopicStructureLoader

**oasis-core 5.1.0 에서 제거됨** (2026-05-12 jar 검증). 4.18.1 의 SPI 였으나
5.1.0 에는 인터페이스 자체가 없음. film 의 `FilmTopicLoader` / `FilmTopicStructureLoader`
는 이식 대상 아니며, 소비 모듈 측 SPI 위임 가이드도 제거.

---

## 12. 빌드(build.gradle) 변경

`src/backend/cactus-core/build.gradle` 에 추가:

```gradle
dependencies {
    // 기존 라인은 유지

    // ── DataSource (Hikari) ──
    // primary 는 소비 모듈이 spring-boot-starter-jdbc 로 가져오지만,
    // CactusSecondaryDataSource 빈에서 Hikari API 사용을 위해 compileOnly 권장.
    compileOnly 'com.zaxxer:HikariCP'

    // ── JDBC 드라이버 (테스트 전용) ──
    testRuntimeOnly 'com.microsoft.sqlserver:mssql-jdbc'        // MSSQL 통합테스트
    testRuntimeOnly 'org.xerial:sqlite-jdbc'                    // SQLite 통합테스트

    // ── MyBatis (인터셉터 + SqlRunner) ──
    // 기존: compileOnly 'org.mybatis:mybatis:3.5.16' — 유지
    // MasterCodeMybatisInterceptor, MyBatisSqlRunner 에서 사용.

    // ── Hibernate API (PhysicalNamingStrategy) — 추가 의존 불필요 ──
    // 기존 'compileOnly org.springframework.boot:spring-boot-starter-data-jpa' 가
    // hibernate-core 를 transitive 로 가져옴 → org.hibernate.boot.model.naming.PhysicalNamingStrategy
    // 및 HibernatePropertiesCustomizer(spring-boot-autoconfigure 안에 포함) 컴파일 가용.

    // ── Guava CaseFormat 회피 ──
    // film 의 CaseConverter 는 Guava 의존이지만, cactus 는 CaseConverter 를
    // JDK 만으로 자체 작성 (변환 메서드 ~15줄). Guava 의존 추가 안 함.

    // ── Oasis (이미 api 'com.dongkuk:oasis-core:5.1.0') ──
    // ColumnConverter, SqlRunner, ServiceStarter, ServiceProvider, Loader 모두 oasis 5.1.0 패키지.

    // ── HTTP 클라이언트 ──
    // HttpServiceDocumentLoader 는 JDK 21 의 java.net.http.HttpClient 사용 (미결 #8 결정).
    // Apache HttpClient / OkHttp / Spring RestClient 모두 추가하지 않음.
}
```

> Oracle JDBC 드라이버는 추가하지 않는다. `OracleColumnConverter` 자체를
> 이식하지 않기로 결정 (미결 #5, 2026-05-12).

---

## 13. AutoConfiguration.imports 변경

`src/backend/cactus-core/src/main/resources/META-INF/spring/
org.springframework.boot.autoconfigure.AutoConfiguration.imports` 에 추가
(순서는 의미 없음 — Spring 이 `@AutoConfiguration(after=...)` 로 정렬):

```
com.dongkuk.dmes.cactus.autoconfigure.CactusAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.SecurityAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.CactusAuthAutoConfiguration
com.dongkuk.dmes.cactus.autoconfigure.CactusWebSecurityAutoConfiguration
com.dongkuk.dmes.cactus.audit.AuditAutoConfiguration
com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration
com.dongkuk.dmes.cactus.web.inbound.InboundAutoConfiguration
com.dongkuk.dmes.cactus.web.inbound.MasterCodeCacheAutoConfiguration
com.dongkuk.dmes.cactus.mastercode.MasterCodeJpaAutoConfiguration
# ─── 신규 ───
com.dongkuk.dmes.cactus.mastercode.MasterCodeMybatisAutoConfiguration
com.dongkuk.dmes.cactus.mybatis.CactusMybatisAutoConfiguration
com.dongkuk.dmes.cactus.jpa.CactusHibernateCustomizerAutoConfiguration
com.dongkuk.dmes.cactus.jpa.CactusSecondaryJpaAutoConfiguration
com.dongkuk.dmes.cactus.datasource.CactusSecondaryDataSourceAutoConfiguration
com.dongkuk.dmes.cactus.tx.CactusTransactionManagerAutoConfiguration
```

---

## 14. 단계별 작업 (Phase)

### Phase 1 — Foundation (**완료 — 2026-05-12**)

목표: 클래스 이식 + 기본 자동설정 골격. 소비 모듈 zero-impact.

- [x] `jpa/SnakePhysicalNamingStrategy` 이식 — film 코드 그대로 (jakarta 영향 없음)
- [x] `jpa/CactusJpaProperties` 신규 — `cactus.jpa.snake-naming.enabled` 바인딩
- [x] `jpa/CactusHibernateCustomizerAutoConfiguration` 신규 — Spring Boot 4 의 새 패키지 `org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer` 사용
- [x] `mastercode/MasterCodeDecoder` 인터페이스 신규
- [x] `mastercode/DefaultMasterCodeDecoder` 신규 — `MasterCodeItemRepository` 기반
- [x] `mastercode/MasterCodeMybatisInterceptor` 이식 — film 의 Map 디코딩 로직 이식. **`Lov` 분기는 생략** (cactus.web.inbound.Lov 가 immutable 이라 setDisplayValue 불가)
- [x] `mastercode/MasterCodeMybatisAutoConfiguration` 신규 — `@AutoConfiguration(after = AuditAutoConfiguration.class)`
- [x] `oasis/converter/MssqlColumnConverter` 신규 (§8-2 규칙). `microsoft.sql.DateTimeOffset` 직접 의존 회피 — `OffsetDateTime` 만 처리
- [x] `oasis/converter/SqliteColumnConverter` 신규 (§8-3 규칙, 미결 #3 최소 변환)
- [x] `oasis/loader/HttpServiceDocumentLoader` 신규 — JDK 21 `java.net.http.HttpClient` 사용 (미결 #8)
- [x] `oasis/util/CaseConverter` 신규 — JDK 만 사용 (Guava 회피)
- [x] `oasis/task/MyBatisSqlRunner` 이식 — film 로직 보존, CaseConverter 자체 사용
- [x] `oasis/OasisProperties` 수정 — `serviceLoaderUrl`, `transactionManagerName`, `dialect` 필드 추가
- [x] `oasis/OasisAutoConfiguration` 수정 — transactional × ServiceProvider 분기 (§11-1 매트릭스 그대로 구현), ColumnConverter dialect 분기, SqlRunner 빈 추가
- [x] **oasis-core 5.1.0 의 `NonTransactionalServiceStarterFactory` API 검증 완료** (R-11 해소, javap 결과)
- [x] `AutoConfiguration.imports` 갱신 — `MasterCodeMybatisAutoConfiguration`, `CactusHibernateCustomizerAutoConfiguration` 추가
- [x] **컴파일 + 테스트 통과 확인** (gradle compileJava + test 모두 성공)

> ~~`OasisServiceExecutor` 가 `OasisProperties` 를 주입받지 않는 결손 점검~~ — Phase 1 작업 결과 **수정 불필요** 판정. `OasisAutoConfiguration#serviceStarter()` 가 servicePath 를 직접 `setServiceDocumentDirectory()` 로 전달하므로 OasisServiceExecutor 는 ServiceStarter 만 사용하면 됨. R-15 도 사실상 해소.
>
> ~~`oasis/message/SnakeCaseInsensitiveMessageBuilder` 이식~~ — 취소 유지 (oasis-core 5.1.0 인터페이스 부재)
>
> 단위 테스트는 Phase 1 범위 외 (Phase 6 파일럿에서 통합 검증).

### Phase 2 — (제거됨, 미결 #5 결정사항)

~~Oracle Converter 호환 이식~~ — 현재 aps 환경에 Oracle 사용처가 없으므로
이식 자체를 하지 않기로 결정 (2026-05-12). 미래에 Oracle 환경이 등장하면
`compileOnly 'com.oracle.database.jdbc:ojdbc11'` + `@ConditionalOnClass(name="oracle.sql.TIMESTAMP")`
가드 패턴으로 별도 작업.

### Phase 3 — DataSource / EMF 보조 등록 (**완료 — 2026-05-13**)

- [x] `datasource/CactusDataSourceProperties` 신규 — `cactus.datasource.secondary.*` 바인딩
- [x] `datasource/DialectDetector` 신규 — URL/driver 기반 mssql/sqlite/none 분류
- [x] `datasource/CactusSecondaryDataSourceAutoConfiguration` 신규 — `cactus.datasource.secondary.url` 명시 시만 활성. HikariDataSource 직접 생성
- [x] `jpa/CactusSecondaryJpaAutoConfiguration` 신규 — `cactus.jpa.secondary.enabled=true` + 보조 DataSource 빈 존재 시 활성. snake-naming 도 동일 옵션 사용
- [x] `jpa/CactusJpaProperties` 확장 — `Secondary` 섹션 추가
- [x] `mybatis/CactusMybatisProperties` 신규
- [x] `mybatis/CactusMybatisAutoConfiguration` 신규 — `DefaultDataSourceResolver` 빈 자동 등록
- [x] `AutoConfiguration.imports` 갱신 — 4개 추가
- [x] **컴파일 + 부팅 검증 통과** (mcm bootRun 17.127초, ERROR/WARN 0건)
- [ ] (옵션) 통합 테스트: 실제 보조 DS 활성 시나리오 — Phase 6 파일럿에서 검토

### Phase 4 — TX 통합 모드 + Oasis Transactional (**완료 — 2026-05-13**)

- [x] `tx/CactusTransactionManagerAutoConfiguration` 신규 — `cactus.tx.jpa-unified=true` + `@ConditionalOnSingleCandidate(EntityManagerFactory.class)` 가드. `@Primary` 명시
- [x] `OasisAutoConfiguration` 의 transactional 분기 동작 검증 — Phase 1 에 이미 구현, 부팅 시 `non-transactional` 분기 정상 로그 확인
- [x] AutoConfiguration.imports 갱신
- [x] **컴파일 + 부팅 검증 통과** (mcm bootRun 11.899초, ERROR/WARN 0건)
- [ ] (옵션) `cactus.tx.jpa-unified=true` 통합 트랜잭션 통합 테스트 — Phase 6 파일럿 이후 검토

### Phase 5 — DialectDetector 자동주입 (옵션, 0.5일)

- [ ] `EnvironmentPostProcessor` 로 `spring.datasource.url` 기반 `cactus.oasis.dialect` 자동 주입 (명시값 우선)
- [ ] 명시 vs 자동 우선순위 테스트

### Phase 6 — 소비 모듈 파일럿 + JpaConfig 정리 (**완료 — 2026-05-13**)

**6-A. mpp / mqc 의 `JpaConfig` 삭제**
- [x] `mpp/api/.../config/JpaConfig.java` 삭제 — `application-local.yml` 의 `spring.jpa.*` 가 그대로 동작
- [x] `mqc/api/.../config/JpaConfig.java` 삭제 — 동일
- [x] `MppApplication`, `MqcApplication` 에 `@EntityScan(basePackages = {"com.dongkuk.dmes.cactus", "com.dongkuk.dmes.{mpp|mqc}"})` 추가 — 기존 JpaConfig.setPackagesToScan 책임 흡수
- [x] **부팅 검증**: mpp 7.523초, mqc 9.107초 (ERROR 0건, SQLite "table already exists" 는 ddl-auto=update 의 알려진 경고)

**6-B. mcm 파일럿** (caravan 선행 작업 완료 상태에서 진행)
- [x] (선행 완료) cactus-core / McmApplication / mcm api yml 에서 caravan 제거 확인됨
- [x] `mcm/api/.../config/JpaConfig.java` 삭제 — McmApplication 의 기존 `@EntityScan` 이 cactus.security.auth 만 포함했지만, cactus 의 `MasterCodeJpaAutoConfiguration` 의 자체 `@EntityScan(basePackages="com.dongkuk.dmes.cactus.mastercode")` 가 Spring Boot 자동 EMF 와 통합되어 자동 인식
- [x] `application-local.yml` 의 `spring.jpa.*` 가 그대로 동작
- [x] **부팅 검증**: mcm 15.663초 (Cactus Oasis 분기 로그 정상, ERROR 0건)
- [x] `KmcTopicInfoEntity` 임시 매핑 동작 점검 (default EMF 에서 정상 매핑)

**6-C. mybatis 측면**
- [x] **`MasterCodeDecoder` 빈 정책 (가이드)**: 기본은 cactus 제공 `DefaultMasterCodeDecoder` (`MasterCodeItemRepository` 기반) 사용. 모듈 고유 디코딩 룰(외부 시스템 마스터 코드 등)이 있는 경우만 `@Bean MasterCodeDecoder` 로 override → cactus 의 `@ConditionalOnMissingBean` 가 빈 충돌 회피
- [ ] (옵션) 모듈 자체 `mybatis-config.xml` 의 인터셉터 중복 등록 점검 — 본 plan 범위에서는 mybatis-config.xml 의 인터셉터가 없으므로 작업 없음 (cactus 가 자동 등록)

### Phase 7 — 문서화 + 릴리스 (**완료 — 2026-05-13**)

- [x] `docs/cactus/usage-guide.md` 작성 — 의존성/yml/매트릭스/FAQ/마이그레이션 절차
- [x] `cactus-core/CHANGELOG.md` 신설 — 1.0.19-SNAPSHOT 변경 내역 전체
- [x] `cactus-core/build.gradle` version `1.0.18-SNAPSHOT` → **`1.0.19-SNAPSHOT`**
- [x] `cactus-core-1.0.19-SNAPSHOT.jar` 빌드 검증 (`./gradlew clean build` 통과)
- [x] **Nexus snapshots 배포 완료** — `publishMavenJavaPublicationToSnapshotsRepository` 통과 (`http://172.31.1.96:8889/nexus/.../snapshots/`)

---

## 15. 소비 모듈 영향 및 마이그레이션 가이드

### 15-1. 영향 매트릭스

| 모듈 | 기존 부분 | cactus 통합 후 | 작업 필요? |
|---|---|---|---|
| mcm/api | 자체 `JpaConfig` (transactionManager, naming은 기본) | naming-strategy 자동 적용. TxMgr는 기존 유지. | **권장: yml 만 추가, 코드 무수정** |
| mpn/api, mpp/api, mqc/api | 비슷 | 동일 | 동일 |
| serai | DataSource/JPA 자체 처리 + caravan | secondary DS 패턴 활용 가능 | 선택적 |
| caravan 자체 | KafkaJpaConfig 자체 EMF | 변경 없음 | 무관 |
| 신규 모듈 (예: ERP 라우터) | 새로 작성 | cactus.* 만 설정하면 빈 그래프 자동 구성 | **이상적** |

### 15-2. 권장 yml (mcm 예시)

```yaml
cactus:
  oasis:
    dialect: mssql
    transactional: false       # 현재 mcm 은 non-transactional 유지
  jpa:
    snake-naming:
      enabled: true             # mcm-core 의 기존 컬럼명과 일치하는지 사전 확인 필요
```

### 15-3. `JpaConfig` 삭제 가이드 (옵션 A — 미결 #2 결정사항)

#### 15-3-1. mpp / mqc — 즉시 적용 가능

caravan 의존 없음 → 단일 EMF → `JpaConfig` 클래스 완전 삭제.

**삭제할 파일**:
- `src/backend/mpp/api/src/main/java/kr/co/ksm/dmes/mpp/config/JpaConfig.java`
- `src/backend/mqc/api/src/main/java/kr/co/ksm/dmes/mqc/config/JpaConfig.java`

**yml 이전 (application.yml 또는 application-{profile}.yml)**:
```yaml
spring:
  jpa:
    database-platform: ${spring.jpa.database-platform}   # JpaConfig 의 @Value 와 동일
    hibernate:
      ddl-auto: update                                    # JpaConfig 의 기본값 "update" 동일
    show-sql: true                                        # JpaConfig 의 "true" 동일
    properties:
      hibernate:
        format_sql: true                                   # JpaConfig 의 format_sql=true 동일
```

**`@EntityScan` 보장**:
mpp/mqc 의 `@SpringBootApplication` 또는 `@EntityScan` 에 `com.dongkuk.dmes.cactus` 와 `com.dongkuk.dmes.{mpp|mqc}` 가 포함되어 있는지 확인. 없으면 추가.

#### 15-3-2. mcm — 선행 작업 완료 상태 (2026-05-12 확인)

**선행 조건 — 이미 완료**:
- ✅ `cactus-core/build.gradle`: `api 'com.dongkuk.caravan:caravan'` 의존 제거됨
- ✅ `McmApplication.java:14-22`: `@EnableKafka` 제거, `com.dongkuk.caravan` 패키지 스캔 제거됨
- ✅ `mcm/api/application.yml`: `caravan.*` / `kmc.kafka.*` 블록 제거됨

**남은 작업** — ⚠️ **1.0.20 시점 가이드 — 1.0.22 정책 변경으로 archival**:

> ⚠️ **1.0.22-SNAPSHOT (2026-05-19) 기준 정책 변경**:
> mcm 이 multi-DS 환경 (`cactus.datasource.extras.if` 명시) 사용 시 호스트의 `JpaConfig.java`
> 는 **유지 권장** ([cactus-mybatis-multi-ds-design.md](./cactus-mybatis-multi-ds-design.md) §2
> 의 "JpaConfig 자체 정의 패턴" 참고). 본 §15-3-2 의 "남은 작업" 항목은 1.0.20 시점의
> 단일 DS 마이그레이션 가이드로, multi-DS + multi-tx + multi-mybatis 환경 (1.0.22+) 에는
> 적용 안 함. 향후 cactus 가 multi-DS 환경의 default EMF 까지 자동 등록 추가 시 재검토.

- [ ] ~~`mcm/api/.../config/JpaConfig.java` 삭제~~ ← multi-DS 환경 유지 권장 (1.0.22+)
- [ ] ~~`application*.yml` 에 `spring.jpa.*` 키 이전~~ ← multi-DS 환경 유지
- [ ] ~~`McmApplication.java` 의 `@EntityScan` 재정비~~ ← multi-DS extras 패키지 추가로 이미 반영
- [ ] ~~`@Primary` 책임 점검~~ ← multi-DS 환경 단일 EMF 가정 무효
- [x] 주의: `KmcTopicInfoEntity` 가 default EMF 에 *임시 매핑* 됨 (caravan 분리 후 임시 wiring). ← **KMC-MCM 마이그레이션 (1.0.21) 에서 `cactus.jpa.extras.if` 로 이전 완료**

> caravan 의 mcm 분리는 이미 완료된 상태. mcm `JpaConfig` 삭제는 **현 시점 즉시
> 실행 가능**. 단 SERAI 호스트는 caravan 의존 유지 — caravan 라이브러리 자체는
> `src/backend/caravan/` 와 `settings.gradle` 의 `includeBuild('caravan')` 로 살아있음.

---

## 16. 테스트 전략

### 16-1. 단위 테스트 (Phase 1~4 각 클래스)

- `SnakePhysicalNamingStrategy` — 카멜 → snake 정확 매핑 (기존 film 테스트 케이스 참고)
- `MasterCodeMybatisInterceptor` — `Map<String,Object>` 결과 / `Lov` / `null masterCode` / mixed key 케이스
- `MssqlColumnConverter` / `SqliteColumnConverter` — 각 JDBC Type 변환 케이스
- `MyBatisSqlRunner` — insert/update/delete/select 명령어 분기 + camel 변환
  (※ `SnakeCaseInsensitiveMessageBuilder` 단위 테스트는 이식 취소로 삭제 — 2026-05-12)

### 16-2. 자동설정 슬라이스 테스트

`ApplicationContextRunner` 로 각 AutoConfiguration 의 활성/비활성 조건 검증:

```java
@Test
void mybatisAutoConfig_active_when_sqlSessionFactory_present() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(CactusMybatisAutoConfiguration.class))
        .withBean(SqlSessionFactory.class, () -> mock(...))
        .run(ctx -> assertThat(ctx).hasBean("defaultDataSourceResolver"));
}

@Test
void secondaryDataSource_inactive_without_url() {
    new ApplicationContextRunner()
        .withConfiguration(AutoConfigurations.of(CactusSecondaryDataSourceAutoConfiguration.class))
        .run(ctx -> assertThat(ctx).doesNotHaveBean("cactusSecondaryDataSource"));
}
```

### 16-3. 통합 테스트

- **SQLite**: 인메모리 또는 임시 파일, 전체 cactus 빈 그래프 구성 → 토픽/마스터코드/오아시스 호출 1회
- **MSSQL**: Testcontainers (`mcr.microsoft.com/mssql/server:2022-latest`) — CI 환경에서만 활성화 가능 시
- **다중 DS**: primary=SQLite + secondary=H2 또는 SQLite 두 번째 파일로 격리

### 16-4. 회귀 테스트 (Phase 6)

mcm 파일럿:
- LoV API 응답 비교 (cactus 통합 전/후)
- audit 컬럼(`reg_user_id`, `reg_dt`) 자동 채움 검증
- BPMN 서비스 호출 정상 동작

---

## 17. 위험요소와 완화책

| # | 위험 | 영향 | 완화 |
|---|---|---|---|
| R-1 | `MasterCodeMybatisInterceptor` 가 *모든* SELECT 결과에 개입 → 대용량 쿼리 성능 저하 | 高 | (a) MyBatis `@Intercepts` 시그니처 그대로 사용 + (b) 조기 반환(빈 리스트/Lov 미해당) + (c) `cactus.mybatis.master-code-decoding.enabled=false` 로 끄기 가능 |
| R-2 | film 의 `oracle.sql.TIMESTAMP` 컴파일 의존 | **해소됨 (2026-05-12)** | 미결 #5 결정사항에 따라 `OracleColumnConverter` 자체를 이식하지 않음. cactus build.gradle 에 ojdbc 추가 불필요. |
| R-3 | 다중 EMF 환경(mcm + caravan) 에서 `cactus.tx.jpa-unified=true` 잘못 켜면 transactionManager 가 caravan 트랜잭션을 깸 | **해소됨 (2026-05-12 확인)** | cactus-core 와 mcm 양쪽에서 caravan 의존 분리 완료 — mcm 은 단일 EMF 환경. 단 SERAI 처럼 caravan 의존 유지 모듈에서는 다중 EMF 가능 → `CactusTransactionManagerAutoConfiguration` 에 `@ConditionalOnSingleCandidate(EntityManagerFactory.class)` 가드 + 문서 경고는 그대로 유지. |
| R-4 | `MasterCodeJpaAutoConfiguration` 의 `@EnableJpaRepositories` 가 multi-EMF 환경에서 어느 EMF 에 묶일지 모호 | 中 | 현 코드 그대로 두고, 신규 secondary EMF 는 명시적 `entityManagerFactoryRef` 사용. mcm `JpaConfig` 처럼 host EMF 가 cactus 패키지를 스캔하도록 유지. |
| R-5 | `cactus.oasis.transactional=true` 설정 후 ServiceStarter 가 `transactionManager` 빈을 찾지 못함 | 中 | startup 시 `BeanFactory.containsBean(name)` 검증 후 명확한 메시지 throw. `transaction-manager-name` 으로 override 안내. |
| R-6 | `SnakePhysicalNamingStrategy` 가 기존 mcm-core / kmc 엔티티의 명시적 `@Column` 명과 충돌 | **低 (해소됨, 2026-05-12)** | 사전 점검 결과 cactus / mcm-core / kmc-core / caravan 모든 엔티티가 `@Table` + `@Column` 완전 명시 — strategy 가 호출되지 않음. 신규 엔티티는 컨벤션으로 `@Table` 명시 유지. |
| R-7 | MSSQL/SQLite Converter 가 ResultSet 의 Type 값을 잘못 매핑 → null/parse 예외 | **中 (SQLite 측 해소, 2026-05-12)** | SQLite 는 옵션 A(최소 변환) 결정 — 변환 안 하면 예외도 없음. MSSQL 은 unit test 케이스 충분히 + 변환 실패 시 원본 객체 fallback. |
| R-8 | AutoConfig 의존 순서 잘못 → 인터셉터 등록 누락 | 中 | `@AutoConfiguration(after=...)` 명시 + `ConditionalOnBean(SqlSessionFactory.class)` 로 SqlSession 빈 생성 후 활성 보장 |
| R-9 | film 의 `MybatisAudit` 이 `audit` 필드 reflection 으로 접근 — cactus 의 `CactusMybatisAuditInterceptor` 와 동작 다름 | 低 | film `MybatisAudit` 은 **이식 대상 아님** (cactus 의 `CactusMybatisAuditInterceptor` 가 이미 같은 일 수행). 이중 등록 금지. |
| R-10 | Spring Boot 4.0.6 의 `@AutoConfiguration` 시그니처 변경 가능성 | 低 | cactus-core 가 이미 `spring-boot-autoconfigure:4.0.6` 의존 — 같은 API 사용. |
| R-11 | `NonTransactionalServiceStarterFactory#setServiceProvider(...)` 메서드가 oasis-core 5.1.0 에 없을 가능성 | **해소됨 (2026-05-12 javap 검증)** | jar 디스어셈블 결과: `NonTransactionalServiceStarterFactory` 에 `setServiceProvider` **메서드 없음** 확정. 대신 `setServiceDocumentDirectory(String)` + `setFileDescriptionDelimiter(String)` 제공. `SpringServiceStarterFactory` 만 `setServiceProvider(ServiceProvider)` 보유. → §11-1 분기 매트릭스 갱신: URL 모드는 transactional=true 필수. PATH 모드는 `setServiceDocumentDirectory` 사용. |
| R-12 | `HttpServiceDocumentLoader` 가 film 자체 코드라 컴파일 의존이 film 모듈에 잡혀 있을 수 있음 | 低 | 클래스 이식 시 oasis-core 와 표준 JDK 만 사용하는지 확인. film 도메인 코드 임포트 0건. |
| R-13 | `service-path` 기본값(`resources/services`) 과 "사용자 명시" 구분 모호 | **해소됨 (2026-05-12)** | 미결 #6/#7 결정 (옵션 1) — 기본값 유지 + 항상 명시 취급. "둘 다 미명시" 분기 자체가 사라져 모호성 해소. URL 우선 + PATH 무시. |
| R-14 | oasis-core 4.18.1 (film) ↔ 5.1.0 (cactus) API 차이 — `MessageBuilder`/`TopicLoader`/`TopicStructureLoader` 인터페이스 5.1.0 에서 삭제됨 | **부분 해소됨 (2026-05-12)** | jar 검증으로 인터페이스 부재 확정. plan 의 `SnakeCaseInsensitiveMessageBuilder` 이식 항목 **취소**. 해당 빈을 cactus 가 사용 안 함 → 기능 손실 0. 미래 oasis 작업 시 5.1.0 의 message 패키지 구조 (`SerializedMessageObjectMessage*` 만 존재) 재검토. |
| R-15 | `OasisServiceExecutor`/`OasisAutoConfiguration#serviceStarter()` 가 현재 `OasisProperties` 를 주입받지 않아 yml `cactus.oasis.service-path` 가 ServiceStarter 에 *흘러가지 않는* 상태 | **해소됨 (2026-05-12)** | Phase 1 작업에서 `OasisAutoConfiguration#serviceStarter()` 가 `OasisProperties` 주입받아 `setServiceDocumentDirectory(servicePath)` 로 전달. `OasisServiceExecutor` 는 수정 불필요. |

---

## 18. 작업 체크리스트

```
Phase 1 — Foundation
[ ] D:\dmes-standard\workspace-ksm\dmes-aps\src\backend\cactus-core\src\main\java\
    com\dongkuk\dmes\cactus\jpa\SnakePhysicalNamingStrategy.java
[ ] .../jpa/CactusJpaProperties.java
[ ] .../jpa/CactusHibernateCustomizerAutoConfiguration.java
[ ] .../mastercode/MasterCodeDecoder.java
[ ] .../mastercode/DefaultMasterCodeDecoder.java
[ ] .../mastercode/MasterCodeMybatisInterceptor.java
[ ] .../mastercode/MasterCodeMybatisAutoConfiguration.java
[ ] .../oasis/converter/MssqlColumnConverter.java
[ ] .../oasis/converter/SqliteColumnConverter.java
[ ] .../oasis/loader/HttpServiceDocumentLoader.java   ★ JDK 21 HttpClient 기반 재작성 (미결 #8)
[ ] .../oasis/task/MyBatisSqlRunner.java
[ ] .../oasis/OasisProperties.java        (수정: dialect, txMgrName, serviceLoaderUrl 필드)
[ ] .../oasis/OasisAutoConfiguration.java (수정: transactional + ServiceProvider 분기, ColumnConverter, SqlRunner)
[ ] .../oasis/OasisServiceExecutor.java   (수정: OasisProperties 주입 + servicePath 가 ServiceStarter 에 연결되도록)
[ ] oasis-core 5.1.0 의 NonTransactionalServiceStarterFactory#setServiceProvider 메서드 시그니처 직접 확인 (R-11, Phase 1 첫 작업)
[ ] ~~.../oasis/message/SnakeCaseInsensitiveMessageBuilder.java~~ — 취소 (oasis 5.1.0 인터페이스 부재)
[ ] resources/META-INF/spring/.../AutoConfiguration.imports (5 entries 추가)
[ ] src/test/java/.../jpa/SnakePhysicalNamingStrategyTest.java
[ ] src/test/java/.../mastercode/MasterCodeMybatisInterceptorTest.java
[ ] src/test/java/.../oasis/converter/MssqlColumnConverterTest.java
[ ] src/test/java/.../oasis/converter/SqliteColumnConverterTest.java
[ ] src/test/java/.../oasis/OasisAutoConfigurationTest.java
[ ] src/test/java/.../oasis/OasisAutoConfigurationServiceProviderTest.java  ★ 분기 매트릭스 검증

Phase 2 — (제거됨, 미결 #5 결정사항)
N/A — Oracle 이식 안 함

Phase 3 — DataSource/EMF
[ ] .../datasource/CactusDataSourceProperties.java
[ ] .../datasource/DialectDetector.java
[ ] .../datasource/CactusSecondaryDataSourceAutoConfiguration.java
[ ] .../jpa/CactusSecondaryJpaAutoConfiguration.java
[ ] .../mybatis/CactusMybatisProperties.java
[ ] .../mybatis/CactusMybatisAutoConfiguration.java
[ ] .../mybatis/CactusDefaultDataSourceResolver.java
[ ] AutoConfiguration.imports 추가

Phase 4 — TX 통합
[ ] .../tx/CactusTransactionManagerAutoConfiguration.java
[ ] AutoConfiguration.imports 추가

Phase 5 — DialectDetector PostProcessor (옵션)
[ ] .../datasource/CactusDialectEnvironmentPostProcessor.java
[ ] resources/META-INF/spring.factories (EnvironmentPostProcessor 등록)

Phase 6 — 파일럿
[ ] mcm/api 또는 신규 모듈에서 application.yml + 회귀 테스트

Phase 7 — 릴리스
[ ] build.gradle: version 1.0.19-SNAPSHOT
[ ] docs/cactus/usage-guide.md 작성
[ ] CHANGELOG.md
[ ] Nexus snapshots 배포
```

---

## 19. 미결 이슈 — **전체 결정 완료 (2026-05-12)**

> 본 절의 8개 항목은 모두 결정 완료. 결정 내용과 근거를 보존 목적으로 유지.

1. ~~**`cactus.jpa.snake-naming.enabled` 기본값**~~ — **결정: `true`** (2026-05-12).
   사전 점검 결과 cactus / mcm-core / kmc-core / caravan 의 *모든* 엔티티가
   `@Table(name=...)` + `@Column(name=...)` 으로 완전 명시되어 있어 strategy
   호출 자체가 발생하지 않음 — 현재 코드 영향 0. `true` 는 미래 엔티티가
   `@Table` 누락 시의 안전망 + `*Entity` 접미사 자동 제거 효과. **단**, 효과가
   실제로 발동하려면 미결 #2(mcm `JpaConfig` 의 직접 properties 설정 문제)도
   같이 해결되어야 함.
2. ~~**mcm 의 `JpaConfig` 직접 정의 빈 vs cactus 자동 빈**~~ — **결정: 옵션 A
   (3개 모두 `JpaConfig` 삭제, 단계적 적용)** (2026-05-12).

   조사 결과:
   - mpp / mqc : caravan 의존 0 → 단일 EMF 환경 → `JpaConfig` 가 완전 잉여 (Spring Boot 자동 EMF 와 같은 일을 더 번거롭게 수행)
   - mcm : caravan 으로 인한 다중 EMF 환경 → `JpaConfig` 의 `@Primary` 명시(#3, #4) 책임 필요. 단 **caravan 분리(선행 작업) 완료 후에는** 단일 EMF 가 되어 `JpaConfig` 도 삭제 가능
   - mcm, mpp, mqc 의 `JpaConfig` 의 `dialect`/`ddl-auto`/`show_sql`/`format_sql` 4개 properties 는 `spring.jpa.*` yml 키로 전부 이전 가능
   - mcm 의 `setPackagesToScan(...)` 은 `McmApplication.java:38-46` 의 `@EntityScan` 과 *중복* — JpaConfig 제거 시 영향 0

   **작업 순서**:
   1. ✅ (별개 선행) **caravan 의 cactus / mcm 분리** — **완료 (2026-05-12 확인)**: cactus-core/build.gradle 에서 api 의존 제거, McmApplication 의 `@EnableKafka` + caravan 패키지 스캔 제거, mcm application.yml 의 caravan.* 블록 제거 모두 확인됨
   2. (본 플랜 Phase 6-A) `mpp` / `mqc` `JpaConfig` 즉시 삭제 + yml `spring.jpa.*` 이전
   3. (본 플랜 Phase 6-B, **현 시점 즉시 가능**) `mcm` `JpaConfig` 삭제 + yml 이전 — `KmcTopicInfoEntity` 가 default EMF 에 임시 매핑된 상태 점검 필요

   결과: 모든 호스트가 Spring Boot 자동 EMF + cactus `HibernatePropertiesCustomizer`
   체인으로 동작 → 미결 #1 의 `snake-naming` 이 실효성 있게 발동.
3. ~~**SQLite 의 일부 컬럼 메타 타입이 0(`NULL`) 일 때** Converter 의 분기 동작~~
   — **결정: 옵션 A (최소 변환)** (2026-05-12).

   사전 점검 결과:
   - SQLite 마이그레이션 SQL 27개 점검 — 모든 컬럼이 declared type 명시. `Types.NULL`(0) 케이스 사실상 0건
   - 시간 컬럼(`C_AT`, `U_AT` 등)은 모두 **`TEXT`** 로 선언 → `getColumnType()` = `Types.VARCHAR`(12). 즉 `SqliteColumnConverter` 의 `DATE`/`TIMESTAMP` 분기는 호출되지 않음
   - 현재 mcm 등 모듈이 SQLite 로컬에서 정상 작동 중 — String 시간 컬럼이 와도 화면이 받음

   **결정 사항**:
   - `SqliteColumnConverter` 는 declared type 기반 분기만 수행. SQLite `TEXT` 시간 컬럼은 String 으로 그대로 반환
   - `default` 케이스는 항상 원본 객체 반환 (`columnType=0` 케이스 포함)
   - MSSQL/SQLite 간 시간 표현 차이는 **SQLite 로컬 환경의 알려진 제약**으로 명세 (`docs/cactus/` 추후 사용 가이드에 명시)
   - `MssqlColumnConverter` 는 운영(MSSQL) 정확성에 집중해 정확하게 구현

   shape: oasis-core `ColumnConverter#convert(int columnType, Object object)`
   시그니처는 컬럼명 정보를 받지 못하므로 컬럼명 기반 휴리스틱은 *원천 불가능*.
4. ~~**Oasis transactional 모드에서 `MyBatisSqlRunner` 의 `sqlSession` 이
   동일 트랜잭션에 속하는지**~~ — **결정: 옵션 A (단일 DS 자동 동기화만 보장)**
   (2026-05-12).

   메커니즘:
   - `JpaTransactionManager.begin()` 이 `EntityManager` 의 connection 을
     `TransactionSynchronizationManager` 에 `dataSource` 키로 bind
   - MyBatis-Spring 의 `SpringManagedTransaction` 이 `DataSourceUtils.getConnection(dataSource)`
     호출 → 같은 키로 lookup → 같은 connection 반환
   - **같은 DataSource 면 자동 동기화** (별도 설정 불필요)

   적용 범위:
   - **단일 DS** (mpp/mqc/mcm 의 일반 환경): primary DS + Spring Boot 기본 EMF + mybatis-spring-boot-starter 의 기본 SqlSession 이 모두 같은 DS → cactus 가 별도 작업 없이 자동 동기화 ✅
   - **다중 DS** (`cactus.datasource.secondary.enabled=true`): `MyBatisSqlRunner` 의 SqlSession 은 **primary DS 와만 묶임**. secondary DS 의 MyBatis 쿼리는 별도 SqlSessionFactory + `cactusSecondaryTransactionManager` 와 함께 *소비 모듈이 자체 구성* — cactus 가 만들지 않음

   추가 명세:
   - `MyBatisSqlRunner` 가 주입받는 `SqlSession` 빈 = mybatis-spring-boot-starter 의 기본 빈 (이름 `sqlSession`, primary DS 와 묶임)
   - 소비 모듈이 SqlSession 빈 이름을 커스텀(예: film 의 `sqlSessionBiz`) 하면 cactus 의 자동 주입이 실패 → `@Qualifier` 가이드 또는 SqlSession 빈 이름을 cactus 가 기대하는 이름과 일치시키도록 안내 필요 (§15 가이드 추가)
5. ~~**OracleColumnConverter 의 의존 격리 방식**~~ — **결정: 옵션 A — 이식 안 함**
   (2026-05-12).

   근거:
   - 사용자 결정사항 #2: MSSQL 1순위, 로컬 SQLite. Oracle 은 1순위 DB 아님
   - 코드베이스 점검: aps 의 어떤 모듈도 Oracle 사용 안 함 (모든 마이그레이션 SQL 이 SQLite/MSSQL)
   - cactus build.gradle 에 ojdbc 의존성 0
   - YAGNI — 사용처 없는 코드를 미리 만들면 유지보수 부담만 증가

   영향:
   - §4 카탈로그에서 `OracleColumnConverter` 항목 제거
   - §5 패키지 트리에서 제거
   - §6 프로퍼티 스키마: `cactus.oasis.dialect` 의 허용값에서 `oracle` 제거 (`mssql` | `sqlite` | `none`)
   - §8 dialect 매핑에서 Oracle 절 제거
   - §14 Phase 2 (Oracle 호환 이식) **전체 삭제**
   - §17 R-2 (oracle.sql.TIMESTAMP 컴파일 의존 위험) 해소
   - 부록 B 매핑표에서 Oracle 행 제거

   미래에 Oracle 환경 등장 시: 그때 `compileOnly 'com.oracle.database.jdbc:ojdbc11'`
   + `@ConditionalOnClass(name="oracle.sql.TIMESTAMP")` 가드 패턴(옵션 B)으로 추가.
6. ~~**ServiceProvider "기본 모드" 동작**~~ + 7. ~~**`OasisProperties#servicePath`
   의 기본값**~~ — **결정: 옵션 1 (servicePath 기본값 유지 + 항상 명시 취급)**
   (2026-05-12, #6/#7 동시 종결).

   사전 점검 결과:
   - BPMN 파일 **38개 사용 중** (mcm/api/src/main/resources/services 14개, mpn/lib/.../services 7개, 기타 17개)
   - `OasisServiceExecutor` 가 `OasisProperties` 를 주입받지 않음 → `OasisProperties.servicePath` 가 현재 코드 어디에도 흘러가지 않음 (placeholder)
   - 그럼에도 BPMN 38개가 정상 로드 중 = oasis-core 의 기본 ServiceProvider(`ClassPathFileServiceLoader` 추정)가 인식
   - cactus docs 및 mcm yml 의 일관된 의도: BPMN 위치는 `resources/services/{serviceId}/{serviceId}.bpmn`
   - 본 마이그레이션 작업의 일부로 `OasisProperties.servicePath` → `ServiceStarter` 연결 코드를 *추가* 해야 함

   **결정 사항**:
   - `OasisProperties#servicePath` 기본값 `"resources/services"` 유지
   - 분기 알고리즘 단순화: URL 명시 시 HTTP loader 사용, 그 외에는 **항상** `CamundaBpmnServiceProvider(FileSystemFileServiceLoader(servicePath, "bpmn", "^^"))` 등록
   - "둘 다 미명시" 라는 기본 모드 분기 자체가 사라짐 — 매트릭스 단순화
   - URL 과 PATH 동시 충돌 검출은 *URL 우선 → PATH 무시* 로 간소화 (예외 throw 안 함). PATH 의 기본값이 항상 채워져 있어 "사용자가 둘 다 의도적으로 명시" 한 케이스 검출이 의미 없음
   - BPMN 도입 시 자연스럽게 작동 (`resources/services/{serviceId}/{serviceId}.bpmn` 추가)

   **추가 발견 사실**: 현재 `OasisAutoConfiguration#serviceStarter()` 가 `OasisProperties.servicePath` 를 ServiceStarter 에 전달하지 않는 것은 **현재 동작상의 결손**. cactus 마이그레이션 작업의 일부로 이 연결을 *추가* 해야 함 (§11-1 코드 스케치에 이미 반영됨).
8. ~~**`HttpServiceDocumentLoader` 의 HTTP 클라이언트 선택**~~ — **결정: 옵션 C
   (JDK 21 `java.net.http.HttpClient`)** (2026-05-12).

   조사 결과:
   - film 의 `HttpServiceDocumentLoader.java:6-14` 는 **Apache HttpClient 4.x** 사용 (`org.apache.http.*`)
   - 구현은 단순 GET + 타임아웃 (30줄)
   - HttpClient 4.x 는 EOL (보안 패치 종료)
   - cactus 는 Java 21 환경

   **결정 사항**:
   - cactus 의 `oasis/loader/HttpServiceDocumentLoader` 는 **JDK 21 의 `java.net.http.HttpClient`** 로 재작성
   - 추가 라이브러리 의존성 0 (Apache HttpClient 도입 회피)
   - 시그니처 보존: `HttpServiceDocumentLoader(String serviceUri, int timeoutSecond)` + `String serviceDocument(String serviceId)`
   - `connectTimeout` + per-request `timeout` 둘 다 적용
   - `followRedirects(NORMAL)` 기본
   - `IOException`/`InterruptedException` 발생 시 `ServiceLoadException` 으로 래핑 (`InterruptedException` 은 thread interrupt 복구 후 throw)
   - 동작 미세 차이(redirect 정책, HTTP 버전 자동 협상 등) 가능. 현재 cactus 의 HTTP loader 사용처는 0 (URL 명시한 모듈 없음) — BPMN 38개 모두 파일 시스템 로드 중 → HTTP loader 변경의 회귀 위험 무시 가능 ([[aps-oasis-state]])

---

## 부록 A. 빈 이름 / Qualifier 컨벤션

| 카테고리 | 빈 이름 |
|---|---|
| primary DataSource | `dataSource` (Spring Boot 기본) |
| secondary DataSource | `cactusSecondaryDataSource` |
| primary EMF | `entityManagerFactory` |
| secondary EMF | `cactusSecondaryEntityManagerFactory` |
| primary TxMgr | `transactionManager` |
| secondary TxMgr | `cactusSecondaryTransactionManager` |
| Oasis 빈 | `serviceStarter`, `oasisRequestConverter`, `oasisResponseConverter`, `oasisServiceExecutor`, `sqlRunner`, `columnConverter` (`messageBuilder` 는 oasis 5.1.0 인터페이스 부재로 등록 안 함) |

> `txBiz` / `entityManagerFactoryBiz` / `dataSourceBiz` 같은 film 식
> 이름은 **사용하지 않는다.** cactus 는 라이브러리 컨벤션을 따른다.

## 부록 B. film → cactus 클래스 매핑표

| film 클래스 | cactus 등가 |
|---|---|
| `BizDataSourceConfig.DataSourceConfigDev/Prd` | `spring.datasource.*` (Spring Boot 표준) + `CactusSecondaryDataSourceAutoConfiguration` |
| `BizDataJpaConfig#entityManagerFactoryBiz` | Spring Boot 기본 EMF + `CactusHibernateCustomizerAutoConfiguration` (+ secondary 는 `CactusSecondaryJpaAutoConfiguration`) |
| `BizDataAccessConfig#sqlSessionFactoryBiz` + plugins | `mybatis-spring-boot-starter` (소비 모듈) + cactus `AuditAutoConfiguration` + `MasterCodeMybatisAutoConfiguration` + `CactusMybatisAutoConfiguration` |
| `BizDataAccessConfig#txBiz` (JpaTxMgr) | Spring Boot 기본 또는 `CactusTransactionManagerAutoConfiguration` |
| `BizDataAccessConfig#defaultDataSourceResolver` | `CactusDefaultDataSourceResolver` (`CactusMybatisAutoConfiguration`) |
| `OasisConfig#columnConverter` (Oracle) | `MssqlColumnConverter` / `SqliteColumnConverter` (dialect 분기). Oracle 은 이식 안 함 — 미결 #5 결정. |
| `OasisConfig#sqlRunner` | `MyBatisSqlRunner` (`OasisAutoConfiguration`) |
| `OasisConfig#messageBuilder` | **이식 안 함** — oasis-core 5.1.0 에 `MessageBuilder` 인터페이스 부재 (2026-05-12 검증) |
| `OasisConfig#filmTopicLoader/Structure` | **이식 안 함** — oasis-core 5.1.0 에 `TopicLoader/TopicStructureLoader` 인터페이스 부재 |
| `OasisConfig#serviceStarter` (transactional 분기 + ServiceProvider 분기) | `OasisAutoConfiguration#serviceStarter` (§11-1 분기 매트릭스) |
| `OasisConfigLocal` 의 URL/PATH/기본 → `HttpServiceDocumentLoader`/`FileSystemFileServiceLoader`/`SimpleServiceProvider` 분기 | `resolveServiceProvider(props)` 헬퍼 메서드 (§11-1) |
| `HttpServiceDocumentLoader` (film 자체) | `cactus.oasis.loader.HttpServiceDocumentLoader` (동일 동작 이식) |
| `SnakePhysicalNamingStrategy` | 동명 이식 |
| `MasterCodeIntercept` | `MasterCodeMybatisInterceptor` |
| `MasterCodeDecoder` | 동명 이식 |
| `MybatisAudit` / `MybatisSqlLogger` | **이식 안 함** — cactus 의 `CactusMybatisAuditInterceptor` / `SqlLoggingInterceptor` 사용 |
