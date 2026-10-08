package com.dongkuk.dmes.mcm.job;

import com.zaxxer.hikari.HikariDataSource;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;

/**
 * 예약 작업 전용 연결 고르기 — {@code dmes.job.datasource.*}.
 * <ol>
 *   <li>{@code jndi-name} 이 있으면 컨테이너 풀을 찾아 쓴다.</li>
 *   <li>없고 {@code url} 이 있으면 직결 풀(Hikari, 풀 이름 {@code job-ds}, 기본 최대 2)을 만든다 — 처음 쓸 때 연결한다.</li>
 *   <li>둘 다 없으면 앱 기본 DataSource.</li>
 * </ol>
 * 전용 설정이 일부만 있으면(url 없이 계정만) 기본 DataSource 로 물러나지 않고 기동을 막는다. 주소·계정·비밀번호는 로그에 남기지 않는다.
 * {@code dmes.job.enabled=false} 이면 빈을 만들지 않는다. DataSource 형 빈은 만들지 않는다({@link JobDataSource} 참조).
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(JobProperties.class)
public class JobConfig {

    private static final Logger log = LoggerFactory.getLogger(JobConfig.class);

    static final String POOL_NAME = "job-ds";

    @Bean
    @ConditionalOnProperty(prefix = "dmes.job", name = "enabled", havingValue = "true", matchIfMissing = true)
    JobDataSource jobDataSource(JobProperties props, ObjectProvider<DataSource> appDataSource) {
        return create(props, appDataSource::getObject);
    }

    /** 고르기 — 시험이 앱 DataSource 를 직접 넘긴다. */
    static JobDataSource create(JobProperties props, Supplier<DataSource> appDataSource) {
        JobProperties.Datasource d = props.getDatasource();
        if (hasText(d.getJndiName())) {
            log.info("[job] 예약 작업 전용 DataSource 를 씁니다(JNDI)");
            return JobDataSource.jndi(new JndiDataSourceLookup().getDataSource(d.getJndiName().trim()));
        }
        if (hasText(d.getUrl())) {
            HikariDataSource h = new HikariDataSource();
            h.setPoolName(POOL_NAME);
            h.setJdbcUrl(d.getUrl().trim());
            if (hasText(d.getUsername())) h.setUsername(d.getUsername().trim());
            if (d.getPassword() != null && !d.getPassword().isEmpty()) h.setPassword(d.getPassword());
            h.setMaximumPoolSize(d.getMaximumPoolSize() > 0 ? d.getMaximumPoolSize() : 2);
            h.setMinimumIdle(0); // 쓰지 않을 때 연결을 잡아 두지 않는다
            h.setIdleTimeout(10_000);
            log.info("[job] 예약 작업 전용 DataSource 를 씁니다(직결, 풀 {} 최대 {}개)", POOL_NAME, h.getMaximumPoolSize());
            return JobDataSource.dedicated(h);
        }
        if (hasText(d.getUsername()) || hasText(d.getPassword())) {
            throw new IllegalStateException("dmes.job.datasource 에 계정만 있고 url(또는 jndi-name)이 없습니다"
                    + " — 앱 기본 DataSource 로 물러나지 않습니다");
        }
        log.info("[job] 예약 작업이 앱 기본 DataSource 를 씁니다 — 전용 연결은 dmes.job.datasource.* 로 붙입니다");
        return JobDataSource.shared(appDataSource.get());
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
