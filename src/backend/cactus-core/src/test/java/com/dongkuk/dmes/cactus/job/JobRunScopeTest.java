package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunScopeTest {

    private static final Clock CLOCK = Clock.fixed(Instant.parse("2026-10-09T00:00:00Z"), ZoneOffset.UTC);

    @AfterEach
    void closeScope() {
        JobRunScope.close();
    }

    private static JobRunScope scope(Instant deadline) {
        return new JobRunScope("r1", "mdm.sync", Map.of("k", "v"), Map.of("baseDt", "2026-10-09"), Map.of("baseDt", "DATE"),
                LocalDateTime.parse("2026-10-09T02:00:00"), true, deadline, CLOCK);
    }

    @Test
    @DisplayName("열기 전에는 current 가 비어 있고 require 는 「예약 실행 밖」 예외를 던진다")
    void notOpen() {
        assertThat(JobRunScope.current()).isEmpty();
        assertThatThrownBy(JobRunScope::require).isInstanceOf(JobScopeRequiredException.class).hasMessage("예약 실행 밖에서는 호출할 수 없습니다.");
    }

    @Test
    @DisplayName("열면 같은 스레드에서 보이고, 재진입(이미 열림)은 거절하며, 닫으면 사라진다")
    void openCloseReentry() {
        JobRunScope s = JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)));
        assertThat(JobRunScope.require()).isSameAs(s);
        assertThatThrownBy(() -> JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)))).isInstanceOf(IllegalStateException.class);
        assertThat(JobRunScope.require()).isSameAs(s);   // 바깥 범위는 그대로
        JobRunScope.close();
        assertThat(JobRunScope.current()).isEmpty();
    }

    @Test
    @DisplayName("다른 스레드에서는 범위가 보이지 않는다 — createNewService·병렬 게이트웨이를 거절하는 근거")
    void otherThreadSeesNothing() throws Exception {
        JobRunScope.open(scope(CLOCK.instant().plusSeconds(60)));
        AtomicReference<Boolean> present = new AtomicReference<>();
        Thread t = new Thread(() -> present.set(JobRunScope.current().isPresent()));
        t.start();
        t.join();
        assertThat(present.get()).isFalse();
    }

    @Test
    @DisplayName("쿼리 시간 초과 초 = 마감까지 남은 시간을 올림, 최소 1초")
    void queryTimeoutSeconds() {
        assertThat(scope(CLOCK.instant().plusMillis(30_001)).queryTimeoutSeconds()).isEqualTo(31);
        assertThat(scope(CLOCK.instant().plusMillis(30_000)).queryTimeoutSeconds()).isEqualTo(30);
        assertThat(scope(CLOCK.instant().plusMillis(200)).queryTimeoutSeconds()).isEqualTo(1);
        assertThat(scope(CLOCK.instant().minusSeconds(5)).queryTimeoutSeconds()).isEqualTo(1);
    }

    @Test
    @DisplayName("건수는 보고된 적이 없으면 null, 쌓으면 합계. 수집 값은 보고 순서대로")
    void itemsAndCollected() {
        JobRunScope s = scope(CLOCK.instant().plusSeconds(60));
        assertThat(s.itemCount()).isNull();
        s.addItems(3);
        s.addItems(2);
        assertThat(s.itemCount()).isEqualTo(5);
        s.collect(new CollectedValue("USD", new BigDecimal("1380.5"), null));
        s.collect(new CollectedValue("NOTE", null, "ok"));
        assertThat(s.collected()).extracting(CollectedValue::key).containsExactly("USD", "NOTE");
        assertThat(s.runId()).isEqualTo("r1");
        assertThat(s.jobId()).isEqualTo("mdm.sync");
        assertThat(s.config()).containsEntry("k", "v");
        assertThat(s.vars()).containsEntry("baseDt", "2026-10-09");
        assertThat(s.varTypes()).containsEntry("baseDt", "DATE");
        assertThat(s.schedAt()).isEqualTo(LocalDateTime.parse("2026-10-09T02:00:00"));
        assertThat(s.manual()).isTrue();
    }
}
