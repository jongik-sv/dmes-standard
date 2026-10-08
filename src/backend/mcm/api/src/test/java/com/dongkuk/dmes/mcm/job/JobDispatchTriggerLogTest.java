package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Level;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.cactus.scheduling.ScheduledJobLogContext;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobCallSink;
import com.dongkuk.dmes.mcm.job.server.JobDispatchTrigger;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.support.GenericApplicationContext;

/** 트리거의 로그 위치(설계 §4.8)·반복(more)·연속 실패 WARN 한 번을 확인한다 — ServiceStarter 는 가짜. */
class JobDispatchTriggerLogTest {

    private final Logger root = (Logger) LoggerFactory.getLogger(org.slf4j.Logger.ROOT_LOGGER_NAME);
    private ListAppender<ILoggingEvent> appender;
    private ServiceStarter starter;
    private final List<JobRunRequest> submitted = new ArrayList<>();
    private final JobCallSink sink = submitted::add;

    @BeforeEach
    void setUp() {
        appender = new ListAppender<>();
        appender.start();
        root.addAppender(appender);
        root.setLevel(Level.INFO);
        starter = mock(ServiceStarter.class);
    }

    @AfterEach
    void tearDown() {
        root.detachAppender(appender);
        MDC.clear();
    }

    private static JobRunRequest req(String id) {
        return new JobRunRequest(id, "j-" + id, "MDM", "job^^code", "run", null, null, null, 60, null, "2026-10-09T02:00:00", false, null);
    }

    private static ServiceResult ok(ClaimedBatch batch) {
        ServiceResult r = mock(ServiceResult.class);
        when(r.serviceResultCode()).thenReturn(ServiceResultCode.SUCCESS);
        when(r.result("claimed")).thenReturn(new TypedObject(batch));
        return r;
    }

    private static ServiceResult failed() {
        ServiceResult r = mock(ServiceResult.class);
        when(r.serviceResultCode()).thenReturn(ServiceResultCode.SYSTEM_ERROR);
        return r;
    }

    private JobDispatchTrigger trigger() {
        return new JobDispatchTrigger(starter, new GenericApplicationContext(), sink, 50, true);
    }

    @Test
    @DisplayName("판정 구간의 줄은 serviceId=job^^dispatch(mcm 업무 로그), 래퍼가 남기는 경계 줄은 sch.…, 돌아온 뒤 MDC 는 래퍼의 값으로 복원된다")
    void logsGoToTheBusinessLogAndMdcIsRestored() {
        when(starter.start(eq("job^^dispatch"), any())).thenAnswer(inv -> {
            org.slf4j.LoggerFactory.getLogger("test.sql").info("select ... from TB_MCM_JOB_DEF");   // BPMN 안 SQL 줄 대용
            return ok(new ClaimedBatch(List.of(req("a")), false));
        });
        ScheduledJobLogContext.run("sch.mcm.jobDispatchTrigger.tick", () -> {
            String wrapperTag = MDC.get("service_tag");
            String wrapperTx = MDC.get("txId");
            trigger().tick();
            assertThat(MDC.get("serviceId")).isEqualTo("sch.mcm.jobDispatchTrigger.tick");
            assertThat(MDC.get("service_tag")).isEqualTo(wrapperTag);
            assertThat(MDC.get("txId")).isEqualTo(wrapperTx);
        });

        List<ILoggingEvent> events = appender.list;
        assertThat(events).filteredOn(e -> e.getFormattedMessage().equals("job^^dispatch/run"))
                .isNotEmpty().allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "job^^dispatch"));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().startsWith("Service end - service name [job^^dispatch]"))
                .isNotEmpty().allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "job^^dispatch"));
        assertThat(events).filteredOn(e -> e.getLoggerName().equals("test.sql"))
                .isNotEmpty().allSatisfy(e -> assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "job^^dispatch"));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().equals("sch.mcm.jobDispatchTrigger.tick/run"))
                .isNotEmpty().allSatisfy(e -> assertThat(e.getMDCPropertyMap().get("serviceId")).startsWith("sch."));
        assertThat(events).filteredOn(e -> e.getFormattedMessage().startsWith("Service end - service name [sch.mcm.jobDispatchTrigger.tick]"))
                .isNotEmpty().allSatisfy(e -> assertThat(e.getMDCPropertyMap().get("serviceId")).startsWith("sch."));
        assertThat(submitted).extracting(JobRunRequest::runId).containsExactly("a");
    }

    @Test
    @DisplayName("more=true 이면 같은 틱에서 다시 부른다 — 최대 10번, 묶음마다 호출을 넘긴다")
    void repeatsWhileMoreUpToTen() {
        AtomicInteger calls = new AtomicInteger();
        when(starter.start(eq("job^^dispatch"), any())).thenAnswer(inv -> ok(new ClaimedBatch(List.of(req("r" + calls.incrementAndGet())), true)));
        trigger().tick();
        assertThat(calls.get()).isEqualTo(10);
        assertThat(submitted).hasSize(10);

        submitted.clear();
        calls.set(0);
        when(starter.start(eq("job^^dispatch"), any())).thenAnswer(inv -> {
            int n = calls.incrementAndGet();
            return ok(new ClaimedBatch(List.of(req("s" + n)), n < 3));
        });
        trigger().tick();
        assertThat(calls.get()).isEqualTo(3);
    }

    @Test
    @DisplayName("연속 실패는 첫 번째만 WARN, 복구 때 INFO 한 줄 — 실패한 분에는 호출이 나가지 않는다")
    void failureWarnsOnceAndRecoveryInfoOnce() {
        ServiceResult fail1 = failed();   // 결과 모의 객체는 바깥 when(...) 앞에서 만든다(안에서 만들면 UnfinishedStubbingException)
        ServiceResult fail2 = failed();
        ServiceResult okX = ok(new ClaimedBatch(List.of(req("x")), false));
        when(starter.start(eq("job^^dispatch"), any())).thenReturn(fail1, fail2, okX);
        JobDispatchTrigger t = trigger();
        t.tick();
        t.tick();
        t.tick();
        assertThat(appender.list).filteredOn(e -> e.getLevel() == Level.WARN).hasSize(1);
        assertThat(appender.list).filteredOn(e -> e.getFormattedMessage().contains("복구")).hasSize(1);
        assertThat(submitted).extracting(JobRunRequest::runId).containsExactly("x");
    }
}
