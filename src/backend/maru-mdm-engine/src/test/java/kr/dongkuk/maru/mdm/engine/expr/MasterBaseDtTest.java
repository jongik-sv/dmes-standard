package kr.dongkuk.maru.mdm.engine.expr;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** D-154 — {@code MASTER_AT} base_dt 해석을 공개해 업무 모듈 미리 받기가 같은 규칙을 쓴다(engine-contract §7, D-023). */
class MasterBaseDtTest {

    @Test
    void 여덟_자리는_그날_자정_열네_자리는_그_시각이다() {
        assertEquals(Optional.of(LocalDateTime.parse("2026-03-01T00:00:00")), MasterBaseDt.parse("20260301"));
        assertEquals(Optional.of(LocalDateTime.parse("2026-03-01T12:30:15")), MasterBaseDt.parse("20260301123015"));
    }

    @Test
    void 달력에_없거나_모양이_다르면_빈_값이다() {
        assertEquals(Optional.empty(), MasterBaseDt.parse("20261301"));
        assertEquals(Optional.empty(), MasterBaseDt.parse("20260230"));
        assertEquals(Optional.empty(), MasterBaseDt.parse("2026-03-01"));
        assertEquals(Optional.empty(), MasterBaseDt.parse(""));
        assertEquals(Optional.empty(), MasterBaseDt.parse(null));
        assertTrue(MasterBaseDt.isShape("20261301"));
        assertFalse(MasterBaseDt.isShape("2026031"));
    }
}
