package com.dongkuk.dmes.cactus.tx;

import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.datasource.CactusMultiDataSourceAutoConfiguration;
import com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.BeansException;
import org.springframework.beans.factory.BeanFactory;
import org.springframework.beans.factory.BeanFactoryAware;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.beans.factory.support.BeanDefinitionRegistryPostProcessor;
import org.springframework.beans.factory.support.GenericBeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.EnvironmentAware;
import org.springframework.core.SimpleAliasRegistry;
import org.springframework.core.env.Environment;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.Map;

/**
 * cactus.tx.managers 의 각 entry 마다 TxMgr 빈 alias 등록 + extras DS 의 EMF 부재 케이스
 * fallback {@link DataSourceTransactionManager} 직접 등록 (1.0.21-SNAPSHOT 신규).
 *
 * <p>alias 매핑 (옵션 β):
 * <ul>
 *   <li>data-source = primary-alias → {@code transactionManager} (host 의 JpaTxMgr) 에 alias</li>
 *   <li>data-source = extras key + jpa.extras 정의됨 → {@code cactusTransactionManager{Name}} (JpaTxMgr) 에 alias</li>
 *   <li>data-source = extras key + jpa.extras 미정의 → 본 클래스가 {@link DataSourceTransactionManager} 등록 후 alias</li>
 * </ul>
 *
 * <p>{@code cactus.tx.default} 의 TxMgr 에는 {@code @Primary} 명시 (R-multi-8 — 자동 추론 회피).
 *
 * <p>활성 조건: {@code cactus.tx.managers} 가 비어있지 않음. 비어있으면 noop (mcm 1.0.20 호환).
 */
@AutoConfiguration(after = {
        CactusMultiDataSourceAutoConfiguration.class,
        CactusMultiJpaAutoConfiguration.class
})
public class CactusMultiTransactionManagerAutoConfiguration
        implements BeanDefinitionRegistryPostProcessor, EnvironmentAware, BeanFactoryAware {

    private static final Logger log = LoggerFactory.getLogger(CactusMultiTransactionManagerAutoConfiguration.class);

    private CactusTxProperties txProps;
    private CactusDataSourceProperties dsProps;
    private BeanFactory beanFactory;

    @Override
    public void setEnvironment(Environment environment) {
        Binder binder = Binder.get(environment);
        this.txProps = binder.bind("cactus.tx", CactusTxProperties.class)
                .orElseGet(CactusTxProperties::new);
        this.dsProps = binder.bind("cactus.datasource", CactusDataSourceProperties.class)
                .orElseGet(CactusDataSourceProperties::new);
    }

    @Override
    public void setBeanFactory(BeanFactory beanFactory) throws BeansException {
        this.beanFactory = beanFactory;
    }

    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) throws BeansException {
        if (txProps == null || txProps.getManagers().isEmpty()) return;

        // 1. extras DS 의 EMF 부재 케이스 fallback DataSourceTxMgr 등록
        for (String dsName : dsProps.getExtras().keySet()) {
            String txBeanName = "cactusTransactionManager" + capitalize(dsName);
            if (registry.containsBeanDefinition(txBeanName)) continue;

            GenericBeanDefinition bd = new GenericBeanDefinition();
            bd.setBeanClass(DataSourceTransactionManager.class);
            bd.setInstanceSupplier(() -> {
                DataSource ds = beanFactory.getBean(dsName, DataSource.class);
                return new DataSourceTransactionManager(ds);
            });
            bd.setPrimary(false);
            registry.registerBeanDefinition(txBeanName, bd);
            log.info("[Cactus Tx] fallback DataSourceTxMgr — bean='{}' (DS '{}' has no JPA extras)",
                    txBeanName, dsName);
        }

        // 2. managers 의 각 entry 마다 alias 등록 + default 에 setPrimary
        String defaultName = txProps.getDefaultManager();
        for (Map.Entry<String, CactusTxProperties.TxMgrConfig> entry : txProps.getManagers().entrySet()) {
            String aliasName = entry.getKey();
            String dataSource = entry.getValue().getDataSource();
            if (dataSource == null || dataSource.isBlank()) {
                throw new IllegalStateException(String.format(
                        "cactus.tx.managers.%s.data-source 키 필수.", aliasName));
            }
            String targetBeanName = resolveTargetBeanName(dataSource);

            if (!registry.containsBeanDefinition(targetBeanName)
                    && !registry.isAlias(targetBeanName)) {
                throw new IllegalStateException(String.format(
                        "TxMgr alias 등록 실패 — 대상 빈 '%s' 미정의 (cactus.tx.managers.%s.data-source='%s'). " +
                                "cactus.datasource.primary-alias 또는 cactus.datasource.extras 정의 확인.",
                        targetBeanName, aliasName, dataSource));
            }

            registry.registerAlias(targetBeanName, aliasName);
            log.info("[Cactus Tx] alias — '{}' → '{}'", aliasName, targetBeanName);

            if (aliasName.equals(defaultName)) {
                // 대상이 alias 일 수 있다 (존재 검사도 isAlias 를 인정) — 빈 정의는 실제 이름으로 찾는다
                String canonicalName = canonicalName(registry, targetBeanName);
                BeanDefinition bd = registry.getBeanDefinition(canonicalName);
                bd.setPrimary(true);
                log.info("[Cactus Tx] default TxMgr @Primary — '{}' (target '{}', alias '{}')",
                        canonicalName, targetBeanName, aliasName);
            }
        }
    }

    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory beanFactory) throws BeansException {
        // no-op
    }

    /**
     * data-source 이름 → 실제 TxMgr 빈 이름 매핑 (옵션 β).
     */
    private String resolveTargetBeanName(String dataSource) {
        if (dsProps.getPrimaryAlias() != null && dsProps.getPrimaryAlias().equals(dataSource)) {
            return "transactionManager";
        }
        return "cactusTransactionManager" + capitalize(dataSource);
    }

    /**
     * alias 를 실제 빈 정의 이름으로 푼다. 이름이 alias 가 아니면 그대로 돌려준다.
     * registry 는 보통 {@link SimpleAliasRegistry} 인 DefaultListableBeanFactory 라 alias 사슬까지 풀린다.
     */
    static String canonicalName(BeanDefinitionRegistry registry, String name) {
        if (!registry.isAlias(name)) {
            return name;
        }
        if (registry instanceof SimpleAliasRegistry aliasRegistry) {
            return aliasRegistry.canonicalName(name);
        }
        for (String candidate : registry.getBeanDefinitionNames()) {
            if (Arrays.asList(registry.getAliases(candidate)).contains(name)) {
                return candidate;
            }
        }
        return name;
    }

    private static String capitalize(String s) {
        return Character.toUpperCase(s.charAt(0)) + s.substring(1);
    }
}
