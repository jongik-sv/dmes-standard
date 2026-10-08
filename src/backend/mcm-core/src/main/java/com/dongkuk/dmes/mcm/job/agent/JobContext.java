package com.dongkuk.dmes.mcm.job.agent;

import java.time.LocalDateTime;
import java.util.Map;

/** {@link ScheduledJob#run} 에 넘기는 문맥 — 변수는 MCM 이 선점 때 확정한 값이다. */
public record JobContext(String jobId, String runId, Map<String, Object> vars, LocalDateTime schedAt, boolean manual) {
}
