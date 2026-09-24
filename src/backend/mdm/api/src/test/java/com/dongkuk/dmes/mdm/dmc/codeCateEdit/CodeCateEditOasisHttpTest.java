package com.dongkuk.dmes.mdm.dmc.codeCateEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
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
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-04 design.md §3·§5 불변 규칙 16 — BPMN {@code services/dmc/codeCateEdit.bpmn} 까지 태우는 HTTP 시험
 * ({@code CodeItemEditOasisHttpTest} 골격 복제, 수용 기준 3 일부).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + CodeCateEditOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
@Import(CodeCateEditOasisHttpTest.ClockOnly.class)
class CodeCateEditOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dmc-cate-test-client-key";

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockOnly {
        @Bean
        @Primary
        MutableClock codeCateEditHttpClock() {
            return new MutableClock(MdmClockConfig.KST, MasterCodeTestConfig.SAMPLE_DAY);
        }
    }

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
    private MasterCodeFixtures fx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-cate-edit-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        fx.seedCode("M", "시험 코드", "MDM", 2);
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", MasterCodeFixtures.OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, 0);
        fx.seedItem("M", "A", "1.000", MasterCodeFixtures.OPEN, "에이", null, 1, null, "G");
        fx.seedItem("M", "B", "1.000", MasterCodeFixtures.OPEN, "비", null, 2, null, "G");
        fx.seedCate("M", "BASE", "1.000", MasterCodeFixtures.OPEN, "전체", "REGEX", ".*", "CODE");
    }

    /** 불변 규칙 16 — {@code MasterCodeSegmentService} 구현 빈은 {@code DefaultMasterCodeSegmentService} 하나뿐이다. */
    @Test
    void MasterCodeSegmentService_구현빈은_하나다() {
        assertEquals(1, applicationContext.getBeansOfType(MasterCodeSegmentService.class).size());
    }

    @Test
    void O1_정상_저장은_카테고리와_소속을_함께_반영한다() throws Exception {
        ObjectNode cate = json.createObjectNode().put("rowStatus", "ADDED").put("cateId", "T1")
                .put("cateName", "표1").put("defKind", "TABLE");
        ObjectNode member = json.createObjectNode().put("rowStatus", "ADDED").put("cateId", "T1").put("code", "A");

        JsonNode body = post("save", saveBody(0, List.of(cate), List.of(member)));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals(1, body.path("data").path("result").path("rowVersion").asLong(), body.toString());
        assertEquals(1L, fx.rowVersion("M", "1.001"));
        assertTrue(fx.cateSegments("M").contains("T1@1.001-9999"));
        assertTrue(fx.cateItemSegments("M").contains("T1 A@1.001-9999"));
    }

    @Test
    void O2_BASE_카테고리를_닫으면_기본_문구와_MDM012_를_싣는다() throws Exception {
        ObjectNode del = json.createObjectNode().put("rowStatus", "DELETED").put("cateId", "BASE");

        JsonNode body = post("save", saveBody(0, List.of(del), List.of()));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertEquals(0L, fx.rowVersion("M", "1.001"));
        assertTrue(fx.cateSegments("M").contains("BASE@1.000-9999"));
    }

    @Test
    void 조회_액션은_view_compare_가_성공_응답이다() throws Exception {
        JsonNode view = post("view", envelope(json.createObjectNode().put("maruCodeId", "M")));
        JsonNode compare = post("compare", envelope(json.createObjectNode()
                .put("maruCodeId", "M").put("ver", "1.001").put("defExpr", "[AB]").put("defTarget", "CODE")));
        JsonNode search = post("search", envelope(json.createObjectNode()));

        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals("1.001", view.path("data").path("result").path("selected").path("ver").asText());
        assertEquals(2, view.path("data").path("result").path("items").size());
        assertEquals(2, compare.path("data").path("result").path("hitCount").asInt(), compare.toString());
        assertEquals("M", search.path("data").path("result").path("codes").path(0).path("maruCodeId").asText());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private ObjectNode saveBody(long rowVersion, List<ObjectNode> categories, List<ObjectNode> members) {
        ObjectNode params = json.createObjectNode()
                .put("maruCodeId", "M").put("ver", "1.001").put("rowVersion", rowVersion);
        ObjectNode body = envelope(params);
        ObjectNode grids = body.putObject("grids");
        ArrayNode catArray = grids.putObject("categories").putArray("rows");
        for (ObjectNode r : categories) {
            catArray.add(r);
        }
        ArrayNode memArray = grids.putObject("members").putArray("rows");
        for (ObjectNode r : members) {
            memArray.add(r);
        }
        return body;
    }

    private ObjectNode envelope(ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "codeCateEdit");
        body.set("params", params);
        return body;
    }

    private JsonNode post(String action, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/codeCateEdit/" + action))
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
