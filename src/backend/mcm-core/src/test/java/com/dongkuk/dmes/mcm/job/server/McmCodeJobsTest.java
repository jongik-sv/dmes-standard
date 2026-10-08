package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.JobProperties;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import java.time.LocalDateTime;
import java.util.Map;
import java.util.regex.Pattern;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class McmCodeJobsTest {

    private final JobServerConfig config = new JobServerConfig();
    private final JobRunStore store = mock(JobRunStore.class);

    @Test
    @DisplayName("정리·삭제 코드 작업의 id·모듈·기본 일정·시간 초과 — id 규칙과 crontab 식 검사를 통과한다")
    void definitions() {
        JobProperties props = new JobProperties();
        for (ScheduledJob job : new ScheduledJob[] {config.mcmJobRunSweep(store), config.mcmJobRunPurge(store), config.mcmCollectPurge(store, props)}) {
            assertThat(Pattern.matches("^[A-Za-z0-9_.-]{1,60}$", job.id())).as(job.id()).isTrue();
            assertThat(job.module()).isEqualTo(JobModule.MCM);
            assertThat(CronSpec.validate(job.defaultCron())).as(job.id()).isEmpty();
        }
        assertThat(config.mcmJobRunSweep(store).defaultCron()).isEqualTo("*/5 * * * *");
        assertThat(config.mcmJobRunPurge(store).defaultCron()).isEqualTo("40 3 * * *");
        assertThat(config.mcmCollectPurge(store, props).defaultCron()).isEqualTo("30 3 * * *");
        assertThat(config.mcmJobRunSweep(store).defaultTimeout().toMinutes()).isEqualTo(5);
    }

    private static JobContext ctx() {
        return new JobContext("j", "r", Map.of(), LocalDateTime.of(2026, 10, 9, 3, 30), false);
    }

    @Test
    @DisplayName("collect.enabled=false 면 mcm.collectPurge 는 아무것도 지우지 않는다")
    void collectPurgeDoesNothingWhenDisabled() {
        JobProperties props = new JobProperties();
        props.getCollect().setEnabled(false);
        assertThat(config.mcmCollectPurge(store, props).run(ctx())).isZero();
        verify(store, never()).purgeCollectBefore(anyString(), anyInt());
    }

    @Test
    @DisplayName("켜져 있으면 90일 전 0시 슬롯(yyyyMMddHHmm) 이전 값을 지운다 / 실행 기록은 90일, 정리는 sweep")
    void purgeAndSweepCallStore() {
        org.mockito.Mockito.when(store.purgeCollectBefore(anyString(), anyInt())).thenReturn(7);
        org.mockito.Mockito.when(store.purgeRunsBefore(anyInt(), anyInt())).thenReturn(3);
        org.mockito.Mockito.when(store.sweep()).thenReturn(2);
        assertThat(config.mcmCollectPurge(store, new JobProperties()).run(ctx())).isEqualTo(7);
        verify(store).purgeCollectBefore(org.mockito.ArgumentMatchers.matches("\\d{12}"), anyInt());
        assertThat(config.mcmJobRunPurge(store).run(ctx())).isEqualTo(3);
        verify(store).purgeRunsBefore(90, 5000);
        assertThat(config.mcmJobRunSweep(store).run(ctx())).isEqualTo(2);
    }
}
