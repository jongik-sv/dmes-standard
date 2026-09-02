package com.dongkuk.oasis.utils;

import com.google.common.base.CaseFormat;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Random;

/**
 * @author Jeongjin Kim
 * @since 2021-06-14
 */
public class StringUtil {
    static Random random = new Random();

    /**
     * String 내에 줄바꿈 문자를 제거합니다.
     *
     * @param str 바꿀 문자열
     * @return 줄바꿈 문자가 제거된 문자열
     */
    public static String removeNewLine(String str) {
        if (str == null)
            return null;
        return str.replaceAll("(\\r\\n|\\r|\\n)", "");
    }

    /**
     * String 내에 존재하는 모든 공백문자를 제거한다.
     *
     * @param str 제거할 문자열
     * @return 공백문자가 제거된 문자열
     */
    public static String removeAllWhiteSpaces(String str) {
        if (str == null)
            return null;

        if (str.isEmpty())
            return str;

        int len = str.length();
        StringBuilder sb = new StringBuilder(len);

        for (int i = 0; i < len; i++) {
            char c = str.charAt(i);
            if (!Character.isWhitespace(c)) {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    /**
     * String 내에 공백을 제외한 문자가 존재하는지 검사한다.
     *
     * @param str 검사할 문자열
     * @return 문자열이 존재하면 true, 없으면 false
     */
    public static boolean hasText(String str) {
        return (hasLength(str) && containsText(str));
    }

    private static boolean hasLength(String str) {
        return (str != null && !str.isEmpty());
    }

    private static boolean containsText(CharSequence str) {
        int strLen = str.length();
        for (int i = 0; i < strLen; i++) {
            if (!Character.isWhitespace(str.charAt(i))) {
                return true;
            }
        }
        return false;
    }

    /**
     * 지정한 길이의 임의 문자열을 반환합니다.
     *
     * @param length 문자열 길이
     * @return 임의 문자열
     */
    public static String generateRandomString(int length) {
        int leftLimit = 48; // numeral '0'
        int rightLimit = 122; // letter 'z'

        return random.ints(leftLimit, rightLimit + 1)
                .filter(i -> (i <= 57 || i >= 65) && (i <= 90 || i >= 97))
                .limit(length)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
    }

    /**
     * 지정한 길이의 임의 문자열을 반환합니다. data가 같으면 같은 문자열을 반환합니다.
     *
     * @param data   seed 문자열
     * @param length 길이, 64문자가 가장 긴 문자열입니다.
     * @return 임의 문자열
     */
    public static String generateRandomString(String data, int length) {
        if (length <= 0 || length > 64)
            throw new RuntimeException("The maximum length is 64 characters.");

        MessageDigest instance;
        try {
            instance = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            return "";
        }

        byte[] digest = instance.digest(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte b : digest)
            result.append(Integer.toString((b & 0xff) + 0x100, 16).substring(1));

        return result.substring(0, length);
    }

    /**
     * 문자열을 camelCase로 변환합니다.
     *
     * @param str 변환할 문자열
     * @return camelCase 문자열
     */
    public static String convertToCamelCase(String str) {
        if (str == null || str.isEmpty())
            return str;

        String to = str;
        if (str.contains("_")) {
            to = CaseFormat.LOWER_UNDERSCORE.to(
                    CaseFormat.LOWER_CAMEL,
                    str.toLowerCase());
        } else if (isAllCharUpperCase(str)) {
            to = str.toLowerCase();
        } else if (isStartWithUpperCase(str)) {
            to = makeFirstLetterToLowerCase(str);
        }

        return to;
    }

    private static String makeFirstLetterToLowerCase(String str) {
        if (str == null || str.isEmpty())
            return str;
        return str.substring(0, 1).toLowerCase() + str.substring(1);
    }

    private static boolean isAllCharUpperCase(String str) {
        if (str == null || str.isEmpty())
            return false;

        for (int i = 0; i < str.length(); i++) {
            if (Character.isLowerCase(str.charAt(i)))
                return false;
        }
        return true;
    }

    private static boolean isStartWithUpperCase(String str) {
        if (str == null || str.isEmpty())
            return false;

        return Character.isUpperCase(str.charAt(0));
    }
}


