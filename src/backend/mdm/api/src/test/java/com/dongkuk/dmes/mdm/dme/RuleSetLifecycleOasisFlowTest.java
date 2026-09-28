package com.dongkuk.dmes.mdm.dme;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
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
 * TSK-09-02 design.md §3(B3-2) — {@code BASE_SPD_LKP}·{@code SPD_EXC}·{@code SPD_JOIN}이 실제 화면 경로(ruleMng.reg →
 * ruleEdit.save COLUMNS·TABLE → ruleEdit.execute runCases → ruleConfirm.confirm)로 등록·확정되고, {@code ruleSetMng.reg} +
 * {@code ruleSetEdit.save}로 세트 {@code LS_A3}(순서 BASE_SPD_LKP → SPD_EXC → SPD_JOIN)가 구조 검사 4개(순서·순환·미지 입력·
 * 중복 대입, {@code RuleSetAnalyzer})를 통과해 등록되는지 확인한다({@code TermDomainColumnChainOasisFlowTest} 골격 복제 —
 * 여러 화면(ruleMng·ruleEdit·ruleConfirm·ruleSetMng·ruleSetEdit)에 걸치는 이음매라 개별 화면 패키지가 아니라 {@code dme} 최상위에 둔다).
 *
 * <p><b>설계 이탈</b>(build-log.md 「설계 이탈」 참조) — {@code SPD_EXC}는 엔진 fixture({@code SampleRules.spdExc()})에서
 * {@code exprCondVar}(변수명 없는 "Expression 조건 열", 행마다 독립된 불린 식 셀)로 정의돼 있지만, 이 시험을 쓸 때의
 * {@code RuleColumnsService}는 COND 열의 dispType이 {@code Expression}이면 그 {@code varName} 자체를 식으로 파싱해 저장했다
 * ("식 변수" 경로). 2026-09-28 결정으로 변수 칸에는 이름만 받고 Expression 조건 열은 변수 칸을 비워 저장하게 바뀌었지만, 이 시험은
 * 생애주기만 보므로 같은 선택 결과를 내는 동치 조건(이름 있는 COND 열 COIL_WID·BASE_SPD, 행마다 다른 임계값 op 셀)으로 짠
 * SPD_EXC를 그대로 둔다. 세트 값 판정 자체(엔진 레벨 {@code evaluateSet})는 {@code SampleRuleSetValueTest}가 원래 fixture로 확정한다
 * — 이 시험은 "편집→저장→확정→세트 등록"이라는 생애주기만 본다(design.md §3 B3-3).
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + RuleSetLifecycleOasisFlowTest.CLIENT_KEY)
@ActiveProfiles("local")
class RuleSetLifecycleOasisFlowTest {

    static final String CLIENT_KEY = "mdm-dme-set-lifecycle-test-client-key";
    private static final String STEWARD = "MDM_STEWARD";
    private static final String KIM = "kim";
    private static final String APPLY_FROM = "2026-01-01 00:00:00";

    /** SampleRules.THK_BANDS(kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules) 그대로 — 두께 구간 7개. */
    private static final String[][] THK_BANDS = {
        {"< 변수 <=", "0", "0.5"},
        {"< 변수 <", "0.5", "0.6"},
        {"<= 변수 <", "0.6", "0.7"},
        {"<= 변수 <", "0.7", "0.8"},
        {"<= 변수 <", "0.8", "0.9"},
        {"<= 변수 <", "0.9", "1"},
        {"<= 변수 <=", "1", "1.2"},
    };

    /** SampleRules.SPD_VALS 그대로 — 행마다 TEXTURE AKZO FLUORO WXL1 WXL2 BACK1 BACK2 GENERAL. */
    private static final String[][] SPD_VALS = {
        {"100", "100", "90", "110", "110", "110", "110", "120"},
        {"100", "100", "90", "110", "110", "110", "110", "110"},
        {"90", "90", "80", "100", "100", "100", "100", "100"},
        {"80", "80", "70", "90", "90", "90", "90", "90"},
        {"70", "70", "60", "80", "80", "80", "80", "80"},
        {"60", "60", "50", "70", "70", "70", "70", "70"},
        {"50", "50", "50", "70", "70", "60", "60", "60"},
    };

    /** SampleRules.baseSpdLkp() 그대로 — 결과 열 그룹 이름·열 조건. */
    private static final String[][] GROUP_COLS = {
        {"TEXTURE", "STR_STARTS_WITH(TOP_RESIN_CD, \"2\")"},
        {"AKZO", "STR_STARTS_WITH(TOP_RESIN_CD, \"6\")"},
        {"FLUORO", "TOP_RESIN_CD == \"F\""},
        {"WXL1", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"1\""},
        {"WXL2", "STR_STARTS_WITH(TOP_RESIN_CD, \"W\") && COAT_SIDE == \"2\""},
        {"BACK1", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"1\""},
        {"BACK2", "STR_STARTS_WITH(TOP_RESIN_CD, \"B\") && COAT_SIDE == \"2\""},
        {"GENERAL", null},
    };

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
        Path dbFile = tempDir.resolve("mdm-rule-set-lifecycle-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        // BASE_SPD_LKP 그룹 결과 열의 grpCond 식이 참조하는 이름 — grpCond 파싱은 참조 변수가 컬럼 사전에 있어야 한다
        // (RuleColumnsServiceTest 「그룹은 FIRST·UNIQUE...」 seedGroup()과 같은 이유).
        DmeTestSupport.column(jdbc, "TOP_RESIN_CD", DmeTestSupport.domain(jdbc, "TOP_RESIN_CD_D", "TEXT", "STRING", null));
        DmeTestSupport.column(jdbc, "COAT_SIDE", DmeTestSupport.domain(jdbc, "COAT_SIDE_D", "TEXT", "STRING", null));
        // SPD_JOIN 은 BASE_SPD·EXC_SPD 를 자기 열로 선언하지 않고 앞 룰의 결과 이름을 그대로 참조한다(InputContracts.compute 의
        // externalType). 셋을 등록 순서대로 확정하기 전(BASE_SPD_LKP·SPD_EXC 가 아직 RELEASED 가 아닌 시점)에 SPD_JOIN 의 COLUMNS 를
        // 저장하므로, "다른 룰의 RELEASED 결과"로는 타입을 찾지 못해 STRING 으로 떨어진다(그 값을 MIN 에 넣으면 0 으로 조용히 죽는다) —
        // 컬럼 사전에 두 이름을 NUMBER 로 미리 선언해 등록 순서와 무관하게 타입이 정해지게 한다.
        DmeTestSupport.column(jdbc, "BASE_SPD", DmeTestSupport.domain(jdbc, "BASE_SPD_D", "QTY", "NUMBER", 0));
        DmeTestSupport.column(jdbc, "EXC_SPD", DmeTestSupport.domain(jdbc, "EXC_SPD_D", "QTY", "NUMBER", 0));
    }

    @Test
    void BASE_SPD_LKP_SPD_EXC_SPD_JOIN_이_편집_확정을_거쳐_LS_A3_세트로_등록된다() throws Exception {
        // ── 1. BASE_SPD_LKP — 등록 → COLUMNS(두께 1열 + 그룹 결과 8열) → TABLE(7행, UNIQUE) → CASE → 값 테스트 ──
        register("BASE_SPD_LKP", "기본 L/S 조회", "DECISION");
        JsonNode baseCols = saveBaseSpdColumns();
        int thkVarId = baseCols.path("data").path("result").path("rowIdMap").path("-1").asInt();
        int[] groupVarIds = new int[GROUP_COLS.length];
        for (int i = 0; i < GROUP_COLS.length; i++) {
            groupVarIds[i] = baseCols.path("data").path("result").path("rowIdMap").path(String.valueOf(-(i + 2))).asInt();
        }
        long baseRv = baseCols.path("data").path("result").path("rowVersion").asLong();
        baseRv = saveBaseSpdTable(thkVarId, groupVarIds, baseRv);
        saveCase("BASE_SPD_LKP", "TEXTURE 대표값", "{\"COIL_THK\":\"0.65\",\"TOP_RESIN_CD\":\"2A\",\"COAT_SIDE\":\"1\"}",
                "{\"BASE_SPD\":90}");
        assertCasePasses("BASE_SPD_LKP", 1, "{\"COIL_THK\":\"0.65\",\"TOP_RESIN_CD\":\"2A\",\"COAT_SIDE\":\"1\"}");

        // ── 2. SPD_EXC — 등록 → COLUMNS(이름 있는 조건 열 COIL_WID·BASE_SPD + 결과 EXC_SPD) → TABLE(2행, COLLECT) → CASE ──
        // 설계 이탈(클래스 Javadoc) — engine SampleRules.spdExc()의 exprCondVar 대신 동치인 이름 있는 조건 열로 다시 짠다.
        register("SPD_EXC", "라인 예외 속도", "DECISION");
        JsonNode excCols = saveExcColumns();
        int coilWidVarId = excCols.path("data").path("result").path("rowIdMap").path("-1").asInt();
        int baseSpdVarId = excCols.path("data").path("result").path("rowIdMap").path("-2").asInt();
        int excSpdVarId = excCols.path("data").path("result").path("rowIdMap").path("-3").asInt();
        long excRv = excCols.path("data").path("result").path("rowVersion").asLong();
        excRv = saveExcTable(coilWidVarId, baseSpdVarId, excSpdVarId, excRv);
        saveCase("SPD_EXC", "두_행_모두_적중", "{\"BASE_SPD\":\"90\",\"COIL_WID\":\"1300\"}", "{\"EXC_SPD\":[70,85]}");
        assertCasePasses("SPD_EXC", 1, "{\"BASE_SPD\":\"90\",\"COIL_WID\":\"1300\"}");

        // ── 3. SPD_JOIN — 등록(DERIVE) → COLUMNS(결과 식 LINE_SPD, 행은 COLUMNS 저장이 자동 생성) → CASE ──
        register("SPD_JOIN", "라인 속도 결합", "DERIVE");
        long joinRv = saveJoinColumns();
        // JSON 에 키 자체가 없으면 EvalEx 가 "변수 없음" 오류를 낸다 — NULL 가드(IF(EXC_SPD == NULL, ...))를 타려면 키는 두고 값만
        // NULL 이어야 한다(evaluateSet 이 SPD_EXC 결과를 그대로 ctx 에 놓는 것과 같은 모양, SampleRuleSetValueTest 참고).
        saveCase("SPD_JOIN", "예외_없음", "{\"BASE_SPD\":\"90\",\"EXC_SPD\":null}", "{\"LINE_SPD\":90}");
        // TSK-08-04 반려 재작업(1회차) — MIN(BASE_SPD, EXC_SPD) 분기(EXC_SPD 가 NULL 이 아닌 경우)도 이 OASIS 경로로 확인한다(DF-3 해소).
        saveCase("SPD_JOIN", "예외_있음_MIN", "{\"BASE_SPD\":\"90\",\"EXC_SPD\":\"70\"}", "{\"LINE_SPD\":70}");
        assertCasePasses("SPD_JOIN", 1, "{\"BASE_SPD\":\"90\",\"EXC_SPD\":null}");

        // ── 4. 셋 다 RELEASED 로 확정(TEST_CASES 재실행 포함) ──
        confirm("BASE_SPD_LKP", baseRv);
        confirm("SPD_EXC", excRv);
        confirm("SPD_JOIN", joinRv);
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'BASE_SPD_LKP'", String.class));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'SPD_EXC'", String.class));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'SPD_JOIN'", String.class));

        // ── 5. ruleSetMng.reg + ruleSetEdit.save — LS_A3(BASE_SPD_LKP → SPD_EXC → SPD_JOIN) 구조 검사 4개 통과 ──
        JsonNode setReg = post("ruleSetMng", "reg", envelope("ruleSetMng",
                json.createObjectNode().put("setId", "LS_A3").put("setName", "3CCL 라인스피드")));
        assertTrue(setReg.path("meta").path("success").asBoolean(false), setReg.toString());

        ObjectNode setParams = json.createObjectNode().put("setId", "LS_A3").put("setName", "3CCL 라인스피드")
                .put("rowVersion", 0);
        ObjectNode setBody = envelope("ruleSetEdit", setParams);
        ArrayNode ruleRows = setBody.putObject("grids").putObject("rules").putArray("rows");
        for (String ruleId : List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN")) {
            ruleRows.addObject().put("ruleId", ruleId);
        }
        JsonNode setSave = post("ruleSetEdit", "save", setBody);
        assertTrue(setSave.path("meta").path("success").asBoolean(false), setSave.toString());
        assertEquals(1, setSave.path("data").path("result").path("rowVersion").asInt(), setSave.toString());
        assertEquals(List.of("BASE_SPD_LKP", "SPD_EXC", "SPD_JOIN"),
                List.of(json.readValue(jdbc.queryForObject(
                        "SELECT RULE_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'LS_A3'", String.class), String[].class)),
                "구조 검사(순서·순환·미지 입력·중복 대입)를 통과해 요청 순서 그대로 저장된다");

        JsonNode setView = post("ruleSetEdit", "view", envelope("ruleSetEdit", json.createObjectNode().put("setId", "LS_A3")));
        assertTrue(setView.path("meta").path("success").asBoolean(false), setView.toString());
        assertEquals("BASE_SPD_LKP", setView.path("data").path("result").path("rules").path(0).path("ruleId").asText(), setView.toString());
        assertEquals("SPD_JOIN", setView.path("data").path("result").path("rules").path(2).path("ruleId").asText(), setView.toString());
    }

    // ── 1. BASE_SPD_LKP 도우미 ──────────────────────────────────────────

    private JsonNode saveBaseSpdColumns() throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "BASE_SPD_LKP").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", -1).put("varKind", "COND").put("dispType", "2").put("varName", "COIL_THK")
                .put("dataType", "NUMBER").put("axis", "NONE");
        for (int i = 0; i < GROUP_COLS.length; i++) {
            ObjectNode col = rows.addObject().put("varId", -(i + 2)).put("varKind", "RESULT").put("dispType", "Value")
                    .put("varName", GROUP_COLS[i][0]).put("dataType", "NUMBER").put("resGrp", "BASE_SPD");
            if (GROUP_COLS[i][1] != null) {
                col.put("grpCond", GROUP_COLS[i][1]);
            }
        }
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved;
    }

    private long saveBaseSpdTable(int thkVarId, int[] groupVarIds, long rowVersion) throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "BASE_SPD_LKP").put("ver", 1)
                .put("rowVersion", rowVersion).put("hitPolicy", "UNIQUE");
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        for (int i = 0; i < THK_BANDS.length; i++) {
            StringBuilder cells = new StringBuilder("{\"").append(thkVarId).append("\":{\"op\":\"").append(THK_BANDS[i][0])
                    .append("\",\"left\":\"").append(THK_BANDS[i][1]).append("\",\"right\":\"").append(THK_BANDS[i][2]).append("\"}");
            for (int j = 0; j < groupVarIds.length; j++) {
                cells.append(",\"").append(groupVarIds[j]).append("\":{\"val\":\"").append(SPD_VALS[i][j]).append("\"}");
            }
            cells.append('}');
            rows.addObject().put("rowId", -(i + 1)).put("rowKind", "NORMAL").put("cells", cells.toString());
        }
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved.path("data").path("result").path("rowVersion").asLong();
    }

    // ── 2. SPD_EXC 도우미(설계 이탈 — 이름 있는 조건 열로 재구성) ──────────

    private JsonNode saveExcColumns() throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "SPD_EXC").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", -1).put("varKind", "COND").put("dispType", "1").put("varName", "COIL_WID")
                .put("dataType", "NUMBER").put("axis", "NONE");
        rows.addObject().put("varId", -2).put("varKind", "COND").put("dispType", "1").put("varName", "BASE_SPD")
                .put("dataType", "NUMBER").put("axis", "NONE");
        rows.addObject().put("varId", -3).put("varKind", "RESULT").put("dispType", "Value").put("varName", "EXC_SPD")
                .put("dataType", "NUMBER");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved;
    }

    private long saveExcTable(int coilWidVarId, int baseSpdVarId, int excSpdVarId, long rowVersion) throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "SPD_EXC").put("ver", 1)
                .put("rowVersion", rowVersion).put("hitPolicy", "COLLECT");
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        // row1 — COIL_WID >= 1250(SampleRules.spdExc() row1). BASE_SPD 는 무관(NA).
        rows.addObject().put("rowId", -1).put("rowKind", "NORMAL")
                .put("cells", "{\"" + coilWidVarId + "\":{\"op\":\"GE\",\"left\":\"1250\"},\"" + baseSpdVarId + "\":{\"op\":\"NA\"},\""
                        + excSpdVarId + "\":{\"val\":\"70\"}}");
        // row2 — BASE_SPD > 80 && COIL_WID >= 1200(SampleRules.spdExc() row2, AND 는 행 안 조건 열 둘의 곱으로 동치).
        rows.addObject().put("rowId", -2).put("rowKind", "NORMAL")
                .put("cells", "{\"" + coilWidVarId + "\":{\"op\":\"GE\",\"left\":\"1200\"},\"" + baseSpdVarId + "\":{\"op\":\"GT\",\"left\":\"80\"},\""
                        + excSpdVarId + "\":{\"val\":\"85\"}}");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved.path("data").path("result").path("rowVersion").asLong();
    }

    // ── 3. SPD_JOIN 도우미 ──────────────────────────────────────────────

    private long saveJoinColumns() throws Exception {
        // DERIVE 결과 식은 COLUMNS 저장이 "이미 있는" NORMAL 행의 셀에 채운다(RuleColumnsServiceTest 「DERIVE(WGT_CALC 모양)」
        // seedDerive() 처럼 행이 미리 있어야 한다) — TABLE 로 빈 행부터 만든 뒤 COLUMNS 로 식을 채운다.
        ObjectNode tableParams = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "SPD_JOIN").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode tableBody = envelope("ruleEdit", tableParams);
        tableBody.putObject("grids").putObject("rows").putArray("rows")
                .addObject().put("rowId", -1).put("rowKind", "NORMAL").put("cells", "{}");
        JsonNode tableSaved = post("ruleEdit", "save", tableBody);
        assertTrue(tableSaved.path("meta").path("success").asBoolean(false), tableSaved.toString());
        long rv = tableSaved.path("data").path("result").path("rowVersion").asLong();

        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "SPD_JOIN").put("ver", 1)
                .put("rowVersion", rv);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", -1).put("varKind", "RESULT").put("dispType", "Expression").put("varName", "LINE_SPD")
                .put("dataType", "NUMBER").put("expr", "IF(EXC_SPD == NULL, BASE_SPD, MIN(BASE_SPD, EXC_SPD))");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved.path("data").path("result").path("rowVersion").asLong();
    }

    // ── 공용 ────────────────────────────────────────────────────────────

    private void register(String id, String name, String kind) throws Exception {
        ObjectNode params = json.createObjectNode().put("maruRuleId", id).put("maruRuleName", name).put("ruleKind", kind);
        JsonNode reg = post("ruleMng", "reg", envelope("ruleMng", params));
        assertTrue(reg.path("meta").path("success").asBoolean(false), reg.toString());
        assertEquals(1, reg.path("data").path("result").path("ver").asInt(), reg.toString());
    }

    private void saveCase(String ruleId, String name, String inputJson, String expectedJson) throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "CASE").put("maruRuleId", ruleId).put("caseName", name)
                .put("inputJson", inputJson).put("expectedJson", expectedJson);
        JsonNode saved = post("ruleEdit", "save", envelope("ruleEdit", params));
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
    }

    private void assertCasePasses(String ruleId, int ver, String inputJson) throws Exception {
        ObjectNode params = json.createObjectNode().put("maruRuleId", ruleId).put("target", "VERSION").put("ver", ver)
                .put("inputJson", inputJson).put("runCases", true);
        JsonNode executed = post("ruleEdit", "execute", envelope("ruleEdit", params));
        assertTrue(executed.path("meta").path("success").asBoolean(false), executed.toString());
        JsonNode cases = executed.path("data").path("result").path("cases");
        assertTrue(cases.size() > 0, executed.toString());
        for (JsonNode c : cases) {
            assertTrue(c.path("pass").asBoolean(false), ruleId + " 케이스 " + c.path("caseName").asText() + " 불일치: " + c);
        }
    }

    private void confirm(String ruleId, long rowVersion) throws Exception {
        ObjectNode params = json.createObjectNode().put("maruRuleId", ruleId).put("ver", 1).put("rowVersion", rowVersion)
                .put("applyFrom", APPLY_FROM).put("warningsAcknowledged", true);
        JsonNode confirmed = post("ruleConfirm", "confirm", envelope("ruleConfirm", params));
        assertTrue(confirmed.path("meta").path("success").asBoolean(false), confirmed.toString());
        assertEquals("RELEASED", confirmed.path("data").path("result").path("version").path("status").asText(), confirmed.toString());
    }

    private ObjectNode envelope(String menuId, ObjectNode params) {
        ObjectNode body = json.createObjectNode();
        body.putObject("meta").put("menuId", menuId);
        body.set("params", params);
        return body;
    }

    private JsonNode post(String service, String action, ObjectNode body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/oasis/" + service + "/" + action))
                .header("Content-Type", "application/json")
                .header("X-Client-Key", effectiveClientKey())
                .header("X-Authenticated-User", KIM)
                .header("X-Authenticated-Role", STEWARD)
                .POST(HttpRequest.BodyPublishers.ofString(json.writeValueAsString(body)))
                .build();
        HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode(), response.body());
        return json.readTree(response.body());
    }

    private static String effectiveClientKey() {
        String env = System.getenv("BACKEND_CLIENT_KEY");
        return (env != null && !env.isBlank()) ? env : CLIENT_KEY;
    }
}
