package com.dongkuk.dmes.mdm.dma.erdEdit;

import static com.dongkuk.dmes.mdm.dma.erdEdit.ErdTestClient.nullish;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.dto.ErdApplyResult;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdDelta;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 단계 2 서버 계약(README 인터페이스 정본) — rowVersion, dryRun, byUserId, CLAIM 응답, SSE version.
 * dryRun 은 두 경로를 본다: HTTP(OASIS 트랜잭션에 합류 → savepoint)와 서비스 직접 호출(새 트랜잭션 → rollback-only).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdStage2ContractTest.KEY)
@ActiveProfiles("local")
class ErdStage2ContractTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-s2-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    ErdTestClient c;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM_ROUTE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        c = new ErdTestClient(port, KEY);
    }

    long rev() {
        return jdbc.queryForObject("SELECT REV FROM TB_MDM_ERD_MODEL WHERE ERD_MODEL_ID = 'mcm'", Long.class);
    }

    long rowVersion() {
        return jdbc.queryForObject("SELECT ROW_VERSION FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", Long.class);
    }

    int logCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_CMD_LOG WHERE ERD_MODEL_ID = 'mcm'", Integer.class);
    }

    String modelJson() {
        return jdbc.queryForObject("SELECT MODEL_JSON FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'", String.class);
    }

    /** owner 가 t-1(TB_A) 을 만들고(rev 1, 세션 s-o) kim 을 공동 편집자로 넣은 뒤, kim 이 논리명을 바꾼다(rev 2, 세션 s-k). */
    void seedPeerEdit() throws Exception {
        assertThat(commands.apply("mcm", 0, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]")).applied()).isTrue();
        versions.addEditor("mcm", "kim", "owner");
        assertThat(commands.apply("mcm", 1, "kim", "s-k", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"비\"}}]")).applied()).isTrue();
    }

    @Test
    void saveRestoreAndChangeCarryRowVersion() throws Exception {
        var q = c.open("mcm", "ui-a", 0, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-a") != null);       // 구독이 살아 있다
        JsonNode res = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 0, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]")).at("/data/result");
        assertThat(res.path("applied").asBoolean()).as(res.toString()).isTrue();
        assertThat(res.path("dryRun").asBoolean()).isFalse();
        assertThat(res.path("rowVersion").asLong()).isEqualTo(rowVersion());
        JsonNode change = c.next(q, "change", d -> d.path("rev").asLong() == 1);
        assertThat(change.path("rowVersion").asLong()).isEqualTo(rowVersion());
        // 다이어그램 명령만 있는 묶음은 ROW_VERSION 을 올리지 않는다 → null
        long before = rowVersion();
        JsonNode diag = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 1, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"addDiagram\",\"id\":\"d-s2-1\",\"areaName\":\"a\",\"diagramName\":\"b\"}]")).at("/data/result");
        assertThat(diag.path("applied").asBoolean()).as(diag.toString()).isTrue();
        assertThat(nullish(diag.path("rowVersion"))).as(diag.toString()).isTrue();
        assertThat(rowVersion()).isEqualTo(before);
        assertThat(nullish(c.next(q, "change", d -> d.path("rev").asLong() == 2).path("rowVersion"))).isTrue();
        // 되돌리기도 같은 규칙
        JsonNode undone = c.call("restore", "owner", Map.of("modelId", "mcm", "rev", 1, "session", "s-o", "source", "UI"))
                .at("/data/result");
        assertThat(undone.path("applied").asBoolean()).as(undone.toString()).isTrue();
        assertThat(undone.path("rowVersion").asLong()).isEqualTo(before + 1).isEqualTo(rowVersion());
        // 재전송·getChangesSince 의 델타는 rowVersion 이 없다(S2-16)
        JsonNode since = c.call("view", "owner", Map.of("modelId", "mcm", "sinceRev", 0)).at("/data/result");
        assertThat(since.path("deltas").size()).isEqualTo(3);
        assertThat(nullish(since.at("/deltas/0/rowVersion"))).as(since.toString()).isTrue();
    }

    /** Review Focus 3. CONFLICT 가 날 묶음과 통과할 묶음 모두 rev·명령 기록·ROW_VERSION·SSE·접속자가 그대로다. */
    @Test
    void dryRunRollsBackWithoutLogOrEvent() throws Exception {
        seedPeerEdit();                                                                            // rev 2
        List<ErdDelta> published = new CopyOnWriteArrayList<>();
        Runnable off = hub.addListenerForTest("mcm", published::add);
        try {
            long rev = rev();
            long rv = rowVersion();
            int logs = logCount();
            String json = modelJson();
            // 1) HTTP — OASIS 트랜잭션에 합류해 savepoint 로 되돌린다
            JsonNode conflict = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-d1",
                    "source", "MCP", "dryRun", true,
                    "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]")).at("/data/result");
            assertThat(conflict.path("dryRun").asBoolean()).as(conflict.toString()).isTrue();
            assertThat(conflict.path("applied").asBoolean()).isFalse();
            assertThat(conflict.path("rev").asLong()).isEqualTo(rev);
            assertThat(conflict.at("/rejection/code").asText()).isEqualTo("CONFLICT");
            assertThat(conflict.at("/rejection/byUserId").asText()).isEqualTo("kim");
            JsonNode pass = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 2, "session", "claude-d1",
                    "source", "MCP", "dryRun", true, "commandsJson",
                    "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"설명\"}},"
                            + "{\"op\":\"addDiagram\",\"id\":\"d-s2-2\",\"areaName\":\"a\",\"diagramName\":\"b\"}]")).at("/data/result");
            assertThat(pass.path("dryRun").asBoolean()).as(pass.toString()).isTrue();
            assertThat(pass.path("applied").asBoolean()).isFalse();
            assertThat(nullish(pass.path("rejection"))).isTrue();
            assertThat(nullish(pass.path("rowVersion"))).isTrue();
            assertThat(pass.path("rev").asLong()).isEqualTo(rev);
            assertThat(pass.path("changes").size()).isGreaterThanOrEqualTo(2);                  // 표 변경 + 다이어그램
            JsonNode undo = c.call("restore", "owner", Map.of("modelId", "mcm", "rev", 2, "session", "claude-d1",
                    "source", "MCP", "dryRun", true)).at("/data/result");
            assertThat(undo.path("dryRun").asBoolean()).as(undo.toString()).isTrue();
            assertThat(nullish(undo.path("rejection"))).as(undo.toString()).isTrue();
            // 2) 서비스 직접 호출 — 새 트랜잭션이라 rollback-only 로 되돌린다
            ErdApplyResult direct = commands.apply("mcm", 1, "owner", "s-o", "UI",
                    c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]"), true);
            assertThat(direct.dryRun()).isTrue();
            assertThat(direct.rejection().code()).isEqualTo("CONFLICT");
            assertThat(direct.rejection().byUserId()).isEqualTo("kim");
            ErdApplyResult directPass = commands.apply("mcm", 2, "owner", "s-o", "UI",
                    c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"설명\"}}]"), true);
            assertThat(directPass.rejection()).isNull();
            assertThat(directPass.applied()).isFalse();
            assertThat(directPass.rowVersion()).isNull();
            assertThat(directPass.rev()).isEqualTo(rev);
            ErdApplyResult directUndo = commands.undo("mcm", 2, "owner", "s-o", "UI", true);
            assertThat(directUndo.dryRun()).isTrue();
            assertThat(directUndo.rejection()).isNull();
            // 아무것도 바뀌지 않았다
            assertThat(rev()).isEqualTo(rev);
            assertThat(rowVersion()).isEqualTo(rv);
            assertThat(logCount()).isEqualTo(logs);
            assertThat(modelJson()).isEqualTo(json);
            assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_ERD_DIAGRAM WHERE DIAGRAM_ID = 'd-s2-2'", Integer.class)).isZero();
            Thread.sleep(500);
            assertThat(published).as("dryRun 은 델타를 발행하지 않는다").isEmpty();
            assertThat(hub.presence("mcm")).extracting(ErdPresence::session).doesNotContain("claude-d1");
        } finally {
            off.run();
        }
    }

    @Test
    void conflictAndNotFoundCarryByUserId() throws Exception {
        seedPeerEdit();                                                                            // rev 2 = kim
        ErdApplyResult conflict = commands.apply("mcm", 1, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"logical\":\"씨\"}}]"));
        assertThat(conflict.rejection().code()).isEqualTo("CONFLICT");
        assertThat(conflict.rejection().byRev()).isEqualTo(2L);
        assertThat(conflict.rejection().bySession()).isEqualTo("s-k");
        assertThat(conflict.rejection().byUserId()).isEqualTo("kim");
        assertThat(commands.apply("mcm", 2, "kim", "s-k", "UI",
                c.cmd("[{\"op\":\"deleteTable\",\"id\":\"t-1\"}]")).applied()).isTrue();          // rev 3
        JsonNode gone = c.call("save", "owner", Map.of("modelId", "mcm", "baseRev", 2, "session", "s-o", "source", "UI",
                "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"c\"}}]")).at("/data/result/rejection");
        assertThat(gone.path("code").asText()).as(gone.toString()).isEqualTo("NOT_FOUND");
        assertThat(gone.path("byRev").asLong()).isEqualTo(3);
        assertThat(gone.path("byUserId").asText()).isEqualTo("kim");
        ErdApplyResult invalid = commands.apply("mcm", 3, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"updateTable\",\"id\":\"t-404\",\"set\":{\"comment\":\"c\"}}]"));
        assertThat(invalid.rejection().code()).isEqualTo("INVALID");
        assertThat(invalid.rejection().byUserId()).isNull();
    }

    @Test
    void claimResultNamesHolder() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        JsonNode a = c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-a", "source", "MCP")).at("/data/result");
        assertThat(a.path("ok").asBoolean()).as(a.toString()).isTrue();
        assertThat(a.path("claimedBy").asText()).isEqualTo("claude-a");
        assertThat(a.path("userId").asText()).isEqualTo("erd-mcp-a");
        Instant until = Instant.parse(a.path("expiresAt").asText());
        assertThat(Duration.between(Instant.now(), until).getSeconds()).isBetween(590L, 600L);
        JsonNode b = c.call("execute", "erd-mcp-b", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-b", "source", "MCP")).at("/data/result");
        assertThat(b.path("ok").asBoolean()).as(b.toString()).isFalse();
        assertThat(b.path("claimedBy").asText()).isEqualTo("claude-a");
        assertThat(b.path("userId").asText()).isEqualTo("erd-mcp-a");
        assertThat(b.path("expiresAt").asText()).isEqualTo(a.path("expiresAt").asText());
        c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "RELEASE", "tableId", "t-1", "session", "claude-a"));
        JsonNode again = c.call("execute", "erd-mcp-b", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-1",
                "session", "claude-b", "source", "MCP")).at("/data/result");
        assertThat(again.path("ok").asBoolean()).as(again.toString()).isTrue();
        assertThat(again.path("claimedBy").asText()).isEqualTo("claude-b");
    }

    /** import 는 dryRun 을 받지 않는다 — 종류와 상관없이 MDM021 이고 아무것도 쓰지 않는다. */
    @Test
    void importRejectsDryRun() throws Exception {
        long rev = rev();
        int logs = logCount();
        for (String kind : List.of("FROM_DB", "APPLY_DIFF")) {
            JsonNode r = c.call("import", "owner", Map.of("modelId", "mcm", "kind", kind, "baseRev", 0, "session", "s-o",
                    "source", "UI", "dryRun", true));
            assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isFalse();
            assertThat(r.at("/meta/code").asText()).as(r.toString()).isEqualTo("MDM021");
            assertThat(r.at("/meta/message").asText() + r).contains("dryRun");
        }
        assertThat(rev()).isEqualTo(rev);
        assertThat(logCount()).isEqualTo(logs);
    }

    /** S2-12. 구독 직후(재전송 뒤) SUBSCRIBE 하나, 동작마다 커밋 뒤 하나. 값은 그때 view 와 같고 rev·명령 기록은 그대로다. */
    @Test
    void versionEventsFollowLifecycle() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        var q = c.open("mcm", "ui-a", 0, "owner");
        List<String> head = c.until(q, "version");
        assertThat(head.stream().filter(s -> s.startsWith("change|")).count()).as(head.toString()).isEqualTo(1); // 재전송이 먼저
        JsonNode sub = c.om.readTree(head.get(head.size() - 1).substring("version|".length()));
        assertThat(sub.path("reason").asText()).isEqualTo("SUBSCRIBE");
        assertThat(sub.path("userId").asText()).isEqualTo("owner");
        assertSameAsView(sub);

        c.call("execute", "owner", Map.of("modelId", "mcm", "kind", "ADD_EDITOR", "userId", "kim"));
        JsonNode added = c.next(q, "version", v -> v.path("reason").asText().equals("ADD_EDITOR"));
        assertThat(added.path("editors").toString()).isEqualTo("[\"kim\"]");
        assertThat(added.path("userId").asText()).isEqualTo("owner");
        assertSameAsView(added);

        c.call("execute", "owner", Map.of("modelId", "mcm", "kind", "REMOVE_EDITOR", "userId", "kim"));
        JsonNode removed = c.next(q, "version", v -> v.path("reason").asText().equals("REMOVE_EDITOR"));
        assertThat(removed.path("editors").size()).as("deleteById 가 flush 전이어도 같은 트랜잭션에서 내보낸 뒤 읽는다").isZero();
        assertSameAsView(removed);

        JsonNode view = c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        String ver = view.path("ver").asText();
        JsonNode unlock = c.call("unlock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", view.path("rowVersion").asLong()));
        long rvUnlocked = unlock.at("/data/result/rowVersion").asLong();
        JsonNode unlocked = c.next(q, "version", v -> v.path("reason").asText().equals("UNLOCK"));
        assertThat(nullish(unlocked.path("ownerId"))).isTrue();
        assertThat(unlocked.path("rowVersion").asLong()).isEqualTo(rvUnlocked);
        assertSameAsView(unlocked);

        JsonNode lock = c.call("lock", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvUnlocked));
        long rvLocked = lock.at("/data/result/rowVersion").asLong();
        JsonNode locked = c.next(q, "version", v -> v.path("reason").asText().equals("LOCK"));
        assertThat(locked.path("ownerId").asText()).isEqualTo("owner");
        assertSameAsView(locked);

        // 넘기기는 시험 환경에서 MDM005(담당자 조회 어댑터 없음) — 실패한 동작은 version 을 내지 않는다
        JsonNode handover = c.call("handover", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvLocked, "newOwnerId", "lee"));
        assertThat(handover.at("/meta/code").asText()).as(handover.toString()).isEqualTo("MDM005");
        c.assertNone(q, "version", 700);

        // 확정: applyFrom 은 필수다(VersionRules.parseApplyFrom, yyyy-MM-dd HH:mm:ss)
        JsonNode confirm = c.call("confirm", "owner", Map.of("modelId", "mcm", "ver", ver, "rowVersion", rvLocked,
                "applyFrom", "2030-01-01 00:00:00", "warningsAcknowledged", true));
        assertThat(confirm.at("/data/result/ok").asBoolean()).as(confirm.toString()).isTrue();
        JsonNode confirmed = c.next(q, "version", v -> v.path("reason").asText().equals("CONFIRM"));
        assertThat(confirmed.path("status").asText()).isEqualTo("RELEASED");
        assertThat(confirmed.path("ver").asText()).isEqualTo(ver);
        assertSameAsView(confirmed);

        assertThat(rev()).as("버전 이벤트는 rev 를 올리지 않는다").isEqualTo(1);
        assertThat(logCount()).as("버전 이벤트는 명령 기록에 없다").isEqualTo(1);
    }

    /** compare(kind 없음)의 tokens 는 plain() 을 거친 일반 JSON 이다(README Jackson 규칙). 화면 ErdNameToken 모양과 같다. */
    @Test
    void compareTokensArePlainJson() throws Exception {
        JsonNode r = c.call("compare", "owner", Map.of("logical", "역할아이디")).at("/data/result");
        assertThat(r.path("tokens").isArray()).as(r.toString()).isTrue();
        JsonNode t = r.path("tokens").get(0);
        assertThat(t.path("seq").isInt()).as(t.toString()).isTrue();
        assertThat(t.path("surface").isTextual()).isTrue();
        assertThat(t.path("status").asText()).isIn("MATCHED", "SYNONYM", "AMBIGUOUS", "NO_ABBR", "UNKNOWN");
        assertThat(t.path("candidates").isArray()).isTrue();
        assertThat(r.path("physName").isTextual()).isTrue();
        assertThat(r.path("status").isTextual()).isTrue();
    }

    /** deferred 25: 표·컬럼 델타가 없는 변경(키)도 다른 세션이 작업 중인 표면 CLAIMED 경고를 붙인다. */
    @Test
    void claimedWarnsOnKeyChange() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"COL_A\",\"logical\":\"가\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "erd-mcp-b", 600)).isTrue();
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"addKey\",\"id\":\"k-1\",\"table\":\"t-1\",\"kind\":\"UK\",\"name\":\"UX_TB_A_1\",\"columns\":[\"c-1\"]}]"));
        assertThat(r.applied()).isTrue();
        assertThat(r.warnings()).filteredOn(w -> w.code().equals("CLAIMED"))
                .extracting(com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning::elementId).containsExactly("t-1");
    }

    /** 다이어그램 명령만 있는 묶음은 모델 요소를 건드리지 않으므로 다른 세션이 쥔 표여도 CLAIMED 경고가 없다. */
    @Test
    void claimedDoesNotWarnOnDiagramOnlyBatch() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addDiagram\",\"id\":\"d-1\",\"areaName\":\"a\",\"diagramName\":\"b\"},"
                + "{\"op\":\"placeTables\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-1\",\"x\":10,\"y\":10}]}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "erd-mcp-b", 600)).isTrue();
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "s-o", "UI",
                c.cmd("[{\"op\":\"moveNodes\",\"diagram\":\"d-1\",\"nodes\":[{\"table\":\"t-1\",\"x\":50,\"y\":60}]}]"));
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        assertThat(r.warnings()).filteredOn(w -> w.code().equals("CLAIMED")).isEmpty();
    }

    /** 컬럼 삭제도 그 표를 건드린 것으로 본다 — 지운 컬럼은 지우기 전 값의 table 로 센다(deferred 25). */
    @Test
    void claimedWarnsOnDeleteColumn() throws Exception {
        commands.apply("mcm", 0, "owner", "s-o", "UI", c.cmd("[{\"op\":\"addTable\",\"audit\":false,\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"COL_A\",\"logical\":\"가\",\"dataType\":\"VARCHAR2\",\"length\":10},"
                + "{\"op\":\"addColumn\",\"id\":\"c-2\",\"table\":\"t-1\",\"phys\":\"COL_B\",\"logical\":\"나\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        assertThat(hub.claim("mcm", "t-1", "claude-b", "erd-mcp-b", 600)).isTrue();
        ErdApplyResult r = commands.apply("mcm", 1, "owner", "s-o", "UI", c.cmd("[{\"op\":\"deleteColumn\",\"id\":\"c-2\"}]"));
        assertThat(r.applied()).as(String.valueOf(r.rejection())).isTrue();
        assertThat(r.warnings()).filteredOn(w -> w.code().equals("CLAIMED"))
                .extracting(com.dongkuk.dmes.mdm.dma.erdEdit.engine.ErdWarning::elementId).containsExactly("t-1");
    }

    /** 구독 직후 version 은 DRAFT 우선, 없으면 VER 숫자 순으로 가장 높은 RELEASED, 둘 다 없으면 보내지 않는다(view 는 MDM029). */
    @Test
    void subscribeVersionEventPrefersDraftThenHighestReleasedElseNone() throws Exception {
        // 버전 행은 모두 DRAFT 1.000 이 있을 때 넣는다(addVersion 이 DRAFT 의 JSON 을 복사한다)
        addVersion("2.000", "RELEASED");
        addVersion("9.000", "RELEASED");
        addVersion("10.000", "RELEASED");
        addVersion("11.000", "APPROVED");

        // B) DRAFT 1.000 과 더 높은 RELEASED 가 같이 있으면 DRAFT 다
        JsonNode draft = subscribeVersion("ver-b");
        assertThat(draft.path("ver").asText()).isEqualTo("1.000");
        assertThat(draft.path("status").asText()).isEqualTo("DRAFT");
        assertSameAsView(draft);

        // A) DRAFT 가 없으면 가장 높은 RELEASED — 문자열 순("9.000")이 아니라 숫자 순(10.000)이고 APPROVED 11.000 은 보지 않는다
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='RELEASED', APPLY_FROM=SYSTIMESTAMP - 1, APPLY_TO=TIMESTAMP '9999-12-31 00:00:00' "
                + "WHERE ERD_MODEL_ID='mcm' AND VER IN (1, 2)");
        JsonNode released = subscribeVersion("ver-a");
        assertThat(released.path("ver").asText()).isEqualTo("10.000");
        assertThat(released.path("status").asText()).isEqualTo("RELEASED");
        assertSameAsView(released);

        // C) DRAFT·RELEASED 가 없으면 version 을 보내지 않는다. presence 는 재전송·version 뒤에 나가므로 스트림이 살아 있다는 증거다
        jdbc.update("UPDATE TB_MDM_ERD_MODEL_VER SET STATUS='APPROVED' WHERE ERD_MODEL_ID='mcm'");
        var q = c.open("mcm", "ver-c", 0, "owner");
        List<String> head = c.until(q, "presence");
        assertThat(head).as(head.toString()).noneMatch(s -> s.startsWith("version|") || s.startsWith("reload|")
                || s.startsWith(ErdTestClient.END + "|"));
        assertThat(ErdTestClient.entry(c.om.readTree(head.get(head.size() - 1).substring("presence|".length())), "ver-c"))
                .as(head.toString()).isNotNull();
        c.assertNone(q, "version", 700);
        JsonNode view = c.call("view", "owner", Map.of("modelId", "mcm"));
        assertThat(view.at("/meta/code").asText()).as(view.toString()).isEqualTo("MDM029");
    }

    /** 편집자 목록은 USER_ID 순이고 그 버전 것만이다 — 동작 뒤 version·구독 직후 version·view 가 같다. */
    @Test
    void editorsAreOrderedByUserIdAndScopedToVersionInViewAndEvent() throws Exception {
        addVersion("0.500", "RELEASED");                                                           // 다른 버전의 편집자
        jdbc.update("INSERT INTO TB_MDM_ERD_EDITOR (ERD_MODEL_ID, VER, USER_ID) VALUES ('mcm', ?, 'zed')", new BigDecimal("0.500"));
        var q = c.open("mcm", "ed-a", 0, "owner");
        c.until(q, "version");                                                                     // SUBSCRIBE 는 건너뛴다

        for (String user : List.of("lee", "kim")) {
            JsonNode r = c.call("execute", "owner", Map.of("modelId", "mcm", "kind", "ADD_EDITOR", "userId", user));
            assertThat(r.at("/meta/success").asBoolean()).as(r.toString()).isTrue();
        }
        JsonNode first = c.next(q, "version", v -> v.path("reason").asText().equals("ADD_EDITOR"));
        assertThat(first.path("editors").toString()).isEqualTo("[\"lee\"]");
        JsonNode added = c.next(q, "version", v -> v.path("reason").asText().equals("ADD_EDITOR") && v.path("editors").size() == 2);
        assertThat(added.path("ver").asText()).isEqualTo("1.000");
        assertThat(added.path("editors").toString()).isEqualTo("[\"kim\",\"lee\"]");
        assertSameAsView(added);

        JsonNode view = c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        assertThat(view.path("editors").toString()).as(view.toString()).isEqualTo("[\"kim\",\"lee\"]");
        assertThat(subscribeVersion("ed-b").path("editors").toString()).isEqualTo("[\"kim\",\"lee\"]");
        JsonNode old = c.call("view", "owner", Map.of("modelId", "mcm", "ver", "0.500")).at("/data/result");
        assertThat(old.path("editors").toString()).as(old.toString()).isEqualTo("[\"zed\"]");
    }

    /** 새 세션으로 구독해 재전송 뒤 첫 version(SUBSCRIBE)을 받는다. */
    JsonNode subscribeVersion(String session) throws Exception {
        var q = c.open("mcm", session, 0, "owner");
        List<String> head = c.until(q, "version");
        JsonNode v = c.om.readTree(head.get(head.size() - 1).substring("version|".length()));
        assertThat(v.path("reason").asText()).as(v.toString()).isEqualTo("SUBSCRIBE");
        return v;
    }

    /** 버전 행 하나를 더한다(DRAFT 의 JSON·소유자 복사, ROW_VERSION 0). DRAFT 가 아니면 적용 기간이 있어야 한다(CK_TB_MDM_ERD_MODEL_VER_APPLY). */
    void addVersion(String ver, String status) {
        jdbc.update("""
                INSERT INTO TB_MDM_ERD_MODEL_VER (ERD_MODEL_ID, VER, VER_KIND, STATUS, OWNER_ID, APPLY_FROM, APPLY_TO, MODEL_JSON, ROW_VERSION)
                SELECT ERD_MODEL_ID, ?, 'MAJOR', ?, OWNER_ID, SYSTIMESTAMP - 1, TIMESTAMP '9999-12-31 00:00:00', MODEL_JSON, 0
                  FROM TB_MDM_ERD_MODEL_VER WHERE ERD_MODEL_ID = 'mcm' AND STATUS = 'DRAFT'""", new BigDecimal(ver), status);
    }

    void assertSameAsView(JsonNode ev) throws Exception {
        JsonNode v = c.call("view", "owner", Map.of("modelId", "mcm")).at("/data/result");
        assertThat(ev.path("modelId").asText()).isEqualTo("mcm");
        assertThat(ev.path("ver").asText()).isEqualTo(v.path("ver").asText());
        assertThat(ev.path("status").asText()).isEqualTo(v.path("status").asText());
        assertThat(ev.path("ownerId").asText(null)).isEqualTo(v.path("ownerId").asText(null));
        assertThat(ev.path("editors")).isEqualTo(v.path("editors"));
        assertThat(ev.path("rowVersion").asLong()).isEqualTo(v.path("rowVersion").asLong());
        assertThat(ev.path("at").asText()).isNotBlank();
    }
}
