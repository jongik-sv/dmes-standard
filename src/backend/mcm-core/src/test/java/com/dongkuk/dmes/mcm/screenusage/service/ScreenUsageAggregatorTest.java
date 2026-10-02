package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

class ScreenUsageAggregatorTest {

    @Test
    @DisplayName("STARTED_AT 일자·화면·사용자·부서로 묶고, OPEN 만 열람으로 세고, 부서 없음은 '-' 다")
    void sumsByDayKey() {
        List<ScreenUsageDay> days = ScreenUsageAggregator.sumByDayKey(List.of(
                log("userA", "D100", "p/a", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000),
                log("userA", "D100", "p/a", "SWITCH", LocalDateTime.of(2026, 10, 2, 10, 0), 2_000),
                log("userA", "D100", "p/a", "RESUME", LocalDateTime.of(2026, 10, 2, 10, 15), 3_000),
                log("userA", null, "p/a", "OPEN", LocalDateTime.of(2026, 10, 2, 11, 0), 4_000),
                log("userA", "D100", "p/a", "OPEN", LocalDateTime.of(2026, 10, 1, 23, 50), 1_200_000)));

        assertThat(days)
                .extracting(ScreenUsageDay::getUsageDt, ScreenUsageDay::getDeptCd,
                        ScreenUsageDay::getOpenCnt, ScreenUsageDay::getSegCnt, ScreenUsageDay::getDurationMs)
                .containsExactlyInAnyOrder(
                        tuple("20261002", "D100", 1, 3, 6_000L),
                        tuple("20261002", "-", 1, 1, 4_000L),
                        tuple("20261001", "D100", 1, 1, 1_200_000L));
    }
}
