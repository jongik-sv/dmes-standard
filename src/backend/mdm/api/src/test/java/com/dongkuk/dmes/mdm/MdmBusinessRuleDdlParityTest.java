package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.AUD_VER_TABLES;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.CASCADE_FKS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.JSON_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.NULLABLE_JSON_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.jsonCheckName;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.fail;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-01 design.md §3.2 — docker 없는 두 방언 V8 DDL 대조(사용자 결정: 도커 금지로 MSSQL 실측 생략, DDL 리뷰로 대체).
 *
 * <p>스프링을 띄우지 않는다. 클래스패스의 {@code db/migration/mdm/{sqlite,mssql}/V8__create_mdm_business_rule.sql} 을
 * 정규식 + 괄호 깊이 기반 분할로 읽어 구조(P1~P8)·타입 쌍(P9)·JSON CHECK(P10)·MSSQL 전용 규칙(P11~P16)을 대조한다.
 * FK 대상 타입 확인(P13)을 위해 {@code mssql/V2}·{@code mssql/V3} 의 CREATE TABLE 도 읽는다.
 *
 * <p>한계: 이 파서는 T-SQL 문법의 정당성 자체를 증명하지 못한다. 그 부분은 design.md §3.3 사람 체크리스트가 맡는다.
 */
class MdmBusinessRuleDdlParityTest {

    private static final String BIN2 = "LATIN1_GENERAL_100_BIN2";
    private static final Set<String> AUDIT_TEXT = Set.of(
            "C_USR_ID", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_SVC_ID", "U_PGM_ID");
    private static final Set<String> AUDIT_TIME = Set.of("C_AT", "U_AT");
    private static final Set<String> BUSINESS_TIME = Set.of(
            "APPLY_FROM", "APPLY_TO", "REQUESTED_AT", "APPROVED_AT", "RELEASED_AT", "CANCELLED_AT", "RECEIVED_AT",
            "PROCESSED_AT");
    private static final Set<String> FREE_TEXT = Set.of(
            "DESCRIPTION", "USAGE_NOTE", "EMERGENCY_REASON", "REJECT_REASON", "CANCEL_REASON", "NOTE", "BODY",
            "RESULT_DETAIL", "VAR_AST", "PRIO_LIST", "GRP_COND_AST", "CELLS", "INPUT_JSON", "EXPECTED_JSON", "RULE_IDS");
    private static final Set<String> NAMES = Set.of("MARU_RULE_NAME", "MARU_RULE_SET_NAME", "LABEL", "CASE_NAME");
    private static final Set<String> INTEGERS = Set.of(
            "BASE_VER", "VAR_ID", "ROW_ID", "CASE_ID", "SEQ", "LAST_VAR_ID", "LAST_ROW_ID", "LAST_CASE_ID");

    private static Map<String, Table> sqlite;
    private static Map<String, Table> mssql;
    private static Map<String, Table> mssqlReferenced;
    private static String sqliteText;
    private static String mssqlText;

    @BeforeAll
    static void parse() {
        sqliteText = stripComments(resource("db/migration/mdm/sqlite/V8__create_mdm_business_rule.sql"));
        mssqlText = stripComments(resource("db/migration/mdm/mssql/V8__create_mdm_business_rule.sql"));
        sqlite = parseStrict(sqliteText, "sqlite");
        mssql = parseStrict(mssqlText, "mssql");
        mssqlReferenced = new LinkedHashMap<>();
        for (String earlier : List.of("V2__create_mdm_system.sql", "V3__create_mdm_term_domain_column.sql")) {
            mssqlReferenced.putAll(parseTablesOnly(stripComments(resource("db/migration/mdm/mssql/" + earlier))));
        }
        mssqlReferenced.putAll(mssql);
    }

    // ── P1~P8: 두 방언 구조 동일 ──

    @Test
    void P1_테이블_집합이_같고_8개다() {
        assertEquals(TABLES, List.copyOf(sqlite.keySet()), "SQLite 테이블(파일 순서)");
        assertEquals(new TreeSet<>(TABLES), new TreeSet<>(mssql.keySet()), "MSSQL 테이블 집합");
    }

    @Test
    void P2_테이블마다_칼럼_이름_목록이_순서까지_같다() {
        for (String table : TABLES) {
            assertEquals(expectedColumns(table), sqlite.get(table).columnNames(), "SQLite " + table);
            assertEquals(expectedColumns(table), table(mssql, table).columnNames(), "MSSQL " + table);
        }
    }

    @Test
    void P3_칼럼마다_NOT_NULL_여부가_같다() {
        for (String table : TABLES) {
            for (Column s : sqlite.get(table).columns.values()) {
                Column m = column(mssql, table, s.name);
                assertEquals(s.notNull, m.notNull, table + "." + s.name + " NOT NULL 여부");
            }
        }
    }

    @Test
    void P4_PK_이름과_칼럼이_같다() {
        for (String table : TABLES) {
            Constraint s = sqlite.get(table).single("PK");
            Constraint m = table(mssql, table).single("PK");
            assertEquals("PK_" + table, s.name);
            assertEquals(s.describe(), m.describe(), table + " PK");
        }
    }

    @Test
    void P5_FK_가_같고_CASCADE_는_두_FK_뿐이다() {
        for (String table : TABLES) {
            assertEquals(sqlite.get(table).describeAll("FK"), table(mssql, table).describeAll("FK"), table + " FK");
        }
        for (Map<String, Table> dialect : List.of(sqlite, mssql)) {
            Set<String> cascades = new TreeSet<>();
            dialect.values().forEach(t -> t.all("FK").stream().filter(fk -> fk.cascade).forEach(fk -> cascades.add(fk.name)));
            assertEquals(new TreeSet<>(CASCADE_FKS), cascades, "ON DELETE CASCADE FK 집합");
        }
    }

    @Test
    void P6_UX_이름_칼럼_WHERE_가_같다() {
        for (String table : TABLES) {
            assertEquals(sqlite.get(table).describeAll("UX"), table(mssql, table).describeAll("UX"), table + " UX");
        }
        assertEquals(3, sqlite.values().stream().mapToLong(t -> t.all("UX").size()).sum(), "UX 는 3개다");
    }

    @Test
    void P7_CK_이름_집합이_같고_JSON_을_뺀_CK_본문도_같다() {
        for (String table : TABLES) {
            Map<String, String> s = checks(sqlite.get(table));
            Map<String, String> m = checks(table(mssql, table));
            assertEquals(s.keySet(), m.keySet(), table + " CK 이름 집합");
            for (String name : s.keySet()) {
                if (!name.endsWith("_JSON")) {
                    assertEquals(s.get(name), m.get(name), table + "." + name + " 본문");
                }
            }
        }
    }

    @Test
    void P8_DEFAULT_칼럼과_리터럴이_같다() {
        for (String table : TABLES) {
            assertEquals(defaults(sqlite.get(table)), defaults(table(mssql, table)), table + " DEFAULT");
        }
    }

    // ── P9~P10: 타입 쌍·JSON CHECK ──

    @Test
    void P9_칼럼마다_SQLite_MSSQL_타입_쌍이_허용_목록_안에_있다() {
        for (String table : TABLES) {
            for (Column s : sqlite.get(table).columns.values()) {
                Column m = column(mssql, table, s.name);
                String[] expected = expectedTypes(table, s.name, s.type);
                assertEquals(expected[0], s.fullType(), "SQLite " + table + "." + s.name);
                assertEquals(expected[1], m.fullType(), "MSSQL " + table + "." + s.name);
            }
        }
    }

    @Test
    void P10_JSON_CHECK_가_정확히_7칼럼에_방언별_함수로_있다() {
        for (String dialectName : List.of("sqlite", "mssql")) {
            Map<String, Table> dialect = dialectName.equals("sqlite") ? sqlite : mssql;
            Set<String> found = new TreeSet<>();
            for (Table t : dialect.values()) {
                for (Constraint ck : t.all("CK")) {
                    if (ck.body.contains("JSON_VALID") || ck.body.contains("ISJSON")) {
                        found.add(ck.name);
                    }
                }
            }
            Set<String> expectedNames = new TreeSet<>();
            JSON_COLUMNS.forEach((table, columns) -> columns.forEach(col -> expectedNames.add(jsonCheckName(table, col))));
            assertEquals(expectedNames, found, dialectName + " JSON CHECK 이름 집합");

            JSON_COLUMNS.forEach((table, columns) -> columns.forEach(col -> {
                Constraint ck = dialect.get(table).byName(jsonCheckName(table, col));
                assertNotNull(ck, dialectName + " " + jsonCheckName(table, col));
                boolean nullable = NULLABLE_JSON_COLUMNS.contains(col);
                assertEquals(!nullable, dialect.get(table).columns.get(col).notNull, table + "." + col + " NULL 허용");
                String call = dialectName.equals("sqlite") ? "json_valid(" + col + ")" : "ISJSON(" + col + ") = 1";
                assertEquals(normalizeExpr(nullable ? col + " IS NULL OR " + call : call), ck.body, dialectName + " " + ck.name);
            }));
        }
    }

    // ── P11~P16: MSSQL 전용 규칙 ──

    @Test
    void P11_MSSQL_PK_UX_FK_키_칼럼에_MAX_타입이_없다() {
        for (Table t : mssql.values()) {
            for (Constraint key : t.keys()) {
                for (String col : key.columns) {
                    String type = t.columns.get(col).type;
                    assertFalse(type.contains("(MAX)"), t.name + "." + col + " 가 " + key.name + " 키인데 " + type + " 다");
                }
            }
        }
    }

    @Test
    void P12_MSSQL_감사_칼럼을_뺀_길이_지정_VARCHAR_에는_BIN2_가_있다() {
        int checked = 0;
        for (Table t : mssql.values()) {
            for (Column c : t.columns.values()) {
                if (c.type.matches("VARCHAR\\(\\d+\\)") && !AUDIT_TEXT.contains(c.name)) {
                    assertEquals(BIN2, c.collate, t.name + "." + c.name + " 콜레이션");
                    checked++;
                }
            }
        }
        assertTrue(checked > 30, "검사한 VARCHAR(n) 칼럼이 너무 적다: " + checked);
    }

    @Test
    void P13_MSSQL_FK_칼럼_타입이_참조_칼럼_타입과_같다() {
        for (Table t : mssql.values()) {
            for (Constraint fk : t.all("FK")) {
                Table ref = mssqlReferenced.get(fk.refTable);
                assertNotNull(ref, fk.name + " 의 참조 테이블 " + fk.refTable + " 를 V2·V3·V8 에서 찾지 못했다");
                for (int i = 0; i < fk.columns.size(); i++) {
                    Column own = t.columns.get(fk.columns.get(i));
                    Column target = ref.columns.get(fk.refColumns.get(i));
                    assertNotNull(target, fk.name + " 참조 칼럼 " + fk.refColumns.get(i));
                    assertEquals(target.fullType(), own.fullType(), fk.name + " " + own.name + " → " + fk.refTable + "." + target.name);
                }
            }
        }
    }

    @Test
    void P14_MSSQL_DEFAULT_는_모두_DF_이름을_갖고_IDENTITY_는_RECV_ID_뿐이다() {
        Set<String> identities = new TreeSet<>();
        for (Table t : mssql.values()) {
            for (Column c : t.columns.values()) {
                if (c.defaultValue != null) {
                    assertEquals("DF_" + t.name + "_" + c.name, c.defaultName, t.name + "." + c.name + " DEFAULT 이름");
                }
                if (c.identity) {
                    identities.add(t.name + "." + c.name);
                }
            }
        }
        assertEquals(Set.of("TB_MDM_RULE_RECV.RECV_ID"), identities);
        for (Table t : sqlite.values()) {
            for (Column c : t.columns.values()) {
                assertEquals(null, c.defaultName, "SQLite 는 DEFAULT 에 이름을 붙이지 않는다: " + t.name + "." + c.name);
            }
        }
    }

    @Test
    void P15_방언_금지_토큰이_없다() {
        String sqliteUpper = sqliteText.toUpperCase(Locale.ROOT);
        for (String token : List.of("COLLATE", "ISJSON", "NVARCHAR", "DATETIME2", "IDENTITY", "[", "]")) {
            assertFalse(sqliteUpper.contains(token), "SQLite V8 에 MSSQL 토큰 " + token + " 이 있다");
        }
        String mssqlUpper = mssqlText.toUpperCase(Locale.ROOT);
        for (String token : List.of("AUTOINCREMENT", "JSON_VALID", "IF NOT EXISTS", "\"", "`", "TIMESTAMP")) {
            assertFalse(mssqlUpper.contains(token), "MSSQL V8 에 금지 토큰 " + token + " 이 있다");
        }
        assertFalse(Pattern.compile("\\bTEXT\\b").matcher(mssqlUpper).find(), "MSSQL V8 에 TEXT 타입이 있다");
        assertFalse(Pattern.compile("(?m)^\\s*GO\\s*$").matcher(mssqlUpper).find(), "MSSQL V8 에 GO 구분자가 있다");
    }

    @Test
    void P16_MSSQL_테이블_생성_순서가_FK_참조_순서를_지킨다() {
        List<String> order = new ArrayList<>(mssql.keySet());
        for (Table t : mssql.values()) {
            for (Constraint fk : t.all("FK")) {
                if (mssql.containsKey(fk.refTable) && !fk.refTable.equals(t.name)) {
                    assertTrue(order.indexOf(fk.refTable) < order.indexOf(t.name),
                            fk.name + ": " + fk.refTable + " 가 " + t.name + " 보다 앞에 있어야 한다. 순서 " + order);
                }
            }
        }
    }

    // ── 타입 쌍 허용 목록(design.md §3.2 P9 표) ──

    /** [SQLite 전체 타입, MSSQL 전체 타입(콜레이션 포함)]. */
    private static String[] expectedTypes(String table, String column, String sqliteType) {
        if (AUDIT_TEXT.contains(column)) {
            return pair("VARCHAR(100)", "VARCHAR(100)");
        }
        if (AUDIT_TIME.contains(column)) {
            return pair("TIMESTAMP", "DATETIME2");
        }
        if (column.equals("AUD_VER") || (column.equals("VER") && !AUD_VER_TABLES.contains(table))) {
            return pair("BIGINT", "BIGINT");
        }
        if (column.equals("RECV_ID")) {
            return pair("INTEGER", "BIGINT");
        }
        if (column.equals("DOMAIN_ID")) {
            return pair("INTEGER", "BIGINT");
        }
        if (column.equals("ROW_VERSION")) {
            return pair("BIGINT", "BIGINT");
        }
        if (column.equals("VAR_NAME")) {
            return pair("TEXT", "VARCHAR(1000) COLLATE " + BIN2);
        }
        if (column.equals("GRP_COND")) {
            return pair("TEXT", "VARCHAR(MAX)");
        }
        if (NAMES.contains(column)) {
            return pair("TEXT", "NVARCHAR(100)");
        }
        if (FREE_TEXT.contains(column)) {
            return pair("TEXT", "NVARCHAR(MAX)");
        }
        if (BUSINESS_TIME.contains(column)) {
            return pair("TEXT", "DATETIME2(0)");
        }
        if (INTEGERS.contains(column) || column.equals("VER")) {
            return pair("INTEGER", "INT");
        }
        if (sqliteType.matches("VARCHAR\\(\\d+\\)")) {
            return pair(sqliteType, sqliteType + " COLLATE " + BIN2);
        }
        fail(table + "." + column + " 의 타입 " + sqliteType + " 이 허용 목록 어디에도 없다");
        return null;
    }

    private static String[] pair(String sqliteType, String mssqlType) {
        return new String[] {sqliteType, mssqlType};
    }

    // ── 조회 도우미 ──

    private static Table table(Map<String, Table> dialect, String name) {
        Table t = dialect.get(name);
        assertNotNull(t, name + " 가 없다");
        return t;
    }

    private static Column column(Map<String, Table> dialect, String table, String column) {
        Column c = table(dialect, table).columns.get(column);
        assertNotNull(c, table + "." + column + " 가 없다");
        return c;
    }

    private static Map<String, String> checks(Table t) {
        Map<String, String> result = new TreeMap<>();
        t.all("CK").forEach(ck -> result.put(ck.name, ck.body));
        return result;
    }

    private static Map<String, String> defaults(Table t) {
        Map<String, String> result = new TreeMap<>();
        t.columns.values().stream().filter(c -> c.defaultValue != null).forEach(c -> result.put(c.name, c.defaultValue));
        return result;
    }

    // ── 파서 ──

    private static final class Table {
        final String name;
        final Map<String, Column> columns = new LinkedHashMap<>();
        final List<Constraint> constraints = new ArrayList<>();

        Table(String name) {
            this.name = name;
        }

        List<String> columnNames() {
            return List.copyOf(columns.keySet());
        }

        List<Constraint> all(String kind) {
            return constraints.stream().filter(c -> c.kind.equals(kind)).toList();
        }

        Constraint single(String kind) {
            List<Constraint> found = all(kind);
            assertEquals(1, found.size(), name + " 의 " + kind + " 개수");
            return found.get(0);
        }

        Constraint byName(String constraintName) {
            return constraints.stream().filter(c -> c.name.equals(constraintName)).findFirst().orElse(null);
        }

        Set<String> describeAll(String kind) {
            Set<String> result = new TreeSet<>();
            all(kind).forEach(c -> result.add(c.describe()));
            return result;
        }

        List<Constraint> keys() {
            return constraints.stream().filter(c -> !c.kind.equals("CK")).toList();
        }
    }

    private static final class Column {
        final String name;
        String type;
        String collate;
        boolean notNull;
        boolean identity;
        String defaultValue;
        String defaultName;

        Column(String name) {
            this.name = name;
        }

        String fullType() {
            return collate == null ? type : type + " COLLATE " + collate;
        }
    }

    private static final class Constraint {
        final String kind;
        final String name;
        List<String> columns = List.of();
        String refTable;
        List<String> refColumns = List.of();
        boolean cascade;
        String body;

        Constraint(String kind, String name) {
            this.kind = kind;
            this.name = name;
        }

        String describe() {
            return switch (kind) {
                case "FK" -> name + " " + columns + " -> " + refTable + " " + refColumns + (cascade ? " CASCADE" : "");
                case "UX" -> name + " " + refTable + " " + columns + " WHERE " + body;
                case "CK" -> name + " " + body;
                default -> name + " " + columns;
            };
        }
    }

    private static final Pattern CREATE_TABLE = Pattern.compile("(?is)^CREATE\\s+TABLE\\s+(\\w+)\\s*\\((.*)\\)$");
    private static final Pattern CREATE_UX = Pattern.compile(
            "(?is)^CREATE\\s+UNIQUE\\s+INDEX\\s+(\\w+)\\s+ON\\s+(\\w+)\\s*\\(([^)]*)\\)(?:\\s+WHERE\\s+(.*))?$");
    private static final Pattern TYPE = Pattern.compile("(?i)^(\\w+(?:\\s*\\([^)]*\\))?)");
    private static final Pattern DEFAULT_LITERAL = Pattern.compile("(?i)^DEFAULT\\s+(\\(\\s*'[^']*'\\s*\\)|\\(\\s*-?\\d+\\s*\\)|'[^']*'|-?\\d+)");

    /** V8 전용 — CREATE TABLE·CREATE UNIQUE INDEX 밖의 문장이 있으면 실패한다. */
    private static Map<String, Table> parseStrict(String text, String dialect) {
        Map<String, Table> tables = new LinkedHashMap<>();
        for (String stmt : statements(text)) {
            Matcher t = CREATE_TABLE.matcher(stmt);
            Matcher ux = CREATE_UX.matcher(stmt);
            if (t.matches()) {
                Table table = parseTable(t.group(1), t.group(2));
                tables.put(table.name, table);
            } else if (ux.matches()) {
                Table owner = tables.get(ux.group(2));
                assertNotNull(owner, dialect + " 인덱스 " + ux.group(1) + " 의 테이블이 먼저 만들어지지 않았다");
                Constraint c = new Constraint("UX", ux.group(1));
                c.refTable = ux.group(2);
                c.columns = splitNames(ux.group(3));
                c.body = ux.group(4) == null ? "" : normalizeExpr(ux.group(4));
                owner.constraints.add(c);
            } else {
                fail(dialect + " V8 에 예상 밖의 문장이 있다: " + stmt);
            }
        }
        return tables;
    }

    /** V2·V3 — FK 대상 타입만 필요하므로 CREATE TABLE 만 읽고 나머지 문장은 건너뛴다. */
    private static Map<String, Table> parseTablesOnly(String text) {
        Map<String, Table> tables = new LinkedHashMap<>();
        for (String stmt : statements(text)) {
            Matcher t = CREATE_TABLE.matcher(stmt);
            if (t.matches()) {
                Table table = parseTable(t.group(1), t.group(2));
                tables.put(table.name, table);
            }
        }
        return tables;
    }

    private static Table parseTable(String name, String body) {
        Table table = new Table(name);
        for (String item : splitTopLevel(body, ',')) {
            String trimmed = unquote(item.trim());
            if (trimmed.regionMatches(true, 0, "CONSTRAINT ", 0, 11)) {
                table.constraints.add(parseTableConstraint(trimmed));
            } else {
                parseColumn(table, trimmed);
            }
        }
        return table;
    }

    private static Constraint parseTableConstraint(String item) {
        Matcher m = Pattern.compile("(?is)^CONSTRAINT\\s+(\\w+)\\s+(.*)$").matcher(item);
        assertTrue(m.matches(), item);
        String name = m.group(1);
        String rest = m.group(2).trim();
        Matcher pk = Pattern.compile("(?is)^PRIMARY\\s+KEY\\s*\\(([^)]*)\\)$").matcher(rest);
        Matcher fk = Pattern.compile(
                "(?is)^FOREIGN\\s+KEY\\s*\\(([^)]*)\\)\\s+REFERENCES\\s+(\\w+)\\s*\\(([^)]*)\\)(\\s+ON\\s+DELETE\\s+CASCADE)?$").matcher(rest);
        Matcher ck = Pattern.compile("(?is)^CHECK\\s*(\\(.*\\))$").matcher(rest);
        if (pk.matches()) {
            Constraint c = new Constraint("PK", name);
            c.columns = splitNames(pk.group(1));
            return c;
        }
        if (fk.matches()) {
            Constraint c = new Constraint("FK", name);
            c.columns = splitNames(fk.group(1));
            c.refTable = fk.group(2);
            c.refColumns = splitNames(fk.group(3));
            c.cascade = fk.group(4) != null;
            return c;
        }
        if (ck.matches()) {
            Constraint c = new Constraint("CK", name);
            c.body = normalizeExpr(stripOuterParens(ck.group(1)));
            return c;
        }
        fail("해석하지 못한 테이블 제약: " + item);
        return null;
    }

    /** 칼럼 정의 — 이름, 타입, 그리고 COLLATE·NOT NULL·NULL·IDENTITY·DEFAULT·인라인 CONSTRAINT 를 커서로 읽는다. */
    private static void parseColumn(Table table, String item) {
        Matcher nm = Pattern.compile("^(\\w+)\\s+(.*)$", Pattern.DOTALL).matcher(item);
        assertTrue(nm.matches(), "칼럼 정의: " + item);
        Column col = new Column(nm.group(1));
        String rest = nm.group(2).trim();
        Matcher type = TYPE.matcher(rest);
        assertTrue(type.find(), "타입: " + item);
        col.type = type.group(1).toUpperCase(Locale.ROOT).replaceAll("\\s+", "");
        rest = rest.substring(type.end()).trim();
        while (!rest.isEmpty()) {
            Matcher m;
            if ((m = Pattern.compile("(?i)^COLLATE\\s+(\\w+)").matcher(rest)).find()) {
                col.collate = m.group(1).toUpperCase(Locale.ROOT);
            } else if ((m = Pattern.compile("(?i)^NOT\\s+NULL").matcher(rest)).find()) {
                col.notNull = true;
            } else if ((m = Pattern.compile("(?i)^NULL\\b").matcher(rest)).find()) {
                col.notNull = false;
            } else if ((m = Pattern.compile("(?i)^IDENTITY\\s*\\(\\s*1\\s*,\\s*1\\s*\\)").matcher(rest)).find()) {
                col.identity = true;
            } else if ((m = DEFAULT_LITERAL.matcher(rest)).find()) {
                col.defaultValue = normalizeLiteral(m.group(1));
            } else if ((m = Pattern.compile("(?i)^CONSTRAINT\\s+(\\w+)\\s+").matcher(rest)).find()) {
                String name = m.group(1);
                String after = rest.substring(m.end());
                Matcher def = DEFAULT_LITERAL.matcher(after);
                Matcher pk = Pattern.compile("(?i)^PRIMARY\\s+KEY(\\s+AUTOINCREMENT)?").matcher(after);
                if (def.find()) {
                    col.defaultName = name;
                    col.defaultValue = normalizeLiteral(def.group(1));
                    rest = after.substring(def.end()).trim();
                    continue;
                } else if (pk.find()) {
                    Constraint c = new Constraint("PK", name);
                    c.columns = List.of(col.name);
                    table.constraints.add(c);
                    col.notNull = true;
                    rest = after.substring(pk.end()).trim();
                    continue;
                } else if (after.regionMatches(true, 0, "CHECK", 0, 5)) {
                    String open = after.substring(5).trim();
                    int end = matchingParen(open);
                    Constraint c = new Constraint("CK", name);
                    c.body = normalizeExpr(open.substring(1, end));
                    table.constraints.add(c);
                    rest = open.substring(end + 1).trim();
                    continue;
                }
                fail("해석하지 못한 인라인 제약: " + item);
            } else {
                fail("해석하지 못한 칼럼 정의 조각 '" + rest + "' in " + item);
            }
            rest = rest.substring(m.end()).trim();
        }
        table.columns.put(col.name, col);
    }

    private static List<String> statements(String text) {
        List<String> result = new ArrayList<>();
        for (String s : text.split(";")) {
            String trimmed = s.trim();
            if (!trimmed.isEmpty()) {
                result.add(trimmed);
            }
        }
        return result;
    }

    private static List<String> splitTopLevel(String body, char separator) {
        List<String> parts = new ArrayList<>();
        int depth = 0;
        boolean inString = false;
        StringBuilder current = new StringBuilder();
        for (char ch : body.toCharArray()) {
            if (ch == '\'') {
                inString = !inString;
            } else if (!inString && ch == '(') {
                depth++;
            } else if (!inString && ch == ')') {
                depth--;
            }
            if (ch == separator && depth == 0 && !inString) {
                parts.add(current.toString());
                current.setLength(0);
            } else {
                current.append(ch);
            }
        }
        if (!current.toString().isBlank()) {
            parts.add(current.toString());
        }
        return parts;
    }

    private static int matchingParen(String text) {
        assertTrue(text.startsWith("("), "여는 괄호가 없다: " + text);
        int depth = 0;
        boolean inString = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (ch == '\'') {
                inString = !inString;
            } else if (!inString && ch == '(') {
                depth++;
            } else if (!inString && ch == ')' && --depth == 0) {
                return i;
            }
        }
        fail("닫는 괄호가 없다: " + text);
        return -1;
    }

    private static String stripOuterParens(String expr) {
        String e = expr.trim();
        return e.startsWith("(") && matchingParen(e) == e.length() - 1 ? e.substring(1, e.length() - 1).trim() : e;
    }

    private static List<String> splitNames(String list) {
        List<String> names = new ArrayList<>();
        for (String n : list.split(",")) {
            names.add(unquote(n.trim()).toUpperCase(Locale.ROOT));
        }
        return names;
    }

    /** 식별자 인용({@code "X"}·{@code [X]}·백틱)을 걷어낸다. 작은따옴표 문자열 리터럴은 건드리지 않는다. */
    private static String unquote(String text) {
        StringBuilder out = new StringBuilder();
        boolean inString = false;
        for (char ch : text.toCharArray()) {
            if (ch == '\'') {
                inString = !inString;
            }
            if (!inString && (ch == '"' || ch == '[' || ch == ']' || ch == '`')) {
                continue;
            }
            out.append(ch);
        }
        return out.toString();
    }

    /**
     * 식 정규화: 식별자 인용 제거, 리터럴 밖만 대문자화, 리터럴 밖 공백 전부 제거. 리터럴은 대소문자·공백까지 보존한다
     * (§3.3-5 "문자열 리터럴이 SQLite 와 글자까지 같다").
     */
    static String normalizeExpr(String expr) {
        StringBuilder out = new StringBuilder();
        boolean inString = false;
        for (char ch : unquote(expr).toCharArray()) {
            if (ch == '\'') {
                inString = !inString;
                out.append(ch);
            } else if (inString) {
                out.append(ch);
            } else if (!Character.isWhitespace(ch)) {
                out.append(Character.toUpperCase(ch));
            }
        }
        return out.toString();
    }

    /** {@code ('X')}·{@code (0)} 을 {@code 'X'}·{@code 0} 으로. */
    private static String normalizeLiteral(String literal) {
        String l = literal.trim();
        while (l.startsWith("(") && l.endsWith(")")) {
            l = l.substring(1, l.length() - 1).trim();
        }
        return l;
    }

    private static String stripComments(String text) {
        StringBuilder out = new StringBuilder();
        for (String line : text.split("\n", -1)) {
            int idx = commentStart(line);
            out.append(idx < 0 ? line : line.substring(0, idx)).append('\n');
        }
        return out.toString();
    }

    private static int commentStart(String line) {
        boolean inString = false;
        for (int i = 0; i < line.length() - 1; i++) {
            char ch = line.charAt(i);
            if (ch == '\'') {
                inString = !inString;
            } else if (!inString && ch == '-' && line.charAt(i + 1) == '-') {
                return i;
            }
        }
        return -1;
    }

    private static String resource(String path) {
        try (InputStream in = MdmBusinessRuleDdlParityTest.class.getClassLoader().getResourceAsStream(path)) {
            assertNotNull(in, "클래스패스에 " + path + " 가 없다");
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new IllegalStateException(e);
        }
    }
}
