package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
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
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
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
 * spec 2026-10-02-mdm-meta-cache-design §3.4·§7 「MDM metaFeed」 — BPMN 까지 태우는 HTTP 파이프(DmeOasisHttpTest 형식). 업무 모듈
 * 클라이언트와 같은 헤더(system:{module}, SYSTEM)로 부른다. 키 목록은 params 가 아니라 grids.keys.rows 다(params 배열 금지).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-test-client-key";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;
    @Autowired
    MdmEvaluator evaluator;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeSeeds(jdbc).clear();
    }

    // ------------------------------------------------------------------ search(changes)

    @Test
    void search_는_순번_뒤_변경을_limit_만큼_주고_넘치면_truncated_다() throws Exception {
        for (String key : new String[] {"A", "B", "C"}) {
            jdbc.update("INSERT INTO TB_MDM_META_REV (TARGET_TYPE, TARGET_KEY, CHANGE_KIND) VALUES ('COLUMN', ?, 'SAVE')", key);
        }
        long first = jdbc.queryForObject("SELECT MIN(REV_SEQ) FROM TB_MDM_META_REV", Long.class);

        JsonNode page = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", first - 1).put("limit", 2))));

        assertEquals(first + 2, page.path("latestSeq").asLong(), page.toString());
        assertTrue(page.path("truncated").asBoolean(), page.toString());
        assertEquals(2, page.path("items").size());
        JsonNode item = page.path("items").get(0);
        assertEquals(first, item.path("seq").asLong());
        assertEquals("COLUMN", item.path("type").asText());
        assertEquals("A", item.path("key").asText());
        assertEquals("SAVE", item.path("kind").asText());

        JsonNode rest = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", first + 1))));
        assertFalse(rest.path("truncated").asBoolean(true), rest.toString());
        assertEquals(1, rest.path("items").size());
        assertEquals("C", rest.path("items").get(0).path("key").asText());
    }

    @Test
    void search_는_기록이_없으면_latestSeq_0_과_빈_목록이다() throws Exception {
        JsonNode page = result(post("search", "SYSTEM", body(json.createObjectNode().put("since", 0))));
        assertEquals(0L, page.path("latestSeq").asLong(), page.toString());
        assertEquals(0, page.path("items").size());
        assertFalse(page.path("truncated").asBoolean(true));
    }

    // ------------------------------------------------------------------ view COLUMN·DOMAIN

    @Test
    void view_COLUMN_은_컬럼_속성과_상속된_파생값과_유효_표준식을_주고_없는_키는_뺀다() throws Exception {
        long parent = domain("FD_THK_P", "QTY", "NUMBER", 10, 2, null, "value >= 0");
        long child = domain("FD_THK_C", "QTY", "NUMBER", null, null, parent, "value <= 100");
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, LABEL_MID, DESCRIPTION, REQUIRED, DEFAULT_VALUE) "
                + "VALUES ('코일 두께', 'COIL_THK', ?, '두께', '설명', 1, '0')", child);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('도메인 없는 칼럼', 'NO_DOMAIN_COL', NULL)");

        JsonNode r = view("COLUMN", "COIL_THK", "no_domain_col", "NO_SUCH");

        assertEquals(2, r.path("items").size(), r.toString());
        assertEquals(0, r.path("failed").size(), r.toString());
        JsonNode coil = item(r, "COIL_THK");
        assertEquals("COIL_THK", coil.path("physName").asText());
        assertEquals("코일 두께", coil.path("columnName").asText());
        assertEquals("두께", coil.path("labelMid").asText());
        assertEquals("설명", coil.path("description").asText());
        assertEquals("NUMBER", coil.path("dataType").asText());
        assertEquals(10, coil.path("length").asInt());
        assertEquals(2, coil.path("scale").asInt());
        assertTrue(coil.path("required").asBoolean());
        assertEquals("0", coil.path("defaultValue").asText());
        assertEquals(String.valueOf(child), coil.path("domain").path("domainId").asText());
        assertEquals("QTY", coil.path("domain").path("domainKind").asText());
        assertEquals("(value >= 0) && (value <= 100)", coil.path("stdExpr").path("text").asText());
        assertEquals("INFIX_OPERATOR", coil.path("stdExpr").path("ast").path("type").asText());
        assertEquals("&&", coil.path("stdExpr").path("ast").path("value").asText());
        assertTrue(coil.path("bizExpr").isNull(), coil.toString());
        assertTrue(coil.path("codeRef").isNull(), coil.toString());

        JsonNode bare = item(r, "NO_DOMAIN_COL");
        assertTrue(bare.path("domain").isNull(), bare.toString());
        assertTrue(bare.path("dataType").isNull(), bare.toString());
        assertTrue(bare.path("stdExpr").isNull(), bare.toString());
    }

    @Test
    void view_DOMAIN_은_유효_도메인_메타를_주고_비즈니스식은_있다는_표시만_준다() throws Exception {
        long parent = domain("FD_D_P", "QTY", "NUMBER", 8, 1, null, "value >= 0");
        long child = domain("FD_D_C", "QTY", "NUMBER", null, null, parent, null);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET BIZ_RULE = 'value <= COIL_WID', DESCRIPTION = '자식 설명' WHERE DOMAIN_ID = ?", child);

        JsonNode r = view("DOMAIN", String.valueOf(child), "abc", "999999");

        assertEquals(1, r.path("items").size(), r.toString());
        JsonNode d = item(r, String.valueOf(child));
        assertEquals("FD_D_C 도메인", d.path("domainName").asText());
        assertEquals("FD_D_C", d.path("stdName").asText());
        assertEquals("QTY", d.path("domainKind").asText());
        assertEquals(8, d.path("length").asInt());
        assertEquals(1, d.path("scale").asInt());
        assertEquals("자식 설명", d.path("description").asText());
        assertEquals("value >= 0", d.path("stdExpr").path("text").asText());
        assertTrue(d.path("bizRuleOnServer").asBoolean(), d.toString());
        assertFalse(d.has("bizExpr"), "도메인 메타는 비즈니스식 원문을 싣지 않는다");
    }

    @Test
    void view_는_대상_종류가_없거나_틀리면_MDM021_이다() throws Exception {
        JsonNode r = post("view", "SYSTEM", body(json.createObjectNode().put("type", "TABLE"), "X"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        assertTrue(r.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), r.toString());
    }

    @Test
    void view_는_키가_없으면_빈_결과다() throws Exception {
        JsonNode r = view("COLUMN");
        assertEquals(0, r.path("items").size());
        assertEquals(0, r.path("failed").size());
    }

    // ------------------------------------------------------------------ 도우미

    /** 자기 행 한 줄. STD_AST 는 엔진 AstExporter 로 만든다(도메인 저장 경로와 같은 모양). */
    long domain(String std, String kind, String type, Integer length, Integer scale, Long parent, String stdRule) {
        jdbc.update("INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, LENGTH, SCALE, PARENT_DOMAIN_ID, "
                        + "STD_RULE, STD_AST, VER) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)",
                std + " 도메인", std, kind, type, length, scale, parent, stdRule, stdRule == null ? null : ast(stdRule));
        return jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = ?", Long.class, std);
    }

    String ast(String text) {
        try {
            return DomainJson.write(AstExporter.export(text, evaluator.configuration()));
        } catch (com.ezylang.evalex.parser.ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    ObjectNode body(ObjectNode params, String... keys) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.set("params", params);
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (String k : keys) {
            rows.addObject().put("key", k);
        }
        return body;
    }

    JsonNode post(String action, String role, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", role)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    JsonNode result(JsonNode response) {
        assertTrue(response.path("meta").path("success").asBoolean(false), response.toString());
        return response.path("data").path("result");
    }

    JsonNode view(String type, String... keys) throws IOException, InterruptedException {
        return result(post("view", "SYSTEM", body(json.createObjectNode().put("type", type), keys)));
    }

    static JsonNode item(JsonNode result, String key) {
        for (JsonNode i : result.path("items")) {
            if (key.equals(i.path("key").asText())) {
                return i.path("value");
            }
        }
        throw new AssertionError("키가 없다: " + key + " in " + result);
    }

    static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : TEST_CLIENT_KEY;
    }
}
