package com.dongkuk.dmes.cactus.scheduling;

import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.Trigger;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ScheduledFuture;

/**
 * 받은 {@link TaskScheduler} 에 넘기는 Runnable 을 {@link ScheduledJobLogContext#wrap} 으로 감싸는 얇은 래퍼.
 *
 * <p>{@code ThreadPoolTaskScheduler.setTaskDecorator} 는 실행기 안쪽의 ScheduledFutureTask 를 받아
 * 원래 {@code ScheduledMethodRunnable} 이 가려지므로 작업 이름을 만들 수 없다.
 * 그래서 스케줄러에 넘기기 전 단계에서 감싼다. 이름은 등록 때 한 번만 만든다.
 */
public final class JobLoggingTaskScheduler implements TaskScheduler {

    private final TaskScheduler delegate;

    public JobLoggingTaskScheduler(TaskScheduler delegate) {
        this.delegate = delegate;
    }

    @Override
    public Clock getClock() {
        return delegate.getClock();
    }

    @Override
    public ScheduledFuture<?> schedule(Runnable task, Trigger trigger) {
        return delegate.schedule(ScheduledJobLogContext.wrap(task), trigger);
    }

    @Override
    public ScheduledFuture<?> schedule(Runnable task, Instant startTime) {
        return delegate.schedule(ScheduledJobLogContext.wrap(task), startTime);
    }

    @Override
    public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Instant startTime, Duration period) {
        return delegate.scheduleAtFixedRate(ScheduledJobLogContext.wrap(task), startTime, period);
    }

    @Override
    public ScheduledFuture<?> scheduleAtFixedRate(Runnable task, Duration period) {
        return delegate.scheduleAtFixedRate(ScheduledJobLogContext.wrap(task), period);
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Instant startTime, Duration delay) {
        return delegate.scheduleWithFixedDelay(ScheduledJobLogContext.wrap(task), startTime, delay);
    }

    @Override
    public ScheduledFuture<?> scheduleWithFixedDelay(Runnable task, Duration delay) {
        return delegate.scheduleWithFixedDelay(ScheduledJobLogContext.wrap(task), delay);
    }
}
