package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.audit.service.RevokedTokenPurger;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageRollup;
import java.time.LocalDateTime;
import java.util.Map;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;

class McmLegacyJobsTest {

    private final JobServerConfig config = new JobServerConfig();
    private static final JobContext CTX = new JobContext("j", "r", Map.of(), LocalDateTime.of(2026, 10, 9, 2, 0), false);

    @SuppressWarnings("unchecked")
    private static <T> ObjectProvider<T> provider(T bean) {
        ObjectProvider<T> p = mock(ObjectProvider.class);
        when(p.getObject()).thenReturn(bean);
        return p;
    }

    @Test
    @DisplayName("mcm.screenUsageRollup — 매일 02:00, 30분, 기존 rollup() 을 그대로 부르고 집계한 일수가 건수")
    void screenUsageRollup() {
        ScreenUsageRollup rollup = mock(ScreenUsageRollup.class);
        when(rollup.rollup()).thenReturn(new ScreenUsageRollup.Result(3, 5));
        ScheduledJob job = config.mcmScreenUsageRollup(provider(rollup));
        assertThat(job.id()).isEqualTo("mcm.screenUsageRollup");
        assertThat(job.module()).isEqualTo(JobModule.MCM);
        assertThat(job.defaultCron()).isEqualTo("0 2 * * *");
        assertThat(CronSpec.validate(job.defaultCron())).isEmpty();
        assertThat(job.defaultTimeout().toMinutes()).isEqualTo(30);
        assertThat(job.run(CTX)).isEqualTo(3);
        verify(rollup).rollup();
    }

    @Test
    @DisplayName("mcm.revokedTokenPurge — 매시 정각, 10분, 지운 수가 건수. 실패는 삼키지 않고 올려서 FAIL 로 기록된다")
    void revokedTokenPurge() {
        RevokedTokenPurger purger = mock(RevokedTokenPurger.class);
        when(purger.purgeExpired()).thenReturn(4).thenThrow(new IllegalStateException("db down"));
        ScheduledJob job = config.mcmRevokedTokenPurge(provider(purger));
        assertThat(job.id()).isEqualTo("mcm.revokedTokenPurge");
        assertThat(job.defaultCron()).isEqualTo("0 * * * *");
        assertThat(job.defaultTimeout().toMinutes()).isEqualTo(10);
        assertThat(job.run(CTX)).isEqualTo(4);
        assertThatThrownBy(() -> job.run(CTX)).isInstanceOf(IllegalStateException.class);
    }
}
