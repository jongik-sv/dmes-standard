package com.dongkuk.dmes.mdm.common.dictionary;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 컬럼 설명·활용처 메모의 형식 판별(D-150). 알려진 HTML 태그가 하나라도 있으면 HTML, 아니면 일반 글이다.
 *
 * <p>m-mdm {@code column-info/api.ts} 의 {@code descriptionFormat} 과 <b>같은 규칙</b>이다 — 같은 태그 목록, 대소문자 무시(ASCII 만 접는다),
 * {@code </?태그} 바로 뒤 글자가 {@code A-Za-z0-9_} 가 아니고(끝이어도 된다) 그 뒤 어딘가에 {@code >} 가 있으면 HTML 이다. 양쪽 모두 이
 * 꼴을 그대로 쓴다. 정규식 {@code \b} 를 쓰지 않는 까닭: 자바 {@code \b} 는 단어 글자 뒤의 결합 문자(예: U+0307)를 단어의 일부로 봐 JS 와
 * 판별이 어긋났다(서버는 일반 글로 소독 없이 저장, 화면은 HTML 로 그림). 한쪽만 바꾸지 않게 판별 사례 표를
 * {@code ColumnDescriptionFormatTest} 와 백엔드 가이드 §11 에 고정했다.
 *
 * <p>{@code >} 는 정규식으로 찾지 않고 첫 일치 뒤에 있는지만 본다 — 원래 꼴 {@code [^>]*>} 의 되추적은 닫는 {@code >} 가 없는 긴 입력에서
 * O(n²)였다. 태그 이름에는 {@code <} 가 없어 첫 일치의 끝이 가장 앞이므로 "어느 일치든 뒤에 {@code >} 가 있다"와 같다.
 *
 * <p>아무 {@code <…>} 가 아니라 알려진 태그만 보는 까닭: {@code Map<String>}·{@code a < b} 같은 사전 설명이 HTML 로 잘못 판별되면
 * 소독에서 글자가 사라지거나 바뀐다.
 */
public final class ColumnDescriptionFormat {

    private static final Pattern HTML_TAG_OPEN = Pattern.compile(
            "</?(p|div|br|span|b|strong|i|em|u|s|ul|ol|li|a|table|thead|tbody|tr|th|td|h[1-6]|code|pre|blockquote|img|hr)(?![A-Za-z0-9_])",
            Pattern.CASE_INSENSITIVE);

    private ColumnDescriptionFormat() {
    }

    /** 알려진 HTML 태그가 있으면 true. null·빈 글은 false(일반 글). */
    public static boolean isHtml(String text) {
        if (text == null || text.isEmpty()) {
            return false;
        }
        Matcher m = HTML_TAG_OPEN.matcher(text);
        return m.find() && text.lastIndexOf('>') >= m.end();
    }
}
