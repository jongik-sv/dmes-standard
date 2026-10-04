package com.dongkuk.dmes.cactus.datasource;

import com.zaxxer.hikari.HikariDataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusSecondaryDataSourceAutoConfiguration} (deprecated secondary) 특성 테스트 — 등록 조건과 기본 풀 설정.
 *
 * <p>인자 없는 {@link HikariDataSource} 는 첫 접속 전까지 풀을 띄우지 않으므로 인스턴스까지 만들어 본다.
 */
class CactusSecondaryDataSourceAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusSecondaryDataSourceAutoConfiguration.class));

    @Test
    void secondary_url과_host_DataSource가_있으면_cactusSecondaryDataSource를_기본값으로_등록한다() {
        runner.withBean("dataSource", DataSource.class, () -> mock(DataSource.class))
                .withPropertyValues("cactus.datasource.secondary.url=jdbc:test:secondary")
                .run(ctx -> {
                    assertThat(ctx).hasBean("cactusSecondaryDataSource");
                    HikariDataSource ds = ctx.getBean("cactusSecondaryDataSource", HikariDataSource.class);
                    assertThat(ds.getJdbcUrl()).isEqualTo("jdbc:test:secondary");
                    assertThat(ds.getMaximumPoolSize()).isEqualTo(10);
                    assertThat(ds.isAutoCommit()).isFalse();
                    assertThat(ds.getPoolName()).isEqualTo("cactus-secondary");
                    assertThat(ds.getUsername()).isNull();
                    assertThat(ctx.getBeanFactory().getBeanDefinition("cactusSecondaryDataSource").isPrimary())
                            .isFalse();
                });
    }

    @Test
    void secondary_속성을_그대로_풀에_옮긴다() {
        runner.withBean("dataSource", DataSource.class, () -> mock(DataSource.class))
                .withPropertyValues(
                        "cactus.datasource.secondary.url=jdbc:test:secondary",
                        "cactus.datasource.secondary.username=u1",
                        "cactus.datasource.secondary.password=p1",
                        "cactus.datasource.secondary.maximum-pool-size=3",
                        "cactus.datasource.secondary.auto-commit=true",
                        "cactus.datasource.secondary.pool-name=legacy")
                .run(ctx -> {
                    HikariDataSource ds = ctx.getBean("cactusSecondaryDataSource", HikariDataSource.class);
                    assertThat(ds.getUsername()).isEqualTo("u1");
                    assertThat(ds.getPassword()).isEqualTo("p1");
                    assertThat(ds.getMaximumPoolSize()).isEqualTo(3);
                    assertThat(ds.isAutoCommit()).isTrue();
                    assertThat(ds.getPoolName()).isEqualTo("legacy");
                });
    }

    @Test
    void secondary_url이_없으면_등록하지_않는다() {
        runner.withBean("dataSource", DataSource.class, () -> mock(DataSource.class))
                .run(ctx -> assertThat(ctx).doesNotHaveBean("cactusSecondaryDataSource"));
    }

    @Test
    void host_DataSource_빈이_없으면_등록하지_않는다() {
        runner.withPropertyValues("cactus.datasource.secondary.url=jdbc:test:secondary")
                .run(ctx -> assertThat(ctx).doesNotHaveBean("cactusSecondaryDataSource"));
    }
}
