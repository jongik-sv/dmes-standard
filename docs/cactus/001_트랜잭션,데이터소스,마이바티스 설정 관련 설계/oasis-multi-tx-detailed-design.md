# Oasis Multi-Transaction-Manager 상세 설계

> **DB 전제 안내 (2026-10-03)**: 이 문서의 「MSSQL 운영」 서술은 dmes-ksm(MSSQL) 이관 시절 전제이며 이력으로 남긴다. 운영 DB 는 Oracle 또는 PostgreSQL 이고 MSSQL 은 거의 쓰지 않는다. 새 SQL 은 [`oracle-sql-rules.md`](../../guide/Database/oracle-sql-rules.md) 를 따른다.

> [oasis-multi-tx-design.md](./oasis-multi-tx-design.md) 의 전략 설계를 구현 단계로 구체화. 코드 작업자가 본 문서를 그대로 보고 클래스/메서드/yml 을 작성할 수 있는 수준의 상세 명세.

| 항목 | 값 |
|---|---|
| 작성일 | 2026-05-14 |
| 대상 버전 | cactus-core 1.0.21-SNAPSHOT |
| 상위 설계 | [oasis-multi-tx-design.md](./oasis-multi-tx-design.md) |
| 검증 출처 | oasis-core-5.1.0.jar / oasis-core-api-5.1.0.jar 디스어셈블 (Phase 0-A/0-B 완료) |

---

## 0. 패키지 / 파일 트리

```
src/backend/cactus-core/src/main/java/com/dongkuk/dmes/cactus/
├── datasource/
│   ├── CactusDataSourceProperties.java         ◇ 수정 (secondary 제거 → extras Map)
│   ├── CactusMultiDataSourceAutoConfiguration.java   ★ 신규
│   ├── DialectDetector.java                    (기존 유지)
│   └── (CactusSecondaryDataSourceAutoConfiguration.java) ❌ 삭제
├── jpa/
│   ├── CactusJpaProperties.java                ◇ 수정 (secondary 제거 → extras Map)
│   ├── CactusMultiJpaAutoConfiguration.java    ★ 신규
│   ├── CactusHibernateCustomizerAutoConfiguration.java (기존 유지)
│   ├── SnakePhysicalNamingStrategy.java        (기존 유지)
│   └── (CactusSecondaryJpaAutoConfiguration.java) ❌ 삭제
├── tx/
│   ├── CactusTxProperties.java                 ★ 신규
│   ├── CactusTxConfigValidator.java            ★ 신규
│   ├── CactusMultiTransactionManagerAutoConfiguration.java  ★ 신규
│   └── CactusTransactionManagerAutoConfiguration.java (기존 유지 — jpa-unified 옵션)
├── oasis/
│   ├── OasisProperties.java                    ◇ 수정 (transactionManagerName 제거, cache 추가)
│   ├── OasisAutoConfiguration.java             ◇ 수정 (serviceStarter 빈 그래프 와이어링)
│   ├── provider/                               ★ 신규 sub-package
│   │   ├── DefaultTxInjectingServiceProvider.java   ★ 신규
│   │   └── CactusCachingServiceProvider.java        ★ 신규
│   ├── converter/ (기존 유지)
│   ├── loader/ (기존 유지)
│   ├── task/ (기존 유지)
│   └── util/ (기존 유지)
└── (다른 패키지 변경 없음)

src/backend/cactus-core/src/main/resources/META-INF/spring/
└── org.springframework.boot.autoconfigure.AutoConfiguration.imports   ◇ 수정 (3개 추가, 2개 제거)

src/backend/cactus-core/src/test/java/com/dongkuk/dmes/cactus/
├── tx/
│   ├── CactusTxPropertiesTest.java             ★ 신규
│   ├── CactusTxConfigValidatorTest.java        ★ 신규
│   └── CactusMultiTransactionManagerAutoConfigurationTest.java  ★ 신규
├── datasource/
│   └── CactusMultiDataSourceAutoConfigurationTest.java  ★ 신규
├── jpa/
│   └── CactusMultiJpaAutoConfigurationTest.java  ★ 신규
└── oasis/provider/
    ├── DefaultTxInjectingServiceProviderTest.java  ★ 신규
    └── CactusCachingServiceProviderTest.java       ★ 신규

src/backend/cactus-core/build.gradle             ◇ 수정 (version → 1.0.21-SNAPSHOT)
src/backend/cactus-core/CHANGELOG.md             ◇ 수정 (1.0.21 항목 신설)
```

**범례**: ★ 신규, ◇ 수정, ❌ 삭제

---

## 1. Properties 클래스 상세

### 1-1. `CactusTxProperties` (신규)

**파일**: `tx/CactusTxProperties.java`

```java
package com.dongkuk.dmes.cactus.tx;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Multi-TxMgr 설정.
 *
 * <pre>
 * cactus:
 *   datasource:
 *     primary-alias: biz                   # 옵션 β — Spring Boot dataSource 빈을 'biz' alias
 *   tx:
 *     managers:                            # 옵션 δ — 표준 3개 (txBiz/txCmn/txIF) 명시 의무
 *       txBiz: { data-source: biz }        # 자체 DB
 *       txCmn: { data-source: cmn }        # 공통 DB (모듈이 cmn 안 쓰면 biz 로 매핑)
 *       txIF:  { data-source: if }         # 인터페이스 송수신 DB (모듈이 if 안 쓰면 biz)
 *     default: txBiz                       # 필수
 * </pre>
 *
 * <p>옵션 δ — dmes 표준 DS 패턴 (1.0.21+): biz / cmn / if. 모든 cactus 사용 모듈은
 * cactus.tx.managers 에 표준 3개 (txBiz/txCmn/txIF) 명시 의무 (CactusTxConfigValidator fail-fast).
 * DS 매핑은 자유 — 사용 안 하는 TxMgr 는 biz alias 로 매핑하여 yml 에 의도 명시.
 * JPA Repository 만 사용하고 OASIS 안 호출 안 되는 DS 는 cactus.tx.managers 에 등록 안 함
 * (cactus.datasource.extras + cactus.jpa.extras 까지만).
 *
 * <p>1.0.21-SNAPSHOT 신규. 결정 1A (txBiz/txCmn 컨벤션) + 결정 2A (default yml 명시).
 */
@ConfigurationProperties(prefix = "cactus.tx")
public class CactusTxProperties {

    /** Tier 1 화이트리스트 — yml key 가 곧 Spring 빈 이름 + BPMN 안 tx="..." 의 value */
    private Map<String, TxMgrConfig> managers = new LinkedHashMap<>();

    /**
     * 필수. Tier 2 미명시 시 DefaultTxInjectingServiceProvider 가 inject 할 TxMgr 이름.
     * managers 의 key 중 하나여야 함 (CactusTxConfigValidator 가 fail-fast 검증).
     */
    private String defaultManager;

    public Map<String, TxMgrConfig> getManagers() { return managers; }
    public void setManagers(Map<String, TxMgrConfig> managers) { this.managers = managers; }

    public String getDefaultManager() { return defaultManager; }
    public void setDefaultManager(String defaultManager) { this.defaultManager = defaultManager; }

    /** yml `default` 키 바인딩 (Java 예약어 회피 — Spring Boot 가 default → defaultManager 자동 매핑) */

    public static class TxMgrConfig {
        /**
         * 매핑할 DataSource 이름 (옵션 β).
         * - cactus.datasource.primary-alias 의 값 (예: "biz") → Spring Boot 의 dataSource 빈
         * - 그 외 → cactus.datasource.extras.{name} 의 entry 이름
         * <p>옵션 δ — 모듈이 cmn/if 사용 안 하면 같은 값 (예: "biz") 으로 매핑하여 alias 통합.
         */
        private String dataSource;

        public String getDataSource() { return dataSource; }
        public void setDataSource(String dataSource) { this.dataSource = dataSource; }
    }
}
```

**주의**:
- yml 의 `default:` 키가 Java 예약어 — Spring Boot 의 relaxed binding 이 `defaultManager` 필드로 자동 매핑. 추가 작업 불필요.
- `managers` Map 의 iteration 순서 보존 위해 `LinkedHashMap` 사용 (yml 정의 순서대로).

### 1-2. `CactusDataSourceProperties` (수정)

**파일**: `datasource/CactusDataSourceProperties.java`

```java
package com.dongkuk.dmes.cactus.datasource;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 보조 DataSource 설정 + primary alias.
 *
 * <pre>
 * cactus:
 *   datasource:
 *     primary-alias: biz                   # 옵션 β — Spring Boot 의 dataSource 빈을 'biz' 로 alias
 *     extras:                              # Map<name, DataSourceProps> — N개 보조 DS
 *       if:
 *         url: jdbc:sqlserver://.../SERAIUSER
 *         username: seraiuser
 *         driver-class-name: ...
 *         maximum-pool-size: 5
 * </pre>
 *
 * <p>1.0.21-SNAPSHOT 변경:
 * <ul>
 *   <li>`secondary` 단일 필드 제거 (결정 5C)</li>
 *   <li>`extras` Map 신규 — N개 보조 DS</li>
 *   <li>`primaryAlias` 신규 (옵션 β) — Spring Boot 의 dataSource 빈에 cactus 안에서 부를 이름 (예: 'biz').
 *       명시 시 CactusMultiDataSourceAutoConfiguration 이 spring.dataSource → primaryAlias 빈 alias 등록.
 *       null 이면 alias 등록 안 함 (cactus.tx.managers 가 spring.dataSource 를 직접 참조 불가 — primaryAlias 필수)</li>
 * </ul>
 */
@ConfigurationProperties(prefix = "cactus.datasource")
public class CactusDataSourceProperties {

    /**
     * Spring Boot 의 dataSource 빈을 cactus 안에서 부를 alias 이름.
     * 옵션 β — 'primary' magic string 회피. 예: 'biz'.
     * cactus.tx.managers.{name}.data-source 가 이 값과 일치하면 Spring Boot 의 dataSource 사용.
     */
    private String primaryAlias;

    /** Map<name, DataSourceProps> — N개 보조 DS. yml key 가 entry name */
    private Map<String, DataSourceProps> extras = new LinkedHashMap<>();

    public String getPrimaryAlias() { return primaryAlias; }
    public void setPrimaryAlias(String primaryAlias) { this.primaryAlias = primaryAlias; }

    public Map<String, DataSourceProps> getExtras() { return extras; }
    public void setExtras(Map<String, DataSourceProps> extras) { this.extras = extras; }

    public static class DataSourceProps {
        private String url;
        private String username;
        private String password;
        private String driverClassName;
        private Integer maximumPoolSize;
        private Boolean autoCommit;
        private Long connectionTimeout;
        private Long idleTimeout;
        private Long maxLifetime;

        // getters / setters (생략)
    }
}
```

### 1-3. `CactusJpaProperties` (수정)

**파일**: `jpa/CactusJpaProperties.java`

```java
package com.dongkuk.dmes.cactus.jpa;

import org.springframework.boot.context.properties.ConfigurationProperties;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JPA 설정.
 *
 * <pre>
 * cactus:
 *   jpa:
 *     snake-naming:
 *       enabled: true                      # 기존 그대로
 *     extras:                              # Map<name, ExtrasJpa> — 각 extras DS 의 EMF
 *       cmn:
 *         packages-to-scan: [...]
 *         persistence-unit-name: cactus-cmn
 *         hibernate:
 *           dialect: org.hibernate.dialect.SQLServerDialect
 *           ddl-auto: none
 * </pre>
 *
 * <p>1.0.21-SNAPSHOT — `secondary` 단일 필드 제거 (결정 5C), `extras` Map 신규.
 */
@ConfigurationProperties(prefix = "cactus.jpa")
public class CactusJpaProperties {

    private SnakeNaming snakeNaming = new SnakeNaming();

    /** Map<name, ExtrasJpa> — 각 entry 별 EMF + JpaTxMgr 자동 등록 대상 */
    private Map<String, ExtrasJpa> extras = new LinkedHashMap<>();

    // getters / setters

    public static class SnakeNaming {
        private boolean enabled = true;
        // getter / setter
    }

    public static class ExtrasJpa {
        private List<String> packagesToScan;
        private String persistenceUnitName;
        private Hibernate hibernate = new Hibernate();
        // getters / setters

        public static class Hibernate {
            private String dialect;
            private String ddlAuto = "none";
            private Map<String, String> properties = new LinkedHashMap<>();
            // getters / setters
        }
    }
}
```

### 1-4. `OasisProperties` (수정)

**파일**: `oasis/OasisProperties.java`

기존 1.0.20 의 `transactionManagerName` 필드 **제거** (결정 6B). `cache.size` 신규 추가 (R-multi-22 + N2).

```java
package com.dongkuk.dmes.cactus.oasis;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "cactus.oasis")
public class OasisProperties {

    private String serviceGroup = "app";
    private String servicePath = "/services";
    private String serviceLoaderUrl;
    private boolean transactional = false;
    // ❌ 제거 (1.0.21): private String transactionManagerName = "transactionManager";
    private String dialect;

    /** 1.0.21 신규 — CactusCachingServiceProvider 의 BPMN cache 크기 */
    private Cache cache = new Cache();

    public static class Cache {
        /** default 100. 모듈의 BPMN 개수 기준 조절 */
        private int size = 100;

        public int getSize() { return size; }
        public void setSize(int size) { this.size = size; }
    }

    public Cache getCache() { return cache; }
    public void setCache(Cache cache) { this.cache = cache; }

    // 기존 다른 getter / setter 유지
}
```

---

## 2. AutoConfiguration 클래스 상세

### 2-1. `CactusMultiDataSourceAutoConfiguration` (신규)

**파일**: `datasource/CactusMultiDataSourceAutoConfiguration.java`
**활성 조건**: `cactus.datasource.extras` 가 비어있지 않음

```java
package com.dongkuk.dmes.cactus.datasource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.ApplicationContextAware;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;

import java.util.Map;

/**
 * cactus.datasource.extras 의 각 entry 별 HikariDataSource 빈 등록.
 *
 * <p>빈 이름: cactusDataSource{Name} (PascalCase). 예: yml `cmn` → `cactusDataSourceCmn`.
 *
 * <p>R-multi-1 / R-multi-18 완화: @AutoConfiguration(after = DataSourceAutoConfiguration.class) +
 * extras 빈에 @Primary 안 붙임 → Spring Boot 의 primary DataSource 빈 자동 등록을 방해 안 함.
 */
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass(HikariDataSource.class)
@EnableConfigurationProperties(CactusDataSourceProperties.class)
public class CactusMultiDataSourceAutoConfiguration
        implements ApplicationContextAware, BeanDefinitionRegistryPostProcessor /* 또는 EventListener */ {

    // ━━━ 구현 옵션 A: BeanDefinitionRegistryPostProcessor ━━━

    private final CactusDataSourceProperties props;

    public CactusMultiDataSourceAutoConfiguration(CactusDataSourceProperties props) {
        this.props = props;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        // 1. extras 의 각 entry 별 HikariDataSource 빈 등록 + yml key alias
        for (Map.Entry<String, DataSourceProps> entry : props.getExtras().entrySet()) {
            String name = entry.getKey();                                     // 예: "if"
            DataSourceProps p = entry.getValue();
            String beanName = "cactusDataSource" + capitalize(name);          // "cactusDataSourceIf"

            GenericBeanDefinition bd = new GenericBeanDefinition();
            bd.setBeanClass(HikariDataSource.class);
            bd.setInstanceSupplier(() -> buildHikari(p, beanName));
            bd.setPrimary(false);   // R-multi-1: extras 는 절대 @Primary 아님
            bd.setDestroyMethodName("close");

            registry.registerBeanDefinition(beanName, bd);

            // ★ 신규 (Phase 0-D 검증) — BPMN ds property 작성 친화:
            //    yml key 그대로 alias 등록 → BPMN 의 <camunda:property name="ds" value="if"/> 동작
            //    Spring 의 ApplicationContext.getBean(alias) 가 alias 인식 → SqlScriptTaskExecutable 이 자연스럽게 lookup
            registry.registerAlias(beanName, name);   // alias: "if" → "cactusDataSourceIf"
        }

        // 2. 옵션 β — primary-alias 명시 시 Spring Boot dataSource 빈에 alias 등록
        //    (Spring Boot 의 DataSourceAutoConfiguration 이 'dataSource' 빈을 등록한 후 본 클래스 실행)
        String alias = props.getPrimaryAlias();
        if (alias != null && !alias.isBlank()) {
            // 이름 충돌 검사 — extras 에 같은 key 가 있으면 실패
            if (props.getExtras().containsKey(alias)) {
                throw new IllegalStateException(String.format(
                    "cactus.datasource.primary-alias='%s' 가 cactus.datasource.extras 의 key 와 충돌. " +
                    "다른 이름 사용.", alias));
            }
            // Spring Boot 의 dataSource 빈에 alias 등록 — alias = primary-alias 값 (예: 'biz')
            // 단 dataSource 빈 정의 자체는 본 시점에 아직 없을 수도 (lazy) → ContextRefreshedEvent 시점에 alias
            // 또는 BeanFactoryPostProcessor 단계에서 registry.registerAlias() 가능
            registry.registerAlias("dataSource", alias);
        }
    }

    private HikariDataSource buildHikari(DataSourceProps p, String poolName) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(p.getUrl());
        cfg.setUsername(p.getUsername());
        cfg.setPassword(p.getPassword());
        cfg.setDriverClassName(p.getDriverClassName());
        cfg.setPoolName(poolName);
        if (p.getMaximumPoolSize() != null) cfg.setMaximumPoolSize(p.getMaximumPoolSize());
        if (p.getAutoCommit() != null) cfg.setAutoCommit(p.getAutoCommit());
        if (p.getConnectionTimeout() != null) cfg.setConnectionTimeout(p.getConnectionTimeout());
        if (p.getIdleTimeout() != null) cfg.setIdleTimeout(p.getIdleTimeout());
        if (p.getMaxLifetime() != null) cfg.setMaxLifetime(p.getMaxLifetime());
        return new HikariDataSource(cfg);
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
```

**대안 구현 옵션 B**: `@Bean` 메서드를 동적으로 생성하지 않고, `@Bean` 정의 + `@Conditional` 패턴 사용 — 단 extras Map 의 동적 N개 등록은 BeanDefinitionRegistryPostProcessor 가 적합.

**검증**:
- 부팅 시 `cactusDataSourceCmn` 등 빈 등록 확인 (`actuator/beans` 또는 ApplicationContext.getBean)
- primary DataSource 가 정상 자동 생성되는지 확인 (`@ConditionalOnSingleCandidate` 가 의도대로 동작)

### 2-2. `CactusMultiJpaAutoConfiguration` (신규)

**파일**: `jpa/CactusMultiJpaAutoConfiguration.java`
**활성 조건**: `cactus.jpa.extras` 가 비어있지 않음

```java
package com.dongkuk.dmes.cactus.jpa;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.cfg.AvailableSettings;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.orm.jpa.EntityManagerFactoryBuilder;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * cactus.jpa.extras 의 각 entry 별 EntityManagerFactory + JpaTransactionManager 빈 등록.
 *
 * <p>빈 이름:
 * - EMF: cactusEntityManagerFactory{Name}
 * - TxMgr: cactusTransactionManager{Name}
 *
 * <p>각 EMF 는 동일 이름의 cactusDataSource{Name} 을 사용 (CactusMultiDataSourceAutoConfiguration 이 먼저 등록).
 */
@AutoConfiguration(after = CactusMultiDataSourceAutoConfiguration.class)
@ConditionalOnClass({EntityManagerFactory.class, LocalContainerEntityManagerFactoryBean.class})
@EnableConfigurationProperties({CactusJpaProperties.class, CactusDataSourceProperties.class})
public class CactusMultiJpaAutoConfiguration implements BeanDefinitionRegistryPostProcessor {

    private final CactusJpaProperties jpaProps;
    private final CactusDataSourceProperties dsProps;

    public CactusMultiJpaAutoConfiguration(CactusJpaProperties jpaProps,
                                            CactusDataSourceProperties dsProps) {
        this.jpaProps = jpaProps;
        this.dsProps = dsProps;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        for (Map.Entry<String, ExtrasJpa> entry : jpaProps.getExtras().entrySet()) {
            String name = entry.getKey();
            ExtrasJpa cfg = entry.getValue();
            String dsBeanName = "cactusDataSource" + capitalize(name);
            String emfBeanName = "cactusEntityManagerFactory" + capitalize(name);
            String txBeanName = "cactusTransactionManager" + capitalize(name);

            // 1. EMF 빈 정의
            GenericBeanDefinition emfBd = new GenericBeanDefinition();
            emfBd.setBeanClass(LocalContainerEntityManagerFactoryBean.class);
            emfBd.getConstructorArgumentValues();
            emfBd.setInstanceSupplier(() -> buildEmf(applicationContext, dsBeanName, cfg, name));
            emfBd.setPrimary(false);
            registry.registerBeanDefinition(emfBeanName, emfBd);

            // 2. JpaTxMgr 빈 정의
            GenericBeanDefinition txBd = new GenericBeanDefinition();
            txBd.setBeanClass(JpaTransactionManager.class);
            txBd.setInstanceSupplier(() -> {
                EntityManagerFactory emf = applicationContext.getBean(emfBeanName, EntityManagerFactory.class);
                return new JpaTransactionManager(emf);
            });
            txBd.setPrimary(false);
            registry.registerBeanDefinition(txBeanName, txBd);
        }
    }

    private LocalContainerEntityManagerFactoryBean buildEmf(
            ApplicationContext ctx, String dsBeanName, ExtrasJpa cfg, String name) {
        DataSource ds = ctx.getBean(dsBeanName, DataSource.class);

        LocalContainerEntityManagerFactoryBean emf = new LocalContainerEntityManagerFactoryBean();
        emf.setDataSource(ds);
        emf.setPackagesToScan(cfg.getPackagesToScan().toArray(new String[0]));
        emf.setPersistenceUnitName(cfg.getPersistenceUnitName() != null
                                    ? cfg.getPersistenceUnitName()
                                    : "cactus-" + name);

        HibernateJpaVendorAdapter adapter = new HibernateJpaVendorAdapter();
        emf.setJpaVendorAdapter(adapter);

        Map<String, Object> jpaProps = new HashMap<>();
        if (cfg.getHibernate().getDialect() != null)
            jpaProps.put(AvailableSettings.DIALECT, cfg.getHibernate().getDialect());
        if (cfg.getHibernate().getDdlAuto() != null)
            jpaProps.put(AvailableSettings.HBM2DDL_AUTO, cfg.getHibernate().getDdlAuto());
        if (jpaProps.getSnakeNaming().isEnabled()) {
            jpaProps.put(AvailableSettings.PHYSICAL_NAMING_STRATEGY,
                         SnakePhysicalNamingStrategy.class.getName());
        }
        jpaProps.putAll(cfg.getHibernate().getProperties());
        emf.setJpaPropertyMap(jpaProps);

        emf.afterPropertiesSet();
        return emf;
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
```

### 2-3. `CactusMultiTransactionManagerAutoConfiguration` (신규)

**파일**: `tx/CactusMultiTransactionManagerAutoConfiguration.java`
**활성 조건**: `cactus.tx.managers` 가 비어있지 않음

```java
package com.dongkuk.dmes.cactus.tx;

import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.transaction.PlatformTransactionManager;

import java.util.Map;

/**
 * cactus.tx.managers 의 각 entry 마다 TxMgr 빈 alias 등록.
 *
 * <ul>
 *   <li>data-source: primary → Spring Boot 의 transactionManager 빈에 alias (txBiz 등)</li>
 *   <li>data-source: cmn 등 → cactusTransactionManagerCmn 빈에 alias (txCmn 등)</li>
 * </ul>
 *
 * <p>cactus.tx.default 의 TxMgr 에는 @Primary 명시 (R-multi-8 — Spring Boot 의 자동 추론 회피).
 */
@AutoConfiguration(after = {
    CactusMultiJpaAutoConfiguration.class,
    org.springframework.boot.autoconfigure.transaction.TransactionAutoConfiguration.class
})
@EnableConfigurationProperties({CactusTxProperties.class, CactusJpaProperties.class})
public class CactusMultiTransactionManagerAutoConfiguration implements BeanDefinitionRegistryPostProcessor {

    private final CactusTxProperties txProps;

    public CactusMultiTransactionManagerAutoConfiguration(CactusTxProperties txProps) {
        this.txProps = txProps;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        if (txProps.getManagers().isEmpty()) return;

        for (Map.Entry<String, TxMgrConfig> entry : txProps.getManagers().entrySet()) {
            String aliasName = entry.getKey();           // 예: "txBiz", "txCmn"
            String dataSource = entry.getValue().getDataSource();
            String targetBeanName = resolveTargetBeanName(dataSource);

            // alias 등록 — Spring 의 BeanDefinitionRegistry.registerAlias()
            registry.registerAlias(targetBeanName, aliasName);

            // default 에 @Primary 명시
            if (aliasName.equals(txProps.getDefaultManager())) {
                BeanDefinition bd = registry.getBeanDefinition(targetBeanName);
                bd.setPrimary(true);
            }
        }
    }

    /**
     * data-source 이름 → 실제 TxMgr 빈 이름 매핑 (옵션 β).
     * - cactus.datasource.primary-alias 의 값과 일치 → "transactionManager" (Spring Boot 자동 등록)
     * - cactus.jpa.extras.{name} 정의됨 → "cactusTransactionManager{Name}" (JpaTransactionManager, CactusMultiJpaAutoConfiguration 이 등록)
     * - cactus.jpa.extras.{name} 미정의 → "cactusTransactionManager{Name}" (DataSourceTransactionManager, 본 클래스가 직접 등록)
     *
     * <p>예: cactus.datasource.primary-alias=biz + cactus.tx.managers.txBiz: { data-source: biz }
     *      → "biz" == primary-alias → Spring Boot 의 transactionManager 빈에 alias
     *
     * <p>예: cactus.tx.managers.txIF: { data-source: if } + cactus.jpa.extras.if 미정의
     *      → if DataSource 만 있고 EMF 없음 → DataSourceTransactionManager 로 alias.
     *      SqlScriptTask 의 직접 SQL 호출에는 충분.
     */
    private String resolveTargetBeanName(String dataSource) {
        if (dsProps.getPrimaryAlias() != null && dsProps.getPrimaryAlias().equals(dataSource)) {
            return "transactionManager";
        }
        return "cactusTransactionManager" + capitalize(dataSource);
    }

    /**
     * EMF 부재 케이스에 DataSourceTransactionManager 빈 직접 등록.
     * CactusMultiJpaAutoConfiguration 이 EMF 등록 안 한 extras DS 에 대해 본 클래스가 fallback.
     */
    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        // ... (기존 alias 등록 + @Primary 명시 외에)

        // fallback: EMF 없는 extras DS 의 TxMgr 등록
        for (String dsName : dsProps.getExtras().keySet()) {
            String txBeanName = "cactusTransactionManager" + capitalize(dsName);
            if (registry.containsBeanDefinition(txBeanName)) continue;   // JpaTxMgr 이미 있음

            // DataSourceTransactionManager 직접 등록
            String dsBeanName = "cactusDataSource" + capitalize(dsName);
            GenericBeanDefinition bd = new GenericBeanDefinition();
            bd.setBeanClass(DataSourceTransactionManager.class);
            bd.setInstanceSupplier(() -> {
                DataSource ds = applicationContext.getBean(dsBeanName, DataSource.class);
                return new DataSourceTransactionManager(ds);
            });
            registry.registerBeanDefinition(txBeanName, bd);
        }
    }
}
```

**주의**:
- alias 는 같은 빈 인스턴스를 다른 이름으로 노출. 즉 `txBiz` 와 `transactionManager` 가 같은 객체.
- `setPrimary(true)` 는 alias 가 아닌 *대상 빈 정의* 에 적용.

### 2-4. `CactusTxConfigValidator` (신규)

**파일**: `tx/CactusTxConfigValidator.java`
**시점**: `ContextRefreshedEvent` (m4 결정)

```java
package com.dongkuk.dmes.cactus.tx;

import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import org.springframework.context.ApplicationContext;
import org.springframework.context.event.ContextRefreshedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.stream.Collectors;

/**
 * cactus.tx.* 설정의 부팅 시 fail-fast 검증.
 *
 * <p>시점: ContextRefreshedEvent (web server start 전, 빈 그래프 완성 직후) — m4 결정.
 * ApplicationReadyEvent 는 web server start 후라 부분 시작 상태 위험.
 */
@Component
public class CactusTxConfigValidator {

    private final CactusTxProperties txProps;
    private final OasisProperties oasisProps;
    private final CactusDataSourceProperties dsProps;
    private final ApplicationContext appContext;

    public CactusTxConfigValidator(CactusTxProperties txProps,
                                    OasisProperties oasisProps,
                                    CactusDataSourceProperties dsProps,
                                    ApplicationContext appContext) {
        this.txProps = txProps;
        this.oasisProps = oasisProps;
        this.dsProps = dsProps;
        this.appContext = appContext;
    }

    private static final Set<String> STANDARD_TX_NAMES = Set.of("txBiz", "txCmn", "txIF");
    private static final Set<String> RESERVED_BEAN_NAMES = Set.of(
        "dataSource", "transactionManager", "entityManagerFactory");   // Spring Boot 표준

    @EventListener(ContextRefreshedEvent.class)
    public void validate() {
        // 검증 1: transactional=true 인데 managers 비어있음
        if (oasisProps.isTransactional() && txProps.getManagers().isEmpty()) {
            throw new IllegalStateException(
                "cactus.oasis.transactional=true 이면 cactus.tx.managers 에 표준 3개 (txBiz, txCmn, txIF) 정의 필수.");
        }

        // 검증 1-bis (옵션 δ): 표준 3개 모두 명시되어 있는지 강제
        if (oasisProps.isTransactional()) {
            Set<String> missing = new TreeSet<>(STANDARD_TX_NAMES);
            missing.removeAll(txProps.getManagers().keySet());
            if (!missing.isEmpty()) {
                throw new IllegalStateException(String.format(
                    "cactus.tx.managers 에 표준 3개 중 누락: %s. " +
                    "cactus 사용 모듈은 biz/cmn/if 3개 모두 명시 의무. " +
                    "모듈이 사용 안 하면 data-source 를 biz alias 로 매핑하여 명시. 예: txCmn: { data-source: biz }",
                    missing));
            }
        }

        // 검증 1-ter (R-multi-25): 같은 DS 매핑 시 warn — 비대칭 commit/rollback 불가
        Map<String, List<String>> dsToAliases = txProps.getManagers().entrySet().stream()
            .collect(Collectors.groupingBy(
                e -> e.getValue().getDataSource(),
                Collectors.mapping(Map.Entry::getKey, Collectors.toList())));
        dsToAliases.forEach((ds, aliases) -> {
            if (aliases.size() > 1) {
                log.warn("[Cactus Tx] 같은 DS '{}' 에 여러 alias 매핑: {}. " +
                         "BPMN 의 commitTx 비대칭 commit/rollback 의도는 같은 트랜잭션이라 깨질 수 있음 (R-multi-25). " +
                         "다른 DS 로 분리 또는 비대칭 정책 사용 금지.",
                         ds, aliases);
            }
        });

        // 검증 1-quater (R-multi-28): cactus.datasource.extras key 충돌 검증
        String primaryAlias = dsProps.getPrimaryAlias();
        for (String extrasKey : dsProps.getExtras().keySet()) {
            List<String> conflicts = new ArrayList<>();
            if (primaryAlias != null && primaryAlias.equals(extrasKey)) conflicts.add("cactus.datasource.primary-alias");
            if (RESERVED_BEAN_NAMES.contains(extrasKey)) conflicts.add("Spring Boot 표준 빈 이름");
            if (extrasKey.startsWith("cactus")) conflicts.add("cactus 자체 빈 prefix");
            if (!conflicts.isEmpty()) {
                throw new IllegalStateException(String.format(
                    "cactus.datasource.extras.%s 의 key '%s' 가 다음과 충돌: %s. " +
                    "alias 등록이 silent overwrite 또는 IllegalStateException 가능. " +
                    "다른 이름 사용 (의미 있는 약자 권장 — biz/cmn/if 외 모듈별 이름).",
                    extrasKey, extrasKey, conflicts));
            }
        }

        if (txProps.getManagers().isEmpty()) return;   // multi-tx 비활성화 시 이하 skip

        // 검증 2: default 가 managers 에 없음
        String def = txProps.getDefaultManager();
        if (def == null || def.isBlank()) {
            throw new IllegalStateException(
                "cactus.tx.default 키 필수. cactus.tx.managers 의 key 중 하나로 명시. " +
                "사용 가능: " + txProps.getManagers().keySet());
        }
        if (!txProps.getManagers().containsKey(def)) {
            throw new IllegalStateException(String.format(
                "cactus.tx.default='%s' 이 cactus.tx.managers 에 없습니다. 사용 가능: %s",
                def, txProps.getManagers().keySet()));
        }

        // 검증 3: 각 manager 의 data-source 가 primary-alias 또는 extras 의 entry (옵션 β)
        String primaryAlias = dsProps.getPrimaryAlias();
        for (Map.Entry<String, TxMgrConfig> e : txProps.getManagers().entrySet()) {
            String name = e.getKey();
            String ds = e.getValue().getDataSource();
            if (ds == null || ds.isBlank()) {
                throw new IllegalStateException(String.format(
                    "cactus.tx.managers.%s.data-source 키 필수.", name));
            }
            boolean isPrimary = primaryAlias != null && primaryAlias.equals(ds);
            boolean isExtra = dsProps.getExtras().containsKey(ds);
            if (!isPrimary && !isExtra) {
                String available = (primaryAlias != null ? primaryAlias + ", " : "")
                    + dsProps.getExtras().keySet().stream().collect(Collectors.joining(", "));
                throw new IllegalStateException(String.format(
                    "TxMgr '%s' 의 data-source='%s' 가 cactus.datasource.primary-alias 또는 extras 에 정의 안 됨. " +
                    "사용 가능: [%s]",
                    name, ds, available));
            }
        }

        // 검증 3-bis (옵션 β): primary-alias 명시 시 Spring Boot 의 dataSource 빈 존재 검증
        if (primaryAlias != null && !primaryAlias.isBlank()) {
            if (!appContext.containsBean("dataSource")) {
                throw new IllegalStateException(String.format(
                    "cactus.datasource.primary-alias='%s' 명시했지만 Spring Boot 의 dataSource 빈이 " +
                    "ApplicationContext 에 없음. spring.datasource.* 정의 확인.", primaryAlias));
            }
        }

        // 검증 4: alias 의 대상 빈이 ApplicationContext 에 존재
        for (String aliasName : txProps.getManagers().keySet()) {
            if (!appContext.containsBean(aliasName)) {
                throw new IllegalStateException(String.format(
                    "TxMgr alias '%s' 의 대상 빈이 ApplicationContext 에 없음. " +
                    "CactusMultiTransactionManagerAutoConfiguration 의 alias 등록이 실패한 것일 수 있음.",
                    aliasName));
            }
        }

        // 검증 5: extras DS 가 있는데 EMF 가 없으면 WARN (MyBatis 전용 가능)
        // (logger.warn() 으로 출력, throw 안 함)
    }
}
```

**테스트**:
- 정상 yml — 검증 통과
- `transactional=true` + `managers` 비어있음 → IllegalStateException
- `default` 가 `managers` 에 없음 → IllegalStateException
- `data-source` 가 `extras` 에도 없는 이름 → IllegalStateException
- alias 빈 부재 → IllegalStateException

---

## 3. ServiceProvider Wrapper 클래스 상세

### 3-1. `DefaultTxInjectingServiceProvider` (신규)

**파일**: `oasis/provider/DefaultTxInjectingServiceProvider.java`

```java
package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.PropertyNames;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

/**
 * BPMN load 시 PropertyContainer 에 tx=<default> 자동 inject.
 *
 * <p>oasis-core 5.1.0 의 SpringTransactionHandler.execute() 가 required (= process.getProperty("tx"))
 * 가 비어있으면 Tier 1 의 *모든* TxMgr 일괄 begin (R-multi-11). cactus 1.0.21 은 default 1개만 begin
 * 정책 (옵션 α) — 본 wrapper 가 BPMN load 단계에서 default 1개를 자동 inject 하여 분기 ④ 도달 자체를 막음.
 *
 * <p>Phase 0-B 검증 결과: PropertyContainer.add() 가 mutate 가능 (Map 기반, 중복 시 IllegalStateException).
 * 따라서 inject 전 hasProperty 가드 필수 (R-multi-19).
 *
 * <p>R-multi-20 보강: BPMN 의 빈 문자열 명시 (tx="") 도 inject 대상으로 처리.
 */
public class DefaultTxInjectingServiceProvider implements ServiceProvider {

    private final ServiceProvider delegate;
    private final String defaultTxMgr;

    public DefaultTxInjectingServiceProvider(ServiceProvider delegate, String defaultTxMgr) {
        if (delegate == null) throw new NullPointerException("delegate ServiceProvider null");
        if (defaultTxMgr == null || defaultTxMgr.isBlank())
            throw new NullPointerException("defaultTxMgr null/blank");
        this.delegate = delegate;
        this.defaultTxMgr = defaultTxMgr;
    }

    @Override
    public Service service(String serviceId) {
        Service svc = delegate.service(serviceId);
        Process process = svc.process();
        PropertyContainer pc = process.properties();

        if (needsInject(pc)) {
            pc.add(new Property(PropertyNames.TRANSACTION_MANAGER_NAME, defaultTxMgr));
        }
        return svc;
    }

    /**
     * inject 필요 판단:
     * - tx property 자체가 없거나
     * - tx property 가 있는데 value 가 null/blank 인 경우 (R-multi-20)
     *
     * <p>두 번째 case 는 add() 가 IllegalStateException throw 하므로 사실상 처리 불가.
     * → BPMN 작성자가 빈 value 명시한 경우는 fail-fast (oasis-core 가 런타임에 throw).
     * 본 wrapper 는 "property 자체 없음" 만 inject.
     */
    private boolean needsInject(PropertyContainer pc) {
        return !pc.hasProperty(PropertyNames.TRANSACTION_MANAGER_NAME);
    }
}
```

**주의**:
- `PropertyContainer.add(Property)` 는 **mutate** (Phase 0-B 디스어셈블 확정). 반환값은 self (builder pattern) 이지만 mutation 이 부수 효과.
- 중복 add 시 `IllegalStateException("[tx] is a duplicate attribute")` throw — 반드시 `hasProperty` 가드 필수.
- Race condition (R-multi-21): `CactusCachingServiceProvider` 가 정상 동작하면 cache hit 시 mutate 없음 → 안전. miss 시 각 thread 가 새 Process 인스턴스 받으므로 안전.

### 3-2. `CactusCachingServiceProvider` (신규)

**파일**: `oasis/provider/CactusCachingServiceProvider.java`

```java
package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;
import com.dongkuk.oasis.cache.SizeBaseCacheService;
import com.dongkuk.oasis.model.Service;
import com.dongkuk.oasis.provider.ServiceProvider;

/**
 * BPMN 파싱 결과를 명시적으로 캐시.
 *
 * <p>oasis-core 5.1.0 의 CachingServiceProvider 는 cache.cache() 호출 누락으로 사실상 미동작 (R-multi-22).
 * 본 wrapper 가 명시적으로 cache.cache(serviceId, result) 호출하여 정상 캐시.
 *
 * <p>Thread-safety: SizeBaseCacheService 가 자체 lock 보유 (cache(K,V) synchronized + getObject(K) lock 블록).
 * 본 wrapper 는 추가 동기화 불필요.
 *
 * <p>Cache miss race: 두 thread 가 동시 miss → 둘 다 underlying 호출 → 각자 cache.cache() — 마지막 put 이 승.
 * 두 호출이 같은 결과 (BPMN 동일) 라 정합성 영향 없음.
 */
public class CactusCachingServiceProvider implements ServiceProvider {

    private final ServiceProvider delegate;
    private final CacheService<String, Service> cache;

    public CactusCachingServiceProvider(ServiceProvider delegate, CacheService<String, Service> cache) {
        if (delegate == null) throw new NullPointerException("delegate null");
        if (cache == null) throw new NullPointerException("cache null");
        this.delegate = delegate;
        this.cache = cache;
    }

    /** 편의 ctor — default SizeBaseCacheService(size) 사용 */
    public CactusCachingServiceProvider(ServiceProvider delegate, int cacheSize) {
        this(delegate, new SizeBaseCacheService<>(cacheSize));
    }

    @Override
    public Service service(String serviceId) {
        Service cached = cache.getObject(serviceId);
        if (cached != null) return cached;

        Service svc = delegate.service(serviceId);
        cache.cache(serviceId, svc);    // ← 핵심: oasis-core 가 누락한 호출
        return svc;
    }

    /** 디버그 / 운영 도구용 — 캐시 비우기 */
    public void evictAll() {
        cache.evict();
    }
}
```

---

## 4. OasisAutoConfiguration 수정 상세

**파일**: `oasis/OasisAutoConfiguration.java`

### 4-1. import 추가

```java
import com.dongkuk.dmes.cactus.oasis.provider.CactusCachingServiceProvider;
import com.dongkuk.dmes.cactus.oasis.provider.DefaultTxInjectingServiceProvider;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
```

### 4-2. `serviceStarter()` 메서드 수정

```java
@Bean
@ConditionalOnMissingBean
public ServiceStarter serviceStarter(OasisProperties props,
                                     CactusTxProperties txProps,
                                     ApplicationContext ctx) {
    String url = trimToNull(props.getServiceLoaderUrl());
    String path = props.getServicePath();

    if (props.isTransactional()) {
        // ─── transactional 모드 ───
        if (txProps.getManagers().isEmpty()) {
            throw new IllegalStateException(
                "cactus.oasis.transactional=true 이면 cactus.tx.managers 에 최소 1개 TxMgr 정의 필수. " +
                "(상세 검증은 CactusTxConfigValidator)");
        }

        String[] tmNames = txProps.getManagers().keySet().toArray(new String[0]);
        SpringServiceStarterFactory factory = new SpringServiceStarterFactory(ctx, tmNames);

        ServiceProvider provider;
        if (url != null) {
            log.info("[Cactus Oasis] transactional + HTTP loader — {}", url);
            provider = new GenericServiceProvider(
                    new CamundaBpmnServiceUnmarshaller(),
                    new HttpServiceDocumentLoader(url, 10));
        } else {
            log.info("[Cactus Oasis] transactional + classpath loader — {}, default={}, managers={}",
                     path, txProps.getDefaultManager(), Arrays.toString(tmNames));
            provider = new SimpleServiceProvider(path, "bpmn", FILE_DESCRIPTION_DELIMITER);
        }

        // ★ 1.0.21 핵심: inject + cache 명시 wrapping
        ServiceProvider injecting = new DefaultTxInjectingServiceProvider(
                provider, txProps.getDefaultManager());
        ServiceProvider caching = new CactusCachingServiceProvider(
                injecting, props.getCache().getSize());
        factory.setServiceProvider(caching);

        return factory.generateServiceStarter();
    }

    // ─── non-transactional 모드 (기존 그대로 유지) ───
    if (url != null) {
        throw new IllegalStateException(
            "cactus.oasis.service-loader-url 은 cactus.oasis.transactional=true 일 때만 사용 가능합니다. " +
            "oasis-core 5.1.0 의 NonTransactionalServiceStarterFactory 는 setServiceProvider 미지원.");
    }
    log.info("[Cactus Oasis] non-transactional + classpath loader — {}", path);
    NonTransactionalServiceStarterFactory factory = new NonTransactionalServiceStarterFactory();
    factory.setServiceDocumentDirectory(path);
    factory.setFileDescriptionDelimiter(FILE_DESCRIPTION_DELIMITER);
    return factory.generateServiceStarter();
}
```

### 4-3. 제거되는 코드

- `OasisProperties.transactionManagerName` 필드 + getter/setter 모두 제거
- 기존 `props.getTransactionManagerName()` 호출 모두 제거 — `txProps.getManagers().keySet()` 으로 대체

---

## 5. AutoConfiguration.imports 변경

**파일**: `cactus-core/src/main/resources/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`

```diff
 com.dongkuk.dmes.cactus.autoconfigure.CactusAutoConfiguration
 com.dongkuk.dmes.cactus.autoconfigure.SecurityAutoConfiguration
 com.dongkuk.dmes.cactus.autoconfigure.CactusAuthAutoConfiguration
 com.dongkuk.dmes.cactus.autoconfigure.CactusWebSecurityAutoConfiguration
 com.dongkuk.dmes.cactus.audit.AuditAutoConfiguration
 com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration
 com.dongkuk.dmes.cactus.web.inbound.InboundAutoConfiguration
 com.dongkuk.dmes.cactus.web.inbound.MasterCodeCacheAutoConfiguration
 com.dongkuk.dmes.cactus.mastercode.MasterCodeJpaAutoConfiguration
 com.dongkuk.dmes.cactus.mastercode.MasterCodeMybatisAutoConfiguration
 com.dongkuk.dmes.cactus.mybatis.CactusMybatisAutoConfiguration
 com.dongkuk.dmes.cactus.jpa.CactusHibernateCustomizerAutoConfiguration
-com.dongkuk.dmes.cactus.jpa.CactusSecondaryJpaAutoConfiguration
-com.dongkuk.dmes.cactus.datasource.CactusSecondaryDataSourceAutoConfiguration
+com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration
+com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration
+com.dongkuk.dmes.cactus.tx.CactusMultiTransactionManagerAutoConfiguration
 com.dongkuk.dmes.cactus.tx.CactusTransactionManagerAutoConfiguration
```

> `DefaultTxInjectingServiceProvider` / `CactusCachingServiceProvider` 는 별도 imports 항목 없음 — `OasisAutoConfiguration#serviceStarter()` 안에서 직접 인스턴스화.
>
> `CactusTxConfigValidator` 도 imports 없음 — `@Component` annotation 으로 cactus 패키지 스캔에 잡힘 (CactusAutoConfiguration 의 `@ComponentScan(basePackages="com.dongkuk.dmes.cactus")` 적용).

---

## 6. yml 키 마이그레이션 매핑 (1.0.20 → 1.0.21)

### 6-0. 마이그레이션 핵심 정책 (2026-05-15 결정)

KMC 메타 entity (AppHost / SeraiConfig / Topic) 의 보관 위치를 dmes 표준 `if` DS 로 통합한다.
local 환경의 caravan.db / serai-if.db 두 sqlite 파일도 단일 `if` DB 로 통합 — serai 모듈의 caravan
설정 + spring.datasource.if 가 모두 같은 DS 를 가리키도록 변경. prod 는 기존 SERAIUSER schema 그대로
(SERAI 의 caravan 메타 + IF_* + KMC 메타 동일 schema 의 다른 테이블 그룹).

→ mcm 의 `cactus.datasource.extras.if` 가 KMC 메타 + SERAI IF + caravan 메타 모두 호스팅
→ `cactus.jpa.extras.if.packages-to-scan` 에 KMC 메타 entity 3종 등록 → JpaTxMgr 자동 등록
→ serai 모듈 변경 (caravan + spring.datasource.if 통합) 은 본 마이그레이션의 별도 작업 (§6-6 참고)

### 6-1. mcm/api/application.yml — 공통

```diff
 cactus:
   oasis:
     service-group: mcm
-    transaction-manager-name: transactionManager   # 1.0.21 폐기 (cactus.tx.default 로 대체)
     transactional: true
     dialect: mssql
+    cache:
+      size: 100
-  jpa:
-    secondary:
-      packages-to-scan:
-        - com.dongkuk.dmes.kmc.host
-        - com.dongkuk.dmes.kmc.seraiconfig
-        - com.dongkuk.dmes.kmc.topic
-      persistence-unit-name: cactus-kmc-secondary
+  datasource:
+    primary-alias: biz                # 옵션 β — Spring Boot dataSource 빈을 'biz' alias
+  jpa:
+    extras:
+      if:                             # KMC 메타 + SERAI IF + caravan 메타 통합 DS
+        packages-to-scan:             # KMC 메타 entity 3종 (이전 secondary.packages-to-scan)
+          - com.dongkuk.dmes.kmc.host
+          - com.dongkuk.dmes.kmc.seraiconfig
+          - com.dongkuk.dmes.kmc.topic
+        persistence-unit-name: cactus-if
+  tx:
+    managers:                         # 옵션 δ — 표준 3개 (txBiz/txCmn/txIF) 명시 의무
+      txBiz:
+        data-source: biz              # ← primary-alias (mcm 자체 DB)
+      txCmn:
+        data-source: biz              # ← mcm 은 cmn 안 씀, biz alias 매핑 (yml 에 의도 명시)
+      txIF:
+        data-source: if               # SERAI IF + KMC 메타 + caravan 메타 통합
+    default-manager: txBiz            # CactusTxProperties.defaultManager — yml `default` 는 Java 예약어라 매핑 불가 (Phase 6 검증 발견)
```

### 6-2. mcm/api/application-local.yml — local sqlite

```diff
-cactus:
-  datasource:
-    secondary:
-      url: jdbc:sqlite:../data/caravan.db
-      driver-class-name: org.sqlite.JDBC
-  jpa:
-    secondary:
-      enabled: true
-      hibernate:
-        dialect: com.dongkuk.dmes.mcm.config.CactusSqliteIfNotExistsDialect
-        ddl-auto: update
-        show-sql: true
+cactus:
+  datasource:
+    extras:
+      if:                              # ★ caravan.db / serai-if.db 통합 (local). 통합 파일명 결정 필요.
+        url: jdbc:sqlite:../data/serai-if.db
+        driver-class-name: org.sqlite.JDBC
+  jpa:
+    extras:
+      if:
+        hibernate:
+          dialect: com.dongkuk.dmes.mcm.config.CactusSqliteIfNotExistsDialect
+          ddl-auto: update
+          show-sql: true
```

> **주의**: local sqlite 통합 파일명은 `serai-if.db` 권장 (serai 의 기존 spring.datasource.if 위치 그대로).
> caravan.db 의 기존 데이터 (caravan 메타 + KMC 메타) 를 serai-if.db 로 옮기는 마이그레이션 필요.
> mcm/serai 가 같은 파일 가리키므로 SQLite file-level lock contention — 별도 프로세스 동시 실행 시 검증.
> 운영(mssql) 은 SERAIUSER schema 공유라 lock 무관.

### 6-3. mcm/api/application-mssql.yml (또는 dev/prod)

```diff
+cactus:
+  datasource:
+    extras:
+      if:                              # SERAIUSER schema — SERAI / caravan / KMC 메타 동일 DB
+        url: jdbc:sqlserver://localhost:1433;databaseName=SERAIUSER;encrypt=false;trustServerCertificate=true
+        username: seraiuser
+        password: q1w2e3r4##
+        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
+        maximum-pool-size: 5
+  jpa:
+    extras:
+      if:
+        hibernate:
+          dialect: org.hibernate.dialect.SQLServerDialect
+          ddl-auto: none               # 운영 — schema 변경 안 함
```

### 6-4. mcm 코드 변경 — KmcSecondaryJpaConfig.java **삭제** + yml 두 줄 추가

> 2026-05-15 갱신 — kmc-core 0.2.0 패턴 B 도입으로 mcm 의 `KmcSecondaryJpaConfig.java` **자체 폐기**.
> kmc-core 가 자체 `@EnableJpaRepositories` (KmcJpaAutoConfiguration) + alias 등록
> (KmcEmfAliasAutoConfiguration) 처리. 호스트는 yml 두 줄로 EMF/TxMgr 빈 이름 명시만.

```diff
 # mcm/api/src/main/resources/application.yml
+kmc:
+  repository:
+    emf-bean: cactusEntityManagerFactoryIf
+    tx-bean:  cactusTransactionManagerIf
```

```diff
 // mcm/api/src/main/java/kr/co/ksm/dmes/mcm/config/KmcSecondaryJpaConfig.java
- @Configuration
- @ConditionalOnProperty(prefix = "cactus.jpa.secondary", name = "enabled", havingValue = "true")
- @EnableJpaRepositories(
-     basePackages = {
-         "com.dongkuk.dmes.kmc.host",
-         "com.dongkuk.dmes.kmc.seraiconfig",
-         "com.dongkuk.dmes.kmc.topic"
-     },
-     entityManagerFactoryRef = "cactusSecondaryEntityManagerFactory",
-     transactionManagerRef   = "cactusSecondaryTransactionManager"
- )
- public class KmcSecondaryJpaConfig { }
+ // 파일 삭제 — kmc-core 0.2.0 의 KmcJpaAutoConfiguration + KmcEmfAliasAutoConfiguration 가 대체
```

**동작 흐름** (마이그레이션 후):
1. cactus-core `CactusMultiJpaAutoConfiguration` (BDRPP) — `cactusEntityManagerFactoryIf` + `cactusTransactionManagerIf` 빈 정의 등록 (mcm yml `cactus.jpa.extras.if` 기반)
2. kmc-core `KmcEmfAliasAutoConfiguration` (BFPP) — yml `kmc.repository.{emf-bean, tx-bean}` 읽어서 위 빈에 alias 등록 (`kmcEntityManagerFactory` / `kmcTransactionManager`)
3. kmc-core `KmcJpaAutoConfiguration` — `@EnableJpaRepositories(basePackages={kmc.host,...}, refs="kmc*")` 로 KMC 메타 Repository 빈 등록 (alias 통해 if EMF/TxMgr 사용)
4. mcm 호스트 — KMC 콘솔 controller 가 KMC Repository 호출 정상

**미수정 시 영향**:
- yml 두 줄 미명시 → KmcJpaAutoConfiguration 비활성 → KMC Repository 등록 안 됨 → KMC 콘솔 기능 죽음
- 따라서 mcm Phase 6 마이그레이션 시 §6-1 (yml) + §6-5 (PropertySource) + 본 §6-4 (yml 두 줄) 모두 한 PR 에서 처리 권장

### 6-5. mcm 코드 변경 — McmApplication.java (PropertySource 키)

```diff
 application.addInitializers(context -> {
     ConfigurableEnvironment env = context.getEnvironment();
     if (Arrays.asList(env.getActiveProfiles()).contains("local")) {
-        String url = "jdbc:sqlite:" + LocalSqliteDataSource.resolveBackendDataDir().resolve("caravan.db");
+        String url = "jdbc:sqlite:" + LocalSqliteDataSource.resolveBackendDataDir().resolve("serai-if.db");
         env.getPropertySources().addFirst(new MapPropertySource(
-                "cactusSecondaryLocalSqlite",
-                Map.of("cactus.datasource.secondary.url", url)));
+                "cactusIfLocalSqlite",
+                Map.of("cactus.datasource.extras.if.url", url)));
     }
 });
```

**변경 요점**:
- 통합 파일명 (`serai-if.db`) 으로 변경 (§6-2 결정 반영).
- yml 키 `cactus.datasource.secondary.url` 폐기 → `cactus.datasource.extras.if.url`.
- PropertySource 이름 `cactusSecondaryLocalSqlite` → `cactusIfLocalSqlite` (cosmetic).
- 미수정 시 local 환경에서 cactus.datasource.extras.if.url 미설정 →
  `CactusMultiDataSourceAutoConfiguration` 이 if 빈 등록 안 함 → §6-4 의 `@ConditionalOnBean` false →
  KMC Repository 비활성. **부팅은 정상이지만 KMC 콘솔 기능 죽음**.

### 6-6. serai 모듈 변경 (별도 작업 — Phase 6 의 후속 또는 병행)

mcm 의 `cactus.datasource.extras.if` 가 SERAI / caravan / KMC 메타 통합 DS 가리키려면 serai 모듈도 같은
DB 가리키도록 통합 필요.

**serai 의 기존 구조** (`serai/src/main/resources/application-local.yml`):
- `spring.datasource.mst` = `../data/serai-mst.db` (serai 자체 마스터 — 유지)
- `spring.datasource.if` = `../data/serai-if.db` (SERAI IF — if 통합 대상)
- caravan 라이브러리 = `../data/caravan.db` (caravan 메타 — if 통합 대상)

**통합 후**:
- `spring.datasource.mst` = `../data/serai-mst.db` (그대로)
- `spring.datasource.if` = `../data/serai-if.db` (caravan 메타 + KMC 메타 + SERAI IF 통합)
- caravan 라이브러리도 `serai-if.db` 가리키도록 변경 (caravan 의 `KafkaJpaConfig` 가 사용하는 DataSource bean 을
  serai 의 if DataSource 로 alias 또는 caravan 의 properties 키 변경)
- `caravan.db` 파일 삭제 / 마이그레이션

**caravan 라이브러리 변경 옵션**:
- (A) caravan 의 `KafkaJpaConfig` 가 명시 DataSource 빈 (`ifDataSource`) 주입받도록 수정
- (B) caravan 의 자체 DataSource 등록 없애고 host (serai) 의 if DataSource 를 그대로 사용
- (C) caravan 의 properties (`caravan.datasource.url`) 를 serai 의 if 와 동일 파일로 yml override
- **(D) 채택 (2026-05-18) — serai 측 `CaravanIfDataSourceConfig` 신규 + 운영 sequence 강제**

#### 옵션 (D) 적용 — serai 의 `caravanDataSource` 빈 = `ifDataSource` alias

**검증 발견 (2026-05-15~18)**:
- caravan 의 `KafkaJpaConfig#resolveCaravanDataSource()` 는 host 의 `caravanDataSource` 빈 우선 사용 → serai 측 빈 등록만으로 통합 가능 (caravan 라이브러리 변경 0)
- yml override 옵션 (C) 는 불가 — caravan 이 `caravan.datasource.url` 같은 키 노출 안 함

**작업**:
```java
// serai/src/main/java/com/dongkuk/dmes/serai/config/CaravanIfDataSourceConfig.java
@Configuration
public class CaravanIfDataSourceConfig {
    @Bean(name = "caravanDataSource")
    public DataSource caravanDataSource(@Qualifier("ifDataSource") DataSource ifDs) {
        return ifDs;
    }
}
```

#### schema 협조 — 단일 sqlite 에 두 EMF 매핑

**문제**:
- mcm 의 cactus EMF — KMC 메타 entity 3개 (TB_MCM_APPHOST/TB_MCM_MOM_KAFKA_SERAI_CONFIG/TB_MCM_MOM_KAFKA_TOPICS) 매핑
- serai 의 caravan EMF — caravan 자체 entity N개 (TopicInfoEntity, TopicErrorEntity, ...) 매핑
- 같은 serai-if.db 가리키는데 schema 정의 다름 → 검증 시 missing table/column 충돌

**해결 (2026-05-18)**:

1. **serai 의 `caravan.hibernate.ddl-auto: update`** (validate 가 아님) — caravan 이 모든 테이블 생성 (caravan 메타 + KMC 공유 entity 동일 schema)
2. **mcm 운영 sequence: serai 먼저 → mcm 그 다음** — serai 가 모든 테이블 만든 후 mcm 의 cactus EMF 가 `CactusSqliteIfNotExistsDialect` 로 안전한 update (이미 만든 테이블 그대로)
3. **mcm 의 `cactus.jpa.extras.if.hibernate.properties.hibernate.physical_naming_strategy: PhysicalNamingStrategyStandardImpl`** — cactus 의 SnakePhysicalNamingStrategy (lowercase) 가 아닌 standard (uppercase) 사용. caravan 의 standard naming 과 정합 (case-sensitive 검증 통과)
4. **`KmcTopicInfoEntity extends KmcAuditEntity`** — caravan TopicInfoEntity 의 audit 9컬럼 (C_USR_ID/C_AT/...) 과 schema 정합

**운영 환경 (mssql)** — SERAIUSER schema 이미 존재 + ddl-auto=none. sequence 무관.

> 본 §6-6 옵션 (D) 가 serai 모듈 변경 (CaravanIfDataSourceConfig 1개 클래스) 만으로 통합 완성.
> caravan 라이브러리 자체 변경은 0. 단 local dev 환경의 운영 sequence (serai → mcm) 가 강제됨.

### 6-7. Phase 6 검증 후속 정리 항목 (2026-05-15 발견, 2026-05-18 해결)

mcm Phase 6 부팅 검증 중 발견한 잔여 항목. 본 PR 의 직접 범위는 아니지만 추적 위해 명시.
**모든 항목 2026-05-18 해결 완료**.

#### (1) ✅ `CactusTxProperties` JavaDoc 의 yml 키 예시 정정 — **해결 (2026-05-18)**

**증상**: `cactus.tx.default: txBiz` 명시 시 `defaultManager` 필드에 binding 안 됨 →
`OasisAutoConfiguration#serviceStarter()` 에서 `defaultTxMgr null/blank` NPE.

**원인**: Spring Boot relaxed binding 이 `default` ↔ `defaultManager` 임의 매핑 못 함.
`default` 가 Java 예약어라 setter 명을 `setDefault` 로 못 만들어 `setDefaultManager` 사용 →
yml 키도 `default-manager` 명시 의무.

**조치**:
- `cactus-core/src/main/java/com/dongkuk/dmes/cactus/tx/CactusTxProperties.java` 의
  JavaDoc 예시 `default: txBiz` → `default-manager: txBiz` 정정
- 본 §6-1 yml diff 정정 완료 (2026-05-15)

#### (2) ✅ `mcm/JpaConfig.java` + `McmApplication.java` 의 ⚠️ 코멘트 정리 — **해결 (2026-05-18)**

`KmcSecondaryJpaConfig.java` 삭제 후 다음 코멘트 stale:
```java
// JpaConfig.java line 87-89
// ⚠️ "com.dongkuk.dmes.kmc.{host,seraiconfig,topic}" 포함 금지 —
//    cactus secondary EMF 가 매핑 (v4 결정 #14, 2026-05-13)

// McmApplication.java @EnableJpaRepositories javadoc
// ⚠️ "com.dongkuk.dmes.kmc.{host,seraiconfig,topic}" 포함 금지 — KmcSecondaryJpaConfig 가 secondary EMF 로 등록
```

→ "kmc-core 0.2.0 의 `KmcJpaAutoConfiguration` 이 `@EnableJpaRepositories(basePackages={kmc.host,...})`
자체 등록 — host 의 default scan 에서 제외 유지" 로 갱신 권장. 동작 영향 없음 (cosmetic).

#### (3) ✅ `application-dev.yml` / `application-prod.yml` 의 `cactus.datasource.extras.if` 추가 — **해결 (2026-05-18, env var 패턴)**

현 상태:
- `application-mssql.yml` — Phase 6 에서 `cactus.datasource.extras.if` (SERAIUSER) 추가됨 ✓
- `application-dev.yml` — secondary 정의 0건. KMC 콘솔 비활성 상태
- `application-prod.yml` — secondary 정의 0건. KMC 콘솔 비활성 상태

→ dev/prod 환경에서 KMC 콘솔 활성화 필요한지 사용자 결정. 활성 시 두 yml 에도 동일 패턴 추가:
```yaml
cactus:
  datasource:
    extras:
      if:
        url: ${SERAIUSER_DB_URL:...}    # env var 패턴
        username: ${SERAIUSER_DB_USER:...}
        password: ${SERAIUSER_DB_PASSWORD:...}
        driver-class-name: com.microsoft.sqlserver.jdbc.SQLServerDriver
  jpa:
    extras:
      if:
        hibernate:
          dialect: org.hibernate.dialect.SQLServerDialect
          ddl-auto: none
```

#### (4) ✅ Validator warn 의 trade-off 인정 — `[Cactus Tx] 같은 DS 'biz' 에 여러 alias 매핑: [txBiz, txCmn]`

mcm 이 `cmn` 안 쓰고 `txCmn: { data-source: biz }` alias 매핑 → Validator 가 R-multi-25 warn 출력.
이는 의도된 옵션 δ 패턴 (yml 에 의도 명시) — 무시 가능. 단 mcm 에서 BPMN 의 commitTx 비대칭
commit/rollback 정책 사용 금지 (txBiz / txCmn 이 같은 트랜잭션이라 분리 commit 불가).

#### (5) ✅ §6-6 schema 협조 — serai → mcm 단일 sqlite 두 EMF 매핑 (2026-05-18 신규 발견 + 해결)

**증상**:
- serai 의 caravan EMF + mcm 의 cactus EMF 가 같은 serai-if.db 가리킬 때 schema 충돌
- (a) cactus SnakePhysicalNamingStrategy 가 lowercase, caravan standard 가 uppercase → case mismatch
- (b) KmcTopicInfoEntity 가 KmcAuditEntity 상속 안 함 → caravan TopicInfoEntity 의 audit 9컬럼 missing
- (c) caravan 자체 entity N개 (TB_MCM_MOM_TC_ERROR 등) → mcm 부팅 안 만듦 → caravan validate 시 missing table

**해결**:
1. mcm `cactus.jpa.extras.if.hibernate.properties.hibernate.physical_naming_strategy: PhysicalNamingStrategyStandardImpl` — uppercase 유지
2. `KmcTopicInfoEntity extends KmcAuditEntity` — caravan TopicInfoEntity 와 audit 컬럼 정합
3. serai `caravan.hibernate.ddl-auto: update` + 운영 sequence `serai → mcm` 강제 — serai 가 모든 테이블 만든 후 mcm 의 `CactusSqliteIfNotExistsDialect` 가 안전한 update

본 §6-6 옵션 (D) 의 검증 통과: serai (12.625s) → mcm (12.21s) 정상 부팅. caravan + cactus 가 같은 serai-if.db 공유 동작 확인.

운영 환경 (mssql/SERAIUSER) 은 ddl=none 으로 sequence 무관.

---

## 7. 단위 테스트 명세

### 7-1. `CactusTxConfigValidatorTest`

```java
@Test
void valid_yml_passes() { /* managers + default 정상 → no throw */ }

@Test
void transactional_true_with_empty_managers_throws() { /* IllegalStateException */ }

@Test
void default_not_in_managers_throws() { /* IllegalStateException */ }

@Test
void data_source_not_in_extras_throws() { /* IllegalStateException */ }

@Test
void alias_target_bean_missing_throws() { /* IllegalStateException */ }

@Test
void extras_ds_without_emf_warns() { /* logger 출력만 검증, throw 없음 */ }
```

### 7-2. `DefaultTxInjectingServiceProviderTest`

```java
@Test
void inject_when_tx_missing() {
    ServiceProvider delegate = mock(ServiceProvider.class);
    Service svc = mockServiceWithProperties(/* tx 없음 */);
    when(delegate.service("test")).thenReturn(svc);

    Service result = new DefaultTxInjectingServiceProvider(delegate, "txBiz").service("test");

    assertThat(result.process().properties().getValue("tx")).isEqualTo("txBiz");
}

@Test
void no_inject_when_tx_already_set() {
    Service svc = mockServiceWithProperties("tx", "txCmn");
    when(delegate.service("test")).thenReturn(svc);

    new DefaultTxInjectingServiceProvider(delegate, "txBiz").service("test");

    assertThat(svc.process().properties().getValue("tx")).isEqualTo("txCmn");  // 유지
}

@Test
void no_inject_when_tx_set_to_csv() {
    Service svc = mockServiceWithProperties("tx", "txBiz,txCmn");
    when(delegate.service("test")).thenReturn(svc);

    new DefaultTxInjectingServiceProvider(delegate, "txOther").service("test");

    assertThat(svc.process().properties().getValue("tx")).isEqualTo("txBiz,txCmn");
}

@Test
void null_delegate_throws_NPE() {
    assertThatThrownBy(() -> new DefaultTxInjectingServiceProvider(null, "txBiz"))
        .isInstanceOf(NullPointerException.class);
}

@Test
void blank_default_throws_NPE() {
    assertThatThrownBy(() -> new DefaultTxInjectingServiceProvider(delegate, ""))
        .isInstanceOf(NullPointerException.class);
}
```

### 7-3. `CactusCachingServiceProviderTest`

```java
@Test
void cache_miss_then_hit() {
    ServiceProvider delegate = mock(ServiceProvider.class);
    Service svc = mock(Service.class);
    when(delegate.service("id1")).thenReturn(svc);

    CactusCachingServiceProvider cp = new CactusCachingServiceProvider(delegate, 10);

    assertThat(cp.service("id1")).isSameAs(svc);
    assertThat(cp.service("id1")).isSameAs(svc);

    verify(delegate, times(1)).service("id1");   // delegate 1회만 호출
}

@Test
void different_ids_cached_separately() {
    Service svc1 = mock(Service.class), svc2 = mock(Service.class);
    when(delegate.service("id1")).thenReturn(svc1);
    when(delegate.service("id2")).thenReturn(svc2);

    CactusCachingServiceProvider cp = new CactusCachingServiceProvider(delegate, 10);
    assertThat(cp.service("id1")).isSameAs(svc1);
    assertThat(cp.service("id2")).isSameAs(svc2);
    assertThat(cp.service("id1")).isSameAs(svc1);   // 여전히 hit
}

@Test
void evictAll_clears_cache() {
    /* getObject 후 evictAll → 다음 호출이 다시 underlying 호출 */
}

@Test
void concurrent_miss_safe() {
    /* 두 thread 동시 호출 — 결과 정합성 (정확한 svc 반환) */
}
```

### 7-4. AutoConfiguration 슬라이스 테스트

```java
@SpringBootTest
class CactusMultiTransactionManagerAutoConfigurationTest {
    @Test
    void registers_alias_for_each_manager() {
        // 부팅 후 ApplicationContext.containsBean("txBiz") == true
        // ApplicationContext.getBean("txBiz", PlatformTransactionManager.class) == 실제 빈 (alias)
    }

    @Test
    void default_manager_marked_as_primary() {
        // beanDefinition("transactionManager").isPrimary() == true
    }
}
```

---

## 8. 통합 테스트 명세

### 8-1. mcm bootRun 검증 (Phase 6)

```
1. cactus-core 1.0.21-SNAPSHOT 빌드
2. mcm/api/application.yml 키 마이그레이션 (§6-1)
3. mcm bootRun

검증:
  ✅ "[Cactus Oasis] transactional + classpath loader — /services, default=txBiz, managers=[txBiz, txCmn, txIF]" 로그 출력 (옵션 δ — 표준 3개)
  ✅ secUser 호출 → 정상 응답 (200ms 이내)
  ✅ secUser 두 번째 호출 → 50ms 이내 (CactusCachingServiceProvider 효과)
  ✅ secFavorite 호출 → 정상
  ✅ DEBUG 로그에 "Transaction [txBiz] started." 1회만 출력 (default 1개만 begin)
  ✅ ERROR 로그 0건 (commitAll 부분 실패 없음)

부정 검증:
  ✅ cactus.tx.managers 비우고 transactional=true → 부팅 실패 (CactusTxConfigValidator throw)
  ✅ cactus.tx.default 미명시 → 부팅 실패
  ✅ cactus.tx.default = "존재 안 함" → 부팅 실패
```

### 8-2. multi-tx 시나리오 — txIF (Phase 6 본 마이그레이션 핵심)

```
1. 사전 조건:
  - serai 모듈이 로컬에서 정상 부팅 (serai-if.db 또는 SERAIUSER MSSQL 접근 가능)
  - mcm/api 의 cactus.datasource.extras.if + cactus.jpa.extras.if + cactus.tx.managers.txIF
    정의 완료 (§6-1, 6-2, 6-3)
  - KMC 메타 entity 3종이 cactus.jpa.extras.if.packages-to-scan 에 등록 → JpaTxMgr 등록 확인
  - KmcSecondaryJpaConfig.java 의 entityManagerFactoryRef 가 cactusEntityManagerFactoryIf
    참조 확인 (§6-4)

2. 시연용 BPMN 작성 (mcm/api/src/main/resources/services/seraiInterface/sendInterface.bpmn):
   <bpmn:process id="sendInterface">
     <bpmn:extensionElements>
       <camunda:properties>
         <camunda:property name="tx" value="txBiz,txIF"/>
       </camunda:properties>
     </bpmn:extensionElements>
     <bpmn:serviceTask id="t1">
       <bpmn:extensionElements>
         <camunda:class>com.dongkuk.dmes.mcm.serai.service.SendHistoryService</camunda:class>
         <camunda:method>recordSend</camunda:method>
       </bpmn:extensionElements>
     </bpmn:serviceTask>
     <bpmn:scriptTask id="t2" scriptFormat="sql">
       <bpmn:extensionElements>
         <camunda:properties>
           <camunda:property name="tx" value="txIF"/>
           <camunda:property name="input" value="interfaceId,payload"/>
         </camunda:properties>
       </bpmn:extensionElements>
       <bpmn:script>
         INSERT INTO IF_INTERFACE (INTERFACE_ID, PAYLOAD, CREATED_AT)
         VALUES (:interfaceId, :payload, GETDATE())
       </bpmn:script>
     </bpmn:scriptTask>
   </bpmn:process>

3. 호출 후 검증:
  ✅ 부팅 로그 "[Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF]" (옵션 δ — 표준 3개 항상 등록)
  ✅ 호출 시 "Transaction [txBiz] started." + "Transaction [txIF] started." 둘만 출력 (Tier 2 의 tx="txBiz,txIF" 명시)
  ✅ t1 (mcm 자체 DB 송신 이력) 정상 INSERT
  ✅ t2 (SERAIUSER 의 IF_INTERFACE) 정상 INSERT
  ✅ "Transaction [txIF] has been committed." → "Transaction [txBiz] has been committed." (LIFO 순서)
  ✅ serai 모듈에서 seraiuser 로 SELECT * FROM IF_INTERFACE WHERE INTERFACE_ID=:id → 데이터 확인
  ✅ KMC 콘솔 화면에서 AppHostJpaRepository.findAll() 호출 → 정상 (cactusEntityManagerFactoryIf 사용)
  ✅ KMC 메타 Repository 와 BPMN SqlScriptTask 가 같은 if DS / 같은 connection pool 공유 (자원 효율)

4. 부정 검증:
  ✅ BPMN process tx="txOther" (화이트리스트 외) 명시 → 호출 시 IllegalArgumentException
  ✅ t1 에서 RuntimeException throw → 두 트랜잭션 모두 rollback (mcm 송신이력 + SERAI IF 모두 안 들어감)
  ✅ t2 에서 SQL 실패 → t1 의 mcm 송신이력도 rollback
```

---

## 9. 에러 메시지 카탈로그

| 코드/시점 | 메시지 | 발생 조건 |
|---|---|---|
| Validator | `cactus.oasis.transactional=true 이면 cactus.tx.managers 에 최소 1개 TxMgr 정의 필수.` | transactional=true + managers 비어있음 |
| Validator | `cactus.tx.default 키 필수. cactus.tx.managers 의 key 중 하나로 명시.` | default 미명시 |
| Validator | `cactus.tx.default='{name}' 이 cactus.tx.managers 에 없습니다. 사용 가능: [...]` | default 가 managers 외 |
| Validator | `cactus.tx.managers.{name}.data-source 키 필수.` | data-source 미명시 |
| Validator | `TxMgr '{name}' 의 data-source='{ds}' 가 cactus.datasource.extras 에 정의 안 됨. 사용 가능: [primary, ...]` | data-source 가 extras 외 |
| Validator | `TxMgr alias '{name}' 의 대상 빈이 ApplicationContext 에 없음.` | alias 등록 실패 |
| OasisAutoConfig | `cactus.oasis.transactional=true 이면 cactus.tx.managers 에 최소 1개 TxMgr 정의 필수. (상세 검증은 CactusTxConfigValidator)` | bean serviceStarter 생성 시점 |
| OasisAutoConfig | `cactus.oasis.service-loader-url 은 cactus.oasis.transactional=true 일 때만 사용 가능합니다.` | 1.0.20 부터 유지 |
| DefaultTxInjecting | `delegate ServiceProvider null` | ctor null |
| DefaultTxInjecting | `defaultTxMgr null/blank` | ctor null/blank |
| CactusCaching | `delegate null` / `cache null` | ctor null |
| oasis-core (런타임) | `Cannot find the service file. [{serviceId}]` | BPMN 파일 부재 — cactus 1.0.20 fix 후 정상 동작 시 발생 안 함 |
| oasis-core (런타임) | `You specified a transaction manager that is not in the application-level transaction manager. Check the list of transaction manager names declared in the process.` | BPMN 의 tx 가 화이트리스트 외 |
| oasis-core (런타임) | `[tx] is a duplicate attribute` | DefaultTxInjecting 의 hasProperty 가드 실패 (구현 버그) |

---

## 10. 부팅 로그 패턴 (정상 시)

```
### mcm 부팅 로그 (옵션 δ — cmn=biz alias 매핑, KMC 메타 통합)

[main] INFO  c.d.d.c.datasource.CactusMultiDataSourceAutoConfiguration :
        [Cactus] extras DataSource — bean='cactusDataSourceIf' alias='if' url=jdbc:sqlserver://localhost:1433;databaseName=SERAIUSER...
        [Cactus] primary DataSource alias — dataSource → 'biz' (옵션 β)
        (※ mcm 은 cactus.datasource.extras.cmn 미정의 — txCmn 이 biz alias)
[main] INFO  c.d.d.c.jpa.CactusMultiJpaAutoConfiguration :
        [Cactus] extras EMF + TxMgr — name='if' emf='cactusEntityManagerFactoryIf' tx='cactusTransactionManagerIf'
                packages=[com.dongkuk.dmes.kmc.host, com.dongkuk.dmes.kmc.seraiconfig, com.dongkuk.dmes.kmc.topic]
[main] INFO  c.d.d.c.tx.CactusMultiTransactionManagerAutoConfiguration :
        [Cactus Tx] alias — 'txBiz' → 'transactionManager'
        [Cactus Tx] default TxMgr @Primary — 'transactionManager' (alias 'txBiz')
        [Cactus Tx] alias — 'txCmn' → 'transactionManager' (옵션 δ — mcm 의 cmn=biz alias 매핑)
        [Cactus Tx] alias — 'txIF'  → 'cactusTransactionManagerIf' (JpaTransactionManager — KMC 메타 + SERAI IF 통합)
[main] INFO  c.d.d.c.oasis.OasisAutoConfiguration :
        [Cactus Oasis] transactional + classpath loader — /services
        [Cactus Oasis] multi-tx mode — managers=[txBiz, txCmn, txIF], default=txBiz
[main] INFO  c.d.d.c.tx.CactusTxConfigValidator :
        [Cactus Tx] config validated — managers=[txBiz, txCmn, txIF], default=txBiz, primary-alias=biz
[main] INFO  c.d.d.kmc.config.KmcEmfAliasAutoConfiguration :
        [KMC] EMF alias — 'cactusEntityManagerFactoryIf' → 'kmcEntityManagerFactory'
        [KMC] TxMgr alias — 'cactusTransactionManagerIf' → 'kmcTransactionManager'
[main] INFO  c.d.d.kmc.serai.KmcSeraiAutoConfiguration :
        [KMC SERAI] RestClient — baseUrl=http://localhost:8200, connectTimeout=5000ms, readTimeout=10000ms
[main] INFO  o.s.b.web.embedded.tomcat.TomcatWebServer : Tomcat started on port 8080
```

> **kmc-core 0.2.0 부팅 로그** (2026-05-15 신규) — kmc-core 가 cactus 의존 0 옵션 B 적용 후
> `KmcEmfAliasAutoConfiguration` (alias) + `KmcSeraiAutoConfiguration` (RestClient + KmcSeraiClient) 자동 등록.
> mcm yml `kmc.repository.{emf-bean, tx-bean}` 명시 시에만 alias 로그 출력 — 미명시 시 noop (1.0.x 호환).

> **JPA 미정의 시 TxMgr 종류 — 환경별 분기**:
> - `if` 가 SqlScriptTask 로 직접 SQL 만 호출하는 모듈 (예: mpp/mqc 가 SERAI IF_* INSERT 만 사용):
>   `cactus.jpa.extras.if` 미정의 → `CactusMultiTransactionManagerAutoConfiguration` 의 fallback
>   로직이 `DataSourceTransactionManager` 등록.
> - mcm 처럼 KMC 메타 entity 통합 → `cactus.jpa.extras.if.packages-to-scan` 정의 →
>   `CactusMultiJpaAutoConfiguration` 이 `JpaTransactionManager` 등록 (위 부팅 로그 케이스).
> 결정은 모듈별 packages-to-scan 정의 여부로 자동 분기.

---

## 11. 빌드 / 의존성 변경

**파일**: `cactus-core/build.gradle`

```diff
-version = '1.0.20-SNAPSHOT'
+version = '1.0.21-SNAPSHOT'
```

추가 의존 없음 — `oasis-core-api` 가 이미 transitive 의존이라 `PropertyContainer`/`Property`/`PropertyNames`/`SizeBaseCacheService` 사용 가능.

---

## 12. 작업 순서 체크리스트 (Phase 1~9 통합)

```
─── Phase 1: Properties (10분) ───
[ ] CactusTxProperties.java 신규
[ ] CactusDataSourceProperties.java 수정 (secondary → extras)
[ ] CactusJpaProperties.java 수정 (secondary → extras)
[ ] OasisProperties.java 수정 (transactionManagerName 제거, cache 추가)
[ ] gradlew :cactus-core:compileJava 통과

─── Phase 2: DataSource (15분) ───
[ ] CactusSecondaryDataSourceAutoConfiguration.java 삭제
[ ] CactusMultiDataSourceAutoConfiguration.java 신규
[ ] AutoConfiguration.imports 갱신 (secondary 제거 + multi 추가)
[ ] gradlew :cactus-core:compileJava 통과

─── Phase 3: JPA (20분) ───
[ ] CactusSecondaryJpaAutoConfiguration.java 삭제
[ ] CactusMultiJpaAutoConfiguration.java 신규
[ ] AutoConfiguration.imports 갱신
[ ] gradlew :cactus-core:compileJava 통과

─── Phase 4: TxMgr alias + Validator + Wrapper (25분) ───
[ ] CactusMultiTransactionManagerAutoConfiguration.java 신규
[ ] CactusTxConfigValidator.java 신규
[ ] oasis/provider/DefaultTxInjectingServiceProvider.java 신규
[ ] oasis/provider/CactusCachingServiceProvider.java 신규
[ ] AutoConfiguration.imports 갱신
[ ] gradlew :cactus-core:compileJava 통과

─── Phase 5: OasisAutoConfiguration 수정 (10분) ───
[ ] OasisAutoConfiguration.java 의 serviceStarter() 메서드 수정 (빈 그래프 와이어링)
[ ] gradlew :cactus-core:compileJava 통과

─── Phase 6: mcm 마이그레이션 (15분) ───
[ ] grep "cactusSecondary" mcm 코드 — 사용처 식별
[ ] mcm/api/application.yml 키 변경 (§6-1)
[ ] mcm/api/application-local.yml 키 변경 (§6-2)
[ ] KmcSecondaryJpaConfig.java + grep 결과 파일 의 빈 이름 갱신 (§6-3)
[ ] gradlew :mcm:api:compileJava 통과
[ ] mcm bootRun 검증 (§8-1 시나리오)

─── Phase 7: multi-tx 파일럿 (옵션, 사용자 지정) ───
[ ] §8-2 시나리오 따라 진행

─── Phase 8: 정적 검증 도구 (보류, 별도) ───

─── Phase 9: 릴리스 (10분) ───
[ ] cactus-core/build.gradle version 1.0.21-SNAPSHOT
[ ] cactus-core/CHANGELOG.md 1.0.21 항목 신설
[ ] docs/cactus/usage-guide.md 갱신 (multi-tx 섹션, 7개 항목)
[ ] gradlew :cactus-core:publishMavenJavaPublicationToSnapshotsRepository
```

**예상 총 작업 시간**: 약 100~120분 (테스트 + 검증 포함 시 +60분).

---

## 13. 결정 변경 이력

| 일자 | 변경 | 근거 |
|---|---|---|
| 2026-05-14 | 상세설계 문서 신규 작성 | 사용자 요청 — 구현 단계로 구체화 |
| 2026-05-14 | **txExt → txIF rename + SERAI 인터페이스 시나리오 정합화** | 사용자 결정 — serai 모듈은 cactus 미사용 유지. mcm/mpp/mqc 등 다른 모듈이 SERAI 의 SERAIUSER DB (IF_* 테이블) 에 INSERT 하기 위해 cactus.tx.managers.txIF 도입. yml extras key `if` 로 통일 (serai 의 spring.datasource.if 와 일관). Phase 6 mcm 마이그레이션에 txIF 도입 포함. **신규 결정**: cactus.jpa.extras.{name} 미정의 시 DataSourceTransactionManager 자동 fallback (SqlScriptTask 만 사용 시 EMF 불필요). §2-3 보강. |
| 2026-05-14 | **옵션 (β) primary-alias 도입 — primary/secondary magic string 완전 제거** | 사용자 결정 — Spring Boot 의 dataSource 빈은 그대로 유지 + cactus.datasource.primary-alias 신규 (예: 'biz'). cactus.tx.managers 의 모든 data-source 가 의미 있는 이름. CactusDataSourceProperties 에 primaryAlias 필드 추가. CactusMultiDataSourceAutoConfiguration 이 alias 등록. CactusMultiTransactionManagerAutoConfiguration 의 resolveTargetBeanName 이 primaryAlias 비교로 변경. CactusTxConfigValidator 에 primary-alias 검증 추가. R-multi-24 후보: oasis-core 의 DataSourceExtractor 가 JpaTxMgr + DataSourceTxMgr 만 지원 (Phase 0-B 후속 디스어셈블 검증). |
| 2026-05-14 | **dmes 표준 DS 패턴 (biz/cmn/if) 명문화** | 사용자 결정 — biz=모듈 자체 DS, cmn=공통 DS, if=인터페이스 송수신 DS. 모든 cactus 사용 모듈은 본 3개 패턴을 따름. caravan/kmc 등 기존 모듈 특수 사정은 본 설계 문서에서 다루지 않음 (모듈 자체 결정). yml 예시 / Phase 6 마이그레이션 / 부팅 로그 모두 표준 패턴 위주로 정리. |
| 2026-05-14 | **옵션 (δ) yml 강제 + DS 매핑 자유** | 사용자 결정 — cactus 사용 모듈은 표준 3개 (txBiz/txCmn/txIF) 명시 의무. CactusTxConfigValidator 의 STANDARD_TX_NAMES 검증 신규. mcm 은 cmn 미사용으로 `txCmn: { data-source: biz }` alias 매핑. §1-1 JavaDoc 갱신, §2-4 Validator 검증 1-bis 신규, §6-1 mcm yml diff 갱신, §10 부팅 로그 mcm 시나리오로 정정. 신규 위험 R-multi-25/26/27 (상위 §10 참조). |
| 2026-05-14 | **정합성 검증 (iii) 일괄 정리** | 양 문서 동기화 — 잔존 표현 (txExt/txKmc/kmc 디테일) 모두 정리. 부팅 로그 양 문서 통일 ([txBiz, txCmn, txIF]). |
| 2026-05-14 | **R-multi-25 검증 (Phase 0-C)** | oasis-core 의 startTransaction 디스어셈블 — PROPAGATION_REQUIRED 로 같은 빈 두 alias 시나리오 정상 commit/rollback 안전. 비대칭(commitTx) 만 위험. §2-4 Validator 에 같은 DS 매핑 시 warn 로그 추가. |
| 2026-05-14 | **Phase 0-D 사용성 검증 + alias 등록 결정** | SpringApplicationContext.get(name) 이 Spring getBean(name) 위임 — alias 인식 확정. `CactusMultiDataSourceAutoConfiguration` 의 빈 등록 후 `registry.registerAlias(beanName, name)` 호출 추가. yml key (`if`) 가 BPMN `ds="if"` 로 그대로 동작. §2-1 의 코드에 alias 등록 1줄 추가. |
| 2026-05-14 | **R-multi-28 + Validator 검증 1-quater** | alias 충돌 위험 — extras key 가 primary-alias 값 / Spring Boot 표준 빈 이름 / cactus 자체 빈 prefix 와 충돌 시 사전 차단. `STANDARD_TX_NAMES` + `RESERVED_BEAN_NAMES` 정의 + 검증 1-quater 신규. |
| 2026-05-14 | **양 문서 정합성 마무리** | 상세 §8-2 부팅 로그 통일 + §3-3 예시 정정. |
| 2026-05-15 | **§6 KMC 메타 → if 통합 + 4개 코드 변경 가이드 추가** | 사용자 결정 — KMC 메타 DB (caravan.db) 와 SERAI IF (serai-if.db) 를 단일 if DS 로 통합. local sqlite 통합 파일명 `serai-if.db` 권장. KMC 메타 entity 3종을 `cactus.jpa.extras.if.packages-to-scan` 에 등록 → JpaTxMgr 자동 등록. **검증 발견**: 기존 §6-4 가 `kmcSecondary` 별도 entry 가정 + `@Qualifier` 만 다뤄 mcm 의 실제 변경점 (`@EnableJpaRepositories` 의 emfRef/txRef + `@ConditionalOnProperty` 폐기 + `McmApplication.java` PropertySource 키) 누락. §6-0 정책 신규, §6-1 공통 yml 에 jpa.extras.if 통합, §6-2 local sqlite 통합 파일명 결정, §6-4 EMF/TxMgr ref + ConditionalOnBean 교체, §6-5 신규 (McmApplication PropertySource 키), §6-6 신규 (serai 모듈 caravan + spring.datasource.if 통합 — 별도 작업). §8-2 사전 조건 + 검증 항목 (KMC 메타 Repository) 보강. §10 부팅 로그 JpaTxMgr 등록 케이스로 정정. |
| 2026-05-15 | **kmc-core 0.2.0 — 패턴 B + 옵션 B (cactus 의존 0)** | 사용자 결정 — "kmc, mcm-core 는 칵투스를 의존하지 않아야". mcm-core 는 이미 cactus 의존 0 (build.gradle 정책 명시), kmc-core 는 4건 의존 (`ApiResponse` / `CactusAuditEntity` / `SeraiIntegrationClient` / `SeraiSendResult`). 옵션 B (kmc-core 자체 카피) 적용 — `KmcApiResponse` / `KmcAuditEntity` (Spring SecurityContext 기반 Listener — oasis AuditHolder 의존 끊음) / `KmcSeraiClient` + `Default` + `Properties` + `AutoConfig` 자체 정의. `kmc-core/build.gradle` 의 `compileOnly cactus-core` 제거. 추가로 패턴 B 의 `KmcJpaAutoConfiguration` + `KmcEmfAliasAutoConfiguration` 도입 → mcm 의 `KmcSecondaryJpaConfig.java` **폐기** 가능 (yml 두 줄 `kmc.repository.{emf-bean, tx-bean}` 만으로 매핑 완성). lock-step 부담 (cactus.ApiResponse + KmcApiResponse 두 군데 schema 동기화) 인정 — 운영 안정성 위한 trade-off. mcm bootRun 검증 통과. **설계문서 §6-4 rewrite** (KmcSecondaryJpaConfig 삭제 + yml 두 줄), **§10 부팅 로그** (`[KMC] EMF alias` / `[KMC SERAI] RestClient`) 추가. |
| 2026-05-15 | **Phase 6 mcm 마이그레이션 실행 + §6-7 후속 정리 항목 신규** | mcm yml 5종 (application + local + mssql + dev + prod) 마이그레이션, `KmcSecondaryJpaConfig.java` 삭제, `McmApplication.java` PropertySource 키 변경, `caravan.db` → `serai-if.db` 통합. mcm bootRun 16.59초 성공. **부팅 검증 중 발견 이슈**: (a) yml `cactus.tx.default` 가 `CactusTxProperties.defaultManager` 에 binding 안 됨 (Java 예약어 `default` 라 setter 불가) → yml 키 `default-manager` 의무. (b) yml `kmc:` 키 중복 (기존 `kmc.works-code` + 신규 `kmc.repository`) → 한 블록 합침. **§6-1 yml diff 정정** + **§6-7 신규** (4개 후속 정리 — CactusTxProperties javadoc / mcm 코멘트 / dev-prod yml 결정 / Validator warn trade-off). |
| 2026-05-18 | **§6-7 잔여 항목 (1)~(4) + §6-6 옵션 (D) 모두 해결** | (1) `CactusTxProperties` javadoc `default` → `default-manager` 정정 + 이유 명시. (2) `mcm/JpaConfig` + `McmApplication` 의 ⚠️ 코멘트를 "cactus secondary EMF" → "cactus 의 if EMF (cactusEntityManagerFactoryIf)" 갱신. (3) `application-dev.yml` + `application-prod.yml` 에 `cactus.datasource.extras.if` env var 패턴 추가 (dev: default fallback / prod: env var 의무). **§6-6 옵션 (D) 채택** — serai 측 `CaravanIfDataSourceConfig` 신규 (`caravanDataSource` = `ifDataSource` alias, caravan 라이브러리 변경 0). **검증 발견 (신규)**: 단일 sqlite 의 cactus + caravan EMF schema 충돌 — (a) physical_naming_strategy lowercase/uppercase 불일치 → mcm extras.if hibernate.properties 로 `PhysicalNamingStrategyStandardImpl` override, (b) `KmcTopicInfoEntity` 가 caravan TopicInfoEntity audit 9컬럼 missing → `extends KmcAuditEntity` 추가, (c) caravan 자체 entity N개 missing → serai ddl=update + 운영 sequence `serai → mcm` 강제. localKafka + serai (12.625s) + mcm (12.21s) 부팅 검증 통과. §6-7 (5) 신규 + §6-6 옵션 (D) 상세 명시. |

---

## 부록 — 참고 링크

- 상위 설계: [oasis-multi-tx-design.md](./oasis-multi-tx-design.md)
- 1.0.20 fix (BPMN 로더): [cactus-core-data-access-migration-plan.md](./cactus-core-data-access-migration-plan.md)
- 사용 가이드: [usage-guide.md](./usage-guide.md)
- 1.0.20 CHANGELOG: `src/backend/cactus-core/CHANGELOG.md`
- film 참고: `dmes-fwk/workspace-fwk/dmes-film/dmes-film-biz/src/main/java/com/dongkuk/dmes/film/cmn/config/system/OasisConfig.java`
