package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.time.Duration;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.core.env.Environment;

/**
 * 예약 실행 진입점 빈(설계 §2). {@code dmes.job.agent.enabled=false} 면 만들지 않는다. 결과 갱신은 그 앱의 기본 DataSource 로 하고
 * 스키마 접두는 {@code dmes.job.schema}(기본 MCMAPUSER)이다. MCM 앱 자신도 같은 빈을 쓴다.
 */
@AutoConfiguration(after = OasisAutoConfiguration.class)
@ConditionalOnBean(ServiceStarter.class)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public JobRunResultWriter jobRunResultWriter(ObjectProvider<DataSource> dataSource,
                                                 @Value("${dmes.job.schema:MCMAPUSER}") String schema) {
        return new JobRunResultWriter(dataSource.getObject(), schema, Duration.ofSeconds(5));
    }

    @Bean(destroyMethod = "close")
    @ConditionalOnMissingBean
    public JobRunExecutor jobRunExecutor(@Value("${dmes.job.pool-size:4}") int poolSize) {
        return new JobRunExecutor(poolSize);
    }

    @Bean
    @ConditionalOnMissingBean
    public JobRunDispatcher jobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext ctx, JobRunResultWriter writer,
                                             JobRunExecutor executor, Environment env) {
        String name = JobServerName.resolve(env.getProperty("dmes.job.server-name"), env.getProperty("spring.application.name"));
        return new JobRunDispatcher(serviceStarter, ctx, writer, executor, name, Clock.systemDefaultZone());
    }
}
