package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.FilterType;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.MapPropertySource;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * 빈 연결 확인 — mcm 런처처럼 {@code widget.query} 패키지를 스캔해 실행기·{@link WidgetQueryConfig}·설정 바인딩이 함께 뜨는지,
 * 전용 설정이 없으면 앱 기본(@Primary) DataSource, 있으면 전용 풀을 쓰는지 본다. 전용 DataSource 는 DataSource 형 빈이 아니다.
 * 앱 기본 DataSource 는 Oracle 시험 PDB 의 MCMAPUSER 풀({@link McmCoreOraTestDb})이다. Oracle 은 읽기 전용 트랜잭션을 거는 갈래라
 * 전용 설정이 없어도 실행하고, 읽기 전용 트랜잭션을 걸 수 없는 갈래(OTHER — SQL Server·SQLite 제품 이름 포함)의 실패 닫힘 거절은 {@link WidgetQueryExecutorTest} 가
 * 가짜 제품 이름으로 본다. 전용 설정은 다른 스키마 계정(MCM_SOURCE)으로 붙여 앱 기본 계정과 구별한다.
 */
class WidgetQueryWiringTest {

    /** 전용 DataSource 가 붙는 계정 — 앱 기본(MCMAPUSER)과 다른 스키마라 서로의 표가 보이지 않는다. */
    private static final String DEDICATED_USER = McmCoreOraTestDb.SCHEMAS.get(1);
    private static final String DEDICATED_TABLE = "T_C4_WQ_RO_ONLY";

    @Configuration
    @ComponentScan(basePackageClasses = WidgetQueryExecutor.class,
            excludeFilters = @ComponentScan.Filter(type = FilterType.REGEX, pattern = ".*Test.*"))
    static class Config {

        @Bean
        @Primary
        DataSource dataSource() {
            return McmCoreOraTestDb.appDataSource("widget-query-wiring");
        }

        /** 다른 DataSource 빈이 있어도 @Primary 를 고른다(mcm 은 cactus cmn·if·caravan DataSource 가 함께 뜬다). 연결은 맺지 않는다(풀은 처음 빌릴 때 뜬다). */
        @Bean
        DataSource otherDataSource() {
            return McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "widget-query-wiring-other");
        }

        @Bean
        WidgetDefRepository widgetDefRepository() {
            return mock(WidgetDefRepository.class);
        }

        @Bean
        WidgetUserContextResolver widgetUserContextResolver() {
            return mock(WidgetUserContextResolver.class);
        }
    }

    /** {@code dmes.widget.query.datasource.*} 를 시험 PDB 접속값으로 채운다 — 접속값은 실행 때 정해지므로 어노테이션 대신 초기화 단계에서 넣는다. */
    static class DedicatedSettings implements ApplicationContextInitializer<ConfigurableApplicationContext> {
        @Override
        public void initialize(ConfigurableApplicationContext context) {
            context.getEnvironment().getPropertySources().addFirst(new MapPropertySource("widget-query-dedicated", Map.of(
                    "dmes.widget.query.datasource.url", McmCoreOraTestDb.url(),
                    "dmes.widget.query.datasource.driver-class-name", "oracle.jdbc.OracleDriver",
                    "dmes.widget.query.datasource.username", DEDICATED_USER,
                    "dmes.widget.query.datasource.password", McmCoreOraTestDb.password(),
                    "dmes.widget.query.datasource.maximum-pool-size", "2")));
        }
    }

    @Nested
    @SpringJUnitConfig(Config.class)
    class WithoutDedicatedSettings {

        @Autowired WidgetQueryDataSource queryDataSource;
        @Autowired DataSource primary;
        @Autowired WidgetQueryRunner runner;
        @Autowired WidgetQueryExecutor executor;

        @Test
        @DisplayName("전용 설정이 없으면 앱 기본(@Primary) DataSource 를 쓰고, Oracle 은 읽기 전용 트랜잭션을 거는 갈래라 그대로 실행·저장 검사한다")
        void usesPrimaryDataSourceAndRunsOnOracle() {
            assertThat(queryDataSource.dedicated()).isFalse();
            assertThat(queryDataSource.requireDedicated()).isFalse();
            assertThat(queryDataSource.dataSource()).isSameAs(primary);

            WidgetQueryResult result = runner.preview("mcm", "SELECT 1 AS A FROM DUAL", 50);
            assertThat(result.columns()).containsExactly("A");
            assertThat(result.rows()).hasSize(1);
            assertThat(((Number) result.rows().get(0).get("A")).intValue()).isEqualTo(1);
            runner.validateSql("SELECT 1 AS A FROM DUAL");
            assertThat(executor.readOnlyJdbc().dialect()).isEqualTo(WidgetReadOnlyJdbc.Dialect.ORACLE);
        }
    }

    @Nested
    @SpringJUnitConfig(classes = Config.class, initializers = DedicatedSettings.class)
    class WithDedicatedSettings {

        @Autowired WidgetQueryDataSource queryDataSource;
        @Autowired WidgetQueryProperties properties;
        @Autowired WidgetQueryRunner runner;

        @Test
        @DisplayName("dmes.widget.query.datasource.* 가 바인딩되고 실행기는 전용 풀(다른 스키마 계정)로 실행한다")
        void usesDedicatedPool() throws SQLException {
            assertThat(properties.getDatasource().getMaximumPoolSize()).isEqualTo(2);
            assertThat(queryDataSource.dedicated()).isTrue();
            // 이 표는 전용 계정(MCM_SOURCE)에만 있다 — 앱 기본 계정(MCMAPUSER)으로는 보이지 않으므로 실행되면 전용 풀을 쓴 것이다.
            // (컨텍스트가 뜰 때 스키마 준비가 일어날 수 있어 표는 시험 안에서 만들고 지운다.)
            try (Connection owner = DriverManager.getConnection(McmCoreOraTestDb.url(), DEDICATED_USER, McmCoreOraTestDb.password());
                 Statement st = owner.createStatement()) {
                dropTable(st, DEDICATED_TABLE);
                st.execute("CREATE TABLE " + DEDICATED_TABLE + " (ID NUMBER)");
                McmCoreOraTestDb.awaitReadOnlyReadable(DEDICATED_USER, DEDICATED_TABLE);
                try {
                    st.execute("INSERT INTO " + DEDICATED_TABLE + " (ID) VALUES (7)");
                    WidgetQueryResult result = runner.preview("mcm", "SELECT COUNT(*) AS CNT FROM " + DEDICATED_TABLE, 50);
                    assertThat(result.rows()).hasSize(1);
                    assertThat(((Number) result.rows().get(0).get("CNT")).longValue()).isEqualTo(1L);
                } finally {
                    dropTable(st, DEDICATED_TABLE);
                }
            }
        }
    }

    private static void dropTable(Statement st, String table) throws SQLException {
        st.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }
}
