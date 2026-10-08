package com.dongkuk.dmes.mcm.job.builtin;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JobBuiltinConfigTest {

    @Configuration(proxyBeanMethods = false)
    @EnableConfigurationProperties(JobProperties.class)
    static class Props {
    }

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(Props.class, JobBuiltinConfig.class)
            .withBean(JobHandlerRegistry.class, () -> new JobHandlerRegistry(JobModule.MDM, List.of()));

    private static DataSource ds() {
        return new DriverManagerDataSource("jdbc:none:test");
    }

    @Test
    @DisplayName("DataSource 가 없거나 둘 이상이면서 primary·dataSource 빈이 없으면 기동은 성공하고 DB 를 쓰는 내장 서비스만 건너뛴다")
    void undecidableDataSourceSkipsDbBeansWithoutFailingStartup() {
        runner.withBean("firstDs", DataSource.class, JobBuiltinConfigTest::ds)
                .withBean("secondDs", DataSource.class, JobBuiltinConfigTest::ds)
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).hasSingleBean(JobCodeService.class);
                    assertThat(ctx).doesNotHaveBean(JobQueryService.class).doesNotHaveBean(JobCollectService.class);
                });
        runner.run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(JobQueryService.class).doesNotHaveBean(JobCollectService.class);
        });
    }

    @Test
    @DisplayName("DataSource 가 하나이거나 primary 가 하나이거나 이름이 dataSource 인 빈이 있으면 쿼리·수집 서비스를 만든다")
    void decidableDataSourceCreatesDbBeans() {
        runner.withBean("onlyDs", DataSource.class, JobBuiltinConfigTest::ds).run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(JobQueryService.class).hasSingleBean(JobCollectService.class));
        runner.withBean("dataSource", DataSource.class, JobBuiltinConfigTest::ds).withBean("otherDs", DataSource.class, JobBuiltinConfigTest::ds)
                .run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(JobQueryService.class).hasSingleBean(JobCollectService.class));
        runner.withBean("mainDs", DataSource.class, JobBuiltinConfigTest::ds, bd -> bd.setPrimary(true)).withBean("otherDs", DataSource.class, JobBuiltinConfigTest::ds)
                .run(ctx -> assertThat(ctx).hasNotFailed().hasSingleBean(JobQueryService.class).hasSingleBean(JobCollectService.class));
    }
}
