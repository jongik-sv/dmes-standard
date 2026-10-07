package com.dongkuk.caravan.hub.init;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

import javax.sql.DataSource;

/**
 * caravan-hub 가 소유한 Oracle 스키마(CARAVANUSER·IFUSER)의 Flyway 마이그레이션.
 *
 * <p>옛 {@code DataInitializer} 가 SQLite·MSSQL 용 DDL 을 직접 실행하던 자리를 대신한다
 * (docs/oracle-1007/schema-owners.md: CARAVANUSER·IFUSER 의 Flyway 주인은 caravan-hub).</p>
 *
 * <ul>
 *   <li>{@code caravanFlyway}: mst 데이터소스(CARAVANUSER 접속)에 {@code db/migration/caravanuser} 를 적용한다.
 *       Kafka 메타·라우팅 표 4종(TB_CARAVAN_TOPICS·TC_ERROR·HUB_CONFIG·APPHOST)이다.</li>
 *   <li>{@code ifuserFlyway}: IFUSER 로 따로 접속해 {@code db/migration/ifuser} 를 적용한다. IF_* 표는 운영자·DBA 가
 *       정의하므로 로컬·시험 전용이고 기본은 꺼짐이다({@code caravan-hub.flyway.ifuser.enabled}).
 *       if 데이터소스(EAIUSER)는 표를 만들 수 없는 접속 전용 사용자라 쓰지 않는다.</li>
 * </ul>
 *
 * <p>게이트는 표준 키 {@code spring.flyway.enabled}(기본 true)다. WildFly(dev·prod)는 false 로 두고 DBA 가 같은 V 파일을 적용한다.</p>
 */
@Slf4j
@Configuration
@ConditionalOnProperty(name = "spring.flyway.enabled", havingValue = "true", matchIfMissing = true)
public class HubFlywayConfig {

    /**
     * 표를 읽는 빈(caravan EMF·MyBatis 세션 팩터리)보다 마이그레이션을 먼저 돌린다. 수동 Flyway 빈은 Spring Boot 의 자동 순서
     * 보장(FlywayMigrationInitializer)을 받지 못해, 그대로 두면 Kafka 부트스트랩 등 먼저 만들어지는 빈이 표 없이 뜬다.
     */
    @Bean
    public static BeanFactoryPostProcessor flywayBeforeDataAccessBeans() {
        return beanFactory -> {
            for (String name : new String[] {"caravanEntityManagerFactory", "mstSqlSessionFactory"}) {
                addDependsOn(beanFactory.containsBeanDefinition(name) ? beanFactory.getBeanDefinition(name) : null,
                        "caravanFlyway");
            }
            for (String flyway : new String[] {"caravanFlyway", "ifuserFlyway"}) {
                if (beanFactory.containsBeanDefinition("ifSqlSessionFactory") && beanFactory.containsBeanDefinition(flyway)) {
                    addDependsOn(beanFactory.getBeanDefinition("ifSqlSessionFactory"), flyway);
                }
            }
        };
    }

    private static void addDependsOn(BeanDefinition definition, String dependency) {
        if (definition == null) {
            return;
        }
        String[] existing = definition.getDependsOn() == null ? new String[0] : definition.getDependsOn();
        String[] merged = java.util.Arrays.copyOf(existing, existing.length + 1);
        merged[existing.length] = dependency;
        definition.setDependsOn(merged);
    }

    @Bean(initMethod = "migrate")
    public Flyway caravanFlyway(@Qualifier("mstDataSource") DataSource mstDataSource) {
        log.info("[HubFlyway] CARAVANUSER 마이그레이션 적용 (classpath:db/migration/caravanuser)");
        return Flyway.configure()
                .dataSource(mstDataSource)
                .locations("classpath:db/migration/caravanuser")
                .load();
    }

    @Bean(initMethod = "migrate")
    @ConditionalOnProperty(name = "caravan-hub.flyway.ifuser.enabled", havingValue = "true")
    public Flyway ifuserFlyway(Environment env) {
        String url = env.getRequiredProperty("caravan-hub.flyway.ifuser.url");
        String user = env.getRequiredProperty("caravan-hub.flyway.ifuser.username");
        String password = env.getRequiredProperty("caravan-hub.flyway.ifuser.password");
        log.info("[HubFlyway] IFUSER 마이그레이션 적용 (classpath:db/migration/ifuser, 로컬·시험 전용)");
        return Flyway.configure()
                .dataSource(url, user, password)
                .locations("classpath:db/migration/ifuser")
                .load();
    }
}
