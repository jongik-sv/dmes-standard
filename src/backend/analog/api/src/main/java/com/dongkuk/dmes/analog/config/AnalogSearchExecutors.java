package com.dongkuk.dmes.analog.config;

import jakarta.annotation.PreDestroy;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.SynchronousQueue;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
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
 * 트리 파싱 작업은 큐에서 기다리게 하면 요청 스레드의 readBuffer 가 큐 10만 줄 이후 줄마다 1초씩 쉬어 사실상 멈추므로,
 * 대기열 없이(SynchronousQueue) 상한을 넘으면 바로 거절한다 — 컨트롤러가 503 으로 돌려준다.
 *
 * <p>Executor 타입 빈을 따로 내놓지 않는다 — 같은 타입 빈이 여럿이면 주입이 모호해지고, Boot 의 applicationTaskExecutor
 * 자동 구성도 물러난다. 종료 시 풀마다 shutdown 후 awaitTermination 으로 기다린다.
 */
@Component
public class AnalogSearchExecutors {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(AnalogSearchExecutors.class);
    private static final long SHUTDOWN_WAIT_SECONDS = 30;

    private final ThreadPoolExecutor fileSearch;
    private final ThreadPoolExecutor rangeSearch;
    private final ThreadPoolExecutor treeParse;

    public AnalogSearchExecutors(
            // 예전 요청당 풀 크기(threads_per_request)를 공유 풀 크기 기본값으로 쓴다.
            @Value("${analog-express.file_search_pool_size:${analog-express.threads_per_request:10}}") int fileSearchPoolSize,
            @Value("${analog-express.range_search_pool_size:16}") int rangeSearchPoolSize,
            @Value("${analog-express.tree_parse_pool_size:8}") int treeParsePoolSize) {
        this.fileSearch = fixedPool("analog-file-search-", fileSearchPoolSize);
        this.rangeSearch = fixedPool("analog-range-search-", rangeSearchPoolSize);
        this.treeParse = new ThreadPoolExecutor(0, treeParsePoolSize, 60L, TimeUnit.SECONDS,
                new SynchronousQueue<>(), namedThreads("analog-tree-parse-"), new ThreadPoolExecutor.AbortPolicy());
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

    /** 트리 파싱 소비 작업용 — 꽉 차면 RejectedExecutionException 을 던진다. */
    public ExecutorService treeParse() {
        return treeParse;
    }

    @PreDestroy
    public void shutdown() {
        // 바깥 작업(파일 검색)이 안쪽 작업(범위 검색)을 넣고 기다리므로, 바깥 풀이 다 끝난 뒤에 안쪽 풀을 닫는다.
        shutdownAndAwait(fileSearch);
        shutdownAndAwait(rangeSearch);
        shutdownAndAwait(treeParse);
    }

    private static void shutdownAndAwait(ExecutorService pool) {
        pool.shutdown();
        try {
            if (!pool.awaitTermination(SHUTDOWN_WAIT_SECONDS, TimeUnit.SECONDS)) {
                log.warn("analog 검색 풀이 {}초 안에 끝나지 않아 강제 종료한다", SHUTDOWN_WAIT_SECONDS);
                pool.shutdownNow();
            }
        } catch (InterruptedException e) {
            pool.shutdownNow();
            Thread.currentThread().interrupt();
        }
    }
}
