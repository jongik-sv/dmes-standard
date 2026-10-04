package com.dongkuk.analog.parser;

import com.dongkuk.analog.process.LogToken;
import com.dongkuk.analog.scanner.LogData;
import org.junit.jupiter.api.Test;

import java.io.File;
import java.net.URISyntaxException;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 경합 테스트 — 서로 다른 LogPattern 을 쓰는 두 처리가 동시에 돌 때 각자 자기 패턴으로 분류해야 한다.
 *
 * <p>2026-10-04 이전 코드에서는 실패했다(@Disabled 로 두었다가 고친 뒤 켰다): LogToken 이 처음 읽힌 LogPattern 을
 * static 필드로 붙잡아, 두 번째 패턴(AnyLine)으로 분류해야 할 B 가 ["TaskStart", "ServiceFinish", "CompletedMessage", "Message"]
 * 를 돌려줬다. 이제 패턴을 인스턴스로 넘겨 처리마다 자기 패턴을 쓴다.
 */
class LogPatternIsolationTest {

    private static final String[] MESSAGES = {
            "Task [K1](saveTask) start.",
            "Service [SVC01] finish.(100ms)",
            "Completed 200 OK",
            "plain business message"
    };

    private static File resource(String path) {
        try {
            return new File(LogPatternIsolationTest.class.getResource(path).toURI());
        } catch (URISyntaxException e) {
            throw new IllegalStateException(e);
        }
    }

    private static LogData info(String message) {
        LogData d = new LogData();
        d.setLevel("INFO");
        d.setLogger("c.d.Svc");
        d.setMessage(message);
        return d;
    }

    private static List<String> classifyWith(File patternFile) {
        LogPattern pattern = LogPattern.load(patternFile);
        List<String> names = new ArrayList<>();
        for (String m : MESSAGES) {
            names.add(LogToken.parse(info(m), pattern).getTokenDefine().getTokenName());
        }
        return names;
    }

    @Test
    void 서로_다른_패턴을_쓰는_두_처리가_동시에_돌면_각자_자기_패턴으로_분류한다() throws Exception {
        File defaultPattern = ParseFixture.defaultPatternFile();
        File anyLinePattern = resource("/characterization/any-line-serializer.json");
        // 앞선 요청이 이미 파싱을 한 상태(LogToken 초기화 끝)를 만든다.
        classifyWith(defaultPattern);

        CountDownLatch go = new CountDownLatch(1);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            Future<List<String>> a = pool.submit(() -> {
                go.await();
                return classifyWith(defaultPattern);
            });
            Future<List<String>> b = pool.submit(() -> {
                go.await();
                return classifyWith(anyLinePattern);
            });
            go.countDown();

            assertThat(a.get(10, TimeUnit.SECONDS)).containsExactly("TaskStart", "ServiceFinish", "CompletedMessage", "Message");
            assertThat(b.get(10, TimeUnit.SECONDS)).containsExactly("AnyLine", "AnyLine", "AnyLine", "AnyLine");
        } finally {
            pool.shutdownNow();
        }
    }
}
