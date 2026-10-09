package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectHosts;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Condition;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.Conditional;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;
import org.springframework.core.type.MethodMetadata;

/**
 * 내장 서비스 빈(설계 §2 builtin) — 6개 앱이 모두 싣는다. BPMN {@code camunda:class} 의 이름({@code jobCodeService} 등)과 메서드 이름이 같다.
 * DB 를 쓰는 빈(쿼리·수집 서비스)은 DataSource 를 정할 수 있을 때만 만든다 — 하나뿐이거나 primary 가 하나이거나 이름이 {@code dataSource} 인 빈이 있을 때
 * ({@code cactus-core JobAutoConfiguration} 과 같은 원칙). 정할 수 없으면 기동 실패 대신 그 빈들을 건너뛰고 WARN 한 줄을 남긴다.
 */
@Configuration(proxyBeanMethods = false)
@ConditionalOnProperty(prefix = "dmes.job.agent", name = "enabled", havingValue = "true", matchIfMissing = true)
public class JobBuiltinConfig {

    @Bean
    public JobCodeService jobCodeService(JobHandlerRegistry registry) {
        return new JobCodeService(registry);
    }

    @Bean
    @Conditional(DataSourceDecidable.class)
    public JobQueryService jobQueryService(ObjectProvider<DataSource> dataSource, ApplicationContext ctx) {
        return new JobQueryService(resolveDataSource(dataSource, ctx));
    }

    @Bean
    @Conditional(DataSourceDecidable.class)
    public JobCollectSql jobCollectSql(ObjectProvider<DataSource> dataSource, ApplicationContext ctx) {
        return new JobCollectSql(resolveDataSource(dataSource, ctx));
    }

    @Bean
    @Conditional(DataSourceDecidable.class)
    public SqlCollectSource sqlCollectSource(JobCollectSql sql) {
        return new SqlCollectSource(sql);
    }

    @Bean
    public HttpCollectSource httpCollectSource(JobProperties props, Environment env) {
        return new HttpCollectSource(JobCollectHosts.matcher(JobCollectHosts.resolve(props, env)));
    }

    @Bean
    @Conditional(DataSourceDecidable.class)
    public JobCollectService jobCollectService(SqlCollectSource sql, HttpCollectSource http) {
        return new JobCollectService(sql, http);
    }

    private static final String DEFAULT_DATA_SOURCE = "dataSource";

    /** 하나뿐이거나 primary 가 하나({@code getIfUnique}), 아니면 이름이 {@code dataSource} 인 빈. 조건이 통과했으면 null 이 아니다. */
    private static DataSource resolveDataSource(ObjectProvider<DataSource> dataSource, ApplicationContext ctx) {
        DataSource unique = dataSource.getIfUnique();
        if (unique != null) return unique;
        if (ctx.containsBean(DEFAULT_DATA_SOURCE)) return ctx.getBean(DEFAULT_DATA_SOURCE, DataSource.class);
        throw new IllegalStateException("예약 작업 내장 서비스에 쓸 DataSource 를 정할 수 없습니다");
    }

    /** 빈 등록 단계에서 {@link #resolveDataSource} 가 DataSource 를 찾을지 미리 판정한다. extras 는 늦게 등록되므로 {@code cactus.datasource.extras} 키로 센다. */
    static final class DataSourceDecidable implements Condition {
        private static final Logger log = LoggerFactory.getLogger(DataSourceDecidable.class);

        @Override
        public boolean matches(ConditionContext context, AnnotatedTypeMetadata metadata) {
            ConfigurableListableBeanFactory bf = context.getBeanFactory();
            if (bf == null) return true;
            Set<String> candidates = new LinkedHashSet<>();
            int primary = 0;
            for (String n : bf.getBeanNamesForType(DataSource.class, true, false)) {
                candidates.add(n);
                if (isPrimary(bf, n)) primary++;
            }
            Binder binder = Binder.get(context.getEnvironment());
            for (String e : binder.bind("cactus.datasource", CactusDataSourceProperties.class).map(p -> p.getExtras().keySet()).orElse(Set.of())) {
                if (!bf.containsBean(e)) candidates.add(e);
            }
            if (candidates.size() == 1 || primary == 1 || bf.containsBean(DEFAULT_DATA_SOURCE)) return true;
            // 조건은 빈마다 평가되므로 한 번만 남긴다
            if (metadata instanceof MethodMetadata mm && "jobQueryService".equals(mm.getMethodName())) {
                log.warn("예약 작업 내장 서비스(jobQuery·jobCollect)를 만들지 않습니다 — 쓸 DataSource 를 정할 수 없습니다(후보 {}개, primary 없음, "
                        + "dataSource 빈 없음). 이 앱은 쿼리·수집 작업을 실행하지 않습니다", candidates.size());
            }
            return false;
        }

        private static boolean isPrimary(ConfigurableListableBeanFactory bf, String name) {
            try {
                return bf.getMergedBeanDefinition(name).isPrimary();
            } catch (NoSuchBeanDefinitionException e) {
                return false;
            }
        }
    }
}
