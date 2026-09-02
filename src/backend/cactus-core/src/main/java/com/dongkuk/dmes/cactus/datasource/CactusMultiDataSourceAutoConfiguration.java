package com.dongkuk.dmes.cactus.datasource;

import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;

import javax.sql.DataSource;
import java.util.Map;
import java.util.Set;

/**
 * cactus.datasource.extras 의 각 entry 별 DataSource 빈 동적 등록 (1.0.21-SNAPSHOT 신규).
 *
 * <p>연결 경로 2종 (2026-07-07 JNDI 전환 설계 — docs/framework/DataSource_JNDI설계.md):
 * <ul>
 *   <li>{@code jndi-name} 설정 시 — {@code JndiDataSourceLookup} 으로 WildFly 컨테이너 관리 풀 조회
 *       (destroyMethod 미설정 — 컨테이너 풀 close 금지)</li>
 *   <li>미설정 시 — 기존 {@link HikariDataSource} 직결 (하위호환 100%)</li>
 * </ul>
 *
 * <p>빈 이름: {@code cactusDataSource{Name}} (PascalCase). 예: yml {@code cmn} → {@code cactusDataSourceCmn}.
 * 또한 yml key 그대로 alias 등록 — BPMN {@code <camunda:property name="ds" value="cmn"/>} 가 lookup 가능.
 *
 * <p>옵션 β — {@code primary-alias} 명시 시 Spring Boot 의 {@code dataSource} 빈에 alias 등록.
 *
 * <p>R-multi-1 / R-multi-18 완화: {@code @AutoConfiguration(after = DataSourceAutoConfiguration.class)} +
 * extras 빈에 {@code @Primary} 안 붙임 → Spring Boot 의 primary DataSource 빈 자동 등록을 방해 안 함.
 *
 * <p>R-multi-28 완화 (검증 1-quater): extras key 가 primary-alias 와 충돌 시 fail-fast.
 *
 * <p>1.0.21 호환성: {@link CactusSecondaryDataSourceAutoConfiguration} (deprecated) 와 공존.
 * 본 클래스는 extras Map 만 처리, secondary 는 별도 자동설정이 처리. 1.0.22 에서 secondary 제거 예정.
 */
@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass(HikariDataSource.class)
public class CactusMultiDataSourceAutoConfiguration
        implements BeanDefinitionRegistryPostProcessor, EnvironmentAware {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiDataSourceAutoConfiguration.class);

    /** Spring Boot 표준 빈 이름 — extras key 로 사용 금지 (R-multi-28). */
    private static final Set<String> RESERVED_BEAN_NAMES = Set.of(
            "dataSource", "transactionManager", "entityManagerFactory",
            "sqlSessionFactory", "sqlSessionTemplate"
    );

    private CactusDataSourceProperties props;

    @Override
    public void setEnvironment(Environment environment) {
        // BeanDefinitionRegistryPostProcessor 는 default constructor 로 인스턴스화되어
        // @EnableConfigurationProperties 주입 불가. Binder 로 직접 binding.
        this.props = Binder.get(environment)
                .bind("cactus.datasource", CactusDataSourceProperties.class)
                .orElseGet(CactusDataSourceProperties::new);
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
        if (props == null) return;
        Map<String, CactusDataSourceProperties.DataSourceProps> extras = props.getExtras();
        String primaryAlias = props.getPrimaryAlias();

        for (Map.Entry<String, CactusDataSourceProperties.DataSourceProps> entry : extras.entrySet()) {
            String name = entry.getKey();
            validateExtrasKey(name, primaryAlias, extras);

            CactusDataSourceProperties.DataSourceProps p = entry.getValue();
            String beanName = "cactusDataSource" + capitalize(name);

            GenericBeanDefinition bd = new GenericBeanDefinition();
            String jndiName = p.getJndiName();
            if (jndiName != null && !jndiName.isBlank()) {
                // ── JNDI 경로 (2026-07-07 JNDI 전환 설계) — WildFly 등 컨테이너 관리 DataSource lookup ──
                // beanClass 는 인터페이스(DataSource)로 — 실체는 컨테이너 벤더 프록시라 Hikari 아님.
                // destroyMethodName 미설정 필수 — 컨테이너 소유 풀을 Spring 셧다운이 close 하면 안 됨.
                bd.setBeanClass(DataSource.class);
                bd.setInstanceSupplier(() -> new JndiDataSourceLookup().getDataSource(jndiName));
                bd.setPrimary(false);

                registry.registerBeanDefinition(beanName, bd);
                registry.registerAlias(beanName, name);

                log.info("[Cactus] extras DataSource — bean='{}' alias='{}' jndi-name={}",
                        beanName, name, jndiName);
                continue;
            }

            // ── HikariCP 직결 경로 (기존 동작 — jndi-name 미설정 시 100% 동일) ──
            bd.setBeanClass(HikariDataSource.class);
            bd.setInstanceSupplier(() -> buildHikari(p, beanName));
            bd.setPrimary(false);
            bd.setDestroyMethodName("close");

            registry.registerBeanDefinition(beanName, bd);
            registry.registerAlias(beanName, name);

            log.info("[Cactus] extras DataSource — bean='{}' alias='{}' url={}",
                    beanName, name, p.getUrl());
        }

        if (primaryAlias != null && !primaryAlias.isBlank()) {
            if (extras.containsKey(primaryAlias)) {
                throw new IllegalStateException(String.format(
                        "cactus.datasource.primary-alias='%s' 가 cactus.datasource.extras 의 key 와 충돌. " +
                                "다른 이름 사용.", primaryAlias));
            }
            registry.registerAlias("dataSource", primaryAlias);
            log.info("[Cactus] primary DataSource alias — dataSource → '{}'", primaryAlias);
        }
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        // no-op — registerBeanDefinition 은 postProcessBeanDefinitionRegistry 단계에서 완료
    }

    private void validateExtrasKey(String name, String primaryAlias,
                                   Map<String, CactusDataSourceProperties.DataSourceProps> extras) {
        if (name == null || name.isBlank()) {
            throw new IllegalStateException("cactus.datasource.extras 의 key 는 비어있을 수 없음.");
        }
        if (RESERVED_BEAN_NAMES.contains(name)) {
            throw new IllegalStateException(String.format(
                    "cactus.datasource.extras.%s — Spring Boot 표준 빈 이름과 충돌. 다른 이름 사용.", name));
        }
        if (name.startsWith("cactus")) {
            throw new IllegalStateException(String.format(
                    "cactus.datasource.extras.%s — cactus 자체 빈 prefix 와 충돌. 다른 이름 사용.", name));
        }
    }

    private HikariDataSource buildHikari(CactusDataSourceProperties.DataSourceProps p, String poolName) {
        HikariConfig cfg = new HikariConfig();
        cfg.setJdbcUrl(p.getUrl());
        if (p.getUsername() != null) cfg.setUsername(p.getUsername());
        if (p.getPassword() != null) cfg.setPassword(p.getPassword());
        if (p.getDriverClassName() != null && !p.getDriverClassName().isBlank()) {
            cfg.setDriverClassName(p.getDriverClassName());
        }
        cfg.setPoolName(p.getPoolName() != null ? p.getPoolName() : poolName);
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
