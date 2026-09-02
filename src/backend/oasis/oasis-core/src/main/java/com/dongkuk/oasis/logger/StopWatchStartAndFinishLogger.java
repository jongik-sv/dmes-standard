package com.dongkuk.oasis.logger;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 실행과 종료 시점을 기록한다.
 * 스레드 안전하지 않으므로 유의한다.
 *
 * @param <T> 로거에 사용할 파라미터 타입
 * @author Jeongjin Kim
 * @since 2021-05-20
 */
public abstract class StopWatchStartAndFinishLogger<T> implements StartAndFinishLogger<T> {
    private static final long NANO_TO_MILLIS = 1000000L;
    protected final Logger log;
    private long startTime;
    private long finishTime;
    private Status status;

    /**
     * @param clazz 클래스
     */
    public StopWatchStartAndFinishLogger(Class<?> clazz) {
        this.log = LoggerFactory.getLogger(clazz);
        status = Status.READY;
    }

    protected void start() {
        if (status != Status.READY)
            throw new IllegalStateException("Status is not READY.");

        startTime = System.nanoTime();
        this.status = Status.STARTED;
    }

    protected void stop() {
        if (status != Status.STARTED)
            throw new IllegalStateException("Status is not STARTED.");

        finishTime = System.nanoTime();
        this.status = Status.STOPPED;
    }

    protected long getTimeMillis() {
        if (status != Status.STOPPED)
            throw new IllegalStateException("Status is not STOPPED.");

        long duration = (finishTime - startTime) / NANO_TO_MILLIS;
        reset();
        return duration;
    }

    protected void reset() {
        this.status = Status.READY;
        this.startTime = 0;
        this.finishTime = 0;
    }

    private enum Status {
        READY,
        STARTED,
        STOPPED
    }
}
