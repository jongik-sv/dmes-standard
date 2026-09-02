package com.dongkuk.dmes.cactus.jpa;

import org.hibernate.boot.model.naming.PhysicalNamingStrategy;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.hibernate.autoconfigure.HibernatePropertiesCustomizer;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Hibernate properties 자동 customizer.
 * Phase 1 (2026-05-12) — 미결 #1 결정사항: {@link SnakePhysicalNamingStrategy} 자동 주입.
 * Phase 2 (2026-05-13) — table prefix / UK·Index implicit naming 도 함께 처리.
 *
 * <p>주입되는 strategy 결정 로직:
 * <ul>
 *   <li>{@code cactus.jpa.table-prefix} 가 비어있으면 {@link SnakePhysicalNamingStrategy}
 *       — 부모 동작 그대로 (호환성 유지).</li>
 *   <li>비어있지 않으면 {@link PrefixedSnakePhysicalNamingStrategy} 로 자동 전환.</li>
 *   <li>{@code cactus.jpa.implicit-naming.enabled = true} 면
 *       {@link CactusImplicitNamingStrategy} 도 함께 주입.</li>
 * </ul>
 *
 * <p>활성 조건:
 * <ul>
 *   <li>{@code PhysicalNamingStrategy} 클래스가 classpath 에 (Hibernate 가 있을 때만)</li>
 *   <li>{@code cactus.jpa.snake-naming.enabled} = true (기본)</li>
 * </ul>
 *
 * <p><b>주의 — 무효화 조건</b>: 소비 모듈이 자체 {@code LocalContainerEntityManagerFactoryBean}
 * 빈을 정의하고 {@code setJpaPropertyMap(...)} 으로 properties 를 *직접* 설정하면 본 customizer 가
 * 호출되지 않는다. 미결 #2 결정사항에 따라 mpp/mqc/mcm 의 자체 JpaConfig 를 Phase 6 에서 삭제 →
 * Spring Boot 자동 EMF 가 본 customizer 를 자동 호출.
 */
@AutoConfiguration
@ConditionalOnClass({PhysicalNamingStrategy.class, HibernatePropertiesCustomizer.class})
@ConditionalOnProperty(prefix = "cactus.jpa.snake-naming",
        name = "enabled", havingValue = "true", matchIfMissing = true)
@EnableConfigurationProperties(CactusJpaProperties.class)
public class CactusHibernateCustomizerAutoConfiguration {

    /**
     * Spring Boot 자동 EMF 빌더가 호출하는 customizer 빈.
     * jpaProperties Map 에 physical / (옵션) implicit naming strategy 인스턴스를 추가한다.
     */
    @Bean
    public HibernatePropertiesCustomizer cactusSnakeNamingCustomizer(CactusJpaProperties props) {
        String tablePrefix = props.getTablePrefix();
        boolean hasPrefix = tablePrefix != null && !tablePrefix.isEmpty();
        PhysicalNamingStrategy physical = hasPrefix
                ? new PrefixedSnakePhysicalNamingStrategy(tablePrefix)
                : new SnakePhysicalNamingStrategy();

        CactusJpaProperties.ImplicitNaming implicitCfg = props.getImplicitNaming();
        boolean implicitEnabled = implicitCfg != null && implicitCfg.isEnabled();
        CactusImplicitNamingStrategy implicit = implicitEnabled
                ? new CactusImplicitNamingStrategy(implicitCfg.getUkPrefix(), implicitCfg.getIdxPrefix(), tablePrefix)
                : null;

        return jpaProperties -> {
            jpaProperties.put("hibernate.physical_naming_strategy", physical);
            if (implicit != null) {
                jpaProperties.put("hibernate.implicit_naming_strategy", implicit);
            }
        };
    }
}
