package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 보내기 큐(deferred 27) — DB 없이. 발행은 소켓 쓰기에 막힌 구독자를 기다리지 않고, 넘친 구독자는 reload{rev} 뒤 닫히며,
 * 다른 구독자는 그동안에도 델타를 순서대로 받는다. 기본 보내기 스레드 수보다 많은 구독자가 막혀도 다른 구독자는 받고,
 * 막힌 쓰기는 상한 뒤 끊긴다.
 */
class ErdEventHubQueueTest {

    /** 보낸 이벤트를 "이름|본문" 으로 모은다. gate 가 있으면 첫 보내기에서 gate 가 열릴 때까지 막힌다(가득 찬 소켓). */
    static final class RecordingEmitter extends SseEmitter {
        final List<String> events = new CopyOnWriteArrayList<>();
        final CountDownLatch gate;
        final CountDownLatch entered = new CountDownLatch(1);
        volatile boolean completed;
        volatile boolean interrupted;

        RecordingEmitter(CountDownLatch gate) {
            super(0L);
            this.gate = gate;
        }

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            entered.countDown();
            if (gate != null) {
                try {
                    gate.await(30, TimeUnit.SECONDS);
                } catch (InterruptedException e) {
                    interrupted = true;
                    throw new IOException(e);
                }
            }
            StringBuilder sb = new StringBuilder();
            for (DataWithMediaType d : builder.build()) sb.append(d.getData());
            String text = sb.toString();
            String name = text.substring(text.indexOf("event:") + 6, text.indexOf('\n', text.indexOf("event:"))).trim();
            String data = text.substring(text.indexOf("data:") + 5).trim();
            events.add(name + "|" + data);
        }

        @Override
        public void complete() {
            completed = true;
        }

        @Override
        public void completeWithError(Throwable ex) {
            completed = true;
        }
    }

    final ErdEventHub hub = new ErdEventHub(null, null);

    @AfterEach
    void close() {
        hub.close();
    }

    private static ErdDelta delta(long rev) {
        return new ErdDelta("m", rev, "u", "s", "UI", List.of());
    }

    private static long changes(RecordingEmitter e) {
        return e.events.stream().filter(x -> x.startsWith("change|")).count();
    }

    private static void await(BooleanSupplier cond, String what) throws InterruptedException {
        long until = System.currentTimeMillis() + 10_000;
        while (!cond.getAsBoolean()) {
            if (System.currentTimeMillis() > until) throw new AssertionError(what);
            Thread.sleep(20);
        }
    }

    @Test
    void stuckSubscriberDoesNotBlockPublishAndOverflowsToReloadThenClose() throws Exception {
        CountDownLatch gate = new CountDownLatch(1);
        RecordingEmitter stuck = new RecordingEmitter(gate);
        RecordingEmitter fast = new RecordingEmitter(null);
        hub.attachForTest("m", "stuck", stuck, 0);
        hub.attachForTest("m", "fast", fast, 0);

        int total = ErdEventHub.QUEUE_CAP + 50;
        hub.publish(delta(1));
        assertThat(stuck.entered.await(5, TimeUnit.SECONDS)).as("막힌 구독자의 첫 보내기").isTrue();
        // 빠른 구독자는 넘치지 않게 100건마다 따라오기를 기다린다(막힌 구독자는 따라오지 못하므로 넘친다). 잰 것은 발행 시간만이다.
        long publishNanos = 0;
        for (long rev = 2; rev <= total; rev++) {
            if (rev % 100 == 0) {
                long upTo = rev - 1;
                await(() -> fast.events.size() >= upTo, "빠른 구독자가 따라오지 못했다");
            }
            long t0 = System.nanoTime();
            hub.publish(delta(rev));
            publishNanos += System.nanoTime() - t0;
        }
        assertThat(publishNanos / 1_000_000).as("발행은 막힌 구독자를 기다리지 않는다").isLessThan(1_000);

        await(() -> fast.events.size() == total, "빠른 구독자가 모두 받지 못했다: " + fast.events.size());
        for (int i = 0; i < total; i++) {
            assertThat(fast.events.get(i)).startsWith("change|").contains("\"rev\":" + (i + 1) + ",");
        }
        assertThat(fast.completed).isFalse();

        gate.countDown();
        await(() -> stuck.completed, "넘친 구독자가 닫히지 않았다");
        assertThat(stuck.events).hasSize(2);
        assertThat(stuck.events.get(0)).startsWith("change|").contains("\"rev\":1,");
        assertThat(stuck.events.get(1)).isEqualTo("reload|{\"rev\":" + total + "}");
    }

    @Test
    void slowButMovingSubscriberWithinCapGetsEverythingInOrder() throws Exception {
        RecordingEmitter a = new RecordingEmitter(null);
        hub.attachForTest("m", "a", a, 0);
        for (long rev = 1; rev <= 100; rev++) hub.publish(delta(rev));
        await(() -> a.events.size() == 100, "모두 받지 못했다: " + a.events.size());
        for (int i = 0; i < 100; i++) assertThat(a.events.get(i)).contains("\"rev\":" + (i + 1) + ",");
        assertThat(a.completed).isFalse();
    }

    @Test
    void moreStuckSubscribersThanCoreSendersDoNotStallOthersAndAreDroppedAfterDeadline() throws Exception {
        hub.sendDeadlineMs = 500;
        CountDownLatch never = new CountDownLatch(1);
        List<RecordingEmitter> stuck = new java.util.ArrayList<>();
        for (int i = 0; i < ErdEventHub.SEND_CORE + 2; i++) {
            RecordingEmitter e = new RecordingEmitter(never);
            stuck.add(e);
            hub.attachForTest("m", "stuck-" + i, e, 0);
        }
        RecordingEmitter fast = new RecordingEmitter(null);
        hub.attachForTest("m", "fast", fast, 0);
        for (long rev = 1; rev <= 3; rev++) hub.publish(delta(rev));
        await(() -> changes(fast) == 3, "막힌 구독자가 기본 보내기 스레드를 다 쥐어도 빠른 구독자는 받아야 한다: " + fast.events);
        await(() -> stuck.stream().allMatch(e -> e.completed), "막힌 구독자가 상한 뒤 닫히지 않았다");
        assertThat(stuck).allMatch(e -> e.interrupted, "막힌 쓰기 스레드를 깨운다");
        await(() -> hub.subscriberCount("m") == 1, "막힌 구독이 목록에서 빠지지 않았다: " + hub.subscriberCount("m"));
        hub.publish(delta(4));
        await(() -> changes(fast) == 4, "끊은 뒤에도 빠른 구독자는 계속 받는다: " + fast.events); // 끊긴 구독마다 presence 도 온다
        never.countDown();
    }
}
