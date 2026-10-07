// SQLite 사본 읽기 도구(로컬 DB 가 Oracle 로 바뀐 뒤에는 SQLite 사본이 있을 때만 동작), Oracle 판은 후속(oracle-1007 b8).
// TSK-02-03 검증 프로그램 (design.md §3 a~j). JDK 21 단일 파일 실행.
// 실행: java -cp "$SQLITE_JDBC_JAR:$SLF4J_API_JAR" docs/mdm/erd/verify/Verify.java <check-id|all>
// 매 체크마다 새 임시 SQLite DB(File.createTempFile)를 만들고 끝나면 지운다. 리포의 실제 data/mdm.db 는 열지 않는다.
import java.io.*;
import java.nio.file.*;
import java.sql.*;
import java.util.*;
import java.util.regex.*;
import java.util.stream.*;

public class Verify {

    static final Path ERD_DIR = Paths.get("docs/mdm/erd");
    static final Path VERIFY_DIR = ERD_DIR.resolve("verify");
    static final Path FIXTURE_SYSTEM = VERIFY_DIR.resolve("fixtures/00-system.sql");
    static final Path FIXTURE_CELLS = VERIFY_DIR.resolve("fixtures/cells-ref-check.sql");

    static final List<Path> SQLITE_FILES = List.of(
        ERD_DIR.resolve("02-term-domain-column.sqlite.sql"),
        ERD_DIR.resolve("03-interface-layout.sqlite.sql"),
        ERD_DIR.resolve("04-master-code.sqlite.sql"),
        ERD_DIR.resolve("05-master-data.sqlite.sql"),
        ERD_DIR.resolve("06-business-rule.sqlite.sql")
    );
    static boolean anyFail = false;

    public static void main(String[] args) throws Exception {
        String which = args.length > 0 ? args[0] : "all";
        List<String> order = List.of("a","b","c","d","e","f","g","h","i","j");
        if (which.equalsIgnoreCase("all")) {
            for (String c : order) runCheck(c);
        } else {
            runCheck(which);
        }
        System.out.println(anyFail ? "=== RESULT: FAIL ===" : "=== RESULT: PASS ===");
        if (anyFail) System.exit(1);
    }

    static void runCheck(String id) {
        try {
            switch (id) {
                case "a": checkA(); break;
                case "b": checkB(); break;
                case "c": checkC(); break;
                case "d": checkD(); break;
                case "e": checkE(); break;
                case "f": checkF(); break;
                case "g": checkG(); break;
                case "h": checkH(); break;
                case "i": checkI(); break;
                case "j": checkJ(); break;
                default: System.out.println("알 수 없는 체크: " + id);
            }
        } catch (Exception e) {
            fail(id, "예외: " + e);
            e.printStackTrace();
        }
    }

    static void pass(String id, String msg) { System.out.println("PASS " + id + ": " + msg); }
    static void fail(String id, String msg) { System.out.println("FAIL " + id + ": " + msg); anyFail = true; }

    // ───────────────────────── DB 헬퍼 ─────────────────────────

    static class Db { Connection conn; File file; }

    static Db newDb() throws Exception {
        Class.forName("org.sqlite.JDBC");
        Db d = new Db();
        d.file = File.createTempFile("mdm-verify-", ".db");
        d.file.deleteOnExit();
        d.conn = DriverManager.getConnection("jdbc:sqlite:" + d.file.getAbsolutePath());
        try (Statement s = d.conn.createStatement()) { s.execute("PRAGMA foreign_keys=ON"); }
        return d;
    }

    static void closeDb(Db d) {
        if (d == null) return;
        try { if (d.conn != null) d.conn.close(); } catch (Exception ignore) {}
        if (d.file != null) d.file.delete();
    }

    static String stripLineComments(String sql) {
        StringBuilder out = new StringBuilder();
        for (String line : sql.split("\n", -1)) {
            boolean inStr = false;
            int cut = -1;
            for (int i = 0; i < line.length(); i++) {
                char c = line.charAt(i);
                if (c == '\'') inStr = !inStr;
                else if (!inStr && c == '-' && i + 1 < line.length() && line.charAt(i + 1) == '-') { cut = i; break; }
            }
            out.append(cut >= 0 ? line.substring(0, cut) : line).append("\n");
        }
        return out.toString();
    }

    static List<String> splitStatements(String sql) {
        List<String> out = new ArrayList<>();
        StringBuilder cur = new StringBuilder();
        boolean inStr = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') { inStr = !inStr; cur.append(c); continue; }
            if (c == ';' && !inStr) {
                String stmt = cur.toString().trim();
                if (!stmt.isEmpty()) out.add(stmt);
                cur.setLength(0);
                continue;
            }
            cur.append(c);
        }
        String rest = cur.toString().trim();
        if (!rest.isEmpty()) out.add(rest);
        return out;
    }

    static void execScript(Connection c, Path file) throws Exception {
        String text = Files.readString(file);
        text = stripLineComments(text);
        List<String> stmts = splitStatements(text);
        try (Statement s = c.createStatement()) {
            for (String stmt : stmts) {
                try { s.execute(stmt); }
                catch (SQLException e) {
                    throw new RuntimeException(file.getFileName() + " 문장 실패: "
                        + stmt.substring(0, Math.min(160, stmt.length())) + " ... : " + e.getMessage(), e);
                }
            }
        }
    }

    static Db buildFullDb() throws Exception {
        Db d = newDb();
        execScript(d.conn, FIXTURE_SYSTEM);
        for (Path p : SQLITE_FILES) execScript(d.conn, p);
        return d;
    }

    static List<Map<String,String>> fullTableInfo(Connection c, String table) throws SQLException {
        List<Map<String,String>> out = new ArrayList<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rs.next()) {
                Map<String,String> m = new HashMap<>();
                m.put("name", rs.getString("name"));
                m.put("type", rs.getString("type"));
                m.put("notnull", String.valueOf(rs.getInt("notnull")));
                m.put("dflt_value", rs.getString("dflt_value"));
                m.put("pk", String.valueOf(rs.getInt("pk")));
                out.add(m);
            }
        }
        return out;
    }

    static List<String> tableColumnsUpper(Connection c, String table) throws SQLException {
        List<String> cols = new ArrayList<>();
        for (Map<String,String> m : fullTableInfo(c, table)) cols.add(m.get("name").toUpperCase());
        return cols;
    }

    static List<String> allTaskTables(Connection c) throws SQLException {
        List<String> out = new ArrayList<>();
        try (Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'TB_MDM_%' ORDER BY name")) {
            while (rs.next()) out.add(rs.getString(1));
        }
        return out;
    }

    // ───────────────────────── 최소 JSON 파서 ─────────────────────────

    @SuppressWarnings("unchecked")
    static Map<String,Object> loadExpected() throws IOException {
        String txt = Files.readString(VERIFY_DIR.resolve("expected-columns.json"));
        return (Map<String,Object>) parseJson(txt);
    }

    static Object parseJson(String s) {
        int[] p = {0};
        return parseValue(s, p);
    }
    static void skipWs(String s, int[] p) { while (p[0] < s.length() && Character.isWhitespace(s.charAt(p[0]))) p[0]++; }
    static Object parseValue(String s, int[] p) {
        skipWs(s, p);
        char c = s.charAt(p[0]);
        if (c == '{') return parseObj(s, p);
        if (c == '[') return parseArr(s, p);
        if (c == '"') return parseStr(s, p);
        if (c == 't') { p[0] += 4; return Boolean.TRUE; }
        if (c == 'f') { p[0] += 5; return Boolean.FALSE; }
        if (c == 'n') { p[0] += 4; return null; }
        int start = p[0];
        while (p[0] < s.length() && "-+.eE0123456789".indexOf(s.charAt(p[0])) >= 0) p[0]++;
        return Double.parseDouble(s.substring(start, p[0]));
    }
    static Map<String,Object> parseObj(String s, int[] p) {
        Map<String,Object> m = new LinkedHashMap<>();
        p[0]++; skipWs(s, p);
        if (s.charAt(p[0]) == '}') { p[0]++; return m; }
        while (true) {
            skipWs(s, p);
            String key = parseStr(s, p);
            skipWs(s, p);
            p[0]++; // ':'
            Object val = parseValue(s, p);
            m.put(key, val);
            skipWs(s, p);
            char c = s.charAt(p[0]);
            if (c == ',') { p[0]++; continue; }
            if (c == '}') { p[0]++; break; }
        }
        return m;
    }
    static List<Object> parseArr(String s, int[] p) {
        List<Object> l = new ArrayList<>();
        p[0]++; skipWs(s, p);
        if (s.charAt(p[0]) == ']') { p[0]++; return l; }
        while (true) {
            Object val = parseValue(s, p);
            l.add(val);
            skipWs(s, p);
            char c = s.charAt(p[0]);
            if (c == ',') { p[0]++; continue; }
            if (c == ']') { p[0]++; break; }
        }
        return l;
    }
    static String parseStr(String s, int[] p) {
        StringBuilder sb = new StringBuilder();
        p[0]++;
        while (true) {
            char c = s.charAt(p[0]);
            if (c == '"') { p[0]++; break; }
            if (c == '\\') {
                p[0]++;
                char e = s.charAt(p[0]);
                switch (e) {
                    case 'n': sb.append('\n'); break;
                    case 't': sb.append('\t'); break;
                    case '"': sb.append('"'); break;
                    case '\\': sb.append('\\'); break;
                    case '/': sb.append('/'); break;
                    case 'u':
                        String hex = s.substring(p[0] + 1, p[0] + 5);
                        sb.append((char) Integer.parseInt(hex, 16));
                        p[0] += 4;
                        break;
                    default: sb.append(e);
                }
                p[0]++;
            } else { sb.append(c); p[0]++; }
        }
        return sb.toString();
    }

    @SuppressWarnings("unchecked")
    static List<String> toStringList(Object o) {
        if (o == null) return List.of();
        List<Object> l = (List<Object>) o;
        List<String> out = new ArrayList<>();
        for (Object x : l) out.add((String) x);
        return out;
    }

    // ───────────────────────── 체크 a ─────────────────────────

    static void checkA() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            int n;
            try (Statement s = d.conn.createStatement();
                 ResultSet rs = s.executeQuery("SELECT count(*) FROM sqlite_master WHERE type='table' AND name LIKE 'TB_MDM_%'")) {
                rs.next();
                n = rs.getInt(1);
            }
            if (n == 37) pass("a", "fixture(TB_MDM_SYSTEM) + 02~06 DDL 적용 오류 0, 테이블 37개(36 Task 테이블 + fixture 1) 확인");
            else fail("a", "테이블 수 불일치: 기대 37, 실제 " + n);
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 b (제약·인덱스 이름 전역 유일성) ─────────────────────────

    static class ColDef { String name; boolean notNull; String defaultLit; String typeText; }
    static class ConstraintDef { String name; String kind; List<String> cols; String refTable; List<String> refCols; String ownerTable; }
    static class TableDef { String name; List<ColDef> cols = new ArrayList<>(); List<ConstraintDef> constraints = new ArrayList<>(); }
    static class IndexDef { String name; String table; boolean unique; List<String> cols; String whereClause; }

    static int matchParen(String text, int openIdx) {
        int depth = 0; boolean inStr = false;
        for (int i = openIdx; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '\'') inStr = !inStr;
            else if (!inStr) {
                if (c == '(') depth++;
                else if (c == ')') { depth--; if (depth == 0) return i; }
            }
        }
        throw new RuntimeException("괄호 짝을 찾지 못함 near " + openIdx);
    }
    static String extractBalanced(String text, int openIdx) { return text.substring(openIdx + 1, matchParen(text, openIdx)); }

    static List<String> splitTopLevel(String s) {
        List<String> out = new ArrayList<>();
        int depth = 0; boolean inStr = false; StringBuilder cur = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            if (c == '\'') { inStr = !inStr; cur.append(c); continue; }
            if (!inStr) {
                if (c == '(') depth++;
                else if (c == ')') depth--;
                else if (c == ',' && depth == 0) { out.add(cur.toString()); cur.setLength(0); continue; }
            }
            cur.append(c);
        }
        if (cur.length() > 0) out.add(cur.toString());
        return out;
    }

    static String stripIdentQuote(String s) {
        s = s.trim();
        if (s.length() >= 2) {
            if (s.startsWith("\"") && s.endsWith("\"")) return s.substring(1, s.length() - 1);
            if (s.startsWith("[") && s.endsWith("]")) return s.substring(1, s.length() - 1);
        }
        return s;
    }
    static List<String> upperIdentList(String colsPart) {
        return splitTopLevel(colsPart).stream().map(String::trim).map(Verify::stripIdentQuote)
            .map(String::toUpperCase).collect(Collectors.toList());
    }

    static Map<String, TableDef> parseCreateTables(String text) {
        Map<String, TableDef> out = new LinkedHashMap<>();
        Matcher m = Pattern.compile("CREATE TABLE\\s+(\\w+)\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text);
        while (m.find()) {
            String tname = m.group(1).toUpperCase();
            int openIdx = m.end() - 1;
            String body = extractBalanced(text, openIdx);
            TableDef td = new TableDef(); td.name = tname;
            for (String rawItem : splitTopLevel(body)) {
                String item = rawItem.trim();
                if (item.isEmpty()) continue;
                Matcher cm = Pattern.compile("^CONSTRAINT\\s+(\\w+)\\s+(PRIMARY KEY|FOREIGN KEY|CHECK|UNIQUE)", Pattern.CASE_INSENSITIVE).matcher(item);
                if (cm.find()) {
                    ConstraintDef cd = new ConstraintDef();
                    cd.name = cm.group(1); cd.kind = cm.group(2).toUpperCase(); cd.ownerTable = tname;
                    if (!cd.kind.equals("CHECK")) {
                        int paren = item.indexOf('(', cm.end());
                        if (paren >= 0) {
                            String colsPart = extractBalanced(item, paren);
                            cd.cols = upperIdentList(colsPart);
                            if (cd.kind.equals("FOREIGN KEY")) {
                                Matcher rm = Pattern.compile("REFERENCES\\s+(\\w+)\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(item);
                                if (rm.find()) {
                                    cd.refTable = rm.group(1).toUpperCase();
                                    String rcolsPart = extractBalanced(item, rm.end() - 1);
                                    cd.refCols = upperIdentList(rcolsPart);
                                }
                            }
                        }
                    }
                    td.constraints.add(cd);
                    continue;
                }
                String upperItem = item.toUpperCase();
                if (upperItem.startsWith("PRIMARY KEY") || upperItem.startsWith("FOREIGN KEY")
                    || upperItem.startsWith("CHECK") || upperItem.startsWith("UNIQUE")) {
                    // 이름 없는 테이블 제약(체크 i 가 위반으로 잡아야 함)
                    ConstraintDef cd = new ConstraintDef();
                    cd.name = ""; cd.kind = item.split("\\s+")[0].toUpperCase(); cd.ownerTable = tname;
                    td.constraints.add(cd);
                    continue;
                }
                // 칼럼 정의
                Matcher nm = Pattern.compile("^(\"[^\"]+\"|\\[[^\\]]+\\]|\\w+)\\s+(.*)$", Pattern.DOTALL).matcher(item);
                if (!nm.find()) continue;
                ColDef col = new ColDef();
                col.name = stripIdentQuote(nm.group(1)).toUpperCase();
                String rest = nm.group(2);
                col.notNull = Pattern.compile("\\bNOT\\s+NULL\\b", Pattern.CASE_INSENSITIVE).matcher(rest).find();
                Matcher dmStr = Pattern.compile("DEFAULT\\s*\\(?\\s*'([^']*)'\\s*\\)?", Pattern.CASE_INSENSITIVE).matcher(rest);
                Matcher dmNum = Pattern.compile("DEFAULT\\s*\\(?\\s*(-?[0-9][0-9.]*)\\s*\\)?", Pattern.CASE_INSENSITIVE).matcher(rest);
                if (dmStr.find()) col.defaultLit = dmStr.group(1);
                else if (dmNum.find()) col.defaultLit = dmNum.group(1);
                Matcher tm = Pattern.compile("^([A-Za-z0-9_]+(?:\\([^)]*\\))?)").matcher(rest.trim());
                if (tm.find()) col.typeText = tm.group(1).toUpperCase();
                // SQLite 인라인 PK(AUTOINCREMENT) 도 테이블 제약으로 등록. rowid 별칭이라 암묵적으로 NOT NULL.
                Matcher pkm = Pattern.compile("CONSTRAINT\\s+(\\w+)\\s+PRIMARY KEY", Pattern.CASE_INSENSITIVE).matcher(rest);
                if (pkm.find()) {
                    ConstraintDef cd = new ConstraintDef();
                    cd.name = pkm.group(1); cd.kind = "PRIMARY KEY"; cd.cols = List.of(col.name); cd.ownerTable = tname;
                    td.constraints.add(cd);
                    col.notNull = true;
                }
                // 인라인 칼럼 수준 CHECK(CONSTRAINT name CHECK(...))도 테이블 제약으로 등록(JSONV 토큰 등)
                Matcher ckm = Pattern.compile("CONSTRAINT\\s+(\\w+)\\s+CHECK", Pattern.CASE_INSENSITIVE).matcher(rest);
                if (ckm.find()) {
                    ConstraintDef cd = new ConstraintDef();
                    cd.name = ckm.group(1); cd.kind = "CHECK"; cd.ownerTable = tname;
                    td.constraints.add(cd);
                }
                td.cols.add(col);
            }
            out.put(tname, td);
        }
        return out;
    }

    static List<IndexDef> parseIndexes(String text) {
        List<IndexDef> out = new ArrayList<>();
        Matcher m = Pattern.compile("CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(\\w+)\\s+ON\\s+(\\w+)\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text);
        while (m.find()) {
            IndexDef idx = new IndexDef();
            idx.unique = m.group(1) != null;
            idx.name = m.group(2);
            idx.table = m.group(3).toUpperCase();
            int openIdx = m.end() - 1;
            int closeIdx = matchParen(text, openIdx);
            idx.cols = upperIdentList(text.substring(openIdx + 1, closeIdx));
            int semi = text.indexOf(';', closeIdx);
            String tail = text.substring(closeIdx + 1, semi).trim();
            if (tail.toUpperCase().startsWith("WHERE")) idx.whereClause = tail.substring(5).trim();
            out.add(idx);
        }
        return out;
    }

    static List<ConstraintDef> parseAlterFks(String text) {
        List<ConstraintDef> out = new ArrayList<>();
        Matcher m = Pattern.compile("ALTER TABLE\\s+(\\w+)\\s+ADD CONSTRAINT\\s+(\\w+)\\s+FOREIGN KEY\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text);
        while (m.find()) {
            String childTable = m.group(1).toUpperCase();
            String fkName = m.group(2);
            int openIdx = m.end() - 1;
            int closeIdx = matchParen(text, openIdx);
            List<String> cols = upperIdentList(text.substring(openIdx + 1, closeIdx));
            Matcher rm = Pattern.compile("REFERENCES\\s+(\\w+)\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text);
            rm.region(closeIdx, text.length());
            if (!rm.find()) continue;
            String refTable = rm.group(1).toUpperCase();
            int refOpen = rm.end() - 1;
            int refClose = matchParen(text, refOpen);
            List<String> refCols = upperIdentList(text.substring(refOpen + 1, refClose));
            ConstraintDef cd = new ConstraintDef();
            cd.name = fkName; cd.kind = "FOREIGN KEY"; cd.cols = cols; cd.refTable = refTable; cd.refCols = refCols; cd.ownerTable = childTable;
            out.add(cd);
        }
        return out;
    }

    static String readAll(Path p) throws IOException { return stripLineComments(Files.readString(p)); }
    static String readAllRaw(Path p) throws IOException { return Files.readString(p); }

    static void checkB() throws Exception {
        StringBuilder sqliteText = new StringBuilder();
        for (Path p : SQLITE_FILES) sqliteText.append(readAll(p)).append("\n");

        Map<String, TableDef> sqliteTables = parseCreateTables(sqliteText.toString());
        List<IndexDef> sqliteIdx = parseIndexes(sqliteText.toString());
        List<ConstraintDef> sqliteAlterFks = parseAlterFks(sqliteText.toString());

        List<String> problems = new ArrayList<>();

        // 제약·인덱스 이름 전역 유일성(파일 경계 무시)
        Map<String,Integer> nameCount = new HashMap<>();
        for (TableDef td : sqliteTables.values())
            for (ConstraintDef cd : td.constraints)
                if (cd.name != null && !cd.name.isEmpty()) nameCount.merge(cd.name, 1, Integer::sum);
        for (ConstraintDef cd : sqliteAlterFks) nameCount.merge(cd.name, 1, Integer::sum);
        for (IndexDef ix : sqliteIdx) nameCount.merge(ix.name, 1, Integer::sum);
        List<String> dups = nameCount.entrySet().stream().filter(e -> e.getValue() > 1).map(Map.Entry::getKey).sorted().collect(Collectors.toList());
        if (!dups.isEmpty()) problems.add("제약/인덱스 이름 중복: " + dups);

        if (problems.isEmpty())
            pass("b", "테이블 " + sqliteTables.size() + "개: 제약·인덱스 이름 " + nameCount.size() + "개 전역 유일");
        else fail("b", problems.size() + "건: " + problems);
    }

    // ───────────────────────── 체크 c ─────────────────────────

    @SuppressWarnings("unchecked")
    static void checkC() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            Map<String, Object> expected = loadExpected();
            Map<String, Object> tables = (Map<String, Object>) expected.get("tables");
            List<String> audit9 = toStringList(expected.get("audit9"));
            List<String> audit9AudVer = toStringList(expected.get("audit9_aud_var"));
            List<String> problems = new ArrayList<>();
            int okCount = 0;
            for (String table : tables.keySet()) {
                Map<String, Object> info = (Map<String, Object>) tables.get(table);
                Set<String> expectedSet = new TreeSet<>(toStringList(info.get("source_columns")));
                expectedSet.addAll(toStringList(info.get("added_columns")));
                if (!Boolean.TRUE.equals(info.get("no_audit")))
                    expectedSet.addAll(Boolean.TRUE.equals(info.get("uses_aud_var")) ? audit9AudVer : audit9);
                Set<String> actualSet = new TreeSet<>(tableColumnsUpper(d.conn, table));
                if (expectedSet.equals(actualSet)) okCount++;
                else {
                    Set<String> extra = new TreeSet<>(actualSet); extra.removeAll(expectedSet);
                    Set<String> missing = new TreeSet<>(expectedSet); missing.removeAll(actualSet);
                    problems.add(table + " extra=" + extra + " missing=" + missing);
                }
            }
            if (problems.isEmpty()) pass("c", okCount + "/" + tables.size() + " 테이블 칼럼 목록 expected-columns.json 과 정합(대소문자 무시)");
            else fail("c", problems.size() + "건: " + problems);
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 d ─────────────────────────

    static List<String> primaryKeyColumns(Connection c, String table) throws SQLException {
        List<Map<String,String>> info = fullTableInfo(c, table);
        return info.stream().filter(m -> !"0".equals(m.get("pk")))
            .sorted(Comparator.comparingInt(m -> Integer.parseInt(m.get("pk"))))
            .map(m -> m.get("name").toUpperCase()).collect(Collectors.toList());
    }

    static List<String> indexColumnsUpper(Connection c, String idxName) throws SQLException {
        List<String> out = new ArrayList<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("PRAGMA index_info(" + idxName + ")")) {
            while (rs.next()) out.add(rs.getString("name").toUpperCase());
        }
        return out;
    }

    static boolean parentKeyMatches(Connection c, String parentTable, List<String> toCols) throws SQLException {
        Set<String> to = new TreeSet<>(toCols);
        Set<String> pk = new TreeSet<>(primaryKeyColumns(c, parentTable));
        if (pk.equals(to)) return true;
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("PRAGMA index_list(" + parentTable + ")")) {
            while (rs.next()) {
                if (rs.getInt("unique") == 1 && rs.getInt("partial") == 0) {
                    Set<String> idxCols = new TreeSet<>(indexColumnsUpper(c, rs.getString("name")));
                    if (idxCols.equals(to)) return true;
                }
            }
        }
        return false;
    }

    static void checkD() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            List<String> problems = new ArrayList<>();
            int fkCount = 0;
            for (String table : allTaskTables(d.conn)) {
                Map<Integer, List<String[]>> byId = new LinkedHashMap<>();
                try (Statement s = d.conn.createStatement(); ResultSet rs = s.executeQuery("PRAGMA foreign_key_list(" + table + ")")) {
                    while (rs.next()) {
                        int id = rs.getInt("id");
                        byId.computeIfAbsent(id, k -> new ArrayList<>())
                            .add(new String[]{rs.getString("table"), rs.getString("from"), rs.getString("to"), String.valueOf(rs.getInt("seq"))});
                    }
                }
                for (var e : byId.entrySet()) {
                    fkCount++;
                    List<String[]> rows = e.getValue();
                    rows.sort(Comparator.comparingInt(r -> Integer.parseInt(r[3])));
                    String parentTable = rows.get(0)[0].toUpperCase();
                    if (!parentTable.startsWith("TB_MDM_")) problems.add(table + " FK#" + e.getKey() + " 부모 테이블 " + parentTable + " 이 TB_MDM_ 접두 아님");
                    List<String> toCols = new ArrayList<>();
                    for (String[] r : rows) {
                        if (r[2] == null) { problems.add(table + " FK#" + e.getKey() + " REFERENCES 에 부모 칼럼이 명시되지 않음(to=NULL)"); }
                        else toCols.add(r[2].toUpperCase());
                    }
                    if (!toCols.isEmpty() && !parentKeyMatches(d.conn, parentTable, toCols))
                        problems.add(table + " FK#" + e.getKey() + " → " + parentTable + toCols + " 가 부모 PK/비부분 UNIQUE 인덱스와 일치하지 않음");
                }
            }
            if (problems.isEmpty()) pass("d", "FK " + fkCount + "건 전부 TB_MDM_ 접두 부모 + 부모 키(PK 또는 비부분 UNIQUE)와 일치");
            else fail("d", problems.size() + "건: " + problems);
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 e ─────────────────────────

    static String auditExpectedType(String col) {
        if (col.equals("C_AT") || col.equals("U_AT")) return "TIMESTAMP";
        if (col.equals("VER") || col.equals("AUD_VER")) return "INTEGER";
        return "VARCHAR(100)";
    }

    @SuppressWarnings("unchecked")
    static void checkE() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            Map<String, Object> expected = loadExpected();
            Map<String, Object> tables = (Map<String, Object>) expected.get("tables");
            List<String> audit9 = toStringList(expected.get("audit9"));
            List<String> audit9AudVer = toStringList(expected.get("audit9_aud_var"));
            int total = 0, ok = 0;
            List<String> problems = new ArrayList<>();
            for (String table : tables.keySet()) {
                Map<String, Object> info = (Map<String, Object>) tables.get(table);
                if (Boolean.TRUE.equals(info.get("no_audit"))) continue; // TB_MDM_DICT_SEQ
                total++;
                List<String> expectedAudit = Boolean.TRUE.equals(info.get("uses_aud_var")) ? audit9AudVer : audit9;
                Map<String, String> typeByName = new HashMap<>();
                for (Map<String, String> col : fullTableInfo(d.conn, table)) typeByName.put(col.get("name").toUpperCase(), col.get("type"));
                boolean rowOk = true;
                for (String expCol : expectedAudit) {
                    String type = typeByName.get(expCol);
                    if (type == null) { problems.add(table + "." + expCol + " 없음"); rowOk = false; continue; }
                    String want = auditExpectedType(expCol);
                    if (!type.equalsIgnoreCase(want)) { problems.add(table + "." + expCol + " 타입=" + type + " 기대=" + want); rowOk = false; }
                }
                // AUD_VER 은 §2 예외 6개 테이블에만 있어야 하고, 나머지 테이블에는 생기면 안 된다(D-034, D8).
                boolean hasAudVer = typeByName.containsKey("AUD_VER");
                boolean expectsAudVer = Boolean.TRUE.equals(info.get("uses_aud_var"));
                if (hasAudVer && !expectsAudVer) { problems.add(table + " 은 §2 예외 대상이 아닌데 AUD_VER 칼럼이 있음"); rowOk = false; }
                if (!hasAudVer && expectsAudVer) { problems.add(table + " 은 §2 예외 대상인데 AUD_VER 칼럼이 없음"); rowOk = false; }
                if (rowOk) ok++;
            }
            // 참고: design.md 는 "35 개 중 DICT_SEQ 제외 34개"(TB_MDM_SYSTEM fixture 포함)라 적었으나,
            // TB_MDM_SYSTEM 은 이 Task 소유가 아니라(F2) 대상에서 뺀다 — 실제 대상은 34 Task 테이블 - DICT_SEQ = 33.
            if (problems.isEmpty()) pass("e", ok + "/" + total + " 감사 칼럼·타입 일치(TB_MDM_DICT_SEQ 제외, TB_MDM_SYSTEM 은 이 Task 비소유라 대상 아님 — design.md 34/34 표기 정정)");
            else fail("e", ok + "/" + total + " 만 일치, 문제 " + problems.size() + "건: " + problems);
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 f ─────────────────────────

    static String columnDefault(Connection c, String table, String col) throws SQLException {
        for (Map<String,String> m : fullTableInfo(c, table)) if (m.get("name").equalsIgnoreCase(col)) return m.get("dflt_value");
        return null;
    }

    static void checkF() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            List<String> chgSeqTables = List.of("TB_MDM_DOMAIN","TB_MDM_COLUMN","TB_MDM_UNIT","TB_MDM_DATA","TB_MDM_DATA_ITEM","TB_MDM_DATA_CATE","TB_MDM_DATA_CATE_ITEM");
            List<String> lastChgSeqTables = List.of("TB_MDM_CODE","TB_MDM_DATA","TB_MDM_DICT_SEQ");
            List<String> problems = new ArrayList<>();
            int okChg = 0, okLast = 0;
            for (String t : chgSeqTables) {
                String v = columnDefault(d.conn, t, "CHG_SEQ");
                if (v != null && v.trim().equals("0")) okChg++; else problems.add(t + ".CHG_SEQ default=" + v);
            }
            for (String t : lastChgSeqTables) {
                String v = columnDefault(d.conn, t, "LAST_CHG_SEQ");
                if (v != null && v.trim().equals("0")) okLast++; else problems.add(t + ".LAST_CHG_SEQ default=" + v);
            }
            long distinct = Stream.concat(chgSeqTables.stream(), lastChgSeqTables.stream()).distinct().count();
            boolean seedOk;
            try (Statement s = d.conn.createStatement();
                 ResultSet rs = s.executeQuery("SELECT LAST_CHG_SEQ FROM TB_MDM_DICT_SEQ WHERE DICT_CODE='DOMAIN'")) {
                seedOk = rs.next() && rs.getInt(1) == 0;
            }
            if (!seedOk) problems.add("TB_MDM_DICT_SEQ 초기 행('DOMAIN',0) 조회 실패");
            if (problems.isEmpty() && okChg == 7 && okLast == 3 && distinct == 9)
                pass("f", "chg_seq 7개·last_chg_seq 3개(distinct 테이블 9) DEFAULT 0 확인, DICT_SEQ 초기 행 조회됨");
            else fail("f", "okChg=" + okChg + " okLast=" + okLast + " distinct=" + distinct + " 문제: " + problems);
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 g ─────────────────────────

    static void checkG() throws Exception {
        List<String> problems = new ArrayList<>();

        // g#2 AUTOINCREMENT: CODE_RECV·DATA_RECV·RULE_RECV 3곳
        Db d1 = null;
        try {
            d1 = buildFullDb();
            Map<String,String> insertSql = Map.of(
                "TB_MDM_CODE_RECV", "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) VALUES ('MDM','VERSION','2026-09-24 00:00:00','{}')",
                "TB_MDM_DATA_RECV", "INSERT INTO TB_MDM_DATA_RECV (SOURCE_SYSTEM, RECEIVED_AT, BODY) VALUES ('MDM','2026-09-24 00:00:00','{}')",
                "TB_MDM_RULE_RECV", "INSERT INTO TB_MDM_RULE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) VALUES ('MDM','VERSION','2026-09-24 00:00:00','{}')"
            );
            for (String table : List.of("TB_MDM_CODE_RECV","TB_MDM_DATA_RECV","TB_MDM_RULE_RECV")) {
                String col = "RECV_ID";
                String ins = insertSql.get(table);
                try (Statement s = d1.conn.createStatement()) {
                    s.executeUpdate(ins);
                    s.executeUpdate(ins);
                    s.executeUpdate("DELETE FROM " + table + " WHERE " + col + " = (SELECT max(" + col + ") FROM " + table + ")");
                    s.executeUpdate(ins);
                    try (ResultSet rs = s.executeQuery("SELECT max(" + col + ") FROM " + table)) {
                        rs.next();
                        int max = rs.getInt(1);
                        if (max != 3) problems.add(table + " AUTOINCREMENT 연속성 실패: max=" + max + "(기대 3)");
                    }
                }
            }
        } finally { closeDb(d1); }

        // g#3 CELLS JSON CHECK 거부 + DOMAIN.std_ast NULL 통과
        Db d2 = null;
        try {
            d2 = buildFullDb();
            try (Statement s = d2.conn.createStatement()) {
                s.executeUpdate("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('GR1','r','DECISION','MDM')");
                s.executeUpdate("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES ('GR1',1)");
                boolean rejected = false;
                try { s.executeUpdate("INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID,VER,ROW_ID,ROW_KIND,CELLS) VALUES ('GR1',1,1,'NORMAL','not-json')"); }
                catch (SQLException e) { rejected = true; }
                if (!rejected) problems.add("RULE_ROW.CELLS 부정형 JSON 이 CHECK 를 통과함(거부되어야 함)");
                s.executeUpdate("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME,STD_NAME,DOMAIN_KIND,DATA_TYPE,STD_AST) VALUES ('d','SD','TEXT','STRING',NULL)");
            }
        } finally { closeDb(d2); }

        // g#4 json_each 0-based, g#5 json_extract
        Db d3 = null;
        try {
            d3 = newDb();
            try (Statement s = d3.conn.createStatement()) {
                try (ResultSet rs = s.executeQuery("SELECT key FROM json_each('[\"a\",\"b\",\"c\"]') ORDER BY key LIMIT 1")) {
                    rs.next();
                    if (rs.getInt(1) != 0) problems.add("json_each 배열 순번이 0부터가 아님: " + rs.getInt(1));
                }
                try (ResultSet rs = s.executeQuery("SELECT json_extract('{\"1\":{\"op\":\"EQ\"}}', '$.\"1\".op')")) {
                    rs.next();
                    if (!"EQ".equals(rs.getString(1))) problems.add("json_extract 결과가 EQ 가 아님: " + rs.getString(1));
                }
            }
        } finally { closeDb(d3); }

        // g#19 코드 키 대소문자 구분
        Db d4 = null;
        try {
            d4 = buildFullDb();
            try (Statement s = d4.conn.createStatement()) {
                s.executeUpdate("INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES ('GC1','c','MDM')");
                s.executeUpdate("INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND) VALUES ('GC1',1.000,'MAJOR')");
                s.executeUpdate("INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID,CODE,FROM_VER) VALUES ('GC1','A1',1.000)");
                s.executeUpdate("INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID,CODE,FROM_VER) VALUES ('GC1','a1',1.000)");
                try (ResultSet rs = s.executeQuery("SELECT count(*) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID='GC1'")) {
                    rs.next();
                    if (rs.getInt(1) != 2) problems.add("CODE_ITEM.CODE 대소문자 구분 실패: 'A1'/'a1' 이 같은 행으로 처리됨(count=" + rs.getInt(1) + ")");
                }
            }
        } finally { closeDb(d4); }

        // g#20 부분 인덱스: NULL 여러 개 허용, 비NULL 중복 거부.
        // TSK-04-02 V11(원래 V4→V5→V10 으로 채번했으나 dev 선착 V4·V8·V9·V10 뒤로 최대 버전+1 재채번) — 실제 배포 스키마(src/backend/mdm 의 Flyway V11)는 이 유일 인덱스를 비유일
        // IX_TB_MDM_TERM_ABBR 로 교체해 중복 허용 + 애플리케이션 경고로 바꿨다(design.md D1). 이 검증기가
        // 쓰는 ERD 원문(02-term-domain-column.*.sql, TSK-02-03 스냅샷)은 각주만 달고 고치지 않기로 했으므로
        // (design.md §2), 아래 g#20 은 여전히 "원문 그대로"의 유일 인덱스 동작을 확인한다 — 실제 배포
        // 스키마와의 괴리는 의도된 것이다(문서 전용 검증기, 게이트 아님).
        Db d5 = null;
        try {
            d5 = buildFullDb();
            try (Statement s = d5.conn.createStatement()) {
                s.executeUpdate("INSERT INTO TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION) VALUES ('t1',1,'d')");
                s.executeUpdate("INSERT INTO TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION) VALUES ('t2',1,'d')");
                s.executeUpdate("INSERT INTO TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION,ENG_ABBR) VALUES ('t3',1,'d','X')");
                boolean rejected = false;
                try { s.executeUpdate("INSERT INTO TB_MDM_TERM (TERM_NAME,SENSE_NO,DEFINITION,ENG_ABBR) VALUES ('t4',1,'d','X')"); }
                catch (SQLException e) { rejected = true; }
                if (!rejected) problems.add("TERM.ENG_ABBR 부분 UNIQUE 인덱스가 중복 'X' 를 거부하지 않음");
            }
            // 부분 인덱스가 실제로 partial=1 인지 구조적으로도 확인(behavior 테스트만으로는 일반 UNIQUE 와 구분 안 됨)
            @SuppressWarnings("unchecked")
            List<Object> partialIdx = (List<Object>) loadExpected().get("partial_unique_indexes");
            for (Object o : partialIdx) {
                @SuppressWarnings("unchecked") Map<String,Object> m = (Map<String,Object>) o;
                String idxName = (String) m.get("name");
                boolean isPartial = false;
                try (Statement s = d5.conn.createStatement(); ResultSet rs = s.executeQuery("PRAGMA index_list(" + m.get("table") + ")")) {
                    while (rs.next()) if (rs.getString("name").equalsIgnoreCase(idxName)) isPartial = rs.getInt("partial") == 1;
                }
                if (!isPartial) problems.add(idxName + " 이 PRAGMA index_list 상 partial=1 이 아님(일반 UNIQUE 로 되돌아갔을 수 있음)");
            }
            // RULE_VAR 부분 UNIQUE 거동: COND 는 같은 VAR_NAME 허용, RESULT 는 거부
            try (Statement s = d5.conn.createStatement()) {
                s.executeUpdate("INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES ('GV1','r','DECISION','MDM')");
                s.executeUpdate("INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES ('GV1',1)");
                s.executeUpdate("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID,VER,VAR_ID,VAR_KIND,SEQ,VAR_NAME) VALUES ('GV1',1,1,'COND',1,'x')");
                boolean condOk = true;
                try { s.executeUpdate("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID,VER,VAR_ID,VAR_KIND,SEQ,VAR_NAME) VALUES ('GV1',1,2,'COND',2,'x')"); }
                catch (SQLException e) { condOk = false; }
                if (!condOk) problems.add("RULE_VAR 부분 UNIQUE 가 COND 중복 VAR_NAME 을 거부함(허용되어야 함)");
                s.executeUpdate("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID,VER,VAR_ID,VAR_KIND,SEQ,VAR_NAME) VALUES ('GV1',1,3,'RESULT',3,'y')");
                boolean resultRejected = false;
                try { s.executeUpdate("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID,VER,VAR_ID,VAR_KIND,SEQ,VAR_NAME) VALUES ('GV1',1,4,'RESULT',4,'y')"); }
                catch (SQLException e) { resultRejected = true; }
                if (!resultRejected) problems.add("RULE_VAR 부분 UNIQUE 가 RESULT 중복 VAR_NAME 을 거부하지 않음");
            }
        } finally { closeDb(d5); }

        if (problems.isEmpty())
            pass("g", "#2(AUTOINCREMENT 연속성) #3(JSON CHECK 거부/NULL 통과) #4(json_each 0-based) #5(json_extract) #19(대소문자 구분) #20(부분 UNIQUE) 전부 기대대로 동작");
        else fail("g", problems.size() + "건: " + problems);
    }

    // ───────────────────────── 체크 h ─────────────────────────

    static void checkH() throws Exception {
        Db d = null;
        try {
            d = buildFullDb();
            execScript(d.conn, FIXTURE_CELLS);
            List<String> danglingCells = new ArrayList<>();
            try (Statement s = d.conn.createStatement();
                 ResultSet rs = s.executeQuery(
                     "SELECT r.maru_rule_id, r.ver, r.row_id, je.key AS cell_var_id " +
                     "FROM TB_MDM_RULE_ROW r, json_each(r.cells) je " +
                     "WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_RULE_VAR v " +
                     "  WHERE v.maru_rule_id = r.maru_rule_id AND v.ver = r.ver AND CAST(v.var_id AS TEXT) = je.key)")) {
                while (rs.next()) danglingCells.add(rs.getString("maru_rule_id") + "/" + rs.getInt("row_id") + "/" + rs.getString("cell_var_id"));
            }
            List<String> danglingRuleIds = new ArrayList<>();
            try (Statement s = d.conn.createStatement();
                 ResultSet rs = s.executeQuery(
                     "SELECT s.maru_rule_set_id, je.key AS ord, je.value AS rule_id " +
                     "FROM TB_MDM_RULE_SET_VER s, json_each(s.rule_ids) je " +
                     "WHERE NOT EXISTS (SELECT 1 FROM TB_MDM_RULE r WHERE r.maru_rule_id = je.value)")) {
                while (rs.next()) danglingRuleIds.add(rs.getString("maru_rule_set_id") + "/" + rs.getString("rule_id"));
            }
            List<String> problems = new ArrayList<>();
            if (danglingCells.size() != 1) problems.add("cells 댕글링 기대 1건, 실제 " + danglingCells);
            if (danglingRuleIds.size() != 1) problems.add("rule_ids 댕글링 기대 1건, 실제 " + danglingRuleIds);
            if (problems.isEmpty()) pass("h", "댕글링 참조 각 1건 정확히 잡힘(cells=" + danglingCells + ", rule_ids=" + danglingRuleIds + "), 정상 참조는 통과");
            else fail("h", String.join("; ", problems));
        } finally { closeDb(d); }
    }

    // ───────────────────────── 체크 i ─────────────────────────

    static void checkI() throws Exception {
        List<String> problems = new ArrayList<>();
        List<Path> allFiles = new ArrayList<>();
        allFiles.addAll(SQLITE_FILES);

        for (Path p : allFiles) {
            String text = readAll(p);
            Map<String, TableDef> tables = parseCreateTables(text);
            List<IndexDef> idxs = parseIndexes(text);
            List<ConstraintDef> alterFks = parseAlterFks(text);

            for (TableDef td : tables.values()) {
                for (ConstraintDef cd : td.constraints) {
                    if (cd.name == null || cd.name.isEmpty()) {
                        problems.add(p.getFileName() + ": " + td.name + " 에 이름 없는 " + cd.kind + " 제약");
                        continue;
                    }
                    checkConstraintName(p, cd.name, td.name, problems);
                }
                // 원시 개수 대 이름붙은 개수 대조(스트립 뮤테이션 탐지)
                long rawCount = countRawKeyword(readTableBodyOnly(text, td.name));
                long namedCount = td.constraints.stream()
                    .filter(cd -> cd.name != null && !cd.name.isEmpty())
                    .filter(cd -> cd.kind.equals("PRIMARY KEY") || cd.kind.equals("FOREIGN KEY") || cd.kind.equals("CHECK"))
                    .count();
                if (rawCount != namedCount)
                    problems.add(p.getFileName() + ": " + td.name + " 원시 PK/FK/CHECK 개수(" + rawCount + ") != 이름붙은 개수(" + namedCount + ")");
            }
            for (IndexDef ix : idxs) checkConstraintName(p, ix.name, ix.table, problems);
            for (ConstraintDef cd : alterFks) checkConstraintName(p, cd.name, cd.ownerTable, problems);
        }
        if (problems.isEmpty()) pass("i", "모든 제약·인덱스 이름이 PK_/FK_/UX_/IX_/CK_ 접두·128자 이하·대문자·테이블명 포함을 만족, 이름 없는 제약 0건");
        else fail("i", problems.size() + "건: " + problems);
    }

    static void checkConstraintName(Path file, String name, String table, List<String> problems) {
        if (name.length() > 128) problems.add(file.getFileName() + ": " + name + " 128자 초과");
        if (!name.equals(name.toUpperCase())) problems.add(file.getFileName() + ": " + name + " 대문자 아님");
        if (!name.matches("^(PK|FK|UX|IX|CK)_.*")) {
            problems.add(file.getFileName() + ": " + name + " PK_/FK_/UX_/IX_/CK_ 접두 아님");
            return;
        }
        if (!name.contains(table)) problems.add(file.getFileName() + ": " + name + " 에 테이블명(" + table + ") 없음");
    }

    static String readTableBodyOnly(String text, String tableName) {
        Matcher m = Pattern.compile("CREATE TABLE\\s+" + Pattern.quote(tableName) + "\\s*\\(", Pattern.CASE_INSENSITIVE).matcher(text);
        if (!m.find()) return "";
        int openIdx = m.end() - 1;
        return extractBalanced(text, openIdx);
    }

    static long countRawKeyword(String tableBody) {
        long n = 0;
        for (String item : splitTopLevel(tableBody)) {
            String up = item.trim().toUpperCase();
            if (up.startsWith("PRIMARY KEY") || up.startsWith("FOREIGN KEY") || up.startsWith("CHECK")) n++;
            else {
                Matcher named = Pattern.compile("^CONSTRAINT\\s+(\\w+)\\s+(PRIMARY KEY|FOREIGN KEY|CHECK)", Pattern.CASE_INSENSITIVE).matcher(item.trim());
                if (named.find()) { n++; continue; }
                // 칼럼 정의 줄 안의 인라인 PK(AUTOINCREMENT)·CHECK(JSONV 토큰 등)
                Matcher pkm = Pattern.compile("CONSTRAINT\\s+(\\w+)\\s+PRIMARY KEY", Pattern.CASE_INSENSITIVE).matcher(item);
                if (pkm.find()) n++;
                Matcher ckm = Pattern.compile("CONSTRAINT\\s+(\\w+)\\s+CHECK", Pattern.CASE_INSENSITIVE).matcher(item);
                if (ckm.find()) n++;
            }
        }
        return n;
    }

    // ───────────────────────── 체크 j ─────────────────────────

    static void checkJ() throws Exception {
        String jdk = System.getenv().getOrDefault("JDK21_HOME", "/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home");
        ProcessBuilder pb = new ProcessBuilder("./gradlew", "testAll", "--no-daemon");
        pb.directory(new File("src/backend"));
        pb.environment().put("JAVA_HOME", jdk);
        pb.redirectErrorStream(true);
        Process proc = pb.start();
        StringBuilder out = new StringBuilder();
        try (BufferedReader r = new BufferedReader(new InputStreamReader(proc.getInputStream()))) {
            String line;
            while ((line = r.readLine()) != null) { out.append(line).append("\n"); if (out.length() < 20000) System.out.println(line); }
        }
        int code = proc.waitFor();
        if (code == 0) pass("j", "gradlew testAll 종료코드 0(전체 통과)");
        else fail("j", "gradlew testAll 종료코드 " + code + " (마지막 출력 일부는 위 로그 참조)");
    }
}
