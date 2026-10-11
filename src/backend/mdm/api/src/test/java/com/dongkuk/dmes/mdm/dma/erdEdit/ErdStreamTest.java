package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionStateService;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.*;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStreamTest.KEY)
@ActiveProfiles("local")
class ErdStreamTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-test-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    @Autowired ErdModelStore store;
    @Autowired VersionStateService stateService;
    final ObjectMapper om = new ObjectMapper();

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
    }

    /** SSE 를 열고 data 줄을 큐로 모은다. "event:이름|data" 형식으로 넣는다. */
    BlockingQueue<String> open(String session, long sinceRev) {
        BlockingQueue<String> q = new LinkedBlockingQueue<>();
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/mcm?session=" + session + "&sinceRev=" + sinceRev))
                .header("X-Client-Key", KEY).header("X-Authenticated-User", "u-" + session)
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

    String next(BlockingQueue<String> q, String event) throws InterruptedException {
        long until = System.currentTimeMillis() + 10_000;
        while (System.currentTimeMillis() < until) {
            String s = q.poll(500, TimeUnit.MILLISECONDS);
            if (s != null && s.startsWith(event + "|")) return s.substring(event.length() + 1);
        }
        throw new AssertionError(event + " 이벤트가 오지 않았습니다");
    }

    List<com.fasterxml.jackson.databind.JsonNode> cmd(String json) throws Exception {
        List<com.fasterxml.jackson.databind.JsonNode> out = new ArrayList<>();
        om.readTree(json).forEach(out::add);
        return out;
    }

    @Test
    void twoSubscribersReceiveSameDelta() throws Exception {
        var a = open("a", 0);
        var b = open("b", 0);
        next(a, "presence");
        next(b, "presence");
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(om.readTree(next(a, "change")).get("rev").asLong()).isEqualTo(1);
        assertThat(om.readTree(next(b, "change")).get("rev").asLong()).isEqualTo(1);
    }

    @Test
    void reconnectReplaysMissedDeltas() throws Exception {
        for (int i = 0; i < 3; i++) commands.apply("mcm", i, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A" + i + "\",\"logical\":\"x\"}]"));
        var q = open("late", 1);
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(2);
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(3);
    }

    @Test
    void reconnectTooFarSendsReload() throws Exception {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL SET REV = 9999 WHERE ERD_MODEL_ID='mcm'");
        var q = open("late", 1);
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(9999);
    }

    @Test
    void presenceListsSessionsWithView() throws Exception {
        var a = open("a", 0);
        next(a, "presence");
        var b = open("claude-b", 0);
        String p = next(a, "presence");
        assertThat(p).contains("claude-b");
    }

    @Test
    void setViewThroughViewActionBroadcastsPresence() throws Exception {
        var a = open("a", 0);
        next(a, "presence");
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", Map.of(
                "modelId", "mcm", "kind", "SET_VIEW", "session", "a",
                "viewJson", "{\"diagramId\":\"d-9\",\"selectedTables\":[\"t-1\"]}")));
        // 단계 1 S1: 읽기 액션 view 로 보낸다. 모델 소유자·공동 편집자가 아닌 사용자(u-a)다.
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/view"))
                .header("Content-Type", "application/json").header("X-Client-Key", KEY).header("X-Authenticated-User", "u-a")
                .header("X-Authenticated-Role", "MDM_STEWARD").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        var res = om.readTree(HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).body());
        assertThat(res.at("/meta/success").asBoolean()).as(res.toString()).isTrue();
        assertThat(res.at("/data/result/ok").asBoolean()).as(res.toString()).isTrue();
        String p = next(a, "presence");
        assertThat(p).contains("d-9").contains("t-1");
    }

    @Test
    void claimByOtherSessionWarnsButDoesNotBlock() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "owner", 600)).isTrue();
        assertThat(hub.claim("mcm", "t-1", "ui-owner", "owner", 600)).isFalse(); // 유효한 표시는 빼앗지 않는다
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "ui-owner", "UI",
                cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"c\"}}]"));
        assertThat(r.applied()).isTrue();
        assertThat(r.warnings()).extracting(ErdWarning::code).contains("CLAIMED");
        // B3(스펙 4.5): 경고는 작업 중인 세션과 만료 시각을 필드로 싣는다(문구도 그대로 둔다).
        ErdWarning w = r.warnings().stream().filter(x -> x.code().equals("CLAIMED")).findFirst().orElseThrow();
        assertThat(w.claimedBy()).isEqualTo("claude-b");
        assertThat(w.expiresAt()).isNotBlank();
        assertThat(java.time.Instant.parse(w.expiresAt())).isAfter(java.time.Instant.now());
        assertThat(w.message()).contains("claude-b");
        hub.release("mcm", "t-1", "claude-b");
        assertThat(hub.claims("mcm")).isEmpty();
    }

    @Test
    void missingModelIs404() throws Exception {
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/mdm/erd/stream/nope?session=a&sinceRev=0"))
                .header("X-Client-Key", KEY).header("X-Authenticated-User", "u-a")
                .header("X-Authenticated-Role", "MDM_STEWARD").header("Accept", "text/event-stream").GET().build();
        var res = HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString());
        assertThat(res.statusCode()).isEqualTo(404);
        assertThat(res.headers().firstValue("Content-Type").orElse("")).doesNotContain("event-stream");
    }

    /** 재생이 명령 기록을 읽은 뒤 잠금을 잡기 전에 멈춘 사이에 커밋된 델타는 pending 에 쌓였다가 한 번씩, 순서대로 나간다. */
    @Test
    void deltaCommittedDuringReplayWindowIsDeliveredOnceInOrder() throws Exception {
        for (int i = 0; i < 2; i++) commands.apply("mcm", i, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A" + i + "\",\"logical\":\"x\"}]"));
        CountDownLatch reached = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        hub.setReplayPauseForTest(() -> {
            reached.countDown();
            try {
                release.await(10, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        });
        try {
            var q = open("win", 0);
            assertThat(reached.await(10, TimeUnit.SECONDS)).isTrue();   // 기록은 rev 2 까지 읽었다
            commands.apply("mcm", 2, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A2\",\"logical\":\"x\"}]")); // 3 은 pending
            release.countDown();
            for (long rev = 1; rev <= 3; rev++) assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(rev);
            long until = System.currentTimeMillis() + 1500;              // 겹쳐 오는 델타가 없어야 한다
            while (System.currentTimeMillis() < until) {
                String s = q.poll(200, TimeUnit.MILLISECONDS);
                assertThat(s == null || !s.startsWith("change|")).as("중복 델타: %s", s).isTrue();
            }
        } finally {
            hub.setReplayPauseForTest(null);
            release.countDown();
        }
    }

    // ---- 최종 검토 B2·B4 ----

    private void deleteDraft() {
        var d = store.draft("mcm").orElseThrow();
        stateService.deleteDraft(new VersionRef(VersionTarget.ERD_MODEL, "mcm", d.getVer()), d.getRowVersion(), "owner");
    }

    private void released() {
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00'");
    }

    /** B2: 붙어 있는 구독자는 DRAFT 삭제 커밋 뒤 reload{rev} 를 받는다. */
    @Test
    void draftDeleteSendsReloadToSubscribers() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                     // rev 1 (표시)
        commands.apply("mcm", 1, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]")); // rev 2
        var q = open("a", 2);
        next(q, "presence");
        deleteDraft();                                                                                    // rev 3 (표시)
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(3);
    }

    /** B2: 표시를 건너 다시 붙으면 재생 대신 reload 하나. */
    @Test
    void replayAcrossDraftDeleteSendsReload() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");                                                     // rev 1 (표시)
        commands.apply("mcm", 1, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]")); // rev 2
        deleteDraft();                                                                                    // rev 3 (표시)
        var q = open("late", 2);
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(3);
    }

    /** B2: 새 DRAFT(copy)도 붙어 있는 구독자에게 reload, 표시 뒤의 명령은 다시 change 로 온다. */
    @Test
    void newVersionSendsReloadThenChangesResume() throws Exception {
        released();
        var q = open("a", 0);
        next(q, "presence");
        versions.newVersion("mcm", "MINOR", "owner");
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(1);
        commands.apply("mcm", 1, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(2);
    }

    /** B4: sinceRev 없이(새로) 붙으면 첫 이벤트가 hello{rev} 다. */
    @Test
    void freshSubscribeSendsHelloFirst() throws Exception {
        commands.apply("mcm", 0, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_A\",\"logical\":\"x\"}]"));
        var q = open("fresh", -1);
        String first = q.poll(10, TimeUnit.SECONDS);
        assertThat(first).as("첫 이벤트").isNotNull().startsWith("hello|");
        assertThat(om.readTree(first.substring("hello|".length())).get("rev").asLong()).isEqualTo(1);
        commands.apply("mcm", 1, "owner", "ui", "UI", cmd("[{\"op\":\"addTable\",\"audit\":false,\"phys\":\"TB_B\",\"logical\":\"x\"}]"));
        assertThat(om.readTree(next(q, "change")).get("rev").asLong()).isEqualTo(2);
    }

    /** B2: 새 DRAFT 표시를 건너 다시 붙으면 재생 대신 reload 하나. */
    @Test
    void replayAcrossNewVersionSendsReload() throws Exception {
        released();
        versions.newVersion("mcm", "MINOR", "owner");
        var q = open("late", 0);
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(1);
    }

    com.fasterxml.jackson.databind.JsonNode oasis(String action, String user, Map<String, Object> params) throws Exception {
        String body = om.writeValueAsString(Map.of("meta", Map.of("menuId", "erdEdit"), "params", params));
        var req = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/erdEdit/" + action))
                .header("Content-Type", "application/json").header("X-Client-Key", KEY).header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", "MDM_STEWARD").POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return om.readTree(HttpClient.newHttpClient().send(req, HttpResponse.BodyHandlers.ofString()).body());
    }

    /** M3: OASIS 바깥 트랜잭션을 거친 copy·delete 도 커밋 뒤 구독자에게 reload{rev} 가 간다. */
    @Test
    void oasisCopyAndDeleteSendReloadAfterCommit() throws Exception {
        released();
        var q = open("a", 0);
        next(q, "presence");
        var copy = oasis("copy", "owner", Map.of("modelId", "mcm", "verKind", "MINOR"));
        assertThat(copy.at("/data/result/ver").asText()).as(copy.toString()).isEqualTo("1.001");
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(1);
        var d = store.draft("mcm").orElseThrow();
        var del = oasis("delete", "owner", Map.of("modelId", "mcm", "ver", "1.001", "rowVersion", d.getRowVersion()));
        assertThat(del.at("/data/result/ok").asBoolean()).as(del.toString()).isTrue();
        assertThat(om.readTree(next(q, "reload")).get("rev").asLong()).isEqualTo(2);
    }
}
