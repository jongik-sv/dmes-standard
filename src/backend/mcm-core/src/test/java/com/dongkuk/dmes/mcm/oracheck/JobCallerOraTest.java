package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.AcceptResult;
import com.dongkuk.dmes.mcm.job.agent.JobRunAcceptor;
import com.dongkuk.dmes.mcm.job.agent.LocalJobRunGateway;
import com.dongkuk.dmes.mcm.job.server.JobCaller;
import com.dongkuk.dmes.mcm.job.server.JobRunStore;
import com.sun.net.httpserver.HttpServer;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/** MCM → 모듈 호출(설계 §4.3)의 응답별 처리 — 가짜 모듈 HTTP 서버와 실제 Oracle RUN 행. 재시도는 없다. */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobCallerOraTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    private HttpServer server;
    private final Map<String, Object[]> scripted = new ConcurrentHashMap<>();   // runId → {status, body, delayMs}
    private final List<String> seenHeaders = new CopyOnWriteArrayList<>();
    private final AtomicInteger requests = new AtomicInteger();
    private JobCaller caller;
    private LocalJobRunGateway local;
    private ListAppender<ILoggingEvent> appender;
    private final Logger callerLog = (Logger) LoggerFactory.getLogger(JobCaller.class);

    @BeforeEach
    void setUp() throws Exception {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/internal/job/run", ex -> {
            requests.incrementAndGet();
            String body = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            String runId = body.replaceAll("(?s).*\"runId\":\"([^\"]+)\".*", "$1");
            seenHeaders.add(ex.getRequestHeaders().getFirst("X-Client-Key") + "|" + ex.getRequestHeaders().getFirst("X-Authenticated-User") + "|"
                    + ex.getRequestHeaders().getFirst("X-Authenticated-Role") + "|" + (ex.getRequestHeaders().getFirst("X-Tx-Id") != null)
                    + "|" + ex.getRequestHeaders().getFirst("Content-Type"));
            Object[] script = scripted.getOrDefault(runId, new Object[] {202, "{\"accepted\":true,\"serverNm\":\"srv1\"}", 0});
            try {
                Thread.sleep((int) script[2]);
                byte[] out = ((String) script[1]).getBytes(StandardCharsets.UTF_8);
                ex.getResponseHeaders().add("Content-Type", "application/json");
                ex.sendResponseHeaders((int) script[0], out.length);
                ex.getResponseBody().write(out);
            } catch (Exception ignored) {
                // 클라이언트가 읽기 시간 초과로 끊었다
            } finally {
                ex.close();
            }
        });
        server.start();
        local = new LocalJobRunGateway(mock(JobRunAcceptor.class));
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 2, 10, Duration.ofSeconds(5));
        appender = new ListAppender<>();
        appender.start();
        callerLog.addAppender(appender);
    }

    private JobCaller newCaller(Map<String, String> urls, int threads, int queue, Duration read) {
        return new JobCaller(urls, JobModule.MCM, local, new JobRunStore(dataSource, "MCMAPUSER"), "test-key", threads, queue, Duration.ofSeconds(2), read);
    }

    @AfterEach
    void tearDown() {
        callerLog.detachAppender(appender);
        caller.close();
        try {
            server.stop(0);   // 연결 거부 시험은 이미 멈춰 있다
        } catch (RuntimeException ignored) {
            // 두 번 멈춰도 상관없다
        }
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
    }

    private JobRunRequest insertAndRequest(String runId, String module) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES (?, TIMESTAMP '2026-10-09 02:00:00', 'S', ?, ?, 'jobCode', 'RUN', SYSTIMESTAMP, 600)", "job-" + runId, runId, module);
        return new JobRunRequest(runId, "job-" + runId, module, "jobCode", "run", Map.of("a", 1), Map.of(), Map.of("handlerId", "h"), 600, null,
                "2026-10-09T02:00:00", false, null);
    }

    private Map<String, Object> awaitRow(String runId, String expectedStatus) throws Exception {
        for (int i = 0; i < 100; i++) {
            Map<String, Object> r = jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
            if (expectedStatus.equals(r.get("STATUS")) && (!"RUN".equals(expectedStatus) || r.get("SERVER_NM") != null)) return r;
            Thread.sleep(50);
        }
        return jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
    }

    private void script(String runId, int status, String body, int delayMs) {
        scripted.put(runId, new Object[] {status, body, delayMs});
    }

    @Test
    @DisplayName("202 접수 → SERVER_NM 만 기록하고 STATUS 는 RUN 그대로. 헤더는 키·system:mcm·SYSTEM·X-Tx-Id·JSON")
    void accepted() throws Exception {
        caller.submit(insertAndRequest("r1", "MDM"));
        Map<String, Object> row = awaitRow("r1", "RUN");
        assertThat(row.get("SERVER_NM")).isEqualTo("srv1");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(seenHeaders).hasSize(1);
        assertThat(seenHeaders.get(0)).isEqualTo("test-key|system:mcm|SYSTEM|true|application/json");
    }

    @Test
    @DisplayName("200 {duplicate:true} 는 접수와 같게 처리한다")
    void duplicateIsAccepted() throws Exception {
        script("r1", 200, "{\"duplicate\":true}", 0);
        caller.submit(insertAndRequest("r1", "MDM"));
        Thread.sleep(500);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'r1'", String.class)).isEqualTo("RUN");
    }

    @Test
    @DisplayName("503 JOB_POOL_FULL → SKIP, 409 JOB_RUNNING → SKIP, 404 JOB_HANDLER_NOT_FOUND → FAIL")
    void definiteRejections() throws Exception {
        script("pool", 503, "{\"code\":\"JOB_POOL_FULL\"}", 0);
        script("busy", 409, "{\"code\":\"JOB_RUNNING\"}", 0);
        script("nohandler", 404, "{\"code\":\"JOB_HANDLER_NOT_FOUND\"}", 0);
        for (String id : List.of("pool", "busy", "nohandler")) caller.submit(insertAndRequest(id, "MDM"));
        assertThat(awaitRow("pool", "SKIP").get("MSG")).isEqualTo("실행 풀 가득");
        assertThat(awaitRow("busy", "SKIP").get("MSG")).isEqualTo("같은 서버에서 실행 중");
        assertThat(awaitRow("nohandler", "FAIL").get("MSG")).isEqualTo("처리기 없음");
    }

    @Test
    @DisplayName("그 밖의 4xx(400·401·403)는 확실히 접수 안 됨 → FAIL 「모듈 호출 실패」")
    void other4xxFails() throws Exception {
        for (int status : new int[] {400, 401, 403}) {
            String id = "r" + status;
            script(id, status, "{\"code\":\"X\"}", 0);
            caller.submit(insertAndRequest(id, "MDM"));
            assertThat(String.valueOf(awaitRow(id, "FAIL").get("MSG"))).startsWith("모듈 호출 실패");
        }
    }

    @Test
    @DisplayName("접수됐는지 모르는 경우(5xx 일반·우리 코드가 없는 503)는 RUN 으로 둔다 — FAIL 로 바꾸면 모듈의 OK 갱신이 0행이 된다")
    void uncertainStaysRunning() throws Exception {
        script("e500", 500, "oops", 0);
        script("lb503", 503, "<html>upstream down</html>", 0);
        caller.submit(insertAndRequest("e500", "MDM"));
        caller.submit(insertAndRequest("lb503", "MDM"));
        Thread.sleep(700);
        assertThat(jdbc.queryForList("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN ORDER BY RUN_ID", String.class)).containsExactly("RUN", "RUN");
        assertThat(appender.list).filteredOn(e -> e.getLevel().toString().equals("WARN")).hasSize(2);
    }

    @Test
    @DisplayName("읽기 시간 초과는 RUN 유지 + 같은 요청을 다시 보내지 않는다(재시도 없음)")
    void readTimeoutKeepsRunAndDoesNotRetry() throws Exception {
        caller.close();
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 2, 10, Duration.ofMillis(300));
        script("slow", 202, "{\"accepted\":true}", 1500);
        caller.submit(insertAndRequest("slow", "MDM"));
        Thread.sleep(2200);
        assertThat(requests.get()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'slow'", String.class)).isEqualTo("RUN");
    }

    @Test
    @DisplayName("연결 거부·주소 설정 없음은 즉시 FAIL — 메시지에 주소가 없다")
    void connectionRefusedAndMissingUrl() throws Exception {
        int deadPort = server.getAddress().getPort();
        server.stop(0);
        caller.submit(insertAndRequest("refused", "MDM"));
        String msg = String.valueOf(awaitRow("refused", "FAIL").get("MSG"));
        assertThat(msg).startsWith("모듈 호출 실패").doesNotContain("127.0.0.1").doesNotContain(String.valueOf(deadPort)).doesNotContain("http");
        caller.submit(insertAndRequest("nourl", "MPP"));
        assertThat(String.valueOf(awaitRow("nourl", "FAIL").get("MSG"))).contains("주소");
    }

    @Test
    @DisplayName("모듈의 OK 갱신이 접수 기록보다 먼저 와도 최종 상태는 모듈 결과다(접수 기록은 SERVER_NM 만)")
    void moduleResultWinsOverAcceptBookkeeping() throws Exception {
        script("race", 202, "{\"accepted\":true,\"serverNm\":\"mcm-view\"}", 400);
        caller.submit(insertAndRequest("race", "MDM"));
        Thread.sleep(100);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_RUN SET STATUS = 'OK', SERVER_NM = NVL(SERVER_NM, 'module-view') WHERE RUN_ID = 'race' AND STATUS = 'RUN'");
        Thread.sleep(800);
        Map<String, Object> row = jdbc.queryForMap("SELECT STATUS, SERVER_NM FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = 'race'");
        assertThat(row.get("STATUS")).isEqualTo("OK");
        assertThat(row.get("SERVER_NM")).isEqualTo("module-view");
    }

    @Test
    @DisplayName("MCM 자신의 작업은 HTTP 없이 접수 쪽을 직접 부른다")
    void mcmCallsLocalWithoutHttp() throws Exception {
        JobRunAcceptor acceptor = mock(JobRunAcceptor.class);
        when(acceptor.accept(any())).thenReturn(new AcceptResult(202, Map.of("accepted", true, "serverNm", "local-srv")));
        local = new LocalJobRunGateway(acceptor);
        caller.close();
        caller = newCaller(Map.of("MCM", "http://127.0.0.1:1"), 2, 10, Duration.ofSeconds(5));
        caller.submit(insertAndRequest("loc", "MCM"));
        assertThat(awaitRow("loc", "RUN").get("SERVER_NM")).isEqualTo("local-srv");
        assertThat(requests.get()).isZero();
        verify(acceptor).accept(any());
    }

    @Test
    @DisplayName("호출 대기열(200)이 가득이면 그 회차를 SKIP 「호출 대기열 가득」으로 닫는다")
    void queueFull() throws Exception {
        caller.close();
        caller = newCaller(Map.of("MDM", "http://127.0.0.1:" + server.getAddress().getPort()), 1, 1, Duration.ofSeconds(5));
        for (String id : List.of("q1", "q2", "q3")) script(id, 202, "{\"accepted\":true}", 800);
        for (String id : List.of("q1", "q2", "q3")) caller.submit(insertAndRequest(id, "MDM"));
        assertThat(awaitRow("q3", "SKIP").get("MSG")).isEqualTo("호출 대기열 가득");
    }

    @Test
    @DisplayName("호출 로그는 mcm 업무 로그의 jobDispatch 서비스(MDC serviceId·runId)로 남고 주소·키는 없다")
    void callLogCarriesDispatchServiceMdc() throws Exception {
        caller.submit(insertAndRequest("logrun", "MDM"));
        awaitRow("logrun", "RUN");
        assertThat(appender.list).isNotEmpty().allSatisfy(e -> {
            assertThat(e.getMDCPropertyMap()).containsEntry("serviceId", "jobDispatch").containsEntry("runId", "logrun");
            assertThat(e.getFormattedMessage()).doesNotContain("127.0.0.1").doesNotContain("test-key");
        });
    }
}
