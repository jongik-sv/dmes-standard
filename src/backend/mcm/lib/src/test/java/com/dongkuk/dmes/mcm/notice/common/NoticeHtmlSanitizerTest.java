package com.dongkuk.dmes.mcm.notice.common;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 공지 본문 HTML 소독 — 홈 화면은 모든 사용자에게 공지 HTML 을 그대로 그리므로 저장 시점에 위험 요소를 걷어 낸다.
 * 요구 대상: script·iframe·object·embed·form·style 태그, on* 이벤트 속성, javascript: URL, 인라인 style 속성.
 */
class NoticeHtmlSanitizerTest {

    private static String clean(String html) {
        return NoticeHtmlSanitizer.sanitize(html);
    }

    @Test
    @DisplayName("null 은 null 로 돌려준다")
    void nullStaysNull() {
        assertThat(clean(null)).isNull();
    }

    @Test
    @DisplayName("script·iframe·object·embed·form·style·svg 태그를 제거한다")
    void dangerousTagsRemoved() {
        String out = clean("<p>앞</p><script>alert(1)</script><iframe src=\"https://evil\"></iframe>"
                + "<object data=\"x.swf\"></object><embed src=\"x.swf\"><form action=\"/steal\"><input name=\"pw\"></form>"
                + "<style>body{display:none}</style><svg onload=\"alert(1)\"><circle/></svg><p>뒤</p>");

        assertThat(out).doesNotContainIgnoringCase("<script")
                .doesNotContainIgnoringCase("alert(1)")
                .doesNotContainIgnoringCase("<iframe")
                .doesNotContainIgnoringCase("<object")
                .doesNotContainIgnoringCase("<embed")
                .doesNotContainIgnoringCase("<form")
                .doesNotContainIgnoringCase("<input")
                .doesNotContainIgnoringCase("<style")
                .doesNotContainIgnoringCase("display:none")
                .doesNotContainIgnoringCase("<svg")
                .doesNotContainIgnoringCase("onload")
                .contains("<p>앞</p>")
                .contains("<p>뒤</p>");
    }

    @Test
    @DisplayName("on* 이벤트 속성과 인라인 style 속성을 제거한다")
    void eventAndStyleAttributesRemoved() {
        String out = clean("<img src=\"https://ok.example/a.png\" onerror=\"alert(1)\">"
                + "<img src=x onerror=alert(2)>"
                + "<p style=\"position:fixed;top:0\" onclick=\"steal()\">본문</p>");

        assertThat(out).doesNotContainIgnoringCase("onerror")
                .doesNotContainIgnoringCase("onclick")
                .doesNotContainIgnoringCase("style=")
                .doesNotContainIgnoringCase("position:fixed")
                .contains("<img src=\"https://ok.example/a.png\">")
                .contains("<p>본문</p>");
    }

    @Test
    @DisplayName("javascript: URL 은 대소문자·제어문자 변형까지 제거한다")
    void javascriptUrlsRemoved() {
        String out = clean("<a href=\"javascript:alert(1)\">a</a>"
                + "<a href=\"JaVaScRiPt:alert(2)\">b</a>"
                + "<a href=\"java&#x09;script:alert(3)\">c</a>"
                + "<a href=\" javascript:alert(4)\">d</a>"
                + "<img src=\"data:image/svg+xml;base64,PHN2Zz4=\">"
                + "<a href=\"ftp://files.example/x\">ftp</a>"
                + "<a href=\"https://ok.example\">ok</a>");

        assertThat(out).doesNotContainIgnoringCase("javascript")
                .doesNotContainIgnoringCase("script:")
                .doesNotContainIgnoringCase("data:")
                .doesNotContainIgnoringCase("ftp://")
                .doesNotContain("alert(")
                .contains("<a href=\"https://ok.example\">ok</a>");
    }

    @Test
    @DisplayName("표·목록·강조·링크 같은 평범한 서식은 그대로 남는다")
    void benignMarkupSurvives() {
        String html = "<h2>점검 안내</h2><p><strong>굵게</strong> <em>기울임</em> <u>밑줄</u> <s>취소</s></p>"
                + "<ul><li>하나</li><li>둘</li></ul><ol><li>첫째</li></ol>"
                + "<table><thead><tr><th>시간</th></tr></thead><tbody><tr><td>02:00</td></tr></tbody></table>"
                + "<hr><blockquote>인용</blockquote><a href=\"mailto:it@example.com\">문의</a>";

        assertThat(clean(html)).isEqualTo(html);
    }

    @Test
    @DisplayName("이미 깨끗한 HTML 을 다시 소독해도 같은 값이다(저장할 때마다 바뀌지 않는다)")
    void idempotent() {
        String once = clean("<p>줄1</p>\n<p>줄2 <a href=\"https://ok.example\">링크</a></p>");
        assertThat(clean(once)).isEqualTo(once);
        assertThat(once).contains("\n");
    }
}
