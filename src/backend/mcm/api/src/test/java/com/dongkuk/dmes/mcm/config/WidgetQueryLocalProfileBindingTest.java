package com.dongkuk.dmes.mcm.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.widget.query.WidgetQueryProperties;
import java.io.IOException;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.bind.Bindable;
import org.springframework.boot.context.properties.bind.Binder;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;

/**
 * local 프로필의 쿼리 위젯 전용 풀(oracle-1007 ③c) — application.yml + application-local.yml 을 실제로 읽어
 * {@code dmes.widget.query} 에 묶었을 때 앱 기본 풀과 같은 PDB 에 따로 붙는 작은 풀(최대 2, 쉬는 연결 10초)이 되는지 본다.
 * 비어 있으면 실행기가 앱 기본 풀(3개)을 함께 써, OASIS 바깥 트랜잭션이 연결을 쥔 채 같은 풀에서 하나 더 받다가 풀이 바닥난다.
 */
class WidgetQueryLocalProfileBindingTest {

    @Test
    void local_프로필은_같은_PDB_에_붙는_전용_직결_풀을_둔다() throws IOException {
        WidgetQueryProperties p = bind(environment(Map.of()));
        WidgetQueryProperties.Datasource d = p.getDatasource();

        assertThat(d.getJndiName()).isEmpty();
        assertThat(d.getUrl()).isEqualTo("jdbc:oracle:thin:@//localhost:1521/L_ORA_MCM_APP");
        assertThat(d.getUsername()).isEqualTo("MCMAPUSER");
        assertThat(d.getPassword()).isEqualTo("dmes_password_123");
        assertThat(d.getDriverClassName()).isEqualTo("oracle.jdbc.OracleDriver");
        assertThat(d.getMaximumPoolSize()).isEqualTo(2);
        assertThat(d.getIdleTimeout()).isEqualTo(10_000);
        assertThat(p.isRequireDedicated()).isFalse();
    }

    @Test
    void 레인_PDB_를_고르면_전용_풀도_같은_PDB_로_가고_WIDGET_QUERY_DS_URL_이_있으면_그것을_쓴다() throws IOException {
        assertThat(bind(environment(Map.of("dmes.ora.url", "jdbc:oracle:thin:@//h:1521/LANE"))).getDatasource().getUrl())
                .isEqualTo("jdbc:oracle:thin:@//h:1521/LANE");
        assertThat(bind(environment(Map.of("WIDGET_QUERY_DS_URL", "jdbc:oracle:thin:@//h:1521/RO"))).getDatasource().getUrl())
                .isEqualTo("jdbc:oracle:thin:@//h:1521/RO");
    }

    @Test
    void 프로필이_없으면_전용_풀이_비어_앱_기본_DataSource_를_쓴다() throws IOException {
        WidgetQueryProperties.Datasource d = bind(baseOnly()).getDatasource();

        assertThat(d.getUrl()).isEmpty();
        assertThat(d.getJndiName()).isEmpty();
        assertThat(d.getIdleTimeout()).isEqualTo(600_000);
    }

    private static WidgetQueryProperties bind(StandardEnvironment environment) {
        return Binder.get(environment)
                .bind("dmes.widget.query", Bindable.of(WidgetQueryProperties.class))
                .orElseGet(WidgetQueryProperties::new);
    }

    /** application.yml 위에 application-local.yml, 맨 위에 시험 값(시스템 환경·속성은 뺀다). */
    private static StandardEnvironment environment(Map<String, Object> overrides) throws IOException {
        StandardEnvironment environment = baseOnly();
        MutablePropertySources sources = environment.getPropertySources();
        for (PropertySource<?> local : new YamlPropertySourceLoader()
                .load("application-local.yml", new ClassPathResource("application-local.yml"))) {
            sources.addFirst(local);
        }
        sources.addFirst(new MapPropertySource("test", overrides));
        return environment;
    }

    private static StandardEnvironment baseOnly() throws IOException {
        StandardEnvironment environment = new StandardEnvironment();
        MutablePropertySources sources = environment.getPropertySources();
        sources.remove(StandardEnvironment.SYSTEM_ENVIRONMENT_PROPERTY_SOURCE_NAME);
        sources.remove(StandardEnvironment.SYSTEM_PROPERTIES_PROPERTY_SOURCE_NAME);
        for (PropertySource<?> base : new YamlPropertySourceLoader()
                .load("application.yml", new ClassPathResource("application.yml"))) {
            sources.addLast(base);
        }
        return environment;
    }
}
