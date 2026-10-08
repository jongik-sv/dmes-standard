package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;

/**
 * 예약 실행 진입점(설계 §4.4·§9 「모듈 쪽: 진입점」). 실제 OASIS {@code ServiceStarter}(transactional + multi-tx) 위에서 BPMN(job-run/*.bpmn)을
 * 돌린다. 트랜잭션 매니저는 begin·commit·rollback 만 기록하는 가짜고, 결과 보고는 기록용 가짜다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class JobRunDispatcherTest {

    private GenericApplicationContext ctx;
    private RecordingTxManager biz;
    private RecordingReporter reporter;
    private JobRunExecutor executor;
    private JobRunDispatcher dispatcher;

    @BeforeEach
    void setUp() {
        JobRunTestTask.reset();
        biz = new RecordingTxManager();
        reporter = new RecordingReporter(biz);
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> biz);
        ctx.refresh();
        executor = new JobRunExecutor(2);
        dispatcher = newDispatcher(executor);
    }

    @AfterEach
    void tearDown() {
        executor.close();
        ctx.close();
        JobRunScope.close();
    }

    private static JobRunRequest req(String runId, String jobId, String serviceId, int timeoutSec, JobRunRequest.Retry retry) {
        return new JobRunRequest(runId, jobId, "MDM", serviceId, "run", Map.of("baseDt", "2026-10-09"), Map.of("baseDt", "DATE"),
                Map.of("k", "v"), timeoutSec, retry, "2026-10-09T02:00:00", false, null);
    }

    @Test
    @DisplayName("대상 SUCCESS → OK 갱신 1회 — 건수는 범위에 쌓인 값, 서버·태그·감사 사용자·슬롯이 실린다")
    void successWritesOkOnce() throws Exception {
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next();

        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(7);
        assertThat(r.runId()).isEqualTo("r1");
        assertThat(r.serverNm()).isEqualTo("srv1");
        assertThat(r.userId()).isEqualTo("SCHEDULER");
        assertThat(r.slot()).isEqualTo("202610090200");
        assertThat(r.serviceTag()).isNotBlank();
        assertThat(biz.events).containsExactly("begin", "commit");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("실행 스레드의 MDC serviceId 는 대상 서비스 ID(sch. 로 시작하지 않음 → 모듈 업무 로그), service_tag 는 보고의 태그와 같다")
    void mdcIsTheTargetService() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null));
        JobRunReport r = reporter.next();
        String line = JobRunTestTask.LOG.get(0);
        assertThat(line).contains("serviceId=jobRunOk").doesNotContain("serviceId=sch.").contains("run=r1").contains("tag=" + r.serviceTag());
    }

    @Test
    @DisplayName("USER_ERROR → FAIL — 결과 코드와 사용자용 메시지만")
    void userErrorFails() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunUserError", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).isEqualTo("USER_ERROR: 업무 예외");
        assertThat(biz.events).containsExactly("begin", "rollback");
    }

    @Test
    @DisplayName("SYSTEM_ERROR → FAIL — 예외 종류 이름만, 원문 메시지(주소·비밀번호)는 없다. 대상 롤백이 끝난 뒤에 보고한다")
    void systemErrorFailsWithoutRawMessage() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).isEqualTo("SYSTEM_ERROR: IllegalStateException");
        assertThat(r.msg()).doesNotContain("secret").doesNotContain("hunter2").doesNotContain("jdbc");
        assertThat(reporter.eventsAtWrite.get(0)).containsExactly("begin", "rollback");   // 대상 롤백 뒤 별도로 FAIL 기록
    }

    @Test
    @DisplayName("Error 도 FAIL 로 쓰고 풀 스레드가 죽지 않아 다음 회차가 돈다")
    void errorFailsAndPoolSurvives() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunFatal", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).doesNotContain("fatal secret");
        dispatcher.submit(req("r2", "j2", "jobRunOk", 30, null));
        assertThat(reporter.next().status()).isEqualTo("OK");
    }

    @Test
    @DisplayName("시간 초과 → 감시가 TIMEOUT 을 1회 쓰고 인터럽트한다 — 인터럽트로 생긴 SYSTEM_ERROR(FAIL)는 갱신하지 않는다")
    void timeoutWritesOnceAndLateFailIsDropped() throws Exception {
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunSlow", 1, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(r.msg()).contains("시간 초과");
        Thread.sleep(700);   // 인터럽트된 실행 스레드가 FAIL 로 끝난 뒤에도
        assertThat(JobRunTestTask.LOG).contains("interrupted");
        reporter.assertNoMore();
        assertThat(dispatcher.submit(req("r2", "j1", "jobRunOk", 30, null))).as("TIMEOUT 으로 닫힌 작업은 다음 회차를 막지 않는다").isEqualTo(SubmitResult.ACCEPTED);
    }

    @Test
    @DisplayName("마감 직전 완료와 감시가 경합해도 회차마다 갱신은 정확히 1회(OK 또는 TIMEOUT)")
    void raceAtDeadlineWritesExactlyOnce() throws Exception {
        executor.close();
        executor = new JobRunExecutor(12);
        dispatcher = newDispatcher(executor);
        JobRunTestTask.sleepMillis = 980;   // timeoutSec=1 의 마감(1000ms) 직전
        for (int i = 0; i < 12; i++) {
            assertThat(dispatcher.submit(req("race-" + i, "race-job-" + i, "jobRunSlow", 1, null))).isEqualTo(SubmitResult.ACCEPTED);
        }
        List<JobRunReport> reports = reporter.drain(12, 20_000);
        Thread.sleep(500);
        reports.addAll(reporter.drainNow());
        assertThat(reports).hasSize(12);
        assertThat(reports).extracting(JobRunReport::runId).doesNotHaveDuplicates();
        assertThat(reports).extracting(JobRunReport::status).allMatch(s -> s.equals("OK") || s.equals("TIMEOUT"));
    }

    @Test
    @DisplayName("쿼리 시간 초과(SQLTimeoutException·ORA-01013)는 FAIL 이 아니라 TIMEOUT 1회, 대상은 롤백")
    void queryTimeoutIsTimeout() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunQueryTimeout", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(r.msg()).contains("쿼리 시간 초과");
        assertThat(biz.events).containsExactly("begin", "rollback");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도 — 1회차 FAIL → 대기 → 2회차 OK. 대기 시간이 timeoutSec 보다 길어도 TIMEOUT 되지 않고, 건수는 쌓이지 않고, 갱신은 마지막에 한 번, MSG 에 「재시도 1/1」")
    void retryThenOk() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunFlaky", 1, new JobRunRequest.Retry(1, 1500)));   // retryUnit=ms 라 1500ms 대기
        JobRunReport r = reporter.next(10_000);
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(5);
        assertThat(r.msg()).contains("재시도 1/1");
        assertThat(JobRunTestTask.FLAKY.get()).isEqualTo(2);
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도를 다 써도 FAIL 이면 마지막 시도 뒤 한 번 FAIL 을 쓴다")
    void retryExhausted() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, new JobRunRequest.Retry(1, 10)));
        JobRunReport r = reporter.next(10_000);
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).contains("재시도 1/1");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("재시도 재투입 때 풀이 가득이면 그때까지의 FAIL 을 기록한다")
    void retryPoolFullWritesFail() throws Exception {
        executor.close();
        executor = new JobRunExecutor(1);
        dispatcher = newDispatcher(executor);
        dispatcher.submit(req("r1", "j1", "jobRunSystemError", 30, new JobRunRequest.Retry(1, 300)));
        Thread.sleep(100);   // 1회차가 FAIL 로 끝나 재시도 대기에 들어간 뒤 풀을 다른 작업으로 채운다
        JobRunTestTask.sleepMillis = 3_000;
        assertThat(dispatcher.submit(req("r2", "j2", "jobRunSlow", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunReport r = reporter.next(10_000);
        assertThat(r.runId()).isEqualTo("r1");
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(r.msg()).contains("풀 가득");
    }

    @Test
    @DisplayName("범위 안에서 진입점을 다시 부르면 거절 — 바깥 회차는 그대로 OK 이고 갱신은 1회")
    void reentryIsRejected() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunReenter", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("OK");
        assertThat(JobRunTestTask.LOG).containsExactly("reenter-rejected", "outer-scope=r1");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("요청이 잘못되면(runId·jobId·serviceId 빈 값, schedAt 없음·ISO 아님) 접수하지 않고 IllegalArgumentException — 기억하지 않아 고친 요청은 접수된다")
    void invalidRequestIsRejected() throws Exception {
        assertThatThrownBy(() -> dispatcher.submit(withSchedAt("r1", "j1", "jobRunOk", null))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> dispatcher.submit(withSchedAt("r1", "j1", "jobRunOk", "2026/10/09 02:00"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> dispatcher.submit(withSchedAt(" ", "j1", "jobRunOk", "2026-10-09T02:00:00"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> dispatcher.submit(withSchedAt("r1", null, "jobRunOk", "2026-10-09T02:00:00"))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> dispatcher.submit(withSchedAt("r1", "j1", "", "2026-10-09T02:00:00"))).isInstanceOf(IllegalArgumentException.class);
        reporter.assertNoMore();
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        assertThat(reporter.next().status()).isEqualTo("OK");
    }

    private static JobRunRequest withSchedAt(String runId, String jobId, String serviceId, String schedAt) {
        return new JobRunRequest(runId, jobId, "MDM", serviceId, "run", null, null, null, 30, null, schedAt, false, null);
    }

    @Test
    @DisplayName("서브서비스 3겹(바깥 → 가운데 → 안쪽)에서도 결과 갱신은 1회 — 안쪽은 같은 범위를 보되 보고할 길이 없다")
    void threeLevelSubServicesReportOnce() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunNestedOuter", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.status()).isEqualTo("OK");
        assertThat(JobRunTestTask.LOG).containsExactly("leaf:r1", "leaf:r1");
        assertThat(biz.events).as("연결 서브서비스는 부모 트랜잭션 하나").containsExactly("begin", "commit");
        reporter.assertNoMore();
    }

    @Test
    @DisplayName("다른 스레드에서는 범위가 보이지 않는다")
    void otherThreadHasNoScope() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOtherThread", 30, null));
        reporter.next();
        assertThat(JobRunTestTask.LOG).containsExactly("otherThreadSeesScope=false");
    }

    @Test
    @DisplayName("수집 값은 범위에 쌓여 OK 보고에 실린다")
    void collectedValuesTravelWithOk() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunCollect", 30, null));
        JobRunReport r = reporter.next();
        assertThat(r.collected()).extracting(CollectedValue::key).containsExactly("K");
        assertThat(r.itemCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("접수 상태 — 같은 runId 는 DUPLICATE, 같은 jobId 가 실행 중이면 JOB_RUNNING, 풀이 가득이면 POOL_FULL(그 회차는 등록되지 않는다)")
    void submitStates() throws Exception {
        executor.close();
        executor = new JobRunExecutor(1);
        dispatcher = newDispatcher(executor);
        JobRunTestTask.sleepMillis = 3_000;
        assertThat(dispatcher.submit(req("r1", "j1", "jobRunSlow", 30, null))).isEqualTo(SubmitResult.ACCEPTED);
        JobRunTestTask.started.await(5, TimeUnit.SECONDS);
        assertThat(dispatcher.submit(req("r1", "j9", "jobRunOk", 30, null))).isEqualTo(SubmitResult.DUPLICATE);
        assertThat(dispatcher.submit(req("r2", "j1", "jobRunOk", 30, null))).isEqualTo(SubmitResult.JOB_RUNNING);
        assertThat(dispatcher.submit(req("r3", "j3", "jobRunOk", 30, null))).isEqualTo(SubmitResult.POOL_FULL);
        reporter.next(10_000);   // r1 종료 — 보고 직후에는 풀 스레드가 아직 돌아가는 중일 수 있어 잠깐 기다리며 다시 시도한다
        SubmitResult again = SubmitResult.POOL_FULL;
        for (int i = 0; i < 50 && again == SubmitResult.POOL_FULL; i++) {
            again = dispatcher.submit(req("r3", "j3", "jobRunOk", 30, null));
            if (again == SubmitResult.POOL_FULL) Thread.sleep(40);
        }
        assertThat(again).as("풀 가득으로 거절된 runId 는 기억하지 않아 다시 접수된다").isEqualTo(SubmitResult.ACCEPTED);
    }

    @Test
    @DisplayName("진입점 밖 스레드에는 범위가 남지 않는다(finally 정리)")
    void noLeakedScope() throws Exception {
        dispatcher.submit(req("r1", "j1", "jobRunOk", 30, null));
        reporter.next();
        executor.submit(() -> JobRunTestTask.LOG.add("after:" + JobRunScope.current().isPresent())).get();
        assertThat(JobRunTestTask.LOG).contains("after:false");
        assertThatThrownBy(() -> JobRunScope.require()).isInstanceOf(JobScopeRequiredException.class);
    }

    /** 풀 크기만 다른 진입점을 다시 만든다(실제 OASIS 조립 — transactional + multi-tx, 서비스 경로 /job-run). */
    private JobRunDispatcher newDispatcher(JobRunExecutor pool) {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/job-run");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
        JobRunDispatcher d = new JobRunDispatcher(starter, ctx, reporter, pool, "srv1", Clock.systemDefaultZone(), TimeUnit.MILLISECONDS);
        JobRunTestTask.dispatcher = d;
        return d;
    }

    /** 결과 보고를 모으고, 보고되는 순간의 트랜잭션 기록을 함께 남긴다. */
    static final class RecordingReporter implements JobRunReporter {
        private final BlockingQueue<JobRunReport> queue = new LinkedBlockingQueue<>();
        final List<List<String>> eventsAtWrite = new ArrayList<>();
        private final RecordingTxManager tx;

        RecordingReporter(RecordingTxManager tx) {
            this.tx = tx;
        }

        @Override
        public WriteResult write(JobRunReport report) {
            synchronized (eventsAtWrite) {
                eventsAtWrite.add(new ArrayList<>(tx.events));
            }
            queue.add(report);
            return WriteResult.WRITTEN;
        }

        JobRunReport next() throws InterruptedException {
            return next(5_000);
        }

        JobRunReport next(long millis) throws InterruptedException {
            JobRunReport r = queue.poll(millis, TimeUnit.MILLISECONDS);
            assertThat(r).as("결과 보고가 오지 않았다").isNotNull();
            return r;
        }

        List<JobRunReport> drain(int n, long millis) throws InterruptedException {
            List<JobRunReport> out = new ArrayList<>();
            long deadline = System.currentTimeMillis() + millis;
            while (out.size() < n && System.currentTimeMillis() < deadline) {
                JobRunReport r = queue.poll(200, TimeUnit.MILLISECONDS);
                if (r != null) out.add(r);
            }
            return out;
        }

        List<JobRunReport> drainNow() {
            List<JobRunReport> out = new ArrayList<>();
            queue.drainTo(out);
            return out;
        }

        void assertNoMore() throws InterruptedException {
            assertThat(queue.poll(400, TimeUnit.MILLISECONDS)).as("결과 갱신은 회차마다 1회여야 한다").isNull();
        }
    }

    /** begin·commit·rollback 순서만 기록한다(스레드마다 따로 기록하지 않고 시험이 한 번에 한 서비스만 돌린다). */
    static final class RecordingTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = java.util.Collections.synchronizedList(new ArrayList<>());

        @Override
        protected Object doGetTransaction() {
            return new Object();
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            events.add("begin");
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            events.add("commit");
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            events.add("rollback");
        }
    }
}
