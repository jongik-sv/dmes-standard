package com.dongkuk.dmes.analog.config;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.concurrent.FutureTask;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.Semaphore;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 로그 검색이 쓰는 공유 스레드 풀 세 개 — 요청마다 풀·스레드를 새로 만들던 것을 대신한다.
 *
 * <ul>
 *   <li>파일 검색 풀: 파일 하나를 검색하는 작업(바깥 작업). 큰 파일이면 범위 검색 작업을 기다린다.</li>
 *   <li>범위 검색 풀: 파일 한 구간을 검색하는 작업(안쪽 작업). 다른 작업을 기다리지 않는다.</li>
 *   <li>트리 파싱 풀: /log/range/time/tree 의 LogProcessor 소비 작업. 생산(readBuffer)이 끝날 때까지 돈다.</li>
 * </ul>
 *
 * <p>바깥·안쪽 작업을 한 상한 풀에 함께 넣으면 바깥 작업이 자리를 다 차지한 채 안쪽 작업을 기다려 교착될 수 있어 풀을 나눈다.
 * 파일·범위 풀은 고정 크기에 대기열이 있어, 동시 요청이 몰리면 작업이 대기열에서 차례를 기다린다.
 *
 * <p>트리 파싱 작업은 큐에서 기다리게 하면 요청 스레드의 readBuffer 가 큐 10만 줄 이후 줄마다 1초씩 쉬어 사실상 멈추므로,
 * 동시 실행 수를 {@link Semaphore} 로 세어 상한을 넘는 요청만 바로 거절한다({@link #submitTreeParse}) — 컨트롤러가 503 으로
 * 돌려준다. 자리는 작업 본문이 끝나는 순간(Future 완료 전) 돌려주므로, 앞 작업의 {@code get()} 이 돌아온 뒤 바로 넣은
 * 작업은 거절되지 않는다. 풀 자체는 상한과 같은 고정 크기(유휴 60초 뒤 스레드 반납)라 허가를 받은 작업은 곧바로 돈다.
 * (예전 SynchronousQueue + AbortPolicy 풀은 앞 작업을 끝낸 스레드가 아직 poll 로 돌아가지 않은 순간 들어온 작업을
 * 상한 미만에서도 거절했다.)
 *
 * <p>Executor 타입 빈을 따로 내놓지 않는다 — 같은 타입 빈이 여럿이면 주입이 모호해지고, Boot 의 applicationTaskExecutor
 * 자동 구성도 물러난다. 종료 방식은 {@link #shutdown()} 참고.
 */
@Component
public class AnalogSearchExecutors {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AnalogSearchExecutors.class);
    private static final long SHUTDOWN_WAIT_SECONDS = 30;

    private final ThreadPoolExecutor fileSearch;
    private final ThreadPoolExecutor rangeSearch;
    private final ThreadPoolExecutor treeParse;
    private final int treeParsePoolSize;
    /** 트리 파싱 동시 실행 자리. 작업 본문이 끝나거나, 시작 전에 취소된 작업이 풀에서 꺼내질 때 돌려준다. */
    private final Semaphore treeParseSlots;

    public AnalogSearchExecutors(
            // 예전 요청당 풀 크기(threads_per_request)를 공유 풀 크기 기본값으로 쓴다.
            @Value("${analog-express.file_search_pool_size:${analog-express.threads_per_request:10}}") int fileSearchPoolSize,
            @Value("${analog-express.range_search_pool_size:16}") int rangeSearchPoolSize,
            @Value("${analog-express.tree_parse_pool_size:8}") int treeParsePoolSize) {
        this.fileSearch = fixedPool("analog-file-search-", fileSearchPoolSize);
        this.rangeSearch = fixedPool("analog-range-search-", rangeSearchPoolSize);
        this.treeParsePoolSize = treeParsePoolSize;
        this.treeParseSlots = new Semaphore(treeParsePoolSize);
        // 자리 수와 같은 고정 크기 — 허가를 받은 작업은 대기열에서 머물지 않는다. 유휴 스레드는 60초 뒤 반납한다.
        this.treeParse = new ThreadPoolExecutor(treeParsePoolSize, treeParsePoolSize, 60L, TimeUnit.SECONDS,
                new LinkedBlockingQueue<>(), namedThreads("analog-tree-parse-"));
        this.treeParse.allowCoreThreadTimeOut(true);
        log.info("analog 검색 풀 - 파일 {} · 범위 {} · 트리 {}", fileSearchPoolSize, rangeSearchPoolSize, treeParsePoolSize);
    }

    private static ThreadPoolExecutor fixedPool(String prefix, int size) {
        return new ThreadPoolExecutor(size, size, 0L, TimeUnit.MILLISECONDS,
                new LinkedBlockingQueue<>(), namedThreads(prefix));
    }

    private static ThreadFactory namedThreads(String prefix) {
        AtomicInteger seq = new AtomicInteger(1);
        return runnable -> {
            Thread thread = new Thread(runnable, prefix + seq.getAndIncrement());
            thread.setDaemon(false);
            return thread;
        };
    }

    /** 파일 하나를 검색하는 작업용(바깥 작업). */
    public ExecutorService fileSearch() {
        return fileSearch;
    }

    /** 파일 한 구간을 검색하는 작업용(안쪽 작업) — 파일 검색 풀과 섞지 않는다. */
    public ExecutorService rangeSearch() {
        return rangeSearch;
    }

    /**
     * 트리 파싱 소비 작업을 넣는다. 동시에 도는 작업이 상한({@code tree_parse_pool_size})이면 기다리지 않고
     * {@link RejectedExecutionException} 을 던진다. 상한 미만이면 거절하지 않는다.
     */
    public Future<?> submitTreeParse(Runnable task) {
        Objects.requireNonNull(task, "task");
        if (!treeParseSlots.tryAcquire()) {
            throw new RejectedExecutionException("트리 파싱 동시 실행 상한(" + treeParsePoolSize + ") 초과");
        }
        SlotRelease slot = new SlotRelease(treeParseSlots);
        FutureTask<Void> future = new FutureTask<>(() -> {
            try {
                task.run();
            } finally {
                // Future 완료(set) 전에 돌려준다 — get() 이 돌아온 뒤 바로 넣은 작업이 거절되지 않게.
                slot.release();
            }
            return null;
        }) {
            @Override
            public void run() {
                try {
                    super.run();
                } finally {
                    // 시작 전에 취소된 작업은 본문이 돌지 않는다 — 풀이 꺼내 run 을 부를 때 돌려준다.
                    slot.release();
                }
            }
        };
        try {
            treeParse.execute(future);
        } catch (RejectedExecutionException e) {
            slot.release();   // 종료 중인 풀
            throw e;
        }
        return future;
    }

    /** 지금 자리를 차지한 트리 파싱 작업 수. */
    public int treeParseInFlight() {
        return treeParsePoolSize - treeParseSlots.availablePermits();
    }

    /** 시험용 — 직접 submit 하면 동시 실행 상한을 거치지 않으므로 밖에 내놓지 않는다. */
    ExecutorService treeParse() {
        return treeParse;
    }

    /**
     * 세 풀에 새 작업을 막고, 돌던 작업을 한 시간 예산(30초) 안에서 기다린다. 남으면 강제 종료한다.
     *
     * <p>파일 검색 작업은 도는 중에 범위 검색 작업을 넣으므로, 범위 풀은 파일 풀이 끝난 뒤(또는 예산이 다한 뒤) 닫는다 —
     * 먼저 닫으면 대기열에 있던 파일 작업이 범위 작업을 넣다 거절된다. 파일·트리 풀은 처음에 함께 닫는다.
     */
    @PreDestroy
    public void shutdown() {
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(SHUTDOWN_WAIT_SECONDS);
        fileSearch.shutdown();
        treeParse.shutdown();
        try {
            awaitUntil(fileSearch, deadline);
            rangeSearch.shutdown();
            awaitUntil(rangeSearch, deadline);
            awaitUntil(treeParse, deadline);
        } catch (InterruptedException e) {
            rangeSearch.shutdown();
            Thread.currentThread().interrupt();
        }
        forceIfAlive(fileSearch, "파일");
        forceIfAlive(rangeSearch, "범위");
        forceIfAlive(treeParse, "트리");
    }

    private static void awaitUntil(ExecutorService pool, long deadline) throws InterruptedException {
        pool.awaitTermination(Math.max(0L, deadline - System.nanoTime()), TimeUnit.NANOSECONDS);
    }

    private static void forceIfAlive(ExecutorService pool, String name) {
        if (!pool.isTerminated()) {
            log.warn("analog {} 검색 풀이 {}초 안에 끝나지 않아 강제 종료한다", name, SHUTDOWN_WAIT_SECONDS);
            pool.shutdownNow();
        }
    }

    /** 자리를 한 번만 돌려준다 — 본문 finally 와 run finally 가 둘 다 부른다. */
    private static final class SlotRelease {
        private final Semaphore slots;
        private final AtomicBoolean released = new AtomicBoolean(false);

        SlotRelease(Semaphore slots) {
            this.slots = slots;
        }

        void release() {
            if (released.compareAndSet(false, true)) {
                slots.release();
            }
        }
    }
}
