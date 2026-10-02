package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import java.math.BigDecimal;
import org.junit.jupiter.api.Test;

class VersionRulesTest {

    private static BigDecimal d(String s) {
        return new BigDecimal(s);
    }

    private static void assertInvalid(BusinessException e, String messagePart) {
        assertEquals(MdmErrorCode.INVALID_INPUT.code(), e.getErrors().get(0).code());
        assertTrue(e.getMessage().contains(messagePart), e.getMessage());
    }

    // ── 문자열 → 버전 ────────────────────────────────────────────

    @Test
    void requireVerParsesScaleThree() {
        assertEquals("1.001", VersionRules.requireVer("1.001").toPlainString());
        assertEquals("1.000", VersionRules.requireVer(" 1 ").toPlainString());
    }

    @Test
    void requireVerBlankIsRequiredValue() {
        for (String blank : new String[] {null, "", "  "}) {
            BusinessException e = assertThrows(BusinessException.class, () -> VersionRules.requireVer(blank));
            assertEquals(ErrorCode.REQUIRED_VALUE, e.getErrorCode());
        }
    }

    @Test
    void badFormatIsInvalidInputIncludingExponent() {
        for (String bad : new String[] {"1e5", "1e999999999", "-1", "+1", "12345", "1.0001", "abc"}) {
            BusinessException e = assertThrows(BusinessException.class, () -> VersionRules.requireVer(bad), bad);
            assertInvalid(e, "버전 형식이 올바르지 않습니다");
        }
    }

    @Test
    void optionalVerBlankIsNullElseParsed() {
        assertNull(VersionRules.optionalVer(null));
        assertNull(VersionRules.optionalVer(" "));
        assertEquals("2.500", VersionRules.optionalVer("2.5").toPlainString());
        assertInvalid(assertThrows(BusinessException.class, () -> VersionRules.optionalVer("1e5")), "버전 형식");
    }

    // ── 종류 파싱 ────────────────────────────────────────────────

    @Test
    void parseKindBlankIsMajor() {
        assertEquals(VersionKind.MAJOR, VersionRules.parseKind(null));
        assertEquals(VersionKind.MAJOR, VersionRules.parseKind("  "));
        assertEquals(VersionKind.MINOR, VersionRules.parseKind(" MINOR "));
    }

    @Test
    void parseKindRejectsUnknown() {
        assertInvalid(assertThrows(BusinessException.class, () -> VersionRules.parseKind("minor")),
                "버전 종류는 MAJOR 또는 MINOR 입니다");
    }

    // ── 다음 번호 ────────────────────────────────────────────────

    @Test
    void nextNumberFollowsKind() {
        assertEquals("1.000", VersionRules.nextNumber(null, VersionKind.MAJOR).toPlainString());
        assertEquals("2.000", VersionRules.nextNumber(d("1.007"), VersionKind.MAJOR).toPlainString());
        assertEquals("1.008", VersionRules.nextNumber(d("1.007"), VersionKind.MINOR).toPlainString());
    }

    @Test
    void nextNumberMinorWithoutVersionIsInvalidInput() {
        assertInvalid(assertThrows(BusinessException.class, () -> VersionRules.nextNumber(null, VersionKind.MINOR)),
                "버전이 없으면 major 만 만들 수 있습니다");
    }

    @Test
    void nextNumberLimitsAreTransitionNotAllowed() {
        BusinessException minor = assertThrows(BusinessException.class,
                () -> VersionRules.nextNumber(d("1.999"), VersionKind.MINOR));
        assertEquals(MdmErrorCode.TRANSITION_NOT_ALLOWED.code(), minor.getErrors().get(0).code());
        assertTrue(minor.getMessage().contains("minor 를 더 올릴 수 없습니다. major 를 올리십시오"), minor.getMessage());
        BusinessException major = assertThrows(BusinessException.class,
                () -> VersionRules.nextNumber(d("9998.000"), VersionKind.MAJOR));
        assertEquals(MdmErrorCode.TRANSITION_NOT_ALLOWED.code(), major.getErrors().get(0).code());
        assertTrue(major.getMessage().contains("major 를 더 올릴 수 없습니다"), major.getMessage());
    }

    // ── 새 버전 가능 여부 ────────────────────────────────────────

    @Test
    void flagsWhenAllowed() {
        VersionRules.NewVersionFlags f = VersionRules.newVersionFlags(d("1.007"), true);
        assertTrue(f.canNewMajor());
        assertTrue(f.canNewMinor());
        assertEquals("2.000", f.nextMajor());
        assertEquals("1.008", f.nextMinor());
    }

    @Test
    void flagsNoVersionOnlyMajor() {
        VersionRules.NewVersionFlags f = VersionRules.newVersionFlags(null, true);
        assertTrue(f.canNewMajor());
        assertFalse(f.canNewMinor());
        assertEquals("1.000", f.nextMajor());
        assertNull(f.nextMinor());
    }

    @Test
    void flagsNotAllowedKeepsNextNumbersButNoCan() {
        VersionRules.NewVersionFlags f = VersionRules.newVersionFlags(d("1.007"), false);
        assertFalse(f.canNewMajor());
        assertFalse(f.canNewMinor());
        assertEquals("2.000", f.nextMajor());
        assertEquals("1.008", f.nextMinor());
    }

    @Test
    void flagsMinorLimit() {
        VersionRules.NewVersionFlags f = VersionRules.newVersionFlags(d("1.999"), true);
        assertTrue(f.canNewMajor());
        assertFalse(f.canNewMinor());
        assertNull(f.nextMinor());
    }

    @Test
    void constantsLiveInVersionNumbers() {
        assertEquals(d("1.000"), VersionNumbers.FIRST);
        assertEquals(999, VersionNumbers.MAX_MINOR);
        assertEquals(9998, VersionNumbers.MAX_MAJOR);
    }
}
