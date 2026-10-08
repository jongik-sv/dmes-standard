package com.dongkuk.dmes.cactus.job;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.security.context.UserContextHolder;
import com.dongkuk.dmes.cactus.security.context.UserInfo;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.oasis.TraceConstants;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.logger.MDCTemplate;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.sql.SQLException;
import java.sql.SQLTimeoutException;
import java.time.Clock;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;
import org.springframework.dao.QueryTimeoutException;

/**
 * 예약 실행 진입점 — 새 서비스 유형(설계 §4.4). {@code DmomReceiveDispatcher} 처럼 웹 요청 없이 {@code serviceStarter.start} 를 직접 부르되,
 * <b>실행 결과를 진입점이 DB 에 자동으로 갱신</b>한다({@link JobRunReporter}). 업무 서비스는 이력을 쓰지 않는다.
 *
 * <p>한 시도의 순서: MDC(대상 serviceId — {@code sch.} 로 시작하지 않아 모듈 업무 로그로 간다)·시작 줄 → 감시 예약(시도마다) →
 * 범위·사용자·감사 주체 → {@code serviceStarter.start}(대상은 자기 트랜잭션, 이 클래스는 {@code @Transactional} 이 없다) → 결과 판정 →
 * finally 정리 → <b>회차 상태 객체 CAS</b>(RUNNING→DONE 에 이긴 쪽만 결과를 쓴다) → 재시도 또는 최종 보고.
 *
 * <p>중첩: 결과 갱신 코드는 이 클래스(와 {@link JobRunResultWriter})에만 있고, 서브서비스는 {@code serviceStarter} 로 바로 들어가 진입점을 다시
 * 지나지 않는다. 범위가 열린 스레드에서 {@link #submit} 을 부르면 거절한다.
 */
public class JobRunDispatcher {

    public enum SubmitResult { ACCEPTED, DUPLICATE, JOB_RUNNING, POOL_FULL }

    private enum State { RUNNING, DONE, TIMED_OUT }

    private static final Logger log = LoggerFactory.getLogger(JobRunDispatcher.class);
    private static final long RECENT_MILLIS = TimeUnit.HOURS.toMillis(1);
    private static final int MSG_MAX = 500;

    private final ServiceStarter serviceStarter;
    private final ApplicationContext spring;
    private final JobRunReporter reporter;
    private final JobRunExecutor executor;
    private final String serverName;
    private final Clock clock;
    private final TimeUnit retryUnit;
    private final Map<String, Instant> recentRunIds = new ConcurrentHashMap<>();
    private final Map<String, String> runningJobs = new ConcurrentHashMap<>();

    public JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                            JobRunExecutor executor, String serverName, Clock clock) {
        this(serviceStarter, spring, reporter, executor, serverName, clock, TimeUnit.MINUTES);
    }

    /** 시험이 재시도 대기 단위를 줄이려고 쓴다(운영은 {@code intervalMin} 이 분). */
    JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                     JobRunExecutor executor, String serverName, Clock clock, TimeUnit retryUnit) {
        this.serviceStarter = serviceStarter;
        this.spring = spring;
        this.reporter = reporter;
        this.executor = executor;
        this.serverName = serverName;
        this.clock = clock;
        this.retryUnit = retryUnit;
    }

    public String serverName() {
        return serverName;
    }

    /** 한 시도의 감시용 상태 — 실행 스레드와 감시가 함께 본다(ThreadLocal 범위는 감시 스레드가 못 본다). */
    private static final class Attempt {
        final AtomicReference<State> state = new AtomicReference<>(State.RUNNING);
        volatile Thread thread;
    }

    /** 회차 하나(재시도를 가로질러 유지). */
    private static final class Run {
        final JobRunRequest req;
        final String txId;
        final int maxAttempts;
        volatile int attemptNo = 1;
        volatile String serviceTag;
        volatile Outcome lastFail;

        Run(JobRunRequest req) {
            this.req = req;
            this.txId = TxIdGenerator.generate(req.userId(), req.jobId());
            this.maxAttempts = 1 + (req.retry() == null ? 0 : Math.max(0, req.retry().count()));
        }
    }

    private record Outcome(String status, Integer itemCnt, String msg, List<CollectedValue> collected) {
        boolean fail() { return "FAIL".equals(status); }
    }

    /**
     * 접수 뒤 실행 풀에 넣는다(비동기). 같은 runId 는 DUPLICATE(1시간 기억), 이 서버에서 같은 jobId 가 실행 중이면 JOB_RUNNING, 풀이 가득이면 POOL_FULL.
     * 범위가 이미 열린 스레드(= 실행 중인 서비스 안)에서 부르면 거절한다 — 안쪽 start 가 바깥 트랜잭션·감사 주체를 깨기 때문이다.
     */
    public SubmitResult submit(JobRunRequest req) {
        if (JobRunScope.current().isPresent()) {
            throw new IllegalStateException("예약 실행 범위 안에서는 진입점을 다시 부를 수 없습니다(서비스 중첩은 연결 서브서비스로)");
        }
        validate(req);
        Instant now = clock.instant();
        recentRunIds.values().removeIf(t -> now.toEpochMilli() - t.toEpochMilli() > RECENT_MILLIS);
        if (recentRunIds.putIfAbsent(req.runId(), now) != null) return SubmitResult.DUPLICATE;
        if (runningJobs.putIfAbsent(req.jobId(), req.runId()) != null) {
            recentRunIds.remove(req.runId());
            return SubmitResult.JOB_RUNNING;
        }
        Run run = new Run(req);
        try {
            executor.submit(() -> attempt(run));
        } catch (RejectedExecutionException e) {
            recentRunIds.remove(req.runId());
            runningJobs.remove(req.jobId(), req.runId());
            return SubmitResult.POOL_FULL;
        }
        return SubmitResult.ACCEPTED;
    }

    /**
     * 실행 전에 거절할 요청 — runId·jobId·serviceId 가 비었거나 schedAt 이 ISO 시각이 아니다. runId 가 없으면 FAIL 을 쓸 행도 없으므로
     * 결과 기록 대신 {@link IllegalArgumentException} 으로 접수(400)에서 끝낸다. 기억하지 않으므로 고친 요청은 다시 접수된다.
     */
    private static void validate(JobRunRequest req) {
        if (req == null) throw new IllegalArgumentException("요청이 없습니다");
        if (blank(req.runId()) || blank(req.jobId()) || blank(req.serviceId())) {
            throw new IllegalArgumentException("runId·jobId·serviceId 는 비어 있을 수 없습니다");
        }
        if (blank(req.schedAt())) throw new IllegalArgumentException("schedAt 이 없습니다");
        try {
            req.schedAtTime();
        } catch (java.time.format.DateTimeParseException e) {
            throw new IllegalArgumentException("schedAt 은 ISO 시각(yyyy-MM-ddTHH:mm:ss)이어야 합니다");
        }
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }

    // ── 한 시도 ──────────────────────────────────────────────────────

    private void attempt(Run run) {
        Attempt attempt = new Attempt();
        try {
            new MDCTemplate() {
                @Override
                public void process() {
                    execute(run, attempt);
                }
            }.mdc(null);
        } catch (Throwable t) {
            log.error("예약 실행 진입점 오류 runId={} 원인={}", run.req.runId(), t.getClass().getSimpleName());
            if (attempt.state.compareAndSet(State.RUNNING, State.DONE)) {
                finish(run, new Outcome("FAIL", null, "SYSTEM_ERROR: " + kindOf(t), List.of()));
            }
        }
    }

    private void execute(Run run, Attempt attempt) {
        JobRunRequest req = run.req;
        run.serviceTag = MDC.get(TraceConstants.SERVICE_TAG);
        attempt.thread = Thread.currentThread();
        putMdc(run);
        long startedAt = System.currentTimeMillis();
        log.info("{}/{}", req.serviceId(), req.action());   // analog 서비스 목록이 읽는 줄(OasisServiceExecutor 와 같은 문구)

        ScheduledFuture<?> watch = executor.schedule(() -> onTimeout(run, attempt), Math.max(1, req.timeoutSec()), TimeUnit.SECONDS);
        JobRunScope scope = new JobRunScope(req.runId(), req.jobId(), req.config(), req.inputs(), req.varTypes(),
                req.schedAtTime(), req.manual(), clock.instant().plusSeconds(Math.max(1, req.timeoutSec())), clock);
        boolean opened = false;
        Outcome outcome;
        try {
            JobRunScope.open(scope);
            opened = true;
            UserContextHolder.set(new UserInfo(req.userId(), req.userId(), null, List.of()));
            Map<String, Object> inputs = new LinkedHashMap<>(req.inputs());
            inputs.put("action", req.action());   // 예약 키 — 변수가 덮어쓰지 못하게 마지막에 넣는다
            ServiceResult result = JobServiceInvoker.start(serviceStarter, spring, req.serviceId(), inputs,
                    new CactusAudit(req.userId(), req.jobId(), req.serviceId()));
            outcome = judge(result, scope);
        } catch (Throwable t) {   // CoreServiceStarter 는 Exception 만 결과로 바꾼다 — Error 는 여기서 FAIL 로 쓴다
            outcome = new Outcome("FAIL", null, "SYSTEM_ERROR: " + kindOf(t), List.of());
        } finally {
            watch.cancel(false);
            // 대상이 끝났으니 감시가 이 스레드를 더는 인터럽트하지 못하게 한다 — 풀 스레드가 다음 회차로 넘어간 뒤 늦은 인터럽트가 닿지 않게.
            synchronized (attempt) {
                attempt.thread = null;
            }
            Thread.interrupted();   // 대상 실행 중에 받은 인터럽트 표시는 정리 단계로 끌고 가지 않는다
            if (opened) JobRunScope.close();
            UserContextHolder.clear();
            com.dongkuk.oasis.audit.AuditHolder.remove();
            log.info("Service end - service name [{}] RunTime : [{}]", req.serviceId(), System.currentTimeMillis() - startedAt);
        }

        // 교체에 이긴 쪽만 결과를 쓴다 — 감시가 먼저 TIMED_OUT 으로 바꿨으면 감시가 TIMEOUT 을 썼으니 이 결과는 버린다.
        if (!attempt.state.compareAndSet(State.RUNNING, State.DONE)) return;
        if (outcome.fail() && run.attemptNo < run.maxAttempts) {
            scheduleRetry(run, outcome);
            return;
        }
        finish(run, outcome);
    }

    private Outcome judge(ServiceResult result, JobRunScope scope) {
        if (result == null) return new Outcome("FAIL", null, "SYSTEM_ERROR: 결과 없음", List.of());
        if (result.serviceResultCode() == ServiceResultCode.SUCCESS) {
            Integer cnt = scope.itemCount();
            if (cnt == null) cnt = itemCntOutput(result);
            return new Outcome("OK", cnt, null, scope.collected());
        }
        Throwable ex = result.exception();
        if (isQueryTimeout(ex)) return new Outcome("TIMEOUT", null, "쿼리 시간 초과", List.of());
        String msg = result.serviceResultCode() == ServiceResultCode.USER_ERROR
                ? "USER_ERROR: " + cut(result.serviceResultMessage(), 200)
                : "SYSTEM_ERROR: " + kindOf(ex);
        return new Outcome("FAIL", null, msg, List.of());
    }

    private static Integer itemCntOutput(ServiceResult result) {
        TypedObject t = result.result("jobItemCnt");
        return t != null && t.getObject() instanceof Number n ? n.intValue() : null;
    }

    // ── 시간 초과·재시도·최종 보고 ───────────────────────────────────

    private void onTimeout(Run run, Attempt attempt) {
        if (!attempt.state.compareAndSet(State.RUNNING, State.TIMED_OUT)) return;
        try {
            if (run.serviceTag != null) MDC.put(TraceConstants.SERVICE_TAG, run.serviceTag);
            putMdc(run);
            log.warn("예약 작업 시간 초과 — 실행 스레드를 인터럽트합니다 jobId={} runId={} timeoutSec={}", run.req.jobId(), run.req.runId(), run.req.timeoutSec());
            synchronized (attempt) {
                if (attempt.thread != null) attempt.thread.interrupt();
            }
            finish(run, new Outcome("TIMEOUT", null, "시간 초과(" + run.req.timeoutSec() + "초)", List.of()));
        } finally {
            MDC.clear();
        }
    }

    private void scheduleRetry(Run run, Outcome fail) {
        run.lastFail = fail;
        JobRunRequest.Retry retry = run.req.retry();
        log.info("실패 — {} 뒤 재시도합니다 jobId={} 시도 {}/{}", retry.intervalMin(), run.req.jobId(), run.attemptNo, run.maxAttempts);
        try {
            executor.schedule(() -> resubmit(run), retry.intervalMin(), retryUnit);
        } catch (RejectedExecutionException e) {   // 종료 중이라 대기를 걸 수 없다 — 그때까지의 FAIL 을 쓴다
            finish(run, fail);
        }
    }

    private void resubmit(Run run) {
        run.attemptNo++;
        try {
            executor.submit(() -> attempt(run));
        } catch (RejectedExecutionException e) {
            try {
                if (run.serviceTag != null) MDC.put(TraceConstants.SERVICE_TAG, run.serviceTag);
                putMdc(run);
                Outcome last = run.lastFail;
                run.attemptNo--;   // 이 재시도는 시작하지 못했다
                finish(run, new Outcome("FAIL", null, (last == null ? "" : last.msg()) + " — 재시도 풀 가득", List.of()));
            } finally {
                MDC.clear();
            }
        }
    }

    private void finish(Run run, Outcome o) {
        try {
            JobRunRequest req = run.req;
            String msg = o.msg();
            if (run.attemptNo > 1 && req.retry() != null) {
                msg = (msg == null ? "" : msg) + " (재시도 " + (run.attemptNo - 1) + "/" + req.retry().count() + ")";
            }
            reporter.write(new JobRunReport(req.runId(), req.jobId(), o.status(), o.itemCnt(), cut(msg, MSG_MAX), serverName,
                    run.serviceTag, req.userId(), req.slot(), "OK".equals(o.status()) ? o.collected() : List.of()));
        } catch (RuntimeException e) {
            log.warn("예약 작업 결과 보고 실패 runId={} 원인={}", run.req.runId(), e.getClass().getSimpleName());
        } finally {
            runningJobs.remove(run.req.jobId(), run.req.runId());
        }
    }

    // ── 도우미 ───────────────────────────────────────────────────────

    private static void putMdc(Run run) {
        MDC.put("serviceId", run.req.serviceId());   // sch. 로 시작하지 않는다 → 모듈 업무 로그
        MDC.put("txId", run.txId);
        MDC.put("runId", run.req.runId());
    }

    /** 쿼리 시간 초과: SQLTimeoutException·QueryTimeoutException·ORA-01013 이 원인 사슬에 있다. */
    static boolean isQueryTimeout(Throwable t) {
        for (int i = 0; t != null && i < 20; i++, t = t.getCause()) {
            if (t instanceof SQLTimeoutException || t instanceof QueryTimeoutException) return true;
            if (t instanceof SQLException se && se.getErrorCode() == 1013) return true;
            if (t.getCause() == t) break;
        }
        return false;
    }

    /** 예외 종류 이름(가장 깊은 원인의 클래스 단순 이름) — 메시지는 쓰지 않는다. */
    static String kindOf(Throwable t) {
        if (t == null) return "UnknownError";
        Throwable root = t;
        for (int i = 0; root.getCause() != null && root.getCause() != root && i < 20; i++) root = root.getCause();
        return root.getClass().getSimpleName();
    }

    private static String cut(String s, int max) {
        if (s == null) return null;
        return s.length() > max ? s.substring(0, max) : s;
    }
}
