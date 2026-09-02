package com.dongkuk.analogexpress.util;

import java.util.ArrayList;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public class StringSplitter {
    /**
     * Splits a given input string into an array of strings by spaces,
     * while preserving strings enclosed in double quotes as single entities.
     *
     * @param input The input string to be split.
     * @return An array of strings containing the split parts.
     */
    public static String[] splitString(String input) {
        ArrayList<String> result = new ArrayList<>();

        // 문자열 내에서 쌍따옴표로 묶여 있는 부분을 추출
        Matcher matcher = Pattern.compile("\"([^\"]*)\"|\\S+").matcher(input);

        while (matcher.find()) {
            // 쌍따옴표로 묶인 부분인 경우, 내부의 공백을 그대로 유지한 채로 추가
            if (matcher.group(1) != null) {
                result.add(matcher.group(1));
            } else {
                // 그 외의 경우에는 공백을 기준으로 분할하여 추가
                result.add(matcher.group());
            }
        }

        return result.toArray(new String[0]);
    }

}
