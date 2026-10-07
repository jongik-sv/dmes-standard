package com.dongkuk.dmes.mdm.dmc.codeConfirm;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeConfirmCheck;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.ApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-06-05 design.md §3.2 HT1~HT3 — BPMN {@code services/dmc/codeConfirm.bpmn} 까지 태우는 HTTP 시험
 * ({@code CodeCateEditOasisHttpTest} 골격 복제). 사용자는 요청 헤더(kim, MDM_STEWARD)로 정해지므로 {@code MasterCodeTestConfig}
 * 를 import 하지 않고 시계만 둔다. {@code confirm} 은 2-2 경고가 나는 픽스처로 돌려 JSON boolean
 * {@code warningsAcknowledged} 바인딩을 증명한다(false 면 MDM014, true 면 확정).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + CodeConfirmOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
@Import(CodeConfirmOasisHttpTest.ClockOnly.class)
class CodeConfirmOasisHttpTest extends AbstractMdmSharedDbTest {

    static final String TEST_CLIENT_KEY = "mdm-dmc-confirm-test-client-key";

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockOnly {
        @Bean
        @Primary
        MutableClock codeConfirmHttpClock() {
            return new MutableClock(MdmClockConfig.KST, MasterCodeTestConfig.SAMPLE_DAY);
        }
    }

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    ApplicationContext applicationContext;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    /** W — 1.001 DRAFT 에 B 추가 + 빈 카테고리 EMPTYC(2-2 경고). N — 1.001 DRAFT 에 바뀐 행 없음(4항 거부). */
    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        MasterCodeFixtures fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        for (String id : List.of("W", "N")) {
            fx.seedCode(id, "시험 코드 " + id, "MDM", 0);
            fx.seedVersion(id, "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
            fx.seedVersion(id, "1.001", "DRAFT", "kim", null, null, 0);
            fx.seedItem(id, "A", "1.000", OPEN, "에이", null, 1, null);
            fx.seedCate(id, "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
        }
        fx.seedItem("W", "B", "1.001", OPEN, "비", null, 2, null);
        fx.seedCate("W", "EMPTYC", "1.000", OPEN, "빈 카테고리", "REGEX", "Z.*", "CODE");
    }

    private String draftState(String id) {
        return jdbc.queryForObject("SELECT STATUS || '|' || NVL(TO_CHAR(APPLY_FROM, 'YYYY-MM-DD HH24:MI:SS'), '-') || '|' || ROW_VERSION "
                + "FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = ? AND VER > 1.0005", String.class, id)
                + " / " + jdbc.queryForObject("SELECT TO_CHAR(APPLY_TO, 'YYYY-MM-DD HH24:MI:SS') FROM TB_MDM_CODE_VER "
                + "WHERE MARU_CODE_ID = ? AND VER < 1.0005",
                String.class, id);
    }

    @Test
    void HT1_search_view_validate_confirm_성공_봉투() throws Exception {
        JsonNode search = post("search", envelope(json.createObjectNode()));
        JsonNode view = post("view", envelope(json.createObjectNode().put("maruCodeId", "W")));
        JsonNode validate = post("validate", envelope(json.createObjectNode()
                .put("maruCodeId", "W").put("ver", "1.001").put("applyFrom", "2026-02-01 00:00:00")));

        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        assertEquals("N", search.path("data").path("result").path("rows").path(0).path("maruCodeId").asText());
        assertEquals("1.001", search.path("data").path("result").path("rows").path(1).path("ver").asText());
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals("1.001", view.path("data").path("result").path("version").path("ver").asText());
        assertEquals("ITEM:B", view.path("data").path("result").path("diff").path(0).path("key").asText());
        assertTrue(validate.path("meta").path("success").asBoolean(false), validate.toString());
        assertEquals(10, validate.path("data").path("result").path("rows").size());
        assertEquals(1, validate.path("data").path("result").path("warnedCount").asInt(), validate.toString());

        JsonNode unacked = post("confirm", confirmBody("W", false));
        assertFalse(unacked.path("meta").path("success").asBoolean(true), unacked.toString());
        assertEquals("DRAFT|-|0 / 9999-12-31 00:00:00", draftState("W"));

        JsonNode confirmed = post("confirm", confirmBody("W", true));
        assertTrue(confirmed.path("meta").path("success").asBoolean(false), confirmed.toString());
        JsonNode result = confirmed.path("data").path("result");
        assertEquals("1.001", result.path("confirmed").path("ver").asText());
        assertEquals(1, result.path("confirmed").path("rowVersion").asLong());
        assertEquals("1.000", result.path("closedPreviousVer").asText());
        assertEquals("CATEGORY_EMPTY", result.path("warnings").path(0).path("code").asText(), result.toString());
        assertEquals("RELEASED", result.path("version").path("status").asText());
        assertEquals(1, result.path("version").path("rowVersion").asLong());
        assertEquals("kim", result.path("version").path("requestedBy").asText(), result.toString());
        assertEquals("RELEASED|2026-02-01 00:00:00|1 / 2026-02-01 00:00:00", draftState("W"));
    }

    @Test
    void HT2_MDM010_으로_실패하면_봉투가_실패이고_DRAFT_가_그대로다() throws Exception {
        String before = draftState("N");

        JsonNode body = post("confirm", confirmBody("N", true));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText("")
                .contains(MdmErrorCode.CONFIRM_CHECK_FAILED.defaultMessage()), body.toString());
        assertEquals(before, draftState("N"));
    }

    @Test
    void HT3_MASTER_CODE_확정_검사_SPI_빈은_MasterCodeConfirmCheck_하나다() {
        List<VersionConfirmCheckSpi> masterCode = applicationContext.getBeansOfType(VersionConfirmCheckSpi.class).values()
                .stream().filter(spi -> spi.target() == VersionTarget.MASTER_CODE).toList();

        assertEquals(1, masterCode.size(), masterCode.toString());
        assertInstanceOf(MasterCodeConfirmCheck.class, masterCode.get(0));
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private ObjectNode confirmBody(String id, boolean ack) {
        return envelope(json.createObjectNode().put("maruCodeId", id).put("ver", "1.001").put("rowVersion", 0)
                .put("applyFrom", "2026-02-01 00:00:00").put("warningsAcknowledged", ack));
    }

    private ObjectNode envelope(ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "codeConfirm");
        body.set("params", params);
        return body;
    }

    private JsonNode post(String action, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/codeConfirm/" + action))
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
