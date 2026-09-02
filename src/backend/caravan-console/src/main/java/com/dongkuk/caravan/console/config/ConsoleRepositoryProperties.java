package com.dongkuk.caravan.console.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * caravan-console 의 JPA Repository 가 사용할 EMF/TxMgr 빈 이름 (0.2.0 신규 — 패턴 B).
 *
 * <pre>
 * console:
 *   repository:
 *     emf-bean: cactusEntityManagerFactoryIf   # 호스트가 등록한 EMF 빈 이름
 *     tx-bean:  cactusTransactionManagerIf     # 호스트가 등록한 TxMgr 빈 이름
 * </pre>
 *
 * <p>본 properties 가 있으면 {@code ConsoleJpaAutoConfiguration} 활성 + {@code ConsoleEmfAliasAutoConfiguration}
 * 가 호스트의 빈을 {@code consoleEntityManagerFactory} / {@code consoleTransactionManager} alias 로 등록.
 *
 * <p>호스트가 본 properties 미명시 시 두 자동설정 모두 noop — 0.1.x 호환 (호스트가 직접
 * {@code @EnableJpaRepositories(basePackages = "com.dongkuk.caravan.console...")} 명시한 케이스).
 */
@ConfigurationProperties(prefix = "caravan-console.repository")
public class ConsoleRepositoryProperties {

    /** 호스트가 등록한 EntityManagerFactory 빈 이름. {@code consoleEntityManagerFactory} 로 alias 됨. */
    private String emfBean;

    /** 호스트가 등록한 TransactionManager 빈 이름. {@code consoleTransactionManager} 로 alias 됨. */
    private String txBean;

    public String getEmfBean() { return emfBean; }
    public void setEmfBean(String emfBean) { this.emfBean = emfBean; }

    public String getTxBean() { return txBean; }
    public void setTxBean(String txBean) { this.txBean = txBean; }
}
