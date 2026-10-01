package com.dongkuk.dmes.mdm.dma.domainMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainTreeSnapshot;
import com.dongkuk.dmes.mdm.dma.domainMng.DomainMngTestConfig.RecordingDomainTreeReader;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Path;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * design.md §4.3 — 실제 BPMN({@code services/dma/domainMng.bpmn}) + {@code SpringTransactionHandler} 를 HTTP 로 태운다.
 * 하위 테스트 케이스 실패 시 부모 저장 롤백(수용 기준 5), 오류 전달(B0), 동시 수정(D5), 미리보기 쓰기 없음.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + DomainMngOasisFlowTest.CLIENT_KEY)
@ActiveProfiles("local")
@Import({DomainMngTestConfig.Functions.class, DomainMngTestConfig.RecordingReader.class})
@Timeout(value = 60, unit = TimeUnit.SECONDS)
class DomainMngOasisFlowTest {

    static final String CLIENT_KEY = "mdm-test-client-key";

    @TempDir
    static Path tempDir;

    @LocalServerPort
    int port;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    RecordingDomainTreeReader reader;

    private final HttpClient http = HttpClient.newHttpClient();
    private final ObjectMapper json = new ObjectMapper();
    private static int seq;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("domain-oasis-flow.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    @BeforeEach
    void setUp() {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('mm','LENGTH','mm',1,0)");
        reader.loads.clear();
    }

    // ------------------------------------------------------------------ 호출 도우미

    private JsonNode post(String action, ObjectNode params, ObjectNode grids) throws Exception {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", "domainMng");
        body.set("params", params);
        if (grids != null) {
            body.set("grids", grids);
        }
        String key = System.getenv("BACKEND_CLIENT_KEY");
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/domainMng/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", key != null && !key.isBlank() ? key : CLIENT_KEY)
                .header("X-Authenticated-User", "flow-test")
                .header("X-Authenticated-Role", "SYSADMIN")
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body))).build();
        HttpResponse<String> response = http.send(request, HttpResponse.BodyHandlers.ofString());
        return json.readTree(response.body());
    }

    private ObjectNode draft(String std, String kind, String type) {
        ObjectNode p = json.createObjectNode();
        p.put("domainName", "도메인 " + std);
        p.put("stdName", std);
        p.put("domainKind", kind);
        p.put("dataType", type);
        return p;
    }

    private ObjectNode grids(String... valueExpect) {
        ObjectNode g = json.createObjectNode();
        ArrayNode cases = g.putObject("testCases").putArray("rows");
        for (int i = 0; i < valueExpect.length; i += 2) {
            cases.addObject().put("VALUE", valueExpect[i]).put("EXPECT", Boolean.parseBoolean(valueExpect[i + 1]));
        }
        g.putObject("examples").putArray("rows");
        return g;
    }

    private static synchronized String uniq(String p) {
        return p + "_" + (++seq);
    }

    private long saveOk(ObjectNode params, ObjectNode grids) throws Exception {
        JsonNode r = post("save", params, grids);
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        return r.path("data").path("result").path("domainId").asLong();
    }

    private Map<String, Object> row(long id) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?", id);
    }

    /** P(value <= 30, 길이 20) — C(자식, 케이스 25→true, 명시 길이 15). */
    private long[] parentAndChild() throws Exception {
        String ps = uniq("P");
        ObjectNode p = draft(ps, "QTY", "NUMBER");
        p.put("unitCode", "mm");
        p.put("length", 20);
        p.put("stdRule", "value <= 30");
        long pid = saveOk(p, grids("25", "true"));
        ObjectNode c = draft(uniq("C"), "QTY", "NUMBER");
        c.put("parentDomainId", pid);
        c.put("length", 15);
        c.put("stdRule", "value >= 0");
        long cid = saveOk(c, grids("25", "true"));
        return new long[] {pid, cid};
    }

    private ObjectNode edit(long id, String std, String rule, int length) {
        ObjectNode p = draft(std, "QTY", "NUMBER");
        p.put("domainId", id);
        p.put("ver", ((Number) row(id).get("VER")).longValue());
        p.put("unitCode", "mm");
        p.put("length", length);
        p.put("stdRule", rule);
        return p;
    }

    // ------------------------------------------------------------------ 시나리오

    @Test
    void B0_거부_메시지는_원문으로_meta_message_에_온다() throws Exception {
        JsonNode missing = post("view", json.createObjectNode().put("domainId", 987654), null);
        assertFalse(missing.path("meta").path("success").asBoolean(true), missing.toString());
        assertTrue(missing.path("meta").path("message").asText().contains("S06"), missing.toString());
        ObjectNode bad = draft(uniq("B"), "TEXT", "STRING");
        bad.put("stdRule", "value > OTHER_COL");
        JsonNode rejected = post("save", bad, grids());
        assertEquals("S001", rejected.path("meta").path("code").asText(), rejected.toString());
        assertTrue(rejected.path("meta").path("message").asText().contains("R04"), rejected.toString());
    }

    @Test
    void B1_최상위와_자식을_저장하고_조회한다() throws Exception {
        long[] ids = parentAndChild();
        JsonNode r = post("search", json.createObjectNode(), null);
        JsonNode rows = r.path("data").path("result").path("domains");
        JsonNode child = null;
        for (JsonNode n : rows) {
            if (n.path("DOMAIN_ID").asLong() == ids[1]) {
                child = n;
            }
        }
        assertNotNull(child, r.toString());
        assertEquals(1, child.path("DEPTH").asInt());
        assertEquals("(value <= 30) && (value >= 0)", child.path("EFF_STD_EXPR").asText());
        Map<String, Object> db = row(ids[1]);
        assertTrue(((String) db.get("STD_AST")).startsWith("{"), "STD_AST 는 JSON");
        assertFalse(((String) db.get("STD_AST")).contains("<="), "자기 식 AST 만 저장(I1)");
        assertEquals(0, ((Number) db.get("CHG_SEQ")).intValue());
    }

    @Test
    void B2_부모를_좁혀도_하위_케이스가_통과하면_저장된다() throws Exception {
        long[] ids = parentAndChild();
        JsonNode r = post("save", edit(ids[0], (String) row(ids[0]).get("STD_NAME"), "value <= 28", 20), grids("25", "true"));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        assertEquals("value <= 28", row(ids[0]).get("STD_RULE"));
        assertEquals("NARROW_OR_WIDEN", r.path("data").path("result").path("classification").asText());
        assertTrue(r.path("data").path("result").path("rerunDomainIds").toString().contains(String.valueOf(ids[1])), r.toString());
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    void 하위_테스트_케이스가_실패하면_부모_저장이_롤백된다() throws Exception {
        long[] ids = parentAndChild();
        Map<String, Object> before = row(ids[0]);
        reader.loads.clear();
        JsonNode r = post("save", edit(ids[0], (String) before.get("STD_NAME"), "value <= 20", 20), grids("15", "true"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        String message = r.path("meta").path("message").asText();
        assertTrue(message.contains("R08") && message.contains(String.valueOf(ids[1])), message);
        Map<String, Object> after = row(ids[0]);
        for (String col : new String[] {"STD_RULE", "STD_AST", "VER", "U_AT", "TEST_CASES"}) {
            assertEquals(before.get(col), after.get(col), col + " 가 되돌려지지 않았다");
        }
        // 쓰기가 실제로 일어났고 같은 트랜잭션에서 다시 읽혔다(I6)
        assertTrue(reader.loads.size() >= 2, "저장 중 두 번째 load 가 없다 — 하위 재검사를 쓰기 전에 했다");
        DomainTreeSnapshot second = reader.loads.get(reader.loads.size() - 1);
        assertEquals("value <= 20", second.find(ids[0]).orElseThrow().stdRule(), "두 번째 load 가 방금 쓴 규칙을 못 봤다");
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    void B4_하위_명시_길이가_새_부모_길이보다_크면_롤백된다() throws Exception {
        long[] ids = parentAndChild();
        Map<String, Object> before = row(ids[0]);
        JsonNode r = post("save", edit(ids[0], (String) before.get("STD_NAME"), "value <= 30", 10), grids("25", "true"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        assertTrue(r.path("meta").path("message").asText().contains("R06"), r.toString());
        assertEquals(before.get("LENGTH"), row(ids[0]).get("LENGTH"));
        assertEquals(before.get("VER"), row(ids[0]).get("VER"));
    }

    @Test
    void B5_동시_수정은_MDM001_로_거부된다() throws Exception {
        long[] ids = parentAndChild();
        String std = (String) row(ids[1]).get("STD_NAME");
        ObjectNode first = draft(std, "QTY", "NUMBER");
        first.put("domainId", ids[1]);
        first.put("ver", ((Number) row(ids[1]).get("VER")).longValue());
        first.put("parentDomainId", ids[0]);
        first.put("length", 15);
        first.put("stdRule", "value >= 0");
        first.put("description", "첫 저장");
        assertTrue(post("save", first, grids("25", "true")).path("meta").path("success").asBoolean());
        first.put("description", "옛 ver 로 두 번째 저장");
        JsonNode second = post("save", first, grids("25", "true"));
        assertFalse(second.path("meta").path("success").asBoolean(true));
        assertTrue(second.path("meta").path("message").asText().contains("다른 사용자가 수정"), second.toString());
        assertEquals("첫 저장", row(ids[1]).get("DESCRIPTION"));
    }

    /** 저장된 행 그대로의 초안(화면 모달이 만드는 것)에 부모만 바꾼다(D-132). */
    private ObjectNode relink(long id, Long parentId) {
        Map<String, Object> r = row(id);
        ObjectNode p = draft((String) r.get("STD_NAME"), (String) r.get("DOMAIN_KIND"), (String) r.get("DATA_TYPE"));
        p.put("domainId", id);
        p.put("ver", ((Number) r.get("VER")).longValue());
        if (parentId != null) {
            p.put("parentDomainId", parentId);
        }
        if (r.get("LENGTH") != null) {
            p.put("length", ((Number) r.get("LENGTH")).intValue());
        }
        if (r.get("UNIT_CODE") != null) {
            p.put("unitCode", (String) r.get("UNIT_CODE"));
        }
        if (r.get("STD_RULE") != null) {
            p.put("stdRule", (String) r.get("STD_RULE"));
        }
        return p;
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    void B7_부모_연결_뒤_하위_테스트_케이스가_실패하면_롤백된다() throws Exception {
        ObjectNode t = draft(uniq("T"), "QTY", "NUMBER");
        t.put("unitCode", "mm");
        t.put("stdRule", "value <= 20");
        long top = saveOk(t, grids("15", "true"));
        long[] ids = parentAndChild(); // P(value <= 30, 케이스 25) — C(케이스 25)
        jdbc.update("UPDATE TB_MDM_DOMAIN SET TEST_CASES = '[{\"value\":\"15\",\"expect\":true}]' WHERE DOMAIN_ID = ?", ids[0]);
        Map<String, Object> before = row(ids[0]);
        ObjectNode link = relink(ids[0], top);
        JsonNode validated = post("validate", link, grids("15", "true")).path("data").path("result");
        assertFalse(validated.path("ok").asBoolean(true), validated.toString());
        assertEquals("PARENT_CHANGE", validated.path("classification").asText());
        JsonNode r = post("save", link, grids("15", "true"));
        assertFalse(r.path("meta").path("success").asBoolean(true), r.toString());
        String message = r.path("meta").path("message").asText();
        assertTrue(message.contains("R08") && message.contains(String.valueOf(ids[1])), message);
        Map<String, Object> after = row(ids[0]);
        for (String col : new String[] {"PARENT_DOMAIN_ID", "VER", "U_AT"}) {
            assertEquals(before.get(col), after.get(col), col + " 가 되돌려지지 않았다");
        }
    }

    @Test
    @Timeout(value = 30, unit = TimeUnit.SECONDS)
    void B8_부모_교체_뒤_하위_길이가_넘치면_롤백되고_통과하면_연결된다() throws Exception {
        ObjectNode n = draft(uniq("N"), "QTY", "NUMBER");
        n.put("unitCode", "mm");
        n.put("length", 10);
        long narrow = saveOk(n, grids());
        ObjectNode w = draft(uniq("W"), "QTY", "NUMBER");
        w.put("unitCode", "mm");
        w.put("length", 40);
        long wide = saveOk(w, grids());
        long[] ids = parentAndChild(); // P(길이 20) — C(길이 15)
        jdbc.update("UPDATE TB_MDM_DOMAIN SET LENGTH = NULL, TEST_CASES = NULL WHERE DOMAIN_ID = ?", ids[0]);
        Map<String, Object> before = row(ids[0]);
        JsonNode rejected = post("save", relink(ids[0], narrow), grids());
        assertFalse(rejected.path("meta").path("success").asBoolean(true), rejected.toString());
        assertTrue(rejected.path("meta").path("message").asText().contains("R06"), rejected.toString());
        assertEquals(before.get("PARENT_DOMAIN_ID"), row(ids[0]).get("PARENT_DOMAIN_ID"));
        assertEquals(before.get("VER"), row(ids[0]).get("VER"));

        JsonNode ok = post("save", relink(ids[0], wide), grids());
        assertTrue(ok.path("meta").path("success").asBoolean(), ok.toString());
        assertEquals("PARENT_CHANGE", ok.path("data").path("result").path("classification").asText());
        assertEquals(wide, ((Number) row(ids[0]).get("PARENT_DOMAIN_ID")).longValue());
    }

    @Test
    void B9_연결_제거는_상속값을_구체화해_저장한다() throws Exception {
        long[] ids = parentAndChild(); // P(mm, 길이 20, value <= 30) — C(길이 15, value >= 0)
        JsonNode r = post("save", relink(ids[1], null), grids("25", "true"));
        assertTrue(r.path("meta").path("success").asBoolean(), r.toString());
        assertTrue(r.path("data").path("result").path("warnings").toString().contains("W05"), r.toString());
        Map<String, Object> c = row(ids[1]);
        assertEquals(null, c.get("PARENT_DOMAIN_ID"));
        assertEquals("mm", c.get("UNIT_CODE"));
        assertEquals("(value <= 30) && (value >= 0)", c.get("STD_RULE"));
    }

    @Test
    void B6_서버_미리보기는_평가만_하고_쓰지_않는다() throws Exception {
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('ton','MASS','ton',1,0)");
        long owner = saveOk(draft(uniq("W"), "QTY", "NUMBER").put("unitCode", "ton"), grids());
        jdbc.update("INSERT OR IGNORE INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ) "
                + "VALUES ('코일 순중량', 'COIL_NET_WGT', ?, 0, 0)", owner);
        String fingerprint = "SELECT DOMAIN_ID, VER, U_AT, DESCRIPTION, STD_RULE FROM TB_MDM_DOMAIN ORDER BY DOMAIN_ID";
        java.util.List<Map<String, Object>> before = jdbc.queryForList(fingerprint);

        ObjectNode p = json.createObjectNode();
        p.put("domainKind", "QTY");
        p.put("dataType", "NUMBER");
        p.put("stdName", "GROSS_WGT");
        p.put("stdRule", "value > 0");
        p.put("bizRule", "value >= COIL_NET_WGT");
        p.put("value", "10");
        ObjectNode g = json.createObjectNode();
        g.putObject("vars").putArray("rows").addObject().put("NAME", "COIL_NET_WGT").put("VALUE", "8");
        JsonNode filled = post("execute", p, g).path("data").path("result");
        assertEquals("true", filled.path("biz").path("RESULT").asText(), filled.toString());
        assertEquals("true", filled.path("std").path("RESULT").asText(), filled.toString());
        assertTrue(filled.path("valid").asBoolean());

        ObjectNode empty = json.createObjectNode();
        empty.putObject("vars").putArray("rows");
        JsonNode missing = post("execute", p, empty).path("data").path("result");
        assertEquals("BIZ_VAR_MISSING", missing.path("step").asText(), missing.toString());
        assertEquals("false", missing.path("biz").path("RESULT").asText());

        p.put("stdRule", "value > OTHER");
        JsonNode compile = post("execute", p, g).path("data").path("result");
        assertTrue(compile.path("compileIssues").toString().contains("R04"), compile.toString());
        assertTrue(compile.path("std").isMissingNode() || compile.path("std").isNull(), "컴파일 이슈가 있으면 평가하지 않는다");

        assertEquals(before, jdbc.queryForList(fingerprint), "execute 가 도메인 표를 바꿨다(I16)");
    }
}
