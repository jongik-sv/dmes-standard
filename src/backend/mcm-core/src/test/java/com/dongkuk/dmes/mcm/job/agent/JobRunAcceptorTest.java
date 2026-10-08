package com.dongkuk.dmes.mcm.job.agent;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunDispatcher.SubmitResult;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class JobRunAcceptorTest {

    private JobRunDispatcher dispatcher;
    private JobRunAcceptor acceptor;

    @BeforeEach
    void setUp() {
        dispatcher = mock(JobRunDispatcher.class);
        when(dispatcher.serverName()).thenReturn("host:mdm:1");
        JobHandlerRegistry handlers = new JobHandlerRegistry(JobModule.MDM,
                List.of(new SimpleScheduledJob("mdm.sync", JobModule.MDM, "동기화", null, java.time.Duration.ofMinutes(5), c -> 1)));
        acceptor = new JobRunAcceptor(JobModule.MDM, dispatcher, handlers);
    }

    private static JobRunRequest req(String module, String serviceId, Map<String, Object> config) {
        return new JobRunRequest("r1", "mdm.sync", module, serviceId, "run", null, null, config, 60, null, "2026-10-09T02:00:00", false, null);
    }

    @Test
    @DisplayName("접수 — 202 {accepted:true, serverNm}")
    void accepted() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(202);
        assertThat(r.body()).containsEntry("accepted", true).containsEntry("serverNm", "host:mdm:1");
    }

    @Test
    @DisplayName("같은 runId 를 이미 접수했으면 200 {duplicate:true}")
    void duplicate() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.DUPLICATE);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(200);
        assertThat(r.body()).containsEntry("duplicate", true);
    }

    @Test
    @DisplayName("같은 서버에서 같은 작업이 실행 중이면 409 JOB_RUNNING, 풀이 가득이면 503 JOB_POOL_FULL")
    void runningAndPoolFull() {
        when(dispatcher.submit(any())).thenReturn(SubmitResult.JOB_RUNNING);
        assertThat(acceptor.accept(req("MDM", "mdm^^dailyClose", null)).status()).isEqualTo(409);
        when(dispatcher.submit(any())).thenReturn(SubmitResult.POOL_FULL);
        AcceptResult r = acceptor.accept(req("MDM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(503);
        assertThat(r.body()).containsEntry("code", "JOB_POOL_FULL");
    }

    @Test
    @DisplayName("요청의 module 이 이 앱의 모듈과 다르면 400 JOB_MODULE_MISMATCH — 실행 풀에 넣지 않는다")
    void moduleMismatch() {
        AcceptResult r = acceptor.accept(req("MCM", "mdm^^dailyClose", null));
        assertThat(r.status()).isEqualTo(400);
        assertThat(r.body()).containsEntry("code", "JOB_MODULE_MISMATCH");
        verify(dispatcher, never()).submit(any());
    }

    @Test
    @DisplayName("CODE 작업(job^^code)의 처리기가 이 앱에 없으면 404 JOB_HANDLER_NOT_FOUND")
    void handlerNotFound() {
        AcceptResult r = acceptor.accept(req("MDM", "job^^code", Map.of("handlerId", "mdm.other")));
        assertThat(r.status()).isEqualTo(404);
        assertThat(r.body()).containsEntry("code", "JOB_HANDLER_NOT_FOUND");
        verify(dispatcher, never()).submit(any());

        when(dispatcher.submit(any())).thenReturn(SubmitResult.ACCEPTED);
        assertThat(acceptor.accept(req("MDM", "job^^code", Map.of("handlerId", "mdm.sync"))).status()).isEqualTo(202);
    }

    @Test
    @DisplayName("본문이 비었거나 필수 칸·예정 시각 형식이 틀리면 400 JOB_BAD_REQUEST")
    void badRequest() {
        assertThat(acceptor.accept(null).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("", "j", "MDM", "s", "run", null, null, null, 60, null, "2026-10-09T02:00:00", false, null)).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("r", "j", "MDM", "s", "run", null, null, null, 60, null, "내일", false, null)).status()).isEqualTo(400);
        assertThat(acceptor.accept(new JobRunRequest("r", "j", "MDM", "s", "run", null, null, null, 0, null, "2026-10-09T02:00:00", false, null)).status()).isEqualTo(400);
        verify(dispatcher, never()).submit(any());
    }
}
