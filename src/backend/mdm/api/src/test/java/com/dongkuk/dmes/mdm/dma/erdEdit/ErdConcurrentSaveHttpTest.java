package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;

import com.dongkuk.dmes.mdm.common.support.MdmErrors;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionWriteGuard;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.sql.Connection;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 저장·복원의 연결 점유(deferred 27) — BPMN 까지 태우는 HTTP 동시 저장 시험.
 *
 * <p>시험 풀은 2개다(AbstractMdmSharedDbTest). 연결 대기 상한을 3초로 줄여, 요청 하나가 연결 2개를 쥐려 하면 30초가 아니라
 * 3초 만에 S001 로 드러나게 한다. 고치기 전에는 OASIS 바깥 트랜잭션이 연결 하나를 쥔 채 멈추고(NOT_SUPPORTED),
 * 사전 적재와 안쪽 트랜잭션이 연결을 하나 더 받았다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = {"cactus.security.client-key=" + ErdConcurrentSaveHttpTest.KEY,
                "spring.datasource.hikari.connection-timeout=3000"})
@ActiveProfiles("local")
class ErdConcurrentSaveHttpTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-test-key";
    private static final ExecutorService POOL = Executors.newFixedThreadPool(8);

    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired PlatformTransactionManager transactionManager;
    @MockitoSpyBean VersionWriteGuard writeGuard;
    final ObjectMapper om = new ObjectMapper();
    final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();

    @AfterAll
    static void shutdown() {
        POOL.shutdownNow();
    }

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : KEY;
    }

    JsonNode call(String service, String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", service), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/json").header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user).header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(http.send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    JsonNode erd(String action, Map<String, Object> params) throws Exception {
        return call("erdEdit", action, "owner", params);
    }

    private void reg(String modelId, String moduleId, String schema) throws Exception {
        JsonNode r = erd("reg", Map.of("modelId", modelId, "moduleId", moduleId, "schemaName", schema, "modelName", modelId));
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
    }

    private JsonNode addTable(String modelId, long baseRev, String id, String phys) throws Exception {
        return erd("save", Map.of("modelId", modelId, "baseRev", baseRev, "session", "ui-" + id, "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"" + id + "\",\"phys\":\"" + phys + "\",\"logical\":\"에이\"}]"));
    }

    private long rev(String modelId) {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = ?", Long.class, modelId);
    }

    /**
     * 풀 2개 중 1개를 시험이 쥔다. 저장·복원·작업 중 표시가 요청당 연결 하나로 끝나면 남은 하나로 성공하고, 두 개를 쥐려 하면
     * 연결 대기 상한(3초) 뒤 S001 이다.
     */
    @Test
    void saveAndRestoreFitInOneConnection() throws Exception {
        reg("m1", "mcm", "MCMAPUSER");
        try (Connection held = dataSource.getConnection()) {
            assertThat(held.isValid(2)).isTrue();
            long t0 = System.nanoTime();
            JsonNode saved = addTable("m1", 0, "t-1", "TB_A");
            long saveMs = (System.nanoTime() - t0) / 1_000_000;
            System.out.println("[deferred27] 연결 1개 남은 풀에서 save " + saveMs + "ms: " + saved.at("/meta"));
            assertThat(saved.at("/meta/success").asBoolean()).as(saved.toString()).isTrue();
            assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
            t0 = System.nanoTime();
            JsonNode restored = erd("restore", Map.of("modelId", "m1", "rev", 1, "session", "ui-owner", "source", "UI"));
            long restoreMs = (System.nanoTime() - t0) / 1_000_000;
            System.out.println("[deferred27] 연결 1개 남은 풀에서 restore " + restoreMs + "ms: " + restored.at("/meta"));
            assertThat(restored.at("/meta/success").asBoolean()).as(restored.toString()).isTrue();
            assertThat(restored.at("/data/result/applied").asBoolean()).as(restored.toString()).isTrue();
            // 작업 중 표시도 OASIS 연결 하나로 쓴다(예전에는 자동 커밋 연결을 하나 더 받았다).
            JsonNode claimed = erd("execute", Map.of("modelId", "m1", "kind", "CLAIM", "tableId", "t-1", "session", "s-a"));
            assertThat(claimed.at("/data/result/ok").asBoolean()).as(claimed.toString()).isTrue();
            JsonNode released = erd("execute", Map.of("modelId", "m1", "kind", "RELEASE", "tableId", "t-1", "session", "s-a"));
            assertThat(released.at("/data/result/ok").asBoolean()).as(released.toString()).isTrue();
        }
        assertThat(rev("m1")).isEqualTo(2);
    }

    /**
     * 풀 크기(2)의 두 배인 저장 4건(두 모델, 같은 모델 둘씩)과 다른 MDM 화면 조회 1건을 한꺼번에 보낸다.
     * 모두 연결 대기 상한 안에 성공해야 하고, rev 는 모델마다 저장 수만큼 오른다.
     */
    @Test
    void burstOfSavesAndUnrelatedReadDoNotStall() throws Exception {
        reg("m1", "mcm", "MCMAPUSER");
        reg("m2", "mdm", "MDMAPUSER");
        JsonNode read = call("unitMng", "search", "viewer", Map.of());
        assertThat(read.at("/meta/success").asBoolean()).as("다른 화면 조회 단독: %s", read).isTrue();
        // 데우기 — 첫 저장의 사전 적재·Hibernate 준비가 동시 구간에 섞이지 않게.
        assertThat(addTable("m1", 0, "t-0", "TB_W").at("/data/result/applied").asBoolean()).isTrue();

        CountDownLatch go = new CountDownLatch(1);
        List<Callable<JsonNode>> calls = List.of(
                () -> addTable("m1", 1, "t-1", "TB_A"),
                () -> addTable("m1", 1, "t-2", "TB_B"),
                () -> addTable("m2", 0, "t-1", "TB_A"),
                () -> addTable("m2", 0, "t-2", "TB_B"),
                () -> {
                    Thread.sleep(300); // 저장들이 연결을 잡은 뒤에 들어가게
                    return call("unitMng", "search", "viewer", Map.of());
                });
        List<Future<JsonNode>> futures = new ArrayList<>();
        List<long[]> times = new ArrayList<>();
        for (Callable<JsonNode> c : calls) {
            long[] ms = new long[1];
            times.add(ms);
            futures.add(POOL.submit(() -> {
                go.await();
                long t0 = System.nanoTime();
                try {
                    return c.call();
                } finally {
                    ms[0] = (System.nanoTime() - t0) / 1_000_000;
                }
            }));
        }
        go.countDown();
        List<JsonNode> results = new ArrayList<>();
        for (Future<JsonNode> f : futures) results.add(f.get(60, TimeUnit.SECONDS));
        for (int i = 0; i < results.size(); i++) {
            System.out.println("[deferred27] 동시 요청 " + i + " " + times.get(i)[0] + "ms: " + results.get(i).at("/meta"));
        }
        for (int i = 0; i < 4; i++) {
            JsonNode r = results.get(i);
            assertThat(r.at("/meta/success").asBoolean()).as("저장 %d: %s", i, r).isTrue();
            assertThat(r.at("/data/result/applied").asBoolean()).as("저장 %d: %s", i, r).isTrue();
        }
        assertThat(results.get(4).at("/meta/success").asBoolean()).as("다른 화면 조회: %s", results.get(4)).isTrue();
        assertThat(rev("m1")).isEqualTo(3);
        assertThat(rev("m2")).isEqualTo(2);
    }

    /**
     * 모델 명령을 쓴 뒤 다이어그램 명령이 거절되는 묶음(OASIS 경유). 거절은 성공 응답에 rejection 을 담고, 앞서 쓴 모델 JSON·
     * row_version·다이어그램·rev 는 하나도 남지 않는다. 같은 기준 rev 로 다시 보내면 적용된다(잠금이 남지 않았다).
     */
    @Test
    void mixedBatchDiagramRejectionLeavesNothing() throws Exception {
        reg("m1", "mcm", "MCMAPUSER");
        String json0 = jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'm1'", String.class);
        long rv0 = jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'm1'", Long.class);
        JsonNode r = erd("save", Map.of("modelId", "m1", "baseRev", 0, "session", "ui-owner", "source", "UI", "commandsJson", """
                [{"op":"addTable","audit":false,"id":"t-1","phys":"TB_A","logical":"에이"},
                 {"op":"addDiagram","id":"d-1","areaName":"a","diagramName":"b"},
                 {"op":"moveNodes","diagram":"d-1","nodes":[{"table":"t-1","x":1,"y":1}]}]"""));
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        assertThat(r.at("/data/result/applied").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.at("/data/result/rejection/commandIndex").asInt()).as(r.toString()).isEqualTo(2);
        assertThat(rev("m1")).isZero();
        assertThat(jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'm1'", String.class))
                .isEqualTo(json0);
        assertThat(jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'm1'", Long.class))
                .isEqualTo(rv0);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE ERD_MODEL_ID = 'm1'", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'm1'", Integer.class)).isZero();
        JsonNode ok = addTable("m1", 0, "t-1", "TB_A");
        assertThat(ok.at("/data/result/applied").asBoolean()).as(ok.toString()).isTrue();
        assertThat(rev("m1")).isEqualTo(1);
    }

    /**
     * 권한 검사를 지난 뒤 공통 가드가 MDM003 을 던지는 경합(사이에 소유자가 바뀜). 가드는 자기 TransactionTemplate 안에서 던지므로 OASIS
     * 트랜잭션이 rollback-only 가 된다 — 거절(성공 응답)로 돌려주면 커밋이 S001 이므로 업무 오류 MDM003 으로 나가고 아무것도 남지 않는다.
     */
    @Test
    void guardRaceInsideOasisIsBusinessErrorNotS001() throws Exception {
        reg("m1", "mcm", "MCMAPUSER");
        doAnswer(inv -> new TransactionTemplate(transactionManager).execute(s -> {
            throw MdmErrors.of(MdmErrorCode.NOT_DRAFT_OWNER);
        })).when(writeGuard).beginDraftWrite(any(), anyLong(), eq("owner"));
        JsonNode r = addTable("m1", 0, "t-1", "TB_A");
        assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isFalse();
        assertThat(r.at("/meta/code").asText()).as(r.toString()).isEqualTo("MDM003");
        assertThat(rev("m1")).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'm1'", Integer.class)).isZero();
    }

    /** 가져오기도 OASIS 연결 하나로 끝난다(메타 읽기·관계 추정·사전 적재·쓰기 모두). */
    @Test
    void importFitsInOneConnection() throws Exception {
        reg("mdm", "mdm", "MDMAPUSER");
        try (Connection held = dataSource.getConnection()) {
            assertThat(held.isValid(2)).isTrue();
            long t0 = System.nanoTime();
            JsonNode r = erd("import", Map.of("modelId", "mdm", "kind", "FROM_DB", "baseRev", 0, "session", "ui-owner", "source", "UI"));
            System.out.println("[deferred27] 연결 1개 남은 풀에서 import " + (System.nanoTime() - t0) / 1_000_000 + "ms: " + r.at("/meta"));
            assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
            assertThat(r.at("/data/result/applied").asBoolean()).as(r.toString()).isTrue();
        }
        assertThat(rev("mdm")).isEqualTo(1);
    }

    /** SSE 를 열고 "이벤트|data" 를 큐로 모은다(ErdStreamTest 와 같은 방식). */
    BlockingQueue<String> open(String modelId, String session, long sinceRev) {
        BlockingQueue<String> q = new LinkedBlockingQueue<>();
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/" + modelId + "?session=" + session
                        + "&sinceRev=" + sinceRev))
                .header("X-Client-Key", effectiveClientKey()).header("X-Authenticated-User", "u-" + session)
                .header("X-Authenticated-Role", "MDM_STEWARD").header("Accept", "text/event-stream").GET().build();
        HttpClient.newHttpClient().sendAsync(req, HttpResponse.BodyHandlers.ofInputStream()).thenAccept(res -> {
            try (var br = new BufferedReader(new InputStreamReader(res.body()))) {
                String line, event = "message";
                while ((line = br.readLine()) != null) {
                    if (line.startsWith("event:")) event = line.substring(6).trim();
                    else if (line.startsWith("data:")) { q.add(event + "|" + line.substring(5).trim()); event = "message"; }
                }
            } catch (Exception ignored) {
            }
        });
        return q;
    }

    /** 큐에서 change 이벤트의 rev 를 받은 순서대로 want 개 모은다(10초 상한). 빠짐·겹침·순서를 함께 본다. */
    List<Long> changeRevs(BlockingQueue<String> q, int want) throws Exception {
        List<Long> revs = new ArrayList<>();
        long until = System.currentTimeMillis() + 10_000;
        while (revs.size() < want && System.currentTimeMillis() < until) {
            String e = q.poll(200, TimeUnit.MILLISECONDS);
            if (e != null && e.startsWith("change|")) revs.add(om.readTree(e.substring("change|".length())).get("rev").asLong());
        }
        return revs;
    }

    /** 구독 2개가 붙은 모델에 풀 두 배의 저장을 한꺼번에 — 모두 성공하고, 두 구독 모두 모든 rev 를 순서대로 한 번씩 받는다. */
    @Test
    void burstWithTwoOpenStreamsDeliversEveryRevToBoth() throws Exception {
        reg("m1", "mcm", "MCMAPUSER");
        assertThat(addTable("m1", 0, "t-0", "TB_W").at("/data/result/applied").asBoolean()).isTrue();
        BlockingQueue<String> a = open("m1", "a", 1);
        BlockingQueue<String> b = open("m1", "b", 1);
        for (BlockingQueue<String> q : List.of(a, b)) {
            String first = q.poll(10, TimeUnit.SECONDS);
            assertThat(first).as("구독이 열려야 한다").isNotNull();
        }
        CountDownLatch go = new CountDownLatch(1);
        List<Future<JsonNode>> futures = new ArrayList<>();
        for (int i = 1; i <= 4; i++) {
            int n = i;
            futures.add(POOL.submit(() -> {
                go.await();
                return addTable("m1", 1, "t-" + n, "TB_S" + n);
            }));
        }
        go.countDown();
        for (Future<JsonNode> f : futures) {
            JsonNode r = f.get(60, TimeUnit.SECONDS);
            assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
            assertThat(r.at("/data/result/applied").asBoolean()).as(r.toString()).isTrue();
        }
        assertThat(rev("m1")).isEqualTo(5);
        assertThat(changeRevs(a, 4)).containsExactly(2L, 3L, 4L, 5L);
        assertThat(changeRevs(b, 4)).containsExactly(2L, 3L, 4L, 5L);
    }
}
