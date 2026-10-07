package com.dongkuk.dmes.mdm.measure;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import javax.sql.DataSource;

/**
 * P3·P4 데이터 — 저장소 스냅샷({@code db-snapshot/MDMAPUSER/*.csv}, {@code MDM_MEASURE_SNAPSHOT_DIR})의 용어·도메인·컬럼·시스템 매핑을
 * 원래 ID 그대로 시험 PDB 의 MDMAPUSER 로 적재한다. 시험 DB(Spring 데이터소스 = 하니스가 넘긴 {@code dmes.ora.url} 의 MDMAPUSER) 에 JDBC 로 붙는다.
 *
 * <p>합성 데이터를 쓰지 않는 이유: 변경 쪽 DB 1차 거름(LIKE)의 후보 행 수는 글자 모양(JSON 원문의 역슬래시·null, 약어·동의어 분포)에 달려
 * 있어 합성 분포로는 실제 후보 수를 재현하지 못한다(예: perf-mdm-backend.md P3 의 'coil' 후보 249행 대 실제 일치 29행).
 * 스냅샷이 없으면 실패한다(합성으로 몰래 바꾸지 않는다).
 *
 * <p><b>왜 {@code snapshot.py import} 를 측정 전에 한 번 돌리는 방식이 아닌가</b>: 시험 기반 {@code MdmSharedTestDb} 는 JVM 당 한 번 스키마를
 * Flyway clean + migrate 하고 시험 클래스마다 모든 행을 지운다. 측정 JVM 이 뜨기 전에 PDB 에 적재해 둔 행은 그때 모두 사라진다.
 * 그래서 같은 CSV 를 측정 클래스 안에서({@code snapshot.py} 와 같은 규칙으로) 읽어 넣는다 — 별도 PDB 를 하나 더 열지 않아도 된다(열린 PDB 상한 3).
 *
 * <p>규칙은 {@code scripts/db-snapshot/snapshot.py} 의 import 와 같다: NULL 은 {@code \N}, 백슬래시로 시작하는 값은 백슬래시를 하나 더 붙임,
 * 빈 문자열은 NULL, 일시 칸의 숫자(epoch 초·밀리초)는 KST, 대상 표에 없는 CSV 칸은 무시, 적재 뒤 IDENTITY 를 최대값 다음으로 맞춤.
 * 스냅샷은 {@code TB_MDM_TERM.EMBEDDING·EMBEDDING_MODEL} 을 NULL 로 내보낸다 — Oracle 에서는 BLOB 이 4,000바이트를 넘으면 표 밖에 저장되므로
 * 표 훑기 비용에 거의 들지 않아 채워 넣지 않는다(예전 SQLite 측정과 같은 조건이 아니다 — README §2.2).
 */
final class SourceDb {

    /** 시험 PDB 접두. 이 접두는 허용 이름 없이도 쓴다(MdmSharedTestDb 와 같은 규칙). */
    private static final String TEST_PDB_PREFIX = "T_";
    private static final Set<String> NEVER = Set.of("FREEPDB1", "CDB$ROOT", "PDB$SEED");
    private static final List<String> NEVER_PREFIXES = List.of("L_", "TPL_");
    private static final String APP_USER = "MDMAPUSER";

    static final String TERM = "TB_MDM_TERM";
    static final String DOMAIN = "TB_MDM_DOMAIN";
    static final String COLUMN = "TB_MDM_COLUMN";
    static final String MAPPING = "TB_MDM_COLUMN_SYSTEM";
    /** 도메인이 네 표 밖(TB_MDM_CODE·TB_MDM_UNIT)을 가리키는 FK — Oracle 기준선 V1 의 이름. */
    private static final List<String> DOMAIN_OUTER_FKS = List.of("FK_TB_MDM_DOMAIN_CODE", "FK_TB_MDM_DOMAIN_UNIT");

    /** P4 의 저장 시나리오가 새로 만드는 컬럼 — 스냅샷에 이미 있으므로 옮기지 않는다(있으면 save 가 COLUMN_DUPLICATED 로 일찍 끝난다). */
    static final String SAVE_COLUMN_NAME = "원재료 코일 두께";
    static final String SAVE_PHYS_NAME = "RMTL_COIL_THK";

    /** 마른 실행(dry-run)에서 옮기는 용어·컬럼 행 수 상한. */
    static final int DRY_LIMIT = 50;

    private static final int BATCH = 500;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final Pattern INT_RE = Pattern.compile("^[+-]?\\d+$");
    private static final Pattern NUM_RE = Pattern.compile("^[+-]?\\d+(\\.\\d+)?([eE][+-]?\\d+)?$");
    private static final Pattern TS_RE = Pattern.compile(
            "^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:[ T](\\d{1,2}):(\\d{2})(?::(\\d{2})(?:[.,](\\d+))?)?)?\\s*(Z|[+-]\\d{2}:?\\d{2})?$");

    private SourceDb() {
    }

    /** 스냅샷 폴더({@code db-snapshot/MDMAPUSER}). run-measure.sh 가 {@code MDM_MEASURE_SNAPSHOT_DIR} 로 넣는다. */
    static Path dir() {
        String p = System.getenv("MDM_MEASURE_SNAPSHOT_DIR");
        if (p == null || p.isBlank()) {
            throw new IllegalStateException("MDM_MEASURE_SNAPSHOT_DIR(db-snapshot/MDMAPUSER 폴더 경로)가 필요하다 — run-measure.sh 가 넣는다");
        }
        Path path = Path.of(p);
        for (String t : new String[] {TERM, DOMAIN, COLUMN, MAPPING}) {
            if (!Files.isRegularFile(path.resolve(t + ".csv"))) {
                throw new IllegalStateException("스냅샷 CSV 가 없다: " + path.resolve(t + ".csv"));
            }
        }
        return path;
    }

    /** 결과 줄에 남기는 출처 표시 — 폴더 이름과 네 CSV 의 SHA-1 앞 12자(같은 스냅샷끼리만 비교한다). */
    static String label() {
        Path dir = dir();
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-1");
            for (String t : new String[] {TERM, DOMAIN, COLUMN, MAPPING}) {
                try (InputStream in = Files.newInputStream(dir.resolve(t + ".csv"))) {
                    byte[] buf = new byte[1 << 16];
                    for (int n; (n = in.read(buf)) > 0; ) {
                        md.update(buf, 0, n);
                    }
                }
            }
            return dir.getFileName() + ":sha1=" + HexFormat.of().formatHex(md.digest()).substring(0, 12);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /**
     * 네 표를 비우고(용어만이면 용어 표만 채운다) 스냅샷에서 옮긴다. 돌려주는 값은 표별 행 수.
     *
     * @param dictionary false 면 용어만(P3), true 면 용어·도메인·컬럼·매핑(P4)
     */
    static Map<String, Integer> load(DataSource dataSource, boolean dictionary) {
        Path dir = dir();
        int limit = MeasureSupport.dry() ? DRY_LIMIT : Integer.MAX_VALUE;
        try (Connection c = dataSource.getConnection()) {
            requireTestPdb(c);
            // 도메인 행의 UNIT_CODE·MARU_CODE_ID 는 TB_MDM_UNIT·TB_MDM_CODE 를 가리키는데, 두 표는 시험 클래스 시작 때 비워져 있고 이 하니스는
            // 네 표만 옮긴다. snapshot.py 가 적재 동안 FK 를 끄는 것처럼 이 두 FK 만 끄고, 끝나면 NOVALIDATE 로 다시 켠다(측정 지표는 두 표를 읽지 않는다).
            // ALTER 는 DDL 이라 바로 커밋되므로 트랜잭션 밖에서 한다. 끄기·적재 중 어디서 실패해도 finally 가 두 FK 를 모두 켜 본다.
            SQLException failure = null;
            try {
                SQLException off = dictionary ? setDomainOuterFks(c, false) : null;
                if (off != null) {
                    throw off;
                }
                copyAll(c, dir, limit, dictionary);
            } catch (SQLException e) {
                failure = e;
            } catch (RuntimeException e) {
                if (dictionary) {
                    SQLException restore = setDomainOuterFks(c, true);
                    if (restore != null) {
                        e.addSuppressed(restore);
                    }
                }
                throw e;
            }
            if (dictionary) {
                SQLException restore = setDomainOuterFks(c, true);
                if (failure == null) {
                    failure = restore;
                } else if (restore != null) {
                    failure.addSuppressed(restore);
                }
            }
            if (failure != null) {
                throw failure;
            }
            resetIdentities(c, dictionary ? new String[] {TERM, DOMAIN, COLUMN} : new String[] {TERM});
            Map<String, Integer> counts = new LinkedHashMap<>();
            try (Statement st = c.createStatement()) {
                for (String t : new String[] {TERM, DOMAIN, COLUMN, MAPPING}) {
                    try (ResultSet rs = st.executeQuery("SELECT COUNT(*) FROM " + t)) {
                        rs.next();
                        counts.put(t, rs.getInt(1));
                    }
                }
            }
            return counts;
        } catch (SQLException e) {
            throw new IllegalStateException("스냅샷 적재 실패: " + e.getMessage(), e);
        }
    }

    /**
     * 도메인이 이 하니스 밖의 표(TB_MDM_UNIT·TB_MDM_CODE)를 가리키는 FK 두 개를 끄거나(NOVALIDATE 로) 켠다.
     * FK 마다 따로 시도하고, 실패는 던지지 않고 첫 예외에 나머지를 붙여 돌려준다(없으면 null).
     */
    private static SQLException setDomainOuterFks(Connection c, boolean enable) {
        SQLException first = null;
        for (String fk : DOMAIN_OUTER_FKS) {
            try (Statement st = c.createStatement()) {
                st.execute("ALTER TABLE " + DOMAIN + (enable ? " ENABLE NOVALIDATE" : " DISABLE") + " CONSTRAINT " + fk);
            } catch (SQLException e) {
                if (first == null) {
                    first = e;
                } else {
                    first.addSuppressed(e);
                }
            }
        }
        return first;
    }

    /** 네 표를 한 트랜잭션으로 비우고 채운다. */
    private static void copyAll(Connection c, Path dir, int limit, boolean dictionary) throws SQLException {
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(false);
        try (Statement st = c.createStatement()) {
            // 자식 → 부모 순서. 이 네 표를 가리키는 다른 표의 행은 시험 클래스 시작 때 모두 지워져 있다(MdmSharedTestDb).
            for (String t : new String[] {MAPPING, COLUMN, TERM, DOMAIN}) {
                st.executeUpdate("DELETE FROM " + t);
            }
            // 부모 → 자식 순서(도메인 자기 참조 FK 는 한 문 끝에 검사되지만 배치가 여러 번이면 부모가 먼저 들어가야 한다).
            if (dictionary) {
                copy(c, DOMAIN, dir, Integer.MAX_VALUE, null, null);
            }
            copy(c, TERM, dir, limit, null, null);
            Set<String> columnIds = new HashSet<>();
            if (dictionary) {
                copy(c, COLUMN, dir, limit, row -> !SAVE_COLUMN_NAME.equals(row.get("COLUMN_NAME"))
                        && !SAVE_PHYS_NAME.equals(row.get("PHYS_NAME")), columnIds);
                copy(c, MAPPING, dir, Integer.MAX_VALUE, row -> columnIds.contains(row.get("COLUMN_ID")), null);
            }
            c.commit();
        } catch (SQLException | RuntimeException e) {
            c.rollback();
            throw e;
        } finally {
            c.setAutoCommit(auto);
        }
    }

    // ── 안전장치 ─────────────────────────────────────────────────────────

    /**
     * 지우기 전에 늘 본다 — 실제 접속한 PDB 가 시험 PDB({@code T_*}, 또는 시스템 속성 {@code dmes.ora.allowReset=<PDB 이름>} 과 이름이 같은 PDB)이고
     * 스키마가 MDMAPUSER 인가. FREEPDB1·CDB$ROOT·PDB$SEED·TPL_*·L_* 는 늘 거부한다(MdmSharedTestDb 와 같은 규칙).
     */
    static void requireTestPdb(Connection c) throws SQLException {
        String pdb;
        String schema;
        String user;
        try (Statement st = c.createStatement();
             ResultSet rs = st.executeQuery("SELECT SYS_CONTEXT('USERENV', 'CON_NAME'), SYS_CONTEXT('USERENV', 'CURRENT_SCHEMA'),"
                     + " SYS_CONTEXT('USERENV', 'SESSION_USER') FROM DUAL")) {
            rs.next();
            pdb = rs.getString(1);
            schema = rs.getString(2);
            user = rs.getString(3);
        }
        String name = pdb == null ? "" : pdb.strip().toUpperCase(Locale.ROOT);
        if (name.isEmpty() || NEVER.contains(name) || NEVER_PREFIXES.stream().anyMatch(name::startsWith)) {
            throw new IllegalStateException("접속한 PDB 가 " + pdb + " 이다 — 이 PDB 의 표는 지우지 않는다(FREEPDB1·CDB$ROOT·PDB$SEED·TPL_*·L_*)."
                    + " 시험 PDB(T_*)로 돌린다.");
        }
        if (!name.startsWith(TEST_PDB_PREFIX)) {
            String allowed = System.getProperty("dmes.ora.allowReset");
            if (allowed == null || !allowed.strip().equalsIgnoreCase(name)) {
                throw new IllegalStateException("접속한 PDB 가 " + pdb + " 이다 — T_ 로 시작하는 시험 PDB 만 쓴다."
                        + " 레인이 정한 이 PDB 를 써도 되면 시스템 속성 dmes.ora.allowReset=" + name + " 이 필요하다.");
            }
        }
        // 로그인 사용자도 본다 — 다른 사용자가 CURRENT_SCHEMA 만 바꾼 연결이면 USER_* 조회(IDENTITY 재설정)가 빈 결과로 조용히 건너뛴다.
        if (!APP_USER.equalsIgnoreCase(schema) || !APP_USER.equalsIgnoreCase(user)) {
            throw new IllegalStateException("접속 스키마가 " + schema + ", 로그인 사용자가 " + user + " 이다 — " + APP_USER + " 로만 접속한다.");
        }
    }

    // ── 표 하나 적재 ─────────────────────────────────────────────────────

    private interface RowFilter {
        boolean keep(Map<String, String> row);
    }

    /**
     * CSV 한 개를 표에 넣는다. CSV 칸 ∩ 표 칸만 넣는다. filter 가 거짓이면 그 행은 넣지 않고, keepIds 가 있으면 넣은 행의 COLUMN_ID 를 모은다.
     * limit 은 넣을 행 수 상한(filter 를 통과한 행 기준).
     * snapshot.py 와 달리 PK 칸이 빈 행을 건너뛰지 않는다 — 대상 네 표의 스냅샷에는 그런 행이 없고, 생기면 ORA-01400 으로 바로 드러나게 둔다.
     */
    private static void copy(Connection c, String table, Path dir, int limit, RowFilter filter, Set<String> keepIds) throws SQLException {
        Path file = dir.resolve(table + ".csv");
        Map<String, Integer> types = columnTypes(c, table);
        try (BufferedReader reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
            List<String> header = readRecord(reader);
            if (header == null) {
                throw new IllegalStateException("빈 CSV: " + file);
            }
            List<Integer> use = new ArrayList<>();
            for (int i = 0; i < header.size(); i++) {
                if (types.containsKey(header.get(i))) {
                    use.add(i);
                }
            }
            StringBuilder cols = new StringBuilder();
            StringBuilder marks = new StringBuilder();
            for (int i : use) {
                cols.append(cols.isEmpty() ? "" : ", ").append('"').append(header.get(i)).append('"');
                marks.append(marks.isEmpty() ? "?" : ", ?");
            }
            String sql = "INSERT INTO " + table + " (" + cols + ") VALUES (" + marks + ")";
            int idCol = header.indexOf("COLUMN_ID");
            int line = 1;
            int inBatch = 0;
            int inserted = 0;
            try (PreparedStatement ps = c.prepareStatement(sql)) {
                for (List<String> rec; inserted < limit && (rec = readRecord(reader)) != null; ) {
                    line++;
                    if (rec.size() == 1 && rec.get(0).isEmpty()) {
                        continue; // 빈 줄
                    }
                    List<String> row = new ArrayList<>(header.size());
                    for (int i = 0; i < header.size(); i++) {
                        row.add(i < rec.size() ? decode(rec.get(i)) : null);
                    }
                    if (filter != null) {
                        Map<String, String> named = new LinkedHashMap<>();
                        for (int i = 0; i < header.size(); i++) {
                            named.put(header.get(i), row.get(i));
                        }
                        if (!filter.keep(named)) {
                            continue;
                        }
                    }
                    for (int k = 0; k < use.size(); k++) {
                        int i = use.get(k);
                        bind(ps, k + 1, types.get(header.get(i)), row.get(i), table, header.get(i), line);
                    }
                    ps.addBatch();
                    if (keepIds != null && idCol >= 0) {
                        keepIds.add(row.get(idCol));
                    }
                    inserted++;
                    if (++inBatch >= BATCH) {
                        ps.executeBatch();
                        inBatch = 0;
                    }
                }
                if (inBatch > 0) {
                    ps.executeBatch();
                }
            }
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    private static Map<String, Integer> columnTypes(Connection c, String table) throws SQLException {
        Map<String, Integer> out = new LinkedHashMap<>();
        try (Statement st = c.createStatement(); ResultSet rs = st.executeQuery("SELECT * FROM " + table + " WHERE 1 = 0")) {
            ResultSetMetaData md = rs.getMetaData();
            for (int i = 1; i <= md.getColumnCount(); i++) {
                out.put(md.getColumnName(i), md.getColumnType(i));
            }
        }
        return out;
    }

    /** 대상 칸의 JDBC 종류로 값을 바꿔 묶는다. 바꾸지 못하는 값은 NULL 로 두지 않고 바로 실패한다(측정 데이터가 몰래 달라지지 않게). */
    private static void bind(PreparedStatement ps, int idx, int type, String v, String table, String col, int line) throws SQLException {
        try {
            switch (type) {
                case Types.BLOB, Types.BINARY, Types.VARBINARY, Types.LONGVARBINARY -> {
                    if (v == null || v.isBlank()) {
                        ps.setNull(idx, type);
                    } else {
                        ps.setBytes(idx, v.startsWith("b64:") ? Base64.getDecoder().decode(v.substring(4).strip())
                                : v.getBytes(StandardCharsets.UTF_8));
                    }
                }
                case Types.CLOB, Types.NCLOB, Types.VARCHAR, Types.NVARCHAR, Types.CHAR, Types.NCHAR, Types.LONGVARCHAR -> {
                    if (v == null || v.isEmpty()) { // Oracle 규칙: 빈 문자열 = NULL
                        ps.setNull(idx, type == Types.CLOB || type == Types.NCLOB ? Types.VARCHAR : type);
                    } else {
                        ps.setString(idx, v);
                    }
                }
                case Types.TIMESTAMP, Types.DATE, Types.TIME, Types.TIMESTAMP_WITH_TIMEZONE, -101, -102 -> {
                    if (v == null || v.isBlank()) {
                        ps.setNull(idx, Types.TIMESTAMP);
                    } else {
                        ps.setTimestamp(idx, timestamp(v.strip()));
                    }
                }
                case Types.BOOLEAN -> {
                    if (v == null || v.isBlank()) {
                        ps.setNull(idx, Types.BOOLEAN);
                    } else {
                        ps.setBoolean(idx, bool(v.strip()));
                    }
                }
                default -> { // 숫자 계열(NUMBER·BINARY_DOUBLE 등)
                    if (v == null || v.isBlank()) {
                        ps.setNull(idx, Types.NUMERIC);
                    } else {
                        String s = v.strip();
                        if (INT_RE.matcher(s).matches()) {
                            ps.setLong(idx, Long.parseLong(s));
                        } else if (NUM_RE.matcher(s).matches()) {
                            ps.setBigDecimal(idx, new BigDecimal(s));
                        } else if (isBoolWord(s)) {
                            ps.setInt(idx, bool(s) ? 1 : 0);
                        } else {
                            throw new IllegalArgumentException("숫자가 아니다");
                        }
                    }
                }
            }
        } catch (RuntimeException e) {
            String shown = v == null ? "NULL" : v.length() > 60 ? v.substring(0, 60) + "…" : v;
            throw new IllegalStateException(table + "." + col + " CSV " + line + "째 레코드의 값을 바꾸지 못했다(" + e.getMessage() + "): " + shown, e);
        }
    }

    private static boolean isBoolWord(String s) {
        return switch (s.toLowerCase(Locale.ROOT)) {
            case "true", "t", "y", "yes", "false", "f", "n", "no" -> true;
            default -> false;
        };
    }

    private static boolean bool(String s) {
        return switch (s.toLowerCase(Locale.ROOT)) {
            case "1", "true", "t", "y", "yes" -> true;
            case "0", "false", "f", "n", "no" -> false;
            default -> throw new IllegalArgumentException("불리언이 아니다");
        };
    }

    /** snapshot.py Conv._ts 와 같다 — 숫자는 epoch(밀리초면 ≥1e11)로 보고 KST, 문자열은 그대로(시간대 표기가 있으면 KST 로 환산). */
    private static Timestamp timestamp(String s) {
        if (NUM_RE.matcher(s).matches()) {
            double x = Double.parseDouble(s);
            long millis = Math.abs(x) >= 1e11 ? (long) x : (long) (x * 1000.0);
            return Timestamp.valueOf(LocalDateTime.ofInstant(Instant.ofEpochMilli(millis), KST));
        }
        Matcher m = TS_RE.matcher(s);
        if (!m.matches()) {
            throw new IllegalArgumentException("일시 형식이 아니다");
        }
        int micro = m.group(7) == null ? 0 : Integer.parseInt((m.group(7) + "000000").substring(0, 6));
        LocalDateTime v = LocalDateTime.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)),
                m.group(4) == null ? 0 : Integer.parseInt(m.group(4)), m.group(5) == null ? 0 : Integer.parseInt(m.group(5)),
                m.group(6) == null ? 0 : Integer.parseInt(m.group(6)), micro * 1000);
        String off = m.group(8);
        if (off != null) {
            ZoneOffset zo = "Z".equals(off) ? ZoneOffset.UTC : ZoneOffset.of(off.length() == 5 ? off.substring(0, 3) + ":" + off.substring(3) : off);
            v = LocalDateTime.ofInstant(v.toInstant(zo), KST);
        }
        return Timestamp.valueOf(v);
    }

    // ── IDENTITY ────────────────────────────────────────────────────────

    /** 적재한 최대값 다음부터 생성되게 맞춘다(snapshot.py 와 같다) — 그렇지 않으면 P4 저장이 새 ID 를 만들 때 적재한 ID 와 겹친다(ORA-00001). */
    private static void resetIdentities(Connection c, String[] tables) throws SQLException {
        boolean auto = c.getAutoCommit();
        c.setAutoCommit(true);
        try (Statement st = c.createStatement()) {
            for (String t : tables) {
                String column = null;
                String generation = null;
                boolean onNull = false;
                try (ResultSet rs = st.executeQuery("SELECT i.COLUMN_NAME, i.GENERATION_TYPE, c.DEFAULT_ON_NULL FROM USER_TAB_IDENTITY_COLS i "
                        + "JOIN USER_TAB_COLS c ON c.TABLE_NAME = i.TABLE_NAME AND c.COLUMN_NAME = i.COLUMN_NAME WHERE i.TABLE_NAME = '" + t + "'")) {
                    if (rs.next()) {
                        column = rs.getString(1);
                        generation = rs.getString(2);
                        onNull = "YES".equals(rs.getString(3));
                    }
                }
                if (column == null) {
                    continue;
                }
                st.execute("ALTER TABLE \"" + t + "\" MODIFY (\"" + column + "\" GENERATED " + ("ALWAYS".equals(generation) ? "ALWAYS" : "BY DEFAULT")
                        + (onNull ? " ON NULL" : "") + " AS IDENTITY (START WITH LIMIT VALUE))");
            }
        } finally {
            c.setAutoCommit(auto);
        }
    }

    // ── CSV(snapshot.py 가 쓰는 파이썬 csv 규칙: 쉼표 구분, 큰따옴표로 감싼 칸 안의 줄바꿈·쉼표 허용, "" 는 " 하나) ─────────

    /** NULL 은 {@code \N}, 백슬래시로 시작하는 값은 앞의 백슬래시 하나를 뗀다. */
    private static String decode(String s) {
        if ("\\N".equals(s)) {
            return null;
        }
        return s.startsWith("\\") ? s.substring(1) : s;
    }

    /** 한 레코드(칸 목록)를 읽는다. 끝이면 null. */
    private static List<String> readRecord(BufferedReader r) throws IOException {
        int ch = r.read();
        if (ch < 0) {
            return null;
        }
        List<String> fields = new ArrayList<>();
        StringBuilder sb = new StringBuilder();
        boolean quoted = false;
        for (; ch >= 0; ch = r.read()) {
            if (quoted) {
                if (ch == '"') {
                    r.mark(1);
                    int next = r.read();
                    if (next == '"') {
                        sb.append('"');
                    } else {
                        quoted = false;
                        if (next >= 0) {
                            r.reset();
                        }
                    }
                } else {
                    sb.append((char) ch);
                }
            } else if (ch == '"' && sb.isEmpty()) {
                quoted = true;
            } else if (ch == ',') {
                fields.add(sb.toString());
                sb.setLength(0);
            } else if (ch == '\n') {
                break;
            } else if (ch == '\r') {
                r.mark(1);
                int next = r.read();
                if (next != '\n' && next >= 0) {
                    r.reset();
                }
                break;
            } else {
                sb.append((char) ch);
            }
        }
        fields.add(sb.toString());
        return fields;
    }
}
