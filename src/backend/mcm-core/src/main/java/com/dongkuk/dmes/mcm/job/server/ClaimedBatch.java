package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import java.util.List;

/** {@code job^^dispatch} 의 출력 {@code claimed} — 이번 묶음에서 선점한 실행들과 이어 부를 묶음이 더 있는지(조회 건수 == batchSize). */
public record ClaimedBatch(List<JobRunRequest> runs, boolean more) {
}
