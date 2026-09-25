package com.dongkuk.dmes.mdm.dmb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSerializeContext;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutCodecs;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotAssembler;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-02 design.md §3.3 — 실제 BPMN({@code services/dmb/headerMng.bpmn}·{@code layoutMng.bpmn}) + OASIS 트랜잭션을 HTTP 로
 * 태운다. BPMN 분기·DTO 평탄 바인딩·grid 이름 바인딩({@code items}·{@code headers}·{@code consts})·{@code data.result.*} 응답.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + LayoutOasisFlowTest.CLIENT_KEY)
@ActiveProfiles("local")
@Timeout(value = 60, unit = TimeUnit.SECONDS)
class LayoutOasisFlowTest extends LayoutTestSupport {

    static final String CLIENT_KEY = "mdm-test-client-key";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;

    @Autowired
    private LayoutSnapshotAssembler snapshotAssembler;

    @Autowired
    private LayoutCodecs layoutCodecs;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("layout-oasis-flow.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private JsonNode post(String service, String action, ObjectNode params, ObjectNode grids) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", service);
        body.set("params", params);
        if (grids != null) {
            body.set("grids", grids);
        }
        String key = System.getenv("BACKEND_CLIENT_KEY");
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", key != null && !key.isBlank() ? key : CLIENT_KEY)
                .header("X-Authenticated-User", "flow-test")
                .header("X-Authenticated-Role", "SYSADMIN")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        return json.readTree(response.body());
    }

    private ArrayNode rows(List<Map<String, Object>> rows, boolean fakeLengths) {
        ArrayNode arr = json.valueToTree(rows);
        if (fakeLengths) {
            for (JsonNode n : arr) {
                ((ObjectNode) n).put("OFFSET", 0).put("LENGTH", 999);
            }
        }
        return arr;
    }

    private ObjectNode grids(Object... nameRows) {
        ObjectNode g = json.createObjectNode();
        for (int i = 0; i < nameRows.length; i += 2) {
            g.putObject((String) nameRows[i]).set("rows", (ArrayNode) nameRows[i + 1]);
        }
        return g;
    }

    private long saveHeaderHttp(String name, String eai, List<Map<String, Object>> items) throws Exception {
        ObjectNode p = json.createObjectNode().put("layoutName", name);
        if (eai != null) {
            p.put("eaiCode", eai).put("eaiName", "GLUE " + eai).put("encoding", "EUC-KR").put("padRule", "숫자 왼쪽 0");
        }
        JsonNode r = post("headerMng", "save", p, grids("items", rows(items, true)));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        return r.path("data").path("result").path("layoutId").asLong();
    }

    private ObjectNode layoutParams(String name, String eai) {
        ObjectNode p = json.createObjectNode().put("layoutName", name).put("sndSystem", "L2").put("rcvSystem", "MES");
        if (eai != null) {
            p.put("eaiCode", eai);
        }
        return p;
    }

    private ArrayNode headerRows(long... ids) {
        ArrayNode arr = json.createArrayNode();
        for (int i = 0; i < ids.length; i++) {
            arr.addObject().put("SEQ", i + 1).put("HEADER_LAYOUT_ID", ids[i]);
        }
        return arr;
    }

    @Test
    void 헤더와_전문을_HTTP_로_저장하고_M201_총_길이_187_을_돌려받는다() throws Exception {
        String eai = uniq("H");
        long l100 = saveHeaderHttp(uniq("GLUE 공통 헤더 "), eai, l100Items());
        long l110 = saveHeaderHttp(uniq("L2 구간 헤더 "), null, l110Items());
        assertEquals(100, ((Number) layoutRow(l100).get("TOTAL_LENGTH")).intValue());
        assertEquals(List.of(8, 4, 3, 4, 3, 14, 14, 12, 1, 5, 1, 6, 25), column(itemRows(l100), "LENGTH"), "요청 LENGTH 999 무시(I4)");

        ArrayNode consts = json.createArrayNode();
        consts.addObject().put("HEADER_LAYOUT_ID", l100).put("HEADER_SEQ", 2).put("CONST_VALUE", "B1");
        JsonNode r = post("layoutMng", "save", layoutParams(uniq("출측검사 "), eai),
                grids("headers", headerRows(l110), "consts", consts, "items", rows(m201Items(), true)));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals(187, result.path("totalLength").asInt());
        assertEquals(130, result.path("headerLength").asInt());
        long msg = result.path("layoutId").asLong();
        assertEquals(List.of(20, 8, 4, 25), column(itemRows(msg), "LENGTH"), "요청 LENGTH 999 무시(I4)");
        assertEquals(List.of(130, 150, 158, 162), column(itemRows(msg), "OFFSET"));

        JsonNode view = post("layoutMng", "view", json.createObjectNode().put("layoutId", msg), null);
        assertTrue(view.path("meta").path("success").asBoolean(), view.toString());
        JsonNode layout = view.path("data").path("result").path("layout");
        assertEquals(187, layout.path("TOTAL_LENGTH").asInt());
        assertEquals(130, layout.path("HEADER_LENGTH").asInt());
        assertEquals(2, view.path("data").path("result").path("headers").size());
        assertEquals("B1", view.path("data").path("result").path("headers").get(0).path("items").get(1)
                .path("EFFECTIVE_VALUE").asText());

        JsonNode hv = post("headerMng", "view", json.createObjectNode().put("layoutId", l100), null);
        assertEquals(1, hv.path("data").path("result").path("usedBy").size());
        JsonNode hs = post("headerMng", "search", json.createObjectNode(), null);
        assertTrue(hs.path("data").path("result").path("headers").size() >= 2, hs.toString());
    }

    @Test
    void 거부는_meta_message_에_L_코드와_함께_온다() throws Exception {
        List<Map<String, Object>> items = m201Items();
        items.add(item("DATA", "NOPE_X", null));
        JsonNode r = post("layoutMng", "save", layoutParams(uniq("거부 "), null),
                grids("headers", json.createArrayNode(), "consts", json.createArrayNode(), "items", rows(items, false)));
        assertFalse(r.path("meta").path("success").asBoolean(), r.toString());
        assertTrue(r.path("meta").path("message").asText().startsWith("전문 저장 거부: L01"), r.toString());

        List<Map<String, Object>> hItems = l110Items();
        hItems.get(5).put("COLUMN_PHYS", "LINE_CODE");
        JsonNode h = post("headerMng", "save", json.createObjectNode().put("layoutName", uniq("거부 헤더 ")),
                grids("items", rows(hItems, false)));
        assertFalse(h.path("meta").path("success").asBoolean(), h.toString());
        assertTrue(h.path("meta").path("message").asText().startsWith("헤더 저장 거부: L02[6]"), h.toString());
    }

    @Test
    void 전문_save_에_헤더_항목_grid_를_끼워_보내도_헤더는_바뀌지_않는다() throws Exception {
        String eai = uniq("H");
        long l100 = saveHeaderHttp(uniq("GLUE 공통 헤더 "), eai, l100Items());
        Map<String, Object> before = layoutRow(l100);
        List<Map<String, Object>> itemsBefore = itemRows(l100);
        ArrayNode headerItems = json.createArrayNode();
        headerItems.addObject().put("HEADER_LAYOUT_ID", l100).put("SEQ", 2).put("COLUMN_PHYS", "SND_FAC_TP")
                .put("FILL_KIND", "CONST").put("DEFAULT_VALUE", "ZZ").put("LENGTH", 9);
        JsonNode r = post("layoutMng", "save", layoutParams(uniq("끼워 보냄 "), eai),
                grids("headers", json.createArrayNode(), "consts", json.createArrayNode(), "items", rows(m201Items(), false),
                        "headerItems", headerItems));
        // 실측 기록용 — OASIS 가 모르는 grid 를 무시하면 true, 거부하면 false. 어느 쪽이든 헤더는 그대로여야 한다(I8)
        System.out.println("[LayoutOasisFlowTest] unknown grid headerItems → meta.success=" + r.path("meta").path("success"));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        assertEquals(before, layoutRow(l100));
        assertEquals(itemsBefore, itemRows(l100));
        assertEquals("B0", itemRows(l100).get(1).get("DEFAULT_VALUE"));
        assertEquals(4, ((Number) itemRows(l100).get(1).get("LENGTH")).intValue());
    }

    // ── TSK-05-03 design.md §3.3 — validate·execute·export·search(IMPACT) 분기·DTO·grid 이름 바인딩 ──

    private record Http201(String eai, long l100, long l110, long message, String name) {
    }

    private Http201 http201() throws Exception {
        String eai = uniq("H");
        long l100 = saveHeaderHttp(uniq("GLUE 공통 헤더 "), eai, l100Items());
        long l110 = saveHeaderHttp(uniq("L2 구간 헤더 "), null, l110Items());
        String name = uniq("흐름 ");
        JsonNode r = post("layoutMng", "save", layoutParams(name, eai),
                grids("headers", headerRows(l110), "consts", json.createArrayNode(), "items", rows(m201Items(), false)));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        return new Http201(eai, l100, l110, r.path("data").path("result").path("layoutId").asLong(), name);
    }

    @Test
    void validate_는_HTTP_로_7행_표를_돌려준다() throws Exception {
        Http201 m = http201();
        JsonNode r = post("layoutMng", "validate", layoutParams(uniq("검증 "), m.eai()),
                grids("headers", headerRows(m.l110()), "consts", json.createArrayNode(), "items", rows(m201Items(), false)));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        JsonNode checks = r.path("data").path("result").path("checks");
        assertEquals(7, checks.size(), r.toString());
        assertEquals("PASS", checks.get(3).path("RESULT").asText());
        assertTrue(r.path("data").path("result").path("passed").asBoolean());
    }

    @Test
    void execute_는_HTTP_로_samples_grid_를_받아_렌더한다() throws Exception {
        Http201 m = http201();
        ArrayNode samples = json.createArrayNode();
        samples.addObject().put("COLUMN_PHYS", "COIL_ID").put("VALUE", "C26A0012345");
        samples.addObject().put("COLUMN_PHYS", "COIL_THK").put("VALUE", "3.5");
        ObjectNode p = layoutParams(m.name(), m.eai()).put("layoutId", m.message()).put("sendTime", "20260922143015").put("seq", 1);
        JsonNode r = post("layoutMng", "execute", p, grids("headers", headerRows(m.l110()), "consts", json.createArrayNode(),
                "items", rows(m201Items(), false), "samples", samples));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals(187, result.path("totalBytes").asInt(), r.toString());
        assertEquals(23, result.path("segments").size());
        boolean thk = false;
        for (JsonNode s : result.path("segments")) {
            if ("COIL_THK".equals(s.path("COLUMN_PHYS").asText())) {
                thk = "0035".equals(s.path("TEXT").asText());
            }
        }
        assertTrue(thk, "samples grid 의 COIL_THK 3.5 가 0035 로 렌더되어야 한다: " + r);
    }

    @Test
    void export_는_HTTP_로_스냅샷을_돌려준다() throws Exception {
        Http201 m = http201();
        JsonNode r = post("layoutMng", "export", json.createObjectNode().put("layoutId", m.message()), null);
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        JsonNode result = r.path("data").path("result");
        assertEquals(187, result.path("snapshot").path("totalLength").asInt(), r.toString());
        assertEquals(1, result.path("layoutVersion").asInt());
        assertEquals("layout-" + m.message() + "-v1", result.path("fileBase").asText());
    }

    // ── TSK-09-01 design.md §3 B2 — 등록→검증→스냅샷→왕복 단일 체인(LayoutSerializerRoundTripTest 갭: 손 조립이
    // 아니라 DB 에 실제 저장된 스냅샷으로 왕복을 확인한다) ──

    @Test
    void register_validate_export_직렬화_파싱_왕복이_일치한다() throws Exception {
        Http201 m = http201();

        JsonNode v = post("layoutMng", "validate", layoutParams(uniq("왕복검증 "), m.eai()),
                grids("headers", headerRows(m.l110()), "consts", json.createArrayNode(), "items", rows(m201Items(), false)));
        assertTrue(v.path("meta").path("success").asBoolean(), v.toString());
        assertEquals(7, v.path("data").path("result").path("checks").size(), v.toString());
        assertTrue(v.path("data").path("result").path("passed").asBoolean(), v.toString());

        JsonNode e = post("layoutMng", "export", json.createObjectNode().put("layoutId", m.message()), null);
        assertTrue(e.path("meta").path("success").asBoolean(), e.toString());
        assertEquals(187, e.path("data").path("result").path("snapshot").path("totalLength").asInt(), e.toString());

        // 손 조립이 아니라 DB 에서 실제로 저장된 스냅샷을 그대로 읽는다 — LayoutSerializerRoundTripTest 의 갭.
        MdmLayoutSnapshot snapshot = snapshotAssembler.read(m.message());
        assertEquals(187, snapshot.totalLength());

        Map<String, Object> record = new LinkedHashMap<>();
        record.put("COIL_ID", "C26A0012345");
        record.put("PROD_DT", "20260922");
        record.put("COIL_THK", new BigDecimal("3.5"));
        MdmLayoutSerializeContext ctx = new MdmLayoutSerializeContext(LocalDateTime.of(2026, 9, 22, 14, 30, 15), 1L);

        byte[] bytes = layoutCodecs.serializer().serialize(snapshot, record, ctx);
        assertEquals(187, bytes.length);

        Map<String, Object> parsed = layoutCodecs.parser().parse(snapshot, bytes);
        assertEquals("C26A0012345", parsed.get("COIL_ID"));
        assertEquals("20260922", parsed.get("PROD_DT"));
        assertEquals(0, new BigDecimal("3.5").compareTo((BigDecimal) parsed.get("COIL_THK")),
                "COIL_THK 3.5 왕복: " + parsed.get("COIL_THK"));
    }

    @Test
    void search_target_IMPACT_는_HTTP_로_영향_목록을_돌려준다() throws Exception {
        Http201 m = http201();
        JsonNode r = post("layoutMng", "search", json.createObjectNode().put("target", "IMPACT").put("keyword", "COIL_THK"), null);
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        boolean found = false;
        for (JsonNode row : r.path("data").path("result").path("impacts")) {
            found |= m.name().equals(row.path("LAYOUT_NAME").asText()) && "L2 → MES".equals(row.path("SND_RCV").asText());
        }
        assertTrue(found, r.toString());
    }

    @Test
    void search_target_COLUMN_은_컬럼_목록을_돌려준다() throws Exception {
        for (String service : List.of("headerMng", "layoutMng")) {
            JsonNode r = post(service, "search", json.createObjectNode().put("target", "COLUMN").put("keyword", "coil"), null);
            assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
            JsonNode cols = r.path("data").path("result").path("columns");
            assertTrue(cols.size() >= 2, r.toString());
            boolean thk = false;
            for (JsonNode c : cols) {
                if ("COIL_THK".equals(c.path("PHYS_NAME").asText())) {
                    thk = true;
                    assertEquals(3, c.path("LENGTH").asInt());
                    assertEquals("NUMBER", c.path("DATA_TYPE").asText());
                }
            }
            assertTrue(thk, service + " " + r);
        }
        JsonNode ls = post("layoutMng", "search", json.createObjectNode(), null);
        assertTrue(ls.path("meta").path("success").asBoolean(), ls.toString());
        assertTrue(ls.path("data").path("result").path("systems").size() >= 5, ls.toString());
    }
}
