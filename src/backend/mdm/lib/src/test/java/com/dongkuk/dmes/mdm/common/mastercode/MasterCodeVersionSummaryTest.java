package com.dongkuk.dmes.mdm.common.mastercode;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.Summary;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeVersionSummary.VerRow;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.Test;

/**
 * TSK-06-02 design.md §3.2 S1~S6 — 현재 버전·미적용·계산 상태(불변 규칙 I17·I18, I5 경계). {@code now} 를 인자로 받아
 * 경계({@code applyFrom == now})를 결정적으로 본다.
 */
class MasterCodeVersionSummaryTest {

    private static final LocalDateTime NOW = LocalDateTime.of(2026, 6, 1, 12, 0, 0);
    private static final LocalDateTime OPEN = LocalDateTime.of(9999, 12, 31, 0, 0, 0);

    private static VerRow row(String ver, String status, LocalDateTime from, LocalDateTime to) {
        return new VerRow(new BigDecimal(ver).setScale(3), "MAJOR", status, null, from, to, null, null, 0L, null);
    }

    @Test
    void S1_구간_안의_RELEASED_가_현재_버전이다() {
        Summary s = MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.minusDays(30), NOW.minusDays(10)),
                row("1.001", "RELEASED", NOW.minusDays(10), OPEN)), "INUSE", NOW);
        assertEquals("v1.001", s.currentVerLabel());
        assertEquals(0, new BigDecimal("1.001").compareTo(s.currentVer()));
        assertEquals(0, new BigDecimal("1.001").compareTo(s.currentAppliedVer()));
        assertFalse(s.pending());
        assertEquals("없음", s.unappliedLabel());
        assertTrue(s.unapplied().isEmpty());
    }

    @Test
    void S2_RELEASED_가_모두_미래면_배포_대기() {
        Summary s = MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.plusDays(3), OPEN)), "CREATED", NOW);
        assertEquals("배포 대기 v1.000", s.currentVerLabel());
        assertTrue(s.pending());
        assertNull(s.currentVer());
        assertNull(s.currentAppliedVer());
        assertEquals("v1.000 RELEASED", s.unappliedLabel());
    }

    @Test
    void S3_RELEASED_가_없으면_미확정() {
        Summary s = MasterCodeVersionSummary.summarize(List.of(row("1.000", "DRAFT", null, null)), "CREATED", NOW);
        assertEquals("미확정", s.currentVerLabel());
        assertFalse(s.pending());
        assertEquals("v1.000 DRAFT", s.unappliedLabel());
        assertEquals("미확정", MasterCodeVersionSummary.summarize(List.of(), "CREATED", NOW).currentVerLabel());
    }

    @Test
    void S4_applyFrom_이_now_와_같으면_적용됨() {
        Summary s = MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW, OPEN)), "CREATED", NOW);
        assertTrue(s.unapplied().isEmpty(), "경계 now 는 미적용이 아니다");
        assertEquals("v1.000", s.currentVerLabel());
        assertEquals("INUSE", s.effectiveStatus());
        // 1초 뒤 적용이면 미적용
        Summary later = MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.plusSeconds(1), OPEN)), "CREATED", NOW);
        assertEquals(1, later.unapplied().size());
    }

    @Test
    void S5_DRAFT_와_미래_RELEASED_는_미적용_CANCELLED_는_아니다() {
        Summary s = MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.minusDays(5), NOW.plusDays(2)),
                row("1.001", "CANCELLED", null, null),
                row("1.003", "DRAFT", null, null),
                row("1.002", "RELEASED", NOW.plusDays(2), OPEN)), "INUSE", NOW);
        assertEquals(2, s.unapplied().size());
        assertEquals("v1.002 RELEASED, v1.003 DRAFT", s.unappliedLabel());
        assertEquals(0, new BigDecimal("1.003").compareTo(s.maxVer()), "max 는 모든 행");
        assertEquals("v1.000", s.currentVerLabel());
    }

    @Test
    void S6_저장_CREATED_와_적용된_RELEASED_면_INUSE_로_계산() {
        assertEquals("INUSE", MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.minusDays(1), OPEN)), "CREATED", NOW).effectiveStatus());
        assertEquals("CREATED", MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.plusDays(1), OPEN)), "CREATED", NOW).effectiveStatus());
        assertEquals("CREATED", MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "DRAFT", null, null)), "CREATED", NOW).effectiveStatus());
        assertEquals("DEPRECATED", MasterCodeVersionSummary.summarize(List.of(
                row("1.000", "RELEASED", NOW.minusDays(1), OPEN)), "DEPRECATED", NOW).effectiveStatus());
    }
}
