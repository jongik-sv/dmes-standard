package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * D-144 2단계 — V18 이 기존 세트를 1.000 MAJOR RELEASED 로 옮기고 케이스·FK 를 살리는지.
 * 이행 버전의 APPLY_FROM 은 C_AT 가 아니라 일괄 2000-01-01 이다(Ruling P2-11 — 이행 이전 판정 시각에서도 세트를 찾게).
 */
class MdmRuleSetVersionMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void existingSetsBecomeReleasedMajorOneAndCasesSurvive() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "17").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, DESCRIPTION, STATUS, ROW_VERSION,"
                    + " C_USR_ID, C_AT, U_USR_ID, U_AT, VER) VALUES ('S_LINE','한 줄','[\"R1\",\"R2\"]',NULL,'설명','INUSE',4,"
                    + " 'kim','2026-08-26 10:00:00','lee','2026-09-01 11:00:00',3)");
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, FLOW_JSON, STATUS, ROW_VERSION, VER)"
                    + " VALUES ('S_FLOW','흐름','[\"R1\"]','{\"version\":1,\"nodes\":[],\"edges\":[]}','DEPRECATED',2,0)");
            // 엔티티(Hibernate) 경로가 쓴 감사 일시는 epoch 밀리초 정수로 남아 있다(로컬 DB 실측) — KST 벽시계 문자열로 바꿔야 한다
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS, ROW_VERSION, C_AT, U_AT, VER)"
                    + " VALUES ('S_EPOCH','정수 일시','[]','INUSE',1,1790746498041,1790837251959,1)");
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS, ROW_VERSION, C_AT, U_AT, VER)"
                    + " VALUES ('S_ISO','T 구분 일시','[]','INUSE',0,'2026-09-02T08:30:15.123','2026-09-03T09:00:00',1)");
            s.execute("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON) VALUES ('S_LINE',1,'c1','{}')");
        }
        flyway(url, "18").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            ResultSet p = s.executeQuery("SELECT MARU_RULE_SET_NAME, DESCRIPTION, STATUS, VER, C_USR_ID, C_AT, U_USR_ID, U_AT"
                    + " FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID='S_LINE'");
            assertThat(p.next()).isTrue();
            assertThat(p.getString(1)).isEqualTo("한 줄");
            assertThat(p.getString(2)).isEqualTo("설명");
            assertThat(p.getString(3)).isEqualTo("INUSE");
            assertThat(p.getLong(4)).isEqualTo(3L);
            assertThat(p.getString(5)).isEqualTo("kim");
            assertThat(p.getString(6)).isEqualTo("2026-08-26 10:00:00");
            assertThat(p.getString(7)).isEqualTo("lee");
            assertThat(p.getString(8)).isEqualTo("2026-09-01 11:00:00");

            ResultSet v = s.executeQuery("SELECT CAST(VER AS VARCHAR(40)), VER_KIND, STATUS, APPLY_FROM, APPLY_TO, RULE_IDS, FLOW_JSON,"
                    + " ROW_VERSION, RELEASED_AT, OWNER_ID, REQUESTED_BY, REQUESTED_AT, BASE_VER, AUD_VER"
                    + " FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='S_LINE'");
            assertThat(v.next()).isTrue();
            assertThat(new BigDecimal(v.getString(1)).setScale(3)).isEqualByComparingTo("1.000");
            assertThat(v.getString(2)).isEqualTo("MAJOR");
            assertThat(v.getString(3)).isEqualTo("RELEASED");
            assertThat(v.getString(4)).isEqualTo("2000-01-01 00:00:00");
            assertThat(v.getString(5)).isEqualTo("9999-12-31 00:00:00");
            assertThat(v.getString(6)).isEqualTo("[\"R1\",\"R2\"]");
            assertThat(v.getString(7)).isNull();
            assertThat(v.getLong(8)).isEqualTo(4L);
            assertThat(v.getString(9)).isEqualTo("2026-09-01 11:00:00");
            assertThat(v.getString(10)).isNull();
            assertThat(v.getString(11)).isEqualTo("lee");
            assertThat(v.getString(12)).isEqualTo("2026-09-01 11:00:00");
            assertThat(v.getString(13)).isNull();
            assertThat(v.getLong(14)).isEqualTo(0L);
            assertThat(v.next()).isFalse();

            // C_AT·U_AT 가 NULL 인 행 — APPLY_FROM·RELEASED_AT 은 2000-01-01 00:00:00, 폐기 상태는 부모에 남는다
            ResultSet f = s.executeQuery("SELECT v.APPLY_FROM, v.RELEASED_AT, v.FLOW_JSON, p.STATUS FROM TB_MDM_RULE_SET_VER v"
                    + " JOIN TB_MDM_RULE_SET p ON p.MARU_RULE_SET_ID = v.MARU_RULE_SET_ID WHERE v.MARU_RULE_SET_ID='S_FLOW'");
            assertThat(f.next()).isTrue();
            assertThat(f.getString(1)).isEqualTo("2000-01-01 00:00:00");
            assertThat(f.getString(2)).isEqualTo("2000-01-01 00:00:00");
            assertThat(f.getString(3)).isEqualTo("{\"version\":1,\"nodes\":[],\"edges\":[]}");
            assertThat(f.getString(4)).isEqualTo("DEPRECATED");

            // RELEASED_AT: epoch 밀리초 정수(UTC) → KST 벽시계, 'T' 구분·밀리초 문자열 → 앞 19자. APPLY_FROM 은 일괄 2000-01-01.
            // 부모 감사 칼럼은 원본 그대로 둔다
            assertThat(applyAndReleased(s, "S_EPOCH")).containsExactly("2000-01-01 00:00:00", "2026-10-01 15:47:31");
            assertThat(applyAndReleased(s, "S_ISO")).containsExactly("2000-01-01 00:00:00", "2026-09-03 09:00:00");

            // C_AT 보다 이른 판정 시각에서도 이행 버전이 유효 구간 [APPLY_FROM, APPLY_TO) 에 든다(SET_NOT_FOUND 가 나지 않는다)
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='S_LINE' AND STATUS='RELEASED'"
                    + " AND APPLY_FROM <= '2026-08-25 10:00:00' AND '2026-08-25 10:00:00' < APPLY_TO")).isEqualTo(1);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER v JOIN TB_MDM_RULE_SET p ON p.MARU_RULE_SET_ID = v.MARU_RULE_SET_ID"
                    + " WHERE v.STATUS='RELEASED' AND v.APPLY_FROM <= '2026-01-01 00:00:00' AND '2026-01-01 00:00:00' < v.APPLY_TO")).isEqualTo(4);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID='S_EPOCH'"
                    + " AND typeof(C_AT)='integer' AND C_AT=1790746498041")).isEqualTo(1);

            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET")).isEqualTo(4);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER")).isEqualTo(4);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID='S_LINE'")).isEqualTo(1);
            assertThat(s.executeQuery("PRAGMA foreign_key_check").next()).isFalse();
            assertThat(columns(s, "TB_MDM_RULE_SET")).doesNotContain("RULE_IDS", "FLOW_JSON", "ROW_VERSION");
            assertThat(typeOf(s, "TB_MDM_RULE_SET_VER", "VER")).isEqualTo("NUMERIC(7,3)");
            assertThat(typeOf(s, "TB_MDM_RULE_SET_VER", "BASE_VER")).isEqualTo("NUMERIC(7,3)");

            // 두 자식 FK 가 최종 이름의 부모를 가리키고 CASCADE 가 없으며, 임시 표가 남지 않는다
            assertThat(fkTargets(s, "TB_MDM_RULE_SET_VER")).containsExactly("TB_MDM_RULE_SET/NO ACTION");
            assertThat(fkTargets(s, "TB_MDM_RULE_SET_TEST_CASE")).containsExactly("TB_MDM_RULE_SET/NO ACTION");
            assertThat(count(s, "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%_BAK%' OR name LIKE '%_BAK'")).isZero();

            // 새 상태 CREATED·minor 버전 저장과 FK·APPLY CHECK 거부가 동작한다
            s.execute("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_NEW','새','CREATED')");
            s.execute("INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, VER_KIND, STATUS, RULE_IDS) VALUES ('S_NEW',1.001,'MINOR','DRAFT','[]')");
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='S_NEW' AND VER=1.001")).isEqualTo(1);
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, RULE_IDS) VALUES ('NO_SUCH',1,'DRAFT','[]')"))
                    .hasMessageContaining("FOREIGN KEY");
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_VER (MARU_RULE_SET_ID, VER, STATUS, RULE_IDS) VALUES ('S_NEW',2,'RELEASED','[]')"))
                    .hasMessageContaining("CK_TB_MDM_RULE_SET_VER_APPLY");
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_BAD','x','DRAFT')"))
                    .hasMessageContaining("CK_TB_MDM_RULE_SET_STATUS");
            assertThatThrownBy(() -> s.execute(
                    "INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, INPUT_JSON) VALUES ('NO_SUCH',1,'{}')"))
                    .hasMessageContaining("FOREIGN KEY");

            // CASCADE 없음 — 버전·케이스가 남은 세트는 지울 수 없고, 거부 뒤에도 케이스·버전이 그대로다
            assertThatThrownBy(() -> s.execute("DELETE FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID='S_LINE'"))
                    .hasMessageContaining("FOREIGN KEY");
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID='S_LINE'")).isEqualTo(1);
            assertThat(count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='S_LINE'")).isEqualTo(1);
        }
    }

    private static List<String> applyAndReleased(Statement s, String setId) throws Exception {
        try (ResultSet r = s.executeQuery("SELECT APPLY_FROM, RELEASED_AT FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID='" + setId + "'")) {
            assertThat(r.next()).isTrue();
            return List.of(r.getString(1), r.getString(2));
        }
    }

    private static List<String> fkTargets(Statement s, String table) throws Exception {
        List<String> out = new ArrayList<>();
        try (ResultSet r = s.executeQuery("PRAGMA foreign_key_list(" + table + ")")) {
            while (r.next()) {
                out.add(r.getString("table") + "/" + r.getString("on_delete"));
            }
        }
        return out;
    }

    private static int count(Statement s, String sql) throws Exception {
        try (ResultSet r = s.executeQuery(sql)) {
            r.next();
            return r.getInt(1);
        }
    }

    private static List<String> columns(Statement s, String table) throws Exception {
        List<String> out = new ArrayList<>();
        try (ResultSet r = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (r.next()) {
                out.add(r.getString("name"));
            }
        }
        return out;
    }

    private static String typeOf(Statement s, String table, String column) throws Exception {
        try (ResultSet r = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (r.next()) {
                if (column.equals(r.getString("name"))) {
                    return r.getString("type");
                }
            }
        }
        return null;
    }
}
