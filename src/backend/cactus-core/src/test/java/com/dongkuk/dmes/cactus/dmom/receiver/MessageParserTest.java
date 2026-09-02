package com.dongkuk.dmes.cactus.dmom.receiver;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;
import com.dongkuk.dmes.cactus.dmom.message.MessageSerializer;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * MessageParser 단위 테스트.
 *
 * <p>역변환 규칙은 상세설계 §5(레거시 {@code getMsgFromRecvFormat})에서 도출. 송신
 * {@link MessageSerializer} 와의 <b>왕복(round-trip)</b> 동등성도 검증한다(단, Number 패딩/정밀도
 * 복원으로 인한 표현 차이는 주석으로 명시).
 */
class MessageParserTest {

    private final MessageParser parser = new MessageParser();
    private final MessageSerializer serializer = new MessageSerializer();

    // ── 헬퍼 ──
    private static FormatItem e(String id, String dataTp, int len, int prec) {
        return new FormatItem(1, "E", id, id, dataTp, len, prec);
    }

    private static FormatItem item(long seq, String tp, String id, String dataTp, int len, int prec) {
        return new FormatItem(seq, tp, id, id, dataTp, len, prec);
    }

    private static FormatLayout layout(FormatItem... items) {
        return new FormatLayout("FMT", BigDecimal.ONE, List.of(items));
    }

    private static Map<String, Object> data(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    // ── DATA_TP 역변환 ──

    @Test
    void DATA_TP1_String_trim() {
        Map<String, Object> r = parser.parse(layout(e("A", "1", 10, 0)), " hi |");
        assertThat(r).containsEntry("A", "hi");
    }

    @Test
    void DATA_TP4_String2_trim() {
        Map<String, Object> r = parser.parse(layout(e("A", "4", 10, 0)), "  hello  |");
        assertThat(r).containsEntry("A", "hello");
    }

    @Test
    void DATA_TP2_Number_소수부_복원() {
        // len=8, prec=2 고정폭 "00001200" → 12.00
        Map<String, Object> r = parser.parse(layout(e("N", "2", 8, 2)), "00001200|");
        assertThat(r).containsEntry("N", "12.00");
    }

    @Test
    void DATA_TP2_Number_prec0_앞0제거() {
        Map<String, Object> r = parser.parse(layout(e("N", "2", 5, 0)), "00042|");
        assertThat(r).containsEntry("N", "42");
    }

    @Test
    void DATA_TP2_Number_빈값() {
        Map<String, Object> r = parser.parse(layout(e("N", "2", 8, 2)), "|");
        assertThat(r).containsEntry("N", "");
    }

    @Test
    void DATA_TP3_Date_유효() {
        Map<String, Object> r = parser.parse(layout(e("D", "3", 14, 0)), "20260529102345|");
        assertThat(r).containsEntry("D", "20260529102345");
    }

    @Test
    void DATA_TP3_Date_범위밖이면_빈값() {
        // "1899..." < "1900" → 무효
        Map<String, Object> r = parser.parse(layout(e("D", "3", 14, 0)), "18991231000000|");
        assertThat(r).containsEntry("D", "");
    }

    @Test
    void DATA_TP3_Date_빈토큰_빈값() {
        Map<String, Object> r = parser.parse(layout(e("D", "3", 14, 0)), "|");
        assertThat(r).containsEntry("D", "");
    }

    @Test
    void DATA_TP5_Number2_원형() {
        Map<String, Object> r = parser.parse(layout(e("N", "5", 10, 2)), "12.50|");
        assertThat(r).containsEntry("N", "12.50");
    }

    // ── 구조(E/G/GE, 빈 토큰, 짧은 전문) ──

    @Test
    void 다중_Element() {
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0), item(2, "E", "b", "1", 10, 0));
        Map<String, Object> r = parser.parse(l, "x|y|");
        assertThat(r).containsEntry("a", "x").containsEntry("b", "y");
    }

    @Test
    void 전문이_짧으면_부족분_빈문자열() {
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0), item(2, "E", "b", "1", 10, 0));
        Map<String, Object> r = parser.parse(l, "x|");
        assertThat(r).containsEntry("a", "x").containsEntry("b", "");
    }

    @Test
    @SuppressWarnings("unchecked")
    void Group_반복_역직렬화() {
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        Map<String, Object> r = parser.parse(l, "a1|b1|a2|b2|");
        List<Map<String, Object>> g = (List<Map<String, Object>>) r.get("g");
        assertThat(g).hasSize(2);
        assertThat(g.get(0)).containsEntry("a", "a1").containsEntry("b", "b1");
        assertThat(g.get(1)).containsEntry("a", "a2").containsEntry("b", "b2");
    }

    @Test
    @SuppressWarnings("unchecked")
    void Group_데이터부족시_빈항목() {
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        Map<String, Object> r = parser.parse(l, "a1|b1|||");
        List<Map<String, Object>> g = (List<Map<String, Object>>) r.get("g");
        assertThat(g).hasSize(2);
        assertThat(g.get(1)).containsEntry("a", "").containsEntry("b", "");
    }

    @Test
    @SuppressWarnings("unchecked")
    void Element와_Group_혼합() {
        FormatLayout l = layout(
                item(1, "E", "hdr", "1", 10, 0),
                item(2, "G", "g", "1", 1, 0),
                item(3, "GE", "a", "1", 10, 0)
        );
        Map<String, Object> r = parser.parse(l, "H|x|");
        assertThat(r).containsEntry("hdr", "H");
        List<Map<String, Object>> g = (List<Map<String, Object>>) r.get("g");
        assertThat(g).hasSize(1);
        assertThat(g.get(0)).containsEntry("a", "x");
    }

    @Test
    void null_전문은_전부_빈값() {
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0));
        Map<String, Object> r = parser.parse(l, null);
        assertThat(r).containsEntry("a", "");
    }

    // ── MessageSerializer 와의 왕복(round-trip) ──

    @Test
    void roundTrip_String_그룹혼합_값보존() {
        FormatLayout l = layout(
                item(1, "E", "hdr", "1", 10, 0),
                item(2, "G", "g", "1", 2, 0),
                item(3, "GE", "a", "1", 10, 0),
                item(4, "GE", "b", "1", 10, 0)
        );
        Map<String, Object> original = data(
                "hdr", "HEAD",
                "g", List.of(data("a", "a1", "b", "b1"), data("a", "a2", "b", "b2"))
        );

        String wire = serializer.serialize(l, original);
        Map<String, Object> parsed = parser.parse(l, wire);

        assertThat(wire).isEqualTo("HEAD|a1|b1|a2|b2|");
        assertThat(parsed.get("hdr")).isEqualTo("HEAD");
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> g = (List<Map<String, Object>>) parsed.get("g");
        assertThat(g.get(0)).containsEntry("a", "a1").containsEntry("b", "b1");
        assertThat(g.get(1)).containsEntry("a", "a2").containsEntry("b", "b2");
    }

    // ── H-9/H-11 견고화 ──

    @Test
    void H9_미소비_데이터_토큰이_있으면_예외() {
        // 레이아웃은 E 2개인데 전문에 필드가 하나 더(오정렬) → 무음 대신 명시 오류
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0), item(2, "E", "b", "1", 10, 0));
        assertThatThrownBy(() -> parser.parse(l, "a|b|c|"))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("토큰 불일치");
    }

    @Test
    void H9_반복그룹_개수초과_오정렬이면_예외() {
        // 레이아웃 반복 2인데 전문엔 3세트 → 초과 토큰 검출
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        assertThatThrownBy(() -> parser.parse(l, "a1|b1|a2|b2|a3|b3|"))
                .isInstanceOf(DmomException.class);
    }

    @Test
    void H11_숫자칸에_비숫자면_명시예외() {
        assertThatThrownBy(() -> parser.parse(layout(e("N", "2", 5, 0)), "ABC|"))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("숫자 변환 실패");
        assertThatThrownBy(() -> parser.parse(layout(e("N", "5", 10, 0)), "12X|"))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("숫자 변환 실패");
    }

    @Test
    void roundTrip_Number_정수는_정밀도복원후_동등() {
        // 송신 "42"(prec0) → "00042" → 수신 "42" (정수는 손실 없음)
        FormatLayout l = layout(e("N", "2", 5, 0));
        String wire = serializer.serialize(l, data("N", "42"));
        Map<String, Object> parsed = parser.parse(l, wire);
        assertThat(wire).isEqualTo("00042|");
        assertThat(parsed).containsEntry("N", "42");
    }
}
