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
        executors.treeParse().submit(() -> {
            started.countDown();
            release.await();
            return null;
        });
        assertThat(started.await(5, TimeUnit.SECONDS)).isTrue();

        assertThatThrownBy(() -> executors.treeParse().submit(() -> { }))
                .isInstanceOf(RejectedExecutionException.class);
        release.countDown();
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
