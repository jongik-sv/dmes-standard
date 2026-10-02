package com.dongkuk.dmes.mcm.widget.query;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 쿼리 위젯 SQL 검사(스펙 2026-10-02-widget-admin-generic §7.1) — 저장·미리보기·실행이 모두 이 검사를 거친다.
 * <ol>
 *   <li>문자열 리터럴({@code '…'}, {@code ''} 이스케이프), 따옴표 식별자({@code "…"}), 대괄호 식별자({@code […]}, SQLite·MSSQL),
 *       주석({@code --} 줄, {@code /* *&#47;})을 <b>같은 길이의 공백으로 가린 사본</b>을 만든다. 판단은 늘 이 사본으로 한다.</li>
 *   <li>첫 낱말이 SELECT 또는 WITH 여야 한다.</li>
 *   <li>끝의 {@code ;} 하나만 허용(여러 문장 금지).</li>
 *   <li>쓰기·DDL·권한·트랜잭션 낱말은 단어 경계·대소문자 무시로 거절({@code SELECT … INTO}, {@code FOR UPDATE} 포함).</li>
 *   <li>이름 붙은 변수({@code :name}, PostgreSQL {@code ::} 캐스트 제외)는 §7.2 시스템 변수만.</li>
 * </ol>
 * 방언마다 따옴표 규칙이 달라 검사가 보는 코드와 DB 가 보는 코드가 어긋날 수 있는 표기(PostgreSQL {@code E'…'}·{@code $$…$$},
 * Oracle {@code q'…'})는 아예 받지 않는다. 닫히지 않은 따옴표·괄호·주석도 거절한다.
 * 실행할 SQL 은 가린 사본이 아니라 <b>원문</b>에서 끝 {@code ;} 만 지운 것이다(리터럴을 살려야 하므로). 감싸지 않고 그대로 실행한다.
 * 이 검사가 1차 방어선이고, 실행기의 읽기 전용·늘 롤백 트랜잭션이 2차 방어선이다(§7.3).
 */
public final class SqlGuard {

    /** §7.2 시스템 변수 — 안내 문구·검사 순서. */
    public static final List<String> SYSTEM_VARIABLES = List.of("userId", "deptCd", "today", "yesterday", "monthStart", "now");

    static final String MSG_EMPTY = "SQL 을 입력해 주세요";
    static final String MSG_NOT_SELECT = "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다";
    static final String MSG_MULTI = "문장은 하나만 쓸 수 있습니다";
    static final String MSG_FORBIDDEN = "쓸 수 없는 낱말이 있습니다: ";
    static final String MSG_UNCLOSED = "닫히지 않은 따옴표·괄호·주석이 있습니다";
    static final String MSG_SPECIAL = "특수 문자열 표기(E'…', q'…', $$…$$)는 쓸 수 없습니다";

    /** 식별자를 이루는 글자(Oracle 의 $·# 포함) — 낱말 경계 판단용. */
    private static final String WORD_CHAR = "[\\p{L}\\p{N}_$#]";

    private static final Pattern FIRST_WORD =
            Pattern.compile("^(SELECT|WITH)(?!" + WORD_CHAR + ")", Pattern.CASE_INSENSITIVE);

    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?<!" + WORD_CHAR + ")(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL"
                    + "|COMMIT|ROLLBACK|INTO|PRAGMA|ATTACH|DETACH)(?!" + WORD_CHAR + ")",
            Pattern.CASE_INSENSITIVE);

    /** 이름 붙은 변수. 앞 글자가 ':' 이면(PostgreSQL ::text 캐스트) 변수가 아니다. */
    private static final Pattern VARIABLE = Pattern.compile("(?<!:):([A-Za-z_][A-Za-z0-9_]*)");

    /** PostgreSQL 달러 따옴표 시작($$ 또는 $tag$). */
    private static final Pattern DOLLAR_QUOTE = Pattern.compile("\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$");

    /**
     * 검사 결과.
     *
     * @param sql       실행할 SQL — 원문에서 끝 {@code ;} 를 지우고 앞뒤 공백을 정리한 것
     * @param variables SQL 이 쓰는 시스템 변수 이름(처음 나온 순서, 중복 없음)
     */
    public record Validated(String sql, List<String> variables) {}

    private SqlGuard() {}

    /** §7.1 검사. 어기면 {@code BusinessException(INVALID_VALUE, 사람이 읽을 메시지)}. */
    public static Validated check(String sql) {
        if (sql == null || sql.isBlank()) throw invalid(MSG_EMPTY);

        String masked = mask(sql);

        // 2. 첫 낱말
        if (!FIRST_WORD.matcher(masked.strip()).find()) throw invalid(MSG_NOT_SELECT);

        // 3. 끝 ; 하나만
        int semicolon = masked.indexOf(';');
        if (semicolon >= 0) {
            boolean onlyTrailing = masked.indexOf(';', semicolon + 1) < 0 && masked.substring(semicolon + 1).isBlank();
            if (!onlyTrailing) throw invalid(MSG_MULTI);
        }

        // 4. 금지 낱말
        Matcher forbidden = FORBIDDEN.matcher(masked);
        if (forbidden.find()) throw invalid(MSG_FORBIDDEN + forbidden.group(1).toUpperCase(Locale.ROOT));

        // 5. 시스템 변수만
        Set<String> used = new LinkedHashSet<>();
        Matcher variable = VARIABLE.matcher(masked);
        while (variable.find()) {
            String name = variable.group(1);
            if (!SYSTEM_VARIABLES.contains(name)) {
                throw invalid("알 수 없는 변수입니다: :" + name + " (쓸 수 있는 변수: :" + String.join(", :", SYSTEM_VARIABLES) + ")");
            }
            used.add(name);
        }

        // 가린 사본과 원문은 글자 위치가 같다 — 원문에서 그 자리의 ; 만 지운다.
        String executable = semicolon >= 0 ? sql.substring(0, semicolon) + sql.substring(semicolon + 1) : sql;
        return new Validated(executable.strip(), List.copyOf(new ArrayList<>(used)));
    }

    /**
     * 리터럴·따옴표 식별자·대괄호 식별자·주석을 같은 길이의 공백으로 바꾼 사본(줄바꿈은 그대로 둔다).
     * 왼쪽부터 한 글자씩 읽는다 — 먼저 열린 구간이 이긴다(DB 렉서와 같은 순서).
     */
    static String mask(String sql) {
        int n = sql.length();
        StringBuilder out = new StringBuilder(n);
        int i = 0;
        while (i < n) {
            char c = sql.charAt(i);
            char next = i + 1 < n ? sql.charAt(i + 1) : '\0';
            int end;
            if (c == '-' && next == '-') {
                end = i + 2;
                while (end < n && sql.charAt(end) != '\n' && sql.charAt(end) != '\r') end++;
            } else if (c == '/' && next == '*') {
                int close = sql.indexOf("*/", i + 2);
                if (close < 0) throw invalid(MSG_UNCLOSED);
                end = close + 2;
            } else if (c == '\'') {
                if (isSpecialStringPrefix(sql, i)) throw invalid(MSG_SPECIAL);
                end = closeQuoted(sql, i, '\'');
            } else if (c == '"') {
                end = closeQuoted(sql, i, '"');
            } else if (c == '[') {
                end = closeQuoted(sql, i, ']');
            } else {
                if (c == '$' && (i == 0 || !isWordChar(sql.charAt(i - 1)))
                        && DOLLAR_QUOTE.matcher(sql).region(i, n).lookingAt()) {
                    throw invalid(MSG_SPECIAL);
                }
                out.append(c);
                i++;
                continue;
            }
            for (int k = i; k < end; k++) {
                char m = sql.charAt(k);
                out.append(m == '\n' || m == '\r' ? m : ' ');
            }
            i = end;
        }
        return out.toString();
    }

    /** start 의 여는 글자부터 닫는 글자 다음 위치. 닫는 글자 두 번({@code ''}·{@code ""}·{@code ]]})은 글자 하나로 본다. */
    private static int closeQuoted(String sql, int start, char close) {
        int n = sql.length();
        int j = start + 1;
        while (j < n) {
            if (sql.charAt(j) == close) {
                if (j + 1 < n && sql.charAt(j + 1) == close) {
                    j += 2;
                    continue;
                }
                return j + 1;
            }
            j++;
        }
        throw invalid(MSG_UNCLOSED);
    }

    /** {@code '} 바로 앞이 독립 낱말 E·Q·NQ 인가(PostgreSQL E'\'' 이스케이프 문자열, Oracle q'[…]' 대체 따옴표). */
    private static boolean isSpecialStringPrefix(String sql, int quote) {
        int k = quote;
        while (k > 0 && isWordChar(sql.charAt(k - 1))) k--;
        String prefix = sql.substring(k, quote);
        return prefix.equalsIgnoreCase("E") || prefix.equalsIgnoreCase("Q") || prefix.equalsIgnoreCase("NQ");
    }

    private static boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_' || c == '$' || c == '#';
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
