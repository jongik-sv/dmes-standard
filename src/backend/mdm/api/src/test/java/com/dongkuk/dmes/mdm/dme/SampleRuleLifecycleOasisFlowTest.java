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
 * TSK-09-02 design.md 「반려 재작업 1회차」 RR1·RR2(B4) — {@code QLTY_GRD_JDG}(DECISION, FIRST)·{@code COIL_WGT_CALC}(DERIVE)·
 * {@code PROD_WGT_CALC}(DECISION, UNIQUE) 세 룰을 자기 ID로 실제 화면 경로(ruleMng.reg → ruleEdit.save COLUMNS·TABLE →
 * ruleEdit.save CASE → ruleEdit.execute runCases → ruleConfirm.confirm)로 등록·편집·확정한다(DF-4 해소).
 * {@code RuleSetLifecycleOasisFlowTest}(B3 산출물) 골격 복제 — 세 룰이 서로 독립이라 세 화면(ruleMng·ruleEdit·ruleConfirm)에
 * 걸치는 이음매 성격이 같다.
 *
 * <p>이 시험의 값 표는 엔진 fixture {@code SampleRules.qltyGrdJdg()}·{@code coilWgtCalc()}·{@code prodWgtCalc()}(정의)와
 * {@code SampleRuleValueTest}(케이스 값)를 그대로 옮긴 것이다 — Q3'(QLTY_GRD_JDG 3행, {@code BASE_FCT=1.5})만 유일한 손 계산
 * 예외다(design.md RR2 "Q3'는 유일한 손 계산 예외다" 참조 — 원본 Q3는 {@code BASE_FCT}를 무시해도 통과하는 값이라 행별 Expression
 * 결과 셀이 참조하는 외부 변수의 타입 변환(RR-F4, 이 파일의 불변 규칙 대상)을 가려내지 못한다).
 *
 * <p><b>실패 시 처리</b>(design.md RR2) — RR-F4 위험이 실제로 발생해 어떤 케이스가 서버 판정과 어긋나면, 그 케이스는
 * {@code saveCase}로 저장하지 않고(저장하면 {@code ruleConfirm.confirm}의 TEST_CASES 재실행이 막혀 나머지 케이스·나머지 두
 * 룰까지 연쇄로 막힌다) defects.md에 DF-5로 기록한 뒤 나머지 케이스로 계속 확정까지 진행한다. 프로덕션 코드는 고치지 않는다.
 */
@SpringBootTest(webEnvironment = WebEnvironment.RANDOM_PORT,
        properties = "cactus.security.client-key=" + SampleRuleLifecycleOasisFlowTest.CLIENT_KEY)
@ActiveProfiles("local")
class SampleRuleLifecycleOasisFlowTest {

    static final String CLIENT_KEY = "mdm-dme-sample-rule-lifecycle-test-client-key";
    private static final String STEWARD = "MDM_STEWARD";
    private static final String KIM = "kim";
    private static final String APPLY_FROM = "2026-01-01 00:00:00";

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
        Path dbFile = tempDir.resolve("mdm-sample-rule-lifecycle-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc = new JdbcTemplate(dataSource);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        // RR-F5 합집합 — QLTY_GRD_JDG(BASE_FCT)·COIL_WGT_CALC(COIL_THK·COIL_WID·COIL_LEN·SPEC_GRAV)·PROD_WGT_CALC(그 넷 +
        // COIL_OUT_DIA·COIL_IN_DIA·COIL_VOID_RT·SHEET_LEN·SHEET_CNT)의 외부 변수 전부를 NUMBER 로 미리 선언한다(중복은 한 번만).
        // RR-F7 — domain 의 scale 은 판정 평가에 쓰이지 않으므로 값(2)은 임의다.
        for (String name : new String[] {"BASE_FCT", "COIL_THK", "COIL_WID", "COIL_LEN", "SPEC_GRAV", "COIL_OUT_DIA",
                "COIL_IN_DIA", "COIL_VOID_RT", "SHEET_LEN", "SHEET_CNT"}) {
            DmeTestSupport.column(jdbc, name, DmeTestSupport.domain(jdbc, name + "_D", "QTY", "NUMBER", 2));
        }
    }

    // ── QLTY_GRD_JDG(DECISION, FIRST) ──────────────────────────────────────

    @Test
    void QLTY_GRD_JDG_이_COLUMNS_TABLE_로_등록_편집되어_다섯_케이스를_통과하고_확정된다() throws Exception {
        register("QLTY_GRD_JDG", "품질 등급 판정", "DECISION");

        JsonNode cols = saveQltyColumns();
        JsonNode rowIdMap = cols.path("data").path("result").path("rowIdMap");
        int coilThkVarId = rowIdMap.path("-1").asInt();
        int coilWidVarId = rowIdMap.path("-2").asInt();
        int surfGrdVarId = rowIdMap.path("-3").asInt();
        int qltyGrdVarId = rowIdMap.path("-4").asInt();
        int prcFctVarId = rowIdMap.path("-5").asInt();
        long rv = cols.path("data").path("result").path("rowVersion").asLong();
        rv = saveQltyTable(coilThkVarId, coilWidVarId, surfGrdVarId, qltyGrdVarId, prcFctVarId, rv);

        saveCase("QLTY_GRD_JDG", "Q1_행1", "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.0\"}",
                "{\"QLTY_GRD\":\"A\",\"PRC_FCT\":1.05}");
        saveCase("QLTY_GRD_JDG", "Q2_행2", "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"B\",\"BASE_FCT\":\"1.0\"}",
                "{\"QLTY_GRD\":\"B\",\"PRC_FCT\":1}");
        saveCase("QLTY_GRD_JDG", "Q3_행3", "{\"COIL_THK\":\"2.5\",\"COIL_WID\":\"900\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.0\"}",
                "{\"QLTY_GRD\":\"B\",\"PRC_FCT\":0.98}");
        // design.md RR2 "Q3'는 유일한 손 계산 예외다" — BASE_FCT=1.5 로 바꿔 행3 식(ROUND(BASE_FCT * 0.98, 2))이 BASE_FCT 를
        // 실제로 곱하는지(RR-F4, 외부 변수 타입 변환)를 가려낸다. 계산: 1.5 * 0.98 = 1.47(반올림 불필요).
        saveCase("QLTY_GRD_JDG", "Q3'_손계산_BASE_FCT_1_5",
                "{\"COIL_THK\":\"2.5\",\"COIL_WID\":\"900\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.5\"}",
                "{\"QLTY_GRD\":\"B\",\"PRC_FCT\":1.47}");
        saveCase("QLTY_GRD_JDG", "Q4_DEFAULT", "{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"900\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.0\"}",
                "{\"QLTY_GRD\":\"C\",\"PRC_FCT\":0.9}");
        assertCasePasses("QLTY_GRD_JDG", 1, "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.0\"}");

        confirm("QLTY_GRD_JDG", rv);
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", String.class));
    }

    private JsonNode saveQltyColumns() throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "QLTY_GRD_JDG").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", -1).put("varKind", "COND").put("dispType", "2").put("varName", "COIL_THK")
                .put("dataType", "NUMBER").put("axis", "NONE");
        rows.addObject().put("varId", -2).put("varKind", "COND").put("dispType", "1").put("varName", "COIL_WID")
                .put("dataType", "NUMBER").put("axis", "NONE");
        rows.addObject().put("varId", -3).put("varKind", "COND").put("dispType", "1").put("varName", "SURF_GRD")
                .put("dataType", "STRING").put("axis", "NONE");
        rows.addObject().put("varId", -4).put("varKind", "RESULT").put("dispType", "Value").put("varName", "QLTY_GRD")
                .put("dataType", "STRING");
        // RR-F3·RuleColumnsService 「결과 식은 산출 룰의 결과 열에만 둡니다」 — DECISION 룰은 COLUMNS 단계에서 expr 을 보내지 않는다.
        // 행별 식은 TABLE 셀(RR-F4)에서 채운다.
        rows.addObject().put("varId", -5).put("varKind", "RESULT").put("dispType", "Expression").put("varName", "PRC_FCT")
                .put("dataType", "NUMBER");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved;
    }

    private long saveQltyTable(int coilThkVarId, int coilWidVarId, int surfGrdVarId, int qltyGrdVarId, int prcFctVarId,
            long rowVersion) throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "QLTY_GRD_JDG").put("ver", 1)
                .put("rowVersion", rowVersion).put("hitPolicy", "FIRST");
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");

        rows.addObject().put("rowId", -1).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(coilThkVarId), rangeCell("<= 변수 <", "1.6", "2.5")),
                cell -> cell.set(String.valueOf(coilWidVarId), opCell("GT", "1000")),
                cell -> cell.set(String.valueOf(surfGrdVarId), listCell("IN", "A")),
                cell -> cell.set(String.valueOf(qltyGrdVarId), valCell("A")),
                cell -> cell.set(String.valueOf(prcFctVarId), exprCell("1.05"))));
        rows.addObject().put("rowId", -2).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(coilThkVarId), rangeCell("<= 변수 <", "1.6", "2.5")),
                cell -> cell.set(String.valueOf(coilWidVarId), opCell("GT", "1000")),
                cell -> cell.set(String.valueOf(surfGrdVarId), listCell("IN", "B")),
                cell -> cell.set(String.valueOf(qltyGrdVarId), valCell("B")),
                cell -> cell.set(String.valueOf(prcFctVarId), exprCell("1.00"))));
        rows.addObject().put("rowId", -3).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(coilThkVarId), opCell("GE", "2.5")),
                cell -> cell.set(String.valueOf(coilWidVarId), naCell()),
                cell -> cell.set(String.valueOf(surfGrdVarId), listCell("NOT_IN", "C")),
                cell -> cell.set(String.valueOf(qltyGrdVarId), valCell("B")),
                cell -> cell.set(String.valueOf(prcFctVarId), exprCell("ROUND(BASE_FCT * 0.98, 2)"))));
        rows.addObject().put("rowId", -4).put("rowKind", "DEFAULT").put("cells", cells(
                cell -> cell.set(String.valueOf(qltyGrdVarId), valCell("C")),
                cell -> cell.set(String.valueOf(prcFctVarId), exprCell("0.90"))));

        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved.path("data").path("result").path("rowVersion").asLong();
    }

    // ── COIL_WGT_CALC(DERIVE) ───────────────────────────────────────────────

    @Test
    void COIL_WGT_CALC_이_TABLE_먼저_COLUMNS_로_식을_채워_한_케이스를_통과하고_확정된다() throws Exception {
        register("COIL_WGT_CALC", "코일 중량 산출", "DERIVE");

        // RuleSetLifecycleOasisFlowTest.saveJoinColumns() 패턴 — DERIVE 결과 식은 COLUMNS 저장이 "이미 있는" NORMAL 행의
        // 셀에 채우므로 TABLE 로 빈 행부터 만든다.
        ObjectNode tableParams = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "COIL_WGT_CALC").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode tableBody = envelope("ruleEdit", tableParams);
        tableBody.putObject("grids").putObject("rows").putArray("rows")
                .addObject().put("rowId", -1).put("rowKind", "NORMAL").put("cells", "{}");
        JsonNode tableSaved = post("ruleEdit", "save", tableBody);
        assertTrue(tableSaved.path("meta").path("success").asBoolean(false), tableSaved.toString());
        long rv = tableSaved.path("data").path("result").path("rowVersion").asLong();

        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "COIL_WGT_CALC").put("ver", 1)
                .put("rowVersion", rv);
        ObjectNode body = envelope("ruleEdit", params);
        body.putObject("grids").putObject("rows").putArray("rows").addObject().put("varId", -1).put("varKind", "RESULT")
                .put("dispType", "Expression").put("varName", "COIL_WGT").put("dataType", "NUMBER")
                .put("expr", "ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        rv = saved.path("data").path("result").path("rowVersion").asLong();

        saveCase("COIL_WGT_CALC", "코일_중량",
                "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"COIL_LEN\":\"1500\",\"SPEC_GRAV\":\"7.85\"}",
                "{\"COIL_WGT\":25434.0}");
        assertCasePasses("COIL_WGT_CALC", 1, "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"COIL_LEN\":\"1500\",\"SPEC_GRAV\":\"7.85\"}");

        confirm("COIL_WGT_CALC", rv);
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'COIL_WGT_CALC'", String.class));
    }

    // ── PROD_WGT_CALC(DECISION, UNIQUE) ─────────────────────────────────────

    @Test
    void PROD_WGT_CALC_이_COLUMNS_TABLE_로_등록_편집되어_세_케이스를_통과하고_확정된다() throws Exception {
        register("PROD_WGT_CALC", "제품 중량 산출", "DECISION");

        JsonNode cols = saveProdColumns();
        JsonNode rowIdMap = cols.path("data").path("result").path("rowIdMap");
        // RR-F6 — PROD_TYPE 을 먼저, CALC_BASIS 를 그다음으로 선언한 순서 그대로 var_id 를 발급받는다(엔진 fixture 의
        // varId=3/seq=2 어긋남은 화면 등록으로 재현하지 않는다).
        int prodTypeVarId = rowIdMap.path("-1").asInt();
        int calcBasisVarId = rowIdMap.path("-2").asInt();
        int prodWgtVarId = rowIdMap.path("-3").asInt();
        long rv = cols.path("data").path("result").path("rowVersion").asLong();
        rv = saveProdTable(prodTypeVarId, calcBasisVarId, prodWgtVarId, rv);

        saveCase("PROD_WGT_CALC", "P1_LEN",
                "{\"PROD_TYPE\":\"COIL\",\"CALC_BASIS\":\"LEN\",\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"COIL_LEN\":\"1500\","
                        + "\"SPEC_GRAV\":\"7.85\"}",
                "{\"PROD_WGT\":25434}");
        saveCase("PROD_WGT_CALC", "P2_DIA",
                "{\"PROD_TYPE\":\"COIL\",\"CALC_BASIS\":\"DIA\",\"COIL_WID\":\"1200\",\"COIL_OUT_DIA\":\"1800\","
                        + "\"COIL_IN_DIA\":\"610\",\"COIL_VOID_RT\":\"1.5\",\"SPEC_GRAV\":\"7.85\"}",
                "{\"PROD_WGT\":20899.7}");
        saveCase("PROD_WGT_CALC", "P3_SHEET",
                "{\"PROD_TYPE\":\"SHEET\",\"CALC_BASIS\":null,\"COIL_THK\":\"0.8\",\"COIL_WID\":\"1219\",\"SHEET_LEN\":\"2438\","
                        + "\"SHEET_CNT\":\"120\",\"SPEC_GRAV\":\"7.85\"}",
                "{\"PROD_WGT\":2239.6}");
        assertCasePasses("PROD_WGT_CALC", 1,
                "{\"PROD_TYPE\":\"COIL\",\"CALC_BASIS\":\"LEN\",\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"COIL_LEN\":\"1500\","
                        + "\"SPEC_GRAV\":\"7.85\"}");

        confirm("PROD_WGT_CALC", rv);
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'PROD_WGT_CALC'", String.class));
    }

    private JsonNode saveProdColumns() throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "COLUMNS").put("maruRuleId", "PROD_WGT_CALC").put("ver", 1)
                .put("rowVersion", 0);
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");
        rows.addObject().put("varId", -1).put("varKind", "COND").put("dispType", "Equal").put("varName", "PROD_TYPE")
                .put("dataType", "STRING").put("axis", "NONE");
        rows.addObject().put("varId", -2).put("varKind", "COND").put("dispType", "Equal").put("varName", "CALC_BASIS")
                .put("dataType", "STRING").put("axis", "NONE");
        rows.addObject().put("varId", -3).put("varKind", "RESULT").put("dispType", "Expression").put("varName", "PROD_WGT")
                .put("dataType", "NUMBER");
        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved;
    }

    private long saveProdTable(int prodTypeVarId, int calcBasisVarId, int prodWgtVarId, long rowVersion) throws Exception {
        ObjectNode params = json.createObjectNode().put("part", "TABLE").put("maruRuleId", "PROD_WGT_CALC").put("ver", 1)
                .put("rowVersion", rowVersion).put("hitPolicy", "UNIQUE");
        ObjectNode body = envelope("ruleEdit", params);
        ArrayNode rows = body.putObject("grids").putObject("rows").putArray("rows");

        rows.addObject().put("rowId", -1).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(prodTypeVarId), opCell("EQ", "COIL")),
                cell -> cell.set(String.valueOf(calcBasisVarId), opCell("EQ", "LEN")),
                cell -> cell.set(String.valueOf(prodWgtVarId),
                        exprCell("ROUND(COIL_THK * COIL_WID * COIL_LEN * SPEC_GRAV / 1000, 1)"))));
        rows.addObject().put("rowId", -2).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(prodTypeVarId), opCell("EQ", "COIL")),
                cell -> cell.set(String.valueOf(calcBasisVarId), opCell("EQ", "DIA")),
                cell -> cell.set(String.valueOf(prodWgtVarId),
                        exprCell("ROUND(PI / 4 * (COIL_OUT_DIA ^ 2 - COIL_IN_DIA ^ 2) * COIL_WID"
                                + " * (1 - COIL_VOID_RT / 100) * SPEC_GRAV / 1000000, 1)"))));
        rows.addObject().put("rowId", -3).put("rowKind", "NORMAL").put("cells", cells(
                cell -> cell.set(String.valueOf(prodTypeVarId), opCell("EQ", "SHEET")),
                cell -> cell.set(String.valueOf(calcBasisVarId), naCell()),
                cell -> cell.set(String.valueOf(prodWgtVarId),
                        exprCell("ROUND(COIL_THK * COIL_WID * SHEET_LEN * SHEET_CNT * SPEC_GRAV / 1000000, 1)"))));

        JsonNode saved = post("ruleEdit", "save", body);
        assertTrue(saved.path("meta").path("success").asBoolean(false), saved.toString());
        return saved.path("data").path("result").path("rowVersion").asLong();
    }

    // ── 셀 wire 모양 도우미(RR2 — DmeTestSupport.Q_ROW1~3·Q_DEFAULT·RuleTableServiceTest WGT_CALC2 그대로) ──

    @SafeVarargs
    private String cells(java.util.function.Consumer<ObjectNode>... setters) throws Exception {
        ObjectNode node = json.createObjectNode();
        for (java.util.function.Consumer<ObjectNode> setter : setters) {
            setter.accept(node);
        }
        return json.writeValueAsString(node);
    }

    private ObjectNode opCell(String op, String left) {
        return json.createObjectNode().put("op", op).put("left", left);
    }

    private ObjectNode rangeCell(String op, String left, String right) {
        return json.createObjectNode().put("op", op).put("left", left).put("right", right);
    }

    private ObjectNode naCell() {
        return json.createObjectNode().put("op", "NA");
    }

    private ObjectNode listCell(String op, String value) {
        ObjectNode cell = json.createObjectNode().put("op", op);
        cell.putArray("list").add(value);
        return cell;
    }

    private ObjectNode valCell(String val) {
        return json.createObjectNode().put("val", val);
    }

    /** 결과 식 셀 — 클라이언트는 {@code expr} 만 보낸다. {@code ast} 는 서버가 새로 만들어 덮어쓴다(RR-F4). */
    private ObjectNode exprCell(String expr) {
        return json.createObjectNode().put("expr", expr);
    }

    // ── 공용(RuleSetLifecycleOasisFlowTest 그대로 복제) ─────────────────────

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
