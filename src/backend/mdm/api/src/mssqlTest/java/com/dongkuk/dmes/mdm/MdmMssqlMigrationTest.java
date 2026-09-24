package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.INSERT_SYSTEM;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SEED_AUDIT_USER;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SEED_NAMES;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SELF_CODE;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.UPPER_SNAKE;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.seededCodes;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.output.MigrateResult;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.config.YamlPropertiesFactoryBean;
import org.springframework.core.io.ClassPathResource;

/**
 * TSK-01-02 design.md §3.3 T12 — mdm Flyway 마이그레이션을 실제 SQL Server 2022(Testcontainers)에 적용해
 * T11(SQLite)과 같은 사실을 확인한다(불변 규칙 I5~I8).
 *
 * <p>docker 가 필요하다. {@code :api:mssqlMigrationTest} 로만 돌고 test·testAll 에 들어가지 않는다(D5).
 * docker 가 없으면 조건부 skip 하지 않고 실패한다(거짓 통과 방지, 불변 규칙 I20).
 *
 * <p>locations 는 하드코딩하지 않고 {@code application-local-db.yml} 의 {@code spring.flyway.locations} 를
 * 읽는다 — 앱 설정과 이 게이트를 묶는다. 쓰기 단언은 한 트랜잭션에서 하고 rollback 으로 끝낸다.
 */
class MdmMssqlMigrationTest {

    private static String mdmUrl;
    private static MigrateResult migrateResult;

    @BeforeAll
    static void migrate() throws SQLException {
        try (Connection master = DriverManager.getConnection(
                MdmMssqlServer.serverUrl(), MdmMssqlServer.user(), MdmMssqlServer.password());
             Statement s = master.createStatement()) {
            try (ResultSet rs = s.executeQuery("SELECT @@VERSION")) {
                rs.next();
                System.out.println("[MdmMssqlMigrationTest] @@VERSION = " + rs.getString(1).replace('\n', ' '));
            }
        }
        mdmUrl = MdmMssqlServer.newDatabase("migration");
        migrateResult = Flyway.configure()
                .dataSource(mdmUrl, MdmMssqlServer.user(), MdmMssqlServer.password())
                .locations(localDbFlywayLocations())
                .load()
                .migrate();
    }

    @Test
    void local_db_설정의_locations_로_V1_V2_V3_V4_V8_V9_V10_가_적용된다() throws SQLException {
        // TSK-04-01 F12 — V3(02 용어·도메인·컬럼) 반영. TSK-05-01 — V4(03 인터페이스 레이아웃) 추가 반영.
        // TSK-08-01 — V8(06 업무기준, 팀장 배정 번호) 추가 반영.
        // TSK-06-01 — V9(04 마스터코드, D1. 당초 V6, 2026-09-24 팀장 정정으로 머지 뒤 최대 버전+1 재채번) 추가 반영.
        // 모두 완화가 아니라 새 버전 반영이다.
        // TSK-07-01 — V10(05 마스터데이터, 당초 V7 → 머지 뒤 재채번) 추가 반영.
        assertEquals(7, migrateResult.migrationsExecuted);
        assertEquals("10", migrateResult.targetSchemaVersion);

        Set<String> versions = new HashSet<>();
        try (Connection c = connect(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT version FROM flyway_schema_history WHERE success = 1")) {
            while (rs.next()) {
                versions.add(rs.getString(1));
            }
        }
        assertEquals(Set.of("1", "2", "3", "4", "8", "9", "10"), versions);
    }

    @Test
    void 시스템_시드는_6행이고_자기_행은_MDM_하나다() throws SQLException {
        Map<String, String> names = new HashMap<>();
        Set<String> selfRows = new HashSet<>();
        try (Connection c = connect(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT SYSTEM_CODE, SYSTEM_NAME, SELF_YN, VER, C_USR_ID, C_AT FROM TB_MDM_SYSTEM")) {
            while (rs.next()) {
                String code = rs.getString("SYSTEM_CODE");
                names.put(code, rs.getString("SYSTEM_NAME"));
                if ("Y".equals(rs.getString("SELF_YN"))) {
                    selfRows.add(code);
                }
                assertEquals(0L, rs.getLong("VER"), code + " VER");
                assertEquals(SEED_AUDIT_USER, rs.getString("C_USR_ID"), code + " C_USR_ID");
                assertNull(rs.getObject("C_AT"), code + " C_AT 는 NULL(D10)");
            }
        }
        assertEquals(6, names.size());
        assertEquals(seededCodes(), names.keySet());
        assertEquals(SEED_NAMES, names);
        assertEquals(Set.of(SELF_CODE), selfRows);
    }

    @Test
    void 자기_행_유일과_Y_N_검사와_대소문자_구분을_DB_가_강제한다() throws SQLException {
        try (Connection c = connect()) {
            c.setAutoCommit(false);
            try {
                SQLException unique = assertThrows(SQLException.class, () -> insertSystem(c, "NEWSELF", "새 자기 행", "Y"));
                assertEquals(2601, unique.getErrorCode(), "UX_TB_MDM_SYSTEM_SELF_YN 위반이어야 한다: " + unique.getMessage());
                SQLException lower = assertThrows(SQLException.class, () -> insertSystem(c, "LOWER", "소문자", "y"));
                assertEquals(547, lower.getErrorCode(), "CK_TB_MDM_SYSTEM_SELF_YN 위반이어야 한다(BIN2): " + lower.getMessage());
                SQLException other = assertThrows(SQLException.class, () -> insertSystem(c, "BLANK", "빈 값", "X"));
                assertEquals(547, other.getErrorCode(), other.getMessage());

                insertSystem(c, "erp", "소문자 코드", "N");
                assertEquals(1, count(c, "SELECT COUNT(*) FROM TB_MDM_SYSTEM WHERE SYSTEM_CODE = 'ERP'"));
                assertEquals(1, count(c, "SELECT COUNT(*) FROM TB_MDM_SYSTEM WHERE SYSTEM_CODE = 'erp'"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void 칼럼_타입_콜레이션_제약_명명이_규칙표를_따른다() throws SQLException {
        Set<String> columns = new LinkedHashSet<>();
        Map<String, String> types = new HashMap<>();
        Map<String, String> collations = new HashMap<>();
        try (Connection c = connect(); Statement s = c.createStatement()) {
            try (ResultSet rs = s.executeQuery(
                    "SELECT c.name, t.name AS type_name, c.collation_name FROM sys.columns c "
                            + "JOIN sys.types t ON t.user_type_id = c.user_type_id "
                            + "WHERE c.object_id = OBJECT_ID('dbo.TB_MDM_SYSTEM') ORDER BY c.column_id")) {
                while (rs.next()) {
                    columns.add(rs.getString("name"));
                    types.put(rs.getString("name"), rs.getString("type_name"));
                    collations.put(rs.getString("name"), rs.getString("collation_name"));
                }
            }
            assertEquals(1, count(c, "SELECT COUNT(*) FROM sys.key_constraints "
                    + "WHERE name = 'PK_TB_MDM_SYSTEM' AND type = 'PK' AND parent_object_id = OBJECT_ID('dbo.TB_MDM_SYSTEM')"));
            assertEquals(1, count(c, "SELECT COUNT(*) FROM sys.check_constraints "
                    + "WHERE name = 'CK_TB_MDM_SYSTEM_SELF_YN' AND parent_object_id = OBJECT_ID('dbo.TB_MDM_SYSTEM')"));
            assertEquals(1, count(c, "SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_TB_MDM_SYSTEM_SELF_YN' "
                    + "AND is_unique = 1 AND has_filter = 1 AND object_id = OBJECT_ID('dbo.TB_MDM_SYSTEM')"));
        }

        assertEquals(expectedColumns(), columns);
        for (String column : columns) {
            assertTrue(column.matches(UPPER_SNAKE), column);
        }
        assertEquals("Latin1_General_100_BIN2", collations.get("SYSTEM_CODE"));
        assertEquals("Latin1_General_100_BIN2", collations.get("SELF_YN"));
        assertEquals("nvarchar", types.get("SYSTEM_NAME"));
        assertEquals("datetime2", types.get("C_AT"));
        assertEquals("datetime2", types.get("U_AT"));
        assertEquals("bigint", types.get("VER"));
    }

    private static String[] localDbFlywayLocations() {
        YamlPropertiesFactoryBean yaml = new YamlPropertiesFactoryBean();
        yaml.setResources(new ClassPathResource("application-local-db.yml"));
        Properties properties = yaml.getObject();
        assertNotNull(properties, "application-local-db.yml 을 읽지 못했다");
        String locations = properties.getProperty("spring.flyway.locations");
        assertNotNull(locations, "application-local-db.yml 에 spring.flyway.locations 가 없다");
        return locations.split("\\s*,\\s*");
    }

    private static Connection connect() throws SQLException {
        return DriverManager.getConnection(mdmUrl, MdmMssqlServer.user(), MdmMssqlServer.password());
    }

    private static void insertSystem(Connection c, String code, String name, String selfYn) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(INSERT_SYSTEM)) {
            ps.setString(1, code);
            ps.setString(2, name);
            ps.setString(3, selfYn);
            ps.executeUpdate();
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next());
            return rs.getLong(1);
        }
    }
}
