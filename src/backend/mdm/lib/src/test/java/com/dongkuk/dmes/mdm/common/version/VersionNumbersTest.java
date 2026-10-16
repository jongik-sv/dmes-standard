package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.Test;

class VersionNumbersTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    @Test
    void firstVersionIsMajorOne() {
        assertEquals(d("1.000"), VersionNumbers.nextMajor(null));
        assertFalse(VersionNumbers.canMinor(null));
    }

    @Test
    void majorFloorsThenAddsOne() {
        assertEquals(d("2.000"), VersionNumbers.nextMajor(d("1.007")));
    }

    @Test
    void minorAddsOneThousandth() {
        assertEquals(d("1.008"), VersionNumbers.nextMinor(d("1.007")));
        assertFalse(VersionNumbers.canMinor(d("1.999")));
        assertFalse(VersionNumbers.canMajor(d("9998.000")));
        assertTrue(VersionNumbers.canMajor(d("9997.500")));
    }

    @Test
    void maxIgnoresScaleDifferences() {
        assertEquals(d("1.001"), VersionNumbers.maxVer(List.of(d("1"), d("1.001"), d("1.000"))));
    }

    @Test
    void nextByKind() {
        assertEquals(d("3.000"), VersionNumbers.next(d("2.004"), VersionKind.MAJOR));
        assertEquals(d("2.005"), VersionNumbers.next(d("2.004"), VersionKind.MINOR));
        assertThrows(IllegalStateException.class, () -> VersionNumbers.next(d("2.999"), VersionKind.MINOR));
    }

    @Test
    void parseAndCompare() {
        assertEquals(d("1.001"), VersionNumbers.parse(" 1.001 "));
        assertEquals(d("2.000"), VersionNumbers.parse("2"));
        assertThrows(IllegalArgumentException.class, () -> VersionNumbers.parse("1.0001"));
        assertTrue(VersionNumbers.same(d("1"), d("1.000")));
        assertFalse(VersionNumbers.same(d("1.001"), d("1.000")));
        assertEquals("1.000", VersionNumbers.plain(d("1")));
        assertEquals("v1.010", VersionNumbers.label(d("1.01")));
    }

    @Test
    void parseRejectsMalformedOrOutOfRange() {
        for (String bad : new String[] {"1e5", "1e999999999", "-1", "+1", "12345", "1.0001", "", "   ", "abc"}) {
            assertThrows(IllegalArgumentException.class, () -> VersionNumbers.parse(bad), bad);
        }
    }

    @Test
    void parseAcceptsPlainDecimals() {
        assertEquals(d("1.000"), VersionNumbers.parse("1"));
        assertEquals(d("1.000"), VersionNumbers.parse("1.0"));
        assertEquals(d("1.001"), VersionNumbers.parse("1.001"));
        assertEquals(d("2.500"), VersionNumbers.parse(" 2.5 "));
        assertEquals(d("9999.999"), VersionNumbers.parse("9999.999"));
    }

    // archive 로 옮긴 MasterCodeVersionNumbersTest(N1~N7) 사례 가운데 위 시험에 없던 것(C3).

    @Test
    void minorJustBelowLimitStillAllowed() {
        assertTrue(VersionNumbers.canMinor(d("1.998")));
        assertEquals("1.999", VersionNumbers.nextMinor(d("1.998")).toPlainString());
        assertEquals("2.000", VersionNumbers.nextMajor(d("1.999")).toPlainString());
        assertTrue(VersionNumbers.canMinor(d("1.007")));
        assertTrue(VersionNumbers.canMajor(d("1.007")));
    }

    @Test
    void majorLimitIsNineNineNineEight() {
        assertEquals("9998.000", VersionNumbers.nextMajor(d("9997.500")).toPlainString());
        assertFalse(VersionNumbers.canMajor(d("9998.123")));
    }

    @Test
    void noVersionsYet() {
        assertNull(VersionNumbers.maxVer(List.of()));
        assertTrue(VersionNumbers.canMajor(null));
    }

    @Test
    void scaleZeroInputKeepsThreeDecimals() {
        // SQLite 는 2.000 을 정수 2 로 읽을 수 있다. 결과는 그래도 소수 세 자리다.
        assertEquals("3.000", VersionNumbers.nextMajor(d("2")).toPlainString());
        assertEquals("2.001", VersionNumbers.nextMinor(d("2")).toPlainString());
        assertEquals("2.001", VersionNumbers.nextMinor(d("2.000")).toPlainString());
        assertEquals("3.000", VersionNumbers.nextMajor(d("2.000")).toPlainString());
    }

    @Test
    void maxTakesEveryInputUnfiltered() {
        // 호출자는 CANCELLED·DRAFT 를 포함한 모든 VER 를 넘긴다. maxVer 는 거르지 않는다.
        assertEquals(0, d("1.002").compareTo(VersionNumbers.maxVer(List.of(d("1.000"), d("1.002"), d("1.001")))));
        assertEquals(0, d("2").compareTo(VersionNumbers.maxVer(List.of(d("1.999"), d("2")))));
    }

    @Test
    void labelKeepsThreeDecimals() {
        assertEquals("v1.000", VersionNumbers.label(d("1")));
        assertEquals("v12.345", VersionNumbers.label(d("12.345")));
    }
}
