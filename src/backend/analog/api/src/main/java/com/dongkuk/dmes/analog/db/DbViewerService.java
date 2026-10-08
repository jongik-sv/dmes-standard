package com.dongkuk.dmes.analog.db;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.io.InputStream;
import java.io.Reader;
import java.sql.Blob;
import java.sql.Clob;
import java.sql.ResultSet;
import java.sql.ResultSetMetaData;
import java.sql.SQLException;
import java.sql.Types;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import java.util.stream.Stream;

/**
 * DB 뷰어 조회 서비스 (ADR-0002 D2·D3·D4).
 *
 * <p>테이블·컬럼 목록은 오라클 딕셔너리({@code ALL_TABLES}/{@code ALL_TAB_COLUMNS}/{@code ALL_CONSTRAINTS})에서 읽고,
 * 데이터 조회는 검증된 파싱 결과로 재조립한 SQL만 실행한다. 건별 감사로그를 남긴다.
 */
@Service
@ConditionalOnBean(JdbcTemplate.class)
public class DbViewerService {

    private static final Logger log = LoggerFactory.getLogger(DbViewerService.class);
    private static final Logger audit = LoggerFactory.getLogger("dbViewerAudit");

    /**
     * 컬럼 속성 + PK·FK 여부. FK_REF 는 참조 대상 {@code 스키마.테이블}(한 컬럼에 FK 가 여럿이면 하나만).
     * 참조 대상 제약을 볼 권한이 없으면 FK_YN 은 Y 이고 FK_REF 만 비어 있다.
     * 바인드 순서: 제약 조회(OWNER, TABLE_NAME) → 컬럼 조회(OWNER, TABLE_NAME).
     */
    private static final String COLUMNS_SQL = """
            WITH T_CONS AS
            (
                SELECT C.COLUMN_NAME
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'P', 'Y')) PK_YN
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'R', 'Y')) FK_YN
                     , MAX(DECODE(K.CONSTRAINT_TYPE, 'R', R.OWNER || '.' || R.TABLE_NAME)) FK_REF
                FROM   ALL_CONS_COLUMNS C
                     , ALL_CONSTRAINTS K
                     , ALL_CONSTRAINTS R
                WHERE  K.OWNER = C.OWNER
                AND    K.CONSTRAINT_NAME = C.CONSTRAINT_NAME
                AND    R.OWNER(+) = K.R_OWNER
                AND    R.CONSTRAINT_NAME(+) = K.R_CONSTRAINT_NAME
                AND    C.OWNER = ?
                AND    C.TABLE_NAME = ?
                AND    K.CONSTRAINT_TYPE IN ('P', 'R')
                GROUP BY C.COLUMN_NAME
            )
            SELECT A.COLUMN_NAME
                 , A.DATA_TYPE
                 , A.DATA_LENGTH
                 , A.NULLABLE
                 , NVL(B.PK_YN, 'N') PK_YN
                 , NVL(B.FK_YN, 'N') FK_YN
                 , B.FK_REF
            FROM   ALL_TAB_COLUMNS A
                 , T_CONS B
            WHERE  B.COLUMN_NAME(+) = A.COLUMN_NAME
            AND    A.OWNER = ?
            AND    A.TABLE_NAME = ?
            ORDER BY A.COLUMN_ID
            """;

    /** 칸 이름·형식 — 민감 칸 거르기와 LOB 칸 판별에 쓴다. */
    private static final String COLUMN_TYPES_SQL =
            "SELECT COLUMN_NAME, DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER = ? AND TABLE_NAME = ? "
                    + "ORDER BY COLUMN_ID";

    /**
     * 조회 대상의 종류 — 해당 OWNER 의 표(ALL_TABLES)·뷰(ALL_VIEWS)만 잡힌다(동의어는 안 잡힌다).
     * 'TABLE' 은 ROWID 를 가진 실제 표(IOT 아님·외부 표 아님), 'OTHER' 는 그 밖의 표와 뷰.
     * 바인드 순서: (OWNER, TABLE_NAME) → (OWNER, VIEW_NAME).
     */
    private static final String OBJECT_KIND_SQL = """
            SELECT CASE WHEN IOT_TYPE IS NULL AND EXTERNAL = 'NO' THEN 'TABLE' ELSE 'OTHER' END OBJ_KIND
            FROM   ALL_TABLES
            WHERE  OWNER = ?
            AND    TABLE_NAME = ?
            UNION ALL
            SELECT 'OTHER'
            FROM   ALL_VIEWS
            WHERE  OWNER = ?
            AND    VIEW_NAME = ?
            """;

    private final JdbcTemplate jdbcTemplate;
    private final DbViewerProperties properties;
    private final Set<String> allowedSchemas;
    private final Set<String> deniedTables;

    public DbViewerService(JdbcTemplate dbViewerJdbcTemplate, DbViewerProperties properties) {
        this.jdbcTemplate = dbViewerJdbcTemplate;
        this.properties = properties;
        this.allowedSchemas = properties.getAllowedSchemas().stream()
                .map(DbViewerValidator::normalizeSchema)
                .collect(Collectors.toUnmodifiableSet());
        // 차단 표 = 코드에 박힌 기본 + 설정 추가분(합집합). 설정으로 기본을 줄일 수 없다.
        this.deniedTables = Stream.concat(DbViewerProperties.BUILT_IN_DENIED_TABLES.stream(),
                        properties.getDeniedTables().stream())
                .filter(t -> t != null && !t.isBlank())
                .map(t -> t.trim().toUpperCase(Locale.ROOT))
                .collect(Collectors.toUnmodifiableSet());
    }

    /**
     * 감사 로그 값 이스케이프 — 줄바꿈·제어 문자를 글자로 바꿔 로그 줄 위조(주입)를 막는다.
     * 사용자 WHERE 원문이 들어가는 {@code sql=} 을 포함해 모든 감사 로그 값에 쓴다.
     */
    public static String escapeLog(Object value) {
        if (value == null) {
            return "null";
        }
        String text = value.toString();
        StringBuilder sb = null;
        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            String replacement = null;
            if (c == '\n') {
                replacement = "\\n";
            } else if (c == '\r') {
                replacement = "\\r";
            } else if (c == '\t') {
                replacement = "\\t";
            } else if (c < 0x20 || (c >= 0x7F && c < 0xA0) || c == 0x2028 || c == 0x2029) {
                replacement = String.format("\\u%04x", (int) c);
            }
            if (replacement != null && sb == null) {
                sb = new StringBuilder(text.length() + 16).append(text, 0, i);
            }
            if (sb != null) {
                if (replacement != null) {
                    sb.append(replacement);
                } else {
                    sb.append(c);
                }
            }
        }
        return sb == null ? text : sb.toString();
    }

    /** 차단 표면 400 — 모든 허용 스키마에서 표 이름만 비교한다(대문자 정규화). */
    private void checkTableNotDenied(String table) {
        String normalized = table == null ? "" : table.trim().toUpperCase(Locale.ROOT);
        if (deniedTables.contains(normalized)) {
            throw new DbViewerException(400, "조회할 수 없는 표입니다: " + normalized);
        }
    }

    public List<String> listTables(String schema) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        String owner = DbViewerValidator.normalizeSchema(schema);
        long start = System.currentTimeMillis();
        List<String> tables = jdbcTemplate.queryForList(
                        "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = ? ORDER BY TABLE_NAME", String.class, owner)
                .stream()
                .filter(t -> !deniedTables.contains(t.trim().toUpperCase(Locale.ROOT)))
                .toList();
        audit.info("tables schema={} count={} ms={}", escapeLog(owner), tables.size(),
                System.currentTimeMillis() - start);
        return tables;
    }

    public List<Map<String, Object>> listColumns(String schema, String table) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        DbViewerValidator.checkIdentifier("테이블", table);
        String owner = DbViewerValidator.normalizeSchema(schema);
        String tableName = table.trim().toUpperCase(Locale.ROOT);
        checkTableNotDenied(tableName);
        long start = System.currentTimeMillis();
        List<Map<String, Object>> columns = jdbcTemplate.queryForList(COLUMNS_SQL,
                owner, tableName, owner, tableName);
        audit.info("columns {}.{} count={} ms={}", escapeLog(owner), escapeLog(tableName), columns.size(),
                System.currentTimeMillis() - start);
        return columns;
    }

    /** 자유 SQL 실행 — 파싱·재조립 후 실행한다. */
    public QueryResult query(String sql) {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(sql, allowedSchemas);
        checkTableNotDenied(parsed.table());
        return run(parsed, parsed.star() ? null : parsed.columns(), properties.getMaxRows());
    }

    /**
     * 「더보기」 묶음 — 같은 SQL 을 정렬을 고정해 {@code offset} 번째 행부터 한 묶음 읽는다.
     * 검사·재조립 경로는 첫 조회와 같고(스키마 허용 목록·차단 표·민감 칸·읽기 전용), 정렬 키는 딕셔너리로만 정한다.
     * 한 결과의 전체 행 수는 {@code analog.db.max-rows-all} 까지다.
     */
    public QueryResult queryMore(String sql, Integer offset, Integer chunk) {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(sql, allowedSchemas);
        checkTableNotDenied(parsed.table());
        return runMore(parsed, parsed.star() ? null : parsed.columns(), offset, chunk);
    }

    /** 구조화 조회 — 스키마·테이블·컬럼·건수 지정. */
    public QueryResult queryStructured(String schema, String table, List<String> columns, Integer limit) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        DbViewerValidator.checkIdentifier("테이블", table);
        String owner = DbViewerValidator.normalizeSchema(schema);
        String tableName = table.trim().toUpperCase(Locale.ROOT);
        checkTableNotDenied(tableName);
        List<String> requested = null;
        if (columns != null && !columns.isEmpty()) {
            requested = columns.stream()
                    .map(c -> {
                        DbViewerValidator.checkIdentifier("컬럼", c);
                        return c.trim().toUpperCase(Locale.ROOT);
                    })
                    .toList();
        }
        int capped = Math.max(1, Math.min(
                limit == null || limit <= 0 ? properties.getMaxRows() : limit, properties.getMaxRows()));
        DbViewerValidator.ParsedQuery parsed =
                new DbViewerValidator.ParsedQuery(owner, tableName, requested == null, requested, null);
        return run(parsed, requested, capped);
    }

    /** 확정 칸 목록과 ROWID 여부 — {@link #plan} 의 결과. */
    private record ColumnPlan(List<String> columns, boolean withRowId, boolean heapTable) {
    }

    /** 기본키 칸 — 정렬 기준이 필요한데 ROWID 를 못 쓰는 대상(뷰·IOT·외부 표)용. 바인드: (OWNER, TABLE_NAME). */
    private static final String PK_COLUMNS_SQL = """
            SELECT C.COLUMN_NAME
            FROM   ALL_CONSTRAINTS K
                 , ALL_CONS_COLUMNS C
            WHERE  K.OWNER = C.OWNER
            AND    K.CONSTRAINT_NAME = C.CONSTRAINT_NAME
            AND    K.CONSTRAINT_TYPE = 'P'
            AND    K.OWNER = ?
            AND    K.TABLE_NAME = ?
            ORDER BY C.POSITION
            """;

    private enum ObjectKind { NONE, TABLE, OTHER }

    private QueryResult run(DbViewerValidator.ParsedQuery parsed, List<String> requested, int limit) {
        ColumnPlan plan = plan(parsed.schema(), parsed.table(), requested);
        // 더보기 여부를 알려고 한 건 더 읽고, 화면에는 limit 건만 돌려준다.
        String finalSql = DbViewerValidator.buildSql(parsed, plan.columns(), limit + 1, plan.withRowId());
        QueryResult read = execute(parsed, plan.columns(), finalSql, plan.withRowId(), limit + 1);
        boolean hasMore = read.rows().size() > limit;
        String blocked = null;
        if (hasMore && orderKeys(parsed.schema(), parsed.table(), plan.heapTable()).isEmpty()) {
            blocked = MORE_BLOCKED_NO_KEY;
        }
        return read.paged(limit, hasMore, blocked, false);
    }

    /** 정렬 기준 칸이 없어 이어 볼 수 없다는 안내. */
    static final String MORE_BLOCKED_NO_KEY = "ROWID·기본키가 없는 대상이라 이어 볼 수 없습니다. WHERE 로 좁혀 주세요.";

    private QueryResult runMore(DbViewerValidator.ParsedQuery parsed, List<String> requested, Integer offset,
                                Integer chunk) {
        int all = properties.getMaxRowsAll();
        int off = offset == null ? 0 : offset;
        if (off < 0 || off >= all) {
            throw new DbViewerException(400, "offset 이 범위를 벗어났습니다. (0 이상 " + all + " 미만)");
        }
        int size = chunk == null || chunk <= 0 ? properties.getMoreChunk()
                : Math.min(chunk, properties.getMoreChunk());
        int fetch = Math.min(size, all - off);
        ColumnPlan plan = plan(parsed.schema(), parsed.table(), requested);
        List<String> keys = orderKeys(parsed.schema(), parsed.table(), plan.heapTable());
        if (keys.isEmpty()) {
            throw new DbViewerException(400, MORE_BLOCKED_NO_KEY);
        }
        String finalSql = DbViewerValidator.buildPagedSql(parsed, plan.columns(), plan.withRowId(), keys, off,
                fetch + 1);
        QueryResult read = execute(parsed, plan.columns(), finalSql, plan.withRowId(), fetch + 1);
        boolean more = read.rows().size() > fetch;
        boolean capReached = more && off + fetch >= all;
        return read.paged(fetch, more && !capReached, null, capReached);
    }

    /**
     * 이어 보기 정렬 기준 — 실제 표는 ROWID, 아니면 기본키 칸(민감 칸이 섞였거나 식별자 형식이 아니면 쓰지 않는다).
     * 없으면 빈 목록이며 더보기를 막는다.
     */
    private List<String> orderKeys(String owner, String table, boolean heapTable) {
        if (heapTable) {
            return List.of(DbViewerValidator.ORDER_BY_ROWID);
        }
        List<String> pk = jdbcTemplate.queryForList(PK_COLUMNS_SQL, String.class, owner, table);
        if (pk == null || pk.isEmpty()) {
            return List.of();
        }
        for (String column : pk) {
            if (column == null || DbViewerValidator.isSensitiveColumn(column) || !PK_IDENT.matcher(column).matches()) {
                return List.of();
            }
        }
        return List.copyOf(pk);
    }

    private static final java.util.regex.Pattern PK_IDENT = java.util.regex.Pattern.compile("[A-Z][A-Z0-9_$#]{0,29}");

    /**
     * 모든 조회 경로(자유 SQL 의 {@code *}·명시 칸, 구조화 조회의 빈 목록·명시 칸)의 칸 목록을
     * SQL 을 만들기 직전 이 한 곳에서 거른다.
     *
     * <ul>
     *   <li>대상이 해당 OWNER 의 표·뷰로 사전에 없으면(동의어 포함) 404.</li>
     *   <li>{@code requested} 가 null·빈 목록이면 사전 칸 전체에서 민감 칸을 빼고, 명시 칸에 민감 칸이 있으면 400.</li>
     *   <li>ROWID 는 조회 칸 중 LOB·RAW 형이 하나라도 있고 대상이 실제 표일 때만 더한다.</li>
     * </ul>
     */
    private ColumnPlan plan(String owner, String table, List<String> requested) {
        ObjectKind kind = objectKind(owner, table);
        if (kind == ObjectKind.NONE) {
            throw new DbViewerException(404, "테이블 또는 컬럼을 찾을 수 없습니다: " + table);
        }
        Map<String, String> types = new LinkedHashMap<>();
        for (Map<String, Object> row : jdbcTemplate.queryForList(COLUMN_TYPES_SQL, owner, table)) {
            Object name = row.get("COLUMN_NAME");
            Object type = row.get("DATA_TYPE");
            if (name != null) {
                types.put(name.toString(), type == null ? null : type.toString());
            }
        }
        boolean expand = requested == null || requested.isEmpty();
        List<String> candidates = expand ? new ArrayList<>(types.keySet()) : requested;
        List<String> columns = new ArrayList<>();
        for (String column : candidates) {
            if (DbViewerValidator.isSensitiveColumn(column)) {
                if (expand) {
                    continue;
                }
                throw new DbViewerException(400, "컬럼에 민감 정보가 포함되어 조회할 수 없습니다.");
            }
            columns.add(column);
        }
        if (columns.isEmpty()) {
            throw new DbViewerException(400, "테이블에 조회 가능한 컬럼이 없습니다: " + table);
        }
        boolean hasLob = columns.stream().anyMatch(c -> DbViewerLobSupport.LobKind.fromDataType(types.get(c)) != null);
        return new ColumnPlan(List.copyOf(columns), hasLob && kind == ObjectKind.TABLE, kind == ObjectKind.TABLE);
    }

    private ObjectKind objectKind(String owner, String table) {
        List<String> kinds = jdbcTemplate.queryForList(OBJECT_KIND_SQL, String.class, owner, table, owner, table);
        if (kinds == null || kinds.isEmpty()) {
            return ObjectKind.NONE;
        }
        return kinds.contains("TABLE") ? ObjectKind.TABLE : ObjectKind.OTHER;
    }

    private QueryResult execute(DbViewerValidator.ParsedQuery parsed, List<String> columns, String finalSql,
                                boolean withRowId, int readCap) {
        long start = System.currentTimeMillis();
        // FETCH 상한과 별개로 드라이버·추출 단계에서도 상한을 강제한다
        // (SQL 텍스트 우회 시에도 JVM 적재 폭주 방지 — 방어 심화).
        final int hardCap = readCap;
        final Map<String, String> lobColumns = new LinkedHashMap<>();
        ResultSetExtractor<List<Map<String, Object>>> extractor = rs -> extractRows(rs, hardCap, lobColumns);
        List<Map<String, Object>> rows = jdbcTemplate.query(finalSql, extractor);
        long elapsed = System.currentTimeMillis() - start;
        // 감사 로그 값은 모두 이스케이프한다 — sql= 에는 사용자 WHERE 원문이 들어간다.
        audit.info("query {}.{} cols={} rows={} lobs={} ms={} sql={}", escapeLog(parsed.schema()),
                escapeLog(parsed.table()), columns.size(), rows.size(), lobColumns.size(), elapsed,
                escapeLog(finalSql));
        return new QueryResult(columns, rows, rows.size(), elapsed, finalSql, parsed.schema(), parsed.table(),
                withRowId ? DbViewerValidator.ROWID_KEY : null, lobColumns);
    }

    /**
     * 결과 집합을 행 Map 목록으로 읽는다(시험에서 목 ResultSet 으로 직접 실행한다).
     *
     * <p>오라클 드라이버는 LONG 스트림을 같은 행의 다른 칸을 읽기 전에 읽어야 한다(ORA-17027) —
     * LONG 글 칸을 행마다 첫 단계에서 읽는다. LONG RAW 는 읽지 않고 종류 이름만 쓴다(상세 창에서만 읽는다).
     * 행 Map 순서는 select 목록을 지킨다.
     */
    static List<Map<String, Object>> extractRows(ResultSet rs, int hardCap, Map<String, String> lobColumns)
            throws SQLException {
        List<Map<String, Object>> out = new ArrayList<>();
        ResultSetMetaData meta = rs.getMetaData();
        int count = meta.getColumnCount();
        String[] labels = new String[count + 1];
        DbViewerLobSupport.LobKind[] kinds = new DbViewerLobSupport.LobKind[count + 1];
        boolean[] longText = new boolean[count + 1];
        for (int i = 1; i <= count; i++) {
            labels[i] = meta.getColumnLabel(i);
            kinds[i] = DbViewerLobSupport.kindOf(meta, i);
            if (kinds[i] != null) {
                lobColumns.put(labels[i], kinds[i].label());
            } else {
                int type = meta.getColumnType(i);
                longText[i] = type == Types.LONGVARCHAR || type == Types.LONGNVARCHAR;
            }
        }
        // 응답 하나 전체의 CLOB 미리 보기 글자 예산 — 행·칸이 많아도 응답이 불어나지 않게 한다.
        DbViewerLobSupport.PreviewBudget budget =
                new DbViewerLobSupport.PreviewBudget(DbViewerLobSupport.RESPONSE_PREVIEW_BUDGET);
        while (out.size() < hardCap && rs.next()) {
            Object[] values = new Object[count + 1];
            for (int i = 1; i <= count; i++) {
                if (longText[i]) {
                    values[i] = rs.getString(i);
                }
            }
            for (int i = 1; i <= count; i++) {
                if (longText[i]) {
                    continue;
                }
                if (kinds[i] != null) {
                    values[i] = DbViewerLobSupport.readSummary(rs, i, kinds[i], budget);
                } else {
                    Object value = rs.getObject(i);
                    values[i] = value == null ? null : value.toString();
                }
            }
            Map<String, Object> row = new LinkedHashMap<>();
            for (int i = 1; i <= count; i++) {
                row.put(labels[i], values[i]);
            }
            out.add(row);
        }
        return out;
    }

    /** 상세 재조회 rowid 형식 — 오라클 확장 ROWID 18자. */
    private static final java.util.regex.Pattern ROWID_FORMAT = java.util.regex.Pattern.compile("[A-Za-z0-9+/]{18}");

    /**
     * LOB·RAW 한 칸 상세 재조회. 식별자는 허용 스키마·형식 검사와 딕셔너리 확인을 거친 뒤에만
     * 큰따옴표로 감싸 SQL 에 넣고, rowid 는 바인드 변수로만 넘긴다.
     */
    public DbViewerLobSupport.LobResult readLob(String schema, String table, String column, String rowid) {
        try {
            return readLobChecked(schema, table, column, rowid);
        } catch (DbViewerException e) {
            // 거부된 요청도 감사 로그에 남긴다 — 상태 코드와 사유, 요청 값(이스케이프).
            audit.info("lob-rejected status={} reason={} schema={} table={} column={} rowid={}",
                    e.getStatusCode().value(), escapeLog(e.getReason()), escapeLog(schema), escapeLog(table),
                    escapeLog(column), escapeLog(rowid));
            throw e;
        }
    }

    private DbViewerLobSupport.LobResult readLobChecked(String schema, String table, String column, String rowid) {
        DbViewerValidator.checkSchemaAllowed(schema, allowedSchemas);
        // checkIdentifier 는 민감 칸(PASS·PWD·HASH·TOKEN·SECRET·PRIVATE)도 거부한다 — 기존 조회와 같은 400.
        DbViewerValidator.checkIdentifier("테이블", table);
        DbViewerValidator.checkIdentifier("컬럼", column);
        String owner = DbViewerValidator.normalizeSchema(schema);
        String tableName = table.trim().toUpperCase(Locale.ROOT);
        String columnName = column.trim().toUpperCase(Locale.ROOT);
        checkTableNotDenied(tableName);

        List<String> types = jdbcTemplate.queryForList(
                "SELECT DATA_TYPE FROM ALL_TAB_COLUMNS WHERE OWNER = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?",
                String.class, owner, tableName, columnName);
        if (types.isEmpty()) {
            throw new DbViewerException(404, "테이블 또는 컬럼을 찾을 수 없습니다: " + tableName + "." + columnName);
        }
        DbViewerLobSupport.LobKind kind = DbViewerLobSupport.LobKind.fromDataType(types.get(0));
        if (kind == null) {
            throw new DbViewerException(400, "LOB·RAW 칸이 아닙니다");
        }
        if (rowid == null || !ROWID_FORMAT.matcher(rowid.trim()).matches()) {
            throw new DbViewerException(400, "rowid 형식이 올바르지 않습니다.");
        }
        String rid = rowid.trim();
        if (objectKind(owner, tableName) != ObjectKind.TABLE) {
            throw new DbViewerException(400, "ROWID 로 읽을 수 있는 실제 표가 아닙니다: " + tableName);
        }

        long start = System.currentTimeMillis();
        String sql = "SELECT \"" + columnName + "\" FROM \"" + owner + "\".\"" + tableName
                + "\" WHERE ROWID = CHARTOROWID(?)";
        DbViewerLobSupport.LobResult result;
        try {
            result = jdbcTemplate.query(sql, rs -> {
                if (!rs.next()) {
                    return null;
                }
                return readLobDetail(rs, columnName, kind);
            }, rid);
        } catch (DataAccessException e) {
            // CHARTOROWID 가 형식은 맞지만 이 표의 ROWID 가 아닌 값을 거부한 경우(ORA-01410)는 행 없음으로 본다.
            if (e.getCause() instanceof SQLException se && se.getErrorCode() == 1410) {
                throw new DbViewerException(404, ROW_NOT_FOUND);
            }
            throw e;
        }
        if (result == null) {
            throw new DbViewerException(404, ROW_NOT_FOUND);
        }
        long bytes = (result.text() == null ? 0 : result.text().length())
                + (result.base64() == null ? 0 : result.base64().length())
                + (result.hex() == null ? 0 : result.hex().length());
        audit.info("lob {}.{}.{} rowid={} type={} kind={} length={} lengthKnown={} respChars={} ms={}",
                escapeLog(owner), escapeLog(tableName), escapeLog(columnName), escapeLog(rid),
                escapeLog(result.dataType()), escapeLog(result.kind()), result.length(), result.lengthKnown(),
                bytes, System.currentTimeMillis() - start);
        return result;
    }

    private static final String ROW_NOT_FOUND = "행을 찾을 수 없습니다. 다시 조회해 주세요";

    private static DbViewerLobSupport.LobResult readLobDetail(ResultSet rs, String column,
                                                              DbViewerLobSupport.LobKind kind)
            throws SQLException {
        try {
            switch (kind) {
                case CLOB, NCLOB -> {
                    Clob clob = kind == DbViewerLobSupport.LobKind.NCLOB ? rs.getNClob(1) : rs.getClob(1);
                    if (clob == null) {
                        return DbViewerLobSupport.detailFromText(column, kind, null, 0);
                    }
                    try {
                        long total = clob.length();
                        // 배열은 실제 길이와 상한 중 작은 쪽만 잡는다.
                        int cap = (int) Math.min(total, DbViewerLobSupport.DETAIL_TEXT_CHARS);
                        String text;
                        try (Reader reader = clob.getCharacterStream()) {
                            text = DbViewerLobSupport.readChars(reader, cap);
                        }
                        return DbViewerLobSupport.detailFromText(column, kind, text, total);
                    } finally {
                        DbViewerLobSupport.freeQuietly(clob);
                    }
                }
                case BLOB -> {
                    Blob blob = rs.getBlob(1);
                    if (blob == null) {
                        return DbViewerLobSupport.detailFromBytes(column, kind, null, 0, false);
                    }
                    try (InputStream in = blob.getBinaryStream()) {
                        return DbViewerLobSupport.readBinaryDetail(column, kind, in, blob.length());
                    } finally {
                        DbViewerLobSupport.freeQuietly(blob);
                    }
                }
                case RAW -> {
                    byte[] bytes = rs.getBytes(1);
                    return DbViewerLobSupport.detailFromBytes(column, kind, bytes,
                            bytes == null ? 0 : bytes.length, false);
                }
                case LONG_RAW -> {
                    try (InputStream in = rs.getBinaryStream(1)) {
                        if (in == null) {
                            return DbViewerLobSupport.detailFromBytes(column, kind, null, 0, false);
                        }
                        // 전체 길이를 알 수 없다 — 읽은 만큼이 length 이고 lengthKnown=false.
                        return DbViewerLobSupport.readBinaryDetail(column, kind, in, -1);
                    }
                }
                default -> throw new IllegalStateException("지원하지 않는 종류: " + kind);
            }
        } catch (IOException e) {
            throw new SQLException("LOB 칸을 읽지 못했습니다: " + e.getMessage(), e);
        }
    }

    /**
     * 조회 결과.
     *
     * @param schema     정규화된 대문자 스키마 이름
     * @param table      정규화된 대문자 테이블 이름
     * @param rowIdKey   상세 재조회용 숨은 칸의 키(행 Map 에만 있고 {@code columns} 에는 없다). 실제 표가 아니면 null
     * @param lobColumns LOB·RAW 칸 이름 → 종류(CLOB·NCLOB·BLOB·RAW·LONG RAW)
     * @param hasMore    이 묶음 뒤에 읽을 행이 더 있는지(상한 한 건 더 읽어 판정한다)
     * @param moreBlocked 더 있는데도 이어 볼 수 없는 사유(정렬 기준 칸이 없음). 이어 볼 수 있거나 더 없으면 null
     * @param capReached 한 결과의 전체 행 수 상한({@code analog.db.max-rows-all})에 걸려 멈췄는지
     */
    public record QueryResult(List<String> columns, List<Map<String, Object>> rows, int rowCount,
                             long elapsedMs, String executedSql, String schema, String table,
                             String rowIdKey, Map<String, String> lobColumns,
                             boolean hasMore, String moreBlocked, boolean capReached) {

        /** 더보기 정보가 없는 결과(구조화 조회·시험용). */
        public QueryResult(List<String> columns, List<Map<String, Object>> rows, int rowCount,
                           long elapsedMs, String executedSql, String schema, String table,
                           String rowIdKey, Map<String, String> lobColumns) {
            this(columns, rows, rowCount, elapsedMs, executedSql, schema, table, rowIdKey, lobColumns,
                    false, null, false);
        }

        /** 읽은 행을 keep 건으로 줄이고 더보기 정보를 붙인 사본. */
        QueryResult paged(int keep, boolean hasMore, String moreBlocked, boolean capReached) {
            List<Map<String, Object>> kept = rows.size() > keep ? List.copyOf(rows.subList(0, keep)) : rows;
            return new QueryResult(columns, kept, kept.size(), elapsedMs, executedSql, schema, table, rowIdKey,
                    lobColumns, hasMore, moreBlocked, capReached);
        }
    }
}
