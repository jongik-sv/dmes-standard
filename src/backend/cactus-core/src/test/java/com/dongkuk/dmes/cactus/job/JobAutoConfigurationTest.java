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

    @Test
    @DisplayName("AutoConfiguration.imports 에 등록돼 있다")
    void registeredInImports() throws Exception {
        try (InputStream in = getClass().getResourceAsStream("/META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports")) {
            assertThat(new String(in.readAllBytes(), StandardCharsets.UTF_8)).contains("com.dongkuk.dmes.cactus.job.JobAutoConfiguration");
        }
    }
}
