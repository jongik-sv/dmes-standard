package com.dongkuk.dmes.mdm.dmb.layout.codec;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.math.BigDecimal;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * TSK-05-03 design.md §3.1 — 칸 하나의 인코딩(불변 I1~I6). 03·html 예시 표(3.5 → 0035 등)가 기준이다.
 */
class LayoutFieldCodecTest {

    private static final Charset EUC_KR = Charset.forName("EUC-KR");
    private static final LayoutNumSpec THK = new LayoutNumSpec(false, true, 1, 1);

    private static String ascii(byte[] b) {
        return new String(b, StandardCharsets.US_ASCII);
    }

    @ParameterizedTest
    @CsvSource({"3.5, 0035", "0.1, 0001", "12.4, 0124", "0, 0000", "99.9, 0999"})
    void 암묵_소수점_예시_값을_03_표대로_직렬화한다(String value, String expected) {
        assertEquals(expected, ascii(LayoutFieldCodec.encodeNumber(new BigDecimal(value), 4, THK)));
    }

    @ParameterizedTest
    @CsvSource({"0035, 3.5", "0001, 0.1", "0124, 12.4", "0000, 0", "0999, 99.9"})
    void 암묵_소수점_문자열을_03_표대로_파싱한다(String text, String expected) {
        BigDecimal got = LayoutFieldCodec.decodeNumber(text.getBytes(StandardCharsets.US_ASCII), THK);
        assertEquals(0, new BigDecimal(expected).compareTo(got), text + " → " + got);
    }

    @Test
    void EUC_KR_한글은_2바이트_UTF_8_은_3바이트로_센다() {
        byte[] euc = LayoutFieldCodec.encodeChar("코일", 10, EUC_KR);
        assertEquals(10, euc.length);
        assertArrayEquals("코일".getBytes(EUC_KR), Arrays.copyOf(euc, 4));
        assertEquals("      ", ascii(Arrays.copyOfRange(euc, 4, 10)));
        assertEquals("코일", LayoutFieldCodec.decodeChar(euc, EUC_KR));

        byte[] utf = LayoutFieldCodec.encodeChar("코일", 10, StandardCharsets.UTF_8);
        assertEquals(10, utf.length);
        assertArrayEquals("코일".getBytes(StandardCharsets.UTF_8), Arrays.copyOf(utf, 6));
        assertEquals("    ", ascii(Arrays.copyOfRange(utf, 6, 10)));
        assertEquals("코일", LayoutFieldCodec.decodeChar(utf, StandardCharsets.UTF_8));
    }

    @Test
    void 문자는_오른쪽_공백_숫자는_왼쪽_0으로_채운다() {
        assertEquals("C26A0012345" + " ".repeat(9), ascii(LayoutFieldCodec.encodeChar("C26A0012345", 20, EUC_KR)));
        assertEquals("00012", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("12"), 5, new LayoutNumSpec(false, true, 0, 0))));
    }

    @Test
    void 영_채움이_아니면_숫자는_왼쪽_공백으로_채운다() {
        LayoutNumSpec spec = new LayoutNumSpec(false, false, 1, 1);
        assertEquals("  35", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("3.5"), 4, spec)));
        assertEquals(0, new BigDecimal("3.5").compareTo(LayoutFieldCodec.decodeNumber("  35".getBytes(StandardCharsets.US_ASCII), spec)));
    }

    @Test
    void 부호_자리가_있으면_첫_자리에_부호를_쓴다() {
        LayoutNumSpec spec = new LayoutNumSpec(true, true, 1, 1);
        assertEquals("-0035", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("-3.5"), 5, spec)));
        assertEquals("+0035", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("3.5"), 5, spec)));
        assertEquals(0, new BigDecimal("-3.5").compareTo(LayoutFieldCodec.decodeNumber("-0035".getBytes(StandardCharsets.US_ASCII), spec)));
        assertEquals(0, new BigDecimal("3.5").compareTo(LayoutFieldCodec.decodeNumber("+0035".getBytes(StandardCharsets.US_ASCII), spec)));
    }

    @Test
    void 부호_자리가_없는데_음수면_오류다() {
        assertThrows(LayoutCodecException.class, () -> LayoutFieldCodec.encodeNumber(new BigDecimal("-3.5"), 4, THK));
    }

    @Test
    void 소수점_문자_형식은_도메인_소수_자리까지_쓴다() {
        LayoutNumSpec spec = new LayoutNumSpec(false, true, 0, 1);
        assertEquals("03.5", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("3.5"), 4, spec)));
        assertEquals("03.0", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("3"), 4, spec)));
        assertEquals(0, new BigDecimal("3.5").compareTo(LayoutFieldCodec.decodeNumber("03.5".getBytes(StandardCharsets.US_ASCII), spec)));
    }

    @Test
    void 자리가_넘치면_잘라내지_않고_오류다() {
        assertThrows(LayoutCodecException.class, () -> LayoutFieldCodec.encodeChar("가나다라마바", 10, EUC_KR));
        assertThrows(LayoutCodecException.class, () -> LayoutFieldCodec.encodeNumber(new BigDecimal("1234.5"), 4, THK));
        // 경계 — 직렬화기는 도메인 범위를 보지 않고 자리만 본다
        assertEquals("9999", ascii(LayoutFieldCodec.encodeNumber(new BigDecimal("999.9"), 4, THK)));
        assertEquals("가나다라마", LayoutFieldCodec.decodeChar(LayoutFieldCodec.encodeChar("가나다라마", 10, EUC_KR), EUC_KR));
    }

    @Test
    void 인코딩이_담지_못하는_문자는_오류다() {
        assertThrows(LayoutCodecException.class, () -> LayoutFieldCodec.encodeChar("😀", 10, EUC_KR));
    }

    @Test
    void 빈_값은_공백으로_쓰고_공백은_null_로_읽는다() {
        assertEquals("    ", ascii(LayoutFieldCodec.encodeChar(null, 4, EUC_KR)));
        assertEquals("    ", ascii(LayoutFieldCodec.encodeNumber(null, 4, THK)));
        assertEquals("   ", ascii(LayoutFieldCodec.blank(3)));
        assertNull(LayoutFieldCodec.decodeChar("    ".getBytes(StandardCharsets.US_ASCII), EUC_KR));
        assertNull(LayoutFieldCodec.decodeNumber("    ".getBytes(StandardCharsets.US_ASCII), THK));
    }

    @Test
    void 숫자_칸의_숫자가_아닌_글자는_파싱_오류다() {
        assertThrows(LayoutCodecException.class, () -> LayoutFieldCodec.decodeNumber("00A5".getBytes(StandardCharsets.US_ASCII), THK));
    }
}
