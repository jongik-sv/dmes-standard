package com.dongkuk.caravan.console.config;

import jakarta.persistence.EntityManagerFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

/**
 * 호스트가 등록한 EMF/TxMgr 빈을 {@code consoleEntityManagerFactory} / {@code consoleTransactionManager}
 * alias 로 등록하여 {@link ConsoleJpaAutoConfiguration} 의 ref 가 가리킬 수 있게 함 (0.2.0 신규 — 패턴 B).
 *
 * <p>활성 조건 — {@link ConsoleJpaAutoConfiguration} 와 동일 ({@code caravan-console.repository.emf-bean} 명시).
 *
 * <p>BFPP 단계 동작 (BDRPP 후) — 모든 빈 정의 등록 완료 후 alias 등록. 호스트의 EMF 빈 정의가
 * 본 alias 등록 전 BeanDefinitionRegistry 에 있어야 함 (cactus-core 의
 * {@code CactusMultiJpaAutoConfiguration} 이 BDRPP 단계에서 등록 → 본 BFPP 시점에 보장됨).
 */
@AutoConfiguration
@ConditionalOnClass(EntityManagerFactory.class)
@ConditionalOnProperty(prefix = "caravan-console.repository", name = "emf-bean")
@EnableConfigurationProperties(ConsoleRepositoryProperties.class)
public class ConsoleEmfAliasAutoConfiguration {

    private static final Logger log = LoggerFactory.getLogger(ConsoleEmfAliasAutoConfiguration.class);

    /**
     * static 메서드 — BFPP 빈은 정적으로 등록해야 EarlyBeanReferences 회피.
     */
    @Bean
    public static BeanFactoryPostProcessor consoleEmfAliasPostProcessor(Environment env) {
        return beanFactory -> {
            if (!(beanFactory instanceof BeanDefinitionRegistry registry)) return;

            String emfBean = env.getProperty("caravan-console.repository.emf-bean");
            String txBean = env.getProperty("caravan-console.repository.tx-bean");

            if (emfBean != null && !emfBean.isBlank()) {
                if (registry.containsBeanDefinition(emfBean)) {
                    registry.registerAlias(emfBean, "consoleEntityManagerFactory");
                    log.info("[caravan-console] EMF alias — '{}' → 'consoleEntityManagerFactory'", emfBean);
                } else {
                    throw new IllegalStateException(String.format(
                            "caravan-console.repository.emf-bean='%s' 빈이 BeanDefinitionRegistry 에 없음. " +
                                    "호스트가 해당 EMF 빈 등록 확인 (예: cactus.jpa.extras.{name} 정의).",
                            emfBean));
                }
            }
            if (txBean != null && !txBean.isBlank()) {
                if (registry.containsBeanDefinition(txBean)) {
                    registry.registerAlias(txBean, "consoleTransactionManager");
                    log.info("[caravan-console] TxMgr alias — '{}' → 'consoleTransactionManager'", txBean);
                } else {
                    throw new IllegalStateException(String.format(
                            "caravan-console.repository.tx-bean='%s' 빈이 BeanDefinitionRegistry 에 없음.", txBean));
                }
            }
        };
    }
}
