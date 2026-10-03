package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.boot.autoconfigure.MybatisAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.context.annotation.Configurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import javax.sql.DataSource;
import java.util.List;

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

    /**
     * 결함 수정 — SqlSessionFactory 빈 조건을 보므로, 그 빈을 만드는 자동설정(cactus 다중 MyBatis·mybatis-spring-boot)
     * 보다 뒤에 처리되도록 순서를 선언한다. 이름순 정렬(com.* &lt; org.*)에 기대지 않는다.
     */
    @Test
    void SqlSessionFactory를_만드는_자동설정들보다_뒤에_정렬된다() {
        // 입력 순서를 뒤집어 넣어도 정렬 결과가 같아야 한다
        List<Class<?>> order = List.of(Configurations.getClasses(AutoConfigurations.of(
                CactusMybatisAutoConfiguration.class,
                CactusMultiMybatisAutoConfiguration.class,
                MybatisAutoConfiguration.class)));

        int self = order.indexOf(CactusMybatisAutoConfiguration.class);
        assertThat(self).isGreaterThan(order.indexOf(CactusMultiMybatisAutoConfiguration.class));
        assertThat(self).isGreaterThan(order.indexOf(MybatisAutoConfiguration.class));
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
