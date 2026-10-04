package com.dongkuk.analog.parser;

import com.dongkuk.analog.process.LogProcessor;
import com.dongkuk.analog.scanner.LogData;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Disabled;
import org.junit.jupiter.api.Test;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.List;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * /tree 소비 루프(LogProcessor.runConsumer)가 생산 도중 큐를 따라잡아 빈 큐를 만나도 이어진 줄(스택)을 잃지 않는지 본다.
 *
 * <p>컨트롤러는 소비 작업을 먼저 띄우고 요청 스레드에서 렉서가 줄을 넣으므로, 소비자가 머리 줄을 꺼낸 뒤
 * 다음 '\tat ...' 줄이 들어오기 전에 큐가 빌 수 있다. 여기서는 소비자가 넣은 줄을 모두 꺼내고 빈 큐를 볼 때마다
 * 렉서가 한 줄씩 내보내도록 맞물려, 줄마다 따라잡기가 생기게 한다(타이밍에 기대지 않는다).
 */
@Disabled("재현 — 다음 fix 커밋에서 켬")
class LogProcessorCatchUpTest {

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private static final long WAIT_SECONDS = 5;

    /**
     * 소비자가 앞서 넣은 줄을 모두 꺼내고 빈 큐를 볼 때 허가를 하나 내준다.
     * 소비 루프는 빈 큐를 100ms 마다 다시 보므로, 허가가 쌓이지 않게 마지막 허가 뒤 줄이 들어왔을 때만 낸다.
     */
    private static final class SignallingQueue extends LinkedBlockingQueue<LogData> {
        final Semaphore consumerIdle = new Semaphore(0);
        // 처음에는 넣은 줄이 없어도 첫 허가를 내야 렉서가 첫 줄을 읽는다.
        private final AtomicBoolean addedSinceSignal = new AtomicBoolean(true);

        @Override
        public boolean offer(LogData e) {
            boolean offered = super.offer(e);
            // 줄이 큐에 들어간 뒤에 표시해야, 이 줄을 꺼내기 전의 빈 큐로 허가를 내는 일이 없다.
            addedSinceSignal.set(true);
            return offered;
        }

        @Override
        public boolean isEmpty() {
            boolean empty = super.isEmpty();
            if (empty && addedSinceSignal.compareAndSet(true, false)) {
                consumerIdle.release();
            }
            return empty;
        }
    }

    /** 소비자가 큐를 비우고 잠든 것을 확인한 뒤에야 다음 줄을 돌려준다. 첫 줄과 끝(null)도 같다. */
    private static final class LockstepReader extends BufferedReader {
        private final Deque<String> lines;
        private final Semaphore consumerIdle;

        LockstepReader(List<String> lines, Semaphore consumerIdle) {
            super(new StringReader(""));
            this.lines = new ArrayDeque<>(lines);
            this.consumerIdle = consumerIdle;
        }

        @Override
        public String readLine() throws IOException {
            try {
                if (!consumerIdle.tryAcquire(WAIT_SECONDS, TimeUnit.SECONDS)) {
                    throw new IOException("소비자가 빈 큐에서 잠들지 않았다");
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                throw new IOException(e);
            }
            return lines.pollFirst();
        }
    }

    private static String line(String time, String tag, String level, String logger, String message) {
        return "2026-05-15 " + time + " [http-1] [" + tag + "] [SVC01] " + level + " " + logger + " - " + message;
    }

    private static List<Object> parseInLockstep(List<String> lines) throws Exception {
        SignallingQueue queue = new SignallingQueue();
        LogProcessor processor = new LogProcessor(ParseFixture.newLexer(queue), queue, ParseFixture.loadDefaultPattern());

        AtomicReference<Throwable> consumerFailure = new AtomicReference<>();
        Thread consumer = new Thread(() -> {
            try {
                processor.run();
            } catch (Throwable t) {
                consumerFailure.set(t);
            }
        }, "catch-up-consumer");
        consumer.start();

        processor.getLogLexer().readBuffer(new LockstepReader(lines, queue.consumerIdle));

        consumer.join(TimeUnit.SECONDS.toMillis(WAIT_SECONDS));
        assertThat(consumer.isAlive()).as("소비자가 끝 신호를 받고 끝나야 한다").isFalse();
        assertThat(consumerFailure.get()).isNull();
        return processor.getTree();
    }

    private static JsonNode request(List<Object> tree, String path) {
        JsonNode json = MAPPER.valueToTree(tree);
        for (JsonNode node : json) {
            if (node.toString().contains(path)) {
                return node;
            }
        }
        throw new AssertionError("요청을 찾지 못했다: " + path + " in " + json);
    }

    @Test
    void 소비자가_스택_중간에_큐를_따라잡아도_예외에_스택_전체가_들어간다() throws Exception {
        List<String> lines = List.of(
                // T1 — 예외 뒤에 다른 머리 줄이 온다(다음 머리 줄에서 버퍼를 비우는 경로).
                line("10:00:00.000", "T1", "INFO ", "c.d.Web", "POST \"/api/order/save\""),
                line("10:00:00.010", "T1", "INFO ", "c.d.Svc", "Service [SVC01] start. Request Tag [RT1]"),
                line("10:00:00.020", "T1", "ERROR", "c.d.Svc", "failure in the middle"),
                "\tat com.d.Foo.bar(Foo.java:10)",
                "\tat com.d.Main.main(Main.java:3)",
                line("10:00:00.030", "T1", "INFO ", "c.d.Svc", "plain business message"),
                // T2 — 예외가 끝 신호 바로 앞이다(끝 신호에서 버퍼를 비우는 경로).
                line("10:00:00.100", "T2", "INFO ", "c.d.Web", "POST \"/api/item/save\""),
                line("10:00:00.110", "T2", "INFO ", "c.d.Svc", "Service [SVC01] start. Request Tag [RT2]"),
                line("10:00:00.120", "T2", "ERROR", "c.d.Svc", "failure at the end"),
                "\tat com.d.Baz.qux(Baz.java:20)",
                "\tat com.d.Main.main(Main.java:4)");

        List<Object> tree = parseInLockstep(lines);

        JsonNode t1 = request(tree, "/api/order/save");
        assertThat(t1.path("property").path("exception").path(0).asText()).as("T1 %s", t1)
                .isEqualTo("failure in the middle\n\tat com.d.Foo.bar(Foo.java:10)\n\tat com.d.Main.main(Main.java:3)");

        JsonNode t2 = request(tree, "/api/item/save");
        assertThat(t2.path("property").path("exception").path(0).asText()).as("T2 %s", t2)
                .isEqualTo("failure at the end\n\tat com.d.Baz.qux(Baz.java:20)\n\tat com.d.Main.main(Main.java:4)");
    }
}
