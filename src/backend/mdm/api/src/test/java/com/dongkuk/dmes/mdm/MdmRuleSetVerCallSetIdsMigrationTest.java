package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * 하위 세트 호출(D-135) — V23: 세트 버전 표 TB_MDM_RULE_SET_VER 에 CALL_SET_IDS 칸을 FLOW_JSON 뒤에 더한다(표 재생성, V22 방식).
 * 버전 행·케이스 행이 든 DB 에 foreign_keys=ON 으로 적용해 행·칼럼 순서·제약이 남는지 본다.
 */
class MdmRuleSetVerCallSetIdsMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void existingVersionRowsKeepTheirValuesAndGetAnEmptyCallList() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "22").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME) VALUES ('S_A', '세트 A')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON, ROW_VERSION) "
                    + "VALUES ('S_A', 1, 'MAJOR', 'RELEASED', '2000-01-01 00:00:00', '9999-12-31 00:00:00', '[\"R1\"]', NULL, 4)");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES ('S_A', 2, '[\"R1\",\"R2\"]')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON) VALUES ('S_A', 1, '케이스', '{}')");
        }

        flyway(url, "23").migrate();

        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            List<String> rows = new ArrayList<>();
            try (ResultSet rs = s.executeQuery("SELECT VER, STATUS, RULE_IDS, CALL_SET_IDS, ROW_VERSION FROM TB_MDM_RULE_SET_VER "
                    + "WHERE MARU_RULE_SET_ID = 'S_A' ORDER BY VER")) {
                while (rs.next()) {
                    rows.add(rs.getInt(1) + "|" + rs.getString(2) + "|" + rs.getString(3) + "|" + rs.getString(4) + "|" + rs.getLong(5));
                }
            }
            assertThat(rows).containsExactly("1|RELEASED|[\"R1\"]|[]|4", "2|DRAFT|[\"R1\",\"R2\"]|[]|0");
            assertThat(columns(s, "TB_MDM_RULE_SET_VER")).containsExactly(
                    "MARU_RULE_SET_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "APPLY_FROM", "APPLY_TO", "RULE_IDS", "FLOW_JSON",
                    "CALL_SET_IDS", "REQUESTED_BY", "REQUESTED_AT", "RELEASED_AT", "ROW_VERSION",
                    "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "AUD_VER");
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS, CALL_SET_IDS) VALUES ('S_A', 3, '[]', '{bad')"),
                    "CALL_SET_IDS JSON CHECK");
            assertThrows(SQLException.class, () -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, RULE_IDS) VALUES ('NOPE', 1, '[]')"),
                    "부모 세트 FK 가 다시 걸려 있어야 한다");
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = 'S_A'")) {
                rs.next();
                assertThat(rs.getInt(1)).isEqualTo(1);
            }
            try (ResultSet rs = s.executeQuery("SELECT COUNT(*) FROM sqlite_master WHERE name LIKE '%_BAK'")) {
                rs.next();
                assertThat(rs.getInt(1)).as("임시 표가 남았다").isZero();
            }
        }
    }

    private static List<String> columns(Statement s, String table) throws SQLException {
        List<String> out = new ArrayList<>();
        try (ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rs.next()) {
                out.add(rs.getString("name"));
            }
        }
        return out;
    }
}
