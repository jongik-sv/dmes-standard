package com.dongkuk.dmes.mcm.config;

import static org.assertj.core.api.Assertions.assertThat;

import com.zaxxer.hikari.HikariDataSource;
import java.io.IOException;
import java.sql.SQLException;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.boot.env.YamlPropertySourceLoader;
import org.springframework.core.env.MutablePropertySources;
import org.springframework.core.env.PropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.env.SystemEnvironmentPropertySource;
import org.springframework.core.io.ClassPathResource;

/**
 * mcm 기본 풀(mcm-host-primary)이 {@code spring.datasource.hikari} 의 최대치·쉬는 연결·유휴 시간·누수 감지를 읽는지 본다
 * (oracle-1007 ③d). application.yml + application-local.yml 을 실제로 읽고, 기동 env(시스템 환경 변수 형식)로 덮어쓴다.
 * 풀은 만들기만 하고 연결은 열지 않는다(Hikari 는 첫 getConnection 때 연결한다). local 은 연결 지연 획득
 * ({@code dmes.datasource.lazy-connection}, {@link LazyPrimaryDataSource})으로 감싸므로 그 안의 Hikari 를 본다.
 */
class McmHostPoolLocalProfileBindingTest {

    @Test
    void local_프로필은_최대_3_쉬는_연결_0_유휴_30초_누수_감지_30초다() throws Exception {
        try (HikariDataSource ds = dataSource(environment(Map.of()))) {
            assertThat(ds.getPoolName()).isEqualTo("mcm-host-primary");
            assertThat(ds.getMaximumPoolSize()).isEqualTo(3);
            assertThat(ds.getMinimumIdle()).isZero();
            assertThat(ds.getIdleTimeout()).isEqualTo(30_000);
            assertThat(ds.getLeakDetectionThreshold()).isEqualTo(30_000);
        }
    }

    @Test
    void 메인_서버는_기동_env_로_최대치와_쉬는_연결_유휴_시간을_덮어쓴다() throws Exception {
        StandardEnvironment env = environment(Map.of(
                "SPRING_DATASOURCE_HIKARI_MAXIMUM_POOL_SIZE", "8",
                "SPRING_DATASOURCE_HIKARI_MINIMUM_IDLE", "2",
                "SPRING_DATASOURCE_HIKARI_IDLE_TIMEOUT", "60000"));
        try (HikariDataSource ds = dataSource(env)) {
            assertThat(ds.getMaximumPoolSize()).isEqualTo(8);
            assertThat(ds.getMinimumIdle()).isEqualTo(2);
            assertThat(ds.getIdleTimeout()).isEqualTo(60_000);
            assertThat(ds.getLeakDetectionThreshold()).isEqualTo(30_000);
        }
    }

    @Test
    void 값이_없으면_종전처럼_최대_3_에_Hikari_기본값이다() throws Exception {
        StandardEnvironment env = baseOnly();
        env.getPropertySources().addFirst(new SystemEnvironmentPropertySource("test-env", Map.of(
                "SPRING_DATASOURCE_URL", "jdbc:oracle:thin:@//localhost:1521/X")));
        try (HikariDataSource ds = dataSource(env)) {
            assertThat(ds.getMaximumPoolSize()).isEqualTo(3);
            assertThat(ds.getMinimumIdle()).isEqualTo(-1);          // 설정 안 함 — Hikari 가 풀을 열 때 최대치로 맞춘다
            assertThat(ds.getIdleTimeout()).isEqualTo(600_000);     // Hikari 기본 10분
            assertThat(ds.getLeakDetectionThreshold()).isZero();    // 감지 끔
        }
    }

    /** 기본 풀 — 연결 지연 획득(dmes.datasource.lazy-connection)으로 감싸여 있으면 그 안의 Hikari. */
    @Test
    void local_프로필은_연결_지연_획득으로_감싸고_env_로_끌_수_있으며_프로필이_없으면_감싸지_않는다() throws Exception {
        DataSource local = new JpaConfig().dataSource(environment(Map.of()));
        assertThat(local).isInstanceOf(LazyPrimaryDataSource.class);
        ((AutoCloseable) local).close();
        assertThat(local.unwrap(HikariDataSource.class).isClosed()).as("감싸개를 닫으면 안의 풀도 닫힌다").isTrue();

        DataSource off = new JpaConfig().dataSource(environment(Map.of("DMES_DATASOURCE_LAZY_CONNECTION", "false")));
        assertThat(off).isInstanceOf(HikariDataSource.class);
        ((HikariDataSource) off).close();

        StandardEnvironment base = baseOnly();
        base.getPropertySources().addFirst(new SystemEnvironmentPropertySource("test-env", Map.of(
                "SPRING_DATASOURCE_URL", "jdbc:oracle:thin:@//localhost:1521/X")));
        DataSource plain = new JpaConfig().dataSource(base);
        assertThat(plain).as("기본(운영)은 끔").isInstanceOf(HikariDataSource.class);
        ((HikariDataSource) plain).close();
    }

    private static HikariDataSource dataSource(StandardEnvironment env) throws SQLException {
        return new JpaConfig().dataSource(env).unwrap(HikariDataSource.class);
    }

    /** application.yml 위에 application-local.yml, 맨 위에 기동 env(시스템 환경·속성은 뺀다). */
    private static StandardEnvironment environment(Map<String, Object> envVars) throws IOException {
        StandardEnvironment environment = baseOnly();
        MutablePropertySources sources = environment.getPropertySources();
        for (PropertySource<?> local : new YamlPropertySourceLoader()
                .load("application-local.yml", new ClassPathResource("application-local.yml"))) {
            sources.addFirst(local);
        }
        sources.addFirst(new SystemEnvironmentPropertySource("test-env", envVars));
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
