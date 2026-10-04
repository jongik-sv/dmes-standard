package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Locale;
import org.junit.jupiter.api.Test;

/** {@link TermSearchPrefilter} 의 바늘 고르기·패턴 이스케이프 — DB 조건이 Java 판정의 필요조건으로만 남는지 본다. */
class TermSearchPrefilterTest {

    private static String needle(String keyword) {
        return TermSearchPrefilter.safeNeedle(keyword.toUpperCase(Locale.ROOT));
    }

    @Test
    void 한글과_대소문자_없는_글자는_통째로_바늘이_된다() {
        assertEquals("배치번호", needle("배치번호"));
        assertEquals("작업 지시", needle("작업 지시"));
        assertEquals("%B", needle("a%b"), "A 는 ẚ 의 대문자 결과(Aʾ)에 들어 있어 안전하지 않다");
    }

    @Test
    void ASCII_밖_원본이_만드는_ASCII_대문자는_바늘에서_뺀다() {
        // ß→SS, ſ→S, ı→I, ﬁ→FI, ﬅ→ST, ŉ→ʼN, ǰ→J̌, ẖ→H̱, ẗ→T̈, ẘ→W̊, ẙ→Y̊, ẚ→Aʾ
        for (char c : "AFHIJLNSTWY".toCharArray()) {
            assertFalse(TermSearchPrefilter.isSafe(c), "안전하지 않아야 할 글자: " + c);
        }
        for (char c : "BCDEGKMOPQRUVXZ0129 %_!\\\"".toCharArray()) {
            assertTrue(TermSearchPrefilter.isSafe(c), "안전해야 할 글자: " + c);
        }
        assertEquals("CO", needle("coil"));
        assertEquals("R", needle("STRASSE"));
        assertEquals("QZX", needle("QZXA"));
        assertNull(needle("ss"), "안전 글자가 없으면 DB 에서 거르지 않는다");
    }

    @Test
    void 대소문자가_있는_ASCII_밖_글자는_바늘에서_뺀다() {
        assertEquals("RGER", needle("ärger"));
        assertNull(needle("металл"));
        assertNull(needle("ｃｏｉｌ"));
        assertNull(needle("ωμεγα"));
        assertEquals("코일", needle("ÄÖ코일Ü"));
    }

    @Test
    void 대리_쌍을_쪼개지_않는다() {
        String emoji = "😀"; // 대소문자 없음
        assertEquals("가" + emoji + "나", needle("가" + emoji + "나"));
        String deseretLower = new String(Character.toChars(0x10428)); // 대문자가 있는 글자
        assertEquals("가나", needle(deseretLower + "가나"));
    }

    @Test
    void 패턴은_느낌표_퍼센트_밑줄을_이스케이프한다() {
        assertEquals("%배치%", TermSearchPrefilter.containsPattern("배치"));
        assertEquals("%!%!_!!\\%", TermSearchPrefilter.containsPattern("%_!\\"));
        assertNull(TermSearchPrefilter.containsPattern(null));
    }
}
