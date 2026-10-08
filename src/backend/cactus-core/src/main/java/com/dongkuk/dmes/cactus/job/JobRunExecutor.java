package com.dongkuk.dmes.cactus.job;

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
 */
public final class JobRunExecutor implements AutoCloseable {

    private final ThreadPoolExecutor pool;
    private final ScheduledThreadPoolExecutor timer;
    private final int poolSize;

    public JobRunExecutor(int poolSize) {
        this.poolSize = Math.max(1, poolSize);
        this.pool = new ThreadPoolExecutor(this.poolSize, this.poolSize, 60, TimeUnit.SECONDS, new SynchronousQueue<>(),
                daemons("job-run-"), new ThreadPoolExecutor.AbortPolicy());
        this.timer = new ScheduledThreadPoolExecutor(2, daemons("job-timer-"));
        this.timer.setRemoveOnCancelPolicy(true);
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
