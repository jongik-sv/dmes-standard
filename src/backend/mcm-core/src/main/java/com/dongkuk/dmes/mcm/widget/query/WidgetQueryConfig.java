package com.dongkuk.dmes.mcm.widget.query;

import com.zaxxer.hikari.HikariDataSource;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.datasource.lookup.JndiDataSourceLookup;

/**
 * 쿼리 위젯 실행기 DataSource 고르기(스펙 2026-10-02-widget-admin-generic §7.3) — {@code dmes.widget.query.datasource.*}.
 * <ol>
 *   <li>{@code jndi-name} 이 있으면 컨테이너 풀(WildFly)을 찾아 쓴다.</li>
 *   <li>없고 {@code url} 이 있으면 직결 풀(Hikari, 풀 이름 {@code widget-query})을 만든다 — 처음 실행 때 연결한다.</li>
 *   <li>둘 다 없으면 앱 기본 DataSource({@code @Primary}).</li>
 * </ol>
 * 전용 설정이 있는데 쓸 수 없으면(JNDI 이름 없음·url 없이 계정만 있음) 기본 DataSource 로 물러나지 않고 기동을 막는다 — 읽기 계정을
 * 의도한 설정이 조용히 쓰기 계정으로 바뀌지 않게. 주소·계정·비밀번호는 로그에 남기지 않는다(주소에도 비밀번호가 들어갈 수 있다).
 * 이름이 {@code *AutoConfiguration} 이면 mcm 런처 스캔에서 빠지므로 쓰지 않는다.
 */
@Configuration(proxyBeanMethods = false)
@EnableConfigurationProperties(WidgetQueryProperties.class)
public class WidgetQueryConfig {

    private static final Logger log = LoggerFactory.getLogger(WidgetQueryConfig.class);

    static final String POOL_NAME = "widget-query";
    static final int DEFAULT_POOL_SIZE = 5;

    @Bean
    public WidgetQueryDataSource widgetQueryDataSource(WidgetQueryProperties properties,
                                                       ObjectProvider<DataSource> defaultDataSource) {
        return create(properties, defaultDataSource::getObject);
    }

    /** 고르기 — 시험이 기본 DataSource 를 직접 넘긴다. */
    static WidgetQueryDataSource create(WidgetQueryProperties properties, java.util.function.Supplier<DataSource> defaultDataSource) {
        WidgetQueryProperties.Datasource d = properties.getDatasource();
        if (hasText(d.getJndiName())) {
            DataSource ds = new JndiDataSourceLookup().getDataSource(d.getJndiName().trim());
            log.info("[widgetQuery] 쿼리 위젯 실행기 전용 DataSource 를 씁니다(JNDI)");
            return WidgetQueryDataSource.dedicated(ds, null);
        }
        if (hasText(d.getUrl())) {
            HikariDataSource ds = new HikariDataSource();
            ds.setPoolName(POOL_NAME);
            ds.setJdbcUrl(d.getUrl().trim());
            if (hasText(d.getDriverClassName())) ds.setDriverClassName(d.getDriverClassName().trim());
            if (hasText(d.getUsername())) ds.setUsername(d.getUsername().trim());
            if (d.getPassword() != null && !d.getPassword().isEmpty()) ds.setPassword(d.getPassword());
            ds.setMaximumPoolSize(d.getMaximumPoolSize() > 0 ? d.getMaximumPoolSize() : DEFAULT_POOL_SIZE);
            ds.setMinimumIdle(0); // 쓰지 않을 때 연결을 잡아 두지 않는다
            ds.setIdleTimeout(d.getIdleTimeout() > 0 ? d.getIdleTimeout() : WidgetQueryProperties.Datasource.DEFAULT_IDLE_TIMEOUT_MS);
            log.info("[widgetQuery] 쿼리 위젯 실행기 전용 DataSource 를 씁니다(직결, 풀 {} 최대 {}개)", POOL_NAME, ds.getMaximumPoolSize());
            return WidgetQueryDataSource.dedicated(ds, ds);
        }
        if (hasText(d.getUsername()) || hasText(d.getPassword()) || hasText(d.getDriverClassName())) {
            throw new IllegalStateException("dmes.widget.query.datasource 에 계정·드라이버만 있고 url(또는 jndi-name)이 없습니다"
                    + " — 기본 DataSource 로 물러나지 않습니다");
        }
        if (properties.isRequireDedicated()) {
            log.warn("[widgetQuery] dmes.widget.query.require-dedicated=true 인데 전용 DataSource(dmes.widget.query.datasource.*)가 없습니다"
                    + " — 쿼리 위젯 시험·저장·실행을 모두 거절합니다");
        } else {
            log.info("[widgetQuery] 쿼리 위젯 실행기가 앱 기본 DataSource 를 씁니다 — 운영에서는 읽기 계정 전용 DataSource"
                    + "(dmes.widget.query.datasource.*)를 붙이고 require-dedicated 를 켜세요");
        }
        return WidgetQueryDataSource.shared(defaultDataSource.get(), properties.isRequireDedicated());
    }

    private static boolean hasText(String s) {
        return s != null && !s.isBlank();
    }
}
