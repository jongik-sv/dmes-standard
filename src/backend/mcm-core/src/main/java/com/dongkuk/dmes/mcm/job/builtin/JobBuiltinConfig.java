package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.builtin.collect.ExchangeCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectHosts;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.dmes.mcm.widget.ext.FrankfurterProvider;
import com.dongkuk.dmes.mcm.widget.ext.KoreaEximProvider;
import com.dongkuk.dmes.mcm.widget.ext.WidgetExtProperties;
import java.util.function.Supplier;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;

/**
 * 내장 서비스 빈(설계 §2 builtin) — 6개 앱이 모두 싣는다. BPMN {@code camunda:class} 의 이름({@code jobCodeService} 등)과 메서드 이름이 같다.
 * 환율 원천은 제공자 빈이 있는 앱(MCM)에서만 만들어진다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobBuiltinConfig {

    @Bean
    public JobCodeService jobCodeService(JobHandlerRegistry registry) {
        return new JobCodeService(registry);
    }

    @Bean
    public JobQueryService jobQueryService(ObjectProvider<DataSource> dataSource) {
        return new JobQueryService(dataSource.getObject());
    }

    @Bean
    public JobCollectSql jobCollectSql(ObjectProvider<DataSource> dataSource) {
        return new JobCollectSql(dataSource.getObject());
    }

    @Bean
    public SqlCollectSource sqlCollectSource(JobCollectSql sql) {
        return new SqlCollectSource(sql);
    }

    @Bean
    public HttpCollectSource httpCollectSource(JobProperties props, Environment env) {
        return new HttpCollectSource(JobCollectHosts.matcher(JobCollectHosts.resolve(props, env)));
    }

    @Bean
    public JobCollectService jobCollectService(SqlCollectSource sql, HttpCollectSource http, ObjectProvider<WidgetExtProperties> ext,
                                               ObjectProvider<FrankfurterProvider> frankfurter, ObjectProvider<KoreaEximProvider> koreaExim) {
        Supplier<ExchangeCollectSource> exchange = new Supplier<>() {
            private volatile ExchangeCollectSource cached;

            @Override
            public ExchangeCollectSource get() {
                ExchangeCollectSource c = cached;
                if (c == null) {
                    WidgetExtProperties p = ext.getIfAvailable();
                    FrankfurterProvider f = frankfurter.getIfAvailable();
                    KoreaEximProvider k = koreaExim.getIfAvailable();
                    if (p == null || f == null || k == null) return null;
                    c = cached = new ExchangeCollectSource(p, f, k);
                }
                return c;
            }
        };
        return new JobCollectService(sql, http, exchange);
    }
}
