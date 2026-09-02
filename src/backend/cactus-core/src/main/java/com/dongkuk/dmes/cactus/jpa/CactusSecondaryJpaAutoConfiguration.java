package com.dongkuk.dmes.cactus.jpa;

import com.dongkuk.dmes.cactus.datasource.CactusSecondaryDataSourceAutoConfiguration;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.jpa.HibernatePersistenceProvider;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;
import java.util.Properties;

/**
 * cactus 보조 EntityManagerFactory + TransactionManager 자동 설정. Phase 3 (2026-05-12).
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@link CactusSecondaryDataSourceAutoConfiguration} 의 {@code cactusSecondaryDataSource} 빈 존재</li>
 *   <li>{@code cactus.jpa.secondary.enabled=true}</li>
 *   <li>JPA classpath ({@link EntityManagerFactory})</li>
 * </ul>
 *
 * <p>생성되는 빈:
 * <ul>
 *   <li>{@code cactusSecondaryEntityManagerFactory}</li>
 *   <li>{@code cactusSecondaryTransactionManager}</li>
 * </ul>
 *
 * <p>host primary EMF/TxMgr 와 충돌 없음 — 보조 빈은 {@code @Primary} 아님. 소비 모듈이
 * {@code @PersistenceContext(unitName="cactus-secondary")} 또는 {@code @Qualifier} 로 명시 사용.
 *
 * <p>Repository 스캔은 cactus 가 자동으로 하지 않는다 — 소비 모듈이 자체
 * {@code @EnableJpaRepositories(basePackages=..., entityManagerFactoryRef="cactusSecondaryEntityManagerFactory")}
 * 로 명시 등록 (caravan {@code KafkaJpaConfig} 와 동일 패턴).
 *
 * <p><b>책임 분리 (2026-05-13)</b>: cactus 는 secondary 보조 빈만 책임. host 의 primary
 * EMF / TxMgr 는 host(소비 모듈) 가 명시 정의 (예: mcm/api/.../config/JpaConfig).
 * 이전 임시 fix 였던 cactus 측의 host primary 자동 등록 코드는 제거됨.
 */
@AutoConfiguration(after = CactusSecondaryDataSourceAutoConfiguration.class)
@ConditionalOnClass({EntityManagerFactory.class, HibernatePersistenceProvider.class})
@ConditionalOnBean(name = "cactusSecondaryDataSource")
@ConditionalOnProperty(prefix = "cactus.jpa.secondary", name = "enabled", havingValue = "true")
@EnableConfigurationProperties(CactusJpaProperties.class)
public class CactusSecondaryJpaAutoConfiguration {

    @Bean(name = "cactusSecondaryEntityManagerFactory")
    public EntityManagerFactory cactusSecondaryEntityManagerFactory(
            @Qualifier("cactusSecondaryDataSource") DataSource dataSource,
            CactusJpaProperties props) {

        CactusJpaProperties.Secondary sec = props.getSecondary();
        CactusJpaProperties.Secondary.Hibernate h = sec.getHibernate();

        Properties properties = new Properties();
        if (h.getDialect() != null && !h.getDialect().isBlank()) {
            properties.put("hibernate.dialect", h.getDialect());
        }
        properties.put("hibernate.hbm2ddl.auto", h.getDdlAuto());
        properties.put("hibernate.show_sql", Boolean.toString(h.isShowSql()));
        if (props.getSnakeNaming().isEnabled()) {
            properties.put("hibernate.physical_naming_strategy",
                    SnakePhysicalNamingStrategy.class.getName());
        }

        LocalContainerEntityManagerFactoryBean em = new LocalContainerEntityManagerFactoryBean();
        em.setDataSource(dataSource);
        em.setPersistenceUnitName(sec.getPersistenceUnitName());
        em.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        em.setJpaProperties(properties);
        if (!sec.getPackagesToScan().isEmpty()) {
            em.setPackagesToScan(sec.getPackagesToScan().toArray(new String[0]));
        }
        em.setPersistenceProviderClass(HibernatePersistenceProvider.class);
        em.afterPropertiesSet();
        return em.getObject();
    }

    @Bean(name = "cactusSecondaryTransactionManager")
    public PlatformTransactionManager cactusSecondaryTransactionManager(
            @Qualifier("cactusSecondaryEntityManagerFactory") EntityManagerFactory emf) {
        return new JpaTransactionManager(emf);
    }
}
