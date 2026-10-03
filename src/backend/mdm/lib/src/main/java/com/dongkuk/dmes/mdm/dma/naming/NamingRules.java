package com.dongkuk.dmes.mdm.dma.naming;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/** 명명 규칙 상수·정규화 유틸(TSK-04-04 design.md §6.3). */
public final class NamingRules {

    /** 미등록·약어 없는 자리(불변 규칙 I1). 글자 그대로 {@code ***} 다. */
    public static final String PLACEHOLDER = "***";

    /** 덩어리 구분자 — 공백과 한글 음절·영숫자 밖의 모든 문자(불변 규칙 I4). */
    public static final Pattern CHUNK_SEPARATOR = Pattern.compile("[^가-힣A-Za-z0-9]+");

    public static final Pattern STD_PHYS_NAME = Pattern.compile("^[A-Z][A-Z0-9]*(_[A-Z0-9]+)*$");
    public static final Pattern ENG_ABBR = STD_PHYS_NAME;
    public static final Pattern TERM_NAME = Pattern.compile("^[가-힣A-Za-z0-9]+$");

    public static final int LABEL_LONG_MAX = 24;
    public static final int LABEL_MID_MAX = 12;
    public static final int LABEL_SHORT_MAX = 6;
    public static final int COLUMN_NAME_MAX = 100;
    /** 물리명·시스템 필드명·기본값·REF_TARGET·REF_CATE_ID·TRANSFORM. */
    public static final int CODE_MAX = 50;
    public static final int TERM_NAME_MAX = 100;
    public static final int CONTEXT_MAX = 100;
    public static final int ENG_NAME_MAX = 100;
    /**
     * 컬럼 설명·활용처 메모(D-150). 메모 위젯 {@code WidgetMemoService.CONTENT_MAX} 와 같은 값이다. 다른 칸처럼 {@link #length}(코드 포인트)로
     * 소독 전 원문을 센다 — 큰 입력은 소독기에 닿기 전에 거른다. 소독 결과는 엔티티 때문에 조금 길어질 수 있다(칸은 TEXT 라 문제없다).
     */
    public static final int DESCRIPTION_MAX = 20_000;

    private NamingRules() {
    }

    /** 구분자 문자를 모두 없애고 영문 대문자화한 비교 키. null 은 빈 문자열. */
    public static String normalizeKey(String s) {
        if (s == null) {
            return "";
        }
        return CHUNK_SEPARATOR.matcher(s).replaceAll("").toUpperCase(Locale.ROOT);
    }

    /** 트림 + 연속 공백을 한 칸으로. null 은 빈 문자열. */
    public static String normalizeLogicalName(String s) {
        if (s == null) {
            return "";
        }
        return s.trim().replaceAll("\\s+", " ");
    }

    /** 글자 수 = code point 수. null 은 0. */
    public static int length(String s) {
        return s == null ? 0 : s.codePointCount(0, s.length());
    }

    /** 물리명을 {@code _} 로 나눈 대문자 조각(빈 조각 제외). */
    public static List<String> physTokens(String s) {
        List<String> tokens = new ArrayList<>();
        if (s == null) {
            return tokens;
        }
        for (String part : s.split("_")) {
            String trimmed = part.trim();
            if (!trimmed.isEmpty()) {
                tokens.add(trimmed.toUpperCase(Locale.ROOT));
            }
        }
        return tokens;
    }
}
