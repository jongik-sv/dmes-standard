package com.dongkuk.dmes.cactus.mybatis;

import com.dongkuk.dmes.cactus.audit.CactusMybatisAuditInterceptor;
import com.dongkuk.dmes.cactus.audit.SqlLoggingInterceptor;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeDecoder;
import com.dongkuk.dmes.cactus.mastercode.MasterCodeMybatisInterceptor;
import com.dongkuk.dmes.cactus.oasis.task.CactusMultiMyBatisSqlRunner;
import com.dongkuk.oasis.executors.SqlRunner;
import com.dongkuk.oasis.jdbc.DefaultDataSourceResolver;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.session.Configuration;
import org.apache.ibatis.session.SqlSessionFactory;
import org.junit.jupiter.api.Test;
import org.mybatis.spring.SqlSessionTemplate;
import org.mybatis.spring.transaction.SpringManagedTransactionFactory;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.core.NestedExceptionUtils;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;

import javax.sql.DataSource;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

/**
 * {@link CactusMultiMybatisAutoConfiguration} 특성 테스트 — biz/if/cmn SqlSessionFactory·Template 등록 조건,
 * 인터셉터 순서, 다중 DS SqlRunner 등록.
 *
 * <p>SqlSessionFactory 생성은 DB 에 접속하지 않으므로 DataSource 는 mock 으로 둔다. 다중 DataSource 자동설정은
 * Hikari 풀을 띄우므로 넣지 않고, {@code cactusDataSourceIf}/{@code cactusDataSourceCmn} 도 mock 빈으로 준다.
 */
class CactusMultiMybatisAutoConfigurationTest {

    private final DataSource bizDs = mock(DataSource.class);
    private final DataSource ifDs = mock(DataSource.class);
    private final DataSource cmnDs = mock(DataSource.class);

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(CactusMultiMybatisAutoConfiguration.class));

    private static List<Class<?>> interceptorTypes(SqlSessionFactory sf) {
        return sf.getConfiguration().getInterceptors().stream()
                .map(Interceptor::getClass)
                .<Class<?>>map(c -> c)
                .toList();
    }

    @Test
    void dataSource가_있으면_biz_팩토리와_템플릿과_SqlRunner를_등록한다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs).run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).hasBean("sqlSessionFactoryBiz");
            assertThat(ctx).hasBean("sqlSessionTemplateBiz");
            assertThat(ctx).doesNotHaveBean("sqlSessionFactoryIf");
            assertThat(ctx).doesNotHaveBean("sqlSessionFactoryCmn");
            assertThat(ctx.getBean(SqlRunner.class)).isInstanceOf(CactusMultiMyBatisSqlRunner.class);
            assertThat(ctx).hasBean("cactusMultiMyBatisSqlRunner");

            SqlSessionFactory biz = ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class);
            assertThat(biz.getConfiguration().getEnvironment().getDataSource()).isSameAs(bizDs);
            assertThat(biz.getConfiguration().getEnvironment().getTransactionFactory())
                    .isInstanceOf(SpringManagedTransactionFactory.class);
            assertThat(ctx.getBean("sqlSessionTemplateBiz", SqlSessionTemplate.class).getSqlSessionFactory())
                    .isSameAs(biz);
            assertThat(ctx.getBeanFactory().getBeanDefinition("sqlSessionFactoryBiz").isPrimary()).isTrue();
            assertThat(ctx.getBeanFactory().getBeanDefinition("sqlSessionTemplateBiz").isPrimary()).isTrue();
        });
    }

    @Test
    void 기본_config_location의_cactus_mybatis_설정을_읽는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs).run(ctx -> {
            Configuration c = ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class).getConfiguration();
            assertThat(c.isCallSettersOnNulls()).isTrue();
            assertThat(c.isMapUnderscoreToCamelCase()).isTrue();
            assertThat(c.isCacheEnabled()).isFalse();
            assertThat(c.getLocalCacheScope().name()).isEqualTo("STATEMENT");
            assertThat(c.getJdbcTypeForNull().name()).isEqualTo("NULL");
        });
    }

    @Test
    void 기본_mapper_locations는_classpath의_persistence_아래_XML을_모두_읽는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs).run(ctx -> {
            Configuration c = ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class).getConfiguration();
            // cactus-core main 의 persistence/dmom/DmomMapper.xml
            assertThat(c.hasStatement("DmomMapper.getFormatLayout")).isTrue();
        });
    }

    @Test
    void 디코더가_없으면_로깅과_감사_인터셉터_2개만_붙는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs).run(ctx ->
                assertThat(interceptorTypes(ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class)))
                        .containsExactly(SqlLoggingInterceptor.class, CactusMybatisAuditInterceptor.class));
    }

    @Test
    void 디코더가_있으면_마스터코드_인터셉터가_마지막에_붙는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean(MasterCodeDecoder.class, () -> mock(MasterCodeDecoder.class))
                .run(ctx -> assertThat(interceptorTypes(ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class)))
                        .containsExactly(SqlLoggingInterceptor.class, CactusMybatisAuditInterceptor.class,
                                MasterCodeMybatisInterceptor.class));
    }

    @Test
    void 디코딩을_끄면_디코더가_있어도_마스터코드_인터셉터를_붙이지_않는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean(MasterCodeDecoder.class, () -> mock(MasterCodeDecoder.class))
                .withPropertyValues("cactus.mybatis.master-code-decoding.enabled=false")
                .run(ctx -> assertThat(interceptorTypes(ctx.getBean("sqlSessionFactoryBiz", SqlSessionFactory.class)))
                        .containsExactly(SqlLoggingInterceptor.class, CactusMybatisAuditInterceptor.class));
    }

    @Test
    void extras_if_url이_있으면_if_팩토리와_템플릿을_cactusDataSourceIf로_만든다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean("cactusDataSourceIf", DataSource.class, () -> ifDs)
                .withBean(MasterCodeDecoder.class, () -> mock(MasterCodeDecoder.class))
                .withPropertyValues("cactus.datasource.extras.if.url=jdbc:test:if")
                .run(ctx -> {
                    SqlSessionFactory sf = ctx.getBean("sqlSessionFactoryIf", SqlSessionFactory.class);
                    assertThat(sf.getConfiguration().getEnvironment().getDataSource()).isSameAs(ifDs);
                    assertThat(ctx.getBean("sqlSessionTemplateIf", SqlSessionTemplate.class).getSqlSessionFactory())
                            .isSameAs(sf);
                    // if/cmn 도 같은 인터셉터 3종
                    assertThat(interceptorTypes(sf)).containsExactly(SqlLoggingInterceptor.class,
                            CactusMybatisAuditInterceptor.class, MasterCodeMybatisInterceptor.class);
                    assertThat(ctx.getBeanFactory().getBeanDefinition("sqlSessionFactoryIf").isPrimary()).isFalse();
                    assertThat(ctx).doesNotHaveBean("sqlSessionFactoryCmn");
                });
    }

    @Test
    void extras_cmn은_jndi_name만_있어도_cmn_팩토리를_만든다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean("cactusDataSourceCmn", DataSource.class, () -> cmnDs)
                .withPropertyValues("cactus.datasource.extras.cmn.jndi-name=java:/jdbc/cmn")
                .run(ctx -> {
                    SqlSessionFactory sf = ctx.getBean("sqlSessionFactoryCmn", SqlSessionFactory.class);
                    assertThat(sf.getConfiguration().getEnvironment().getDataSource()).isSameAs(cmnDs);
                    assertThat(ctx).hasBean("sqlSessionTemplateCmn");
                    assertThat(ctx).doesNotHaveBean("sqlSessionFactoryIf");
                });
    }

    @Test
    void extras_if_url만_있고_cactusDataSourceIf_빈이_없으면_부팅이_실패한다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withPropertyValues("cactus.datasource.extras.if.url=jdbc:test:if")
                .run(ctx -> {
                    assertThat(ctx).hasFailed();
                    assertThat(NestedExceptionUtils.getMostSpecificCause(ctx.getStartupFailure()))
                            .isInstanceOf(NoSuchBeanDefinitionException.class)
                            .hasMessageContaining("cactusDataSourceIf");
                });
    }

    @Test
    void extras_다른_key는_SqlSessionFactory를_만들지_않는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean("cactusDataSourceErp", DataSource.class, () -> mock(DataSource.class))
                .withPropertyValues("cactus.datasource.extras.erp.url=jdbc:test:erp")
                .run(ctx -> assertThat(ctx.getBeansOfType(SqlSessionFactory.class)).containsOnlyKeys("sqlSessionFactoryBiz"));
    }

    @Test
    void dataSource가_없으면_biz와_SqlRunner를_만들지_않는다() {
        runner.withBean("cactusDataSourceIf", DataSource.class, () -> ifDs)
                .withPropertyValues("cactus.datasource.extras.if.url=jdbc:test:if")
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean("sqlSessionFactoryBiz");
                    assertThat(ctx).doesNotHaveBean("sqlSessionTemplateBiz");
                    assertThat(ctx).doesNotHaveBean(SqlRunner.class);
                    assertThat(ctx).hasBean("sqlSessionFactoryIf");
                    assertThat(ctx).hasBean("sqlSessionTemplateIf");
                });
    }

    @Test
    void SqlRunner가_이미_있으면_다중_DS_SqlRunner를_만들지_않는다() {
        SqlRunner existing = mock(SqlRunner.class);
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withBean("hostSqlRunner", SqlRunner.class, () -> existing)
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(SqlRunner.class);
                    assertThat(ctx.getBean(SqlRunner.class)).isSameAs(existing);
                });
    }

    @Test
    void enabled_false면_아무것도_등록하지_않는다() {
        runner.withBean("dataSource", DataSource.class, () -> bizDs)
                .withPropertyValues("cactus.mybatis.enabled=false")
                .run(ctx -> {
                    assertThat(ctx).doesNotHaveBean(SqlSessionFactory.class);
                    assertThat(ctx).doesNotHaveBean(SqlRunner.class);
                    assertThat(ctx).doesNotHaveBean(CactusMybatisProperties.class);
                });
    }

    @Test
    void 단일_MyBatis_자동설정과_같이_올리면_DefaultDataSourceResolver가_dataSource를_돌려준다() {
        // CactusMybatisAutoConfiguration 은 SqlSessionFactory 빈 조건을 보므로 after = CactusMultiMybatisAutoConfiguration
        // 으로 순서를 선언한다 (이름순 정렬에 기대지 않는다).
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(
                        CactusMybatisAutoConfiguration.class, CactusMultiMybatisAutoConfiguration.class))
                .withBean("dataSource", DataSource.class, () -> bizDs)
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(DefaultDataSourceResolver.class);
                    assertThat(ctx.getBean(DefaultDataSourceResolver.class).defaultDataSource()).isSameAs(bizDs);
                });
    }
}
