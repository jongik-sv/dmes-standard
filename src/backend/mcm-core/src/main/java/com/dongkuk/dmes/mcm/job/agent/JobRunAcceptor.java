package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 접수(설계 §4.4 접수 2~7) — 컨트롤러의 주체 검사(1) 뒤에 부른다. 순서는 모듈 일치(2) → CODE 처리기 존재(4) → 진입점 접수(3·5·6) → 202(7).
 * 4 가 3 앞에 오는 것은 계획 D5 — 이미 접수된 회차는 처리기가 있다는 뜻이라 결과가 같다.
 * 실행은 기다리지 않는다. MCM 앱 자신의 작업은 {@link LocalJobRunGateway} 로 이 객체를 HTTP 없이 부른다.
 */
public class JobRunAcceptor {

    static final String CODE_SERVICE_ID = "job^^code";

    private final JobModule appModule;
    private final JobRunDispatcher dispatcher;
    private final JobHandlerRegistry handlers;

    public JobRunAcceptor(JobModule appModule, JobRunDispatcher dispatcher, JobHandlerRegistry handlers) {
        this.appModule = appModule;
        this.dispatcher = dispatcher;
        this.handlers = handlers;
    }

    public AcceptResult accept(JobRunRequest req) {
        if (!wellFormed(req)) return AcceptResult.of(400, "JOB_BAD_REQUEST");
        if (!appModule.name().equalsIgnoreCase(req.module())) return AcceptResult.of(400, "JOB_MODULE_MISMATCH");
        if (CODE_SERVICE_ID.equals(req.serviceId())) {
            Object handlerId = req.config().get("handlerId");
            if (handlerId == null || handlers.find(String.valueOf(handlerId)).isEmpty()) return AcceptResult.of(404, "JOB_HANDLER_NOT_FOUND");
        }
        return switch (dispatcher.submit(req)) {
            case ACCEPTED -> {
                Map<String, Object> body = new LinkedHashMap<>();
                body.put("accepted", true);
                body.put("serverNm", dispatcher.serverName());
                yield new AcceptResult(202, body);
            }
            case DUPLICATE -> new AcceptResult(200, Map.of("duplicate", true));
            case JOB_RUNNING -> AcceptResult.of(409, "JOB_RUNNING");
            case POOL_FULL -> AcceptResult.of(503, "JOB_POOL_FULL");
        };
    }

    private static boolean wellFormed(JobRunRequest r) {
        if (r == null || blank(r.runId()) || blank(r.jobId()) || blank(r.module()) || blank(r.serviceId()) || blank(r.action()) || r.timeoutSec() < 1) {
            return false;
        }
        try {
            r.schedAtTime();
            return true;
        } catch (DateTimeParseException | NullPointerException e) {
            return false;
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
