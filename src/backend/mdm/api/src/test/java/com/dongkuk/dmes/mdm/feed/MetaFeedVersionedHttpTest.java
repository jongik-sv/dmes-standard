package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.math.BigDecimal;
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
 * D-154 — {@code metaFeed/view} 의 {@code part=TOC|BODY}·{@code at}(스펙 2026-10-03-mdm-meta-cache-per-version §4.1·§4.2). 목차는 RELEASED
 * 버전 목록(ver scale 3 number)과 {@code at} 시각의 본문 하나({@code current}), 본문은 (키, ver) 쌍마다 하나다. 본문 값은 {@code part} 없는 응답의
 * 목록 원소와 같아야 한다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + MetaFeedVersionedHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
class MetaFeedVersionedHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-feed-versioned-test-key";
    private static final String Q = "QLTY_GRD_JDG";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-feed-versioned-test.db");
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

    /** 룰 세 버전: 1.000(SQLite INTEGER) [2026-01-01, 2026-07-01), 1.001(REAL) [2026-07-01, 2027-01-01), 2.000 DRAFT. */
    private void seedRule() {
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = ? AND VER = 1", Q);
        DmeTestSupport.released(jdbc, Q, new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, Q, new BigDecimal("1.001"));
    }

    // ------------------------------------------------------------------ RULE

    @Test
    void RULE_목차는_RELEASED_버전을_ver_순_scale_3_으로_주고_at_시각의_본문을_current_로_싣는다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = toc("RULE", "2026-08-01T00:00:00", Q, "NO_RULE");

        assertEquals("TOC", r.path("part").asText(), r.toString());
        assertEquals(1, r.path("items").size(), "없는 룰은 빠진다: " + r);
        JsonNode it = r.path("items").get(0);
        JsonNode versions = it.path("value").path("versions");
        assertEquals(2, versions.size(), versions.toString());
        assertEquals("1.000", versions.get(0).path("ver").decimalValue().toPlainString(), "INTEGER 로 저장된 1 도 scale 3");
        assertEquals("1.001", versions.get(1).path("ver").decimalValue().toPlainString());
        assertEquals("RELEASED", versions.get(1).path("status").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(1).path("applyFrom").asText());
        assertTrue(it.path("value").path("header").isNull(), "룰 목차의 header 는 null");
        assertEquals("1.001", it.path("current").path("ver").asText());
        assertEquals(legacy.get(1), it.path("current").path("value"), "current 본문 = part 없는 목록의 그 원소");
    }

    @Test
    void RULE_at_이_없거나_적용_버전이_없으면_current_는_null_이다() throws Exception {
        seedRule();
        assertTrue(toc("RULE", null, Q).path("items").get(0).path("current").isNull());
        assertTrue(toc("RULE", "2025-01-01T00:00:00", Q).path("items").get(0).path("current").isNull(), "룰은 소급하지 않는다");
    }

    @Test
    void RULE_본문은_키_ver_쌍마다_주고_ver_는_scale_3_으로_되돌린다() throws Exception {
        seedRule();
        JsonNode legacy = item(view("RULE", Q), Q);

        JsonNode r = bodies("RULE", Q, "1", Q, "1.001", Q, "1.000");

        assertEquals("BODY", r.path("part").asText(), r.toString());
        assertEquals(2, r.path("items").size(), "1 과 1.000 은 같은 쌍이라 하나: " + r);
        assertEquals("1.000", r.path("items").get(0).path("ver").asText());
        assertEquals(legacy.get(0), r.path("items").get(0).path("value"));
        assertEquals("1.001", r.path("items").get(1).path("ver").asText());
        assertEquals(legacy.get(1), r.path("items").get(1).path("value"));
        assertEquals(0, r.path("failed").size());
    }

    @Test
    void RULE_본문_RELEASED_가_아닌_ver_와_없는_룰은_NOT_RELEASED_형식이_틀린_ver_는_INVALID_VER_이고_묶음은_거부하지_않는다() throws Exception {
        seedRule();
        DmeTestSupport.pending(jdbc, Q, new BigDecimal("2.000"), "MAJOR", "DRAFT", "kim", "FIRST", null);

        JsonNode r = bodies("RULE", Q, "2.000", "NO_RULE", "1.000", Q, "x.y", Q, "1.000");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(3, r.path("failed").size(), r.toString());
        assertEquals("NOT_RELEASED", failed(r, Q, "2.000").path("message").asText());
        assertEquals("NOT_RELEASED", failed(r, "NO_RULE", "1.000").path("message").asText());
        assertEquals("INVALID_VER", failed(r, Q, "x.y").path("message").asText());
    }

    // ------------------------------------------------------------------ 공통

    @Test
    void COLUMN_DOMAIN_은_part_를_무시하고_지금_응답을_준다() throws Exception {
        seedRule();
        JsonNode plain = view("COLUMN", "COIL_THK");
        JsonNode withPart = result(post(body(json.createObjectNode().put("type", "COLUMN").put("part", "TOC"), "COIL_THK")));
        assertEquals(plain, withPart);
        assertTrue(withPart.path("part").isMissingNode());
    }

    @Test
    void part_at_형식_오류와_키_500개_초과만_묶음을_거부한다() throws Exception {
        JsonNode badPart = post(body(json.createObjectNode().put("type", "RULE").put("part", "XYZ"), Q));
        assertFalse(badPart.path("meta").path("success").asBoolean(true), badPart.toString());
        assertTrue(badPart.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()));
        JsonNode badAt = post(body(json.createObjectNode().put("type", "RULE").put("part", "TOC").put("at", "2026/10/03"), Q));
        assertFalse(badAt.path("meta").path("success").asBoolean(true), badAt.toString());
        ObjectNode many = json.createObjectNode();
        many.putObject("meta").put("menuId", "metaFeed");
        many.putObject("params").put("type", "RULE").put("part", "BODY");
        ArrayNode rows = many.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < 501; i++) {
            rows.addObject().put("key", "R" + i).put("ver", "1.000");
        }
        assertFalse(post(many).path("meta").path("success").asBoolean(true));
    }

    @Test
    void 키가_없으면_part_를_되울린_빈_결과다() throws Exception {
        JsonNode r = toc("RULE", null);
        assertEquals("TOC", r.path("part").asText());
        assertEquals(0, r.path("items").size());
        assertEquals(0, r.path("failed").size());
    }

    // ------------------------------------------------------------------ 보조

    JsonNode toc(String type, String at, String... keys) throws IOException, InterruptedException {
        ObjectNode params = json.createObjectNode().put("type", type).put("part", "TOC");
        if (at != null) {
            params.put("at", at);
        }
        return result(post(body(params, keys)));
    }

    /** {@code keyVers} 는 키·ver 를 번갈아 적는다. */
    JsonNode bodies(String type, String... keyVers) throws IOException, InterruptedException {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "metaFeed");
        body.putObject("params").put("type", type).put("part", "BODY");
        ArrayNode rows = body.putObject("grids").putObject("keys").putArray("rows");
        for (int i = 0; i < keyVers.length; i += 2) {
            rows.addObject().put("key", keyVers[i]).put("ver", keyVers[i + 1]);
        }
        return result(post(body));
    }

    JsonNode view(String type, String... keys) throws IOException, InterruptedException {
        return result(post(body(json.createObjectNode().put("type", type), keys)));
    }

    static JsonNode failed(JsonNode result, String key, String ver) {
        for (JsonNode f : result.path("failed")) {
            if (key.equals(f.path("key").asText()) && ver.equals(f.path("ver").asText())) {
                return f;
            }
        }
        throw new AssertionError("failed 에 없다: " + key + "@" + ver + " in " + result);
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

    JsonNode post(ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/metaFeed/view"))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", "system:mls")
                .header("X-Authenticated-Role", "SYSTEM")
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
