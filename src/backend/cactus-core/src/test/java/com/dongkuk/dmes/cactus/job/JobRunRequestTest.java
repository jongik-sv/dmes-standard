package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunRequestTest {

    private static JobRunRequest req(boolean manual, String reqUserId) {
        return new JobRunRequest("r1", "mdm.sync", "MDM", "jobCode", "run", null, null, null, 60, null, "2026-10-09T02:00:00", manual, reqUserId);
    }

    @Test
    @DisplayName("실행 사용자 — 예약은 SCHEDULER, 「지금 실행」은 요청자(없으면 SCHEDULER)")
    void userId() {
        assertThat(req(false, "admin").userId()).isEqualTo("SCHEDULER");
        assertThat(req(true, "admin").userId()).isEqualTo("admin");
        assertThat(req(true, null).userId()).isEqualTo("SCHEDULER");
    }

    @Test
    @DisplayName("null 맵은 빈 맵으로, 슬롯은 예정 시각의 yyyyMMddHHmm")
    void defaultsAndSlot() {
        JobRunRequest r = req(false, null);
        assertThat(r.inputs()).isEqualTo(Map.of());
        assertThat(r.varTypes()).isEqualTo(Map.of());
        assertThat(r.config()).isEqualTo(Map.of());
        assertThat(r.slot()).isEqualTo("202610090200");
        assertThat(r.schedAtTime().toString()).isEqualTo("2026-10-09T02:00");
    }
}
