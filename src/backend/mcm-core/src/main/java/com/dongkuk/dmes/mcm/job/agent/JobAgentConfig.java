package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.ApplicationListener;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * 모든 모듈 앱의 예약 작업 접수 쪽 빈(설계 §2 「각 모듈 앱」). mdm·mls·mpp·mqc·mpn 은 mcm-core 를 스캔하지 않고 {@code McmCoreAutoConfiguration}
 * 이 {@code @Import} 하는 것만 얻으므로 스테레오타입 없이 {@code @Bean} 으로 선언한다. {@code dmes.job.agent.enabled=false} 면 만들지 않아
 * {@code /internal/job/run} 은 404 이다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobAgentConfig {

    @Bean
    public JobAppInfo jobAppInfo(JobProperties props, Environment env) {
        return new JobAppInfo(JobModule.resolve(props, env));
    }

    @Bean
    public JobHandlerRegistry jobHandlerRegistry(JobAppInfo app, ObjectProvider<ScheduledJob> jobs) {
        return new JobHandlerRegistry(app.module(), jobs.orderedStream().toList());
    }

    @Bean
    public JobRunAcceptor jobRunAcceptor(JobAppInfo app, JobRunDispatcher dispatcher, JobHandlerRegistry handlers) {
        return new JobRunAcceptor(app.module(), dispatcher, handlers);
    }

    @Bean
    public JobRunController jobRunController(JobRunAcceptor acceptor) {
        return new JobRunController(acceptor);
    }

    @Bean
    public LocalJobRunGateway localJobRunGateway(JobRunAcceptor acceptor) {
        return new LocalJobRunGateway(acceptor);
    }

    @Bean
    public JobHandlerRegistrar jobHandlerRegistrar(ObjectProvider<DataSource> dataSource, JobProperties props, JobHandlerRegistry registry) {
        return new JobHandlerRegistrar(dataSource.getObject(), props.getSchema(), registry, Duration.ofMinutes(1));
    }

    /** 앱이 다 뜬 뒤 코드 작업 처리기를 등록한다 — 실패해도 기동은 실패하지 않는다. */
    @Bean
    public ApplicationListener<ApplicationReadyEvent> jobHandlerRegistration(JobHandlerRegistrar registrar) {
        return event -> registrar.registerWithRetry();
    }
}
