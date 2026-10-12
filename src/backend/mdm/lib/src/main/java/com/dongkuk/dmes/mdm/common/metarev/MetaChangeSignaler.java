package com.dongkuk.dmes.mdm.common.metarev;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * MDM 메타 변경 신호(ADR-0007 D2 개정, 2026-10-12) — {@link MetaRevisionRecorder} 가 {@code TB_MDM_META_REV} 에 행을 넣으면 그 트랜잭션이
 * 커밋된 뒤 업무 모듈마다 {@code POST {target}/internal/mdm/metaSignal} 을 보낸다. 모듈은 신호를 받으면 곧바로 {@code changes(since)} 를 확인한다.
 *
 * <p>규칙:
 * <ul>
 *   <li>커밋 뒤에만 보낸다 — 트랜잭션 동기화가 켜져 있으면 {@code afterCommit} 에 건다(트랜잭션마다 한 번, 롤백이면 보내지 않음). 동기화가 없으면
 *       (트랜잭션 밖 직접 호출) 바로 보낸다.</li>
 *   <li>요청 스레드에서 보내지 않는다 — 자체 단일 데몬 스레드가 {@code debounce} 뒤 보내고, 그사이 들어온 요청은 그 한 번에 합친다. HTTP 는 비동기
 *       ({@code sendAsync})이고 연결·읽기 시간 초과가 짧다.</li>
 *   <li>최선 노력 — 실패(모듈 꺼짐·연결 거부·시간 초과·2xx 아님)는 예외로 올리지 않고 로그만 남긴다. 대상마다 첫 실패만 WARN, 이어지는 실패는 DEBUG,
 *       복구 때 INFO 한 줄(Ruling R12, cactus {@code MdmRevisionPoller} 와 같은 방식). 놓친 신호는 모듈의 정기 확인(기본 5분)이 맞춘다.</li>
 *   <li>신호는 내용을 싣지 않는다. 인증은 예약 작업 호출(mcm-core {@code JobCaller})과 같다 — {@code X-Client-Key} + 주체 {@code system:mdm}·역할
 *       {@code SYSTEM}.</li>
 * </ul>
 */
public class MetaChangeSignaler implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MetaChangeSignaler.class);
    static final String PATH = "/internal/mdm/metaSignal";
    static final String PRINCIPAL = "system:mdm";
    static final String ROLE = "SYSTEM";

    private final boolean enabled;
    private final List<String> targets;
    private final String clientKey;
    private final Duration readTimeout;
    private final Duration debounce;
    private final HttpClient http;
    private final ScheduledExecutorService scheduler;
    private final AtomicBoolean pending = new AtomicBoolean();
    /** 대상별 연속 실패 수 — 첫 실패만 WARN. */
    private final Map<String, AtomicInteger> failures = new ConcurrentHashMap<>();

    public MetaChangeSignaler(MetaSignalProperties props, String clientKey) {
        this.targets = props.getTargets() == null ? List.of() : props.getTargets().stream()
                .filter(t -> t != null && !t.isBlank()).map(t -> t.trim().replaceAll("/+$", "")).distinct().toList();
        this.enabled = props.isEnabled() && !targets.isEmpty();
        this.clientKey = clientKey;
        this.readTimeout = props.getReadTimeout();
        this.debounce = props.getDebounce() == null || props.getDebounce().isNegative() ? Duration.ZERO : props.getDebounce();
        this.http = HttpClient.newBuilder().connectTimeout(props.getConnectTimeout()).build();
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "mdm-meta-signal");
            t.setDaemon(true);
            return t;
        });
        if (enabled) {
            log.info("[mdm] 메타 변경 신호 켜짐 — 대상 {}", targets);
        }
    }

    public boolean enabled() {
        return enabled;
    }

    public List<String> targets() {
        return targets;
    }

    /**
     * 변경 기록을 넣었다 — 지금 트랜잭션이 커밋되면 신호를 보낸다(트랜잭션마다 한 번). 트랜잭션 동기화가 없으면 바로 보낸다. 예외를 던지지 않는다.
     */
    public void afterCommit() {
        if (!enabled) {
            return;
        }
        try {
            if (TransactionSynchronizationManager.isSynchronizationActive()) {
                for (TransactionSynchronization s : TransactionSynchronizationManager.getSynchronizations()) {
                    if (s instanceof SignalOnCommit mine && mine.owner() == this) {
                        return; // 이 트랜잭션에 이미 걸었다
                    }
                }
                TransactionSynchronizationManager.registerSynchronization(new SignalOnCommit(this));
                return;
            }
        } catch (RuntimeException e) {
            log.debug("[mdm] 변경 신호를 트랜잭션에 걸지 못했다 — 바로 보낸다: {}", e.getMessage());
        }
        request();
    }

    /** 보내기를 예약한다(기다리는 보내기가 있으면 거기에 합친다). */
    void request() {
        if (!enabled || !pending.compareAndSet(false, true)) {
            return;
        }
        try {
            scheduler.schedule(this::sendAll, debounce.toMillis(), TimeUnit.MILLISECONDS);
        } catch (RejectedExecutionException e) {
            pending.set(false); // 닫는 중
        }
    }

    private void sendAll() {
        pending.set(false); // 보내기 직전에 내린다 — 이 뒤에 커밋된 변경은 보내기 하나를 더 남긴다
        for (String target : targets) {
            try {
                HttpRequest.Builder b = HttpRequest.newBuilder(URI.create(target + PATH))
                        .timeout(readTimeout)
                        .header("Content-Type", "application/json")
                        .header("X-Authenticated-User", PRINCIPAL)
                        .header("X-Authenticated-Role", ROLE)
                        .POST(HttpRequest.BodyPublishers.ofString("{}"));
                if (clientKey != null && !clientKey.isBlank()) {
                    b.header("X-Client-Key", clientKey);
                }
                http.sendAsync(b.build(), HttpResponse.BodyHandlers.discarding()).whenComplete((res, err) -> {
                    if (err == null && res.statusCode() / 100 == 2) {
                        succeeded(target);
                    } else {
                        failed(target, err != null ? err.getClass().getSimpleName() + (err.getMessage() == null ? "" : " " + err.getMessage())
                                : "HTTP " + res.statusCode());
                    }
                });
            } catch (RuntimeException e) {
                failed(target, e.getClass().getSimpleName() + " " + e.getMessage()); // 주소 형식 오류 등
            }
        }
    }

    private void succeeded(String target) {
        AtomicInteger n = failures.get(target);
        if (n != null && n.getAndSet(0) > 0) {
            log.info("[mdm] 변경 신호 복구 — {}", target);
        }
    }

    private void failed(String target, String reason) {
        int n = failures.computeIfAbsent(target, t -> new AtomicInteger()).incrementAndGet();
        if (n == 1) {
            log.warn("[mdm] 변경 신호 실패 — 모듈은 정기 확인에서 따라온다: {} ({})", target, reason);
        } else {
            log.debug("[mdm] 변경 신호 실패 {}회째: {} ({})", n, target, reason);
        }
    }

    @Override
    public void close() {
        scheduler.shutdownNow();
    }

    /** 이 신호기의 커밋 뒤 보내기 — 트랜잭션마다 하나만 건다. */
    private record SignalOnCommit(MetaChangeSignaler owner) implements TransactionSynchronization {

        @Override
        public void afterCommit() {
            owner.request();
        }
    }
}
