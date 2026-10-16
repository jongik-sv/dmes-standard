package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmRuleVer;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 룰 미적용 판정(넓은 뜻) 특성 시험(BE 리팩토링 2회차 C2) — DRAFT·REQUESTED·APPROVED, 또는 적용 시작이 now 보다 뒤인 RELEASED.
 * 경계({@code applyFrom == now})와 적용 시작이 없는 RELEASED 는 적용됨, CANCELLED 는 미적용이 아니다. 공통 판정으로 옮긴 뒤에도 같아야 한다.
 */
class RuleVersionsUnappliedTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    @ParameterizedTest(name = "{0} applyFrom={1}일 → {2}")
    @CsvSource(nullValues = "NULL", value = {
            "DRAFT,     NULL, true",
            "REQUESTED, 30,   true",
            "APPROVED,  30,   true",
            "RELEASED,  1,    true",
            "RELEASED,  0,    false",
            "RELEASED,  -1,   false",
            "RELEASED,  NULL, false",
            "CANCELLED, 30,   false",
    })
    void 미적용_판정_진리표(String status, Integer applyFromDays, boolean expected) {
        MdmRuleVer v = new MdmRuleVer("R", BigDecimal.ONE.setScale(3), VersionKind.MAJOR, null);
        v.setStatus(status);
        v.setApplyFrom(applyFromDays == null ? null : NOW.plusDays(applyFromDays));
        assertEquals(expected, RuleVersions.isUnapplied(v, NOW));
    }
}
