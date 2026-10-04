package com.dongkuk.dmes.mdm.dma.columnMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Locale;
import org.junit.jupiter.api.Test;

/** {@link ColumnSearchPrefilter} 의 바늘 고르기·패턴 이스케이프 — DB 조건이 Java 판정(toLowerCase)의 필요조건으로만 남는지 본다. */
class ColumnSearchPrefilterTest {

    private static String needle(String keyword) {
        return ColumnSearchPrefilter.safeNeedle(keyword.trim().toLowerCase(Locale.ROOT));
    }

    @Test
    void 한글_숫자_기호와_대소문자_없는_글자는_통째로_바늘이_된다() {
        assertEquals("코일 두께", needle("코일 두께"));
        assertEquals("100%율", needle("100%율"));
        assertEquals("경로\\구분", needle("경로\\구분"));
        assertEquals("a_b", needle("A_B"));
        for (char c : "0129 %_!\\\"　가힣".toCharArray()) {
            assertTrue(ColumnSearchPrefilter.isSafe(c), "안전해야 할 글자: " + c);
        }
    }

    @Test
    void ASCII_밖_원본이_만드는_소문자는_바늘에서_뺀다() {
        // İ→i̇(U+0130 → i + U+0307), K(켈빈 U+212A)→k, Å(옹스트롬 U+212B)→å, Ä→ä, Σ→σ, 어말 시그마 ς 는 문맥으로만 나온다
        for (int c : new int[] {'i', 'k', 0x0307, 'å', 'ä', 'σ', 0x03C2}) {
            assertFalse(ColumnSearchPrefilter.isSafe(c), "안전하지 않아야 할 글자: " + new String(Character.toChars(c)));
        }
        for (char c : "abcdefghjlmnopqrstuvwxyz".toCharArray()) {
            assertTrue(ColumnSearchPrefilter.isSafe(c), "안전해야 할 글자: " + c);
        }
        assertFalse(ColumnSearchPrefilter.isSafe('A'), "소문자로 바뀌는 글자는 바늘에 올 수 없다");
        assertEquals("co", needle("coil_i"), "같은 길이면 앞쪽 구간");
        assertEquals("rg", needle("ÄRG"));
        assertEquals("rger", needle("ärger"));
        assertEquals("zz_h", needle("ZZ_HIT1"));
        assertNull(needle("ik"), "안전 글자가 없으면 DB 에서 글자로 거르지 않는다");
        assertNull(needle("ΟΔΟΣ"), "그리스 글자는 대문자에서 접혀 오고 끝 글자는 어말 시그마(ς)다");
    }

    @Test
    void 대리_쌍을_쪼개지_않는다() {
        String emoji = "😀";
        assertEquals("가" + emoji + "나", needle("가" + emoji + "나"));
        String deseretUpper = new String(Character.toChars(0x10400)); // 소문자가 있는 글자
        assertEquals("가나", needle(deseretUpper + "가나"));
    }

    @Test
    void 패턴은_느낌표_퍼센트_밑줄을_이스케이프하고_역슬래시는_그대로_둔다() {
        assertEquals("%코일%", ColumnSearchPrefilter.containsPattern("코일"));
        assertEquals("%!%!_!!\\%", ColumnSearchPrefilter.containsPattern("%_!\\"));
        assertNull(ColumnSearchPrefilter.containsPattern(null));
    }

    @Test
    void 도메인_ID_에_맞을_수_있는_조건은_숫자와_빼기표뿐이다() {
        assertTrue(ColumnSearchPrefilter.mayMatchDomainId("12"));
        assertTrue(ColumnSearchPrefilter.mayMatchDomainId("-1"));
        assertFalse(ColumnSearchPrefilter.mayMatchDomainId("1a"));
        assertFalse(ColumnSearchPrefilter.mayMatchDomainId("１"), "전각 숫자는 String.valueOf(Long) 에 나오지 않는다");
    }
}
