package com.dongkuk.dmes.mdm.dme;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.RuleSetSimulateTest;
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
    private static final String STD_ADMIN = "MDM_STD_ADMIN";

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
        // 적중 정책은 싣지 않는다 — 비우면 저장된 값을 쓴다(D-133). 싣는 경로는 아래 적중 정책 시험이 본다.
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "HTTP_JDG").put("ver", 1)
                .put("rowVersion", rowVersion);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("rowId", -1).put("rowKind", "NORMAL")
                .put("cells", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"val\":\"A\"}}").put("note", "첫 행");
        rows.addObject().put("rowId", -2).put("rowKind", "NORMAL").put("cells", "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"val\":\"B\"}}");
        return body;
    }

    private ObjectNode versionBody(long rowVersion) {
        return envelope("ruleMng", json.createObjectNode().put("maruRuleId", "HTTP_JDG").put("ver", 1).put("rowVersion", rowVersion));
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

    /**
     * D-133 — 표 저장(part TABLE)이 적중 정책을 params 로 받아 표와 함께 저장한다(실제 BPMN·DTO 바인딩). 옛 ruleMng save target VERSION
     * 은 없어졌으므로 거부된다.
     */
    @Test
    void 표_저장은_적중_정책을_함께_받고_룰_화면의_VERSION_저장은_거부된다() throws Exception {
        registerByKim();
        ObjectNode body = tableBody(0);
        ((ObjectNode) body.path("params")).put("hitPolicy", "UNIQUE");

        JsonNode save = post("ruleEdit", "save", "kim", body);

        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        assertEquals("UNIQUE", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG' AND VER = 1", String.class));

        JsonNode old = post("ruleMng", "save", "kim", envelope("ruleMng", json.createObjectNode().put("target", "VERSION")
                .put("maruRuleId", "HTTP_JDG").put("ver", 1).put("rowVersion", 1).put("hitPolicy", "FIRST")));
        assertFalse(old.path("meta").path("success").asBoolean(true), old.toString());
        assertEquals("UNIQUE", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG' AND VER = 1", String.class));
    }

    /** TSK-08-04 — 값 테스트(execute)는 실제 BPMN 을 타고 원장에 쓰지 않는다. 비소유 담당자도 부른다(D3). BODY 행은 grids.rows.rows. */
    @Test
    void 값_테스트는_저장된_버전과_편집_본문을_판정하고_비소유_담당자도_부른다() throws Exception {
        registerByKim();
        assertTrue(post("ruleEdit", "save", "kim", tableBody(0)).path("meta").path("success").asBoolean(false));

        JsonNode version = post("ruleEdit", "execute", "lee", envelope("ruleEdit", json.createObjectNode().put("maruRuleId", "HTTP_JDG")
                .put("target", "VERSION").put("ver", 1).put("inputJson", "{\"COIL_THK\":\"3\"}")));
        assertTrue(version.path("meta").path("success").asBoolean(false), version.toString());
        JsonNode v = version.path("data").path("result");
        assertEquals("OK", v.path("outcome").asText(), version.toString());
        assertEquals("B", v.path("results").path("GRD").asText(), version.toString());
        assertEquals(2, v.path("hits").path(0).path("rowId").asInt(), version.toString());
        assertEquals("COIL_THK", v.path("contract").path("always").path(0).asText(), version.toString());

        ObjectNode params = json.createObjectNode().put("maruRuleId", "HTTP_JDG").put("target", "BODY").put("ver", 1).put("hitPolicy", "UNIQUE")
                .put("inputJson", "{\"COIL_THK\":\"2\"}").put("runCases", true);
        ObjectNode body = envelope("ruleEdit", params);
        body.putObject("grids").putObject("rows").putArray("rows").addObject().put("rowId", -1).put("rowKind", "NORMAL")
                .put("cells", "{\"1\":{\"op\":\"GE\",\"left\":\"1.9\"},\"2\":{\"val\":\"Z\"}}");
        JsonNode edited = post("ruleEdit", "execute", "kim", body);
        assertTrue(edited.path("meta").path("success").asBoolean(false), edited.toString());
        JsonNode b = edited.path("data").path("result");
        assertEquals("Z", b.path("results").path("GRD").asText(), edited.toString());
        assertEquals(-1, b.path("hits").path(0).path("rowId").asInt(), edited.toString());
        assertTrue(b.path("cases").isArray() && b.path("cases").isEmpty(), edited.toString());
        assertEquals(2, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'HTTP_JDG'"), "원장에 쓰지 않는다");
        assertEquals(1L, DmeTestSupport.rowVersion(jdbc, "HTTP_JDG", 1));
    }

    @Test
    void 다른_담당자는_읽기만_되고_쓰기는_모두_MDM003_이다() throws Exception {
        registerByKim();
        assertTrue(post("ruleEdit", "save", "kim", tableBody(0)).path("meta").path("success").asBoolean(false));

        JsonNode view = post("ruleEdit", "view", "lee", envelope("ruleEdit", json.createObjectNode().put("maruRuleId", "HTTP_JDG")));
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertFalse(view.path("data").path("result").path("editable").asBoolean(true), view.toString());

        ObjectNode header = envelope("ruleMng", json.createObjectNode().put("target", "HEADER").put("maruRuleId", "HTTP_JDG")
                .put("maruRuleName", "이가 바꿈"));
        ObjectNode delete = versionBody(1);
        ((ObjectNode) delete.path("params")).put("target", "VERSION");
        ObjectNode handover = versionBody(1);
        ((ObjectNode) handover.path("params")).put("newOwnerId", "lee");
        // D-105 — HEADER 저장·버전 조작은 ruleMng 화면이 한다(ruleEdit 아님).
        String[][] calls = {{"ruleEdit", "save"}, {"ruleMng", "save"}, {"ruleMng", "delete"},
                {"ruleMng", "unlock"}, {"ruleMng", "handover"}};
        ObjectNode[] bodies = {tableBody(1), header, delete, versionBody(1), handover};
        for (int i = 0; i < calls.length; i++) {
            JsonNode body = post(calls[i][0], calls[i][1], "lee", bodies[i]);
            String label = calls[i][0] + " " + calls[i][1];
            assertFalse(body.path("meta").path("success").asBoolean(true), label + " " + body);
            assertTrue(body.path("meta").path("message").asText().startsWith(MdmErrorCode.NOT_DRAFT_OWNER.defaultMessage()),
                    label + " " + body);
            assertEquals("MDM003", body.path("meta").path("code").asText(), label + " " + body);
        }
        assertEquals(1L, DmeTestSupport.rowVersion(jdbc, "HTTP_JDG", 1));
        assertEquals("HTTP 판정", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));
        assertEquals("kim", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));
    }

    @Test
    void 헤더_저장은_grids_없이_되고_해제_선점은_새_row_version_을_돌려준다() throws Exception {
        registerByKim();
        JsonNode header = post("ruleMng", "save", "kim", envelope("ruleMng", json.createObjectNode().put("target", "HEADER")
                .put("maruRuleId", "HTTP_JDG").put("maruRuleName", "HTTP 판정 바꿈").put("auditVer", 0L)));
        assertTrue(header.path("meta").path("success").asBoolean(false), header.toString());
        assertEquals("HTTP 판정 바꿈", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));

        JsonNode unlock = post("ruleMng", "unlock", "kim", versionBody(0));
        assertTrue(unlock.path("meta").path("success").asBoolean(false), unlock.toString());
        assertEquals(1, unlock.path("data").path("result").path("rowVersion").asInt(), unlock.toString());
        JsonNode lock = post("ruleMng", "lock", "lee", versionBody(1));
        assertTrue(lock.path("meta").path("success").asBoolean(false), lock.toString());
        assertEquals(2, lock.path("data").path("result").path("rowVersion").asInt(), lock.toString());
        assertEquals("lee", jdbc.queryForObject("SELECT OWNER_ID FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'HTTP_JDG'", String.class));

        JsonNode search = post("ruleEdit", "search", "lee", envelope("ruleEdit", json.createObjectNode().put("keyword", "HTTP")));
        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        assertEquals("HTTP_JDG", search.path("data").path("result").path("list").path(0).path("maruRuleId").asText(), search.toString());
        JsonNode copy = post("ruleMng", "copy", "lee", versionBody(2));
        assertFalse(copy.path("meta").path("success").asBoolean(true), "미적용 버전이 있어 새 버전은 거부(MDM006): " + copy);
        assertTrue(copy.path("meta").path("message").asText().startsWith(MdmErrorCode.UNAPPLIED_VERSION_EXISTS.defaultMessage()), copy.toString());
        assertEquals("MDM006", copy.path("meta").path("code").asText(), copy.toString());
    }

    /** row_version 충돌은 OASIS 응답 meta.code 가 MDM001 이다(2026-10-05 — 예전에는 S001 이라 화면이 문구로 판정했다). */
    @Test
    void row_version_충돌은_meta_code_MDM001_로_온다() throws Exception {
        registerByKim();

        JsonNode stale = post("ruleMng", "unlock", "kim", versionBody(7));

        assertFalse(stale.path("meta").path("success").asBoolean(true), stale.toString());
        assertEquals("MDM001", stale.path("meta").path("code").asText(), stale.toString());
        assertTrue(stale.path("meta").path("message").asText().startsWith(MdmErrorCode.ROW_VERSION_CONFLICT.defaultMessage()), stale.toString());
        assertEquals("MDM001", stale.path("errors").path(0).path("code").asText(), stale.toString());
    }

    /** 새 버전의 verKind 가 BPMN dto 바인딩을 거쳐 서비스까지 닿는다(바인딩이 빠지면 minor 가 조용히 major 가 된다). */
    @Test
    void 새_버전은_verKind_MINOR_를_받아_minor_번호로_만든다() throws Exception {
        registerByKim();
        jdbc.update("UPDATE TB_MDM_RULE_VER SET STATUS = 'RELEASED', APPLY_FROM = '2026-01-01 00:00:00', APPLY_TO = '9999-12-31 00:00:00' "
                + "WHERE MARU_RULE_ID = 'HTTP_JDG' AND VER = 1");
        ObjectNode body = versionBody(0);
        ((ObjectNode) body.path("params")).put("verKind", "MINOR");

        JsonNode copy = post("ruleMng", "copy", "lee", body);

        assertTrue(copy.path("meta").path("success").asBoolean(false), copy.toString());
        JsonNode result = copy.path("data").path("result");
        assertEquals("1.001", result.path("ver").asText(), copy.toString());
        assertEquals("MINOR", result.path("verKind").asText(), copy.toString());
    }

    /** requireVer 경로 — 지수 표기 버전은 MDM021(INVALID_INPUT) 로 거부된다. */
    @Test
    void 지수_표기_버전은_MDM021_로_거부된다() throws Exception {
        registerByKim();
        ObjectNode body = versionBody(0);
        ((ObjectNode) body.path("params")).put("ver", "1e999999999");

        JsonNode unlock = post("ruleMng", "unlock", "kim", body);

        assertFalse(unlock.path("meta").path("success").asBoolean(true), unlock.toString());
        assertTrue(unlock.path("meta").path("message").asText().startsWith(MdmErrorCode.INVALID_INPUT.defaultMessage()), unlock.toString());
        assertEquals("MDM021", unlock.path("meta").path("code").asText(), unlock.toString());
    }

    /** TSK-08-03 — COLUMNS 저장의 배열(prioList)·boolean(deleted) 이 grids.rows.rows 안에서 바인딩되는지(B4 류 오류를 E2E 전에 잡는다). */
    @Test
    void 열_설정_COLUMNS_저장은_grids_rows_로_바인딩되어_반영된다() throws Exception {
        registerByKim();
        ObjectNode body = envelope("ruleEdit", json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "HTTP_JDG")
                .put("ver", 1).put("rowVersion", 0));
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", 1).put("varKind", "COND").put("dispType", "2").put("varName", "COIL_THK");
        ObjectNode result = rows.addObject().put("varId", 2).put("varKind", "RESULT").put("dispType", "Value").put("varName", "GRD")
                .put("dataType", "STRING");
        result.putArray("prioList");
        rows.addObject().put("varId", -1).put("varKind", "RESULT").put("dispType", "Value").put("varName", "TMP_DEL")
                .put("dataType", "STRING").put("deleted", true);

        JsonNode save = post("ruleEdit", "save", "kim", body);

        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        assertEquals(2, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'HTTP_JDG'"),
                "deleted:true 줄은 반영되지 않는다");
        assertEquals("COND", jdbc.queryForObject("SELECT VAR_KIND FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'HTTP_JDG' AND VAR_ID = 1", String.class));
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

    /** VER 1 RELEASED 룰 — 이름 조건 열 하나와 STRING 결과 열 하나(TSK-08-06). */
    private void releasedRule(String id, String cond, String result) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, 1, 1, "COND", "1", cond, 1);
        DmeTestSupport.var(jdbc, id, 1, 2, "RESULT", "Value", result, 1, "STRING");
    }

    /** ruleSetEdit save 본문 — 룰 목록은 params 가 아니라 grids.rules.rows 로 보낸다(TSK-08-06 design F14). */
    /** 세트 저장 본문 — 버전은 ruleSetMng.reg 가 만든 등록자 DRAFT {@code 1.000}(D-144 2단계). */
    private ObjectNode setSaveBody(String setId, long rowVersion, String... ruleIds) {
        ObjectNode params = json.createObjectNode().put("setId", setId).put("ver", "1.000").put("setName", "HTTP 세트")
                .put("description", "HTTP 경로").put("rowVersion", rowVersion);
        ObjectNode body = envelope("ruleSetEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rules").putArray("rows");
        for (String id : ruleIds) {
            rows.addObject().put("ruleId", id);
        }
        return body;
    }

    private String setRuleIds(String setId) {
        return DmeTestSupport.setVerValue(jdbc, setId, "1.000", "RULE_IDS");
    }

    /** TSK-08-06 수용 기준 1·3 — ruleSetMng reg 로 빈 세트를 만들고 ruleSetEdit save 가 grids.rules.rows 의 순서대로 저장한다. 순환은 MDM024. */
    @Test
    void 룰_세트는_등록하고_grids_rules_rows_로_저장하며_순환_목록은_거부된다() throws Exception {
        releasedRule("HTTP_GRD", "COIL_THK", "HTTP_G");
        releasedRule("HTTP_FCT", "HTTP_G", "HTTP_F");
        releasedRule("HTTP_CYA", "HTTP_CB", "HTTP_CA");
        releasedRule("HTTP_CYB", "HTTP_CA", "HTTP_CB");

        JsonNode reg = post("ruleSetMng", "reg", "kim", envelope("ruleSetMng",
                json.createObjectNode().put("setId", "HTTP_SET").put("setName", "HTTP 세트")));
        assertTrue(reg.path("meta").path("success").asBoolean(false), reg.toString());
        assertEquals("HTTP_SET", reg.path("data").path("result").path("setId").asText(), reg.toString());
        assertEquals(0, reg.path("data").path("result").path("rowVersion").asInt(-1), reg.toString());
        assertEquals("1.000", reg.path("data").path("result").path("ver").asText(), reg.toString());
        assertEquals("[]", setRuleIds("HTTP_SET"));

        JsonNode save = post("ruleSetEdit", "save", "kim", setSaveBody("HTTP_SET", 0, "HTTP_GRD", "HTTP_FCT"));
        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        assertEquals(1, save.path("data").path("result").path("rowVersion").asInt(), save.toString());
        assertEquals(List.of("HTTP_GRD", "HTTP_FCT"),
                List.of(json.readValue(setRuleIds("HTTP_SET"), String[].class)), "요청 순서 그대로");
        assertEquals("kim", jdbc.queryForObject("SELECT U_USR_ID FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'HTTP_SET'", String.class));

        JsonNode cycle = post("ruleSetEdit", "save", "kim", setSaveBody("HTTP_SET", 1, "HTTP_CYA", "HTTP_CYB"));
        assertFalse(cycle.path("meta").path("success").asBoolean(true), cycle.toString());
        String message = cycle.path("meta").path("message").asText();
        assertTrue(message.startsWith(MdmErrorCode.RULE_SET_SAVE_REJECTED.defaultMessage()), message);
        assertTrue(message.contains("CYCLE") && message.contains("순환"), message);
        assertEquals(1L, Long.parseLong(DmeTestSupport.setVerValue(jdbc, "HTTP_SET", "1.000", "ROW_VERSION")));
        assertEquals(List.of("HTTP_GRD", "HTTP_FCT"), List.of(json.readValue(setRuleIds("HTTP_SET"), String[].class)));

        JsonNode search = post("ruleSetMng", "search", "lee", envelope("ruleSetMng",
                json.createObjectNode().put("keyword", "HTTP").put("page", 0).put("size", 20)));
        assertTrue(search.path("meta").path("success").asBoolean(false), search.toString());
        JsonNode result = search.path("data").path("result");
        assertEquals(1, result.path("totalCount").asInt(), search.toString());
        JsonNode row = result.path("rows").path(0);
        assertEquals("HTTP_SET", row.path("setId").asText(), search.toString());
        assertEquals(2, row.path("ruleCount").asInt(), search.toString());
        assertEquals("HTTP_F", row.path("finalResults").path(0).asText(), search.toString());
        assertEquals(0, row.path("rejectCount").asInt(-1), search.toString());

        JsonNode view = post("ruleSetEdit", "view", "lee", envelope("ruleSetEdit", json.createObjectNode().put("setId", "HTTP_SET")));
        assertTrue(view.path("meta").path("success").asBoolean(false), view.toString());
        assertEquals("HTTP_GRD", view.path("data").path("result").path("rules").path(0).path("ruleId").asText(), view.toString());
    }

    /** 흐름도 2단계 Task 1 — 화면 모양 그대로 params.flowJson 문자열만 싣는다(Map 은 OASIS 가 S999 로 거부한다, D-111). */
    @Test
    void 흐름은_flowJson_문자열_하나로_저장되고_정규_JSON_이_남는다() throws Exception {
        releasedRule("HTTP_GRD", "COIL_THK", "HTTP_G");
        releasedRule("HTTP_FCT", "HTTP_G", "HTTP_F");
        assertTrue(post("ruleSetMng", "reg", "kim", envelope("ruleSetMng",
                json.createObjectNode().put("setId", "HTTP_SET").put("setName", "HTTP 세트"))).path("meta").path("success").asBoolean(false));
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"HTTP_GRD\"},"
                + "{\"id\":\"if1\",\"kind\":\"IF\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"HTTP_FCT\"},"
                + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"if1\"},"
                + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"order\":1,\"cond\":\"COIL_THK > 1\"},"
                + "{\"id\":\"e4\",\"from\":\"if1\",\"to\":\"m1\",\"otherwise\":true},"
                + "{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"end\"}],"
                + "\"view\":{\"positions\":{\"r1\":{\"x\":10,\"y\":20}},\"notes\":[],\"groups\":[]}}";
        ObjectNode params = json.createObjectNode().put("setId", "HTTP_SET").put("ver", "1.000").put("setName", "HTTP 세트")
                .put("rowVersion", 0).put("flowJson", flow);

        JsonNode save = post("ruleSetEdit", "save", "kim", envelope("ruleSetEdit", params));

        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        String stored = DmeTestSupport.setVerValue(jdbc, "HTTP_SET", "1.000", "FLOW_JSON");
        JsonNode f = json.readTree(stored);
        assertTrue(f.path("edges").path(2).path("order").isInt(), stored);
        assertEquals(1, f.path("edges").path(2).path("order").asInt(), stored);
        assertTrue(f.path("edges").path(3).path("otherwise").isBoolean() && f.path("edges").path(3).path("otherwise").asBoolean(), stored);
        assertTrue(f.path("view").path("positions").path("r1").path("x").isNumber(), stored);
    }

    /**
     * 흐름도 2단계 P5·§9.1-2 — 디버거 기록 실행(execute → simulate)·조건식 IO(validate → condIo)는 화면이 보낼 모양 그대로 params 에 문자열
     * (flowJson·recordJson·evalTs)만 싣고 grids 는 두지 않는다. HTTP 로 받은 기록은 엔진 스키마 RunTrace 를 따르고 골든 사례와 JSON 이 같다 — 전송
     * 직렬화가 null 칸을 버리거나 모양을 바꾸면 여기서 잡힌다. READ 역할의 거부는 BFF RBAC(403) 몫이라 여기 두지 않는다.
     */
    @Test
    void 기록_실행과_조건식_IO_는_문자열_params_로_부르고_기록은_엔진_스키마와_골든_그대로_온다() throws Exception {
        RuleSetSimulateTest.seedGolden(jdbc);
        JsonNode golden = RuleSetSimulateTest.readGolden().get("IF_FIRST_TRUE");
        ObjectNode params = json.createObjectNode().put("flowJson", golden.path("flowJson").asText())
                .put("recordJson", golden.path("recordJson").asText()).put("evalTs", golden.path("evalTs").asText());

        JsonNode exec = post("ruleSetEdit", "execute", "kim", envelope("ruleSetEdit", params));

        assertTrue(exec.path("meta").path("success").asBoolean(false), exec.toString());
        JsonNode trace = exec.path("data").path("result").path("trace");
        List<String> nodeIds = new java.util.ArrayList<>();
        trace.path("nodes").forEach(n -> nodeIds.add(n.path("nodeId").asText()));
        assertEquals(List.of("start", "r1", "if1", "r2", "m1", "end"), nodeIds, trace.toString());
        assertEquals(java.util.Set.of(), RuleSetSimulateTest.RUN_TRACE_SCHEMA.validate(trace), trace.toString());
        RuleSetSimulateTest.assertSameJson(golden.path("response").path("trace"), trace, "trace");
        assertEquals(golden.path("response").path("warnings"), exec.path("data").path("result").path("warnings"));

        JsonNode validate = post("ruleSetEdit", "validate", "kim", envelope("ruleSetEdit",
                json.createObjectNode().put("flowJson", golden.path("flowJson").asText())));
        assertTrue(validate.path("meta").path("success").asBoolean(false), validate.toString());
        assertTrue(validate.path("data").path("result").path("condIo").path("e3").path("ok").asBoolean(false), validate.toString());
    }

    /**
     * 4단계 E4 — 고친 값은 execute params 의 editsJson 문자열로 받는다. BPMN execute 는 dto 클래스로 바인딩하므로 DTO 필드만 더해 전달된다
     * (BPMN 입력을 더하지 않는다). 받은 기록은 엔진 스키마 RunTrace 를 따르고 trace.edits 로 고친 값을 되돌려 준다.
     */
    @Test
    void 기록_실행은_editsJson_문자열로_고친_값을_끼워_다시_실행한다() throws Exception {
        RuleSetSimulateTest.seedGolden(jdbc);
        JsonNode golden = RuleSetSimulateTest.readGolden().get("IF_FIRST_TRUE");
        ObjectNode params = json.createObjectNode().put("flowJson", golden.path("flowJson").asText())
                .put("recordJson", golden.path("recordJson").asText()).put("evalTs", golden.path("evalTs").asText())
                .put("editsJson", RuleSetSimulateTest.EDIT_IF1_B);

        JsonNode exec = post("ruleSetEdit", "execute", "kim", envelope("ruleSetEdit", params));

        assertTrue(exec.path("meta").path("success").asBoolean(false), exec.toString());
        JsonNode trace = exec.path("data").path("result").path("trace");
        List<String> nodeIds = new java.util.ArrayList<>();
        trace.path("nodes").forEach(n -> nodeIds.add(n.path("nodeId").asText()));
        assertEquals(List.of("start", "r1", "if1", "r3", "m1", "end"), nodeIds, trace.toString());
        assertEquals("if1", trace.path("edits").path(0).path("nodeId").asText(), trace.toString());
        assertEquals("B", trace.path("edits").path(0).path("values").path("GT_G").path("value").asText(), trace.toString());
        assertEquals(java.util.Set.of(), RuleSetSimulateTest.RUN_TRACE_SCHEMA.validate(trace), trace.toString());
    }

    /**
     * 흐름도 3단계 P7 — 케이스 저장(save part=CASE)·조회(view cases)·일괄 실행(execute runCases)·식 파싱(validate exprText)도 화면이 보낼 모양
     * 그대로 params 에 문자열·스칼라만 싣는다(caseIds 는 콤마 문자열, inputJson·expectedJson 은 JSON 문자열, grids 없음).
     */
    @Test
    void 케이스는_save_part_CASE_로_저장하고_view_에_실리며_execute_runCases_로_돈다() throws Exception {
        RuleSetSimulateTest.seedGolden(jdbc);
        JsonNode golden = RuleSetSimulateTest.readGolden().get("IF_FIRST_TRUE");
        assertTrue(post("ruleSetMng", "reg", "kim", envelope("ruleSetMng",
                json.createObjectNode().put("setId", "HTTP_CASE").put("setName", "케이스 세트"))).path("meta").path("success").asBoolean(false));

        JsonNode save = post("ruleSetEdit", "save", "kim", envelope("ruleSetEdit", json.createObjectNode().put("part", "CASE")
                .put("setId", "HTTP_CASE").put("caseName", "기본").put("inputJson", "{\"GT_THK\":\"12\"}")
                .put("evalTs", "2026-06-01 09:00:00").put("expectedJson", "{\"GT_G\":\"A\",\"GT_F\":\"1\"}")));
        assertTrue(save.path("meta").path("success").asBoolean(false), save.toString());
        assertEquals(1, save.path("data").path("result").path("caseId").asInt(), save.toString());
        assertEquals(0, save.path("data").path("result").path("rowVersion").asInt(), save.toString());

        JsonNode view = post("ruleSetEdit", "view", "kim", envelope("ruleSetEdit", json.createObjectNode().put("setId", "HTTP_CASE")));
        assertEquals("기본", view.path("data").path("result").path("cases").path(0).path("caseName").asText(), view.toString());

        JsonNode exec = post("ruleSetEdit", "execute", "kim", envelope("ruleSetEdit", json.createObjectNode()
                .put("setId", "HTTP_CASE").put("flowJson", golden.path("flowJson").asText()).put("runCases", true).put("caseIds", "1")));
        assertTrue(exec.path("meta").path("success").asBoolean(false), exec.toString());
        JsonNode result = exec.path("data").path("result");
        assertTrue(result.path("cases").path(0).path("pass").asBoolean(false), exec.toString());
        assertTrue(result.path("trace").isNull() || result.path("trace").isMissingNode(), exec.toString());

        JsonNode validate = post("ruleSetEdit", "validate", "kim", envelope("ruleSetEdit",
                json.createObjectNode().put("exprText", "GT_THK > 10")));
        assertTrue(validate.path("meta").path("success").asBoolean(false), validate.toString());
        assertTrue(validate.path("data").path("result").path("expr").path("supported").asBoolean(false), validate.toString());
    }

    /**
     * P-D2 — 표준 관리자(MDM_STD_ADMIN)의 케이스 저장·삭제는 MDM013 이고 행이 그대로다. READ 역할의 execute·validate·save 403 은 BFF RBAC
     * 몫이라 여기서 만들 수 없다 — e2e E9 가 본다(권한 세트 계약은 DmeBpmnActionTest).
     */
    @Test
    void 표준_관리자는_케이스를_저장_삭제하지_못한다_MDM013() throws Exception {
        DmeTestSupport.ruleSet(jdbc, "HTTP_CASE", "케이스 세트", "[]", "INUSE", 0);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON) VALUES ('HTTP_CASE', 1, '있던 것', '{}')");
        String count = "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE";

        JsonNode add = post("ruleSetEdit", "save", "park", STD_ADMIN, envelope("ruleSetEdit", json.createObjectNode().put("part", "CASE")
                .put("setId", "HTTP_CASE").put("caseName", "새것").put("inputJson", "{}")));
        assertFalse(add.path("meta").path("success").asBoolean(true), add.toString());
        assertTrue(add.path("meta").path("message").asText().startsWith(MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), add.toString());
        assertEquals(1, DmeTestSupport.count(jdbc, count));

        JsonNode del = post("ruleSetEdit", "save", "park", STD_ADMIN, envelope("ruleSetEdit", json.createObjectNode().put("part", "CASE")
                .put("setId", "HTTP_CASE").put("caseId", 1).put("rowVersion", 0).put("caseDeleted", true)));
        assertFalse(del.path("meta").path("success").asBoolean(true), del.toString());
        assertTrue(del.path("meta").path("message").asText().startsWith(MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), del.toString());
        assertEquals(1, DmeTestSupport.count(jdbc, count));
    }

    /** TSK-08-06 I19 — 담당자 역할이 없는 사용자의 세트 등록·저장은 서버가 MDM013 으로 막는다(BFF RBAC 403 은 e2e 가 본다). */
    @Test
    void 담당자_역할이_없으면_룰_세트_등록과_저장이_MDM013_이다() throws Exception {
        releasedRule("HTTP_GRD", "COIL_THK", "HTTP_G");
        DmeTestSupport.ruleSet(jdbc, "HTTP_SET", "HTTP 세트", "[]", "INUSE", 0);

        JsonNode reg = post("ruleSetMng", "reg", "park", STD_ADMIN, envelope("ruleSetMng",
                json.createObjectNode().put("setId", "HTTP_NEW").put("setName", "새 세트")));
        assertFalse(reg.path("meta").path("success").asBoolean(true), reg.toString());
        assertTrue(reg.path("meta").path("message").asText().startsWith(MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), reg.toString());
        assertEquals(0, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'HTTP_NEW'"));

        JsonNode save = post("ruleSetEdit", "save", "park", STD_ADMIN, setSaveBody("HTTP_SET", 0, "HTTP_GRD"));
        assertFalse(save.path("meta").path("success").asBoolean(true), save.toString());
        assertTrue(save.path("meta").path("message").asText().startsWith(MdmErrorCode.STEWARD_ROLE_REQUIRED.defaultMessage()), save.toString());
        assertEquals("[]", setRuleIds("HTTP_SET"));
    }

    private ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    private JsonNode post(String service, String action, String user, ObjectNode body) throws IOException, InterruptedException {
        return post(service, action, user, STEWARD, body);
    }

    private JsonNode post(String service, String action, String user, String role, ObjectNode body) throws IOException, InterruptedException {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", user)
                .header("X-Authenticated-Role", role)
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
