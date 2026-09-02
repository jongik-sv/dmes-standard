package com.dongkuk.oasis.utils;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * SQL 처리를 위한 유틸리티 클래스.
 */
public final class SqlUtil {

    private SqlUtil() {
        // Utility class
    }

    /**
     * SQL 문에서 주석을 제거합니다.
     * 문자열 리터럴 내의 주석 표시(--, /&#42;, &#42;/)는 보존됩니다.
     *
     * @param sql 원본 SQL
     * @return 주석이 제거된 SQL
     */
    public static String removeComments(String sql) {
        if (sql == null) {
            return null;
        }

        StringBuffer sb = new StringBuffer();
        // Group 1: Single quoted string (handles '' escape)
        // Group 2: Block comment
        // Group 3: Line comment
        Pattern p = Pattern.compile("('(''|[^'])*')|(/\\*[\\s\\S]*?\\*/)|(--.*)");
        Matcher m = p.matcher(sql);

        while (m.find()) {
            if (m.group(1) != null) {
                // 문자열 리터럴인 경우 그대로 유지
                m.appendReplacement(sb, Matcher.quoteReplacement(m.group(1)));
            } else {
                // 주석인 경우 공백으로 대체
                m.appendReplacement(sb, " ");
            }
        }
        m.appendTail(sb);

        return sb.toString();
    }
}
