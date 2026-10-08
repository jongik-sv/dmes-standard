package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.AcceptResult;
import com.dongkuk.dmes.mcm.job.agent.LocalJobRunGateway;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.ConnectException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

/**
 * MCM → 모듈 호출(설계 §4.3) — BPMN 트랜잭션 밖의 전용 풀(스레드 8, 대기열 200)에서 {@code POST {base-url}/internal/job/run} 을 보낸다.
 * HTTP 를 기다리는 동안 행 잠금·DB 연결을 쥐지 않는다. 호출 한 건은 새 {@code service_tag} 와 MDC {@code serviceId=jobDispatch}·{@code runId} 로 감싸
 * (호출 풀 스레드는 트리거의 MDC 를 물려받지 않는다) <b>mcm 업무 로그</b>에 남긴다. 주소·인증값은 로그와 기록에 넣지 않는다.
 *
 * <p>응답별 처리: 202·200(duplicate) → SERVER_NM 만 기록(STATUS 는 건드리지 않음) / 503 JOB_POOL_FULL → SKIP / 409 JOB_RUNNING → SKIP /
 * 404 JOB_HANDLER_NOT_FOUND → FAIL / 연결 거부·주소 없음·연결 시간 초과·그 밖의 4xx → FAIL(종류만) / <b>읽기 시간 초과·일반 5xx·우리 코드가 없는 503·읽는 중 끊김 →
 * RUN 유지</b>(접수됐는지 모른다 — 모듈의 결과 갱신이나 정리에 맡긴다). 재시도는 없다. MCM 자신의 모듈은 {@link LocalJobRunGateway} 로 직접 접수한다.
 */
public class JobCaller implements JobCallSink, AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(JobCaller.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    static final String SERVICE_ID = "jobDispatch";

    private final Map<String, String> baseUrls;
    private final JobModule localModule;
    private final LocalJobRunGateway local;
    private final JobRunStore store;
    private final String clientKey;
    private final Duration readTimeout;
    private final HttpClient http;
    private final ThreadPoolExecutor pool;

    public JobCaller(Map<String, String> baseUrls, JobModule localModule, LocalJobRunGateway local, JobRunStore store, String clientKey,
                     int threads, int queue, Duration connectTimeout, Duration readTimeout) {
        this.baseUrls = baseUrls;
        this.localModule = localModule;
        this.local = local;
        this.store = store;
        this.clientKey = clientKey;
        this.readTimeout = readTimeout;
        this.http = HttpClient.newBuilder().connectTimeout(connectTimeout).followRedirects(HttpClient.Redirect.NEVER).build();
        int n = Math.max(1, threads);
        this.pool = new ThreadPoolExecutor(n, n, 60, TimeUnit.SECONDS, new ArrayBlockingQueue<>(Math.max(1, queue)), r -> {
            Thread t = new Thread(r, "job-call");
            t.setDaemon(true);
            return t;
        }, new ThreadPoolExecutor.AbortPolicy());
    }

    @Override
    public void submit(JobRunRequest request) {
        try {
            pool.execute(() -> new MDCTemplate() {
                @Override
                public void process() {
                    MDC.put("serviceId", SERVICE_ID);
                    MDC.put("runId", request.runId());
                    call(request);
                }
            }.mdc(null));
        } catch (RejectedExecutionException e) {
            MDC.put("runId", request.runId());
            try {
                log.warn("호출 대기열이 가득이라 이 회차를 건너뜁니다 jobId={} runId={}", request.jobId(), request.runId());
            } finally {
                MDC.remove("runId");
            }
            store.closeIfRunning(request.runId(), "SKIP", "호출 대기열 가득");
        }
    }

    private void call(JobRunRequest req) {
        try {
            AcceptResult result = localModule.name().equalsIgnoreCase(req.module()) ? local.call(req) : post(req);
            handle(req, result);
        } catch (CallFailure f) {
            log.warn("모듈 호출 실패 jobId={} runId={} module={} 종류={}", req.jobId(), req.runId(), req.module(), f.kind);
            store.closeIfRunning(req.runId(), "FAIL", f.message);
        } catch (Uncertain u) {
            log.warn("모듈 호출 결과를 알 수 없어 RUN 으로 둡니다 jobId={} runId={} module={} 종류={}", req.jobId(), req.runId(), req.module(), u.kind);
        } catch (RuntimeException e) {
            log.warn("모듈 호출 처리 오류 jobId={} runId={} 종류={}", req.jobId(), req.runId(), e.getClass().getSimpleName());
        }
    }

    private void handle(JobRunRequest req, AcceptResult r) {
        String code = r.body().get("code") == null ? "" : String.valueOf(r.body().get("code"));
        switch (r.status()) {
            case 202, 200 -> {
                store.markAccepted(req.runId(), r.body().get("serverNm") == null ? null : String.valueOf(r.body().get("serverNm")));
                log.info("예약 작업 호출 접수 jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
            }
            case 503 -> {
                if ("JOB_POOL_FULL".equals(code)) {
                    store.closeIfRunning(req.runId(), "SKIP", "실행 풀 가득");
                    log.info("예약 작업 호출 건너뜀(실행 풀 가득) jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
                } else {
                    throw new Uncertain("503");
                }
            }
            case 409 -> {
                store.closeIfRunning(req.runId(), "SKIP", "같은 서버에서 실행 중");
                log.info("예약 작업 호출 건너뜀(같은 서버에서 실행 중) jobId={} runId={} module={}", req.jobId(), req.runId(), req.module());
            }
            case 404 -> {
                if ("JOB_HANDLER_NOT_FOUND".equals(code)) throw new CallFailure("처리기 없음", "JOB_HANDLER_NOT_FOUND");
                throw new CallFailure("모듈 호출 실패(HTTP 404)", "HTTP404");
            }
            default -> {
                if (r.status() >= 400 && r.status() < 500) throw new CallFailure("모듈 호출 실패(HTTP " + r.status() + ")", "HTTP" + r.status());
                throw new Uncertain("HTTP" + r.status());
            }
        }
    }

    private AcceptResult post(JobRunRequest req) {
        String base = baseUrls.get(req.module().toLowerCase(Locale.ROOT));
        if (base == null) base = baseUrls.get(req.module().toUpperCase(Locale.ROOT));
        if (base == null || base.isBlank()) throw new CallFailure("모듈 호출 실패(주소 설정 없음)", "NoBaseUrl");
        try {
            HttpRequest request = HttpRequest.newBuilder(URI.create(base.replaceAll("/+$", "") + "/internal/job/run"))
                    .timeout(readTimeout)
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("X-Client-Key", clientKey)
                    .header("X-Authenticated-User", "system:mcm")
                    .header("X-Authenticated-Role", "SYSTEM")
                    .header("X-Tx-Id", UUID.randomUUID().toString())
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(req)))
                    .build();
            HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
            return new AcceptResult(response.statusCode(), parse(response.body()));
        } catch (HttpConnectTimeoutException | ConnectException e) {
            throw new CallFailure("모듈 호출 실패(" + e.getClass().getSimpleName() + ")", e.getClass().getSimpleName());
        } catch (IOException e) {
            throw new Uncertain(e.getClass().getSimpleName());   // 읽기 시간 초과·읽는 중 끊김 — 접수됐는지 모른다
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new Uncertain("Interrupted");
        } catch (IllegalArgumentException e) {
            throw new CallFailure("모듈 호출 실패(주소 형식)", "BadUrl");
        }
    }

    private static Map<String, Object> parse(String body) {
        try {
            JsonNode n = JSON.readTree(body == null ? "" : body);
            return n != null && n.isObject() ? JSON.convertValue(n, new com.fasterxml.jackson.core.type.TypeReference<Map<String, Object>>() {}) : Map.of();
        } catch (IOException e) {
            return Map.of();
        }
    }

    @Override
    public void close() {
        pool.shutdownNow();
    }

    /** 확실히 접수 안 됨 → FAIL. message 는 실행 기록 MSG 로 가므로 주소·원문을 담지 않는다. */
    private static final class CallFailure extends RuntimeException {
        final String message;
        final String kind;

        CallFailure(String message, String kind) {
            super(null, null, false, false);
            this.message = message;
            this.kind = kind;
        }
    }

    /** 접수 여부를 모른다 → RUN 유지. */
    private static final class Uncertain extends RuntimeException {
        final String kind;

        Uncertain(String kind) {
            super(null, null, false, false);
            this.kind = kind;
        }
    }
}
