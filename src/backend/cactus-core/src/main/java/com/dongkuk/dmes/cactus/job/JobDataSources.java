package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.datasource.CactusDataSourceProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.LinkedHashSet;
import java.util.Set;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.NoSuchBeanDefinitionException;
import org.springframework.beans.factory.config.ConfigurableListableBeanFactory;
import org.springframework.boot.autoconfigure.condition.ConditionOutcome;
import org.springframework.boot.autoconfigure.condition.SpringBootCondition;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.ConditionContext;
import org.springframework.context.annotation.ConfigurationCondition;
import org.springframework.core.env.Environment;
import org.springframework.core.type.AnnotatedTypeMetadata;

/**
 * 결과 갱신에 쓸 DataSource 를 고른다(설계 §4.5 「그 모듈 앱의 기본 DataSource」). 순서는 셋이다.
 * <ol>
 *   <li>멀티 트랜잭션 모드면 {@code cactus.tx.default-manager} 의 {@code data-source} — {@code CactusMultiTransactionManagerAutoConfiguration}
 *       과 같은 규칙으로 {@code cactus.datasource.primary-alias} 와 같으면 {@code dataSource} 빈, 아니면 그 이름(extras alias)의 빈.</li>
 *   <li>DataSource 후보가 하나뿐이거나 primary 가 하나({@code getIfUnique}).</li>
 *   <li>이름이 {@code dataSource} 인 빈.</li>
 * </ol>
 * 셋 다 없으면 진입점 빈을 만들지 않는다 — 기동은 그대로 되고 그 앱은 예약 실행을 받지 않는다(WARN 한 줄).
 */
final class JobDataSources {

    static final String DEFAULT_NAME = "dataSource";
    private static final Logger log = LoggerFactory.getLogger(JobDataSources.class);

    private JobDataSources() {}

    /** default-manager 가 가리키는 DataSource 빈 이름. 멀티 트랜잭션 설정이 없으면 null. */
    static String configuredName(Environment env) {
        Binder binder = Binder.get(env);
        CactusTxProperties tx = binder.bind("cactus.tx", CactusTxProperties.class).orElse(null);
        if (tx == null || tx.getDefaultManager() == null || tx.getManagers().isEmpty()) return null;
        CactusTxProperties.TxMgrConfig def = tx.getManagers().get(tx.getDefaultManager());
        if (def == null || def.getDataSource() == null || def.getDataSource().isBlank()) return null;
        String ds = def.getDataSource().trim();
        String primaryAlias = dsProps(binder).getPrimaryAlias();
        return ds.equals(primaryAlias) ? DEFAULT_NAME : ds;
    }

    /** 빈이 다 만들어진 뒤 실제 DataSource 를 고른다. 없으면 null. */
    static DataSource resolve(ApplicationContext ctx, Environment env) {
        String name = configuredName(env);
        if (name != null && ctx.containsBean(name)) return ctx.getBean(name, DataSource.class);
        DataSource unique = ctx.getBeanProvider(DataSource.class).getIfUnique();
        if (unique != null) return unique;
        return ctx.containsBean(DEFAULT_NAME) ? ctx.getBean(DEFAULT_NAME, DataSource.class) : null;
    }

    private static CactusDataSourceProperties dsProps(Binder binder) {
        return binder.bind("cactus.datasource", CactusDataSourceProperties.class).orElseGet(CactusDataSourceProperties::new);
    }

    /**
     * 빈 등록 단계에서 {@link #resolve} 가 무엇이든 찾을지 미리 판정한다. extras DataSource 는 설정 클래스 해석 뒤에 등록되므로
     * 정의 대신 {@code cactus.datasource.extras} 키로 센다(primary 아닌 후보).
     */
    static final class Available extends SpringBootCondition implements ConfigurationCondition {

        @Override
        public ConfigurationPhase getConfigurationPhase() {
            return ConfigurationPhase.REGISTER_BEAN;
        }

        @Override
        public ConditionOutcome getMatchOutcome(ConditionContext context, AnnotatedTypeMetadata metadata) {
            ConfigurableListableBeanFactory bf = context.getBeanFactory();
            Environment env = context.getEnvironment();
            Set<String> extras = dsProps(Binder.get(env)).getExtras().keySet();

            String name = configuredName(env);
            if (name != null && (bf.containsBean(name) || extras.contains(name))) {
                return ConditionOutcome.match("default-manager 의 DataSource '" + name + "'");
            }
            Set<String> candidates = new LinkedHashSet<>();
            int primary = 0;
            for (String n : bf.getBeanNamesForType(DataSource.class, true, false)) {
                candidates.add(n);
                if (isPrimary(bf, n)) primary++;
            }
            for (String e : extras) {
                if (!bf.containsBean(e)) candidates.add(e);
            }
            if (candidates.size() == 1 || primary == 1) return ConditionOutcome.match("DataSource 하나 또는 primary 하나");
            if (bf.containsBean(DEFAULT_NAME)) return ConditionOutcome.match("이름이 dataSource 인 빈");

            // ServiceStarter 가 없거나 꺼 둔 앱은 어차피 진입점이 없으니 WARN 하지 않는다(조건 평가 순서와 무관하게).
            boolean wanted = bf.getBeanNamesForType(ServiceStarter.class, true, false).length > 0
                    && env.getProperty("dmes.job.agent.enabled", Boolean.class, true);
            if (wanted) log.warn("예약 실행 진입점을 만들지 않습니다 — 결과 갱신에 쓸 DataSource 를 정할 수 없습니다(후보 {}개, primary 없음, "
                    + "dataSource 빈 없음, cactus.tx.default-manager 매핑 없음). 이 앱은 예약 실행을 받지 않습니다", candidates.size());
            return ConditionOutcome.noMatch("결과 갱신 DataSource 없음");
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
