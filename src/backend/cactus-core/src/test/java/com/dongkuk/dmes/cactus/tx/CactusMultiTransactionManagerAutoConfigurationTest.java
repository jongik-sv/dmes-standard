package com.dongkuk.dmes.cactus.tx;

import com.dongkuk.dmes.cactus.jpa.CactusMultiJpaAutoConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.NoUniqueBeanDefinitionException;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusMultiTransactionManagerAutoConfiguration} 특성 테스트 — TxMgr 빈 이름·alias·기본(@Primary) 매니저 선택.
 *
 * <p>Hikari 풀을 띄우지 않으려고 다중 DataSource 자동설정은 넣지 않는다. 본 자동설정은 {@code cactus.datasource}
 * 를 스스로 바인딩하므로 extras 는 프로퍼티로만 선언하고, extras key 이름의 DataSource 는 mock 빈으로 둔다.
 */
class CactusMultiTransactionManagerAutoConfigurationTest {

    private final PlatformTransactionManager hostTxMgr = mock(PlatformTransactionManager.class);
    private final DataSource cmnDs = mock(DataSource.class);
    private final DataSource ifDs = mock(DataSource.class);

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusMultiTransactionManagerAutoConfiguration.class))
            .withBean("transactionManager", PlatformTransactionManager.class, () -> hostTxMgr)
            .withBean("cmn", DataSource.class, () -> cmnDs)
            .withBean("if", DataSource.class, () -> ifDs)
            .withPropertyValues(
                    "cactus.datasource.primary-alias=biz",
                    "cactus.datasource.extras.cmn.url=jdbc:test:cmn",
                    "cactus.datasource.extras.if.url=jdbc:test:if",
                    "cactus.tx.managers.txBiz.data-source=biz",
                    "cactus.tx.managers.txCmn.data-source=cmn",
                    "cactus.tx.managers.txIF.data-source=if");

    /** 모든 빈 정의를 lazy 로 돌려 인스턴스 생성 없이 정의만 본다. */
    private static ApplicationContextRunner lazy(ApplicationContextRunner r) {
        return r.withInitializer(ctx -> ctx.addBeanFactoryPostProcessor(bf -> {
            for (String n : bf.getBeanDefinitionNames()) {
                bf.getBeanDefinition(n).setLazyInit(true);
            }
        }));
    }

    @Test
    void managers가_비면_extras가_있어도_fallback_TxMgr를_등록하지_않는다() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiTransactionManagerAutoConfiguration.class))
                .withBean("cmn", DataSource.class, () -> cmnDs)
                .withPropertyValues("cactus.datasource.extras.cmn.url=jdbc:test:cmn")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean("cactusTransactionManagerCmn");
                    assertThat(ctx).doesNotHaveBean(PlatformTransactionManager.class);
                });
    }

    @Test
    void JPA_extras가_없는_extras_DS마다_DataSourceTransactionManager를_등록한다() {
        runner.withPropertyValues("cactus.tx.default-manager=txBiz").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean("cactusTransactionManagerCmn"))
                    .isInstanceOf(DataSourceTransactionManager.class);
            assertThat(((DataSourceTransactionManager) ctx.getBean("cactusTransactionManagerCmn")).getDataSource())
                    .isSameAs(cmnDs);
            // yml key "if" → 첫 글자만 대문자 → cactusTransactionManagerIf
            assertThat(((DataSourceTransactionManager) ctx.getBean("cactusTransactionManagerIf")).getDataSource())
                    .isSameAs(ifDs);
        });
    }

    @Test
    void managers_key가_대상_TxMgr의_alias로_등록된다() {
        runner.withPropertyValues("cactus.tx.default-manager=txBiz").run(ctx -> {
            assertThat(ctx.getBean("txBiz")).isSameAs(hostTxMgr);
            assertThat(ctx.getBean("txCmn")).isSameAs(ctx.getBean("cactusTransactionManagerCmn"));
            assertThat(ctx.getBean("txIF")).isSameAs(ctx.getBean("cactusTransactionManagerIf"));
            assertThat(ctx.getBeanFactory().getAliases("transactionManager")).containsExactly("txBiz");
            assertThat(ctx.getBeanFactory().getAliases("cactusTransactionManagerCmn")).containsExactly("txCmn");
        });
    }

    @Test
    void default가_primary_alias를_가리키면_host_transactionManager가_Primary가_된다() {
        runner.withPropertyValues("cactus.tx.default-manager=txBiz").run(ctx -> {
            assertThat(ctx.getBean(PlatformTransactionManager.class)).isSameAs(hostTxMgr);
            assertThat(ctx.getBeanFactory().getBeanDefinition("transactionManager").isPrimary()).isTrue();
            assertThat(ctx.getBeanFactory().getBeanDefinition("cactusTransactionManagerCmn").isPrimary()).isFalse();
        });
    }

    @Test
    void default가_extras를_가리키면_fallback_TxMgr가_Primary가_된다() {
        runner.withPropertyValues("cactus.tx.default-manager=txCmn").run(ctx -> {
            assertThat(ctx.getBean(PlatformTransactionManager.class))
                    .isSameAs(ctx.getBean("cactusTransactionManagerCmn"));
            assertThat(ctx.getBeanFactory().getBeanDefinition("transactionManager").isPrimary()).isFalse();
        });
    }

    @Test
    void default가_없으면_Primary를_지정하지_않아_타입_조회가_모호하다() {
        runner.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBeanFactory().getBeanDefinition("transactionManager").isPrimary()).isFalse();
            assertThat(ctx.getBeansOfType(PlatformTransactionManager.class)).hasSize(3);
            // Primary 가 없어 타입만으로 꺼내면 후보 3개 중 하나를 고르지 못한다
            assertThatThrownBy(() -> ctx.getBean(PlatformTransactionManager.class))
                    .isInstanceOf(NoUniqueBeanDefinitionException.class);
        });
    }

    @Test
    void 같은_DS를_여러_alias가_가리키면_한_빈에_alias가_여러_개_붙는다() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiTransactionManagerAutoConfiguration.class))
                .withBean("transactionManager", PlatformTransactionManager.class, () -> hostTxMgr)
                .withPropertyValues(
                        "cactus.datasource.primary-alias=biz",
                        "cactus.tx.managers.txBiz.data-source=biz",
                        "cactus.tx.managers.txCmn.data-source=biz",
                        "cactus.tx.default-manager=txBiz")
                .run(ctx -> {
                    assertThat(ctx.getBean("txBiz")).isSameAs(hostTxMgr);
                    assertThat(ctx.getBean("txCmn")).isSameAs(hostTxMgr);
                    assertThat(ctx.getBeanFactory().getAliases("transactionManager"))
                            .containsExactlyInAnyOrder("txBiz", "txCmn");
                });
    }

    @Test
    void data_source가_공백이면_부팅이_실패한다() {
        runner.withPropertyValues("cactus.tx.managers.txIF.data-source=", "cactus.tx.default-manager=txBiz")
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(NestedExceptionUtils.getMostSpecificCause(ctx.getStartupFailure()))
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("cactus.tx.managers.txIF.data-source 키 필수");
                });
    }

    @Test
    void 대상_TxMgr_빈이_없으면_부팅이_실패한다() {
        runner.withPropertyValues("cactus.tx.managers.txIF.data-source=zzz", "cactus.tx.default-manager=txBiz")
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(NestedExceptionUtils.getMostSpecificCause(ctx.getStartupFailure()))
                            .isInstanceOf(IllegalStateException.class)
                            .hasMessageContaining("대상 빈 'cactusTransactionManagerZzz' 미정의");
                });
    }

    @Test
    void primary_alias인데_host_transactionManager가_없으면_부팅이_실패한다() {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiTransactionManagerAutoConfiguration.class))
                .withPropertyValues(
                        "cactus.datasource.primary-alias=biz",
                        "cactus.tx.managers.txBiz.data-source=biz",
                        "cactus.tx.default-manager=txBiz")
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(NestedExceptionUtils.getMostSpecificCause(ctx.getStartupFailure()))
                            .hasMessageContaining("대상 빈 'transactionManager' 미정의");
                });
    }

    /** host 가 transactionManager 를 alias 로만 노출하는 구성 (예: @Bean(name={"jpaTx","transactionManager"})). */
    private ApplicationContextRunner aliasOnlyHostRunner() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(CactusMultiTransactionManagerAutoConfiguration.class))
                .withBean("jpaTx", PlatformTransactionManager.class, () -> hostTxMgr)
                .withInitializer(ctx -> ctx.getBeanFactory().registerAlias("jpaTx", "transactionManager"))
                .withPropertyValues(
                        "cactus.datasource.primary-alias=biz",
                        "cactus.tx.managers.txBiz.data-source=biz");
    }

    @Test
    void 대상이_alias면_default가_아닐_때는_alias에_alias를_이어_붙인다() {
        aliasOnlyHostRunner().run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBean("txBiz")).isSameAs(hostTxMgr);
        });
    }

    /**
     * 존재 검사가 {@code registry.isAlias(...)} 를 인정하듯, default 의 @Primary 지정도 alias 를 실제 빈 이름으로 풀어
     * 부팅이 성공한다 (예전에는 {@code getBeanDefinition(alias)} 로 NoSuchBeanDefinitionException).
     */
    @Test
    void 대상이_alias이고_default여도_부팅되고_alias_사슬이_유지된다() {
        aliasOnlyHostRunner().withPropertyValues("cactus.tx.default-manager=txBiz").run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx.getBeanFactory().getAliases("jpaTx")).containsExactlyInAnyOrder("transactionManager", "txBiz");
            assertThat(ctx.getBean("transactionManager")).isSameAs(hostTxMgr);
            assertThat(ctx.getBean(PlatformTransactionManager.class)).isSameAs(hostTxMgr);
        });
    }

    /** 결함 수정 — default 대상이 alias 면 실제(canonical) 빈 정의에 @Primary 를 붙인다. */
    @Test
    void 대상이_alias이고_default면_실제_빈에_Primary를_붙인다() {
        PlatformTransactionManager otherTx = mock(PlatformTransactionManager.class);
        aliasOnlyHostRunner()
                .withBean("otherTx", PlatformTransactionManager.class, () -> otherTx)
                .withPropertyValues("cactus.tx.default-manager=txBiz")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx.getBeanFactory().getBeanDefinition("jpaTx").isPrimary()).isTrue();
                    assertThat(ctx.getBeanFactory().getBeanDefinition("otherTx").isPrimary()).isFalse();
                    assertThat(ctx.getBean("txBiz")).isSameAs(hostTxMgr);
                    // 같은 타입 후보가 둘이어도 @Primary 로 host TxMgr 가 골라진다
                    assertThat(ctx.getBean(PlatformTransactionManager.class)).isSameAs(hostTxMgr);
                });
    }

    @Test
    void JPA_extras가_있으면_JpaTransactionManager를_쓰고_fallback을_만들지_않는다() {
        lazy(new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        CactusMultiJpaAutoConfiguration.class,
                        CactusMultiTransactionManagerAutoConfiguration.class))
                .withBean("transactionManager", PlatformTransactionManager.class, () -> hostTxMgr)
                .withPropertyValues(
                        "cactus.datasource.primary-alias=biz",
                        "cactus.datasource.extras.cmn.url=jdbc:test:cmn",
                        "cactus.datasource.extras.if.url=jdbc:test:if",
                        "cactus.jpa.extras.cmn.packages-to-scan=com.example.none",
                        "cactus.tx.managers.txBiz.data-source=biz",
                        "cactus.tx.managers.txCmn.data-source=cmn",
                        "cactus.tx.managers.txIF.data-source=if",
                        "cactus.tx.default-manager=txCmn"))
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    BeanDefinition cmnTx = ctx.getBeanFactory().getBeanDefinition("cactusTransactionManagerCmn");
                    assertThat(cmnTx.getBeanClassName()).isEqualTo(JpaTransactionManager.class.getName());
                    assertThat(cmnTx.isPrimary()).isTrue();
                    BeanDefinition ifTx = ctx.getBeanFactory().getBeanDefinition("cactusTransactionManagerIf");
                    assertThat(ifTx.getBeanClassName()).isEqualTo(DataSourceTransactionManager.class.getName());
                    assertThat(ctx.getBeanFactory().getAliases("cactusTransactionManagerCmn")).containsExactly("txCmn");
                });
    }
}
