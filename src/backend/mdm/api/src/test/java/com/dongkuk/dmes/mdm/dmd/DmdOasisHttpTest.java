package com.dongkuk.dmes.mdm.dmd;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.segment.DataItemMessages;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
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
 * TSK-07-03 design.md §3.2 T-A(A2·A4) — BPMN 까지 태우는 HTTP 왕복(DmaOasisHttpTest 패턴).
 *
 * <p>BPMN serviceTask 안에서 던진 예외는 HTTP 200 + {@code meta.success=false} + {@code meta.message} 로만 온다(F12).
 * 화면은 이 message 의 접두어·포함으로 충돌·닫힌 키를 판정한다(A2). 결과는 {@code data.result} 에 온다(output 누락 방지).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + DmdOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class DmdOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dmd-test-client-key";
    private static final String STEWARD = "MDM_STEWARD";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + tempDir.resolve("mdm-dmd-http-test.db"));
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE");
        jdbc.update("DELETE FROM TB_MDM_DATA_ITEM");
        jdbc.update("DELETE FROM TB_MDM_DATA");
        jdbc.update("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, CODE_PATTERN, ATTR01_NAME, "
                + "LVL_CNT, LAST_CHG_SEQ, CHG_SEQ, VER) VALUES ('PORT', '항구', 'INUSE', 'MDM', '^[0-9A-Z]{1,20}$', '국가', 1, 0, 0, 0)");
        jdbc.update("INSERT INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, VALID_TO, CATE_NAME, DEF_KIND, DEF_EXPR, "
                + "DEF_TARGET, CHG_SEQ, VER) VALUES ('PORT', 'BASE', '2026-01-01 00:00:00', '9999-12-31 00:00:00', '전체', "
                + "'REGEX', '.*', 'KEY', 0, 0)");
    }

    @Test
    void A4_등록_조회_수정_닫기_다시_열기_왕복과_결과는_data_result_에_온다() throws Exception {
        JsonNode view = post("dataItemMng", "view", params().put("maruDataId", "PORT"));
        assertSuccess(view);
        assertEquals(1, view.path("data").path("result").path("header").path("lvlCnt").asInt(), view.toString());
        assertEquals("국가", view.path("data").path("result").path("header").path("attrLabels").get(0).path("label").asText());

        JsonNode reg = post("dataItemMng", "reg", params().put("maruDataId", "PORT").put("code", "KRPUS").put("name", "부산")
                .put("lvl1", "KR").put("attr01", "KR"));
        assertSuccess(reg);
        assertEquals("INSERT", reg.path("data").path("result").path("action").asText(), reg.toString());
        assertEquals("KRPUS", reg.path("data").path("result").path("row").path("code").asText());
        assertTrue(reg.path("data").path("result").path("row").path("open").asBoolean(), reg.toString());

        JsonNode search = post("dataItemMng", "search", params().put("maruDataId", "PORT"));
        assertSuccess(search);
        assertEquals(1, search.path("data").path("result").path("list").size(), search.toString());
        assertEquals(1, search.path("data").path("result").path("totalCount").asInt());

        // null 필드를 빼고 보낸 save(A4 — FE omitNullish).
        JsonNode save = post("dataItemMng", "save", params().put("maruDataId", "PORT").put("code", "KRPUS")
                .put("name", "부산항").put("expectedRowVersion", 0));
        assertSuccess(save);
        assertEquals("UPDATE", save.path("data").path("result").path("action").asText(), save.toString());
        assertEquals(1, save.path("data").path("result").path("row").path("rowVersion").asInt());

        JsonNode close = post("dataItemMng", "delete", params().put("maruDataId", "PORT").put("code", "KRPUS")
                .put("expectedRowVersion", 1));
        assertSuccess(close);
        assertEquals("CLOSE", close.path("data").path("result").path("action").asText());

        JsonNode restore = post("dataItemMng", "restore", params().put("maruDataId", "PORT").put("code", "KRPUS")
                .put("expectedRowVersion", 2));
        assertSuccess(restore);
        assertEquals("REOPEN", restore.path("data").path("result").path("action").asText());

        JsonNode history = post("dataHistory", "search", params().put("maruDataId", "PORT").put("target", "ITEM")
                .put("key", "KRPUS"));
        assertSuccess(history);
        assertEquals(3, history.path("data").path("result").path("rows").size(), history.toString());
        assertEquals("REOPENED", history.path("data").path("result").path("rows").get(2).path("event").asText());
        assertEquals("OPEN", history.path("data").path("result").path("state").asText());
    }

    @Test
    void A2_오래된_row_version_의_save_는_충돌_문구로_시작한다() throws Exception {
        assertSuccess(post("dataItemMng", "reg", params().put("maruDataId", "PORT").put("code", "KRINC").put("name", "인천")));
        assertSuccess(post("dataItemMng", "save", params().put("maruDataId", "PORT").put("code", "KRINC").put("name", "B")
                .put("expectedRowVersion", 0)));

        JsonNode stale = post("dataItemMng", "save", params().put("maruDataId", "PORT").put("code", "KRINC").put("name", "A")
                .put("expectedRowVersion", 0));

        assertFalse(stale.path("meta").path("success").asBoolean(true), stale.toString());
        assertTrue(stale.path("meta").path("message").asText().startsWith(
                MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()), stale.toString());
    }

    @Test
    void A2_닫힌_키_reg_는_다시_열기_안내가_meta_message_에_온다() throws Exception {
        assertSuccess(post("dataItemMng", "reg", params().put("maruDataId", "PORT").put("code", "CNSHA").put("name", "상하이")));
        assertSuccess(post("dataItemMng", "delete", params().put("maruDataId", "PORT").put("code", "CNSHA")
                .put("expectedRowVersion", 0)));

        JsonNode again = post("dataItemMng", "reg", params().put("maruDataId", "PORT").put("code", "CNSHA").put("name", "x"));

        assertFalse(again.path("meta").path("success").asBoolean(true), again.toString());
        assertTrue(again.path("meta").path("message").asText().contains(DataItemMessages.CLOSED_KEY_REOPEN), again.toString());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE CODE = 'CNSHA'", Integer.class));
    }

    @Test
    void H3_이력_조회_키_없음은_거부_문구가_meta_message_에_온다() throws Exception {
        JsonNode body = post("dataHistory", "search", params().put("maruDataId", "PORT").put("target", "ITEM"));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().contains(DataItemMessages.KEY_REQUIRED), body.toString());
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private ObjectNode params() {
        return json.createObjectNode();
    }

    private static void assertSuccess(JsonNode body) {
        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
    }

    private JsonNode post(String service, String action, ObjectNode params) throws IOException, InterruptedException {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", service);
        body.set("params", params);
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "steward")
                .header("X-Authenticated-Role", STEWARD)
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
