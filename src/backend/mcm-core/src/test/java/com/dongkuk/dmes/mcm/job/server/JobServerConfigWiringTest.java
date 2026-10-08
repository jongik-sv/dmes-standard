package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobConfig;
import com.dongkuk.oasis.service.ServiceStarter;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** 서버 쪽 빈은 dmes.job.server.enabled=true 일 때만 — 앱 한 대(MCM)만 판정·호출을 한다. 연결은 맺지 않는다(더미 주소). */
class JobServerConfigWiringTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(JobConfig.class)
            .withBean(DataSource.class, () -> new DriverManagerDataSource("jdbc:oracle:thin:@//localhost:1/none", "u", "p"))
            .withBean(ServiceStarter.class, () -> mock(ServiceStarter.class))
            .withBean(JobRunDispatcher.class, () -> mock(JobRunDispatcher.class))
            .withPropertyValues("spring.application.name=mcm");

    @Test
    @DisplayName("server.enabled 기본(false) — 판정·호출 빈이 없다(모듈 앱은 접수 쪽만)")
    void disabledByDefault() {
        runner.run(ctx -> {
            assertThat(ctx).doesNotHaveBean(JobDispatchService.class).doesNotHaveBean(JobCaller.class).doesNotHaveBean(JobDispatchTrigger.class);
            assertThat(ctx).hasBean("jobRunController").hasBean("jobCodeService").hasBean("jobQueryService").hasBean("jobCollectService");
        });
    }

    @Test
    @DisplayName("server.enabled=true — 판정 서비스·트리거·호출 풀·저장소·정리 코드 작업이 올라온다. BPMN 이 쓰는 빈 이름은 jobDispatchService")
    void enabled() {
        runner.withPropertyValues("dmes.job.server.enabled=true", "dmes.job.modules.mdm.base-url=http://localhost:8096").run(ctx -> {
            assertThat(ctx).hasBean("jobDispatchService").hasSingleBean(JobDispatchTrigger.class).hasSingleBean(JobCaller.class).hasSingleBean(JobRunStore.class);
            assertThat(ctx).hasBean("mcmJobRunSweep").hasBean("mcmJobRunPurge").hasBean("mcmCollectPurge");
            assertThat(ctx.getBean(JobCallSink.class)).isSameAs(ctx.getBean(JobCaller.class));
        });
    }
}
