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
 *   <li>보강 SQL 은 ANSI 형({@code CURRENT_TIMESTAMP}·{@code COALESCE})만 쓴다. Oracle 의
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

    @Override
    public String inspect(String sql) {
        return inspectInner(sql);
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
