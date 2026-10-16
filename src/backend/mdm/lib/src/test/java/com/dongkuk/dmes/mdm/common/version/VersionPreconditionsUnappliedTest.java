package com.dongkuk.dmes.mdm.common.version;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/**
 * 공통 버전 엔진의 미적용 판정(BE 리팩토링 2회차 C2 fix) — 새 버전 가드(MDM006)·다른 미적용 버전 검사(MDM007)가 쓴다. 넓은 뜻으로
 * REQUESTED·APPROVED 도 미적용이다(전에는 DRAFT·미래 RELEASED 만 봤다).
 */
class VersionPreconditionsUnappliedTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 15, 9, 0, 0);

    @ParameterizedTest(name = "{0} applyFrom={1}일 → {2}")
    @CsvSource(nullValues = "NULL", value = {
            "DRAFT,     NULL, true",
            "REQUESTED, 30,   true",
            "APPROVED,  30,   true",
            "RELEASED,  1,    true",
            "RELEASED,  0,    false",
            "RELEASED,  NULL, false",
            "CANCELLED, 30,   false",
    })
    void 미적용_판정은_넓은_뜻이다(String status, Integer applyFromDays, boolean expected) {
        VersionRow row = new VersionRow(new VersionRef(VersionTarget.BUSINESS_RULE, "R", BigDecimal.ONE.setScale(3)), status, "kim",
                applyFromDays == null ? null : NOW.plusDays(applyFromDays), null, 0L);
        assertEquals(expected, VersionPreconditions.isUnapplied(row, NOW));
    }
}
