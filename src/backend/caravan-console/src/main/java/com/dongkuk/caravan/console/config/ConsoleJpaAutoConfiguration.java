package com.dongkuk.caravan.console.config;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;

/**
 * caravan-console 의 caravan-console 메타 entity Repository (AppHost / ConsoleCaravanHubConfig / ConsoleTopicInfo) 자동 등록
 * (0.2.0 신규 — 패턴 B).
 *
 * <p>{@code basePackages} 는 caravan-console 메타 entity 3종 패키지로 고정. {@code entityManagerFactoryRef} /
 * {@code transactionManagerRef} 는 고정 빈 이름 ({@code consoleEntityManagerFactory} /
 * {@code consoleTransactionManager}) — 호스트가 {@link ConsoleEmfAliasAutoConfiguration} 통해 자체 EMF/TxMgr
 * 빈을 위 이름으로 alias 등록.
 *
 * <p>활성 조건 — 호스트가 {@code console.repository.emf-bean} yml 명시 시. 미명시 시 비활성 →
 * 호스트가 자체 {@code @EnableJpaRepositories} 로 caravan-console Repository 등록 (0.1.x 호환).
 *
 * <p>호스트 yml 예 (mcm):
 * <pre>
 * console:
 *   repository:
 *     emf-bean: cactusEntityManagerFactoryIf
 *     tx-bean:  cactusTransactionManagerIf
 * </pre>
 */
@AutoConfiguration
@ConditionalOnClass({JpaRepository.class, EnableJpaRepositories.class})
@ConditionalOnProperty(prefix = "caravan-console.repository", name = "emf-bean")
@EnableConfigurationProperties(ConsoleRepositoryProperties.class)
@EnableJpaRepositories(
        basePackages = {
                "com.dongkuk.caravan.console.host",
                "com.dongkuk.caravan.console.caravanhubconfig",
                "com.dongkuk.caravan.console.topic"
        },
        entityManagerFactoryRef = "consoleEntityManagerFactory",
        transactionManagerRef = "consoleTransactionManager"
)
public class ConsoleJpaAutoConfiguration {
}
