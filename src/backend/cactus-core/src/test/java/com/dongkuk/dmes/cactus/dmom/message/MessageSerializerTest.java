package com.dongkuk.dmes.cactus.dmom.message;

import com.dongkuk.dmes.cactus.dmom.DmomException;
import com.dongkuk.dmes.cactus.dmom.format.FormatItem;
import com.dongkuk.dmes.cactus.dmom.format.FormatLayout;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * MessageSerializer 단위 테스트.
 *
 * <p>기대값은 레거시 {@code DMomSendUtil.getMsgFromSendFormat} + {@code CreateBodyMessage} 알고리즘
 * (Phase 0 §0.1) 으로부터 도출. DATA_TP 1~5, 패딩, 날짜, null/NULL quirk, E/G/GE 그룹 반복, trailing 파이프를 검증.
 */
class MessageSerializerTest {

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

    @Test
    void DATA_TP1_String_그대로() {
        String r = serializer.serialize(layout(e("A", "1", 10, 0)), data("A", "hello"));
        assertThat(r).isEqualTo("hello|");
    }

    @Test
    void DATA_TP4_String2_trim() {
        String r = serializer.serialize(layout(e("A", "4", 10, 0)), data("A", "  hi  "));
        assertThat(r).isEqualTo("hi|");
    }

    @Test
    void DATA_TP2_Number_소수점없는값_고정폭zero_pad() {
        // len=8, prec=2 → 정수부 6자리 + 소수부 2자리 → 12 → "000012" + "00"
        String r = serializer.serialize(layout(e("N", "2", 8, 2)), data("N", "12"));
        assertThat(r).isEqualTo("00001200|");
    }

    @Test
    void DATA_TP2_Number_소수점값_분리패딩() {
        // 12.5 / len=8 / prec=2 → "000012" + "50"
        String r = serializer.serialize(layout(e("N", "2", 8, 2)), data("N", "12.5"));
        assertThat(r).isEqualTo("00001250|");
    }

    @Test
    void DATA_TP2_Number_prec0_정수만() {
        String r = serializer.serialize(layout(e("N", "2", 5, 0)), data("N", "42"));
        assertThat(r).isEqualTo("00042|");
    }

    @Test
    void DATA_TP2_Number_빈값() {
        String r = serializer.serialize(layout(e("N", "2", 8, 2)), data("N", ""));
        assertThat(r).isEqualTo("|");
    }

    @Test
    void DATA_TP3_Date_타임스탬프_절단() {
        String r = serializer.serialize(layout(e("D", "3", 14, 0)), data("D", "2026-05-29 10:23:45"));
        assertThat(r).isEqualTo("20260529102345|");
    }

    @Test
    void DATA_TP3_Date_짧은날짜_0패딩() {
        String r = serializer.serialize(layout(e("D", "3", 14, 0)), data("D", "2026-05-29"));
        assertThat(r).isEqualTo("20260529000000|");
    }

    @Test
    void DATA_TP5_Number2_원형유지() {
        String r = serializer.serialize(layout(e("N", "5", 10, 2)), data("N", "12.50"));
        assertThat(r).isEqualTo("12.50|");
    }

    @Test
    void null값은_빈문자열() {
        String r = serializer.serialize(layout(e("A", "1", 10, 0)), data());
        assertThat(r).isEqualTo("|");
    }

    @Test
    void NULL문자열_quirk_대괄호NULL은_빈값() {
        assertThat(serializer.serialize(layout(e("A", "1", 10, 0)), data("A", "[NULL]"))).isEqualTo("|");
        assertThat(serializer.serialize(layout(e("A", "1", 10, 0)), data("A", "NULL,NULL"))).isEqualTo("|");
    }

    @Test
    void NULL포함하지만_다른값있으면_원본유지() {
        // "NullX" → 대문자화 "NULLX" 가 NULL 포함하나 strip 후 "X" 남음 → 원본 유지
        String r = serializer.serialize(layout(e("A", "1", 10, 0)), data("A", "NullX"));
        assertThat(r).isEqualTo("NullX|");
    }

    @Test
    void 다중_Element_trailing_파이프() {
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0), item(2, "E", "b", "1", 10, 0));
        String r = serializer.serialize(l, data("a", "x", "b", "y"));
        assertThat(r).isEqualTo("x|y|");
    }

    @Test
    void Group_반복_직렬화() {
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),    // 반복 2회
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        Map<String, Object> d = data("g", List.of(
                data("a", "a1", "b", "b1"),
                data("a", "a2", "b", "b2")
        ));
        assertThat(serializer.serialize(l, d)).isEqualTo("a1|b1|a2|b2|");
    }

    @Test
    void Group_데이터부족시_빈항목() {
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        Map<String, Object> d = data("g", List.of(data("a", "a1", "b", "b1")));   // 1건만
        assertThat(serializer.serialize(l, d)).isEqualTo("a1|b1|||");
    }

    @Test
    void Group_데이터null이면_전부_빈항목() {
        FormatLayout l = layout(
                item(1, "G", "g", "1", 2, 0),
                item(2, "GE", "a", "1", 10, 0),
                item(3, "GE", "b", "1", 10, 0)
        );
        assertThat(serializer.serialize(l, data())).isEqualTo("||||");
    }

    @Test
    void Element와_Group_혼합() {
        FormatLayout l = layout(
                item(1, "E", "hdr", "1", 10, 0),
                item(2, "G", "g", "1", 1, 0),
                item(3, "GE", "a", "1", 10, 0)
        );
        Map<String, Object> d = data("hdr", "H", "g", List.of(data("a", "x")));
        assertThat(serializer.serialize(l, d)).isEqualTo("H|x|");
    }

    @Test
    void Group헤더만_GE없으면_append없음() {
        FormatLayout l = layout(item(1, "E", "a", "1", 10, 0), item(2, "G", "g", "1", 3, 0));
        assertThat(serializer.serialize(l, data("a", "x"))).isEqualTo("x|");
    }

    // ── H-9/H-10 견고화 ──

    @Test
    void H10_값에_구분자_파이프_포함이면_예외() {
        assertThatThrownBy(() -> serializer.serialize(layout(e("A", "1", 20, 0)), data("A", "a|b")))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("구분자");
    }

    @Test
    void H9_그룹데이터가_반복횟수보다_많으면_예외() {
        // 레이아웃 반복 1인데 데이터 2행 → 초과 행 무음 손실 방지
        FormatLayout l = layout(
                item(1, "G", "g", "1", 1, 0),
                item(2, "GE", "a", "1", 10, 0)
        );
        Map<String, Object> d = data("g", List.of(data("a", "a1"), data("a", "a2")));
        assertThatThrownBy(() -> serializer.serialize(l, d))
                .isInstanceOf(DmomException.class)
                .hasMessageContaining("무음 손실");
    }
}
