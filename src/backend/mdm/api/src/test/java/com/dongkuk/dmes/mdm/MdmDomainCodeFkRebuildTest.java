package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * TSK-06-01 design.md §3.2 — V9 의 SQLite {@code TB_MDM_DOMAIN} 재생성(D3, §6.0.8)을 데이터가 든 DB 에 적용한다.
 * Spring 컨텍스트 없이 Flyway API 를 직접 부른다. 앱과 같게 외래키 강제를 켠다
 * (F7 이 {@code foreign_keys=ON} 에서만 성립한다).
 *
 * <p>이전 버전은 하드코딩하지 않는다 — 해석된 마이그레이션 중 9 보다 작은 최댓값까지 먼저 적용한다(지금은 V8. 그
 * 사이에 {@code TB_MDM_DOMAIN} 을 바꾸는 버전이 들어오면 A 의 구조 비교가 V9 재생성 DDL 누락을 잡는다). V8 의
 * {@code TB_MDM_RULE_VAR.DOMAIN_ID} FK 도 재생성 뒤 새 표를 가리켜야 한다(A·B_업무기준).
 */
class MdmDomainCodeFkRebuildTest {

    private static final String LOCATION = "classpath:db/migration/mdm/sqlite";
    private static final MigrationVersion V9 = MigrationVersion.fromVersion(MdmMasterCodeExpectations.VERSION);
    private static final Pattern CONSTRAINT_NAME = Pattern.compile("CONSTRAINT\\s+((?:CK|FK|PK)_\\w+)");

    @TempDir
    Path tempDir;

    /** A — 참조 없는 도메인 데이터가 있는 DB: 행·구조·AUTOINCREMENT 상한을 보존하고 FK 하나만 늘린다. */
    @Test
    void A_참조_없는_도메인_행이_있으면_V9_가_행과_구조를_보존하고_FK_하나만_더한다() throws SQLException {
        String url = url("rebuild-a.db");
        migrateTo(url, previousVersion(url));

        long deletedMax;
        Snapshot before;
        String ruleVarSqlBefore;
        Set<String> ruleVarFksBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            exec(c, "INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR) VALUES ('MM', 'LEN', 'MM', 1)");
            insertDomain(c, "길이", "LEN_MM", "QTY", "NUMBER", null, "MM", null);
            insertDomain(c, "예시", "EX_JSON", "QTY", "NUMBER", null, null, "[\"a\",\"b\"]");
            deletedMax = insertDomain(c, "지울행", "DEL_ME", "QTY", "NUMBER", null, null, null);
            exec(c, "DELETE FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = " + deletedMax);
            before = Snapshot.of(c);
            ruleVarSqlBefore = tableSql(c, "TB_MDM_RULE_VAR");
            ruleVarFksBefore = ruleVarForeignKeys(c);
        }
        assertEquals(2, before.domainRows.size());
        assertTrue(ruleVarFksBefore.contains("TB_MDM_DOMAIN(DOMAIN_ID->DOMAIN_ID)"), "V8 의 RULE_VAR→DOMAIN FK 전제: " + ruleVarFksBefore);

        migrateTo(url, null);

        try (Connection c = DriverManager.getConnection(url)) {
            Snapshot after = Snapshot.of(c);
            assertEquals(before.domainRows, after.domainRows, "① 남은 행의 모든 칼럼 값이 그대로여야 한다");
            assertEquals(before.columns, after.columns, "③ 칼럼 정의(이름·타입·NOT NULL·기본값·PK)가 같아야 한다");
            assertEquals(before.indexes, after.indexes, "③ 인덱스가 같아야 한다");
            assertEquals(before.keysAndChecks, after.keysAndChecks, "③ CHECK 이름이 같아야 한다");

            Set<String> expectedFks = new TreeSet<>(before.foreignKeys);
            expectedFks.add("TB_MDM_CODE(MARU_CODE_ID->MARU_CODE_ID)");
            assertEquals(expectedFks, after.foreignKeys, "③ FK 는 FK_TB_MDM_DOMAIN_CODE 하나만 늘어야 한다");
            Set<String> expectedFkNames = new TreeSet<>(before.foreignKeyNames);
            expectedFkNames.add("FK_TB_MDM_DOMAIN_CODE");
            assertEquals(expectedFkNames, after.foreignKeyNames);

            long next = insertDomain(c, "새행", "NEW_ROW", "QTY", "NUMBER", null, null, null);
            assertTrue(next > deletedMax, "② 지운 최댓값 " + deletedMax + " 를 재사용했다(F7-④): " + next);

            assertThrows(SQLException.class,
                    () -> insertDomain(c, "코드", "CODE_NOPE", "CODE", "CHAR", "NOPE", null, null),
                    "④ 없는 코드 ID 는 FK_TB_MDM_DOMAIN_CODE 가 거부해야 한다");

            // ⑤ V8 TB_MDM_RULE_VAR 는 V9 재생성 뒤에도 그대로이고, FK 가 새 TB_MDM_DOMAIN 을 실제로 가리킨다.
            //
            // 단, "그대로" 의 기준은 V9 까지다. D-103 의 V13 이 TB_MDM_RULE_VAR.AXIS 를 떼어 내고(피벗 표현 대체로
            // res_grp·grp_cond 만 남김) 표를 다시 만든다. V9 가 V8 정의에 손대지 않았다는 사실은 ③ 칼럼 비교와
            // FK 목록 비교가 계속 지킨다 — AXIS 한 칸이 빠진 것이 이 테스트의 관심사가 아니기 때문이다.
            // V13 이 표를 다시 만들기 때문에 SQLite 스키마가 표 이름을 큰따옴표로 감싼 형태로 남는다
            // (V8 이 만든 표는 `CREATE TABLE TB_MDM_RULE_VAR (`, V13 이 만든 표는 `CREATE TABLE "TB_MDM_RULE_VAR" (`).
            // 그 차이는 V9 가 아니라 V13 때문에 생겼으므로 비교 전에 정규화한다. 남은 차이가 AXIS 한 칸과 그 CHECK 뿐이어야 한다.
            String withoutAxis = ruleVarSqlBefore
                    .replace("CREATE TABLE TB_MDM_RULE_VAR (", "CREATE TABLE \"TB_MDM_RULE_VAR\" (")
                    .replace("    AXIS VARCHAR(20),\n", "")
                    .replace("    CONSTRAINT CK_TB_MDM_RULE_VAR_AXIS CHECK (AXIS IS NULL OR AXIS IN ('ROW','COL','NONE')),\n", "");
            assertEquals(withoutAxis, tableSql(c, "TB_MDM_RULE_VAR"),
                    "⑤ RULE_VAR 는 V13 이 표 이름 인용·AXIS 한 칸·그 CHECK 만 달라야 한다");
            assertEquals(ruleVarFksBefore, ruleVarForeignKeys(c), "⑤ RULE_VAR FK 목록이 바뀌었다");
            seedRuleVer(c, "RULE_A");
            insertRuleVar(c, "RULE_A", 1, next);
            assertThrows(SQLException.class, () -> insertRuleVar(c, "RULE_A", 2, next + 1000),
                    "⑤ 없는 도메인을 가리키는 RULE_VAR 는 FK_TB_MDM_RULE_VAR_DOMAIN 이 거부해야 한다");
            assertEquals(Set.of(), column(c, "SELECT \"table\" || '->' || parent FROM pragma_foreign_key_check"),
                    "⑤ foreign_key_check 위반이 있다");
        }
    }

    /**
     * B — 도메인을 참조하는 행(자식 도메인·컬럼)이 있는 DB: 재생성의 DROP 이 FK 위반으로 실패하고(F7-②) 한 트랜잭션이라
     * 부분 적용이 남지 않는다(불변 규칙 20).
     */
    @Test
    void B_참조_행이_있으면_V9_는_실패하고_부분_적용이_남지_않는다() throws SQLException {
        String url = url("rebuild-b.db");
        migrateTo(url, previousVersion(url));

        Snapshot before;
        String domainSqlBefore;
        String columnSqlBefore;
        List<Map<String, Object>> columnRowsBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            long parent = insertDomain(c, "부모", "PARENT_D", "QTY", "NUMBER", null, null, null);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE) "
                            + "VALUES ('자식', 'CHILD_D', ?, 'FLAG', 'CHAR')")) {
                ps.setLong(1, parent);
                ps.executeUpdate();
            }
            exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('컬럼', 'COL_P', " + parent + ")");
            before = Snapshot.of(c);
            domainSqlBefore = tableSql(c, "TB_MDM_DOMAIN");
            columnSqlBefore = tableSql(c, "TB_MDM_COLUMN");
            columnRowsBefore = rows(c, "SELECT * FROM TB_MDM_COLUMN ORDER BY COLUMN_ID");
        }

        assertThrows(FlywayException.class, () -> migrateTo(url, null), "참조 행이 있는 DB 에서 V9 는 실패해야 한다(F7-②)");

        try (Connection c = DriverManager.getConnection(url)) {
            Set<String> tables = column(c, "SELECT name FROM sqlite_master WHERE type = 'table'");
            assertFalse(tables.contains("TB_MDM_CODE"), "실패한 V9 의 TB_MDM_CODE 가 남았다(부분 적용)");
            assertFalse(tables.contains("TB_MDM_DOMAIN_NEW"), "재생성 임시 표가 남았다(부분 적용)");
            Snapshot after = Snapshot.of(c);
            assertEquals(before.domainRows, after.domainRows);
            assertEquals(before.foreignKeys, after.foreignKeys);
            assertEquals(domainSqlBefore, tableSql(c, "TB_MDM_DOMAIN"));
            assertEquals(columnSqlBefore, tableSql(c, "TB_MDM_COLUMN"));
            assertEquals(columnRowsBefore, rows(c, "SELECT * FROM TB_MDM_COLUMN ORDER BY COLUMN_ID"));
            assertEquals(Set.of(), column(c, "SELECT version FROM flyway_schema_history WHERE version = '"
                    + MdmMasterCodeExpectations.VERSION + "' AND success = 1"), "V9 success 행이 기록됐다");
        }
    }

    /** B_업무기준 — 도메인을 참조하는 것이 V8 {@code TB_MDM_RULE_VAR} 한 행뿐이어도 V9 는 실패하고 부분 적용이 남지 않는다. */
    @Test
    void B_업무기준_변수만_도메인을_참조해도_V9_는_실패하고_부분_적용이_남지_않는다() throws SQLException {
        String url = url("rebuild-b-rule.db");
        migrateTo(url, previousVersion(url));

        Snapshot before;
        String ruleVarSqlBefore;
        List<Map<String, Object>> ruleVarRowsBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            long domain = insertDomain(c, "변수", "VAR_D", "QTY", "NUMBER", null, null, null);
            seedRuleVer(c, "RULE_B");
            insertRuleVar(c, "RULE_B", 1, domain);
            before = Snapshot.of(c);
            ruleVarSqlBefore = tableSql(c, "TB_MDM_RULE_VAR");
            ruleVarRowsBefore = rows(c, "SELECT * FROM TB_MDM_RULE_VAR ORDER BY VAR_ID");
        }

        FlywayException failure = assertThrows(FlywayException.class, () -> migrateTo(url, null),
                "RULE_VAR 가 참조하는 DB 에서 V9 는 실패해야 한다(F7-②)");
        assertTrue(failure.getMessage().contains("FOREIGN KEY"), "실패 원인이 FK 위반이 아니다: " + failure.getMessage());

        try (Connection c = DriverManager.getConnection(url)) {
            Set<String> tables = column(c, "SELECT name FROM sqlite_master WHERE type = 'table'");
            assertFalse(tables.contains("TB_MDM_CODE"), "실패한 V9 의 TB_MDM_CODE 가 남았다(부분 적용)");
            assertFalse(tables.contains("TB_MDM_DOMAIN_NEW"), "재생성 임시 표가 남았다(부분 적용)");
            Snapshot after = Snapshot.of(c);
            assertEquals(before.domainRows, after.domainRows);
            assertEquals(before.foreignKeys, after.foreignKeys);
            assertEquals(ruleVarSqlBefore, tableSql(c, "TB_MDM_RULE_VAR"));
            assertEquals(ruleVarRowsBefore, rows(c, "SELECT * FROM TB_MDM_RULE_VAR ORDER BY VAR_ID"), "RULE_VAR 행이 바뀌었다");
            assertEquals(Set.of(), column(c, "SELECT version FROM flyway_schema_history WHERE version = '"
                    + MdmMasterCodeExpectations.VERSION + "' AND success = 1"), "V9 success 행이 기록됐다");
        }
    }

    // ── 도우미 ──

    private String url(String file) {
        return "jdbc:sqlite:" + tempDir.resolve(file) + "?foreign_keys=true";
    }

    private static Flyway flyway(String url, MigrationVersion target) {
        var config = Flyway.configure().dataSource(url, "", "").locations(LOCATION);
        if (target != null) {
            config.target(target);
        }
        return config.load();
    }

    private static void migrateTo(String url, MigrationVersion target) {
        flyway(url, target).migrate();
    }

    /** 해석된 마이그레이션 중 V9 보다 작은 최댓값(지금은 8). */
    private static MigrationVersion previousVersion(String url) {
        MigrationVersion previous = null;
        for (MigrationInfo info : flyway(url, null).info().all()) {
            MigrationVersion v = info.getVersion();
            if (v != null && v.compareTo(V9) < 0 && (previous == null || v.compareTo(previous) > 0)) {
                previous = v;
            }
        }
        assertNotNull(previous, "V9 앞 버전을 찾지 못했다");
        return previous;
    }

    private static long insertDomain(Connection c, String name, String stdName, String kind, String dataType,
            String maruCodeId, String unitCode, String examples) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID, UNIT_CODE, EXAMPLES) "
                        + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, name);
            ps.setString(2, stdName);
            ps.setString(3, kind);
            ps.setString(4, dataType);
            ps.setString(5, maruCodeId);
            ps.setString(6, unitCode);
            ps.setString(7, examples);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                assertTrue(keys.next());
                return keys.getLong(1);
            }
        }
    }

    /** V8 업무기준 부모 두 행(RULE·DRAFT RULE_VER 1) — RULE_VAR 를 넣기 위한 seed-only 전제. */
    private static void seedRuleVer(Connection c, String ruleId) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('" + ruleId
                + "', '기준', 'DECISION', 'MDM')");
        exec(c, "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES ('" + ruleId + "', 1)");
    }

    private static void insertRuleVar(Connection c, String ruleId, int varId, long domainId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DOMAIN_ID, SEQ) VALUES (?, 1, ?, 'COND', ?, ?)")) {
            ps.setString(1, ruleId);
            ps.setInt(2, varId);
            ps.setLong(3, domainId);
            ps.setInt(4, varId);
            ps.executeUpdate();
        }
    }

    private static Set<String> ruleVarForeignKeys(Connection c) throws SQLException {
        return column(c, "SELECT \"table\" || '(' || \"from\" || '->' || \"to\" || ')' FROM pragma_foreign_key_list('TB_MDM_RULE_VAR')");
    }

    private static void exec(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.executeUpdate(sql);
        }
    }

    private static Set<String> column(Connection c, String sql) throws SQLException {
        Set<String> values = new TreeSet<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                values.add(rs.getString(1));
            }
        }
        return values;
    }

    private static List<Map<String, Object>> rows(Connection c, String sql) throws SQLException {
        List<Map<String, Object>> result = new ArrayList<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            ResultSetMetaData meta = rs.getMetaData();
            while (rs.next()) {
                Map<String, Object> row = new LinkedHashMap<>();
                for (int i = 1; i <= meta.getColumnCount(); i++) {
                    row.put(meta.getColumnName(i), rs.getObject(i));
                }
                result.add(row);
            }
        }
        return result;
    }

    private static String tableSql(Connection c, String table) throws SQLException {
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
            assertTrue(rs.next(), table + " 가 없다");
            return rs.getString(1);
        }
    }

    /** V9 전후 비교용 TB_MDM_DOMAIN 모습. */
    private record Snapshot(List<Map<String, Object>> domainRows, List<String> columns, Set<String> indexes,
                            Set<String> keysAndChecks, Set<String> foreignKeys, Set<String> foreignKeyNames) {

        static Snapshot of(Connection c) throws SQLException {
            List<String> columns = new ArrayList<>();
            try (Statement s = c.createStatement();
                 ResultSet rs = s.executeQuery("SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('TB_MDM_DOMAIN')")) {
                while (rs.next()) {
                    columns.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getInt(3) + "|" + rs.getString(4)
                            + "|" + rs.getInt(5));
                }
            }
            Set<String> indexes = column(c, "SELECT name || '|' || \"unique\" || '|' || partial FROM pragma_index_list('TB_MDM_DOMAIN')");
            Set<String> foreignKeys = column(c,
                    "SELECT \"table\" || '(' || \"from\" || '->' || \"to\" || ')' FROM pragma_foreign_key_list('TB_MDM_DOMAIN')");
            Set<String> keysAndChecks = new TreeSet<>();
            Set<String> fkNames = new TreeSet<>();
            Matcher m = CONSTRAINT_NAME.matcher(tableSql(c, "TB_MDM_DOMAIN"));
            while (m.find()) {
                String name = m.group(1);
                if (name.startsWith("CK_") || name.startsWith("PK_")) {
                    keysAndChecks.add(name);
                } else {
                    fkNames.add(name);
                }
            }
            Set<String> ordered = new LinkedHashSet<>(columns);
            assertEquals(columns.size(), ordered.size());
            return new Snapshot(rows(c, "SELECT * FROM TB_MDM_DOMAIN ORDER BY DOMAIN_ID"), columns, indexes, keysAndChecks,
                    foreignKeys, fkNames);
        }
    }
}
