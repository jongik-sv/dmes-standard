package com.dongkuk.dmes.mdm.dme;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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
 * TSK-08-02 design §3.1 「DmeOasisHttpTest」 — BPMN 까지 태우는 HTTP 파이프(DmaOasisHttpTest 형식). 역할·사용자는 헤더 →
 * {@code ClientKeyFilter} → {@code CactusMdmCurrentUser} 실제 경로로 준다. 수용 기준 4: 다른 담당자(lee)는 view 는 되고 표·헤더 저장·
 * DRAFT 삭제·해제·넘기기가 모두 MDM003 이다(BPMN 안 예외는 HTTP 200 + {@code meta.success=false} + {@code meta.message}).
 *
 * <p>표 저장의 행은 {@code params} 가 아니라 {@code grids.rows.rows} 로 보낸다(params 배열은 OASIS 가 받지 않는다). HEADER 는 grids 가
 * 없어도 된다(Build 실측, design 「Build 이탈 기록」 B4).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + DmeOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class DmeOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dme-test-client-key";
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
        Path dbFile = tempDir.resolve("mdm-dme-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.column(jdbc, "COIL_THK", DmeTestSupport.domain(jdbc, "COIL_THK_D", "QTY", "NUMBER", 2));
    }

    /** kim 이 등록(VER 1 DRAFT, 소유자 kim)하고 조건 1·결과 1 변수를 넣는다(열 편집 API 는 08-03 몫이라 JDBC 로 넣는다). */
    private void registerByKim() throws Exception {
        ObjectNode params = json.createObjectNode().put("maruRuleId", "HTTP_JDG").put("maruRuleName", "HTTP 판정").put("ruleKind", "DECISION");
        JsonNode reg = post("ruleMng", "reg", "kim", envelope("ruleMng", params));
        assertTrue(reg.path("meta").path("success").asBoolean(false), reg.toString());
        assertEquals(1, reg.path("data").path("result").path("ver").asInt(), reg.toString());
        DmeTestSupport.var(jdbc, "HTTP_JDG", 1, 1, "COND", "2", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "HTTP_JDG", 1, 2, "RESULT", "Value", "GRD", 1, "STRING");
    }

    private ObjectNode tableBody(long rowVersion) {
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "HTTP_JDG").put("ver", 1)
                .put("rowVersion", rowVersion).put("hitPolicy", "UNIQUE");
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("rowId", -1).put("rowKind", "NORMAL")
                .put("cells", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"val\":\"A\"}}").put("note", "첫 행");
        rows.addObject().put("rowId", -2).put("rowKind", "NORMAL").put("cells", "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"val\":\"B\"}}");
        return body;
    }

    private ObjectNode versionBody(long rowVersion) {
        return envelope("ruleEdit", json.createObjectNode().put("maruRuleId", "HTTP_JDG").put("ver", 1).put("rowVersion", rowVersion));
    }

    @Test
    void 등록자는_표를_저장하고_발급_번호와_서버_검사를_받는다() throws Exception {
        registerByKim();

        JsonNode save = post("ruleEdit", "save", "kim", tableBody(0));

        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        JsonNode result = save.path("data").path("result");
        assertEquals(1, result.path("rowVersion").asInt(), save.toString());
        assertEquals(1, result.path("rowIdMap").path("-1").asInt(), save.toString());
        assertEquals(2, result.path("rowIdMap").path("-2").asInt(), save.toString());
        assertEquals("NULL_GAP", result.path("issues").path(0).path("code").asText(), save.toString());
        assertEquals(2, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'HTTP_JDG'"));
        assertEquals("kim", jdbc.queryForObject("SELECT C_USR_ID FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'HTTP_JDG' AND ROW_ID = 1", String.class),
                "HTTP 경로에서는 감사 칼럼이 채워진다");

        JsonNode view = post("ruleEdit", "view", "kim", envelope("ruleEdit", json.createObjectNode().put("maruRuleId", "HTTP_JDG")));
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        JsonNode v = view.path("data").path("result");
        assertTrue(v.path("editable").asBoolean(false), view.toString());
        assertEquals("kim", v.path("me").asText());
        assertEquals("NUMBER", v.path("vars").path(0).path("dataType").asText(), view.toString());
        assertEquals(2, v.path("rows").size());
    }

    @Test
    void 다른_담당자는_읽기만_되고_쓰기는_모두_MDM003_이다() throws Exception {
        registerByKim();
        assertTrue(post("ruleEdit", "save", "kim", tableBody(0)).path("meta").path("success").asBoolean(false));

        JsonNode view = post("ruleEdit", "view", "lee", envelope("ruleEdit", json.createObjectNode().put("maruRuleId", "HTTP_JDG")));
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertFalse(view.path("data").path("result").path("editable").asBoolean(true), view.toString());
        assertFalse(view.path("data").path("result").path("headerEditable").asBoolean(true), view.toString());

        ObjectNode header = envelope("ruleEdit", json.createObjectNode().put("part", "HEADER").put("maruRuleId", "HTTP_JDG")
                .put("maruRuleName", "이가 바꿈"));
        ObjectNode delete = versionBody(1);
        ((ObjectNode) delete.path("params")).put("target", "VERSION");
        ObjectNode handover = versionBody(1);
        ((ObjectNode) handover.path("params")).put("newOwnerId", "lee");
        String[][] calls = {{"save", "TABLE"}, {"save", "HEADER"}, {"delete", ""}, {"unlock", ""}, {"handover", ""}};
        ObjectNode[] bodies = {tableBody(1), header, delete, versionBody(1), handover};
        for (int i = 0; i < calls.length; i++) {
            JsonNode body = post("ruleEdit", calls[i][0], "lee", bodies[i]);
            String label = calls[i][0] + " " + calls[i][1];
            assertFalse(body.path("meta").path("success").asBoolean(true), label + " " + body);
            assertTrue(body.path("meta").path("message").asText().startsWith(MdmErrorCode.NOT_DRAFT_OWNER.defaultMessage()),
                    label + " " + body);
        }
        assertEquals(1L, DmeTestSupport.rowVersion(jdbc, "HTTP_JDG", 1));
        assertEquals("HTTP 판정", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));
        assertEquals("kim", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));
    }

    @Test
    void 헤더_저장은_grids_없이_되고_해제_선점은_새_row_version_을_돌려준다() throws Exception {
        registerByKim();
        JsonNode header = post("ruleEdit", "save", "kim", envelope("ruleEdit", json.createObjectNode().put("part", "HEADER")
                .put("maruRuleId", "HTTP_JDG").put("maruRuleName", "HTTP 판정 바꿈")));
        assertTrue(header.path("meta").path("success").asBoolean(false), header.toString());
        assertEquals("HTTP 판정 바꿈", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));

        JsonNode unlock = post("ruleEdit", "unlock", "kim", versionBody(0));
        assertTrue(unlock.path("meta").path("success").asBoolean(false), unlock.toString());
        assertEquals(1, unlock.path("data").path("result").path("rowVersion").asInt(), unlock.toString());
        JsonNode lock = post("ruleEdit", "lock", "lee", versionBody(1));
        assertTrue(lock.path("meta").path("success").asBoolean(false), lock.toString());
        assertEquals(2, lock.path("data").path("result").path("rowVersion").asInt(), lock.toString());
        assertEquals("lee", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));

        JsonNode search = post("ruleEdit", "search", "lee", envelope("ruleEdit", json.createObjectNode().put("keyword", "HTTP")));
        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        assertEquals("HTTP_JDG", search.path("data").path("result").path("list").path(0).path("maruRuleId").asText(), search.toString());
        JsonNode copy = post("ruleEdit", "copy", "lee", versionBody(2));
        assertFalse(copy.path("meta").path("success").asBoolean(true), "미적용 버전이 있어 새 버전은 거부(MDM006): " + copy);
        assertTrue(copy.path("meta").path("message").asText().startsWith(MdmErrorCode.UNAPPLIED_VERSION_EXISTS.defaultMessage()), copy.toString());
    }

    /** TSK-08-03 — COLUMNS 저장의 배열(prioList)·boolean(deleted) 이 grids.rows.rows 안에서 바인딩되는지(B4 류 오류를 E2E 전에 잡는다). */
    @Test
    void 열_설정_COLUMNS_저장은_grids_rows_로_바인딩되어_반영된다() throws Exception {
        registerByKim();
        ObjectNode body = envelope("ruleEdit", json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "HTTP_JDG")
                .put("ver", 1).put("rowVersion", 0));
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", 1).put("varKind", "COND").put("dispType", "2").put("varName", "COIL_THK").put("axis", "ROW");
        ObjectNode result = rows.addObject().put("varId", 2).put("varKind", "RESULT").put("dispType", "Value").put("varName", "GRD")
                .put("dataType", "STRING");
        result.putArray("prioList");
        rows.addObject().put("varId", -1).put("varKind", "RESULT").put("dispType", "Value").put("varName", "TMP_DEL")
                .put("dataType", "STRING").put("deleted", true);

        JsonNode save = post("ruleEdit", "save", "kim", body);

        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        assertEquals(2, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'HTTP_JDG'"),
                "deleted:true 줄은 반영되지 않는다");
        assertEquals("ROW", jdbc.queryForObject("SELECT AXIS FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'HTTP_JDG' AND VAR_ID = 1", String.class));
    }

    /** TSK-08-03 — BPMN 이 parseExpr(validate action)·도메인 검색(search target=DOMAIN)을 실제 서비스 메서드로 잇는다. */
    @Test
    void validate_는_식을_서버에서_파싱하고_search_target_DOMAIN_은_도메인을_찾는다() throws Exception {
        ObjectNode ok = json.createObjectNode().put("text", "ROUND(COIL_THK * 2, 1)").put("slot", "RULE_RESULT_EXPR");
        JsonNode parsed = post("ruleEdit", "validate", "kim", envelope("ruleEdit", ok));
        assertTrue(parsed.path("meta").path("success").asBoolean(false), parsed.toString());
        JsonNode r = parsed.path("data").path("result");
        assertEquals("COIL_THK", r.path("refVars").path(0).asText(), parsed.toString());
        assertTrue(r.path("supported").asBoolean(false), parsed.toString());
        assertFalse(r.path("ast").isMissingNode() || r.path("ast").isEmpty(), parsed.toString());

        JsonNode bad = post("ruleEdit", "validate", "kim", envelope("ruleEdit",
                json.createObjectNode().put("text", "COIL_THK +").put("slot", "RULE_RESULT_EXPR")));
        assertFalse(bad.path("meta").path("success").asBoolean(true), "파싱 오류는 실패 응답: " + bad);

        JsonNode dom = post("ruleEdit", "search", "kim", envelope("ruleEdit",
                json.createObjectNode().put("target", "DOMAIN").put("keyword", "COIL_THK")));
        assertTrue(dom.path("meta").path("success").asBoolean(false), dom.toString());
        assertEquals("COIL_THK_D", dom.path("data").path("result").path("rows").path(0).path("stdName").asText(), dom.toString());
    }

    @Test
    void 룰_목록은_서버_페이징으로_온다() throws Exception {
        registerByKim();
        JsonNode search = post("ruleMng", "search", "lee", envelope("ruleMng", json.createObjectNode().put("page", 0).put("size", 20)));
        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        JsonNode result = search.path("data").path("result");
        assertEquals(1, result.path("totalCount").asInt(), search.toString());
        assertEquals("HTTP_JDG", result.path("list").path(0).path("maruRuleId").asText());
        assertEquals("kim", result.path("list").path(0).path("pendingOwnerId").asText());
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
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
