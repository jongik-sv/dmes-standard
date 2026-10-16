package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 공통 미적용·결재 중 판정(BE 리팩토링 2회차 C2). 미적용은 넓은 뜻이다 — DRAFT·REQUESTED·APPROVED, 또는 적용 시작이 now 보다 뒤인
 * RELEASED. 경계({@code applyFrom == now})와 적용 시작이 없는 RELEASED 는 적용됨, CANCELLED·알 수 없는 상태·null 은 미적용이 아니다.
 */
class VersionRulesUnappliedTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    @ParameterizedTest(name = "{0} applyFrom={1}일 → 미적용 {2}, 결재 중 {3}")
    @CsvSource(nullValues = "NULL", value = {
            "DRAFT,     NULL, true,  false",
            "REQUESTED, 30,   true,  true",
            "APPROVED,  30,   true,  true",
            "RELEASED,  1,    true,  false",
            "RELEASED,  0,    false, false",
            "RELEASED,  -1,   false, false",
            "RELEASED,  NULL, false, false",
            "CANCELLED, 30,   false, false",
            "UNKNOWN,   30,   false, false",
            "NULL,      30,   false, false",
    })
    void 미적용_결재_중_진리표(String status, Integer applyFromDays, boolean unapplied, boolean inApproval) {
        LocalDateTime applyFrom = applyFromDays == null ? null : NOW.plusDays(applyFromDays);
        assertEquals(unapplied, VersionRules.isUnapplied(status, applyFrom, NOW));
        assertEquals(inApproval, VersionRules.isInApproval(status));
    }
}
