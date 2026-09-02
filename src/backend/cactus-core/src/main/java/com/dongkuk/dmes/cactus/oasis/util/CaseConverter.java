package com.dongkuk.dmes.cactus.oasis.util;

/**
 * 식별자 케이스 변환 유틸. film 의 Guava {@code CaseFormat} 의존을 회피하기 위해
 * JDK 만으로 작성 (Phase 1, 2026-05-12).
 *
 * <p>{@link com.dongkuk.dmes.cactus.oasis.task.MyBatisSqlRunner} 가 SELECT 결과의
 * 컬럼명(스네이크) 을 camelCase 키로 변환할 때 사용.
 */
public final class CaseConverter {

    private CaseConverter() {}

    /**
     * 입력을 camelCase 로 변환한다.
     * <pre>
     *   "USER_NAME"  → "userName"
     *   "user_name"  → "userName"
     *   "USERNAME"   → "username"
     *   "userName"   → "userName"
     *   ""           → ""
     *   null         → null
     * </pre>
     */
    public static String toCamelCase(String str) {
        if (str == null || str.isEmpty()) {
            return str;
        }
        if (str.indexOf('_') < 0) {
            // underscore 없음 — 첫 글자만 소문자화 (UPPER 단어는 전체 소문자)
            if (isAllUpper(str)) {
                return str.toLowerCase();
            }
            return Character.isUpperCase(str.charAt(0))
                    ? Character.toLowerCase(str.charAt(0)) + str.substring(1)
                    : str;
        }

        // underscore 분리 후 카멜로 합침
        String lower = str.toLowerCase();
        StringBuilder sb = new StringBuilder(lower.length());
        boolean upperNext = false;
        for (int i = 0; i < lower.length(); i++) {
            char c = lower.charAt(i);
            if (c == '_') {
                upperNext = true;
                continue;
            }
            if (upperNext) {
                sb.append(Character.toUpperCase(c));
                upperNext = false;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private static boolean isAllUpper(String str) {
        for (int i = 0; i < str.length(); i++) {
            if (Character.isLowerCase(str.charAt(i))) {
                return false;
            }
        }
        return true;
    }
}
