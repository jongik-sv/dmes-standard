package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.job.JobModule;
import java.time.Duration;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobHandlerRegistryTest {

    private static ScheduledJob job(String id, JobModule module) {
        return new SimpleScheduledJob(id, module, id, "0 2 * * *", Duration.ofMinutes(1), c -> 0);
    }

    @Test
    @DisplayName("이 앱 모듈의 처리기만 담는다 — mcm-core 의 MCM 작업이 다른 앱에 있어도 등록·실행하지 않는다")
    void onlyOwnModule() {
        JobHandlerRegistry r = new JobHandlerRegistry(JobModule.MDM, List.of(job("mdm.a", JobModule.MDM), job("mcm.b", JobModule.MCM)));
        assertThat(r.all()).extracting(ScheduledJob::id).containsExactly("mdm.a");
        assertThat(r.find("mdm.a")).isPresent();
        assertThat(r.find("mcm.b")).isEmpty();
        assertThat(r.find(null)).isEmpty();
    }

    @Test
    @DisplayName("같은 처리기 id 가 둘이면 기동 때 알 수 있게 예외")
    void duplicateId() {
        assertThatThrownBy(() -> new JobHandlerRegistry(JobModule.MDM, List.of(job("mdm.a", JobModule.MDM), job("mdm.a", JobModule.MDM))))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("mdm.a");
    }
}
