package com.dongkuk.dmes.analog.db;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DB 뷰어 SQL 검증기 (ADR-0002 D3).
 *
 * <p>허용 모양 (v1): 단일 {@code SELECT ... FROM 스키마.테이블 [WHERE ...]} 단문.
 * 식별자는 오라클 비인용 식별자 규칙(영문 대문자 시작, 30자 이하)으로 검증하고,
 * 실행 SQL은 파싱 결과에서 재조립한다 — 원문 패스스루를 하지 않는다.
 * {@code SELECT *} 는 {@code ALL_TAB_COLUMNS} 조회 후 명시 컬럼으로 재작성된다.
 *
 * <p>SQL 주석 표기(행 주석, 블록 주석)는 전면 거부한다 — WHERE 뒤에 붙는
 * 건수 상한을 주석아웃하는 우회를 막기 위함이다.
 */
public final class DbViewerValidator {

    private DbViewerValidator() {
    }

    /** 오라클 비인용 식별자 (대문자 정규화 후 검사). */
    private static final Pattern IDENT = Pattern.compile("[A-Z][A-Z0-9_$#]{0,29}");

    /** FROM 스키마.테이블 — 인용부호 허용, 스키마 생략 불가. */
    private static final Pattern FROM_CLAUSE = Pattern.compile(
            "\\bFROM\\s+\"?([A-Za-z][\\w$#]{0,29})\"?\\.\"?([A-Za-z][\\w$#]{0,29})\"?",
            Pattern.CASE_INSENSITIVE);

    /** WHERE 절 시작 (단어 경계 — WHEREabouts 같은 컬럼명 오탐 방지). */
    private static final Pattern WHERE_CLAUSE = Pattern.compile("\\bWHERE\\b", Pattern.CASE_INSENSITIVE);

    /** 금지 키워드 — DML/DDL/복문/집합연산/페이징 우회/서브쿼리 통로. */
    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|CALL|COMMENT|"
                    + "UNION|MINUS|INTERSECT|JOIN|GROUP\\s+BY|ORDER\\s+BY|HAVING|FOR\\s+UPDATE|"
                    + "ROWNUM|OFFSET|FETCH|CONNECT\\s+BY|START\\s+WITH|MODEL)\\b|\\b(TOP|LIMIT)\\b",
            Pattern.CASE_INSENSITIVE);

    /** 민감 컬럼 패턴 — 자격증명·토큰 노출 차단 (일치 시 조회 거부/제외). */
    private static final Pattern SENSITIVE_COLUMN = Pattern.compile(
            "PASS|PWD|HASH|TOKEN|SECRET|PRIVATE");

    /** SQL 전체 길이 상한. */
    static final int MAX_SQL_LENGTH = 4000;

    /** WHERE 절 길이 상한. */
    static final int MAX_WHERE_LENGTH = 500;

    /** SELECT 목록 컬럼 개수 상한. */
    static final int MAX_COLUMNS = 100;

    /** 파싱 결과 — 실행 SQL 재조립 재료. */
    public record ParsedQuery(String schema, String table, boolean star, List<String> columns, String where) {
    }

    public static String normalizeSchema(String schema) {
        return schema == null ? "" : schema.trim().toUpperCase(Locale.ROOT);
    }

    public static void checkSchemaAllowed(String schema, Set<String> allowed) {
        String normalized = normalizeSchema(schema);
        if (normalized.isEmpty() || !IDENT.matcher(normalized).matches()) {
            throw new DbViewerException(400, "허용되지 않은 스키마 형식입니다.");
        }
        if (!allowed.contains(normalized)) {
            throw new DbViewerException(400, "허용되지 않은 스키마입니다: " + normalized);
        }
    }

    public static void checkIdentifier(String kind, String name) {
        String normalized = name == null ? "" : name.trim().toUpperCase(Locale.ROOT);
        if (!IDENT.matcher(normalized).matches()) {
            throw new DbViewerException(400, kind + " 이름 형식이 올바르지 않습니다.");
        }
        if (SENSITIVE_COLUMN.matcher(normalized).find()) {
            throw new DbViewerException(400, kind + "에 민감 정보가 포함되어 조회할 수 없습니다.");
        }
    }

    /** 민감 컬럼 여부 — {@code SELECT *} 확장 시 제외용. */
    public static boolean isSensitiveColumn(String columnName) {
        return columnName != null && SENSITIVE_COLUMN.matcher(
                columnName.trim().toUpperCase(Locale.ROOT)).find();
    }

    /**
     * SELECT 단문을 파싱한다. 위반 시 400 예외.
     */
    public static ParsedQuery parseSelect(String sql, Set<String> allowedSchemas) {
        if (sql == null || sql.isBlank()) {
            throw new DbViewerException(400, "SQL을 입력해 주세요.");
        }
        String trimmed = sql.trim();
        if (trimmed.length() > MAX_SQL_LENGTH) {
            throw new DbViewerException(400, "SQL이 너무 깁니다. (최대 " + MAX_SQL_LENGTH + "자)");
        }
        if (trimmed.contains(";")) {
            throw new DbViewerException(400, "복문(;)은 실행할 수 없습니다.");
        }
        if (trimmed.contains("--") || trimmed.contains("/*") || trimmed.contains("*/")) {
            throw new DbViewerException(400, "주석 표기는 사용할 수 없습니다.");
        }
        if (trimmed.contains("(") || trimmed.contains(")")) {
            throw new DbViewerException(400, "괄호(함수·서브쿼리)는 v1에서 지원하지 않습니다.");
        }
        if (!trimmed.regionMatches(true, 0, "SELECT", 0, 6)) {
            throw new DbViewerException(400, "SELECT 문만 실행할 수 있습니다.");
        }
        if (FORBIDDEN.matcher(trimmed).find()) {
            throw new DbViewerException(400, "허용되지 않은 키워드가 포함되어 있습니다.");
        }
        Matcher from = FROM_CLAUSE.matcher(trimmed);
        if (!from.find()) {
            throw new DbViewerException(400, "FROM 스키마.테이블 형식을 확인해 주세요. (스키마 생략 불가)");
        }
        if (from.find()) {
            throw new DbViewerException(400, "단일 테이블 조회만 지원합니다.");
        }
        from.reset();
        from.find();
        String schema = normalizeSchema(from.group(1));
        String table = from.group(2).trim().toUpperCase(Locale.ROOT);
        checkSchemaAllowed(schema, allowedSchemas);
        checkIdentifier("테이블", table);

        String selectList = trimmed.substring(6, from.start()).trim();
        if (selectList.isEmpty()) {
            throw new DbViewerException(400, "조회할 컬럼을 지정해 주세요.");
        }
        boolean star = selectList.equals("*") || selectList.endsWith(".*");
        List<String> columns = null;
        if (!star) {
            columns = new ArrayList<>();
            for (String item : selectList.split(",")) {
                String col = item.trim().replace("\"", "").toUpperCase(Locale.ROOT);
                // 테이블 접두(별칭·테이블명.) 허용 — 검증은 컬럼명만 한다.
                int dot = col.lastIndexOf('.');
                if (dot >= 0) {
                    col = col.substring(dot + 1);
                }
                checkIdentifier("컬럼", col);
                columns.add(col);
            }
            if (columns.isEmpty()) {
                throw new DbViewerException(400, "조회할 컬럼을 지정해 주세요.");
            }
            if (columns.size() > MAX_COLUMNS) {
                throw new DbViewerException(400, "컬럼이 너무 많습니다. (최대 " + MAX_COLUMNS + "개)");
            }
        }

        String where = null;
        Matcher whereMatcher = WHERE_CLAUSE.matcher(trimmed);
        // FROM 절 이후의 WHERE만 인정한다 (SELECT 목록의 WHERExxx 컬럼명 오탐 방지).
        int searchFrom = from.start();
        if (whereMatcher.find(searchFrom)) {
            where = trimmed.substring(whereMatcher.end()).trim();
            if (where.isEmpty()) {
                throw new DbViewerException(400, "WHERE 조건이 비어 있습니다.");
            }
            if (where.length() > MAX_WHERE_LENGTH) {
                throw new DbViewerException(400, "WHERE 조건이 너무 깁니다. (최대 " + MAX_WHERE_LENGTH + "자)");
            }
            if (FORBIDDEN.matcher(where).find()) {
                throw new DbViewerException(400, "WHERE 절에 허용되지 않은 키워드가 있습니다.");
            }
            checkWhereIdentifiers(where);
        }
        return new ParsedQuery(schema, table, star, columns, where);
    }

    /** 작은따옴표 문자열 값(내부의 '' 는 따옴표 하나) — 식별자 검사에서 뺀다. */
    private static final Pattern STRING_LITERAL = Pattern.compile("'(?:[^']|'')*'");

    /** WHERE 절의 식별자 후보(인용부호 안의 이름 포함). */
    private static final Pattern WORD = Pattern.compile("[A-Za-z_][A-Za-z0-9_$#]*");

    /**
     * WHERE 절에 쓰인 식별자 중 민감 칸 패턴에 맞는 것이 있으면 400 으로 거부한다.
     * {@code WHERE USER_PASS LIKE '$2a$1%'} 처럼 조건으로 값을 한 글자씩 알아내는 길을 막는다.
     * 작은따옴표 안의 문자열 값은 식별자가 아니므로 검사하지 않는다.
     * (ORDER BY 는 {@link #FORBIDDEN} 으로 이미 거부되어 검사 대상이 아니다.)
     */
    static void checkWhereIdentifiers(String where) {
        String withoutLiterals = STRING_LITERAL.matcher(where).replaceAll(" ");
        Matcher word = WORD.matcher(withoutLiterals);
        while (word.find()) {
            if (isSensitiveColumn(word.group())) {
                throw new DbViewerException(400, "WHERE 절에 민감 정보가 포함된 컬럼이 있어 조회할 수 없습니다.");
            }
        }
    }

    /** 상세 재조회용 숨은 칸의 키 — 실제 표 조회일 때 SELECT 목록 맨 앞에 더한다. */
    public static final String ROWID_KEY = "_ROWID";

    /**
     * 파싱 결과 + 확정 컬럼 목록으로 실행 SQL을 재조립한다. 건수 상한은 항상 강제한다.
     */
    public static String buildSql(ParsedQuery parsed, List<String> effectiveColumns, int limit) {
        return buildSql(parsed, effectiveColumns, limit, false);
    }

    /**
     * 실행 SQL 재조립 — {@code withRowId} 가 true 면 SELECT 목록 맨 앞에
     * {@code ROWIDTOCHAR(ROWID) "_ROWID"} 를 더한다. ROWID 가 있는 실제 표일 때만 true 로 부른다
     * (뷰 등에는 ROWID 가 없어 SQL 이 실패한다). 컬럼 이름은 검증을 거친 식별자뿐이므로 {@code _ROWID} 와 겹치지 않는다.
     */
    public static String buildSql(ParsedQuery parsed, List<String> effectiveColumns, int limit,
                                  boolean withRowId) {
        StringBuilder sb = selectFrom(parsed, effectiveColumns, withRowId);
        sb.append(" FETCH FIRST ").append(limit).append(" ROWS ONLY");
        return sb.toString();
    }

    /** 정렬 키로 쓰는 ROWID 의사 칸 표시. */
    public static final String ORDER_BY_ROWID = "ROWID";

    /**
     * 「더보기」 묶음 SQL — 정렬을 고정하고 {@code OFFSET n ROWS FETCH NEXT m ROWS ONLY} 로 자른다.
     * 묶음 사이에 행이 겹치거나 빠지지 않으려면 같은 정렬이어야 하므로 정렬 키는 호출자가 딕셔너리로 정한
     * {@link #ORDER_BY_ROWID} 또는 식별자 형식 검사를 통과한 칸 이름뿐이다. 정수는 int 라 글자로 이어 붙여도 안전하다.
     */
    public static String buildPagedSql(ParsedQuery parsed, List<String> effectiveColumns, boolean withRowId,
                                       List<String> orderKeys, int offset, int fetch) {
        if (offset < 0 || fetch < 1) {
            throw new DbViewerException(400, "offset 또는 건수가 올바르지 않습니다.");
        }
        if (orderKeys == null || orderKeys.isEmpty()) {
            throw new DbViewerException(400, "정렬 기준이 없어 이어 볼 수 없습니다.");
        }
        StringBuilder sb = selectFrom(parsed, effectiveColumns, withRowId);
        sb.append(" ORDER BY ");
        for (int i = 0; i < orderKeys.size(); i++) {
            String key = orderKeys.get(i);
            if (i > 0) {
                sb.append(", ");
            }
            if (ORDER_BY_ROWID.equals(key)) {
                sb.append(ORDER_BY_ROWID);
            } else if (key != null && IDENT.matcher(key).matches() && !isSensitiveColumn(key)) {
                sb.append('"').append(key).append('"');
            } else {
                throw new DbViewerException(400, "정렬 기준 이름이 올바르지 않습니다.");
            }
        }
        sb.append(" OFFSET ").append(offset).append(" ROWS FETCH NEXT ").append(fetch).append(" ROWS ONLY");
        return sb.toString();
    }

    /** SELECT 목록 + FROM + WHERE — 두 조립 경로가 같은 본문을 쓴다. */
    private static StringBuilder selectFrom(ParsedQuery parsed, List<String> effectiveColumns, boolean withRowId) {
        if (effectiveColumns == null || effectiveColumns.isEmpty()) {
            throw new DbViewerException(400, "조회할 컬럼이 없습니다.");
        }
        StringBuilder sb = new StringBuilder("SELECT ");
        if (withRowId) {
            sb.append("ROWIDTOCHAR(ROWID) \"").append(ROWID_KEY).append("\", ");
        }
        for (int i = 0; i < effectiveColumns.size(); i++) {
            if (i > 0) {
                sb.append(", ");
            }
            sb.append('"').append(effectiveColumns.get(i)).append('"');
        }
        sb.append(" FROM \"").append(parsed.schema()).append("\".\"").append(parsed.table()).append('"');
        if (parsed.where() != null) {
            sb.append(" WHERE ").append(parsed.where());
        }
        return sb;
    }
}
