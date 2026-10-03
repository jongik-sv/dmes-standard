package com.dongkuk.dmes.analog.config;

import com.dongkuk.analogexpress.filter.contents.LogContentsFilter;
import com.dongkuk.analogexpress.filter.contents.LogContentsKeywordFilter;
import com.dongkuk.analogexpress.searcher.MultiThreadRangeSearcherRunner;
import com.dongkuk.analogexpress.searcher.Range;
import com.dongkuk.analogexpress.searcher.SearchResult;
import com.dongkuk.analogexpress.searcher.StartsStringContextualNewLineInspector;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.File;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Future;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 공유 검색 풀 — 상한·중첩 제출·종료 동작.
 */
class AnalogSearchExecutorsTest {

    private AnalogSearchExecutors executors;

    @AfterEach
    void tearDown() {
        if (executors != null) executors.shutdown();
    }

    @Test
    void 파일_풀과_범위_풀이_한_자리씩이어도_바깥_작업이_안쪽_작업을_기다리며_교착되지_않는다(@TempDir Path dir) throws Exception {
        executors = new AnalogSearchExecutors(1, 1, 1);
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < 30; i++) sb.append("2026-05-15 09:").append(String.format("%02d", i)).append(":00.000 line ").append(i).append(" keyword\n");
        File file = dir.resolve("a.log").toFile();
        Files.writeString(file.toPath(), sb.toString(), StandardCharsets.UTF_8);
        long third = file.length() / 3;
        // 줄 경계와 상관없이 세 범위로 나눈다 — 여기서는 결과 내용이 아니라 완료 여부만 본다.
        List<Range> ranges = List.of(new Range(0, third), new Range(third, third), new Range(third * 2, file.length() - third * 2));

        SearchResult result = new SearchResult(file);
        MultiThreadRangeSearcherRunner runner = new MultiThreadRangeSearcherRunner(result,
                new LogContentsFilter[]{new LogContentsKeywordFilter("keyword")},
                new StartsStringContextualNewLineInspector("20"), ranges, "UTF-8", executors.rangeSearch());

        Future<?> outer = executors.fileSearch().submit(runner);
        outer.get(10, TimeUnit.SECONDS);
        assertThat(result.getResult()).isNotEmpty();
    }

    @Test
    void 트리_파싱_풀이_꽉_차면_기다리지_않고_거절한다() throws Exception {
        executors = new AnalogSearchExecutors(1, 1, 1);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(1);
        executors.submitTreeParse(() -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        assertThatThrownBy(() -> executors.submitTreeParse(() -> { }))
                .isInstanceOf(RejectedExecutionException.class);
        assertThat(executors.treeParseInFlight()).isEqualTo(1);
        release.countDown();
    }

    @Test
    void 트리_파싱_풀은_앞_작업이_끝난_직후_넣은_작업을_거절하지_않는다() throws Exception {
        // 예전 SynchronousQueue 풀은 get() 이 돌아온 뒤에도 스레드가 poll 로 돌아가기 전이면 상한 미만에서 거절했다.
        executors = new AnalogSearchExecutors(1, 1, 1);
        AtomicInteger runs = new AtomicInteger();
        for (int i = 0; i < 1000; i++) {
            executors.submitTreeParse(runs::incrementAndGet).get(5, TimeUnit.SECONDS);
        }
        assertThat(runs).hasValue(1000);
        assertThat(executors.treeParseInFlight()).isZero();
    }

    @Test
    void 돌던_트리_작업을_취소하면_본문이_끝난_뒤_자리를_돌려준다() throws Exception {
        executors = new AnalogSearchExecutors(1, 1, 2);
        CountDownLatch release = new CountDownLatch(1);
        CountDownLatch started = new CountDownLatch(2);
        // 두 자리를 막아 둔 뒤, 한 자리가 비면 바로 다음 작업이 들어오는지 본다.
        Future<?> first = executors.submitTreeParse(() -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        Future<?> second = executors.submitTreeParse(() -> {
            started.countDown();
            try {
                release.await();
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();
        assertThatThrownBy(() -> executors.submitTreeParse(() -> { }))
                .isInstanceOf(RejectedExecutionException.class);

        // 돌던 작업을 인터럽트로 끝낸다 — 본문이 끝나면 자리가 돌아온다.
        first.cancel(true);
        awaitInFlight(1);
        executors.submitTreeParse(() -> { }).get(5, TimeUnit.SECONDS);

        release.countDown();
        second.get(5, TimeUnit.SECONDS);
        awaitInFlight(0);
    }

    private void awaitInFlight(int expected) throws InterruptedException {
        long deadline = System.currentTimeMillis() + 5000;
        while (executors.treeParseInFlight() != expected && System.currentTimeMillis() < deadline) {
            Thread.sleep(10);
        }
        assertThat(executors.treeParseInFlight()).isEqualTo(expected);
    }

    @Test
    void 종료할_때_파일_작업이_도는_중에_넣는_범위_작업은_거절되지_않는다() throws Exception {
        executors = new AnalogSearchExecutors(1, 1, 1);
        CountDownLatch started = new CountDownLatch(1);
        AtomicBoolean innerRan = new AtomicBoolean(false);
        Future<?> outer = executors.fileSearch().submit(() -> {
            started.countDown();
            try {
                Thread.sleep(300);   // 그 사이 shutdown 이 시작된다
                executors.rangeSearch().submit(() -> innerRan.set(true)).get(5, TimeUnit.SECONDS);
            } catch (Exception e) {
                throw new IllegalStateException(e);
            }
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        executors.shutdown();

        outer.get(1, TimeUnit.SECONDS);
        assertThat(innerRan).isTrue();
        executors = null;
    }

    @Test
    void 종료하면_돌던_작업이_끝나기를_기다린_뒤_모든_풀을_닫는다() throws Exception {
        executors = new AnalogSearchExecutors(2, 2, 2);
        AtomicBoolean finished = new AtomicBoolean(false);
        CountDownLatch started = new CountDownLatch(1);
        executors.fileSearch().submit(() -> {
            started.countDown();
            try {
                Thread.sleep(300);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return;
            }
            finished.set(true);
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        executors.shutdown();

        assertThat(finished).isTrue();
        List<Boolean> terminated = new ArrayList<>();
        terminated.add(executors.fileSearch().isTerminated());
        terminated.add(executors.rangeSearch().isTerminated());
        terminated.add(executors.treeParse().isTerminated());
        assertThat(terminated).containsOnly(true);
        executors = null;
    }
}
