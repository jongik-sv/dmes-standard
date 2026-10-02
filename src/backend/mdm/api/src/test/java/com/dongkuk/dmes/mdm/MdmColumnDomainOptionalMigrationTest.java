package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.flywaydb.core.api.MigrationVersion;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * D-141 — V16 이 {@code TB_MDM_COLUMN.DOMAIN_ID} 의 NOT NULL 만 풀고 나머지(행·인덱스·제약·FK·AUTOINCREMENT 상한, 자식 표의 FK)는
 * 그대로 두는지 데이터가 든 DB 에 적용해 확인한다. 자식 행({@code TB_MDM_COLUMN_SYSTEM}·{@code TB_MDM_LAYOUT_ITEM})이 있어도
 * 성공해야 한다 — 로컬 DB 에는 컬럼 7천여 건과 그 매핑이 있다. 앱과 같게 외래키 강제를 켠다.
 */
class MdmColumnDomainOptionalMigrationTest {

    private static final String LOCATION = "classpath:db/migration/mdm/sqlite";
    private static final MigrationVersion V16 = MigrationVersion.fromVersion("16");

    @TempDir
    Path tempDir;

    @Test
    void 자식_행이_있어도_V16_은_DOMAIN_ID_NOT_NULL_만_풀고_나머지를_보존한다() throws SQLException {
        String url = "jdbc:sqlite:" + tempDir.resolve("column-domain-optional.db") + "?foreign_keys=true";
        migrateTo(url, previousVersion(url));

        long deletedMax;
        List<Map<String, Object>> rowsBefore;
        List<String> columnsBefore;
        Set<String> indexesBefore;
        Set<String> fksBefore;
        String sqlBefore;
        Set<String> childFksBefore;
        List<Map<String, Object>> childRowsBefore;
        try (Connection c = DriverManager.getConnection(url)) {
            exec(c, "INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH) "
                    + "VALUES (1, '코드', 'CD', 'TEXT', 'CHAR', 10)");
            exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_ID, COLUMN_NAME, PHYS_NAME, DOMAIN_ID, TERM_IDS, REQUIRED, USAGE_NOTE) "
                    + "VALUES (10, '강종 코드', 'STLGRD_CD', 1, '[3,4]', 1, '메모')");
            exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_ID, COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (11, '코일 번호', 'COIL_NO', 1)");
            exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_ID, COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (12, '지울 행', 'DEL_ME', 1)");
            exec(c, "DELETE FROM TB_MDM_COLUMN WHERE COLUMN_ID = 12");
            deletedMax = 12;
            exec(c, "INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (10, 'ERP', 'STL_GRD')");
            exec(c, "INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME) VALUES (1, 'MESSAGE', '전문')");
            exec(c, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS) VALUES (1, 1, 'DATA', 'COIL_NO')");

            assertThrows(SQLException.class,
                    () -> exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME) VALUES ('도메인 없음', 'NO_DOMAIN_OLD')"),
                    "전제: V16 앞에서는 DOMAIN_ID 가 NOT NULL 이다");

            rowsBefore = rows(c, "SELECT * FROM TB_MDM_COLUMN ORDER BY COLUMN_ID");
            columnsBefore = tableInfo(c);
            indexesBefore = indexes(c);
            fksBefore = foreignKeys(c, "TB_MDM_COLUMN");
            sqlBefore = tableSql(c, "TB_MDM_COLUMN");
            childFksBefore = new TreeSet<>(foreignKeys(c, "TB_MDM_COLUMN_SYSTEM"));
            childFksBefore.addAll(foreignKeys(c, "TB_MDM_LAYOUT_ITEM"));
            childRowsBefore = rows(c, "SELECT COLUMN_ID, SYSTEM_CODE, PHYS_NAME FROM TB_MDM_COLUMN_SYSTEM");
            childRowsBefore.addAll(rows(c, "SELECT LAYOUT_ID, SEQ, COLUMN_PHYS FROM TB_MDM_LAYOUT_ITEM"));
        }

        migrateTo(url, null);

        try (Connection c = DriverManager.getConnection(url)) {
            assertEquals(rowsBefore, rows(c, "SELECT * FROM TB_MDM_COLUMN ORDER BY COLUMN_ID"), "① 행의 모든 칼럼 값이 그대로여야 한다");

            List<String> expectedColumns = new ArrayList<>();
            for (String col : columnsBefore) {
                expectedColumns.add(col.startsWith("DOMAIN_ID|") ? col.replace("DOMAIN_ID|INTEGER|1|", "DOMAIN_ID|INTEGER|0|") : col);
            }
            assertTrue(columnsBefore.stream().anyMatch(col -> col.startsWith("DOMAIN_ID|INTEGER|1|")), columnsBefore.toString());
            assertEquals(expectedColumns, tableInfo(c), "② DOMAIN_ID 의 NOT NULL 만 풀리고 칼럼 정의·순서는 같아야 한다");
            assertEquals(indexesBefore, indexes(c), "③ 인덱스가 같아야 한다");
            assertEquals(fksBefore, foreignKeys(c, "TB_MDM_COLUMN"), "③ FK(FK_TB_MDM_COLUMN_DOMAIN)가 남아야 한다");
            String sqlAfter = tableSql(c, "TB_MDM_COLUMN");
            assertEquals(sqlBefore.replace("DOMAIN_ID INTEGER NOT NULL,", "DOMAIN_ID INTEGER,"), sqlAfter,
                    "③ 표 정의는 DOMAIN_ID 의 NOT NULL 한 곳만 달라야 한다(제약 이름 그대로)");
            assertTrue(sqlAfter.contains("CONSTRAINT FK_TB_MDM_COLUMN_DOMAIN FOREIGN KEY"), sqlAfter);

            Set<String> childFksAfter = new TreeSet<>(foreignKeys(c, "TB_MDM_COLUMN_SYSTEM"));
            childFksAfter.addAll(foreignKeys(c, "TB_MDM_LAYOUT_ITEM"));
            assertEquals(childFksBefore, childFksAfter, "④ 자식 표의 FK 가 그대로여야 한다");
            List<Map<String, Object>> childRowsAfter = rows(c, "SELECT COLUMN_ID, SYSTEM_CODE, PHYS_NAME FROM TB_MDM_COLUMN_SYSTEM");
            childRowsAfter.addAll(rows(c, "SELECT LAYOUT_ID, SEQ, COLUMN_PHYS FROM TB_MDM_LAYOUT_ITEM"));
            assertEquals(childRowsBefore, childRowsAfter, "④ 자식 행이 그대로여야 한다");
            assertEquals(Set.of(), column(c, "SELECT \"table\" || '->' || parent FROM pragma_foreign_key_check"),
                    "④ foreign_key_check 위반이 있다");
            assertEquals(Set.of(), column(c, "SELECT name FROM sqlite_master WHERE name LIKE 'TB_MDM_COLUMN_V16%'"),
                    "임시 표가 남았다");

            exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME) VALUES ('도메인 없음', 'NO_DOMAIN')");
            long next = single(c, "SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'NO_DOMAIN'");
            assertTrue(next > deletedMax, "⑤ 지운 최댓값 " + deletedMax + " 를 재사용했다: " + next);
            assertEquals(Set.of(), column(c, "SELECT DOMAIN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = 'NO_DOMAIN' AND DOMAIN_ID IS NOT NULL"));

            assertThrows(SQLException.class,
                    () -> exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('없는 도메인', 'BAD_DOMAIN', 999)"),
                    "⑥ 없는 도메인은 FK_TB_MDM_COLUMN_DOMAIN 이 거부해야 한다");
            assertThrows(SQLException.class,
                    () -> exec(c, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS) VALUES (1, 2, 'DATA', 'NOPE')"),
                    "⑥ 없는 물리명은 FK_TB_MDM_LAYOUT_ITEM_COLUMN 이 거부해야 한다");
            assertThrows(SQLException.class,
                    () -> exec(c, "INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (999, 'ERP', 'X')"),
                    "⑥ 없는 컬럼은 FK_TB_MDM_COLUMN_SYSTEM_COLUMN 이 거부해야 한다");
            exec(c, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS) VALUES (1, 2, 'DATA', 'NO_DOMAIN')");
            assertThrows(SQLException.class,
                    () -> exec(c, "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME) VALUES ('코일 번호', 'COIL_NO_2')"),
                    "⑥ UX_TB_MDM_COLUMN_NAME 이 같은 논리명을 거부해야 한다");
        }
    }

    // ── 도우미 ──

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

    /** 해석된 마이그레이션 중 V16 보다 작은 최댓값. */
    private static MigrationVersion previousVersion(String url) {
        MigrationVersion previous = null;
        boolean hasV16 = false;
        for (MigrationInfo info : flyway(url, null).info().all()) {
            MigrationVersion v = info.getVersion();
            if (v == null) {
                continue;
            }
            hasV16 |= v.equals(V16);
            if (v.compareTo(V16) < 0 && (previous == null || v.compareTo(previous) > 0)) {
                previous = v;
            }
        }
        assertTrue(hasV16, "V16 마이그레이션이 없다");
        assertNotNull(previous, "V16 앞 버전을 찾지 못했다");
        return previous;
    }

    private static List<String> tableInfo(Connection c) throws SQLException {
        List<String> columns = new ArrayList<>();
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT name, type, \"notnull\", dflt_value, pk FROM pragma_table_info('TB_MDM_COLUMN')")) {
            while (rs.next()) {
                columns.add(rs.getString(1) + "|" + rs.getString(2) + "|" + rs.getInt(3) + "|" + rs.getString(4) + "|" + rs.getInt(5));
            }
        }
        return columns;
    }

    private static Set<String> indexes(Connection c) throws SQLException {
        return column(c, "SELECT il.name || '|' || il.\"unique\" || '|' || il.partial || '|' || "
                + "(SELECT group_concat(name, ',') FROM pragma_index_info(il.name)) FROM pragma_index_list('TB_MDM_COLUMN') il");
    }

    private static Set<String> foreignKeys(Connection c, String table) throws SQLException {
        return column(c, "SELECT '" + table + ":' || \"table\" || '(' || \"from\" || '->' || coalesce(\"to\", '') || ')' || on_delete "
                + "FROM pragma_foreign_key_list('" + table + "')");
    }

    private static String tableSql(Connection c, String table) throws SQLException {
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
            assertTrue(rs.next(), table + " 가 없다");
            return rs.getString(1);
        }
    }

    private static long single(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next(), sql);
            return rs.getLong(1);
        }
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
}
