package com.dongkuk.dmes.mcm.job.builtin;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 「쿼리 실행」 작업의 문장 검사(설계 §8·D13) — DML 한 문장({@code INSERT·UPDATE·DELETE·MERGE}) 또는 프로시저 호출 하나({@code BEGIN 프로시저(…); END;}).
 * 주석·문자열·따옴표 식별자를 가린 사본으로 판단하고(실행은 원문), 끝 {@code ;} 는 DML 에서만 떼어 낸다. DDL·트랜잭션 제어문·
 * EXECUTE IMMEDIATE·DB 링크·대체 따옴표 {@code q'…'}·위치 바인드({@code :1})·치환 변수({@code &x}) 는 거절한다.
 * 거절 메시지에는 문장 원문을 넣지 않는다(실행 기록 MSG 로 가므로).
 */
public final class QueryStatementGuard {

    public static final int MAX_LENGTH = 20_000;

    public record Checked(String sql, boolean procedure, List<String> variables) {}

    private static final Pattern FIRST_DML = Pattern.compile("^(INSERT|UPDATE|DELETE|MERGE)\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern PROC_BLOCK = Pattern.compile(
            "^BEGIN\\s+[A-Z][A-Z0-9_$#]*(\\.[A-Z][A-Z0-9_$#]*){0,2}\\s*(\\([^;]*\\))?\\s*;\\s*END\\s*;?$", Pattern.CASE_INSENSITIVE | Pattern.DOTALL);
    private static final Pattern FORBIDDEN = Pattern.compile(
            "\\b(COMMIT|ROLLBACK|SAVEPOINT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|EXECUTE|DBMS_SQL|DBMS_SCHEDULER|DBMS_JOB|UTL_FILE|UTL_HTTP|UTL_TCP|UTL_SMTP|UTL_MAIL)\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DB_LINK = Pattern.compile("[A-Za-z0-9_$#]\\s*@\\s*[A-Za-z]");
    private static final Pattern ALT_QUOTE = Pattern.compile("(?<![A-Za-z0-9_$#])[qQ]\\s*'");
    private static final Pattern POSITIONAL = Pattern.compile("(?<![:\\w]):\\d");
    private static final Pattern SUBSTITUTION = Pattern.compile("&\\s*[A-Za-z0-9_]");
    private static final Pattern VARIABLE = Pattern.compile("(?<![:\\w]):([A-Za-z][A-Za-z0-9_]*)");

    private QueryStatementGuard() {}

    public static Checked check(String sql) {
        if (sql == null || sql.isBlank()) throw bad("쿼리 문장이 비어 있습니다");
        if (sql.length() > MAX_LENGTH) throw bad("쿼리 문장은 " + MAX_LENGTH + "자까지입니다");
        if (ALT_QUOTE.matcher(sql).find()) throw bad("대체 따옴표 q'…' 는 쓸 수 없습니다");
        String masked = mask(sql);
        int semi = trailingSemicolon(masked);
        boolean procedure = masked.stripLeading().regionMatches(true, 0, "BEGIN", 0, 5);
        String executable;
        if (procedure) {
            if (!PROC_BLOCK.matcher(masked.strip()).matches()) throw bad("프로시저 호출 하나(BEGIN 프로시저(…); END;)만 쓸 수 있습니다");
            executable = sql.strip();
        } else {
            String body = semi >= 0 ? masked.substring(0, semi) + " " + masked.substring(semi + 1) : masked;
            if (body.indexOf(';') >= 0) throw bad("한 문장만 쓸 수 있습니다");
            if (!FIRST_DML.matcher(body.strip()).find()) throw bad("INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저 호출만 쓸 수 있습니다");
            executable = (semi >= 0 ? sql.substring(0, semi) + sql.substring(semi + 1) : sql).strip();
        }
        Matcher forbidden = FORBIDDEN.matcher(masked);
        if (forbidden.find()) throw bad("쓸 수 없는 낱말이 있습니다: " + forbidden.group(1).toUpperCase(java.util.Locale.ROOT));
        if (DB_LINK.matcher(masked).find()) throw bad("DB 링크는 쓸 수 없습니다");
        if (POSITIONAL.matcher(masked).find()) throw bad("위치 바인드(:1)는 쓸 수 없습니다 — :이름 으로 쓰세요");
        if (SUBSTITUTION.matcher(masked).find()) throw bad("치환 변수(&이름)는 쓸 수 없습니다");
        Set<String> names = new LinkedHashSet<>();
        Matcher v = VARIABLE.matcher(masked);
        while (v.find()) names.add(v.group(1));
        return new Checked(executable, procedure, new ArrayList<>(names));
    }

    /** 가린 사본에서 「뒤에 공백뿐인 마지막 ;」 의 위치. 없으면 -1. */
    private static int trailingSemicolon(String masked) {
        int i = masked.lastIndexOf(';');
        return i >= 0 && masked.substring(i + 1).isBlank() ? i : -1;
    }

    /** 주석·문자열 리터럴·따옴표 식별자를 같은 길이의 공백으로 바꾼 사본(글자 위치가 원문과 같다). */
    static String mask(String sql) {
        StringBuilder out = new StringBuilder(sql.length());
        int i = 0;
        int n = sql.length();
        while (i < n) {
            char c = sql.charAt(i);
            if (c == '\'' || c == '"') {
                i = skipQuoted(sql, i, c, out);
            } else if (c == '-' && i + 1 < n && sql.charAt(i + 1) == '-') {
                while (i < n && sql.charAt(i) != '\n') {
                    out.append(' ');
                    i++;
                }
            } else if (c == '/' && i + 1 < n && sql.charAt(i + 1) == '*') {
                int close = sql.indexOf("*/", i + 2);
                if (close < 0) throw bad("닫히지 않은 주석이 있습니다");
                for (int k = i; k < close + 2; k++) out.append(sql.charAt(k) == '\n' ? '\n' : ' ');
                i = close + 2;
            } else {
                out.append(c);
                i++;
            }
        }
        return out.toString();
    }

    private static int skipQuoted(String sql, int start, char quote, StringBuilder out) {
        int n = sql.length();
        int i = start + 1;
        while (i < n) {
            if (sql.charAt(i) == quote) {
                if (i + 1 < n && sql.charAt(i + 1) == quote) {   // '' 는 따옴표 문자
                    i += 2;
                    continue;
                }
                for (int k = start; k <= i; k++) out.append(' ');
                return i + 1;
            }
            i++;
        }
        throw bad("닫히지 않은 따옴표가 있습니다");
    }

    private static IllegalArgumentException bad(String message) {
        return new IllegalArgumentException(message);
    }
}
