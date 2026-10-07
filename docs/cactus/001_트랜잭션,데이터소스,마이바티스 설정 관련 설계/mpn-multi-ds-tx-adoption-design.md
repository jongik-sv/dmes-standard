# mpn 멀티 DataSource / 멀티 TransactionManager 도입 설계

> **DB 전제 안내 (2026-10-03)**: 이 문서의 「MSSQL 운영」 서술은 dmes-ksm(MSSQL) 이관 시절 전제이며 이력으로 남긴다. 운영 DB 는 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않는다. 새 SQL 은 [`oracle-sql-rules.md`](../../guide/Database/oracle-sql-rules.md) 를 따른다.

> 작성일: 2026-06-20
> 대상 모듈: `src/backend/mpn`
> 정본 참조: `src/backend/mcm` (cactus 멀티-DS/TM 레퍼런스 구현)
> 상태: **설계 확정 / 구현 보류** (사용자 지시: 분석·설계만, 구현은 별도 지시 시)

---

## 1. 배경 · 목적

mpn 은 현재 **단일 DataSource(MPNAPUSER) + Spring Boot 자동설정 TransactionManager** 구조다.
mcm 과 동일한 **cactus 기반 멀티-DS/멀티-TM 구조**로 전환해, 모듈 간 데이터 액세스 구조를
통일하고 멀티 데이터소스 트랜잭션 개념을 안정적으로 사용하기 위함이다.

### 목표 매핑 (사용자 확정 2026-06-20)

| TransactionManager | DataSource alias | 계정/스키마 | 용도 |
|---|---|---|---|
| **txBiz** (default) | `biz` (primary) | **MPNAPUSER** | mpn 자체 도메인 (tb_mpn_*) |
| **txCmn** | `cmn` (extra) | **MCMAPUSER** | 공통관리(마스터/공통코드 등) |
| **txIF** | `if` (extra) | **EAIUSER** | 인터페이스 송수신 |

> mcm 과의 차이: mcm 은 `txCmn` 이 자기 DB(biz=MCMAPUSER)였으나, mpn 의 `cmn` 은
> **외부 공통 스키마(MCMAPUSER)** 를 가리키는 진짜 별도 DataSource 다. mpn 은 caravan(SERAIUSER)
> 은 쓰지 않으므로 표준 3종(txBiz/txCmn/txIF)만 둔다.

### 범위 결정 (사용자 확정)

- **엔티티 매핑**: 구조만 먼저. cmn/if EMF 는 `packages-to-scan: []` (빈 EMF)로 시작하고,
  실제 MCMAPUSER/EAIUSER 엔티티는 Phase 2 에서 채운다.
- **OASIS 트랜잭션**: `cactus.oasis.transactional: false` 현행 유지 (BPMN 동작 무변경).

---

## 2. 현황 분석

### 2.1 mpn 현재 구조

| 항목 | 현재 상태 | 근거 |
|---|---|---|
| DataSource | Spring Boot 자동(`spring.datasource.*`) — 단일 | `application-*.yml` |
| EMF / TM | Spring Boot 자동 `LocalContainerEntityManagerFactoryBean` + `JpaTransactionManager` | 명시 빈 없음 |
| 명시 @Configuration | `JpaPersistenceProviderEnforcer`(BPP), `MssqlPlaceholderGuardConfig`, `SecurityConfig` | DS/EMF/TM 빈 정의 **0건** |
| 엔티티/리포지토리 스캔 | `@EntityScan` / `@EnableJpaRepositories` = `com.dongkuk.dmes.aps`, `com.dongkuk.dmes.mpn` | `MpnApplication` |
| 보조 DS | 없음 (단일 DB) | — |
| 영속성 | 순수 JPA (MyBatis 비활성: `cactus.mybatis.enabled:false`) | `application.yml` |
| OASIS BPMN | 7개 사용, `transactional:false` | `core/.../resources/services/*.bpmn` |
| cactus-core 핀 | `1.0.18-SNAPSHOT` (composite build 가 로컬 1.0.22 로 치환) | `mpn/lib/build.gradle`, `settings.gradle` |

#### mpn 현재 핵심 Hibernate 속성 (명시 EMF 전환 시 반드시 이식)

- `application.yml`(base): `hibernate.format_sql: true`, `hibernate.default_batch_fetch_size: 100`
- `application-local.yml`(SQLite): `hibernate.metadata_builder_contributor:
  com.dongkuk.dmes.aps.common.persistence.SqliteTemporalConverterContributor`,
  `hibernate.hbm2ddl.jdbc_metadata_extraction_strategy: individually`

> ⚠️ 명시 EMF 는 yml 의 `spring.jpa.properties.*` 를 **읽지 않는다**. 위 속성을 JpaConfig 코드로
> 옮기지 않으면 (특히 SQLite local 의 temporal 컨버터) 동작이 깨진다. mcm JpaConfig 가 동일 이유로
> SQLite 분기를 코드에 둔다 (`JpaConfig.java:87-98`).

### 2.2 mcm 정본 구조 (레퍼런스)

| 구성 | 위치 | 비고 |
|---|---|---|
| primary DS/EMF/TM 명시 @Primary | `com.dongkuk.dmes.mcm.config.JpaConfig` | biz=MCMAPUSER |
| primary-alias | `application.yml` `cactus.datasource.primary-alias: biz` | |
| extras DS | `application-mssql.yml` `cactus.datasource.extras.{if,caravan}` | if=EAIUSER, caravan=SERAIUSER |
| extras EMF | `application.yml` `cactus.jpa.extras.{if,caravan}` | if 는 `packages-to-scan: []` (빈 EMF) |
| tx.managers | `cactus.tx.managers.{txBiz,txCmn,txIF,txCaravan}` + `default-manager: txBiz` | |
| local SQLite extras 절대경로 주입 | `McmApplication` `addInitializers(...)` | local-only 프로파일 한정 |

---

## 3. cactus 멀티-DS/TM 메커니즘 정밀 분석

### 3.1 빈 등록 흐름 (1.0.21+ extras, BDRPP 방식)

세 자동설정이 `BeanDefinitionRegistryPostProcessor` 로 동작한다:

```
CactusMultiDataSourceAutoConfiguration   (datasource/)
  └ cactus.datasource.extras.{name} 마다 HikariDataSource 빈 'cactusDataSource{Name}' + alias '{name}' 등록
  └ primary-alias 지정 시 alias 'dataSource' → '{primaryAlias}' 등록 (예: biz)

CactusMultiJpaAutoConfiguration          (jpa/)        @AutoConfiguration(after=MultiDataSource)
  └ cactus.jpa.extras.{name} 마다
        EMF 빈 'cactusEntityManagerFactory{Name}' (LocalContainerEMF, setDataSource(alias lookup))
        TM  빈 'cactusTransactionManager{Name}'  (JpaTransactionManager(emf))
  └ packages-to-scan: [] 이어도 빈 배열로 setPackagesToScan 호출 → 엔티티 0개 PU 정상 부팅
        (호출 누락 시 persistence.xml 탐색 실패 "No persistence unit ..." — 코드 주석 line 110-117)

CactusMultiTransactionManagerAutoConfiguration  (tx/)  @AutoConfiguration(after=MultiDataSource,MultiJpa)
  └ extras DS 중 jpa.extras 미정의분 → fallback DataSourceTransactionManager 등록
  └ cactus.tx.managers.{alias} 마다 alias → 대상 TM 빈 등록
        data-source == primary-alias        → 'transactionManager' (host primary TM)
        data-source == extras key (jpa 有)  → 'cactusTransactionManager{Name}'
  └ default-manager 의 대상 TM 에 setPrimary(true)
```

### 3.2 catch-22 결론 — JpaConfig 가 필요한 진짜 이유

- **옛 1.0.19 `secondary` 방식**은 `@Bean` 기반이라 Spring Boot 의 `@ConditionalOnMissingBean`
  조건 평가 시점에 EMF 가 보여 **Spring Boot primary 자동설정이 backoff** 되는 catch-22 가 있었다.
  → mcm 이 2026-05-13 JpaConfig 를 도입한 직접적 이유.
- **새 1.0.21+ `extras` 방식**은 BDRPP 라 **`ConfigurationClassPostProcessor` 의 조건 평가가 끝난 뒤**
  extras 를 추가한다. 따라서 Spring Boot primary 자동설정과 **공존**한다 (R-multi-1/R-multi-18 완화).
  → extras 만으로는 JpaConfig 가 **강제되지 않는다.**

#### 그럼에도 JpaConfig 를 두는 이유 (= mpn 도 둬야 하는 이유)

extras 가 추가되면 컨테이너에 **EMF/DataSource 빈이 3개씩** 생긴다. 그런데 cactus 는
**default TM 에만 `@Primary`** 를 붙이고(`CactusMultiTransactionManagerAutoConfiguration` line 110-112),
**EMF/DataSource 에는 @Primary 를 붙이지 않는다**. Spring Boot 자동 primary 빈도 @Primary 가 아니다.

결과적으로:

| 빈 타입 | @Primary 모호성 | 영향 |
|---|---|---|
| TransactionManager | cactus 가 default(txBiz)→`transactionManager` 에 @Primary 부여 → **해소됨** | 안전 |
| DataSource | 3개 중 @Primary 없음 | 타입 주입 모호 가능 |
| EntityManagerFactory | 3개 중 @Primary 없음 | 타입 주입 / `@PersistenceContext` 모호 가능 |

Spring Data 리포지토리는 기본 빈 이름 `entityManagerFactory` 로 바인딩하므로 동작하지만,
**타입 기반 EMF/DataSource 주입은 모호**해질 수 있다. mcm 은 JpaConfig 에서 primary DS/EMF/TM 에
**명시 `@Primary`** 를 부여해 이 모호성을 원천 차단한다.

> **결론**: "안정되고 통일된 구조" 목적상 mpn 도 mcm 과 동일하게 **JpaConfig(명시 @Primary primary 빈)**
> 를 두는 것을 설계 정본으로 한다. extras 가 없을 때의 Spring Boot 자동설정 동작과 동일성을 유지하기 위해
> 현재 Hibernate 속성(§2.1)을 빠짐없이 이식한다.

### 3.3 트랜잭션 시맨틱 (멀티 DS)

- 세 TM 은 모두 **resource-local** (`JpaTransactionManager`). JTA/XA(2PC) 아님.
- `@Transactional("txBiz")` / `@Transactional("txCmn")` / `@Transactional("txIF")` 로 **명시적으로**
  대상 트랜잭션을 선택. 미지정 시 default(txBiz).
- **세 DS 를 한 트랜잭션으로 원자적으로 묶지 않는다** (분산 트랜잭션 미지원). 각 DS 경계는 독립적이다.
  공통(MCMAPUSER) 갱신과 자체(MPNAPUSER) 갱신을 원자적으로 묶어야 하는 시나리오가 생기면 별도 설계 필요.

---

## 4. 목표 아키텍처

### 4.1 빈 와이어링

```
[spring.datasource.*]──JpaConfig.dataSource() @Primary (Hikari "mpn-host-primary", MPNAPUSER)
        │                         │
        │            JpaConfig.entityManagerFactory() @Primary  (PU "default")
        │              packagesToScan = com.dongkuk.dmes.aps, com.dongkuk.dmes.mpn
        │                         │
        │            JpaConfig.transactionManager() @Primary  ← alias txBiz (default, @Primary 유지)
        │
[cactus.datasource.extras.cmn]──cactusDataSourceCmn (MCMAPUSER)
        └ cactus.jpa.extras.cmn (packages: [])──cactusEntityManagerFactoryCmn
                                              └ cactusTransactionManagerCmn ← alias txCmn
[cactus.datasource.extras.if]──cactusDataSourceIf (EAIUSER)
        └ cactus.jpa.extras.if (packages: [])──cactusEntityManagerFactoryIf
                                             └ cactusTransactionManagerIf ← alias txIF
```

### 4.2 엔티티 경계

| EMF | persistence-unit | packages-to-scan | 매핑 엔티티 |
|---|---|---|---|
| primary (JpaConfig) | `default` | `com.dongkuk.dmes.aps`, `com.dongkuk.dmes.mpn` | mpn 전 엔티티 (tb_mpn_*) |
| cactusEntityManagerFactoryCmn | `cactus-cmn` | `[]` (Phase 2 확장) | (없음 → Phase 2) |
| cactusEntityManagerFactoryIf | `cactus-if` | `[]` (Phase 2 확장) | (없음 → Phase 2) |

> 빈 EMF 라도 `cactusTransactionManagerCmn/If` 는 정상 생성되어 `@Transactional("txCmn"/"txIF")` 사용 가능.
> 단 엔티티가 없으므로 현재는 JPA 리포지토리가 없고, 추후 엔티티를 채우면 즉시 활성화된다.

---

## 5. 상세 변경 명세 (구현 시)

> 아래는 **설계 스켈레톤**이며 실제 소스 수정은 별도 지시 시 수행한다.

### 5.1 `mpn/lib/build.gradle` — 버전 핀 정리 (선택)

```gradle
// 변경 전
api 'com.dongkuk.dmes:cactus-core:1.0.18-SNAPSHOT'
// 변경 후 (멀티-TM 은 1.0.21+ 전용. composite build 라 기능상 무변화지만 핀 일치)
api 'com.dongkuk.dmes:cactus-core:1.0.22-SNAPSHOT'
```

### 5.2 [신규] `com.dongkuk.dmes.mpn.config.JpaConfig`

mcm `JpaConfig` 미러링 + mpn 속성 이식. **McmAuditStatementInspector 는 mcm 전용이므로 제외**,
SQLite 컨버터는 **aps** 패키지 것을 사용.

```java
@Configuration
public class JpaConfig {

    @Bean @Primary
    public DataSource dataSource(Environment env) {
        HikariDataSource ds = new HikariDataSource();
        // spring.datasource.url/driver-class-name/username/password 읽어 설정 (mcm 동일)
        ds.setPoolName("mpn-host-primary");
        return ds;
    }

    @Bean @Primary
    public LocalContainerEntityManagerFactoryBean entityManagerFactory(
            @Qualifier("dataSource") DataSource dataSource,
            @Value("${spring.jpa.database-platform:}") String dialect,
            @Value("${spring.jpa.hibernate.ddl-auto:update}") String ddlAuto,
            @Value("${spring.jpa.show-sql:false}") boolean showSql,
            // ⚠️ 네이밍 전략 복제용 — cactus.jpa.* 를 직접 읽는다 (아래 ⚠️ 치명적 주의 참조)
            @Value("${cactus.jpa.table-prefix:}") String tablePrefix,
            @Value("${cactus.jpa.implicit-naming.enabled:false}") boolean implicitEnabled,
            @Value("${cactus.jpa.implicit-naming.uk-prefix:}") String ukPrefix,
            @Value("${cactus.jpa.implicit-naming.idx-prefix:}") String idxPrefix) {

        Properties props = new Properties();
        if (dialect != null && !dialect.isBlank()) props.put("hibernate.dialect", dialect);
        props.put("hibernate.hbm2ddl.auto", ddlAuto);
        props.put("hibernate.show_sql", Boolean.toString(showSql));
        props.put("hibernate.format_sql", "true");
        props.put("hibernate.default_batch_fetch_size", "100");   // ← base yml 이식

        // ⚠️⚠️ 치명적 — cactus 네이밍 전략 복제 (이게 없으면 tb_mpn_ 접두사 소실 → 전 화면 붕괴) ⚠️⚠️
        //  명시 EMF 는 CactusHibernateCustomizerAutoConfiguration(HibernatePropertiesCustomizer)을 우회한다.
        //  전략은 생성자 인자(prefix)에 의존하므로 반드시 '인스턴스'로 넣는다 (클래스명 문자열 X → no-arg 부팅실패).
        if (tablePrefix != null && !tablePrefix.isBlank()) {
            props.put("hibernate.physical_naming_strategy",
                    new PrefixedSnakePhysicalNamingStrategy(tablePrefix));        // tb_mpn_
        } else {
            props.put("hibernate.physical_naming_strategy", new SnakePhysicalNamingStrategy());
        }
        if (implicitEnabled) {
            props.put("hibernate.implicit_naming_strategy",
                    new CactusImplicitNamingStrategy(ukPrefix, idxPrefix, tablePrefix)); // uk_mpn_/idx_mpn_
        }

        boolean sqlite = dialect != null && dialect.toLowerCase().contains("sqlite");
        if (sqlite) {
            // ← application-local.yml 이식 (명시 EMF 는 yml spring.jpa.properties 무시)
            props.put("hibernate.metadata_builder_contributor",
                    "com.dongkuk.dmes.aps.common.persistence.SqliteTemporalConverterContributor");
            props.put("hibernate.hbm2ddl.jdbc_metadata_extraction_strategy", "individually");
        }

        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(props);
        em.setPersistenceUnitName("default");
        em.setPackagesToScan("com.dongkuk.dmes.aps", "com.dongkuk.dmes.mpn");
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        return em;
    }

    @Bean @Primary
    public PlatformTransactionManager transactionManager(
            @Qualifier("entityManagerFactory") EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
```

- 기존 `JpaPersistenceProviderEnforcer`(BPP) 는 **유지**. extras EMF(cmn/if)에도
  `HibernatePersistenceProvider` 를 강제해 WildFly 배포 시 JPA 3.1/3.2 충돌(`getScopeAnnotationName`) 방지.
- `MpnApplication` 의 `@EntityScan` 은 명시 EMF `setPackagesToScan` 이 우선하므로 사실상 무효화되나
  유지해도 무해. `@EnableJpaRepositories` 는 그대로 두며 기본 ref `entityManagerFactory`(=@Primary 빈)로 바인딩.

> ### ⚠️⚠️ 치명적 주의 — 네이밍 전략 복제 누락 시 전 화면 붕괴 (2026-06-22 실DB 검증)
>
> mpn 은 `cactus.jpa.table-prefix: "tb_mpn_"` 로 **물리 테이블명에 접두사를 붙여** 운영 중이다.
> 엔티티는 `@Table(name="users")` 로 선언돼 있지만 **실제 테이블은 `tb_mpn_users`** 다.
> (실DB 확인: `users`=0건, `tb_mpn_users`=1건, MPNAPUSER 스키마 `tb_mpn_` 접두 테이블 **120개**)
>
> 이 접두사는 `PrefixedSnakePhysicalNamingStrategy` 가 런타임에 부여하며, 이 전략은
> `CactusHibernateCustomizerAutoConfiguration`(`HibernatePropertiesCustomizer`)을 통해 **Spring Boot
> 자동설정 EMF 에만** 적용된다. **명시 EMF(JpaConfig)는 이 경로를 우회**하므로 위 코드처럼
> `hibernate.physical_naming_strategy`/`implicit_naming_strategy` 를 **인스턴스로 직접 set** 하지 않으면:
>
> `@Table(name="users")` → 물리테이블 `users`(존재 안 함) → **모든 쿼리 "Invalid object name" → 전 화면 런타임 실패.**
>
> - 전략은 **생성자 인자(prefix)** 의존 → 클래스명 문자열로 주면 no-arg 생성자 없어 부팅 실패. **반드시 인스턴스.**
> - mcm 의 JpaConfig 가 네이밍 전략 없이 동작하는 이유 = mcm 엔티티는 `@Table(name="TB_MCM_...")` 로
>   **접두사까지 명시**하고 table-prefix 를 안 쓰기 때문. **mpn 과 결정적으로 다르다.**
>
> **대안(B)**: 명시 EMF 를 만들지 않고 Spring Boot 자동 EMF 를 유지한 채, `BeanFactoryPostProcessor`
> 로 `entityManagerFactory`/`dataSource`/`transactionManager` 빈 정의에 `primary=true` 만 부여하는 방법.
> 네이밍·커스터마이저가 자동 보존돼 더 안전하나 mcm 패턴과는 달라진다(통일성 ↓). 구현 시 택1.

### 5.3 `application.yml` (base) — 구조 추가

```yaml
cactus:
  datasource:
    primary-alias: biz
  jpa:
    extras:
      cmn:
        packages-to-scan: []          # Phase 2 에서 MCMAPUSER 공통 엔티티 추가
        persistence-unit-name: cactus-cmn
      if:
        packages-to-scan: []          # Phase 2 에서 EAIUSER 인터페이스 엔티티 추가
        persistence-unit-name: cactus-if
  tx:
    managers:
      txBiz: { data-source: biz }
      txCmn: { data-source: cmn }
      txIF:  { data-source: if }
    default-manager: txBiz
```

> base yml 의 `spring.jpa.properties.hibernate.{format_sql,default_batch_fetch_size}` 는 명시 EMF 전환
> 후 primary 에 미적용되므로 JpaConfig 로 이식했다(§5.2). yml 항목은 보존/주석 처리 택1.

### 5.4 `application-mssql.yml` — extras 접속정보 (mcm 패턴)

```yaml
cactus:
  datasource:
    extras:
      cmn:                                    # MCMAPUSER
        url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true
        username: MCMAPUSER
        password: MCMAPUSER_DEV
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
      if:                                     # EAIUSER
        url: jdbc:sqlserver://10.10.80.241:1433;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true
        username: EAIUSER
        password: EAIUSER_DEV
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
  jpa:
    extras:
      cmn: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      if:  { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
```

### 5.5 `application-dev.yml` — **dev 지정 스키마로 하드코딩**

dev 는 현재 지정된 개발계 DB(`172.16.2.154:5010` / `ksm_dmes`)와 스키마를 **env 플레이스홀더 없이 그대로 하드코딩**한다.
(현 `application-dev.yml` primary 는 `${DB_HOST:172.16.2.154}` 식 기본값을 쓰지만, extras 는 dev 단독 고정이므로 평문 고정)

```yaml
# application-dev.yml — dev 고정 (172.16.2.154:5010 / ksm_dmes). USER=스키마 분리.
cactus:
  datasource:
    extras:
      cmn:                                    # MCMAPUSER (공통)
        url: jdbc:sqlserver://172.16.2.154:5010;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true
        username: MCMAPUSER
        password: MCMAPUSER_DEV
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
      if:                                     # EAIUSER (인터페이스)
        url: jdbc:sqlserver://172.16.2.154:5010;databaseName=ksm_dmes;encrypt=false;trustServerCertificate=true
        username: EAIUSER
        password: EAIUSER_DEV
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
        maximum-pool-size: 5
  jpa:
    extras:
      cmn: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }  # MCMAPUSER 는 외부 스키마 → 생성 안 함
      if:  { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }  # EAIUSER CREATE 권한 없음 → 사전 생성 사용
```

> 비고: `application-mssql.yml`(§5.4, `10.10.80.241:1433`)과 dev(`172.16.2.154:5010`)는 **호스트만 다르고** 스키마(MCMAPUSER/EAIUSER)·구조는 동일하다. dev 도 mssql 과 마찬가지로 **평문 고정**(하드코딩)으로 둔다.

### 5.5b `application-prod.yml` — env 주입 (운영만 외부화)

운영은 시크릿/접속정보를 컨테이너 환경변수로 외부화한다(기본값 없음, hikari pool 명시).

```yaml
cactus:
  datasource:
    extras:
      cmn:
        url: ${MCMAPUSER_DB_URL}
        username: ${MCMAPUSER_DB_USER}
        password: ${MCMAPUSER_DB_PASSWORD}
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
      if:
        url: ${EAIUSER_DB_URL}
        username: ${EAIUSER_DB_USER}
        password: ${EAIUSER_DB_PASSWORD}
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
  jpa:
    extras:
      cmn: { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
      if:  { hibernate: { dialect: org.hibernate.dialect.SQLServerDialect, ddl-auto: none } }
```

### 5.6 `application-local.yml` + `MpnApplication` — SQLite 멀티 DS

local 에선 MCMAPUSER/EAIUSER 가 없으므로 cmn/if 를 **빈 SQLite 파일**로 둔다 (엔티티 0개라 미사용).

```yaml
# application-local.yml
cactus:
  datasource:
    extras:
      cmn: { url: jdbc:sqlite:../data/mpn-cmn.db, driver-class-name: org.sqlite.JDBC }
      if:  { url: jdbc:sqlite:../data/mpn-if.db,  driver-class-name: org.sqlite.JDBC }
  jpa:
    extras:
      cmn: { hibernate: { dialect: org.hibernate.community.dialect.SQLiteDialect, ddl-auto: none } }
      if:  { hibernate: { dialect: org.hibernate.community.dialect.SQLiteDialect, ddl-auto: none } }
```

`MpnApplication` 에 mcm 패턴의 절대경로 주입 추가 (working-dir 변동 무관하게 `src/backend/data` 해석):

```java
application.addInitializers(context -> {
    var env = context.getEnvironment();
    var profiles = Arrays.asList(env.getActiveProfiles());
    if (profiles.contains("local") && !profiles.contains("mssql")) {
        Path dir = LocalSqliteDataSource.resolveBackendDataDir();
        env.getPropertySources().addFirst(new MapPropertySource("cactusExtrasLocalSqlite", Map.of(
            "cactus.datasource.extras.cmn.url", "jdbc:sqlite:" + dir.resolve("mpn-cmn.db"),
            "cactus.datasource.extras.if.url",  "jdbc:sqlite:" + dir.resolve("mpn-if.db"))));
    }
});
```

---

## 6. 프로파일별 접속정보 매트릭스

| 프로파일 | biz (txBiz) | cmn (txCmn) | if (txIF) |
|---|---|---|---|
| local | SQLite `../data/mpn.db` | SQLite `../data/mpn-cmn.db` (빈) | SQLite `../data/mpn-if.db` (빈) |
| mssql | MSSQL MPNAPUSER @10.10.80.241:1433 ksm_dmes | MSSQL MCMAPUSER (동일 DB) | MSSQL EAIUSER (동일 DB) |
| dev (**하드코딩**) | MPNAPUSER @172.16.2.154:5010 ksm_dmes | **MCMAPUSER** @172.16.2.154:5010 (동일 DB) | **EAIUSER** @172.16.2.154:5010 (동일 DB) |
| prod | `${DB_URL}` 등 | `${MCMAPUSER_DB_*}` | `${EAIUSER_DB_*}` |

> MSSQL 은 단일 DB(ksm_dmes) 내 **USER=스키마 분리**. mcm 과 동일한 모델.
> dev/mssql 은 **호스트만 다르고**(dev=172.16.2.154:5010, mssql=10.10.80.241:1433) 스키마·구조는 동일하며 둘 다 평문 고정. **prod 만 env 외부화.**

---

## 7. 부팅 검증 포인트 / 기대 로그

```
[Cactus] extras DataSource — bean='cactusDataSourceCmn' alias='cmn' url=...
[Cactus] extras DataSource — bean='cactusDataSourceIf'  alias='if'  url=...
[Cactus] extras EMF + TxMgr — name='cmn' emf='cactusEntityManagerFactoryCmn' tx='cactusTransactionManagerCmn' packages=[]
[Cactus] extras EMF + TxMgr — name='if'  emf='cactusEntityManagerFactoryIf'  tx='cactusTransactionManagerIf'  packages=[]
[Cactus] primary DataSource alias — dataSource → 'biz'
[Cactus Tx] alias — 'txBiz' → 'transactionManager'
[Cactus Tx] alias — 'txCmn' → 'cactusTransactionManagerCmn'
[Cactus Tx] alias — 'txIF'  → 'cactusTransactionManagerIf'
[Cactus Tx] default TxMgr @Primary — 'transactionManager' (alias 'txBiz')
```

---

## 8. 리스크 & 대응

| # | 리스크 | 영향 | 대응 |
|---|---|---|---|
| **R0** 🔴 | **명시 EMF 가 cactus 네이밍 커스터마이저 우회 → `tb_mpn_` 접두사 소실** | **전 화면 "Invalid object name" 런타임 붕괴** (실DB: 물리테이블 120개가 `tb_mpn_*`, `users`=0건) | §5.2 에서 `PrefixedSnakePhysicalNamingStrategy("tb_mpn_")` + `CactusImplicitNamingStrategy(...)` **인스턴스 직접 set** (필수). 또는 대안 B(자동 EMF 유지 + BFPP primary 부여) |
| R1 | 명시 EMF 가 yml `spring.jpa.properties` 무시 | SQLite local temporal 깨짐, batch fetch 누락 | §5.2 에서 JpaConfig 로 전부 이식 |
| R2 | EMF/DataSource @Primary 모호성 | 타입 주입 NoUniqueBeanDefinition | JpaConfig 가 primary 에 @Primary 명시 |
| R3 | local 에 MCMAPUSER/EAIUSER 부재 | 부팅 실패 | cmn/if 를 빈 SQLite 로, 엔티티 0개 |
| R4 | WildFly 배포 시 JPA 3.1/3.2 충돌 | `getScopeAnnotationName` NoSuchMethodError | `JpaPersistenceProviderEnforcer` 유지(extras 포함 전 EMF 강제) |
| R5 | cactus-core 핀(1.0.18)이 멀티-TM 미포함 버전 | 외부 publish 시 기능 누락 | §5.1 핀을 1.0.22 로 (로컬은 composite 라 무영향) |
| R6 | `cactus.tx.managers.txCmn.data-source='cmn'` 미해결 | 부팅 실패(IllegalStateException) | extras.cmn 정의 필수 — 전 프로파일에 cmn/if 동반 정의 |
| R7 | 분산 트랜잭션 기대 | MPNAPUSER+MCMAPUSER 원자성 불가 | 설계상 resource-local 명시, 필요 시 별도 과제 |

---

## 9. 구현 체크리스트 (실행 시)

- [ ] `mpn/lib/build.gradle` cactus-core 핀 1.0.22-SNAPSHOT (선택)
- [ ] [신규] `com.dongkuk.dmes.mpn.config.JpaConfig` (primary @Primary DS/EMF/TM + 속성 이식)
- [ ] `application.yml` primary-alias + jpa.extras(cmn/if, []) + tx.managers(txBiz/txCmn/txIF) + default
- [ ] `application-mssql.yml` extras cmn=MCMAPUSER / if=EAIUSER
- [ ] `application-dev.yml` / `application-prod.yml` extras (env 치환)
- [ ] `application-local.yml` extras 빈 SQLite + `MpnApplication` 절대경로 주입
- [ ] 부팅 검증(§7 로그) — local / mssql 양쪽
- [ ] `@Transactional("txCmn")`/`@Transactional("txIF")` 스모크 (Phase 2 엔티티 투입 후)
- [ ] mpn.war 재빌드 → D:\dmes-standard\war
- [ ] 수정 이력 md (D:\999_CLAUDE_OUTPUT)

---

## 10. 후속 (Phase 2 — 엔티티 채우기)

본 설계는 **구조 도입**까지다. 이후:

1. mpn 이 MCMAPUSER 에서 읽을 공통 엔티티(마스터/공통코드 등) 식별 → `cactus.jpa.extras.cmn.packages-to-scan` 채움
2. EAIUSER 인터페이스 송수신 엔티티 식별 → `cactus.jpa.extras.if.packages-to-scan` 채움
3. 각 EMF 전용 `@EnableJpaRepositories(basePackages=..., entityManagerFactoryRef=..., transactionManagerRef=...)`
   또는 cactus 의 리포지토리 alias 설정으로 리포지토리 바인딩
4. primary EMF 스캔 범위와 cmn/if 스캔 범위가 **겹치지 않도록** 경계 관리 (mcm 의 KMC 제외 패턴 참조)

---

## 11. 구현 반영 결과 (2026-06-22, A안 구현·부팅 검증 완료)

설계 대비 구현 중 확정/보정된 델타:

1. **클래스명 `MpnJpaConfig`** (설계의 `JpaConfig` → 개명). 이유: aps-core 에 이미
   `com.dongkuk.dmes.aps.config.JpaConfig`(감사 전용)가 있어 빈 이름 'jpaConfig' 충돌. (mcm 은 aps-core 비의존이라 무충돌)
2. **Hibernate 속성은 `@Value` 패스스루** (설계의 "SQLite 분기 하드코딩" 대신). format_sql/배치페치/
   `metadata_builder_contributor`/`jdbc_metadata_extraction_strategy` 를 yml 에서 그대로 읽어 프로파일별 동작
   정확 보존(local=SqliteTemporal / mssql=NoOp / test·dev=없음). 하드코딩 분기는 test 에 컨버터를 잘못 추가할 뻔함.
3. **primary EMF `setPackagesToScan` 에 `com.dongkuk.dmes.cactus.mastercode` 추가 필수**. 명시 EMF 는
   `MasterCodeJpaAutoConfiguration` 의 `@EntityScan` 기여(EntityScanPackages)를 우회하므로, 빠지면
   `MasterCodeItemEntity` "Not a managed type" 으로 부팅 실패. (auth 는 `cactus.auth.enabled=false` 라 제외)
4. **cactus-core 근본 버그 수정** — `CactusMultiJpaAutoConfiguration.buildEmf` 가 extras EMF 의 네이밍 전략을
   *클래스명 문자열*로 주입해, `CactusImplicitNamingStrategy`(no-arg 생성자 없음) 인스턴스화 실패
   (NoSuchMethodException). mpn 이 `implicit-naming.enabled:true` + extras 를 처음 조합해 노출. → **인스턴스
   주입**으로 수정(커스터마이저와 동일 방식). mcm/타 모듈은 해당 분기 미진입이라 무영향.
5. **부팅 검증**: `local,mssql`(실 MSSQL, ddl-auto=none) → `Started MpnApplication` 에러 0건. cactus 멀티 DS/TM
   로그 정상, local fresh 부팅 시 `create table tb_mpn_batches` 로 R0(접두사) 정상 동작 확인.
6. **잔여(무관)**: SQLite fresh CREATE 의 `comment` 구문 에러는 aps `@Comment`(43개)+community SQLiteDialect
   문제로 본 변경과 무관(mssql/dev/prod 는 ddl-auto=none 이라 영향 없음).

---

## 참조

- 정본 코드: `com.dongkuk.dmes.mcm.config.JpaConfig`, `mcm/api/src/main/resources/application*.yml`
- cactus 메커니즘: `cactus-core/.../datasource/CactusMultiDataSourceAutoConfiguration.java`,
  `.../jpa/CactusMultiJpaAutoConfiguration.java`, `.../tx/CactusMultiTransactionManagerAutoConfiguration.java`,
  `.../datasource/CactusDataSourceProperties.java`, `.../tx/CactusTxProperties.java`
- 관련 설계: 본 폴더 `oasis-multi-tx-design.md`, `oasis-multi-tx-detailed-design.md`,
  `cactus-mybatis-multi-ds-design.md`
