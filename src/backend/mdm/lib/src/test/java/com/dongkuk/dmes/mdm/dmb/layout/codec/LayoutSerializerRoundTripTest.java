package com.dongkuk.dmes.mdm.dmb.layout.codec;

import static com.dongkuk.dmes.mdm.dmb.layout.codec.M201Snapshots.copy;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mdm.contract.layout.MdmFillKind;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemSnapshot;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutNumFormat;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-05-03 design.md §3.1 — 스냅샷만으로 직렬화 → 파싱 왕복(수용 기준 1·2, 불변 I1·I2·I3·I7~I10). 입력은 손으로 조립한 M201
 * 스냅샷({@link M201Snapshots})뿐이다 — DB 가 없다.
 */
class LayoutSerializerRoundTripTest {

    private static final Charset EUC_KR = Charset.forName("EUC-KR");
    private static final MdmLayoutSerializeContext CTX = new MdmLayoutSerializeContext(LocalDateTime.of(2026, 9, 22, 14, 30, 15), 1L);

    private final LayoutSerializer serializer = new LayoutSerializer(M201Snapshots.UNITS);
    private final LayoutParser parser = new LayoutParser(M201Snapshots.UNITS);

    private static Map<String, Object> m201Record(Object thk) {
        Map<String, Object> r = new HashMap<>();
        r.put("COIL_ID", "C26A0012345");
        r.put("PROD_DT", "20260922");
        r.put("COIL_THK", thk);
        return r;
    }

    private static String ascii(byte[] b, int from, int to) {
        return new String(Arrays.copyOfRange(b, from, to), StandardCharsets.US_ASCII);
    }

    private static void same(String expected, Object got) {
        assertEquals(0, new BigDecimal(expected).compareTo((BigDecimal) got), expected + " ≠ " + got);
    }

    @Test
    void M201_예시를_187바이트_한_줄로_직렬화한다() {
        byte[] out = serializer.serialize(M201Snapshots.m201(), m201Record(new BigDecimal("3.5")), CTX);
        assertEquals(187, out.length);
        assertEquals(M201Snapshots.expectedLine("C26A0012345", "0035"), new String(out, EUC_KR));
        assertEquals("0035", ascii(out, 158, 162));
        assertEquals("201     ", ascii(out, 0, 8));
        assertEquals("000187", ascii(out, 69, 75), "L100 SNT_LTH 는 69~74(전문 총 길이)");
        assertEquals("00187", ascii(out, 106, 111), "L110 LENGTH 도 전문 총 길이(D5)");
    }

    @Test
    void M201_직렬화한_전문을_같은_스냅샷으로_파싱하면_값이_같다() {
        MdmLayoutSnapshot s = M201Snapshots.m201();
        Map<String, Object> parsed = parser.parse(s, serializer.serialize(s, m201Record(new BigDecimal("3.5")), CTX));
        assertEquals("C26A0012345", parsed.get("COIL_ID"));
        assertEquals("20260922", parsed.get("PROD_DT"));
        same("3.5", parsed.get("COIL_THK"));
    }

    @ParameterizedTest
    @CsvSource({"3.5, 0035", "0.1, 0001", "12.4, 0124"})
    void 원문_03_예시_값_왕복이_일치한다(String mm, String text) {
        MdmLayoutSnapshot s = M201Snapshots.m201();
        byte[] out = serializer.serialize(s, m201Record(new BigDecimal(mm)), CTX);
        assertEquals(text, ascii(out, 158, 162));
        same(mm, parser.parse(s, out).get("COIL_THK"));
    }

    @Test
    void 전송_단위_항목은_송신에서_변환하고_수신에서_역변환한다() {
        MdmLayoutSnapshot base = M201Snapshots.m201();
        // COIL_THK 를 전송 단위 UM, 길이 5 로 — 여분을 1 줄여 총 길이 유지
        List<MdmLayoutItemSnapshot> body = List.of(base.items().get(0), base.items().get(1),
                copy(base.items().get(2), "UM", null, new MdmLayoutNumFormat(false, true, 1), 5, "MM", 1),
                M201Snapshots.filler(4, 163, 24));
        MdmLayoutSnapshot s = M201Snapshots.withBody(base, body, 187);
        byte[] out = serializer.serialize(s, m201Record(new BigDecimal("3.5")), CTX);
        assertEquals("35000", ascii(out, 158, 163));
        same("3.5", parser.parse(s, out).get("COIL_THK"));
    }

    @Test
    void 단위_항목이_가리키는_단위로_변환하고_역변환한다() {
        MdmLayoutSnapshot base = M201Snapshots.m201();
        MdmLayoutItemSnapshot wgt = new MdmLayoutItemSnapshot(3, MdmFillKind.DATA, com.dongkuk.dmes.mdm.contract.layout.MdmLayoutItemType.NUM,
                "COIL_WGT", null, "COIL_WGT_UNIT", null, null, null, null, 158, 6, "TON", 1);
        MdmLayoutItemSnapshot unit = M201Snapshots.chr(4, MdmFillKind.DATA, "COIL_WGT_UNIT", null, null, 164, 4);
        MdmLayoutSnapshot s = M201Snapshots.withBody(base, List.of(base.items().get(0), base.items().get(1), wgt, unit,
                M201Snapshots.filler(5, 168, 19)), 187);
        Map<String, Object> r = new HashMap<>();
        r.put("COIL_WGT", new BigDecimal("1.5"));
        r.put("COIL_WGT_UNIT", "KG");
        byte[] out = serializer.serialize(s, r, CTX);
        assertEquals("015000", ascii(out, 158, 164), "1.5 TON = 1500.0 KG");
        assertEquals("KG  ", ascii(out, 164, 168));
        Map<String, Object> parsed = parser.parse(s, out);
        same("1.5", parsed.get("COIL_WGT"));
        assertEquals("KG", parsed.get("COIL_WGT_UNIT"));
        // 단위 값이 비면 기준 단위 그대로
        r.put("COIL_WGT_UNIT", null);
        byte[] plain = serializer.serialize(s, r, CTX);
        assertEquals("000015", ascii(plain, 158, 164));
        same("1.5", parser.parse(s, plain).get("COIL_WGT"));
    }

    @Test
    void AUTO_는_송신_시각_순번_전문_길이_레이아웃_ID_로_채운다() {
        byte[] out = serializer.serialize(M201Snapshots.m201(), m201Record(new BigDecimal("3.5")), CTX);
        assertEquals("20260922143015", ascii(out, 22, 36));
        assertEquals("00001", ascii(out, 63, 68));
        assertEquals("000187", ascii(out, 69, 75));
        assertEquals("0001", ascii(out, 102, 106));
        assertEquals("00187", ascii(out, 106, 111));
        assertEquals("20260922", ascii(out, 111, 119));
        assertEquals("143015", ascii(out, 119, 125));
        assertEquals("201     ", ascii(out, 0, 8));
        byte[] seven = serializer.serialize(M201Snapshots.m201(), m201Record(new BigDecimal("3.5")),
                new MdmLayoutSerializeContext(CTX.sendTime(), 7L));
        assertEquals("00007", ascii(seven, 63, 68));
        assertEquals("0007", ascii(seven, 102, 106));
    }

    @Test
    void SEND_TIME_은_항목_길이_14_8_6_에_맞춰_쓰고_다른_길이는_오류다() {
        LocalDateTime t = CTX.sendTime();
        assertEquals("20260922143015", LayoutAutoValues.sendTime(t, 14));
        assertEquals("20260922", LayoutAutoValues.sendTime(t, 8));
        assertEquals("143015", LayoutAutoValues.sendTime(t, 6));
        assertThrows(LayoutCodecException.class, () -> LayoutAutoValues.sendTime(t, 10));
        // 길이 10 인 SEND_TIME 본문 항목이 있으면 직렬화가 오류다
        MdmLayoutSnapshot base = M201Snapshots.m201();
        MdmLayoutSnapshot s = M201Snapshots.withBody(base, List.of(base.items().get(0), base.items().get(1), base.items().get(2),
                M201Snapshots.chr(4, MdmFillKind.AUTO, "SEND_AT", "SEND_TIME", null, 162, 10), M201Snapshots.filler(5, 172, 15)), 187);
        assertThrows(LayoutCodecException.class, () -> serializer.serialize(s, m201Record(new BigDecimal("3.5")), CTX));
    }

    @Test
    void 헤더_상수는_재정의가_있으면_재정의_없으면_기본값을_쓴다() {
        byte[] out = serializer.serialize(M201Snapshots.m201(), m201Record(new BigDecimal("3.5")), CTX);
        assertEquals("B1  ", ascii(out, 8, 12), "SND_FAC_TP 재정의");
        assertEquals("B1  ", ascii(out, 15, 19), "RCV_FAC_TP 기본값");
        assertEquals("L2 ", ascii(out, 12, 15), "SND_PROC_TP 기본값");
        assertEquals("IFL2MES201  ", ascii(out, 50, 62), "EAI_IF_ID 재정의");
    }

    @Test
    void 한글_값이_있어도_다음_항목의_바이트_오프셋은_그대로다() {
        MdmLayoutSnapshot euc = M201Snapshots.m201();
        Map<String, Object> r = m201Record(new BigDecimal("3.5"));
        r.put("COIL_ID", "코일A");
        byte[] out = serializer.serialize(euc, r, CTX);
        assertEquals(187, out.length);
        assertArrayEquals("코일A".getBytes(EUC_KR), Arrays.copyOfRange(out, 130, 135));
        assertEquals(" ".repeat(15), ascii(out, 135, 150));
        assertEquals("20260922", ascii(out, 150, 158));
        assertEquals("코일A", parser.parse(euc, out).get("COIL_ID"));

        MdmLayoutSnapshot utf = M201Snapshots.withEncoding(euc, "UTF-8");
        byte[] u = serializer.serialize(utf, r, CTX);
        assertEquals(187, u.length);
        assertArrayEquals("코일A".getBytes(StandardCharsets.UTF_8), Arrays.copyOfRange(u, 130, 137));
        assertEquals(" ".repeat(13), ascii(u, 137, 150));
        assertEquals("20260922", ascii(u, 150, 158));
        assertEquals("코일A", parser.parse(utf, u).get("COIL_ID"));
    }

    @Test
    void 인코딩이_없으면_UTF_8_로_센다() {
        MdmLayoutSnapshot none = M201Snapshots.withEncoding(M201Snapshots.m201(), null);
        Map<String, Object> r = m201Record(new BigDecimal("3.5"));
        r.put("COIL_ID", "코일A");
        byte[] u = serializer.serialize(none, r, CTX);
        assertArrayEquals("코일A".getBytes(StandardCharsets.UTF_8), Arrays.copyOfRange(u, 130, 137));
    }

    @Test
    void 파싱은_받은_값을_그대로_돌려주고_검증하지_않는다() {
        MdmLayoutSnapshot base = M201Snapshots.m201();
        // 본문 CONST 항목(기본값 AA)을 넣은 스냅샷 — 받은 전문의 그 칸이 ZZ 여도 그대로 돌려준다
        MdmLayoutSnapshot s = M201Snapshots.withBody(base, List.of(base.items().get(0), base.items().get(1), base.items().get(2),
                M201Snapshots.chr(4, MdmFillKind.CONST, "GRADE", "AA", null, 162, 2), M201Snapshots.filler(5, 164, 23)), 187);
        byte[] out = serializer.serialize(s, m201Record(new BigDecimal("3.5")), CTX);
        assertEquals("AA", ascii(out, 162, 164));
        out[162] = 'Z';
        out[163] = 'Z';
        byte[] thk = "0999".getBytes(StandardCharsets.US_ASCII);
        System.arraycopy(thk, 0, out, 158, 4);
        Map<String, Object> parsed = parser.parse(s, out);
        assertEquals("ZZ", parsed.get("GRADE"));
        same("99.9", parsed.get("COIL_THK"));
    }

    @Test
    void 전문_길이가_총_길이와_다르면_파싱하지_않는다() {
        MdmLayoutSnapshot s = M201Snapshots.m201();
        byte[] out = serializer.serialize(s, m201Record(new BigDecimal("3.5")), CTX);
        assertThrows(LayoutCodecException.class, () -> parser.parse(s, Arrays.copyOf(out, 186)));
    }

    @Test
    void 파싱_결과는_본문_항목만_물리명으로_담는다() {
        MdmLayoutSnapshot s = M201Snapshots.m201();
        Map<String, Object> parsed = parser.parse(s, serializer.serialize(s, m201Record(null), CTX));
        assertEquals(Set.of("COIL_ID", "PROD_DT", "COIL_THK"), parsed.keySet());
        assertNull(parsed.get("COIL_THK"), "빈 숫자 칸은 공백 → null");
    }
}
