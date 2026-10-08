package com.dongkuk.dmes.cactus.scheduling;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.PatternLayout;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.autoconfigure.task.TaskSchedulingAutoConfiguration;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.SchedulingAwareRunnable;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.ScheduledMethodRunnable;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class ScheduledJobLogContextTest {

    private final Logger contextLogger = (Logger) LoggerFactory.getLogger(ScheduledJobLogContext.class);
    private ListAppender<ILoggingEvent> appender;
    private Level originalLevel;

    @BeforeEach
    void setUp() {
        MDC.clear();
        originalLevel = contextLogger.getLevel();
        contextLogger.setLevel(Level.DEBUG);
        appender = new ListAppender<>();
        appender.start();
        contextLogger.addAppender(appender);
    }

    @AfterEach
    void tearDown() {
        contextLogger.detachAppender(appender);
        contextLogger.setLevel(originalLevel);
        MDC.clear();
    }

    @Test
    void 실행_중에는_태그와_작업_이름이_들어가고_끝나면_비워진다() {
        AtomicReference<Map<String, String>> seen = new AtomicReference<>();

        ScheduledJobLogContext.run("sch.demo.tick", () -> seen.set(MDC.getCopyOfContextMap()));

        assertThat(seen.get()).containsEntry("serviceId", "sch.demo.tick");
        assertThat(seen.get().get("service_tag")).matches("\\w{4}");
        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
    }

    @Test
    void 시작_줄과_끝_줄은_요청_서비스와_같은_모양이다() {
        ScheduledJobLogContext.run("sch.demo.tick", () -> { });

        assertThat(appender.list).extracting(ILoggingEvent::getFormattedMessage).satisfiesExactly(
                start -> assertThat(start).isEqualTo("sch.demo.tick/run"),
                end -> assertThat(end).matches("Service end - service name \\[sch\\.demo\\.tick] RunTime : \\[\\d+]"));
        // analog 의 action_pattern 과 lex_pattern 이 읽는 값
        assertThat(appender.list.get(0).getFormattedMessage()).matches("^[\\w.-]+/(?<action>\\w+)$");
        assertThat(appender.list).allSatisfy(e -> {
            assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "sch.demo.tick");
            assertThat(e.getMDCPropertyMap().get("service_tag")).matches("[\\w:]+");
        });
    }

    @Test
    void runQuiet_는_경계_줄을_DEBUG_로_남긴다() {
        ScheduledJobLogContext.runQuiet("sch.demo.poll", () -> { });

        assertThat(appender.list).hasSize(2).allSatisfy(e -> assertThat(e.getLevel()).isEqualTo(Level.DEBUG));
    }

    @Test
    void 작업이_실패해도_예외를_다시_던지고_태그를_비우며_ERROR_줄을_남긴다() {
        assertThatThrownBy(() -> ScheduledJobLogContext.run("sch.demo.fail", () -> {
            throw new IllegalStateException("boom");
        })).isInstanceOf(IllegalStateException.class).hasMessage("boom");

        assertThat(MDC.getCopyOfContextMap()).isNullOrEmpty();
        assertThat(appender.list).filteredOn(e -> e.getLevel() == Level.ERROR).singleElement().satisfies(e -> {
            assertThat(e.getFormattedMessage()).contains("sch.demo.fail").contains("boom");
            assertThat(e.getMDCPropertyMap().get("service_tag")).isNotBlank();
        });
        assertThat(appender.list.get(appender.list.size() - 1).getFormattedMessage()).startsWith("Service end - service name [sch.demo.fail]");
    }

    @Test
    void 이미_태그가_있는_스레드에서는_그_태그를_바꾸지_않고_지우지도_않는다() {
        MDC.put("service_tag", "ab12");

        ScheduledJobLogContext.run("sch.demo.nested", () -> assertThat(MDC.get("service_tag")).isEqualTo("ab12"));

        assertThat(MDC.get("service_tag")).isEqualTo("ab12");
        assertThat(MDC.get("serviceId")).isNull();
        assertThat(appender.list).isEmpty();
    }

    @Test
    void 매_실행마다_새_태그를_받는다() {
        List<String> tags = new ArrayList<>();
        for (int i = 0; i < 5; i++) {
            ScheduledJobLogContext.run("sch.demo.tick", () -> tags.add(MDC.get("service_tag")));
        }

        assertThat(tags).hasSize(5).doesNotContainNull();
        assertThat(tags.stream().distinct().count()).isGreaterThan(1);
    }

    @Test
    void ScheduledMethodRunnable_은_클래스와_메서드로_이름을_짓는다() throws Exception {
        ScheduledMethodRunnable runnable = new ScheduledMethodRunnable(new Sample(), Sample.class.getDeclaredMethod("collectMinute"));

        assertThat(ScheduledJobLogContext.jobNameOf(runnable)).isEqualTo("sch.sample.collectMinute");
    }

    @Test
    void 일반_Runnable_은_클래스_이름으로_이름을_짓고_익명_클래스도_처리한다() {
        class Named implements Runnable {
            @Override
            public void run() {
            }
        }

        assertThat(ScheduledJobLogContext.jobNameOf(new Named())).isEqualTo("sch.named");
        assertThat(ScheduledJobLogContext.jobNameOf(new Runnable() {
            @Override
            public void run() {
            }
        })).isEqualTo("sch.anonymous");
    }

    @Test
    void 자동_설정을_건_스케줄러에서_cron_과_fixedDelay_작업_모두_태그가_들어간다() throws Exception {
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext(
                SchedulingConfig.class, ScheduledJobLogAutoConfiguration.class)) {
            ScheduledBean bean = ctx.getBean(ScheduledBean.class);

            assertThat(bean.fixedDelaySeen.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(bean.cronSeen.await(10, TimeUnit.SECONDS)).isTrue();

            assertThat(bean.fixedDelayMdc.get()).containsEntry("serviceId", "sch.scheduledBean.fixedDelayJob");
            assertThat(bean.fixedDelayMdc.get().get("service_tag")).matches("\\w{4}");
            assertThat(bean.cronMdc.get()).containsEntry("serviceId", "sch.scheduledBean.cronJob");
            assertThat(bean.cronMdc.get().get("service_tag")).matches("\\w{4}");
        }
    }

    @Test
    void Boot_가_만든_스케줄러에서도_태그가_들어간다() throws Exception {
        new ApplicationContextRunner()
                .withConfiguration(AutoConfigurations.of(TaskSchedulingAutoConfiguration.class, ScheduledJobLogAutoConfiguration.class))
                .withUserConfiguration(BootSchedulingConfig.class)
                .run(ctx -> {
                    ScheduledBean bean = ctx.getBean(ScheduledBean.class);

                    assertThat(bean.fixedDelaySeen.await(10, TimeUnit.SECONDS)).isTrue();
                    assertThat(bean.fixedDelayMdc.get()).containsEntry("serviceId", "sch.scheduledBean.fixedDelayJob");
                    assertThat(bean.fixedDelayMdc.get().get("service_tag")).matches("\\w{4}");
                });
    }

    /** 공통 logback 패턴으로 찍힌 줄을 analog application.yml 의 정규식이 서비스로 읽는지 확인한다. */
    @Test
    void 공통_logback_패턴_줄을_analog_정규식이_서비스_Action_소요시간으로_읽는다() {
        PatternLayout layout = new PatternLayout();
        layout.setContext(contextLogger.getLoggerContext());
        layout.setPattern("%d{yyyy-MM-dd HH:mm:ss.SSS} [%thread] [%X{service_tag}] [%X{serviceId}] %-5level %logger{36} - %msg%n");
        layout.start();
        Pattern lex = Pattern.compile("(?<time>20\\d\\d-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d\\.\\d\\d\\d) \\[(?<thread>[^\\]]+)\\] \\[(?<serviceTag>[\\w:]+)\\] \\[(?<service>[^\\]]+)\\] (?<level>(?:TRACE|DEBUG|INFO|WARN|ERROR))\\s+(?<logger>[\\w.$-]+) - (?<message>.*)");
        Pattern action = Pattern.compile("^[\\w.-]+/(?<action>\\w+)$");
        Pattern runTime = Pattern.compile("RunTime : \\[(?<runTime>\\d+)\\]\\s*$");

        ScheduledJobLogContext.run("sch.widgetCollector.collectMinute", () -> { });

        List<Matcher> lines = appender.list.stream()
                .map(e -> lex.matcher(layout.doLayout(e).strip()))
                .toList();
        assertThat(lines).hasSize(2).allMatch(Matcher::find);
        assertThat(lines).allSatisfy(m -> {
            assertThat(m.group("serviceTag")).matches("\\w{4}");
            assertThat(m.group("service")).isEqualTo("sch.widgetCollector.collectMinute");
        });
        assertThat(lines.get(0).group("serviceTag")).isEqualTo(lines.get(1).group("serviceTag"));
        Matcher start = action.matcher(lines.get(0).group("message"));
        assertThat(start.find()).isTrue();
        assertThat(start.group("action")).isEqualTo("run");
        assertThat(lines.get(1).group("message")).startsWith("Service end - service name ");
        assertThat(runTime.matcher(lines.get(1).group("message")).find()).isTrue();
    }

    @Test
    void wrap_은_SchedulingAwareRunnable_의_qualifier_와_longLived_를_그대로_넘긴다() throws Exception {
        ScheduledMethodRunnable inner = new ScheduledMethodRunnable(new Sample(), Sample.class.getDeclaredMethod("collectMinute"), "other", () -> null);

        Runnable wrapped = ScheduledJobLogContext.wrap(inner);

        assertThat(wrapped).isInstanceOfSatisfying(SchedulingAwareRunnable.class, w -> {
            assertThat(w.getQualifier()).isEqualTo("other");
            assertThat(w.isLongLived()).isEqualTo(inner.isLongLived());
        });
    }

    @Test
    void Scheduled_scheduler_로_고른_다른_스케줄러_스레드에서도_태그가_들어간다() throws Exception {
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext(
                QualifiedSchedulingConfig.class, ScheduledJobLogAutoConfiguration.class)) {
            QualifiedBean bean = ctx.getBean(QualifiedBean.class);

            assertThat(bean.seen.await(10, TimeUnit.SECONDS)).isTrue();
            assertThat(bean.threadName.get()).startsWith("other-sched-");
            assertThat(bean.mdc.get()).containsEntry("serviceId", "sch.qualifiedBean.job");
        }
    }

    @Configuration
    @EnableScheduling
    static class QualifiedSchedulingConfig {
        @Bean
        ThreadPoolTaskScheduler taskScheduler() {
            ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
            s.setThreadNamePrefix("default-sched-");
            return s;
        }

        @Bean
        ThreadPoolTaskScheduler otherScheduler() {
            ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
            s.setThreadNamePrefix("other-sched-");
            return s;
        }

        @Bean
        QualifiedBean qualifiedBean() {
            return new QualifiedBean();
        }
    }

    static class QualifiedBean {
        final CountDownLatch seen = new CountDownLatch(1);
        final AtomicReference<String> threadName = new AtomicReference<>();
        final AtomicReference<Map<String, String>> mdc = new AtomicReference<>();

        @Scheduled(fixedDelay = 100_000L, initialDelay = 10L, scheduler = "otherScheduler")
        public void job() {
            threadName.compareAndSet(null, Thread.currentThread().getName());
            mdc.compareAndSet(null, MDC.getCopyOfContextMap());
            seen.countDown();
        }
    }

    @Configuration
    @EnableScheduling
    static class BootSchedulingConfig {
        @Bean
        ScheduledBean scheduledBean() {
            return new ScheduledBean();
        }
    }

    @Configuration
    @EnableScheduling
    static class SchedulingConfig {
        @Bean
        ThreadPoolTaskScheduler taskScheduler() {
            ThreadPoolTaskScheduler s = new ThreadPoolTaskScheduler();
            s.setPoolSize(2);
            return s;
        }

        @Bean
        ScheduledBean scheduledBean() {
            return new ScheduledBean();
        }
    }

    static class ScheduledBean {
        final CountDownLatch fixedDelaySeen = new CountDownLatch(1);
        final CountDownLatch cronSeen = new CountDownLatch(1);
        final AtomicReference<Map<String, String>> fixedDelayMdc = new AtomicReference<>();
        final AtomicReference<Map<String, String>> cronMdc = new AtomicReference<>();

        @Scheduled(fixedDelay = 100_000L, initialDelay = 10L)
        public void fixedDelayJob() {
            fixedDelayMdc.compareAndSet(null, MDC.getCopyOfContextMap());
            fixedDelaySeen.countDown();
        }

        @Scheduled(cron = "* * * * * *")
        public void cronJob() {
            cronMdc.compareAndSet(null, MDC.getCopyOfContextMap());
            cronSeen.countDown();
        }
    }

    static class Sample {
        volatile Map<String, String> seen;

        public void collectMinute() {
            seen = MDC.getCopyOfContextMap();
        }
    }
}
