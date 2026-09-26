package com.dongkuk.dmes.mdm.dme.ruleConfirm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmCheck;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-05 design §3.2 「RuleConfirmOasisHttpTest」 HT1~HT3 — BPMN {@code services/dme/ruleConfirm.bpmn} 까지 태우는 HTTP 시험
 * ({@code DmeOasisHttpTest}·{@code CodeConfirmOasisHttpTest} 골격 복제). 사용자·역할은 헤더(kim, MDM_STEWARD) → 실제 경로로 정해지고 시계는 운영
 * 시계다. 확정은 OASIS 트랜잭션 안에서 SPI 검사가 룰·버전을 관리 엔티티로 읽은 뒤 공통 서비스가 네이티브로 바꾸는 경로라, 응답이 확정 뒤 원장
 * 값을 싣는지(I22a)는 이 시험만 잡는다. 샘플 정의의 NULL_GAP 경고로 {@code warningsAcknowledged} 불리언 바인딩을 증명한다(false 면 MDM014).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + RuleConfirmOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class RuleConfirmOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dme-confirm-test-client-key";
    private static final String Q = "QLTY_GRD_JDG";
    private static final String FIRST = "FIRST_JDG";
    /** Q_ROW1 에서 COIL_THK 범위를 거꾸로 — 저장 시 검사 ERROR(MDM010). */
    private static final String BROKEN_ROW1 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"2.5\",\"right\":\"1.6\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    ApplicationContext applicationContext;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-confirm-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    /** Q — VER 1 RELEASED + VER 2 DRAFT(kim). FIRST_JDG — CREATED, VER 1 DRAFT(kim, 최초 버전). 정의는 둘 다 06 샘플. */
    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, Q, 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, Q, 2);
        DmeTestSupport.rule(jdbc, FIRST, "최초 판정", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, FIRST, 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.sampleDefinition(jdbc, FIRST, 1);
    }

    private String draftState(String id, int ver) {
        return jdbc.queryForObject("SELECT STATUS || '|' || COALESCE(APPLY_FROM, '-') || '|' || ROW_VERSION FROM TB_MDM_RULE_VER "
                + "WHERE MARU_RULE_ID = ? AND VER = ?", String.class, id, ver)
                + " / " + jdbc.queryForList("SELECT APPLY_TO FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER < ?", String.class, id, ver);
    }

    @Test
    void HT1_search_view_validate_confirm_성공_봉투와_확정_뒤_원장_값() throws Exception {
        JsonNode search = post("search", envelope(json.createObjectNode()));
        JsonNode view = post("view", envelope(json.createObjectNode().put("maruRuleId", Q)));
        JsonNode validate = post("validate", envelope(json.createObjectNode()
                .put("maruRuleId", FIRST).put("ver", 1).put("applyFrom", "2026-01-01 00:00:00")));

        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        JsonNode rows = search.path("data").path("result").path("rows");
        assertEquals(FIRST, rows.path(0).path("maruRuleId").asText(), search.toString());
        assertEquals(2, rows.path(1).path("ver").asInt(), search.toString());
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals(2, view.path("data").path("result").path("version").path("ver").asInt(), view.toString());
        assertEquals(1, view.path("data").path("result").path("previous").path("ver").asInt(), view.toString());
        assertEquals(4, view.path("data").path("result").path("diffCounts").path("SAME").asInt(), view.toString());
        assertTrue(validate.path("meta").path("success").asBoolean(false), validate.toString());
        assertEquals(4, validate.path("data").path("result").path("items").size(), validate.toString());
        assertEquals("EXEMPT", validate.path("data").path("result").path("applyFromCheck").path("status").asText(), validate.toString());
        assertEquals(0, validate.path("data").path("result").path("rejectedCount").asInt(), validate.toString());

        JsonNode unacked = post("confirm", confirmBody(FIRST, 1, "2026-01-01 00:00:00", false));
        assertFalse(unacked.path("meta").path("success").asBoolean(true), unacked.toString());
        assertTrue(unacked.path("meta").path("message").asText("")
                .contains(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.defaultMessage()), unacked.toString());
        assertEquals("DRAFT|-|0 / []", draftState(FIRST, 1));

        JsonNode confirmed = post("confirm", confirmBody(FIRST, 1, "2026-01-01 00:00:00", true));
        assertTrue(confirmed.path("meta").path("success").asBoolean(false), confirmed.toString());
        JsonNode result = confirmed.path("data").path("result");
        assertEquals(1, result.path("confirmed").path("ver").asInt(), result.toString());
        assertEquals(1, result.path("confirmed").path("rowVersion").asLong());
        assertTrue(result.path("closedPreviousVer").isNull(), result.toString());
        assertEquals("NULL_GAP", result.path("warnings").path(0).path("code").asText(), result.toString());
        assertEquals("RELEASED", result.path("version").path("status").asText(), "I22a — 확정 뒤 원장 값: " + result);
        assertEquals("2026-01-01 00:00:00", result.path("version").path("applyFrom").asText(), result.toString());
        assertEquals(1, result.path("version").path("rowVersion").asLong(), result.toString());
        assertEquals("kim", result.path("version").path("requestedBy").asText(), result.toString());
        assertEquals("INUSE", result.path("rule").path("status").asText(), "I22a — 과거 apply_from 으로 최초 확정하면 INUSE: " + result);
        assertEquals("RELEASED|2026-01-01 00:00:00|1 / []", draftState(FIRST, 1));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", String.class, FIRST));
    }

    @Test
    void HT2_MDM010_으로_실패하면_봉투가_실패이고_DRAFT_가_그대로다() throws Exception {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);
        String before = draftState(Q, 2);

        JsonNode body = post("confirm", confirmBody(Q, 2, "2026-07-01 00:00:00", true));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText("")
                .contains(MdmErrorCode.CONFIRM_CHECK_FAILED.defaultMessage()), body.toString());
        assertEquals(before, draftState(Q, 2));
    }

    @Test
    void HT3_BUSINESS_RULE_확정_검사_SPI_빈은_RuleConfirmCheck_하나다() {
        List<VersionConfirmCheckSpi> rule = applicationContext.getBeansOfType(VersionConfirmCheckSpi.class).values()
                .stream().filter(spi -> spi.target() == VersionTarget.BUSINESS_RULE).toList();

        assertEquals(1, rule.size(), rule.toString());
        assertInstanceOf(RuleConfirmCheck.class, rule.get(0));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private ObjectNode confirmBody(String id, int ver, String applyFrom, boolean ack) {
        return envelope(json.createObjectNode().put("maruRuleId", id).put("ver", ver).put("rowVersion", 0)
                .put("applyFrom", applyFrom).put("warningsAcknowledged", ack));
    }

    private ObjectNode envelope(ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "ruleConfirm");
        body.set("params", params);
        return body;
    }

    private JsonNode post(String action, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/ruleConfirm/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "kim")
                .header("X-Authenticated-Role", "MDM_STEWARD")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
