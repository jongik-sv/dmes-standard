package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * OASIS serviceTask → {@code ruleSetRunner.execute} 경로(계획 Task 11, ADR 0005, 편차 D11). 테스트 자원 BPMN
 * {@code services/probe/ruleSetRunProbe.bpmn} 을 HTTP 로 태운다 — 운영 BPMN 은 1단계에서 더하지 않는다. 골격은 {@code DmeOasisHttpTest} 와 같다
 * (역할·사용자는 헤더 → {@code ClientKeyFilter}). BPMN 안 예외는 HTTP 200 + {@code meta.success=false} + {@code meta.message} 다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + RuleSetRunnerOasisTest.CLIENT_KEY)
@ActiveProfiles("local")
class RuleSetRunnerOasisTest extends AbstractMdmSharedDbTest {

    static final String CLIENT_KEY = "mdm-rule-set-runner-test-client-key";
    private static final String STEWARD = "MDM_STEWARD";

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
    }

    @Test
    void OASIS_serviceTask_가_ruleSetRunner_를_불러_세트를_판정한다() throws Exception {
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_LINE")
                .put("recordJson", "{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}")
                .put("evalTs", "2026-03-01 09:00:00")));

        assertTrue(r.path("meta").path("success").asBoolean(false), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals("RS_LINE", result.path("setId").asText(), r.toString());
        assertEquals("2026-03-01 09:00:00", result.path("evalTs").asText(), r.toString());
        assertEquals("A", result.path("finalValues").path("QLTY_GRD").asText(), r.toString());
        assertEquals("r1", result.path("path").path(1).path("nodeId").asText(), r.toString());
        assertTrue(result.path("warnings").isArray() && result.path("warnings").isEmpty(), r.toString());
    }

    @Test
    void 폐기_룰이_든_세트는_판정하고_응답에_경고를_싣는다() throws Exception {
        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_LINE")
                .put("recordJson", "{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}")
                .put("evalTs", "2026-03-01 09:00:00")));

        assertTrue(r.path("meta").path("success").asBoolean(false), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals("A", result.path("finalValues").path("QLTY_GRD").asText(), r.toString());
        assertEquals(1, result.path("warnings").size(), r.toString());
        assertEquals("RULE_DEPRECATED", result.path("warnings").path(0).path("code").asText(), r.toString());
        assertEquals("QLTY_GRD_JDG", result.path("warnings").path(0).path("ruleId").asText(), r.toString());
    }

    @Test
    void 판정_오류는_OASIS_실패_응답의_문구가_된다() throws Exception {
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_LINE").put("recordJson", "{\"COIL_THK\":2.0}")));

        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        assertTrue(r.path("meta").path("message").asText().contains("COIL_WID"), r.toString());
    }

    /** P-D9 — 저장된 정의가 깨졌으면 OASIS 실패 응답의 문구가 MDM026 기본 문구로 시작한다(입력 오류 MDM021 이 아니다). */
    @Test
    void 저장값_손상은_MDM026_문구로_실패한다() throws Exception {
        DmeTestSupport.ruleSet(jdbc, "RS_BROKEN", "깨진 흐름", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_BROKEN", "{\"version\":1}");
        JsonNode r = post("ruleSetRunProbe", "run", "kim", envelope("ruleSetRunProbe", json.createObjectNode()
                .put("setId", "RS_BROKEN").put("recordJson", "{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}")));

        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        String message = r.path("meta").path("message").asText();
        assertTrue(message.startsWith(MdmErrorCode.STORED_DEFINITION_CORRUPT.defaultMessage()), message);
        assertTrue(message.contains("RS_BROKEN"), message);
    }

    private ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    private JsonNode post(String service, String action, String user, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", STEWARD)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : CLIENT_KEY;
    }
}
