package com.dongkuk.dmes.mdm.common.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.jsoup.Jsoup;
import org.jsoup.select.Elements;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** 컬럼 설명 HTML 소독·글자 추출(D-150). 허용 목록은 mls {@code NoticeHtmlSanitizer} 바탕이고 링크 프로토콜만 다르다(mailto 제외). */
class ColumnDescriptionSanitizerTest {

    // ── sanitize ─────────────────────────────────────────────────────────

    @Test
    void null_은_null() {
        assertNull(ColumnDescriptionSanitizer.sanitize(null));
    }

    @Test
    void 스크립트_이벤트_속성_인라인_스타일_iframe_을_뺀다() {
        assertEquals("<p>a</p>", ColumnDescriptionSanitizer.sanitize("<p>a</p><script>alert(1)</script>"));
        assertEquals("<p>a</p>", ColumnDescriptionSanitizer.sanitize("<p onclick=\"x()\" style=\"color:red\">a</p>"));
        assertEquals("<p>a</p>", ColumnDescriptionSanitizer.sanitize("<p>a</p><iframe src=\"https://example.com\"></iframe>"));
        assertEquals("<p>b</p>", ColumnDescriptionSanitizer.sanitize("<svg onload=\"x()\"></svg><p>b</p>"));
    }

    @Test
    void 링크는_http_https_만_남기고_mailto_ftp_javascript_는_뺀다() {
        assertEquals("<a href=\"https://example.com\">x</a>",
                ColumnDescriptionSanitizer.sanitize("<a href=\"https://example.com\">x</a>"));
        assertEquals("<a href=\"http://example.com\">x</a>",
                ColumnDescriptionSanitizer.sanitize("<a href=\"http://example.com\">x</a>"));
        assertEquals("<a>x</a>", ColumnDescriptionSanitizer.sanitize("<a href=\"mailto:a@example.com\">x</a>"));
        assertEquals("<a>x</a>", ColumnDescriptionSanitizer.sanitize("<a href=\"ftp://example.com/f\">x</a>"));
        assertEquals("<a>x</a>", ColumnDescriptionSanitizer.sanitize("<a href=\"javascript:alert(1)\">x</a>"));
        assertEquals("<a>x</a>", ColumnDescriptionSanitizer.sanitize("<a href=\"JaVaScRiPt:alert(1)\">x</a>"));
    }

    @Test
    void 이미지는_http_https_만_남기고_data_javascript_는_뺀다() {
        assertEquals("<img src=\"https://example.com/a.png\">", ColumnDescriptionSanitizer.sanitize("<img src=\"https://example.com/a.png\">"));
        assertEquals("<img>", ColumnDescriptionSanitizer.sanitize("<img src=\"data:image/png;base64,AAAA\">"));
        assertEquals("<img>", ColumnDescriptionSanitizer.sanitize("<img src=\"javascript:alert(1)\" onerror=\"x()\">"));
    }

    @Test
    void relaxed_에_더한_태그_hr_s_del_ins_mark_는_남는다() {
        String html = "<p><s>a</s><del>b</del><ins>c</ins><mark>d</mark></p><hr>";
        assertEquals(html, ColumnDescriptionSanitizer.sanitize(html));
    }

    @Test
    void 원문_공백과_줄바꿈을_유지하고_글자의_꺾쇠는_엔티티가_된다() {
        assertEquals("<p>a</p>\n<p>b</p>", ColumnDescriptionSanitizer.sanitize("<p>a</p>\n<p>b</p>"));
        assertEquals("<p>a &lt; b &amp; c</p>", ColumnDescriptionSanitizer.sanitize("<p>a < b & c</p>"));
    }

    /** 피드가 저장된 소독본을 한 번 더 소독한다 — 결과가 달라지면 view 응답과 피드 descriptionHtml 이 어긋난다. */
    @ParameterizedTest
    @ValueSource(strings = {
            "<p>a < b & c</p>",
            "<p onclick=\"x()\">a</p><script>alert(1)</script>",
            "<a href=\"https://example.com/?a=1&b=2\">링크</a> <a href=\"mailto:a@example.com\">메일</a>",
            "<table><tr><td>1</td></tr></table>",
            "<ul>\n  <li>하나</li>\n  <li>둘&nbsp;셋</li>\n</ul>",
            "<p>\"따옴표\" 'x' &amp; &lt;b&gt;</p><img src=\"https://example.com/a.png\" alt=\"그림 \\\" 설명\">",
            "<blockquote cite=\"https://example.com\">인용</blockquote><pre>  코드\n  둘째</pre>",
            // 한 번 소독한 결과를 다시 파싱하면 구조가 바뀌는 입력(검토 M2) — 1회 <p><p></p></p>, 2회 <p></p><p></p><p></p>
            "<p><noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript></p>",
            "<p><p>a</p></p>"})
    void 소독은_두_번_해도_같다(String html) {
        String once = ColumnDescriptionSanitizer.sanitize(html);
        assertEquals(once, ColumnDescriptionSanitizer.sanitize(once));
    }

    // ── normalize(저장·피드 공통) ─────────────────────────────────────────

    @Test
    void normalize_는_일반_글을_건드리지_않는다() {
        assertEquals("  a < b & Map<String>  ", ColumnDescriptionSanitizer.normalize("  a < b & Map<String>  "));
        assertNull(ColumnDescriptionSanitizer.normalize(null));
    }

    @Test
    void normalize_는_HTML_을_소독하고_알려진_태그가_남지_않으면_p_로_감싼_HTML_을_돌려준다() {
        assertEquals("<p>a &lt; b</p>", ColumnDescriptionSanitizer.normalize("<p onclick=\"x()\">a < b</p><script>x</script>"));
        // 표 밖의 td 는 파서가 버린다 — 소독본 "a &lt; b &amp; c" 는 태그가 없어 <p> 로 감싼다(엔티티 그대로, 화면은 글자로 보인다)
        assertEquals("<p>a &lt; b &amp; c</p>", ColumnDescriptionSanitizer.normalize("<td>a < b & c</td>"));
        assertEquals("<p><sub>2</sub></p>", ColumnDescriptionSanitizer.normalize("<td><sub>2</sub></td>"), "판별 목록 밖의 허용 태그는 남는다");
        assertNull(ColumnDescriptionSanitizer.normalize("<td></td>"), "글자가 없으면 null");
        assertNull(ColumnDescriptionSanitizer.normalize("<td>  \n </td>"), "공백뿐이어도 null");
    }

    /**
     * 검토 C1 — 소독 뒤 알려진 태그가 남지 않을 때 엔티티를 풀어 글자로 저장하면, 풀린 글이 다시 HTML 로 판별돼 소독되지 않은 HTML 이
     * 저장·반환됐다(예: {@code <td>&lt;img src=x onerror=alert(1)&gt;</td>} → {@code <img src=x onerror=alert(1)>}). 이제 엔티티를 그대로 둔
     * 소독본을 {@code <p>} 로 감싸 HTML 로 둔다 — 글 {@code onerror} 는 엔티티 사이의 글자로만 남고 어떤 태그의 속성도 아니다.
     */
    @ParameterizedTest
    @ValueSource(strings = {
            "<td>&lt;img src=x onerror=alert(1)&gt;</td>",
            "<td>&lt;p&gt;x&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</td>",
            "<td>&lt;script&gt;alert(1)&lt;/script&gt;</td>",
            "<textarea><img src=x onerror=alert(1)></textarea>",
            "<title><img src=x onerror=alert(1)></title>"})
    void 태그가_남지_않는_소독본은_엔티티를_풀지_않고_p_로_감싼_HTML_이다(String value) {
        String n = ColumnDescriptionSanitizer.normalize(value);

        assertTrue(ColumnDescriptionFormat.isHtml(n), n);
        assertTrue(n.startsWith("<p>&lt;"), n);
        assertFalse(n.contains("<img") || n.contains("<script"), n);
        assertTrue(dangerous(n).isEmpty(), "on* 속성·img·script 요소가 없다: " + n);
        assertEquals(n, ColumnDescriptionSanitizer.sanitize(n), "소독본이다");
    }

    /** 저장(normalize)한 값을 view·피드가 다시 normalize 해도 같다 — 그래야 view 와 피드 descriptionHtml 이 같다. */
    @ParameterizedTest
    @ValueSource(strings = {
            "<td>&lt;img src=x onerror=alert(1)&gt;</td>",
            "<td>&lt;p&gt;x&lt;/p&gt;&lt;script&gt;alert(1)&lt;/script&gt;</td>",
            "<textarea><img src=x onerror=alert(1)></textarea>",
            "<title><img src=x onerror=alert(1)></title>",
            "<xmp><p>a</p><img src=x onerror=alert(1)></xmp>",
            "<noscript><p>a</p><img src=x onerror=alert(1)></noscript>",
            "<p><noscript><p title=\"</noscript><img src=x onerror=alert(1)>\"></noscript></p>",
            "<td>a < b & c</td>",
            "<td><dl><dt>x</dt></dl></td>", // 감싼 <p> 를 블록(dl)이 닫는다 — 감싼 뒤에도 소독해 고정점을 맞춘다
            "<td><sub>2</sub></td>",
            "<p>x</p>",
            "a < b & Map<String>"})
    void normalize_는_두_번_해도_같고_HTML_결과는_소독본이다(String value) {
        String n = ColumnDescriptionSanitizer.normalize(value);

        assertEquals(n, ColumnDescriptionSanitizer.normalize(n));
        if (ColumnDescriptionFormat.isHtml(n)) {
            assertEquals(n, ColumnDescriptionSanitizer.sanitize(n));
            assertTrue(Jsoup.parseBodyFragment(n).select("[^on], script").isEmpty(), n);
        }
    }

    private static Elements dangerous(String html) {
        return Jsoup.parseBodyFragment(html).select("[^on], img, script");
    }

    @Test
    void plainText_는_HTML_이면_다시_소독한_뒤_글자만_일반_글이면_그대로다() {
        assertEquals("a < b\n둘째", ColumnDescriptionSanitizer.plainText("<p>a &lt; b</p><p onclick=\"x()\">둘째</p><script>x</script>"));
        assertEquals("a < b & Map<String>", ColumnDescriptionSanitizer.plainText("a < b & Map<String>"));
        assertNull(ColumnDescriptionSanitizer.plainText("<hr>"), "글자가 없으면 null");
        assertNull(ColumnDescriptionSanitizer.plainText(null));
    }

    @Test
    void plainTextOfNormalized_는_정규화한_값에서_다시_소독하지_않고_글자만_뽑는다() {
        assertEquals("a < b\n둘째", ColumnDescriptionSanitizer.plainTextOfNormalized("<p>a &lt; b</p><p>둘째</p>"));
        assertEquals("a < b & Map<String>", ColumnDescriptionSanitizer.plainTextOfNormalized("a < b & Map<String>"));
        assertNull(ColumnDescriptionSanitizer.plainTextOfNormalized("<hr>"), "글자가 없으면 null");
        assertNull(ColumnDescriptionSanitizer.plainTextOfNormalized(null));
    }

    // ── toText ───────────────────────────────────────────────────────────

    @Test
    void 글자는_엔티티를_풀고_블록_사이에_줄을_바꾼다() {
        assertEquals("a < b & c\n둘째", ColumnDescriptionSanitizer.toText("<p>a &lt; b &amp; c</p><p>둘째</p>"));
    }

    @Test
    void br_은_줄바꿈이고_두_번이면_빈_줄이다() {
        assertEquals("a\nb", ColumnDescriptionSanitizer.toText("a<br>b"));
        assertEquals("a\n\nb", ColumnDescriptionSanitizer.toText("a<br><br>b"));
    }

    @Test
    void 목록_항목과_표_행은_한_줄씩_칸은_공백으로_나눈다() {
        assertEquals("x\ny", ColumnDescriptionSanitizer.toText("<ul><li>x</li><li>y</li></ul>"));
        assertEquals("제목\nx\ny\n끝", ColumnDescriptionSanitizer.toText("<h3>제목</h3><ul>\n  <li>x</li>\n  <li>y</li>\n</ul><p>끝</p>"));
        assertEquals("a b\nc d",
                ColumnDescriptionSanitizer.toText("<table><tr><td>a</td><td>b</td></tr><tr><th>c</th><td>d</td></tr></table>"));
    }

    @Test
    void 블록_안의_공백은_하나로_줄이고_인라인_태그는_글자만_남긴다() {
        assertEquals("여러 칸", ColumnDescriptionSanitizer.toText("<p>  여러   칸  </p>"));
        assertEquals("굵게 글 링크.", ColumnDescriptionSanitizer.toText("<b>굵게</b> 글 <a href=\"https://example.com\">링크</a>."));
    }

    @Test
    void pre_안은_공백과_줄바꿈을_그대로_둔다() {
        assertEquals("앞\na\n  b\n뒤", ColumnDescriptionSanitizer.toText("<p>앞</p><pre>a\n  b</pre><p>뒤</p>"));
    }

    @Test
    void 글자가_없으면_빈_글이고_null_은_null() {
        assertEquals("", ColumnDescriptionSanitizer.toText("<p></p><hr>"));
        assertNull(ColumnDescriptionSanitizer.toText(null));
    }

    /**
     * 재검토 R1 — HTML 파서는 {@code <pre>} 바로 뒤 줄바꿈 하나를 버리는데 jsoup 은 직렬화할 때 되살리지 않아, 소독할 때마다 줄바꿈이 하나씩
     * 줄었다(4개 이상이면 3회 안에 고정점에 닿지 못함). 사용자가 넣은 줄바꿈 수가 그대로 남고 한 번에 고정점이어야 한다.
     */
    @ParameterizedTest
    @ValueSource(ints = {0, 1, 2, 3, 4, 6})
    void pre_첫머리_줄바꿈은_소독해도_줄지_않고_한_번에_고정점이다(int newlines) {
        String value = "<pre>" + "\n".repeat(newlines) + "x</pre>";
        String n = ColumnDescriptionSanitizer.normalize(value);

        assertEquals(n, ColumnDescriptionSanitizer.normalize(n), "두 번 해도 같다");
        assertEquals(n, ColumnDescriptionSanitizer.normalize(ColumnDescriptionSanitizer.normalize(n)));
        // 파서가 버리는 첫 줄바꿈 하나를 빼면 보이는 줄바꿈 수가 원문과 같다.
        int visible = Math.max(0, newlines - 1);
        assertEquals("\n".repeat(visible) + "x", Jsoup.parseBodyFragment(n).selectFirst("pre").wholeText());
    }
}

