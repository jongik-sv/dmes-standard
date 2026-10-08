package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobAppInfo;
import com.dongkuk.dmes.mcm.job.agent.LocalJobRunGateway;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.agent.SimpleScheduledJob;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** MCM 앱 전용 빈(판정·호출·기록·관리) — {@code dmes.job.server.enabled=true} 일 때만. 스테레오타입 없이 {@code @Bean} 으로 올린다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.server", name = "enabled", havingValue = "true")
public class JobServerConfig {

    /** BPMN {@code jobDispatch} 의 {@code camunda:class="jobDispatchService"}. */
    @Bean
    public JobDispatchService jobDispatchService(ObjectProvider<DataSource> dataSource, JobProperties props) {
        return new JobDispatchService(dataSource.getObject(), props.getSchema());
    }

    @Bean
    public JobDispatchTrigger jobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext ctx, JobCallSink sink, JobProperties props) {
        return new JobDispatchTrigger(serviceStarter, ctx, sink, props.getServer().getBatchSize(), props.getCollect().isEnabled());
    }

    @Bean
    public JobRunStore jobRunStore(ObjectProvider<DataSource> dataSource, JobProperties props) {
        return new JobRunStore(dataSource.getObject(), props.getSchema());
    }

    /** MCM → 모듈 호출 풀(스레드 8, 대기열 200, 연결 2초·읽기 5초). 키는 ClientKeyFilter 와 같은 우선순위(환경 변수 BACKEND_CLIENT_KEY > cactus.security.client-key). */
    @Bean(destroyMethod = "close")
    public JobCaller jobCaller(JobProperties props, JobAppInfo app, LocalJobRunGateway local, JobRunStore store,
                               @Value("${cactus.security.client-key:}") String configuredKey) {
        Map<String, String> urls = new LinkedHashMap<>();
        props.getModules().forEach((module, target) -> urls.put(module.toLowerCase(Locale.ROOT), target.getBaseUrl()));
        String env = System.getenv("BACKEND_CLIENT_KEY");
        String key = env != null && !env.isBlank() ? env : configuredKey;
        return new JobCaller(urls, app.module(), local, store, key, 8, 200, Duration.ofSeconds(2), Duration.ofSeconds(5));
    }

    /** 정리: 멈춘 RUN → TIMEOUT. 5분마다. */
    @Bean
    public ScheduledJob mcmJobRunSweep(JobRunStore store) {
        return new SimpleScheduledJob("mcm.jobRunSweep", JobModule.MCM, "멈춘 실행 정리", "*/5 * * * *", Duration.ofMinutes(5), ctx -> store.sweep());
    }

    /** 실행 기록 90일 보관 삭제(D7). */
    @Bean
    public ScheduledJob mcmJobRunPurge(JobRunStore store) {
        return new SimpleScheduledJob("mcm.jobRunPurge", JobModule.MCM, "실행 기록 보관 삭제", "40 3 * * *", Duration.ofMinutes(30),
                ctx -> store.purgeRunsBefore(90, 5000));
    }

    /** 수집 값 90일 보관 삭제. {@code dmes.job.collect.enabled=false} 면 아무것도 하지 않는다. */
    @Bean
    public ScheduledJob mcmCollectPurge(JobRunStore store, JobProperties props) {
        return new SimpleScheduledJob("mcm.collectPurge", JobModule.MCM, "수집 값 보관 삭제", "30 3 * * *", Duration.ofMinutes(30), ctx -> {
            if (!props.getCollect().isEnabled()) return 0;
            String cutoff = DateTimeFormatter.ofPattern("yyyyMMddHHmm").format(LocalDate.now(ZoneId.of("Asia/Seoul")).minusDays(90).atStartOfDay());
            return store.purgeCollectBefore(cutoff, 5000);
        });
    }
}
