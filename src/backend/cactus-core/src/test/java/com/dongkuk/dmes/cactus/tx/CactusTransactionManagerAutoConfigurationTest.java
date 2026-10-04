package com.dongkuk.dmes.cactus.tx;

import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusTransactionManagerAutoConfiguration} 특성 테스트 — 단일 EMF 환경의 JpaTxMgr 옵트인 등록 조건.
 */
class CactusTransactionManagerAutoConfigurationTest {

    private final EntityManagerFactory emf = mock(EntityManagerFactory.class);

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusTransactionManagerAutoConfiguration.class));

    @Test
    void jpa_unified_프로퍼티가_없으면_등록하지_않는다() {
        runner.withBean(EntityManagerFactory.class, () -> emf)
                .run(ctx -> assertThat(ctx).doesNotHaveBean(PlatformTransactionManager.class));
    }

    @Test
    void jpa_unified_true이고_EMF가_하나면_transactionManager_JpaTxMgr를_Primary로_등록한다() {
        runner.withBean(EntityManagerFactory.class, () -> emf)
                .withPropertyValues("cactus.tx.jpa-unified=true")
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(PlatformTransactionManager.class);
                    assertThat(ctx).hasBean("transactionManager");
                    JpaTransactionManager tx = ctx.getBean("transactionManager", JpaTransactionManager.class);
                    assertThat(tx.getEntityManagerFactory()).isSameAs(emf);
                    assertThat(ctx.getBeanFactory().getBeanDefinition("transactionManager").isPrimary()).isTrue();
                });
    }

    @Test
    void EMF가_둘이면_단일_후보가_아니어서_등록하지_않는다() {
        runner.withBean("emfA", EntityManagerFactory.class, () -> mock(EntityManagerFactory.class))
                .withBean("emfB", EntityManagerFactory.class, () -> mock(EntityManagerFactory.class))
                .withPropertyValues("cactus.tx.jpa-unified=true")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(PlatformTransactionManager.class));
    }

    @Test
    void EMF가_없으면_등록하지_않는다() {
        runner.withPropertyValues("cactus.tx.jpa-unified=true")
                .run(ctx -> assertThat(ctx).doesNotHaveBean(PlatformTransactionManager.class));
    }

    @Test
    void 이미_TxMgr가_있으면_그대로_두고_새로_만들지_않는다() {
        PlatformTransactionManager existing = mock(PlatformTransactionManager.class);
        runner.withBean(EntityManagerFactory.class, () -> emf)
                .withBean("hostTx", PlatformTransactionManager.class, () -> existing)
                .withPropertyValues("cactus.tx.jpa-unified=true")
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(PlatformTransactionManager.class);
                    assertThat(ctx.getBean(PlatformTransactionManager.class)).isSameAs(existing);
                    assertThat(ctx).doesNotHaveBean("transactionManager");
                });
    }
}
