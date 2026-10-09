package com.dongkuk.dmes.cactus.job;

import com.dongkuk.oasis.exceptions.UserException;
import java.math.BigDecimal;
import java.sql.SQLTimeoutException;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.MDC;

/** {@link JobRunDispatcherTest} 의 BPMN(job-run/*.bpmn) 이 부르는 작업. 상태는 정적이라 시험이 {@link #reset()} 한다. */
public class JobRunTestTask {

    static final List<String> LOG = Collections.synchronizedList(new ArrayList<>());
    static final AtomicInteger FLAKY = new AtomicInteger();
    static volatile CountDownLatch started = new CountDownLatch(1);
    static volatile long sleepMillis = 10_000;
    static volatile JobRunDispatcher dispatcher;

    static void reset() {
        LOG.clear();
        FLAKY.set(0);
        started = new CountDownLatch(1);
        sleepMillis = 10_000;
    }

    /** 정상 — 건수 7 을 범위에 쌓고, MDC 를 기록한다. */
    public String ok() {
        JobRunScope.require().addItems(7);
        LOG.add("ok:serviceId=" + MDC.get("serviceId") + ":tag=" + MDC.get("service_tag") + ":run=" + MDC.get("runId"));
        return "done";
    }

    /** 정상 + 이력 메시지 설명(note). */
    public String okNote() {
        JobRunScope scope = JobRunScope.require();
        scope.addItems(3);
        scope.note("일시 오류 후 재시도 1회로 성공");
        return "done";
    }

    /** 설명(note)을 남기고 실패한다 — 실패 문구만 이력에 남아야 한다. */
    public void failNote() {
        JobRunScope.require().note("남으면 안 되는 설명");
        throw new UserException("업무 예외");
    }

    public void userError() {
        throw new UserException("업무 예외");
    }

    public void systemError() {
        throw new IllegalStateException("jdbc:oracle://secret-host/db password=hunter2");
    }

    /** Error 는 CoreServiceStarter 가 결과로 바꾸지 않는다(Exception 만 잡는다). */
    public void fatal() {
        throw new AssertionError("fatal secret");
    }

    /** 인터럽트되면 SYSTEM_ERROR 로 끝난다(감시가 TIMEOUT 을 먼저 썼는지 확인하는 시험용). */
    public void slow() {
        started.countDown();
        try {
            Thread.sleep(sleepMillis);
            LOG.add("slow-finished");
        } catch (InterruptedException e) {
            LOG.add("interrupted");
            throw new IllegalStateException("interrupted");
        }
    }

    /** 첫 시도는 실패, 둘째 시도부터 성공 — 건수 5. */
    public String flaky() {
        if (FLAKY.incrementAndGet() == 1) throw new IllegalStateException("첫 시도 실패");
        JobRunScope.require().addItems(5);
        return "ok";
    }

    public void queryTimeout() {
        throw new RuntimeException("쿼리 실패", new SQLTimeoutException("ORA-01013: user requested cancel of current operation"));
    }

    /** 범위 안에서 진입점을 다시 부른다 — 거절돼야 하고 바깥 회차는 그대로 OK. */
    public String reenter() {
        try {
            dispatcher.submit(new JobRunRequest("inner-run", "inner-job", "MDM", "jobRunOk", "run", null, null, null, 30, null,
                    "2026-10-09T02:00:00", false, null));
            LOG.add("reenter-accepted");
        } catch (IllegalStateException e) {
            LOG.add("reenter-rejected");
        }
        LOG.add("outer-scope=" + JobRunScope.current().map(JobRunScope::runId).orElse("none"));   // 거절 뒤에도 바깥 범위가 남아 있다
        return "outer-ok";
    }

    /** 서브서비스 맨 안쪽·가운데에서 불린다 — 같은 스레드라 범위가 보인다. */
    public String leaf() {
        LOG.add("leaf:" + JobRunScope.current().map(JobRunScope::runId).orElse("none"));
        return "leaf";
    }

    /** 다른 스레드에서는 범위가 보이지 않는다(createNewService·병렬 게이트웨이와 같다). */
    public String otherThread() throws InterruptedException {
        boolean[] seen = new boolean[1];
        Thread t = new Thread(() -> seen[0] = JobRunScope.current().isPresent());
        t.start();
        t.join();
        LOG.add("otherThreadSeesScope=" + seen[0]);
        return "ok";
    }

    public String collect() {
        JobRunScope s = JobRunScope.require();
        s.collect(new CollectedValue("K", BigDecimal.ONE, null));
        s.addItems(1);
        return "c";
    }
}
