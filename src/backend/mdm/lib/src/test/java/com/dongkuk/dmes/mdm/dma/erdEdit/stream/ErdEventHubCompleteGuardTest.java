package com.dongkuk.dmes.mdm.dma.erdEdit.stream;

import static org.assertj.core.api.Assertions.assertThat;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import java.io.IOException;
import java.util.List;
import java.util.function.BooleanSupplier;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * 컨테이너(Tomcat)가 onError 를 이미 처리한 emitter 는 completeWithError/complete 가 IllegalStateException 을 던진다.
 * 그 예외가 send()·closeWithReload() 밖으로 새면 drain() 이 "ERD SSE 전달 실패" WARN(스택 포함)을 남겨 로그가 넘친다.
 * 허브는 이를 삼키고 구독만 지워야 한다(운영 루프 보고서 F4 / 안 A).
 */
class ErdEventHubCompleteGuardTest {

    /** 보내기는 IOException, 닫기는 이미 닫힌 emitter 처럼 IllegalStateException. */
    static final class AlreadyErroredEmitter extends SseEmitter {
        volatile int completeWithErrorCalls;
        volatile int completeCalls;
        final boolean sendFails;

        AlreadyErroredEmitter(boolean sendFails) {
            super(0L);
            this.sendFails = sendFails;
        }

        @Override
        public void send(SseEventBuilder builder) throws IOException {
            if (sendFails) throw new IOException("Broken pipe");
        }

        @Override
        public void completeWithError(Throwable ex) {
            completeWithErrorCalls++;
            throw new IllegalStateException("ResponseBodyEmitter has already completed with error");
        }

        @Override
        public void complete() {
            completeCalls++;
            throw new IllegalStateException("ResponseBodyEmitter has already completed");
        }
    }

    final ErdEventHub hub = new ErdEventHub(null, null);
    final Logger hubLogger = (Logger) LoggerFactory.getLogger(ErdEventHub.class);
    final ListAppender<ILoggingEvent> logs = new ListAppender<>();
    Level oldLevel;

    @BeforeEach
    void captureLogs() {
        oldLevel = hubLogger.getLevel();
        hubLogger.setLevel(Level.DEBUG);
        logs.start();
        hubLogger.addAppender(logs);
    }

    @AfterEach
    void close() {
        hubLogger.detachAppender(logs);
        hubLogger.setLevel(oldLevel);
        hub.close();
    }

    private static void await(BooleanSupplier cond, String what) throws InterruptedException {
        long end = System.currentTimeMillis() + 5_000;
        while (!cond.getAsBoolean()) {
            if (System.currentTimeMillis() > end) throw new AssertionError(what);
            Thread.sleep(20);
        }
    }

    private List<ILoggingEvent> warns() {
        return logs.list.stream().filter(e -> e.getLevel().isGreaterOrEqual(Level.WARN)).toList();
    }

    @Test
    void sendFailureWhoseCompleteWithErrorThrowsIsSwallowedAndSubscriberDropped() throws Exception {
        AlreadyErroredEmitter e = new AlreadyErroredEmitter(true);
        hub.attachForTest("m", "s", e, 0);
        assertThat(hub.subscriberCount("m")).isEqualTo(1);

        hub.publish(new ErdDelta("m", 1, "u", "s", "UI", List.of()));

        await(() -> hub.subscriberCount("m") == 0, "구독이 목록에서 빠지지 않았다");
        await(() -> e.completeWithErrorCalls >= 1, "completeWithError 가 불리지 않았다");
        // drain() 의 catch 로 새면 "ERD SSE 전달 실패" WARN 이 남는다
        assertThat(warns()).as("WARN 로그가 없어야 한다").isEmpty();
        assertThat(logs.list).noneMatch(x -> x.getFormattedMessage().contains("ERD SSE 전달 실패"));
    }

    @Test
    void reloadCloseWhoseCompleteThrowsIsSwallowedAndSubscriberDropped() throws Exception {
        AlreadyErroredEmitter e = new AlreadyErroredEmitter(false);
        hub.attachForTest("m", "s", e, 0);

        hub.modelDeleted("m", 7);

        await(() -> e.completeCalls >= 1, "complete 가 불리지 않았다");
        await(() -> hub.subscriberCount("m") == 0, "구독이 목록에서 빠지지 않았다");
        assertThat(warns()).as("WARN 로그가 없어야 한다").isEmpty();
    }

    @Test
    void hubCloseSurvivesEmitterWhoseCompleteThrows() {
        AlreadyErroredEmitter e = new AlreadyErroredEmitter(false);
        hub.attachForTest("m", "s", e, 0);
        hub.close(); // 던지면 시험이 실패한다
        assertThat(e.completeCalls).isEqualTo(1);
    }
}
