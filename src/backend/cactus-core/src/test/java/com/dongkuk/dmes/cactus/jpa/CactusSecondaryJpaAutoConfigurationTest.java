package com.dongkuk.dmes.cactus.jpa;

import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.transaction.PlatformTransactionManager;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusSecondaryJpaAutoConfiguration} (deprecated secondary) 특성 테스트 — 등록 조건.
 *
 * <p>EMF 를 실제로 만드는 경로는 hibernate 추가 속성을 받지 않아(JDBC 메타데이터 조회를 끌 수 없음) DB 없이
 * 만들 수 없으므로, 조건이 맞지 않을 때 등록하지 않는 쪽만 고정한다.
 */
class CactusSecondaryJpaAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusSecondaryJpaAutoConfiguration.class));

    @Test
    void enabled가_없으면_secondary_DataSource가_있어도_등록하지_않는다() {
        runner.withBean("cactusSecondaryDataSource", DataSource.class, () -> mock(DataSource.class))
                .run(ctx -> {
                    assertThat(ctx).doesNotHaveBean(EntityManagerFactory.class);
                    assertThat(ctx).doesNotHaveBean(PlatformTransactionManager.class);
                });
    }

    @Test
    void secondary_DataSource_빈이_없으면_enabled여도_등록하지_않는다() {
        runner.withPropertyValues("cactus.jpa.secondary.enabled=true")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean("cactusSecondaryEntityManagerFactory");
                    assertThat(ctx).doesNotHaveBean("cactusSecondaryTransactionManager");
                });
    }

    @Test
    void 이름이_다른_DataSource만_있으면_등록하지_않는다() {
        runner.withBean("dataSource", DataSource.class, () -> mock(DataSource.class))
                .withPropertyValues("cactus.jpa.secondary.enabled=true")
                .run(ctx -> assertThat(ctx).doesNotHaveBean("cactusSecondaryEntityManagerFactory"));
    }

    @Test
    void secondary_프로퍼티_기본값() {
        @SuppressWarnings("deprecation")
        CactusJpaProperties.Secondary sec = new CactusJpaProperties().getSecondary();

        assertThat(sec.isEnabled()).isFalse();
        assertThat(sec.getPersistenceUnitName()).isEqualTo("cactus-secondary");
        assertThat(sec.getPackagesToScan()).isEmpty();
        assertThat(sec.getHibernate().getDdlAuto()).isEqualTo("none");
        assertThat(sec.getHibernate().isShowSql()).isFalse();
        assertThat(sec.getHibernate().getDialect()).isNull();
    }
}
