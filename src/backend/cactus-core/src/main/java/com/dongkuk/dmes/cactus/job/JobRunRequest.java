package com.dongkuk.dmes.cactus.job;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Map;

/**
 * MCM 이 모듈에 보내는 실행 요청 — {@code POST /internal/job/run} 본문(설계 §4.3).
 * {@code inputs} 는 MCM 이 선점 때 확정한 변수 값, {@code varTypes} 는 변수 이름 → STRING·NUMBER·DATE·JSON(계획 D4 — DATE 바인드용),
 * {@code config} 는 정의의 CONFIG_JSON 을 푼 맵이다. {@code schedAt} 은 ISO 글자라 JSON 날짜 변환기에 기대지 않는다.
 */
public record JobRunRequest(
        String runId,
        String jobId,
        String module,
        String serviceId,
        String action,
        Map<String, Object> inputs,
        Map<String, String> varTypes,
        Map<String, Object> config,
        int timeoutSec,
        Retry retry,
        String schedAt,
        boolean manual,
        String reqUserId) {

    public static final String SCHEDULER = "SCHEDULER";
    private static final DateTimeFormatter SLOT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    public record Retry(int count, int intervalMin) {
    }

    public JobRunRequest {
        inputs = inputs == null ? Map.of() : inputs;
        varTypes = varTypes == null ? Map.of() : varTypes;
        config = config == null ? Map.of() : config;
    }

    /** 감사 주체 — 예약은 SCHEDULER, 「지금 실행」은 요청한 사용자. */
    public String userId() {
        return manual && reqUserId != null && !reqUserId.isBlank() ? reqUserId : SCHEDULER;
    }

    public LocalDateTime schedAtTime() {
        return LocalDateTime.parse(schedAt);
    }

    /** 수집 값 저장 슬롯 {@code yyyyMMddHHmm}. */
    public String slot() {
        return SLOT.format(schedAtTime());
    }
}
