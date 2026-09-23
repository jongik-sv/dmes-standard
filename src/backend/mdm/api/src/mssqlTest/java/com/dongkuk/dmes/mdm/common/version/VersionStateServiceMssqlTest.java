package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.mssqlserver.MSSQLServerContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * TSK-01-03 design.md §3.3 — 버전 상태 서비스 시나리오를 실제 SQL Server 2022(Testcontainers)로 돌린다.
 *
 * <p>docker 가 필요하다. {@code :api:mssqlMigrationTest} 로만 돌고 test·testAll 에 들어가지 않는다. docker 가 없으면
 * 조건부 skip 하지 않고 실패한다(TSK-01-02 I20). 방언 무관 시나리오(S1~S13, S15~S23) 전부와 MSSQL 저장 형식을 본다.
 * 픽스처 테이블은 MSSQL 문안(DATETIME2(0), DECIMAL(7,3), 코드 칼럼 BIN2 정렬)이다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Import({VersionScenarioTestConfig.class, VersionStateServiceMssqlTest.FixtureRegistry.class})
class VersionStateServiceMssqlTest extends AbstractVersionStateScenarioTest {

    static final MSSQLServerContainer MSSQL = new MSSQLServerContainer(
            DockerImageName.parse("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04")).acceptLicense();

    static {
        // Spring 컨텍스트(Flyway 포함)가 뜨기 전에 컨테이너와 DB 가 있어야 한다.
        MSSQL.start();
        try (Connection master = DriverManager.getConnection(MSSQL.getJdbcUrl(), MSSQL.getUsername(), MSSQL.getPassword());
             Statement s = master.createStatement()) {
            s.execute("IF DB_ID('mdm_version') IS NULL CREATE DATABASE mdm_version");
        } catch (SQLException e) {
            throw new IllegalStateException(e);
        }
    }

    @Autowired
    MdmDialectResolver dialectResolver;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> MSSQL.getJdbcUrl() + ";databaseName=mdm_version");
        registry.add("spring.datasource.username", MSSQL::getUsername);
        registry.add("spring.datasource.password", MSSQL::getPassword);
    }

    @TestConfiguration(proxyBeanMethods = false)
    static class FixtureRegistry {
        @Bean
        @Primary
        VersionTableRegistry fixtureVersionTableRegistry() {
            return VersionFixtureTables::spec;
        }
    }

    @Override
    protected void createSchema(JdbcTemplate jdbc) {
        VersionFixtureTables.mssqlDdl().forEach(jdbc::execute);
    }

    @Override
    protected void clearTables(JdbcTemplate jdbc) {
        VersionFixtureTables.clear(jdbc);
    }

    @Test
    void 방언은_MSSQL_이다() {
        assertEquals(MdmDialect.MSSQL, dialectResolver.current());
    }

    @Test
    void MSSQL_네이티브_쓰기는_DATETIME2_로_같은_값을_저장한다() {
        at("2026-06-20 09:08:07");
        seedObject(VersionTarget.MASTER_CODE, "PROC_CD", "INUSE");
        VersionRef v1 = code("PROC_CD", "1.000");
        seedVersion(v1, "DRAFT", KIM, null, null, 0);

        confirm(v1, 0, "2026-07-01 00:00:00");

        Map<String, Object> types = jdbc.queryForMap("SELECT "
                + "(SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TB_MDM_TC_CODE_VER' AND COLUMN_NAME = 'APPLY_FROM') AS F_TYPE, "
                + "(SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TB_MDM_TC_CODE_VER' AND COLUMN_NAME = 'U_AT') AS U_TYPE");
        assertEquals("datetime2", types.get("F_TYPE"));
        assertEquals("datetime2", types.get("U_TYPE"));
        Map<String, Object> row = readVersion(v1);
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), ((java.sql.Timestamp) row.get("APPLY_FROM")).toLocalDateTime());
        assertEquals(OPEN_END, text(row.get("APPLY_TO")));
        assertEquals("2026-06-20 09:08:07", text(row.get("U_AT")));
    }
}
