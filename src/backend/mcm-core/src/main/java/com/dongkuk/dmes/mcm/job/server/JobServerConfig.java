package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/** MCM 앱 전용 빈(판정·호출·기록·관리) — {@code dmes.job.server.enabled=true} 일 때만. 스테레오타입 없이 {@code @Bean} 으로 올린다. */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.server", name = "enabled", havingValue = "true")
public class JobServerConfig {

    /** BPMN {@code job^^dispatch} 의 {@code camunda:class="jobDispatchService"}. */
    @Bean
    public JobDispatchService jobDispatchService(ObjectProvider<DataSource> dataSource, JobProperties props) {
        return new JobDispatchService(dataSource.getObject(), props.getSchema());
    }

    @Bean
    public JobDispatchTrigger jobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext ctx, JobCallSink sink, JobProperties props) {
        return new JobDispatchTrigger(serviceStarter, ctx, sink, props.getServer().getBatchSize(), props.getCollect().isEnabled());
    }
}
