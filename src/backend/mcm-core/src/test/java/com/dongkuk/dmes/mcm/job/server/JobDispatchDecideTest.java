package com.dongkuk.dmes.mcm.job.server;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.server.JobDispatchService.Slot;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 늦은 회차·겹침 판정(설계 §4.2.1) — DB 없이 판정 규칙만 본다. */
class JobDispatchDecideTest {

    private static final Duration ON_TIME = Duration.ofSeconds(5);
    private static final Duration EXACTLY_LIMIT = JobDispatchService.LATE_LIMIT;
    private static final Duration LATE = JobDispatchService.LATE_LIMIT.plusSeconds(1);
    private static final Duration HOURS_LATE = Duration.ofHours(3);   // 여러 회차를 놓친 경우

    @Test
    @DisplayName("옵션 꺼짐(N): 제때는 RUN, 늦으면(2분 초과) SKIP_LATE — 지금 동작 그대로")
    void optionOffKeepsCurrentBehavior() {
        assertThat(JobDispatchService.decide(ON_TIME, false, () -> false)).isEqualTo(Slot.RUN);
        assertThat(JobDispatchService.decide(EXACTLY_LIMIT, false, () -> false)).isEqualTo(Slot.RUN);   // 정확히 2분은 늦지 않다
        assertThat(JobDispatchService.decide(LATE, false, () -> false)).isEqualTo(Slot.SKIP_LATE);
        assertThat(JobDispatchService.decide(HOURS_LATE, false, () -> false)).isEqualTo(Slot.SKIP_LATE);
    }

    @Test
    @DisplayName("옵션 켜짐(Y): 늦은 회차는 SKIP 대신 RUN_MISSED 한 번, 여러 회차를 놓쳐도 같은 한 건 — 제때는 그대로 RUN")
    void optionOnRunsLateSlotOnce() {
        assertThat(JobDispatchService.decide(ON_TIME, true, () -> false)).isEqualTo(Slot.RUN);
        assertThat(JobDispatchService.decide(EXACTLY_LIMIT, true, () -> false)).isEqualTo(Slot.RUN);
        assertThat(JobDispatchService.decide(LATE, true, () -> false)).isEqualTo(Slot.RUN_MISSED);
        assertThat(JobDispatchService.decide(HOURS_LATE, true, () -> false)).isEqualTo(Slot.RUN_MISSED);
    }

    @Test
    @DisplayName("겹침 규칙은 옵션과 무관하게 그대로: 이전 회차가 실행 중이면 SKIP_OVERLAP(제때든 늦든), 옵션이 꺼진 늦은 회차는 겹침보다 SKIP_LATE 가 먼저")
    void overlapRuleIsUnchanged() {
        assertThat(JobDispatchService.decide(ON_TIME, false, () -> true)).isEqualTo(Slot.SKIP_OVERLAP);
        assertThat(JobDispatchService.decide(ON_TIME, true, () -> true)).isEqualTo(Slot.SKIP_OVERLAP);
        assertThat(JobDispatchService.decide(HOURS_LATE, true, () -> true)).isEqualTo(Slot.SKIP_OVERLAP);   // 옵션 Y 라도 겹치면 건너뜀
        assertThat(JobDispatchService.decide(HOURS_LATE, false, () -> true)).isEqualTo(Slot.SKIP_LATE);
    }

    @Test
    @DisplayName("겹침 조회는 필요할 때만: 늦은 SKIP 이면 DB 를 다시 읽지 않는다")
    void overlapIsQueriedOnlyWhenNeeded() {
        AtomicInteger queries = new AtomicInteger();
        JobDispatchService.decide(HOURS_LATE, false, () -> { queries.incrementAndGet(); return false; });
        assertThat(queries).hasValue(0);
        JobDispatchService.decide(HOURS_LATE, true, () -> { queries.incrementAndGet(); return false; });
        JobDispatchService.decide(ON_TIME, false, () -> { queries.incrementAndGet(); return false; });
        assertThat(queries).hasValue(2);
    }
}
