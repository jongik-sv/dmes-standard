package com.dongkuk.dmes.mcm.job.agent;

import java.util.Map;

/** 접수 응답 — HTTP 상태와 본문. */
public record AcceptResult(int status, Map<String, Object> body) {

    static AcceptResult of(int status, String code) {
        return new AcceptResult(status, Map.of("code", code));
    }
}
