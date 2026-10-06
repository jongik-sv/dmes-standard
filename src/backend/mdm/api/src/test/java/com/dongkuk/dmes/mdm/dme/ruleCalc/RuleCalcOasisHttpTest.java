package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

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
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.SpringBootTest.WebEnvironment;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * {@code ruleCalc} 를 BPMN({@code services/dme/ruleCalc.bpmn})까지 태우는 HTTP 시험 — OASIS 파라미터 바인딩(중첩 {@code values} 객체·JSON 숫자),
 * action 분기 {@code io}·{@code run}, 응답 키가 {@code data.result} 아래로 나오는지 확인한다. 역할·사용자는 헤더 → {@code ClientKeyFilter} →
 * {@code CactusMdmCurrentUser} 실제 경로로 준다({@code DmeOasisHttpTest} 형식).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + RuleCalcOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class RuleCalcOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-rule-calc-test-client-key";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-calc-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
    }

    private ObjectNode envelope(String targetTp, String targetId) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "ruleCalc");
        body.putObject("params").put("targetTp", targetTp).put("targetId", targetId);
        return body;
    }

    private JsonNode post(String action, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/ruleCalc/" + action))
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

    @Test
    void io_는_BPMN_을_거쳐_data_result_로_입력_칸을_돌려준다() throws Exception {
        JsonNode res = post("io", envelope("RULE", "QLTY_GRD_JDG"));

        assertTrue(res.path("meta").path("success").asBoolean(false), res.toString());
        JsonNode result = res.path("data").path("result");
        assertTrue(result.path("ok").asBoolean(false), res.toString());
        assertEquals("QLTY_GRD_JDG", result.path("target").path("id").asText());
        assertEquals("COIL_THK", result.path("inputs").path(0).path("name").asText(), res.toString());
        assertEquals("NUMBER", result.path("inputs").path(0).path("dataType").asText());
        assertEquals(2, result.path("inputs").path(0).path("scale").asInt());
        assertEquals(3, result.path("inputs").size(), "COIL_THK·COIL_WID·SURF_GRD 세 칸");
        assertEquals("PRC_FCT", result.path("outputs").path(1).path("name").asText(), res.toString());
    }

    @Test
    void run_은_valuesJson_의_JSON_숫자와_글자_숫자를_받아_계산한다() throws Exception {
        // 문서의 중첩 values 객체는 OASIS 요청 변환기(params 는 flat key-value)가 받지 못한다 — valuesJson 글자로 보낸다(RuleCalcRequest 주석).
        ObjectNode body = envelope("RULE", "QLTY_GRD_JDG");
        ((ObjectNode) body.path("params")).put("valuesJson", "{\"COIL_THK\":2.1,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}");

        JsonNode res = post("run", body);

        assertTrue(res.path("meta").path("success").asBoolean(false), res.toString());
        JsonNode result = res.path("data").path("result");
        assertTrue(result.path("ok").asBoolean(false), res.toString());
        assertEquals("A", result.path("result").path("QLTY_GRD").asText(), res.toString());
        assertEquals("1.05", result.path("result").path("PRC_FCT").asText(), res.toString());
        assertEquals("2.1", result.path("steps").path(0).path("inputs").path("COIL_THK").asText(), "JSON 소수는 문자열 2.1 로 읽힌다");
        assertTrue(result.path("steps").path(0).path("hit").asBoolean(false));
    }

    @Test
    void 확정_버전이_없거나_입력이_비어도_HTTP_오류가_아니라_messages_다() throws Exception {
        JsonNode missing = post("run", envelope("RULE", "QLTY_GRD_JDG"));
        assertTrue(missing.path("meta").path("success").asBoolean(false), missing.toString());
        assertFalse(missing.path("data").path("result").path("ok").asBoolean(true));
        assertEquals("INPUT_MISSING", missing.path("data").path("result").path("messages").path(0).path("code").asText(), missing.toString());

        JsonNode notFound = post("io", envelope("SET", "NO_SUCH_SET"));
        assertTrue(notFound.path("meta").path("success").asBoolean(false), notFound.toString());
        assertEquals("NOT_FOUND", notFound.path("data").path("result").path("messages").path(0).path("code").asText(), notFound.toString());
    }
}
