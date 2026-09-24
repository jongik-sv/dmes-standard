package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.BUSINESS_DATETIME_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.VERSION_NUMBER_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.auditCounter;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.bin2Columns;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.expectedColumns;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-01 design.md §3.11 — 사용자 결정(도커 금지)으로 MSSQL 실측을 생략하는 대신, 두 방언 V6 파일을 문자열로 읽어
 * 구조를 대조한다(MSSQL DDL 리뷰의 기계 부분). Spring·DB 없이 classpath 리소스만 읽는다.
 *
 * <p><b>파서 전제</b>(V6 파일 작성 모양): 문장은 {@code ;} 로 끝나고 {@code --} 는 줄 주석뿐이며 문자열 리터럴 안에
 * {@code --}·{@code ;} 가 없다. {@code CREATE TABLE 이름 ( … )} 본문은 최상위 쉼표로 칼럼·제약을 나누고, 제약은
 * {@code CONSTRAINT 이름 …} 모양이다. 칼럼 정의는 {@code 이름 타입 [IDENTITY(1,1)] [COLLATE x] [NOT NULL|NULL]
 * [CONSTRAINT DF_x DEFAULT (v) | DEFAULT v] [CONSTRAINT PK_x PRIMARY KEY AUTOINCREMENT]} 모양이다. 전제가 깨지면
 * {@link #파싱_결과가_7테이블과_기대_칼럼_수를_갖는다()} 가 먼저 빨개진다(조용히 통과하지 않는다).
 *
 * <p>한계: 텍스트 대조라 MSSQL 이 DDL 을 실제로 받아들이는지, DATETIME2(0) 반올림, IDENTITY 단조 증가, BIN2 비교 결과
 * 같은 실행 동작은 증명하지 못한다(Verify 의 사람 리뷰 §3.13, 규칙표 #2·#16·#19 MSSQL 열은 실측 필요 유지).
 */
class MdmMasterCodeDialectDdlParityTest {

    private static final String SQLITE_V6 = "db/migration/mdm/sqlite/V6__create_mdm_master_code.sql";
    private static final String MSSQL_V6 = "db/migration/mdm/mssql/V6__create_mdm_master_code.sql";
    private static final String DOMAIN_FK = "FK_TB_MDM_DOMAIN_CODE";
    private static final String BIN2 = "Latin1_General_100_BIN2";

    private static String sqliteText;
    private static String mssqlText;
    private static Ddl sqlite;
    private static Ddl mssql;

    @BeforeAll
    static void parse() throws IOException {
        sqliteText = stripComments(read(SQLITE_V6));
        mssqlText = stripComments(read(MSSQL_V6));
        sqlite = Ddl.parse(sqliteText);
        mssql = Ddl.parse(mssqlText);
    }

    @Test
    void 파싱_결과가_7테이블과_기대_칼럼_수를_갖는다() {
        for (Ddl ddl : List.of(sqlite, mssql)) {
            assertEquals(TABLES, ddl.masterCodeTables().keySet());
            for (String table : TABLES) {
                assertEquals(expectedColumns(table).size(), ddl.tables.get(table).columns.size(),
                        table + " 파싱 칼럼 수 — 파서 전제가 깨졌거나 칼럼이 빠졌다");
            }
        }
    }

    @Test
    void _1_2_두_방언의_표_이름과_칼럼_이름_NOT_NULL_이_같다() {
        for (String table : TABLES) {
            assertEquals(expectedColumns(table), sqlite.tables.get(table).columns.keySet(), "SQLite " + table);
            assertEquals(expectedColumns(table), mssql.tables.get(table).columns.keySet(), "MSSQL " + table);
            assertEquals(sqlite.tables.get(table).notNullColumns(), mssql.tables.get(table).notNullColumns(),
                    table + " NOT NULL 칼럼 집합");
        }
    }

    @Test
    void _3_PK_이름과_칼럼_순서가_같다() {
        for (String table : TABLES) {
            Table s = sqlite.tables.get(table);
            Table m = mssql.tables.get(table);
            assertNotNull(s.pkName, "SQLite " + table + " PK");
            assertEquals("PK_" + table, s.pkName);
            assertEquals(s.pkName, m.pkName, table);
            assertEquals(s.pkColumns, m.pkColumns, table + " PK 칼럼 순서");
        }
    }

    @Test
    void _4_FK_이름과_대상이_같고_FK_TB_MDM_DOMAIN_CODE_를_두_방언_모두_건다() {
        Map<String, String> s = sqlite.masterCodeForeignKeys();
        Map<String, String> m = mssql.masterCodeForeignKeys();
        assertEquals(s, m, "FK 이름 → (자식 칼럼, 부모 표, 부모 칼럼)");
        assertEquals("TB_MDM_DOMAIN(MARU_CODE_ID)->TB_MDM_CODE(MARU_CODE_ID)", m.get(DOMAIN_FK),
                "MSSQL 파일 끝 ALTER 의 FK_TB_MDM_DOMAIN_CODE(D3)");
        assertEquals(m.get(DOMAIN_FK), s.get(DOMAIN_FK), "SQLite 재생성 표 안의 FK_TB_MDM_DOMAIN_CODE(D3)");
        // 7테이블 FK 12개(§6.0.1~6.0.7) + FK_TB_MDM_DOMAIN_CODE — 파서가 FK 를 놓치면 여기서 빨개진다.
        assertEquals(13, s.size(), "FK 파싱 수: " + s.keySet());
    }

    @Test
    void _5_CHECK_이름과_정규화한_식이_같다() {
        for (String table : TABLES) {
            Map<String, String> s = sqlite.tables.get(table).checks;
            Map<String, String> m = mssql.tables.get(table).checks;
            assertEquals(s, m, table + " CHECK 이름 → 정규화 식");
        }
        assertEquals("STATUS='DRAFT'OR(APPLY_FROMISNOTNULLAND(STATUS='REQUESTED'ORAPPLY_TOISNOTNULL))",
                mssql.tables.get("TB_MDM_CODE_VER").checks.get("CK_TB_MDM_CODE_VER_APPLY"), "G3(D4)");
    }

    @Test
    void _6_DEFAULT_칼럼과_기본값이_같다() {
        for (String table : TABLES) {
            assertEquals(sqlite.tables.get(table).defaults(), mssql.tables.get(table).defaults(), table + " DEFAULT");
        }
        assertEquals(Map.of("STATUS", "'CREATED'", "LVL_CNT", "0", "LAST_CHG_SEQ", "0"),
                mssql.tables.get("TB_MDM_CODE").defaults());
        assertEquals(Map.of("STATUS", "'DRAFT'", "EMERGENCY_YN", "'N'", "ROW_VERSION", "0"),
                mssql.tables.get("TB_MDM_CODE_VER").defaults());
        for (String table : List.of("TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM")) {
            assertEquals(Map.of("TO_VER", "9999"), mssql.tables.get(table).defaults(), table);
        }
    }

    @Test
    void _7_두_파일_어디에도_CASCADE_가_없다() {
        for (String text : List.of(sqliteText, mssqlText)) {
            String flat = text.toUpperCase().replaceAll("\\s+", " ");
            assertFalse(flat.contains("ON DELETE CASCADE"), "ON DELETE CASCADE");
            assertFalse(flat.contains("ON UPDATE CASCADE"), "ON UPDATE CASCADE");
            assertFalse(flat.contains("CASCADE"), "CASCADE 키워드");
        }
    }

    @Test
    void _8_MSSQL_BIN2_칼럼이_목록과_정확히_같다() {
        for (String table : TABLES) {
            Set<String> bin2 = new TreeSet<>();
            for (Column col : mssql.tables.get(table).columns.values()) {
                if (BIN2.equals(col.collate)) {
                    bin2.add(col.name);
                }
                if (col.type.startsWith("VARCHAR") && !isAuditColumn(col.name)) {
                    assertEquals(BIN2, col.collate, table + "." + col.name + " 은 BIN2 여야 한다(규칙표 #19)");
                }
            }
            assertEquals(new TreeSet<>(bin2Columns(table)), bin2, table + " BIN2 칼럼(§6.0)");
            for (Column col : sqlite.tables.get(table).columns.values()) {
                assertEquals(null, col.collate, "SQLite 는 COLLATE 를 쓰지 않는다: " + table + "." + col.name);
            }
        }
    }

    @Test
    void _9_MSSQL_타입이_규칙표를_따른다() {
        for (Map.Entry<String, Set<String>> e : VERSION_NUMBER_COLUMNS.entrySet()) {
            for (String column : e.getValue()) {
                assertEquals("DECIMAL(7,3)", mssqlType(e.getKey(), column), e.getKey() + "." + column);
            }
        }
        for (String table : TABLES) {
            assertEquals("BIGINT", mssqlType(table, auditCounter(table)), table + " 감사 카운터");
            assertEquals("DATETIME2", mssqlType(table, "C_AT"), table + ".C_AT");
            assertEquals("DATETIME2", mssqlType(table, "U_AT"), table + ".U_AT");
        }
        assertEquals("BIGINT", mssqlType("TB_MDM_CODE_VER", "ROW_VERSION"), "G2(D5)");
        assertEquals("BIGINT", mssqlType("TB_MDM_CODE", "LAST_CHG_SEQ"));
        assertEquals("BIGINT", mssqlType("TB_MDM_CODE_RECV", "CHG_SEQ"));
        for (Map.Entry<String, Set<String>> e : BUSINESS_DATETIME_COLUMNS.entrySet()) {
            for (String column : e.getValue()) {
                assertEquals("DATETIME2(0)", mssqlType(e.getKey(), column), e.getKey() + "." + column);
            }
        }
        assertEquals("NVARCHAR(MAX)", mssqlType("TB_MDM_CODE_CATE", "DEF_EXPR"), "G4(D6)");
        assertEquals("NVARCHAR(100)", mssqlType("TB_MDM_CODE", "MARU_CODE_NAME"));
        assertEquals("NVARCHAR(100)", mssqlType("TB_MDM_CODE_ITEM", "NAME"));
        assertEquals("NVARCHAR(100)", mssqlType("TB_MDM_CODE_ITEM", "ALTER_NAME"));
        assertEquals("NVARCHAR(100)", mssqlType("TB_MDM_CODE_CATE", "CATE_NAME"));
        for (int i = 1; i <= 10; i++) {
            String n = String.format("%02d", i);
            assertEquals("NVARCHAR(100)", mssqlType("TB_MDM_CODE", "ATTR" + n + "_NAME"));
            assertEquals("NVARCHAR(500)", mssqlType("TB_MDM_CODE_ITEM", "ATTR" + n));
        }
        Column recvId = mssql.tables.get("TB_MDM_CODE_RECV").columns.get("RECV_ID");
        assertEquals("BIGINT", recvId.type);
        assertTrue(recvId.identity, "RECV_ID 는 IDENTITY(1,1) 이어야 한다(규칙표 #2)");
    }

    @Test
    void _10_SQLite_타입이_규칙표를_따른다() {
        for (Map.Entry<String, Set<String>> e : VERSION_NUMBER_COLUMNS.entrySet()) {
            for (String column : e.getValue()) {
                assertEquals("NUMERIC(7,3)", sqlite.tables.get(e.getKey()).columns.get(column).type, e.getKey() + "." + column);
            }
        }
        for (String table : TABLES) {
            assertEquals("BIGINT", sqlite.tables.get(table).columns.get(auditCounter(table)).type, table + " 감사 카운터(G1)");
        }
        assertEquals("BIGINT", sqlite.tables.get("TB_MDM_CODE_VER").columns.get("ROW_VERSION").type, "G2(D5)");
        Column recvId = sqlite.tables.get("TB_MDM_CODE_RECV").columns.get("RECV_ID");
        assertEquals("INTEGER", recvId.type);
        assertTrue(recvId.autoincrement, "RECV_ID 는 AUTOINCREMENT 여야 한다(규칙표 #2)");
    }

    // ── 파서 ──

    private static String mssqlType(String table, String column) {
        Column col = mssql.tables.get(table).columns.get(column);
        assertNotNull(col, table + "." + column);
        return col.type;
    }

    private static boolean isAuditColumn(String name) {
        return name.matches("[CU]_(USR|SVC|PGM)_ID");
    }

    private static String read(String resource) throws IOException {
        try (InputStream in = MdmMasterCodeDialectDdlParityTest.class.getClassLoader().getResourceAsStream(resource)) {
            assertNotNull(in, resource + " 가 classpath 에 없다");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
    }

    private static String stripComments(String text) {
        return text.replaceAll("(?m)--.*$", "");
    }

    /** 식별자 인용({@code "x"}·{@code [x]}·{@code `x`})을 벗긴다. */
    private static String unquote(String identifier) {
        return identifier.trim().replaceAll("[\"\\[\\]`]", "");
    }

    /** CHECK 식 정규화: 인용 벗김·공백 제거·대문자화. */
    private static String normalizeExpr(String expr) {
        return unquote(expr).replaceAll("\\s+", "").toUpperCase();
    }

    private static List<String> columnList(String list) {
        List<String> result = new ArrayList<>();
        for (String part : list.split(",")) {
            result.add(unquote(part));
        }
        return result;
    }

    /** 괄호 깊이와 작은따옴표를 인식해 최상위 구분자에서만 나눈다. */
    private static List<String> splitTopLevel(String text, char separator) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        boolean quoted = false;
        StringBuilder current = new StringBuilder();
        for (char ch : text.toCharArray()) {
            if (ch == '\'') {
                quoted = !quoted;
            } else if (!quoted && ch == '(') {
                depth++;
            } else if (!quoted && ch == ')') {
                depth--;
            }
            if (ch == separator && depth == 0 && !quoted) {
                if (!current.toString().isBlank()) {
                    parts.add(current.toString().trim());
                }
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        if (!current.toString().isBlank()) {
            parts.add(current.toString().trim());
        }
        return parts;
    }

    private static final Pattern CREATE_TABLE = Pattern.compile(
            "^CREATE\\s+TABLE\\s+([\\w\"\\[\\]`]+)\\s*\\((.*)\\)$", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern ALTER_ADD_FK = Pattern.compile(
            "^ALTER\\s+TABLE\\s+(\\S+)\\s+ADD\\s+CONSTRAINT\\s+(\\w+)\\s+FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*"
                    + "REFERENCES\\s+(\\S+)\\s*\\(([^)]*)\\)$", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern TABLE_PK = Pattern.compile(
            "^CONSTRAINT\\s+(\\w+)\\s+PRIMARY\\s+KEY\\s*\\(([^)]*)\\)$", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern TABLE_FK = Pattern.compile(
            "^CONSTRAINT\\s+(\\w+)\\s+FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s*REFERENCES\\s+(\\S+)\\s*\\(([^)]*)\\)$",
            Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern TABLE_CHECK = Pattern.compile(
            "^CONSTRAINT\\s+(\\w+)\\s+CHECK\\s*\\((.*)\\)$", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);
    private static final Pattern COLUMN = Pattern.compile(
            "^([\\w\"\\[\\]`]+)\\s+(\\w+(?:\\s*\\([^)]*\\))?)(.*)$", Pattern.DOTALL);
    private static final Pattern COLLATE = Pattern.compile("COLLATE\\s+(\\w+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEFAULT = Pattern.compile(
            "DEFAULT\\s+(\\(.*\\)|'[^']*'|[-\\w.]+)", Pattern.CASE_INSENSITIVE);
    private static final Pattern INLINE_PK = Pattern.compile(
            "CONSTRAINT\\s+(PK_\\w+)\\s+PRIMARY\\s+KEY", Pattern.CASE_INSENSITIVE);
    private static final Pattern INLINE_CHECK = Pattern.compile(
            "CONSTRAINT\\s+(CK_\\w+)\\s+CHECK\\s*\\((.*)\\)", Pattern.DOTALL | Pattern.CASE_INSENSITIVE);

    private record Column(String name, String type, boolean notNull, String collate, String defaultValue,
                          boolean identity, boolean autoincrement) {
    }

    private static final class Table {
        final Map<String, Column> columns = new LinkedHashMap<>();
        final Map<String, String> checks = new TreeMap<>();
        final Map<String, String> foreignKeys = new TreeMap<>();
        String pkName;
        List<String> pkColumns = List.of();

        /** PK 칼럼은 명시 NOT NULL 이 없어도(SQLite 인라인 PK) NOT NULL 로 본다. */
        Set<String> notNullColumns() {
            Set<String> result = new TreeSet<>(pkColumns);
            columns.values().stream().filter(Column::notNull).forEach(c -> result.add(c.name));
            return result;
        }

        Map<String, String> defaults() {
            Map<String, String> result = new TreeMap<>();
            columns.values().stream().filter(c -> c.defaultValue != null).forEach(c -> result.put(c.name, c.defaultValue));
            return result;
        }
    }

    private static final class Ddl {
        final Map<String, Table> tables = new LinkedHashMap<>();
        /** FK 이름 → "자식(칼럼)->부모(칼럼)". 자식 표 이름은 재생성 임시 이름(_NEW)을 벗긴다. */
        final Map<String, String> foreignKeys = new TreeMap<>();

        static Ddl parse(String text) {
            Ddl ddl = new Ddl();
            for (String statement : splitTopLevel(text, ';')) {
                Matcher create = CREATE_TABLE.matcher(statement);
                if (create.matches()) {
                    String name = unquote(create.group(1));
                    Table table = parseTable(create.group(2));
                    ddl.tables.put(name, table);
                    table.foreignKeys.forEach((fk, target) ->
                            ddl.foreignKeys.put(fk, name.replaceAll("_NEW$", "") + target));
                    continue;
                }
                Matcher alter = ALTER_ADD_FK.matcher(statement);
                if (alter.matches()) {
                    ddl.foreignKeys.put(alter.group(2), unquote(alter.group(1)) + "(" + String.join(",", columnList(alter.group(3)))
                            + ")->" + unquote(alter.group(4)) + "(" + String.join(",", columnList(alter.group(5))) + ")");
                }
            }
            return ddl;
        }

        Map<String, Table> masterCodeTables() {
            Map<String, Table> result = new TreeMap<>();
            tables.forEach((name, table) -> {
                if (name.startsWith("TB_MDM_CODE")) {
                    result.put(name, table);
                }
            });
            return result;
        }

        /** 7테이블의 FK + FK_TB_MDM_DOMAIN_CODE(재생성 표의 기존 FK 는 V3 소유라 제외). */
        Map<String, String> masterCodeForeignKeys() {
            Map<String, String> result = new TreeMap<>();
            foreignKeys.forEach((name, target) -> {
                if (name.startsWith("FK_TB_MDM_CODE") || name.equals(DOMAIN_FK)) {
                    result.put(name, target);
                }
            });
            return result;
        }

        private static Table parseTable(String body) {
            Table table = new Table();
            for (String item : splitTopLevel(body, ',')) {
                Matcher pk = TABLE_PK.matcher(item);
                Matcher fk = TABLE_FK.matcher(item);
                Matcher check = TABLE_CHECK.matcher(item);
                if (pk.matches()) {
                    table.pkName = pk.group(1);
                    table.pkColumns = columnList(pk.group(2));
                } else if (fk.matches()) {
                    table.foreignKeys.put(fk.group(1), "(" + String.join(",", columnList(fk.group(2))) + ")->"
                            + unquote(fk.group(3)) + "(" + String.join(",", columnList(fk.group(4))) + ")");
                } else if (check.matches()) {
                    table.checks.put(check.group(1), normalizeExpr(check.group(2)));
                } else {
                    parseColumn(table, item);
                }
            }
            return table;
        }

        private static void parseColumn(Table table, String item) {
            Matcher m = COLUMN.matcher(item);
            assertTrue(m.matches(), "칼럼 정의를 해석하지 못했다: " + item);
            String name = unquote(m.group(1));
            String type = m.group(2).replaceAll("\\s+", "").toUpperCase();
            String rest = m.group(3);
            String upper = rest.toUpperCase();
            Matcher collate = COLLATE.matcher(rest);
            Matcher dflt = DEFAULT.matcher(rest);
            String defaultValue = null;
            if (dflt.find()) {
                defaultValue = dflt.group(1).trim();
                while (defaultValue.startsWith("(") && defaultValue.endsWith(")")) {
                    defaultValue = defaultValue.substring(1, defaultValue.length() - 1).trim();
                }
            }
            Matcher inlinePk = INLINE_PK.matcher(rest);
            if (inlinePk.find()) {
                table.pkName = inlinePk.group(1);
                table.pkColumns = List.of(name);
            }
            Matcher inlineCheck = INLINE_CHECK.matcher(rest);
            if (inlineCheck.find()) {
                table.checks.put(inlineCheck.group(1), normalizeExpr(inlineCheck.group(2)));
            }
            table.columns.put(name, new Column(name, type, upper.contains("NOT NULL"),
                    collate.find() ? collate.group(1) : null, defaultValue,
                    upper.matches("(?s).*IDENTITY\\s*\\(\\s*1\\s*,\\s*1\\s*\\).*"), upper.contains("AUTOINCREMENT")));
        }
    }
}
