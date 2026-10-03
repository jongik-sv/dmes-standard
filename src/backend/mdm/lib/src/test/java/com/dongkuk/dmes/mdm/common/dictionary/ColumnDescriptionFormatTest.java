package com.dongkuk.dmes.mdm.common.dictionary;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;

import java.time.Duration;
import java.util.stream.Stream;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * 컬럼 설명 형식 판별(D-150) — m-mdm {@code column-info/api.ts} 의 {@code descriptionFormat} 과 같은 규칙이다. 같은 사례 표를
 * 백엔드 가이드 §11 에 적어 두었다 — 프런트 시험도 이 표를 쓴다. 한쪽 규칙만 바꾸면 이 표가 어긋난다.
 */
class ColumnDescriptionFormatTest {

    static Stream<Arguments> cases() {
        return Stream.of(
                // 일반 글 — 아무 <…> 가 아니라 알려진 태그만 본다
                Arguments.of("a < b", false),
                Arguments.of("Map<String>", false),
                Arguments.of("List<Map<String, Object>>", false),
                Arguments.of("<custom>", false),
                Arguments.of("<script>alert(1)</script>", false), // s 뒤에 c(단어 글자)가 와서 단어 경계가 아니다
                Arguments.of("<brx>", false),
                Arguments.of("<h7>", false),
                Arguments.of("<abbr>", false),
                Arguments.of("<sub>2</sub>", false), // 소독 허용 목록에는 있지만 판별 목록에는 없다
                Arguments.of("< p>", false), // < 바로 뒤가 태그 이름이 아니다
                Arguments.of("<p", false), // 닫는 > 가 없다
                Arguments.of("", false),
                Arguments.of("   ", false),
                // HTML
                Arguments.of("<p>x</p>", true),
                Arguments.of("<BR/>", true), // 대소문자 무시, / 앞이 단어 경계
                Arguments.of("<br>", true),
                Arguments.of("</div>", true), // 닫는 태그만 있어도
                Arguments.of("<pre>코드</pre>", true), // p 가 실패하면 pre 로 다시 맞춘다
                Arguments.of("<h3>제목</h3>", true),
                Arguments.of("<a href=\"https://example.com\">링크</a>", true),
                Arguments.of("<P CLASS=\"x\">", true),
                Arguments.of("<p\n class=\"x\">본문</p>", true), // 속성 사이 줄바꿈
                Arguments.of("앞 글 <img src=\"https://example.com/a.png\"> 뒤 글", true), // 글 중간에서도 찾는다
                Arguments.of("<b한>", true), // 이름 뒤 글자가 A-Za-z0-9_ 가 아니면 경계다 — 한글은 경계
                Arguments.of("<i\u0307>", true), // 결합 문자 U+0307 도 A-Za-z0-9_ 가 아니라 경계다(자바 \b 는 결합 문자를 단어의 일부로 봐 JS 와 어긋났다)
                Arguments.of("<hr>", true),
                Arguments.of("<s>취소</s>", true),
                Arguments.of("<td>칸</td>", true),
                Arguments.of("List<A>", true)); // 알려진 한계 — 알려진 태그 a 와 같은 모양이면 HTML 이다
    }

    @ParameterizedTest(name = "[{index}] {0} → HTML={1}")
    @MethodSource("cases")
    void 알려진_태그가_있을_때만_HTML_이다(String text, boolean html) {
        assertEquals(html, ColumnDescriptionFormat.isHtml(text), text);
    }

    /**
     * 사례 표의 한 줄(TEXT, 시간 상한) — {@code >} 가 태그 이름보다 앞에만 있는 상한(20,000자) 안의 긴 입력도 판별이 선형이다. 이름 뒤
     * {@code [^>]*>} 되추적은 O(n²)라 이 입력 하나에 0.5초쯤 걸렸다.
     */
    @Test
    void 닫는_꺾쇠가_없는_긴_입력도_판별이_빠르다() {
        String text = ">" + "<p".repeat(50_000);
        // 옛 꼴은 이 입력에 약 7.8초, 새 꼴은 0.15ms 이하 — 문턱은 부하가 큰 개발 PC 의 흔들림을 넉넉히 견디게 둔다(재검토 R2).
        assertTimeoutPreemptively(Duration.ofMillis(500), () -> assertFalse(ColumnDescriptionFormat.isHtml(text)));
    }

    @Test
    void null_은_일반_글이다() {
        assertFalse(ColumnDescriptionFormat.isHtml(null));
    }
}
