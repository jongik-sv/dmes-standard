package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusMybatisAutoConfiguration} 특성 테스트 — OASIS 용 {@link DefaultDataSourceResolver} 등록 조건.
 */
class CactusMybatisAutoConfigurationTest {

    private final DataSource ds = mock(DataSource.class);

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusMybatisAutoConfiguration.class));

    @Test
    void SqlSessionFactory와_DataSource가_있으면_resolver가_그_DataSource를_돌려준다() {
        runner.withBean(SqlSessionFactory.class, () -> mock(SqlSessionFactory.class))
                .withBean("dataSource", DataSource.class, () -> ds)
                .run(ctx -> {
                    assertThat(ctx).hasBean("cactusDefaultDataSourceResolver");
                    assertThat(ctx.getBean(DefaultDataSourceResolver.class).defaultDataSource()).isSameAs(ds);
                    assertThat(ctx).hasSingleBean(CactusMybatisProperties.class);
                });
    }

    @Test
    void SqlSessionFactory_빈이_없으면_자동설정_전체가_꺼진다() {
        runner.withBean("dataSource", DataSource.class, () -> ds)
                .run(ctx -> {
                    assertThat(ctx).doesNotHaveBean(DefaultDataSourceResolver.class);
                    assertThat(ctx).doesNotHaveBean(CactusMybatisProperties.class);
                });
    }

    @Test
    void DataSource_빈이_없으면_resolver를_만들지_않는다() {
        runner.withBean(SqlSessionFactory.class, () -> mock(SqlSessionFactory.class))
                .run(ctx -> assertThat(ctx).doesNotHaveBean(DefaultDataSourceResolver.class));
    }

    @Test
    void 소비_모듈이_resolver를_두면_그것을_쓴다() {
        DefaultDataSourceResolver own = () -> null;
        runner.withBean(SqlSessionFactory.class, () -> mock(SqlSessionFactory.class))
                .withBean("dataSource", DataSource.class, () -> ds)
                .withBean("ownResolver", DefaultDataSourceResolver.class, () -> own)
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(DefaultDataSourceResolver.class);
                    assertThat(ctx.getBean(DefaultDataSourceResolver.class)).isSameAs(own);
                });
    }

    @Test
    void 프로퍼티_기본값() {
        CactusMybatisProperties p = new CactusMybatisProperties();

        assertThat(p.isEnabled()).isTrue();
        assertThat(p.getMapperLocations()).isEqualTo("classpath*:persistence/**/*.xml");
        assertThat(p.getConfigLocation()).isEqualTo("classpath:cactus-mybatis-config.xml");
        assertThat(p.getMasterCodeDecoding().isEnabled()).isTrue();
    }
}
