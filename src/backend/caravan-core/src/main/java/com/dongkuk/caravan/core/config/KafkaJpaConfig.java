package com.dongkuk.caravan.core.config;

import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import jakarta.persistence.EntityManagerFactory;
import javax.sql.DataSource;
import java.util.HashMap;
import java.util.Map;

/**
 * Caravan JPA 설정
 *
 * <p>호스트 프로젝트가 {@code caravanDataSource} 빈을 제공하면 그것을, 없으면 host 의 @Primary
 * DataSource 를 fallback 으로 사용해 Caravan 전용 EntityManagerFactory 를 구성합니다.
 * 다중 사이트 모듈에서 caravan 메타 테이블만 별도 스키마(예: CARAVANAPUSER) 로 분리할 때
 * host 측이 {@code @Bean("caravanDataSource")} 를 정의하면 됩니다.</p>
 *
 * <p>DDL: {@code caravan.hibernate.ddl-auto} 로 host 가 제어 (기본 {@code none}). 표는 Flyway(caravan-hub 의
 * {@code db/migration/caravanuser})와 DBA 가 만든다.</p>
 *
 * <p>Hibernate Dialect 는 Oracle 을 자동 감지한다.</p>
 */
@Slf4j
@Configuration
@EnableJpaRepositories(
    basePackages = {
        "com.dongkuk.caravan.core.jpa",
        // caravan-console-MCM 마이그레이션 v3 — KmcTopicInfoEntity 가 caravan TB_CARAVAN_TOPICS 와 동일 테이블을
        // read-only 매핑하므로 caravan EMF 에 등록되어야 함. caravan-console repository 도 caravan EMF 통해 read.
        "com.dongkuk.caravan.console.topic"
    },
    entityManagerFactoryRef = "caravanEntityManagerFactory",
    transactionManagerRef = "caravanTransactionManager"
)
public class KafkaJpaConfig {

    private static final String CARAVAN_DATASOURCE_BEAN = "caravanDataSource";

    private final ApplicationContext applicationContext;

    public KafkaJpaConfig(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
    }

    @Bean
    public LocalContainerEntityManagerFactoryBean caravanEntityManagerFactory(
            @Value("${caravan.hibernate.dialect:${spring.jpa.database-platform:}}") String dialect,
            @Value("${caravan.hibernate.ddl-auto:none}") String ddlAuto) {
        DataSource dataSource = resolveCaravanDataSource();

        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPackagesToScan(
            "com.dongkuk.caravan.core.entity",
            // caravan-console-MCM v3 — KmcTopicInfoEntity (TB_CARAVAN_TOPICS read-only 매핑)
            "com.dongkuk.caravan.console.topic"
        );
        em.setPersistenceUnitName("caravan");

        HibernateJpaVendorAdapter vendorAdapter = new HibernateJpaVendorAdapter();
        vendorAdapter.setShowSql(false);
        em.setJpaVendorAdapter(vendorAdapter);

        Map<String, Object> properties = new HashMap<>();
        // host 가 caravan.hibernate.ddl-auto 로 제어. 기본 none — 스키마는 Flyway(caravan-hub)·DBA 가 만든다.
        properties.put("hibernate.hbm2ddl.auto", ddlAuto);
        properties.put("hibernate.physical_naming_strategy",
            "org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl");
        // 커스텀 DialectResolver — Tibero 를 OracleDialect 로 매핑. Oracle 은 기본 StandardDialectResolver 가 자동 처리.
        properties.put("hibernate.dialect_resolvers",
            "com.dongkuk.caravan.core.config.TiberoDialectResolver");
        // 감사 칸(Instant: C_AT·U_AT)은 TIMESTAMP(6) 로 저장한다. 시각은 KST 통일이라 hibernate.jdbc.time_zone 은 넣지 않는다(oracle-1007).
        // 이 EMF 는 직접 만들어 spring.jpa.properties 가 적용되지 않으므로 여기서 지정한다.
        properties.put("hibernate.type.preferred_instant_jdbc_type", "TIMESTAMP");
        // 추가 안전망: 명시적 dialect (caravan.hibernate.dialect 또는 spring.jpa.database-platform).
        // 비어있으면 dialect_resolvers 또는 standard 자동 감지에 위임.
        if (dialect != null && !dialect.isBlank()) {
            properties.put("hibernate.dialect", dialect);
            log.info("[CaravanJpa] hibernate.dialect 명시: {}", dialect);
        } else {
            log.info("[CaravanJpa] hibernate.dialect 미설정 — 자동 감지 (TiberoDialectResolver) 사용");
        }
        log.info("[CaravanJpa] hibernate.hbm2ddl.auto = {}", ddlAuto);
        em.setJpaPropertyMap(properties);

        return em;
    }

    @Bean
    public PlatformTransactionManager caravanTransactionManager(
            @Qualifier("caravanEntityManagerFactory") EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }

    /**
     * caravan 전용 DataSource 빈이 host 측에 정의되어 있으면 그것을, 없으면 host 의 @Primary
     * DataSource 를 fallback 으로 사용한다. 기존 사용처(caravan-hub 등) 는 빈 미정의 → fallback 으로
     * 동작 유지(backward compatible).
     */
    private DataSource resolveCaravanDataSource() {
        if (applicationContext.containsBean(CARAVAN_DATASOURCE_BEAN)) {
            log.info("[CaravanJpa] Using dedicated '{}' bean", CARAVAN_DATASOURCE_BEAN);
            return applicationContext.getBean(CARAVAN_DATASOURCE_BEAN, DataSource.class);
        }
        log.info("[CaravanJpa] '{}' bean not found — falling back to host @Primary DataSource",
            CARAVAN_DATASOURCE_BEAN);
        return applicationContext.getBean(DataSource.class);
    }
}
