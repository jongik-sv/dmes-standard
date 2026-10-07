package com.dongkuk.dmes.mcm.common.audit;

import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Hibernate {@link StatementInspector} — native INSERT/UPDATE 가로채서 mcm-core audit 9 컬럼을 자동 보강한다.
 *
 * <p>대상 = {@code MCMAPUSER.TB_MCM_*} prefix 테이블만 (mcm 자체 테이블). cactus / caravan-console / 기타 모듈 테이블은 통과.
 *
 * <p>idempotent 보장: SQL 에 이미 {@code C_USR_ID} 또는 {@code U_USR_ID} 가 있으면 (수동 명시 INSERT, 본 inspector
 * 가 한 번 처리한 결과 등) 변경 없이 통과. DataInitializer 의 수동 audit 명시는 그대로 보존되고, JPA Repository.save
 * 등 hibernate 가 생성한 native SQL 에는 본 inspector 가 audit 컬럼을 주입한다.
 *
 * <p>userId 조회 정책: {@link SecurityIdentityHolder} 의 정적 holder 우선 → 부팅 전 / 인증 컨텍스트 없으면 fallback
 * 으로 {@code spring-security} {@code SecurityContextHolder} 시도 → 모두 실패 시 {@code "system"} 사용. spring-security
 * 의존은 mcm-core 가 {@code compileOnly} 로 보유 → ClassNotFound 시 안전하게 fallback.
 *
 * <p>SQL parsing 한계:
 * <ul>
 *   <li>INSERT 는 single-row {@code VALUES (...)} 만 처리. multi-row batch insert 는 보수적으로 skip.</li>
 *   <li>괄호는 depth counting 으로 분리 — VALUES 절 안 함수 호출 안전.</li>
 *   <li>보강 SQL 은 ANSI 형({@code CURRENT_TIMESTAMP}·{@code COALESCE})만 쓴다 — Oracle·H2·SQLite 공통. Oracle 의
 *       {@code CURRENT_TIMESTAMP} 는 세션 시간대(JDBC 가 JVM 시간대 Asia/Seoul 로 맞춘다) 기준이라 KST 로 들어간다.</li>
 *   <li>UPDATE 는 마지막 등장 {@code WHERE} 기준 분리 — SET 절 안 {@code CASE WHEN ... THEN ... END} 안전.</li>
 *   <li>SELECT / DELETE 는 통과 (audit 컬럼 변경 ✗).</li>
 * </ul>
 */
public class McmAuditStatementInspector implements StatementInspector {

    /** INSERT 시작 패턴 — 대상 prefix 검증 + 테이블명 추출. VALUES 절 본문은 본 정규식 ✗, 본문 별도 파싱. */
    private static final Pattern INSERT_HEAD = Pattern.compile(
            "(?is)^\\s*INSERT\\s+INTO\\s+(MCMAPUSER\\.TB_MCM_[A-Za-z0-9_]+)\\s*\\("
    );

    /** UPDATE 시작 패턴 — 대상 prefix 검증 + 테이블명 추출. */
    private static final Pattern UPDATE_HEAD = Pattern.compile(
            "(?is)^\\s*UPDATE\\s+(MCMAPUSER\\.TB_MCM_[A-Za-z0-9_]+)\\s+SET\\s+"
    );

    /** audit 9 컬럼 식별자 list — 컬럼 list 끝에 추가 + UPDATE SET 절 끝에 추가. */
    private static final String AUDIT_COL_NAMES =
            "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER";

    // SQLite(개발자 Mac local 단독) 여부 — true 면 inspect 결과의 MSSQL 전용 토큰을 SQLite 로 치환.
    // JpaConfig 가 SQLite primary EMF 빌드 시 setSqlite(true) 1회 주입. 기본 false(MSSQL/dev/prod 무영향).
    private static volatile boolean sqlite = false;

    /**
     * SQLite 환경에서만 1회 주입 (JpaConfig). 그 밖(Oracle 등)은 호출 안 됨 → false 유지 → toSqlite 미적용.
     *
     * @deprecated Oracle 단일화(oracle-1007). mcm 모듈 호출을 ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
     *             동작은 그대로 둔다 — {@code setSqlite(true)} 를 명시했을 때만 SQLite 치환이 돈다(mcm 모듈 SQLite 시험이 기댄다).
     */
    @Deprecated
    public static void setSqlite(boolean value) {
        sqlite = value;
    }

    /**
     * SQLite 모드 여부 — commMenuMng/commObjMng/commRoleMng 등 csa 화면의 native 어댑터
     * (SecMenuNativeRepository / SecMenuFldLovRepository / SecRoleMappingNativeRepository)가 MSSQL 전용
     * 함수(CONCAT / RIGHT / subquery TOP)를 SQLite 호환 구문({@code ||} / SUBSTR / LIMIT)으로 분기할 때 참조한다.
     * schema 접두({@code MCMAPUSER.}) 제거는 본 inspector 의 {@link #toSqlite}가 담당하므로 어댑터 분기는 함수 토큰만 다룬다.
     * 로그인 SQLITE_BUSY 재시도({@code SqliteBusyRetry}, mcm/lib)도 이 값으로 로컬 SQLite 에서만 다시 시도한다.
     *
     * <p>oracle-1007 c2 — mcm-core 자기 native 어댑터의 SQLite 갈래는 Oracle·H2 공통형 하나로 합쳐 더는 이 값을 보지 않는다.
     *
     * @deprecated Oracle 단일화(oracle-1007). mcm 모듈 호출을 ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
     */
    @Deprecated
    public static boolean isSqlite() {
        return sqlite;
    }

    @Override
    public String inspect(String sql) {
        String result = inspectInner(sql);
        return (sqlite && result != null) ? toSqlite(result) : result;
    }

    /**
     * SQLite 전용 토큰 치환 — 모든 JPA/native SQL 공통. mcm-core native @Query 의 {@code MCMAPUSER.} schema
     * 접두(66건) + audit 보강이 넣는 {@code SYSDATETIME()}/{@code ISNULL} 포함. MSSQL 은 setSqlite 미호출이라 미실행.
     * <ul>
     *   <li>{@code MCMAPUSER.} schema 접두 제거 — SQLite 는 schema 미지원(entity 도 schema 없이 단일 테이블 생성)</li>
     *   <li>{@code SYSDATETIME()} → {@code CURRENT_TIMESTAMP}</li>
     *   <li>{@code ISNULL(} → {@code IFNULL(} — audit UPDATE 의 VER 증가식</li>
     *   <li>{@code N'...'} 유니코드 리터럴 prefix 제거 — {@link #stripUnicodeLiteralPrefix}</li>
     * </ul>
     */
    private static String toSqlite(String sql) {
        return toSqliteCompatible(sql);
    }

    /**
     * {@link #toSqlite} 와 같은 SQLite 치환을 정적 플래그와 무관하게 적용한다 — MyBatis SQL 은 Hibernate inspector 를
     * 거치지 않으므로 {@link McmSqliteMybatisInterceptor} 가 연결이 SQLite 일 때 이 메서드를 부른다(audit 보강은 하지 않는다).
     *
     * @deprecated Oracle 단일화(oracle-1007). mcm 모듈 호출을 ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
     */
    @Deprecated
    public static String toSqliteCompatible(String sql) {
        return stripUnicodeLiteralPrefix(
                sql.replace("MCMAPUSER.", "")
                   .replace("SYSDATETIME()", "CURRENT_TIMESTAMP")
                   .replaceAll("\\bISNULL\\(", "IFNULL("));
    }

    /**
     * MSSQL 유니코드 리터럴 접두 {@code N'...'} 만 골라 제거한다 (문자열 리터럴 내부는 건드리지 않는다).
     *
     * <p><b>왜 정규식이 아니라 스캐너인가</b> (2026-08-07) — 이전 구현
     * {@code replaceAll("(?<![A-Za-z0-9_])N'", "'")} 은 <b>값 {@code 'N'} 자체를 {@code ''} 로 망가뜨렸다.</b>
     * {@code 'N'} 의 닫는 따옴표 앞 {@code N} 은 여는 따옴표(식별자 문자 아님) 뒤에 오므로 lookbehind 를 통과해
     * {@code '} + {@code '} = 빈 문자열이 된다. 그 결과
     * {@code UPDATE ... SET USE_TP = 'N'} 이 {@code SET USE_TP = ''} 로 실행돼
     * SEC_MENU 에 빈 문자열 14 행이 적재됐고, 이것이 Hibernate 의 {@code Character} 추론과 맞물려
     * commMenuMng 조회·저장 전체를 죽이는 {@code CoercionException} 으로 이어졌다.
     * {@code WHERE 컬럼 = 'N'} 같은 비교도 조용히 빈 문자열 비교로 바뀌므로 오염 범위가 넓다.
     *
     * <p>따라서 문자열 리터럴 안/밖을 추적하며, <b>리터럴 밖에서 여는 따옴표 바로 앞에 붙은</b>
     * {@code N} 만 제거한다. {@code ''} 이스케이프도 리터럴 내부로 올바르게 처리한다.
     *
     * @deprecated Oracle 단일화(oracle-1007). mcm 모듈 호출을 ora-mcm-app 이 없앤 뒤 ora-base b8 에서 지운다.
     */
    @Deprecated
    public static String stripUnicodeLiteralPrefix(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        boolean inStr = false;
        for (int i = 0; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (inStr) {
                out.append(c);
                if (c == '\'') {
                    if (i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                        out.append('\'');   // '' 이스케이프 — 리터럴 계속
                        i++;
                    } else {
                        inStr = false;
                    }
                }
                continue;
            }
            // 리터럴 밖: 여는 따옴표 직전의 N 이면서 앞이 식별자 문자가 아닐 때만 접두로 본다
            // (컬럼명 끝의 N — 예: MENU_VIEW_YN — 은 앞 글자가 식별자 문자라 걸리지 않는다).
            if (c == 'N' && i + 1 < sql.length() && sql.charAt(i + 1) == '\''
                    && (i == 0 || !isWordCharStatic(sql.charAt(i - 1)))) {
                continue;   // N 만 버리고, 다음 루프에서 여는 따옴표를 처리
            }
            out.append(c);
            if (c == '\'') inStr = true;
        }
        return out.toString();
    }

    private static boolean isWordCharStatic(char c) {
        return Character.isLetterOrDigit(c) || c == '_';
    }

    private String inspectInner(String sql) {
        if (sql == null) return null;

        // idempotent skip — 이미 audit 컬럼이 명시되어 있으면 변경 ✗
        if (containsAuditColumn(sql)) return sql;

        // INSERT 시도
        String rewritten = tryRewriteInsert(sql);
        if (rewritten != null) return rewritten;

        // UPDATE 시도
        rewritten = tryRewriteUpdate(sql);
        if (rewritten != null) return rewritten;

        // SELECT / DELETE / 기타 — 통과
        return sql;
    }

    /** 컬럼 list 또는 SET 절에 audit 컬럼이 등장하는지 case-insensitive 검사. */
    private boolean containsAuditColumn(String sql) {
        // 단순 contains — sql 본문 어디에든 C_USR_ID 또는 U_USR_ID 가 있으면 skip.
        // WHERE 절에 C_USR_ID 비교가 들어간 경우도 보수적으로 skip (드물고 안전한 fallback).
        String upper = sql.toUpperCase();
        return upper.contains("C_USR_ID") || upper.contains("U_USR_ID");
    }

    /**
     * audit 9 컬럼을 보유하지 않는 테이블 — 보강 대상에서 제외한다.
     * <p>{@code TB_MCM_SEC_MENU_FLD} 는 entity 미보유 stub 으로 audit 컬럼이 없다(DDL 본 컬럼만). 본 테이블에
     * audit SET/컬럼을 주입하면 {@code no such column: U_USR_ID} 가 발생하므로 INSERT/UPDATE 보강을 건너뛴다.
     */
    private boolean isNoAuditTable(String table) {
        return table != null && table.toUpperCase().endsWith("TB_MCM_SEC_MENU_FLD");
    }

    /**
     * INSERT INTO MCMAPUSER.TB_MCM_xxx (cols) VALUES (vals) → audit 9 컬럼 + 9 값 추가.
     * @return 재작성 SQL. 대상 ✗ / parsing 실패 시 {@code null}.
     */
    private String tryRewriteInsert(String sql) {
        Matcher head = INSERT_HEAD.matcher(sql);
        if (!head.find()) return null;
        String table = head.group(1);
        if (isNoAuditTable(table)) return null;   // audit 컬럼 미보유 테이블은 보강 ✗
        int colsOpen = head.end() - 1; // 열린 괄호 위치
        int colsClose = findMatchingParen(sql, colsOpen);
        if (colsClose < 0) return null;
        String cols = sql.substring(colsOpen + 1, colsClose).trim();

        // " VALUES " 다음 열린 괄호 찾기
        int valuesIdx = indexOfIgnoreCase(sql, "VALUES", colsClose);
        if (valuesIdx < 0) return null;
        int valsOpen = sql.indexOf('(', valuesIdx);
        if (valsOpen < 0) return null;
        int valsClose = findMatchingParen(sql, valsOpen);
        if (valsClose < 0) return null;
        String vals = sql.substring(valsOpen + 1, valsClose).trim();

        // multi-row batch insert ((...),(...)) 는 보수적으로 skip
        String tail = sql.substring(valsClose + 1).trim();
        if (tail.startsWith(",")) return null;

        String userId = currentUserId();
        String escUser = escape(userId);
        String auditVals = String.format(
                "'%s', CURRENT_TIMESTAMP, 'mcm', 'mcm', '%s', CURRENT_TIMESTAMP, 'mcm', 'mcm', 0",
                escUser, escUser
        );

        StringBuilder out = new StringBuilder(sql.length() + 256);
        out.append("INSERT INTO ").append(table).append(" (")
           .append(cols).append(", ").append(AUDIT_COL_NAMES).append(") VALUES (")
           .append(vals).append(", ").append(auditVals).append(")");
        if (!tail.isEmpty()) {
            out.append(' ').append(tail);
        }
        return out.toString();
    }

    /**
     * UPDATE MCMAPUSER.TB_MCM_xxx SET ... [WHERE ...] → SET 절 끝에 audit 5 컬럼 갱신 추가.
     * @return 재작성 SQL. 대상 ✗ / parsing 실패 시 {@code null}.
     */
    private String tryRewriteUpdate(String sql) {
        Matcher head = UPDATE_HEAD.matcher(sql);
        if (!head.find()) return null;
        String table = head.group(1);
        if (isNoAuditTable(table)) return null;   // audit 컬럼 미보유 테이블은 보강 ✗
        int setStart = head.end(); // SET 직후 본문 시작

        // 마지막 등장 ' WHERE ' 분리 — SET 절 / WHERE 절. SET 안 CASE WHEN 의 WHEN 은 정확히 'WHERE' 가 아니라 안전.
        int whereIdx = lastIndexOfWord(sql, "WHERE", setStart);
        String setClause;
        String whereClause;
        if (whereIdx < 0) {
            setClause = sql.substring(setStart).trim();
            whereClause = "";
        } else {
            setClause = sql.substring(setStart, whereIdx).trim();
            whereClause = " " + sql.substring(whereIdx).trim();
        }

        String userId = currentUserId();
        String escUser = escape(userId);
        String auditSet = String.format(
                ", U_USR_ID = '%s', U_AT = CURRENT_TIMESTAMP, U_SVC_ID = 'mcm', U_PGM_ID = 'mcm', "
                        + "VER = COALESCE(VER, 0) + 1",
                escUser
        );

        return "UPDATE " + table + " SET " + setClause + auditSet + whereClause;
    }

    /** 위치 {@code open} 의 '(' 와 매칭되는 ')' 위치. 미발견 시 -1. depth counting. */
    private int findMatchingParen(String sql, int open) {
        int depth = 0;
        boolean inStr = false;
        for (int i = open; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                // MSSQL escape: '' 는 literal single-quote → in-string toggle 무시
                if (inStr && i + 1 < sql.length() && sql.charAt(i + 1) == '\'') {
                    i++;
                    continue;
                }
                inStr = !inStr;
                continue;
            }
            if (inStr) continue;
            if (c == '(') depth++;
            else if (c == ')') {
                depth--;
                if (depth == 0) return i;
            }
        }
        return -1;
    }

    /** {@code from} 이후 처음 등장하는 {@code needle} 위치 (case-insensitive). */
    private int indexOfIgnoreCase(String sql, String needle, int from) {
        int n = sql.length();
        int m = needle.length();
        for (int i = from; i <= n - m; i++) {
            if (sql.regionMatches(true, i, needle, 0, m)) return i;
        }
        return -1;
    }

    /** {@code from} 이후 마지막 등장 {@code word} 위치 — word 양옆이 whitespace/괄호 등 단어경계 보장. */
    private int lastIndexOfWord(String sql, String word, int from) {
        int n = sql.length();
        int m = word.length();
        int found = -1;
        boolean inStr = false;
        for (int i = from; i <= n - m; i++) {
            char c = sql.charAt(i);
            if (c == '\'') {
                if (inStr && i + 1 < n && sql.charAt(i + 1) == '\'') {
                    i++;
                    continue;
                }
                inStr = !inStr;
                continue;
            }
            if (inStr) continue;
            if (!sql.regionMatches(true, i, word, 0, m)) continue;
            // word 경계 검사 — 앞뒤가 알파넘 / underscore 가 아닐 것
            char prev = i == 0 ? ' ' : sql.charAt(i - 1);
            char next = i + m >= n ? ' ' : sql.charAt(i + m);
            if (isWordChar(prev) || isWordChar(next)) continue;
            found = i;
        }
        return found;
    }

    private boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_';
    }

    /**
     * 현재 인증된 사용자 ID. SecurityIdentityHolder 우선 → spring-security SecurityContextHolder fallback →
     * 최종 {@code "system"} fallback. ClassNotFound (spring-security 미존재) 안전.
     */
    private String currentUserId() {
        // 1) mcm-core 정적 holder — 부팅 후 SecurityIdentityHolderInitializer 가 set
        try {
            String id = SecurityIdentityHolder.currentUserIdOrNull();
            if (id != null && !id.isBlank()) return id;
        } catch (Throwable ignored) {
            // holder 자체 ClassNotFound 은 거의 불가능하지만 안전 통과
        }
        // 2) spring-security SecurityContextHolder — mcm-core compileOnly, runtime 보장 ✗ → reflection fallback
        try {
            Class<?> holderCls = Class.forName("org.springframework.security.core.context.SecurityContextHolder");
            Object ctx = holderCls.getMethod("getContext").invoke(null);
            if (ctx != null) {
                Object auth = ctx.getClass().getMethod("getAuthentication").invoke(ctx);
                if (auth != null) {
                    Object name = auth.getClass().getMethod("getName").invoke(auth);
                    if (name instanceof String s && !s.isBlank() && !"anonymousUser".equals(s)) {
                        return s;
                    }
                }
            }
        } catch (Throwable ignored) {
            // ClassNotFound (테스트 환경) / 미인증 — fallback
        }
        // 3) 최종 fallback — DataInitializer / 배치 / 미인증 경로
        return "system";
    }

    private String escape(String v) {
        return v == null ? "" : v.replace("'", "''");
    }
}
