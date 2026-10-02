package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.scheduling.annotation.Scheduled;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class ScreenUsageRollupScheduleTest {

    @Test
    @DisplayName("매일 02:00 Asia/Seoul 에 돈다")
    void cron() throws Exception {
        Scheduled scheduled = ScreenUsageRollup.class.getMethod("scheduledRollup").getAnnotation(Scheduled.class);

        assertThat(scheduled.cron()).isEqualTo("0 0 2 * * *");
        assertThat(scheduled.zone()).isEqualTo("Asia/Seoul");
    }

    @Test
    @DisplayName("예외는 RevokedTokenPurger 처럼 잡아서 로그만 남긴다")
    void swallowsFailure() {
        ScreenUsageDayRepository dayRepository = mock(ScreenUsageDayRepository.class);
        when(dayRepository.findMaxUsageDt()).thenThrow(new IllegalStateException("db down"));
        ScreenUsageRollup rollup = new ScreenUsageRollup(mock(ScreenUsageLogRepository.class), dayRepository,
                mock(ScreenUsageDayWriter.class), Clock.fixed(Instant.parse("2026-10-02T17:00:00Z"), ZoneId.of("Asia/Seoul")));

        assertThatCode(rollup::scheduledRollup).doesNotThrowAnyException();
    }
}
