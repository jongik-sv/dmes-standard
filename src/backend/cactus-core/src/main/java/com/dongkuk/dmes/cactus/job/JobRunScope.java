package com.dongkuk.dmes.cactus.job;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * 예약 실행 한 시도의 범위 — 진입점({@code JobRunDispatcher})만 연다(ThreadLocal). 내장 서비스는 이 범위가 열려 있을 때만 실행한다(설계 §8).
 * 범위는 <b>시도마다 새로</b> 만든다(재시도가 건수·수집 값을 비운다). 같은 스레드의 연결 서브서비스에서만 보이고, 다른 스레드
 * ({@code createNewService}·병렬 게이트웨이)에서는 {@link #current()} 가 비어 있다. 감시 스레드가 볼 상태는 별도 객체(AtomicReference)이며
 * 이 범위를 쓰지 않는다.
 */
public final class JobRunScope {

    private static final ThreadLocal<JobRunScope> CURRENT = new ThreadLocal<>();

    private final String runId;
    private final String jobId;
    private final Map<String, Object> config;
    private final Map<String, Object> vars;
    private final Map<String, String> varTypes;
    private final LocalDateTime schedAt;
    private final boolean manual;
    private final Instant deadline;
    private final Clock clock;
    private final AtomicLong items = new AtomicLong();
    private final AtomicBoolean itemsReported = new AtomicBoolean();
    private final List<CollectedValue> collected = new CopyOnWriteArrayList<>();
    private volatile String note;

    public JobRunScope(String runId, String jobId, Map<String, Object> config, Map<String, Object> vars,
                       Map<String, String> varTypes, LocalDateTime schedAt, boolean manual, Instant deadline, Clock clock) {
        this.runId = runId;
        this.jobId = jobId;
        this.config = config == null ? Map.of() : config;
        this.vars = vars == null ? Map.of() : vars;
        this.varTypes = varTypes == null ? Map.of() : varTypes;
        this.schedAt = schedAt;
        this.manual = manual;
        this.deadline = deadline;
        this.clock = clock;
    }

    /** 범위를 연다. 이미 열려 있으면 거절한다 — 같은 스레드 재진입은 안쪽 start 가 바깥 트랜잭션·감사 주체를 깨기 때문이다. */
    public static JobRunScope open(JobRunScope scope) {
        if (CURRENT.get() != null) throw new IllegalStateException("예약 실행 범위가 이미 열려 있습니다(재진입 금지)");
        CURRENT.set(scope);
        return scope;
    }

    public static Optional<JobRunScope> current() {
        return Optional.ofNullable(CURRENT.get());
    }

    /** 열려 있는 범위. 없으면 {@link JobScopeRequiredException}. 내장 서비스의 Java 몸체가 첫 줄에서 부른다. */
    public static JobRunScope require() {
        JobRunScope s = CURRENT.get();
        if (s == null) throw new JobScopeRequiredException();
        return s;
    }

    public static void close() {
        CURRENT.remove();
    }

    public String runId() { return runId; }
    public String jobId() { return jobId; }
    public Map<String, Object> config() { return config; }
    public Map<String, Object> vars() { return vars; }
    public Map<String, String> varTypes() { return varTypes; }
    /** 예정 시각(SCHED_AT) — 코드 작업 문맥과 수집 슬롯의 기준 날짜. */
    public LocalDateTime schedAt() { return schedAt; }
    public boolean manual() { return manual; }
    public Instant deadline() { return deadline; }

    /** JDBC 문장마다 걸 쿼리 시간 초과(초) — 마감까지 남은 시간을 올림, 최소 1초(설계 §4.4). */
    public int queryTimeoutSeconds() {
        long millis = Duration.between(clock.instant(), deadline).toMillis();
        long seconds = (millis + 999) / 1000;
        return (int) Math.max(1, seconds);
    }

    public void addItems(long n) {
        items.addAndGet(n);
        itemsReported.set(true);
    }

    /** 쌓인 건수. 보고된 적이 없으면 null. */
    public Integer itemCount() {
        return itemsReported.get() ? (int) Math.min(Integer.MAX_VALUE, items.get()) : null;
    }

    public void collect(CollectedValue value) {
        collected.add(value);
    }

    public List<CollectedValue> collected() {
        return List.copyOf(collected);
    }

    /**
     * 성공한 실행의 실행 이력 메시지(MSG)에 남길 한 줄 설명(예: 일시 오류를 재시도해 성공). 비우려면 null.
     * 실행이 실패하면 쓰지 않는다 — 실패 문구만 이력에 남는다(진입점 {@code JobRunDispatcher.judge} 규칙).
     */
    public void note(String text) {
        this.note = text;
    }

    public String note() {
        return note;
    }
}
