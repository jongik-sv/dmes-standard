package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.oasis.service.ServiceStarter;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

class JobAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(JobAutoConfiguration.class))
            .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class))
            .withBean(DataSource.class, () -> new DriverManagerDataSource("jdbc:oracle:thin:@//localhost:1/none", "u", "p"));

    @Test
    @DisplayName("기본 — 결과 갱신기·실행 풀(기본 4)·진입점이 빈으로 올라온다")
    void defaults() {
        runner.run(ctx -> {
            assertThat(ctx).hasSingleBean(JobRunResultWriter.class).hasSingleBean(JobRunExecutor.class).hasSingleBean(JobRunDispatcher.class);
            assertThat(ctx.getBean(JobRunExecutor.class).poolSize()).isEqualTo(4);
            assertThat(ctx.getBean(JobRunDispatcher.class).serverName()).isNotBlank();
        });
    }

    @Test
    @DisplayName("dmes.job.agent.enabled=false 이면 만들지 않는다 / pool-size·server-name 은 설정을 따른다")
    void properties() {
        runner.withPropertyValues("dmes.job.agent.enabled=false").run(ctx -> assertThat(ctx).doesNotHaveBean(JobRunDispatcher.class));
        runner.withPropertyValues("dmes.job.pool-size=2", "dmes.job.server-name=node-a").run(ctx -> {
            assertThat(ctx.getBean(JobRunExecutor.class).poolSize()).isEqualTo(2);
            assertThat(ctx.getBean(JobRunDispatcher.class).serverName()).isEqualTo("node-a");
        });
    }

    @Test
    @DisplayName("ServiceStarter 가 없으면 만들지 않는다")
    void withoutServiceStarter() {
        new ApplicationContextRunner().withConfiguration(AutoConfigurations.of(JobAutoConfiguration.class))
                .run(ctx -> assertThat(ctx).doesNotHaveBean(JobRunDispatcher.class));
    }

    private static DataSource ds(String name) {
        return new DriverManagerDataSource("jdbc:oracle:thin:@//localhost:1/" + name, "u", "p");
    }

    private static ApplicationContextRunner withStarter() {
        return new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(JobAutoConfiguration.class))
                .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class));
    }

    @Test
    @DisplayName("DataSource 가 둘이고 primary·dataSource 이름·default-manager 매핑이 없으면 기동은 되고 진입점 빈만 없다")
    void twoDataSourcesWithoutPrimary() {
        withStarter().withBean("ds1", DataSource.class, () -> ds("ds1")).withBean("ds2", DataSource.class, () -> ds("ds2"))
                .run(ctx -> {
                    assertThat(ctx).hasNotFailed();
                    assertThat(ctx).doesNotHaveBean(JobRunResultWriter.class).doesNotHaveBean(JobRunDispatcher.class)
                            .doesNotHaveBean(JobRunExecutor.class);
                });
    }

    @Test
    @DisplayName("DataSource 가 없으면 기동은 되고 진입점 빈만 없다")
    void noDataSource() {
        withStarter().run(ctx -> {
            assertThat(ctx).hasNotFailed();
            assertThat(ctx).doesNotHaveBean(JobRunDispatcher.class).doesNotHaveBean(JobRunResultWriter.class);
        });
    }

    @Test
    @DisplayName("primary 가 하나면 그것을, primary 가 없으면 이름이 dataSource 인 빈을 쓴다")
    void primaryThenDefaultName() {
        withStarter().withBean("ds1", DataSource.class, () -> ds("ds1"))
                .withBean("ds2", DataSource.class, () -> ds("ds2"), bd -> bd.setPrimary(true))
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(JobRunDispatcher.class);
                    assertThat(JobDataSources.resolve(ctx, ctx.getEnvironment())).isSameAs(ctx.getBean("ds2"));
                });
        withStarter().withBean("other", DataSource.class, () -> ds("other")).withBean("dataSource", DataSource.class, () -> ds("dataSource"))
                .run(ctx -> {
                    assertThat(ctx).hasSingleBean(JobRunDispatcher.class);
                    assertThat(JobDataSources.resolve(ctx, ctx.getEnvironment())).isSameAs(ctx.getBean("dataSource"));
                });
    }

    @Test
    @DisplayName("멀티 트랜잭션 모드면 cactus.tx.default-manager 의 data-source 를 먼저 쓴다 — primary-alias 와 같으면 dataSource 빈, 아니면 그 이름의 빈")
    void defaultManagerDataSourceFirst() {
        ApplicationContextRunner two = withStarter()
                .withBean("dataSource", DataSource.class, () -> ds("dataSource"), bd -> bd.setPrimary(true))
                .withBean("biz", DataSource.class, () -> ds("biz"))
                .withPropertyValues("cactus.tx.managers.txBiz.data-source=biz", "cactus.tx.default-manager=txBiz");
        two.run(ctx -> assertThat(JobDataSources.resolve(ctx, ctx.getEnvironment())).isSameAs(ctx.getBean("biz")));
        two.withPropertyValues("cactus.datasource.primary-alias=biz")
                .run(ctx -> assertThat(JobDataSources.resolve(ctx, ctx.getEnvironment())).isSameAs(ctx.getBean("dataSource")));
    }

    @Test
    @DisplayName("AutoConfiguration.imports 에 등록돼 있다")
    void registeredInImports() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).contains("com.dongkuk.dmes.cactus.job.JobAutoConfiguration");
        }
    }
}
