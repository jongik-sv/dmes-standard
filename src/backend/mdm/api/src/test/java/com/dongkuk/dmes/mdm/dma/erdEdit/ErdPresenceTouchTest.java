package com.dongkuk.dmes.mdm.dma.erdEdit;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdCommandService;
import com.dongkuk.dmes.mdm.dma.erdEdit.service.ErdVersionService;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdEventHub;
import com.dongkuk.dmes.mdm.dma.erdEdit.stream.ErdPresence;
import com.fasterxml.jackson.databind.JsonNode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** MCP·CLI 시한 접속자(S2-11). MCP 는 SSE 를 구독하지 않으므로 요청이 접속자 항목을 만들거나 늘리고, 600초 뒤 핑 주기가 지운다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + ErdPresenceTouchTest.KEY)
@ActiveProfiles("local")
class ErdPresenceTouchTest extends AbstractMdmSharedDbTest {

    static final String KEY = "erd-presence-key";
    @LocalServerPort int port;
    @Autowired JdbcTemplate jdbc;
    @Autowired ErdVersionService versions;
    @Autowired ErdCommandService commands;
    @Autowired ErdEventHub hub;
    ErdTestClient c;

    @BeforeEach
    void clean() {
        for (String t : List.of("TB_MDM_ERD_CLAIM", "TB_MDM_ERD_DIAGRAM_NODE", "TB_MDM_ERD_DIAGRAM", "TB_MDM_ERD_CMD_LOG",
                "TB_MDM_ERD_EDITOR", "TB_MDM_ERD_MODEL_VER", "TB_MDM_ERD_MODEL")) jdbc.update("DELETE FROM " + t);
        versions.createModel("mcm", "mcm", "MCMAPUSER", "MCM", "owner");
        c = new ErdTestClient(port, KEY);
        hub.sweepPresence(Instant.now().plusSeconds(3600)); // 앞 시험이 남긴 시한 항목을 지운다
    }

    ErdPresence presence(String session) {
        return hub.presence("mcm").stream().filter(p -> p.session().equals(session)).findFirst().orElse(null);
    }

    /** Review Focus 4. */
    @Test
    void mcpWriteAppearsInPresenceAndExpires() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"}]"));
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        var q = c.open("mcm", "ui-a", 1, "owner");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "ui-a") != null);
        JsonNode saved = c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-1a2b3c4d",
                "source", "MCP", "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"메모\"}}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        JsonNode list = c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-1a2b3c4d") != null);
        JsonNode e = ErdTestClient.entry(list, "claude-1a2b3c4d");
        assertThat(e.path("source").asText()).isEqualTo("MCP");
        assertThat(e.path("userId").asText()).isEqualTo("erd-mcp-a");
        assertThat(e.path("selectedTables").toString()).isEqualTo("[\"t-1\"]");
        assertThat(Duration.between(Instant.parse(e.path("at").asText()), Instant.parse(e.path("expiresAt").asText())))
                .isEqualTo(Duration.ofSeconds(600));
        assertThat(ErdTestClient.nullish(ErdTestClient.entry(list, "ui-a").path("expiresAt"))).isTrue(); // SSE 항목은 만료가 없다
        // 600초가 지난 뒤의 핑 주기: 시한 항목만 지우고 다시 방송한다
        hub.sweepPresence(Instant.now().plusSeconds(601));
        c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-1a2b3c4d") == null && ErdTestClient.entry(l, "ui-a") != null);
        assertThat(presence("claude-1a2b3c4d")).isNull();
        assertThat(presence("ui-a")).isNotNull();
        // 지울 것이 없으면 방송하지 않는다
        hub.sweepPresence(Instant.now().plusSeconds(601));
        c.assertNone(q, "presence", 700);
    }

    @Test
    void readsExtendAndClaimsShapeSelectedTables() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addTable\",\"id\":\"t-2\",\"phys\":\"TB_B\",\"logical\":\"비\"}]"));
        Map<String, Object> read = Map.of("modelId", "mcm", "session", "claude-r", "source", "MCP");
        c.call("view", "erd-mcp-a", read);
        ErdPresence first = presence("claude-r");
        assertThat(first).isNotNull();
        assertThat(first.source()).isEqualTo("MCP");
        assertThat(first.selectedTables()).isEmpty();
        assertThat(first.expiresAt()).isNotNull();
        // UI 출처는 시한 항목을 만들지 않는다(SSE 구독이 접속자를 만든다)
        c.call("view", "owner", Map.of("modelId", "mcm", "session", "ui-x", "source", "UI"));
        assertThat(presence("ui-x")).isNull();
        // 작업 중 표시는 그 세션의 표를 넣는다
        JsonNode claim = c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "CLAIM", "tableId", "t-2",
                "session", "claude-r", "source", "MCP"));
        assertThat(claim.at("/data/result/ok").asBoolean()).as(claim.toString()).isTrue();
        assertThat(presence("claude-r").selectedTables()).containsExactly("t-2");
        // 읽기는 표 목록을 바꾸지 않고 만료만 늘린다
        Thread.sleep(1100);
        c.call("view", "erd-mcp-a", read);
        ErdPresence later = presence("claude-r");
        assertThat(later.selectedTables()).containsExactly("t-2");
        assertThat(Instant.parse(later.expiresAt())).isAfter(Instant.parse(first.expiresAt()));
        // 해제하면 빠진다
        c.call("execute", "erd-mcp-a", Map.of("modelId", "mcm", "kind", "RELEASE", "tableId", "t-2", "session", "claude-r",
                "source", "MCP"));
        assertThat(presence("claude-r").selectedTables()).isEmpty();
        // SSE 로 붙은 세션이면 시한 항목을 만들지 않는다
        var q = c.open("mcm", "claude-s", 1, "erd-mcp-b");
        c.next(q, "presence", l -> ErdTestClient.entry(l, "claude-s") != null);
        c.call("view", "erd-mcp-b", Map.of("modelId", "mcm", "session", "claude-s", "source", "MCP"));
        assertThat(presence("claude-s").expiresAt()).isNull();
        // 시험 실행은 접속자 표시를 바꾸지 않는다
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-d", "source", "MCP", "dryRun", true,
                "commandsJson", "[{\"op\":\"updateTable\",\"id\":\"t-1\",\"set\":{\"comment\":\"메모\"}}]"));
        assertThat(presence("claude-d")).isNull();
    }

    /** deferred 25: 키·관계·컬럼 삭제처럼 표 델타가 없는 변경도 그 표를 접속자 표시에 넣는다(엔진 touchedTables). */
    @Test
    void mcpKeyChangeTouchesItsTable() throws Exception {
        commands.apply("mcm", 0, "owner", "ui-owner", "UI", c.cmd("[{\"op\":\"addTable\",\"id\":\"t-1\",\"phys\":\"TB_A\",\"logical\":\"에이\"},"
                + "{\"op\":\"addColumn\",\"id\":\"c-1\",\"table\":\"t-1\",\"phys\":\"COL_A\",\"logical\":\"가\",\"dataType\":\"VARCHAR2\",\"length\":10}]"));
        versions.addEditor("mcm", "erd-mcp-a", "owner");
        JsonNode saved = c.call("save", "erd-mcp-a", Map.of("modelId", "mcm", "baseRev", 1, "session", "claude-k", "source", "MCP",
                "commandsJson", "[{\"op\":\"addKey\",\"id\":\"k-1\",\"table\":\"t-1\",\"kind\":\"UK\",\"name\":\"UX_TB_A_1\",\"columns\":[\"c-1\"]}]"));
        assertThat(saved.at("/data/result/applied").asBoolean()).as(saved.toString()).isTrue();
        ErdTestClient.await(() -> presence("claude-k") != null, "시한 항목이 생기지 않았다");
        assertThat(presence("claude-k").selectedTables()).containsExactly("t-1");
    }
}
