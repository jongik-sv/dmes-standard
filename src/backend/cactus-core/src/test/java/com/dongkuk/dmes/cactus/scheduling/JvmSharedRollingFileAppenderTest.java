package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.LoggerContext;
import ch.qos.logback.classic.encoder.PatternLayoutEncoder;
import ch.qos.logback.classic.util.LogbackMDCAdapter;
import ch.qos.logback.core.rolling.RollingFileAppender;
import ch.qos.logback.core.status.Status;
import ch.qos.logback.core.rolling.TimeBasedRollingPolicy;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CountDownLatch;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * WildFly 개발계처럼 한 JVM 에 logback 컨텍스트가 여럿(WAR 별)이고 같은 파일에 prudent 모드로 쓸 때 줄이 사라지지 않는지 본다.
 * 같은 JVM 안의 서로 다른 FileChannel 잠금은 OverlappingFileLockException 으로 줄을 잃게 만든다.
 */
class JvmSharedRollingFileAppenderTest {

    private static final int CONTEXTS = 3;
    private static final int THREADS_PER_CONTEXT = 2;
    private static final int LINES = 400;

    @TempDir
    Path dir;

    private LoggerContext newContext(String name, RollingFileAppender<ch.qos.logback.classic.spi.ILoggingEvent> appender) {
        LoggerContext context = new LoggerContext();
        context.setName(name);
        context.setMDCAdapter(new LogbackMDCAdapter());
        TimeBasedRollingPolicy<ch.qos.logback.classic.spi.ILoggingEvent> policy = new TimeBasedRollingPolicy<>();
        policy.setContext(context);
        policy.setParent(appender);
        policy.setFileNamePattern(dir.resolve("dmes-sch.%d{yyyy-MM-dd}.0.log").toString());
        policy.setMaxHistory(2);
        PatternLayoutEncoder encoder = new PatternLayoutEncoder();
        encoder.setContext(context);
        encoder.setPattern("%msg%n");
        encoder.start();
        appender.setContext(context);
        appender.setPrudent(true);
        appender.setRollingPolicy(policy);
        appender.setEncoder(encoder);
        policy.start();
        appender.start();
        context.getLogger("sch").addAppender(appender);
        return context;
    }

    private long writeFromContexts(boolean shared) throws Exception {
        List<LoggerContext> contexts = new ArrayList<>();
        for (int c = 0; c < CONTEXTS; c++) {
            contexts.add(newContext("ctx" + c, shared ? new JvmSharedRollingFileAppender<>() : new RollingFileAppender<>()));
        }
        CountDownLatch go = new CountDownLatch(1);
        List<Thread> threads = new ArrayList<>();
        for (int c = 0; c < CONTEXTS; c++) {
            Logger logger = contexts.get(c).getLogger("sch");
            for (int t = 0; t < THREADS_PER_CONTEXT; t++) {
                Thread thread = new Thread(() -> {
                    try {
                        go.await();
                    } catch (InterruptedException e) {
                        return;
                    }
                    for (int i = 0; i < LINES; i++) {
                        logger.info("line-" + "x".repeat(100));
                    }
                });
                thread.start();
                threads.add(thread);
            }
        }
        go.countDown();
        for (Thread thread : threads) {
            thread.join();
        }
        List<String> errors = new ArrayList<>();
        contexts.forEach(c -> c.getStatusManager().getCopyOfStatusList().stream()
                .filter(st -> st.getLevel() >= Status.ERROR).forEach(st -> errors.add(st.toString())));
        contexts.forEach(LoggerContext::stop);
        assertThat(errors).isEmpty();
        return countLines();
    }

    private long countLines() throws IOException {
        try (var files = Files.list(dir)) {
            long total = 0;
            for (Path p : files.toList()) {
                total += Files.readAllLines(p).stream().filter(l -> l.startsWith("line-")).count();
            }
            return total;
        }
    }

    @Test
    void 한_JVM_의_여러_컨텍스트가_같은_파일에_prudent_로_써도_줄이_사라지지_않는다() throws Exception {
        assertThat(writeFromContexts(true)).isEqualTo((long) CONTEXTS * THREADS_PER_CONTEXT * LINES);
    }
}
