package com.dongkuk.dmes.cactus.job;

import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.ScheduledThreadPoolExecutor;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 예약 실행 풀 — 스레드 {@code poolSize} 개, <b>대기열 0</b>(설계 §4.4 접수 6). 가득이면 {@link #submit} 이
 * {@link RejectedExecutionException} 을 던지고 접수가 503 {@code JOB_POOL_FULL} 로 답한다. 감시(시간 초과)·재시도 대기는 별도 데몬 스케줄러가 한다.
 * 실행 스레드가 아닌 곳(감시의 TIMEOUT, 재시도 재투입 실패의 FAIL)에서 쓰는 결과 기록은 기록 전용 실행기(스레드 2, 대기열 상한)가 한다 —
 * 감시 스레드가 DB 갱신(첫 실패 뒤 5초 대기 포함)에 묶여 다른 회차의 마감 판정이 밀리지 않게 하려는 것이다.
 */
public final class JobRunExecutor implements AutoCloseable {

    private static final int REPORT_THREADS = 2;
    private static final int REPORT_QUEUE = 200;

    private final ThreadPoolExecutor pool;
    private final ScheduledThreadPoolExecutor timer;
    private final ThreadPoolExecutor reports;
    private final int poolSize;

    public JobRunExecutor(int poolSize) {
        this(poolSize, REPORT_QUEUE);
    }

    /** 시험이 기록 대기열을 줄이려고 쓴다. */
    JobRunExecutor(int poolSize, int reportQueue) {
        this.poolSize = Math.max(1, poolSize);
        this.pool = new ThreadPoolExecutor(this.poolSize, this.poolSize, 60, TimeUnit.SECONDS, new SynchronousQueue<>(),
                daemons("job-run-"), new ThreadPoolExecutor.AbortPolicy());
        this.timer = new ScheduledThreadPoolExecutor(2, daemons("job-timer-"));
        this.timer.setRemoveOnCancelPolicy(true);
        this.reports = new ThreadPoolExecutor(REPORT_THREADS, REPORT_THREADS, 60, TimeUnit.SECONDS,
                new ArrayBlockingQueue<>(Math.max(1, reportQueue)), daemons("job-report-"), new ThreadPoolExecutor.AbortPolicy());
    }

    /**
     * 결과 기록을 기록 전용 실행기에 넣는다. 대기열이 가득이거나 닫혔으면 넣지 않고 false — 부른 쪽이 WARN 하고 버린다(정리가 TIMEOUT 으로 닫는다).
     */
    boolean submitReport(Runnable task) {
        try {
            reports.execute(task);
            return true;
        } catch (RejectedExecutionException e) {
            return false;
        }
    }

    public Future<?> submit(Runnable task) {
        return pool.submit(task);
    }

    public ScheduledFuture<?> schedule(Runnable task, long delay, TimeUnit unit) {
        return timer.schedule(task, delay, unit);
    }

    public int poolSize() {
        return poolSize;
    }

    @Override
    public void close() {
        timer.shutdownNow();
        pool.shutdown();
        try {
            if (!pool.awaitTermination(30, TimeUnit.SECONDS)) pool.shutdownNow();
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }
        // 기록 실행기는 맨 나중에 닫고 대기 중인 TIMEOUT·FAIL 기록을 마저 쓴다(shutdownNow 면 대기 기록이 사라진다).
        reports.shutdown();
        try {
            if (!reports.awaitTermination(15, TimeUnit.SECONDS)) reports.shutdownNow();
        } catch (InterruptedException e) {
            reports.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }

    private static ThreadFactory daemons(String prefix) {
        AtomicInteger n = new AtomicInteger();
        return r -> {
            Thread t = new Thread(r, prefix + n.incrementAndGet());
            t.setDaemon(true);
            return t;
        };
    }
}
