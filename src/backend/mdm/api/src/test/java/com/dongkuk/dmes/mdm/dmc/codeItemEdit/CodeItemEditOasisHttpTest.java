package com.dongkuk.dmes.mdm.dmc.codeItemEdit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
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
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.context.annotation.Primary;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-03 design.md §4.6 O1~O7 — BPMN {@code services/dmc/codeItemEdit.bpmn} 까지 태우는 HTTP 시험(DmaOasisHttpTest 모양).
 *
 * <p>가짜 사용자를 쓰지 않는다 — {@code X-Authenticated-User: kim}·{@code X-Authenticated-Role: MDM_STEWARD} 헤더가 실제
 * 필터 경로로 {@code CactusMdmCurrentUser} 에 닿는다. 시계만 원천 기준일(2026-09-03)로 덮는다. OASIS 가 action 하나를
 * 트랜잭션 하나로 묶으므로, 적용 중 실패는 {@code beginDraftWrite} 의 증가분까지 되돌린다(O3, 불변 규칙 24).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + CodeItemEditOasisHttpTest.TEST_CLIENT_KEY)
@ActiveProfiles("local")
@Import(CodeItemEditOasisHttpTest.ClockOnly.class)
class CodeItemEditOasisHttpTest {

    static final String TEST_CLIENT_KEY = "mdm-dmc-test-client-key";

    @TestConfiguration(proxyBeanMethods = false)
    static class ClockOnly {
        @Bean
        @Primary
        MutableClock codeItemEditHttpClock() {
            return new MutableClock(MdmClockConfig.KST, MasterCodeTestConfig.SAMPLE_DAY);
        }
    }

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    DataSource dataSource;

    private final HttpClient client = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private JdbcTemplate jdbc;
    private MasterCodeFixtures fx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-item-edit-http-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        fx = new MasterCodeFixtures(jdbc);
        fx.clear();
        fx.seedSteelStd();
    }

    @Test
    void O1_정상_저장은_rowVersion_1_을_돌려주고_DB_도_1() throws Exception {
        JsonNode body = post("save", saveBody(0, row("ADDED", "KS-3-CGCH-Z50", "z50", "KS", "KS-3", "KS-3-CGCH")));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals(1, body.path("data").path("result").path("rowVersion").asLong(), body.toString());
        assertEquals(1L, fx.rowVersion("STEEL_STD", "1.001"));
    }

    @Test
    void O2_검사에_걸린_저장은_기본_문구와_이슈_코드를_싣고_아무것도_바꾸지_않는다() throws Exception {
        JsonNode body = post("save", saveBody(0, row("ADDED", "X-2", "x", "JIS", "KS-3")));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        String message = body.path("meta").path("message").asText();
        assertTrue(message.startsWith(MdmErrorCode.CODE_SAVE_REJECTED.defaultMessage()), message);
        assertTrue(message.contains("LVL_PARENT_MISMATCH"), message);
        assertEquals(0L, fx.rowVersion("STEEL_STD", "1.001"));
        assertEquals(8, fx.itemSegments("STEEL_STD").size());
    }

    @Test
    void O3_적용_중_실패는_ROW_VERSION_증가와_앞선_닫기를_함께_되돌린다() throws Exception {
        jdbc.execute("CREATE TRIGGER TR_O3_BOOM BEFORE INSERT ON TB_MDM_CODE_ITEM "
                + "WHEN NEW.CODE = 'BOOM' BEGIN SELECT RAISE(ABORT, 'boom'); END");
        try {
            ObjectNode del = json.createObjectNode().put("rowStatus", "DELETED").put("code", "KS-9");
            JsonNode body = post("save", saveBody(0, del, row("ADDED", "BOOM", "붐", "KS")));

            assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
            assertEquals(0L, fx.rowVersion("STEEL_STD", "1.001"), "beginDraftWrite 증가분이 롤백되지 않았다");
            assertTrue(fx.itemSegments("STEEL_STD").contains("KS-9@1.000-9999"), "앞선 닫기가 롤백되지 않았다");
        } finally {
            jdbc.execute("DROP TRIGGER IF EXISTS TR_O3_BOOM");
        }
    }

    @Test
    void O4_낡은_rowVersion_은_MDM001_문구() throws Exception {
        JsonNode body = post("save", saveBody(5, row("ADDED", "KS-3-CGCH-Z50", "z50", "KS", "KS-3", "KS-3-CGCH")));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().startsWith("다른 사용자가 수정했습니다"), body.toString());
    }

    @Test
    void O5_경미_수정은_잠긴_칸을_보내도_이름만_바꾼다() throws Exception {
        ObjectNode params = json.createObjectNode()
                .put("maruCodeId", "STEEL_STD").put("code", "KS-3-CGCC").put("fromVer", "1.000")
                .put("name", "CGCC-P").put("alterName", "C").put("seq", 1)
                .put("lvl1", "X").put("attr01", "Y").put("toVer", "1.000");

        JsonNode body = post("execute", envelope(params));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals("CGCC-P|KS|270|9999", jdbc.queryForObject("SELECT NAME || '|' || LVL1 || '|' || ATTR01 || '|' || "
                + "TO_VER FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'STEEL_STD' AND CODE = 'KS-3-CGCC'", String.class));
    }

    @Test
    void O6_그리드를_빼고_저장하면_바인딩이_실패한다_FE_는_rows_를_늘_보낸다() throws Exception {
        ObjectNode params = json.createObjectNode().put("maruCodeId", "STEEL_STD").put("ver", "1.001").put("rowVersion", 0);

        JsonNode body = post("save", envelope(params));

        assertFalse(body.path("meta").path("success").asBoolean(true), body.toString());
        assertTrue(body.path("meta").path("message").asText().contains("No suitable method"), body.toString());
        assertEquals(0L, fx.rowVersion("STEEL_STD", "1.001"));
    }

    @Test
    void O7_V_에서_추가한_코드를_한_요청에서_지우고_다시_넣어도_PK_충돌이_없다() throws Exception {
        // design.md 「Build 이탈」 — Hibernate 는 flush 때 INSERT 를 DELETE 보다 먼저 실행한다. 선분 조작이 쓰기마다
        // flush 하므로 같은 PK 의 삭제 뒤 재삽입이 한 트랜잭션에서 된다.
        post("save", saveBody(0, row("ADDED", "T1", "처음", "KS")));
        ObjectNode del = json.createObjectNode().put("rowStatus", "DELETED").put("code", "T1");

        JsonNode body = post("save", saveBody(1, del, row("ADDED", "T1", "다시", "KS")));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals(2L, fx.rowVersion("STEEL_STD", "1.001"));
        assertEquals("다시", jdbc.queryForObject("SELECT NAME FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'STEEL_STD' "
                + "AND CODE = 'T1'", String.class));
    }

    @Test
    void O8_새_코드와_새_TABLE_카테고리_소속을_한_요청으로_저장하면_rowVersion_은_1만_오른다() throws Exception {
        ObjectNode cate = json.createObjectNode().put("rowStatus", "ADDED").put("cateId", "T1").put("cateName", "표1")
                .put("defKind", "TABLE");
        ObjectNode member = json.createObjectNode().put("rowStatus", "ADDED").put("cateId", "T1")
                .put("code", "KS-3-CGCH-Z50");

        JsonNode body = post("save", saveBody(0, List.of(row("ADDED", "KS-3-CGCH-Z50", "z50", "KS", "KS-3", "KS-3-CGCH")),
                List.of(cate), List.of(member)));

        assertTrue(body.path("meta").path("success").asBoolean(false), body.toString());
        assertEquals(1, body.path("data").path("result").path("rowVersion").asLong(), body.toString());
        assertEquals(1L, fx.rowVersion("STEEL_STD", "1.001"));
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_CODE_CATE_ITEM WHERE MARU_CODE_ID = 'STEEL_STD'"
                + " AND CATE_ID = 'T1' AND CODE = 'KS-3-CGCH-Z50'", Integer.class));
    }

    @Test
    void 조회_액션은_view_compare_validate_가_성공_응답이다() throws Exception {
        JsonNode view = post("view", envelope(json.createObjectNode().put("maruCodeId", "STEEL_STD")));
        JsonNode compare = post("compare", envelope(json.createObjectNode()
                .put("maruCodeId", "STEEL_STD").put("ver", "1.001").put("cateId", "BASE")));
        JsonNode search = post("search", envelope(json.createObjectNode()));
        ObjectNode validateBody = saveBody(0, row("ADDED", "X-1", "x", "KS", null, "KS-3-CGCH"));
        JsonNode validate = post("validate", validateBody);

        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals("1.001", view.path("data").path("result").path("selected").path("ver").asText());
        assertEquals(8, view.path("data").path("result").path("rows").size());
        assertEquals(8, compare.path("data").path("result").path("hitCount").asInt(), compare.toString());
        assertEquals("STEEL_STD", search.path("data").path("result").path("codes").path(0).path("maruCodeId").asText());
        assertEquals("LVL_GAP", validate.path("data").path("result").path("issues").path(0).path("code").asText(),
                validate.toString());
        assertEquals(0, validate.path("data").path("result").path("cateIssues").size(), validate.toString());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private ObjectNode row(String status, String code, String name, String... lvls) {
        ObjectNode r = json.createObjectNode().put("rowStatus", status).put("code", code).put("name", name).put("seq", 1);
        for (int i = 0; i < lvls.length; i++) {
            if (lvls[i] != null) {
                r.put("lvl" + (i + 1), lvls[i]);
            }
        }
        return r;
    }

    private ObjectNode saveBody(long rowVersion, ObjectNode... rows) {
        return saveBody(rowVersion, List.of(rows), List.of(), List.of());
    }

    /** FE 처럼 세 그리드를 늘 보낸다(빈 배열 포함, 2026-09-28 화면 합치기). */
    private ObjectNode saveBody(long rowVersion, List<ObjectNode> rows, List<ObjectNode> categories,
                                List<ObjectNode> members) {
        ObjectNode params = json.createObjectNode()
                .put("maruCodeId", "STEEL_STD").put("ver", "1.001").put("rowVersion", rowVersion);
        ObjectNode body = envelope(params);
        ObjectNode grids = body.putObject("grids");
        ArrayNode rowArray = grids.putObject("rows").putArray("rows");
        rows.forEach(rowArray::add);
        ArrayNode cateArray = grids.putObject("categories").putArray("rows");
        categories.forEach(cateArray::add);
        ArrayNode memberArray = grids.putObject("members").putArray("rows");
        members.forEach(memberArray::add);
        return body;
    }

    private ObjectNode envelope(ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "codeItemEdit");
        body.set("params", params);
        return body;
    }

    private JsonNode post(String action, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/codeItemEdit/" + action))
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
