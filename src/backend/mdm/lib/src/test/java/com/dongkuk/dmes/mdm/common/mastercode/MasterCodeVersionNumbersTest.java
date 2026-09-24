package com.dongkuk.dmes.mdm.common.mastercode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-02 design.md §3.2 N1~N7 — 채번(불변 규칙 I1~I4). major = floor(max)+1, minor = max+0.001(소수부 999 상한),
 * major 상한 9998, 버전 없음이면 major 1.000 만. max 는 상태를 거르지 않은 전체 목록에서 구한다.
 */
class MasterCodeVersionNumbersTest {

    private static BigDecimal v(String s) {
        return new BigDecimal(s);
    }

    @Test
    void N1_max_1_007_이면_major_2_000_minor_1_008() {
        assertEquals("2.000", MasterCodeVersionNumbers.nextMajor(v("1.007")).toPlainString());
        assertEquals("1.008", MasterCodeVersionNumbers.nextMinor(v("1.007")).toPlainString());
        assertTrue(MasterCodeVersionNumbers.canMinor(v("1.007")));
        assertTrue(MasterCodeVersionNumbers.canMajor(v("1.007")));
    }

    @Test
    void N2_max_2_000_이면_minor_2_001_major_3_000() {
        assertEquals("2.001", MasterCodeVersionNumbers.nextMinor(v("2.000")).toPlainString());
        assertEquals("3.000", MasterCodeVersionNumbers.nextMajor(v("2.000")).toPlainString());
        // SQLite 는 2.000 을 정수 2 로 읽을 수 있다 — scale 0 입력도 같은 결과
        assertEquals("3.000", MasterCodeVersionNumbers.nextMajor(v("2")).toPlainString());
        assertEquals("2.001", MasterCodeVersionNumbers.nextMinor(v("2")).toPlainString());
    }

    @Test
    void N3_소수부_999_면_minor_불가_998_이면_가능() {
        assertFalse(MasterCodeVersionNumbers.canMinor(v("1.999")));
        assertTrue(MasterCodeVersionNumbers.canMinor(v("1.998")));
        assertEquals("1.999", MasterCodeVersionNumbers.nextMinor(v("1.998")).toPlainString());
        assertEquals("2.000", MasterCodeVersionNumbers.nextMajor(v("1.999")).toPlainString());
    }

    @Test
    void N4_major_결과가_9998_을_넘으면_불가() {
        assertTrue(MasterCodeVersionNumbers.canMajor(v("9997.500")));
        assertEquals("9998.000", MasterCodeVersionNumbers.nextMajor(v("9997.500")).toPlainString());
        assertFalse(MasterCodeVersionNumbers.canMajor(v("9998.000")));
        assertFalse(MasterCodeVersionNumbers.canMajor(v("9998.123")));
    }

    @Test
    void N5_버전_없음이면_major_1_000_minor_불가() {
        assertNull(MasterCodeVersionNumbers.maxVer(List.of()));
        assertEquals("1.000", MasterCodeVersionNumbers.nextMajor(null).toPlainString());
        assertTrue(MasterCodeVersionNumbers.canMajor(null));
        assertFalse(MasterCodeVersionNumbers.canMinor(null));
    }

    @Test
    void N6_maxVer_는_입력_전체의_최대값이다() {
        // 호출자는 CANCELLED·DRAFT 를 포함한 모든 VER 를 넘긴다 — maxVer 는 거르지 않는다.
        assertEquals(0, v("1.002").compareTo(MasterCodeVersionNumbers.maxVer(List.of(v("1.000"), v("1.002"), v("1.001")))));
        assertEquals(0, v("2").compareTo(MasterCodeVersionNumbers.maxVer(List.of(v("1.999"), v("2")))));
    }

    @Test
    void N7_label_은_소수_세_자리를_유지한다() {
        assertEquals("v1.010", MasterCodeVersionNumbers.label(v("1.01")));
        assertEquals("v1.000", MasterCodeVersionNumbers.label(v("1")));
        assertEquals("v12.345", MasterCodeVersionNumbers.label(v("12.345")));
    }
}
