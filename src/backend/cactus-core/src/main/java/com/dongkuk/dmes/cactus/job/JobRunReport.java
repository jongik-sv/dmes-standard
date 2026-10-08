package com.dongkuk.dmes.cactus.job;

import java.util.List;

/** 진입점이 한 회차의 마지막에 쓰는 결과 — status 는 OK·FAIL·TIMEOUT. slot 은 수집 값 슬롯(yyyyMMddHHmm). */
public record JobRunReport(
        String runId,
        String jobId,
        String status,
        Integer itemCnt,
        String msg,
        String serverNm,
        String serviceTag,
        String userId,
        String slot,
        List<CollectedValue> collected) {

    public JobRunReport {
        collected = collected == null ? List.of() : List.copyOf(collected);
    }
}
