package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.contract.layout.MdmLayoutSnapshot;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutSnapshotJson;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dmc.MasterCodeSeeds;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.cfg.JsonNodeFeature;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.List;
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
    /** 소수는 BigDecimal 로, 뒤 0 을 지운 채로 읽지 않는다 — 룰·코드 버전 자리수(scale 3)를 응답 그대로 본다(D-144). */
    private final ObjectMapper json = JsonMapper.builder()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
            .disable(JsonNodeFeature.STRIP_TRAILING_BIGDECIMAL_ZEROES)
            .build();
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

    // ------------------------------------------------------------------ view RULE·RULE_SET·CODE·LAYOUT

    @Test
    void view_RULE_은_RELEASED_버전_전체를_ver_순으로_주고_DRAFT_는_빼며_확정이_없으면_빈_배열이다() throws Exception {
        // 룰 버전은 major/minor 소수(D-144). 1.000(SQLite INTEGER)·1.001(REAL)이 섞이고, 2.000·10.000 은 문자열 정렬이면 순서가 뒤집힌다
        DmeTestSupport.sampleRule(jdbc);
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-07-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", new BigDecimal("10.000"), "MAJOR", "FIRST", "2028-01-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", new BigDecimal("10.000"));
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"), "MINOR", "FIRST", "2026-07-01 00:00:00", "2027-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", new BigDecimal("1.001"));
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", new BigDecimal("2.000"), "MAJOR", "FIRST", "2027-01-01 00:00:00", "2028-01-01 00:00:00");
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", new BigDecimal("2.000"));
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", new BigDecimal("10.001"), "MINOR", "DRAFT", "kim", "FIRST", new BigDecimal("10.000"));
        DmeTestSupport.rule(jdbc, "NOREL_JDG", "확정 없음", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "NOREL_JDG", 1, "DRAFT", "kim", "FIRST", null);

        JsonNode r = view("RULE", "QLTY_GRD_JDG", "NOREL_JDG", "NO_SUCH_JDG");

        assertEquals(2, r.path("items").size(), r.toString());
        JsonNode versions = item(r, "QLTY_GRD_JDG");
        assertEquals(4, versions.size(), versions.toString());
        // 수 비교 오름차순, JSON number 자리수 그대로(1.000 이 1 로 줄지 않는다)
        List<BigDecimal> vers = new java.util.ArrayList<>();
        versions.forEach(v -> {
            assertTrue(v.path("ver").isBigDecimal(), "ver 는 JSON 소수: " + v.path("ver"));
            vers.add(v.path("ver").decimalValue());
        });
        assertEquals(List.of(new BigDecimal("1.000"), new BigDecimal("1.001"), new BigDecimal("2.000"), new BigDecimal("10.000")), vers);
        assertEquals("2026-01-01T00:00:00", versions.get(0).path("applyFrom").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(0).path("applyTo").asText());
        assertEquals("2026-07-01T00:00:00", versions.get(1).path("applyFrom").asText());
        assertEquals("DECISION", versions.get(1).path("ruleKind").asText());
        assertEquals("FIRST", versions.get(1).path("hitPolicy").asText());
        boolean varKey = false;
        for (JsonNode row : versions.get(1).path("rows")) {
            varKey |= row.path("cells").has("1");
        }
        assertTrue(varKey, "셀 키는 var_id 문자열이다: " + versions.get(1).path("rows"));
        assertEquals(0, item(r, "NOREL_JDG").size());
    }

    @Test
    void view_RULE_은_저장값이_깨진_룰만_failed_로_돌려준다() throws Exception {
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.rule(jdbc, "BROKEN_JDG", "깨진 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "BROKEN_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "BROKEN_JDG", 1);
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = '{\"x\":1}' WHERE MARU_RULE_ID = 'BROKEN_JDG' AND VER = 1 AND ROW_ID = 1");

        JsonNode r = view("RULE", "QLTY_GRD_JDG", "BROKEN_JDG");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(1, r.path("failed").size(), r.toString());
        assertEquals("BROKEN_JDG", r.path("failed").get(0).path("key").asText());
        assertFalse(r.path("failed").get(0).path("message").asText().isBlank());
    }

    @Test
    void view_RULE_SET_은_세트_정의를_주고_흐름이_깨진_세트는_failed_다() throws Exception {
        DmeTestSupport.ruleSet(jdbc, "FEED_SET", "피드 세트", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "FEED_BAD", "깨진 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "FEED_BAD", "{\"version\":1,\"nodes\":\"x\",\"edges\":[]}");

        JsonNode r = view("RULE_SET", "FEED_SET", "FEED_BAD", "NO_SET");

        JsonNode set = item(r, "FEED_SET");
        assertEquals("FEED_SET", set.path("setId").asText());
        assertEquals("QLTY_GRD_JDG", set.path("ruleIds").get(0).asText());
        assertEquals("INUSE", set.path("status").asText());
        assertTrue(set.path("flow").isNull(), set.toString());
        assertEquals("FEED_BAD", r.path("failed").get(0).path("key").asText(), r.toString());
    }

    @Test
    void view_CODE_는_다섯_표_원본을_버전_자리수와_적용_구간_그대로_준다() throws Exception {
        MasterCodeSeeds seeds = new MasterCodeSeeds(jdbc);
        seeds.seedCode("FEED_CD", "INUSE", "MDM");
        seeds.released("FEED_CD", "1.000", "2026-01-01 00:00:00", MasterCodeSeeds.OPEN_END);
        seeds.seedItem("FEED_CD", "A", "1.000", MasterCodeSeeds.OPEN, "에이", 1);
        seeds.seedBase("FEED_CD");

        JsonNode code = item(view("CODE", "FEED_CD", "NO_CD"), "FEED_CD");

        assertEquals("FEED_CD", code.path("header").path("maruCodeId").asText());
        assertEquals("INUSE", code.path("header").path("status").asText());
        JsonNode ver = code.path("versions").get(0);
        assertEquals(0, ver.path("ver").decimalValue().compareTo(new BigDecimal("1.000")), ver.toString());
        assertEquals("RELEASED", ver.path("status").asText());
        assertEquals("2026-01-01T00:00:00", ver.path("applyFrom").asText());
        assertEquals("A", code.path("items").get(0).path("code").asText());
        assertEquals("BASE", code.path("categories").get(0).path("cateId").asText());
    }

    @Test
    void view_LAYOUT_은_최신_버전_스냅샷을_주고_버전이_없는_ID_는_뺀다() throws Exception {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH) VALUES ('MESSAGE', '피드 전문', 10)");
        long id = jdbc.queryForObject("SELECT LAYOUT_ID FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = '피드 전문'", Long.class);
        String snapshot = LayoutSnapshotJson.write(new MdmLayoutSnapshot(id, "피드 전문", null, null, null, null, null, 1L, 10,
                List.of(), List.of()));
        jdbc.update("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SNAPSHOT_JSON) VALUES (?, 1, 10, ?)", id, snapshot);

        JsonNode r = view("LAYOUT", String.valueOf(id), "999999", "abc");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals("피드 전문", item(r, String.valueOf(id)).path("layoutName").asText());
    }

    // ------------------------------------------------------------------ Ruling R3 순환·깨진 도메인 체인

    @Test
    void view_COLUMN_은_도메인_체인이_순환이면_도메인_칸과_식_코드_참조를_비워_준다() throws Exception {
        long a = domain("FD_CYC_A", "QTY", "NUMBER", 10, 2, null, "value >= 0");
        long b = domain("FD_CYC_B", "QTY", "NUMBER", null, null, a, "value <= 100");
        jdbc.update("UPDATE TB_MDM_DOMAIN SET PARENT_DOMAIN_ID = ? WHERE DOMAIN_ID = ?", b, a);
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES ('순환 칼럼', 'CYC_COL', ?)", a);

        JsonNode r = view("COLUMN", "CYC_COL");

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals(0, r.path("failed").size(), r.toString());
        JsonNode col = item(r, "CYC_COL");
        assertEquals("CYC_COL", col.path("physName").asText());
        assertTrue(col.path("domain").isNull(), col.toString());
        assertTrue(col.path("stdExpr").isNull(), col.toString());
        assertTrue(col.path("bizExpr").isNull(), col.toString());
        assertTrue(col.path("codeRef").isNull(), col.toString());
    }

    @Test
    void view_DOMAIN_은_도메인_키_자체가_순환이면_failed_로_돌려준다() throws Exception {
        long a = domain("FD_CYD_A", "QTY", "NUMBER", 10, 2, null, "value >= 0");
        long b = domain("FD_CYD_B", "QTY", "NUMBER", null, null, a, null);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET PARENT_DOMAIN_ID = ? WHERE DOMAIN_ID = ?", b, a);
        long ok = domain("FD_CYD_OK", "QTY", "NUMBER", 5, 0, null, null);

        JsonNode r = view("DOMAIN", String.valueOf(a), String.valueOf(ok));

        assertEquals(1, r.path("items").size(), r.toString());
        assertEquals("FD_CYD_OK", item(r, String.valueOf(ok)).path("stdName").asText());
        assertEquals(1, r.path("failed").size(), r.toString());
        assertEquals(String.valueOf(a), r.path("failed").get(0).path("key").asText());
        assertFalse(r.path("failed").get(0).path("message").asText().isBlank());
    }

    // ------------------------------------------------------------------ save(force)

    @Test
    void save_는_SYSADMIN_만_펼치지_않고_강제_기록을_남긴다() throws Exception {
        ObjectNode params = json.createObjectNode().put("type", "COLUMN").put("kind", "RELOAD");

        JsonNode denied = post("save", "SYSTEM", body(params, "coil_thk"));
        assertFalse(denied.path("meta").path("success").asBoolean(true), denied.toString());
        assertTrue(denied.path("meta").path("message").asText().startsWith(MdmErrorCode.SYSADMIN_ROLE_REQUIRED.defaultMessage()),
                denied.toString());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));

        JsonNode ok = result(post("save", "SYSADMIN", body(params, "coil_thk", "COIL_WID")));
        assertEquals(2, ok.path("count").asInt(), ok.toString());
        assertEquals(ok.path("fromSeq").asLong() + 1, ok.path("toSeq").asLong());
        assertEquals(List.of("COLUMN:COIL_THK:RELOAD", "COLUMN:COIL_WID:RELOAD"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void save_는_kind_가_EVICT_RELOAD_가_아니거나_키가_없으면_MDM021_이다() throws Exception {
        JsonNode badKind = post("save", "SYSADMIN", body(json.createObjectNode().put("type", "RULE").put("kind", "SAVE"), "R1"));
        assertTrue(badKind.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), badKind.toString());
        JsonNode noKeys = post("save", "SYSADMIN", body(json.createObjectNode().put("type", "RULE").put("kind", "EVICT")));
        assertTrue(noKeys.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), noKeys.toString());
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
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
