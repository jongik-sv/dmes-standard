package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/** V17: 룰 버전 칼럼 NUMERIC(7,3) + VER_KIND. 정수 데이터가 있는 V16 DB 에 적용해 보존·FK·CASCADE 를 확인한다. */
class MdmRuleVersionDecimalMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    @Test
    void integerVersionsBecomeMajorDecimalsAndChildrenSurvive() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "16").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND) VALUES ('R1','r','DECISION','INUSE','MDM')");
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER, APPLY_FROM, APPLY_TO) VALUES ('R1',1,'RELEASED',NULL,'2026-01-01 00:00:00','2026-02-01 00:00:00')");
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, BASE_VER) VALUES ('R1',2,'DRAFT',1)");
            s.execute("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, SEQ) VALUES ('R1',2,1,'COND',1)");
            s.execute("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, ROW_KIND, CELLS) VALUES ('R1',2,1,'NORMAL','{}')");
            s.execute("INSERT INTO TB_MDM_RULE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY, VER) VALUES ('MDM','VERSION','2026-01-01 00:00:00','{}',3)");
        }
        flyway(url, "17").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            ResultSet r = s.executeQuery("SELECT CAST(VER AS VARCHAR(40)), VER_KIND, CAST(BASE_VER AS VARCHAR(40)) FROM TB_MDM_RULE_VER ORDER BY VER");
            assertTrue(r.next());
            assertEquals(0, new BigDecimal("1.000").compareTo(new BigDecimal(r.getString(1))));
            assertEquals("MAJOR", r.getString(2));
            assertTrue(r.next());
            assertEquals(0, new BigDecimal("2.000").compareTo(new BigDecimal(r.getString(1))));
            assertEquals(0, new BigDecimal("1.000").compareTo(new BigDecimal(r.getString(3))));
            r.close();
            assertEquals(1, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID='R1'"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID='R1'"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_RECV WHERE VER = 3"));
            try (ResultSet fk = s.executeQuery("PRAGMA foreign_key_check")) {
                assertFalse(fk.next());
            }
            // 자식 FK 가 최종 이름의 부모를 가리키고 임시 표 이름이 남지 않는다
            assertEquals(2, count(s, "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%REFERENCES TB_MDM_RULE_VER (%' AND name IN ('TB_MDM_RULE_VAR','TB_MDM_RULE_ROW')"));
            assertEquals(0, count(s, "SELECT COUNT(*) FROM sqlite_master WHERE sql LIKE '%_NEW%' OR sql LIKE '%_BAK%' OR name LIKE '%_BAK'"));
            // minor 버전 저장·자식 FK·CASCADE 가 그대로 동작한다
            s.execute("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, VER_KIND, STATUS, BASE_VER) VALUES ('R1',2.001,'MINOR','DRAFT',2)");
            s.execute("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, SEQ) VALUES ('R1',2.001,1,'COND',1)");
            assertEquals(1, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE VER=2.001"));
            s.execute("DELETE FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID='R1' AND VER=2.001");
            assertEquals(0, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE VER=2.001"));
            assertEquals(1, count(s, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE VER=2"));
            assertEquals("NUMERIC(7,3)", typeOf(s, "TB_MDM_RULE_VER", "VER"));
            assertEquals("NUMERIC(7,3)", typeOf(s, "TB_MDM_RULE_VER", "BASE_VER"));
            assertEquals("NUMERIC(7,3)", typeOf(s, "TB_MDM_RULE_VAR", "VER"));
            assertEquals("NUMERIC(7,3)", typeOf(s, "TB_MDM_RULE_ROW", "VER"));
            assertEquals("NUMERIC(7,3)", typeOf(s, "TB_MDM_RULE_RECV", "VER"));
        }
    }

    private static int count(Statement s, String sql) throws Exception {
        try (ResultSet r = s.executeQuery(sql)) {
            r.next();
            return r.getInt(1);
        }
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
