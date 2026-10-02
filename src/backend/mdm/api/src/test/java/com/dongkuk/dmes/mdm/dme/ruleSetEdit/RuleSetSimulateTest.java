package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.networknt.schema.JsonSchema;
import com.networknt.schema.JsonSchemaFactory;
import com.networknt.schema.SpecVersion;
import com.networknt.schema.ValidationMessage;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 룰 세트 흐름도 2단계 Task 4(P5·P-D9) — 룰 세트 편집의 기록 실행({@code execute} → {@code simulate})·조건식 IO({@code validate} →
 * {@code condIo}), 실행 기록 JSON(엔진 스키마 {@code RunTrace})과 골든 파일, 저장값 손상 MDM026.
 *
 * <p>공통 시드({@link #seedGolden}): 사전 GT_THK(NUMBER scale 2)·GT_KIND(STRING). 룰은 모두 VER 1 RELEASED FIRST, 2026-01-01 부터.
 * GT_GRADE(GT_THK &gt;= 10 → GT_G "A", 기본 "B"), GT_FAST(GT_G = "A" → GT_F 1, 기본 0), GT_SLOW(GT_G, 기본 GT_S 5),
 * GT_SAME1·GT_SAME2(GT_KIND, 기본 GT_V "one"·"two").
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleSetSimulateTest extends AbstractMdmSharedDbTest {

    /** 골든 파일의 {@code rules} 칸 — 사례가 쓰는 시드 이름. */
    public static final String SEED = "RuleSetSimulateTest.seedGolden";
    public static final String EVAL_TS = "2026-06-01 09:00:00";

    private static final ObjectMapper JSON = new ObjectMapper();

    /** 골든 파일 — api 프로젝트 디렉터리(Gradle 테스트 작업 디렉터리) 기준 원본 경로를 읽고 쓴다(Task 8 이 같은 경로를 읽는다). */
    public static final Path GOLDEN = Path.of("src/test/resources/com/dongkuk/dmes/mdm/dme/ruleSetEdit/rule-set-trace-golden.json");

    /** 엔진 계약 스키마의 {@code $defs/RunTrace}(엔진 jar 자원, AstExporterTest 와 같은 로딩). */
    public static final JsonSchema RUN_TRACE_SCHEMA = runTraceSchema();

    private static JsonSchema runTraceSchema() {
        try (InputStream in = RuleSetSimulateTest.class.getResourceAsStream("/kr/dongkuk/maru/mdm/engine/engine-contract.schema.json")) {
            ObjectNode root = (ObjectNode) JSON.readTree(in);
            root.put("$ref", "#/$defs/RunTrace");
            return JsonSchemaFactory.getInstance(SpecVersion.VersionFlag.V202012).getSchema(root);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    /**
     * 골든과 기록을 견준다 — 숫자는 값으로 본다. 노드 기록의 룰 버전은 BigDecimal scale 3(엔진 계약, D-144)이라 메모리 트리에서는
     * DecimalNode, 골든 파일·HTTP 응답에서 읽으면 IntNode·DoubleNode 가 된다. 노드 종류만 다르고 값은 같다.
     */
    public static void assertSameJson(JsonNode expected, JsonNode actual, String message) {
        assertTrue(expected != null && expected.equals(NUMERIC_VALUE, actual), () -> message + " ==> expected: " + expected + " but was: " + actual);
    }

    private static final java.util.Comparator<JsonNode> NUMERIC_VALUE = (a, b) -> a.isNumber() && b.isNumber()
            ? a.decimalValue().compareTo(b.decimalValue()) : a.equals(b) ? 0 : 1;

    /** 골든 파일의 사례 이름 → 사례 노드. */
    public static Map<String, JsonNode> readGolden() throws IOException {
        Map<String, JsonNode> out = new LinkedHashMap<>();
        for (JsonNode c : JSON.readTree(Files.readString(GOLDEN, StandardCharsets.UTF_8)).path("cases")) {
            out.put(c.path("name").asText(), c);
        }
        return out;
    }

    @Autowired
    RuleSetEditService service;
    @Autowired
    RuleSetRunner runner;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        seedGolden(jdbc);
        currentUser.set("kim", STEWARD);
    }

    /** 공통 시드 — 다른 패키지의 HTTP 테스트도 같은 시드로 골든 사례를 부른다. */
    public static void seedGolden(JdbcTemplate jdbc) {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.column(jdbc, "GT_THK", DmeTestSupport.domain(jdbc, "GT_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "GT_KIND", DmeTestSupport.domain(jdbc, "GT_KIND_D", "TEXT", "STRING", null));
        rule(jdbc, "GT_GRADE", "2", "GT_THK", "GT_G", "STRING", "{\"1\":{\"op\":\"GE\",\"left\":\"10\"},\"2\":{\"val\":\"A\"}}", "B");
        rule(jdbc, "GT_FAST", "1", "GT_G", "GT_F", "NUMBER", "{\"1\":{\"op\":\"IN\",\"list\":[\"A\"]},\"2\":{\"val\":\"1\"}}", "0");
        rule(jdbc, "GT_SLOW", "1", "GT_G", "GT_S", "NUMBER", null, "5");
        rule(jdbc, "GT_SAME1", "1", "GT_KIND", "GT_V", "STRING", null, "one");
        rule(jdbc, "GT_SAME2", "1", "GT_KIND", "GT_V", "STRING", null, "two");
    }

    /** 조건 열 하나(var 1)·결과 열 하나(var 2). normalCells 가 있으면 행 1(seq 1), 기본 행은 그 뒤 행(seq 0). */
    private static void rule(JdbcTemplate jdbc, String id, String condDisp, String cond, String result, String resultType, String normalCells,
                             String defaultValue) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", "INUSE");
        int rows = normalCells == null ? 1 : 2;
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 2, LAST_ROW_ID = ? WHERE MARU_RULE_ID = ?", rows, id);
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, 1, 1, "COND", condDisp, cond, 1);
        DmeTestSupport.var(jdbc, id, 1, 2, "RESULT", "Value", result, 1, resultType);
        if (normalCells != null) {
            DmeTestSupport.row(jdbc, id, 1, 1, 1, "NORMAL", normalCells);
        }
        DmeTestSupport.row(jdbc, id, 1, rows, 0, "DEFAULT", "{\"2\":{\"val\":\"" + defaultValue + "\"}}");
    }

    // ────────────────────────────────────────────────────────────────
    // 골든 사례(P5 이름·순서)
    // ────────────────────────────────────────────────────────────────

    /** 골든 사례 하나 — flowJson 은 P2 정규 JSON. */
    public record GoldenCase(String name, String flowJson, String recordJson) {
    }

    public static List<GoldenCase> cases() {
        List<GoldenCase> out = new ArrayList<>();
        out.add(new GoldenCase("IF_FIRST_TRUE", ifFlow("GT_G = \"A\""), "{\"GT_THK\":\"12\"}"));
        out.add(new GoldenCase("IF_NULL_ELSE", ifFlow("GT_FLAG"), "{\"GT_THK\":\"12\",\"GT_FLAG\":null}"));
        out.add(new GoldenCase("IF_ERROR_STOPS", ifErrorFlow(), "{\"GT_THK\":\"12\"}"));
        out.add(new GoldenCase("PARALLEL_MERGE", parallelFlow(), "{\"GT_THK\":\"12\",\"GT_KIND\":\"x\"}"));
        out.add(new GoldenCase("IF_IN_PARALLEL", ifInParallelFlow(), "{\"GT_THK\":\"12\",\"GT_KIND\":\"x\"}"));
        out.add(new GoldenCase("STRUCTURE_ERROR", noElseFlow(), "{\"GT_THK\":\"12\"}"));
        out.add(new GoldenCase("MISSING_INPUT", ifFlow("GT_G = \"A\""), "{}"));
        return out;
    }

    public static GoldenCase golden(String name) {
        return cases().stream().filter(c -> c.name().equals(name)).findFirst().orElseThrow();
    }

    /** 사례 1·2·7 — start → r1(GT_GRADE) → if1 { e3 order1 cond → r2(GT_FAST) ; e4 그 외 → r3(GT_SLOW) } → m1 → end. */
    static String ifFlow(String cond) {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("if1", "IF", null, null)
                .node("r2", "RULE", "GT_FAST", null).node("r3", "RULE", "GT_SLOW", null).node("m1", "MERGE", null, "if1")
                .node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "if1", null, null, false)
                .edge("e3", "if1", "r2", 1, cond, false).edge("e4", "if1", "r3", null, null, true)
                .edge("e5", "r2", "m1", null, null, false).edge("e6", "r3", "m1", null, null, false)
                .edge("e7", "m1", "end", null, null, false);
        return f.canonical();
    }

    /** 사례 3 — IF 갈래 e3(order1, 불린 아님 → r2)·e5(order2, "true" → 바로 m1) + 그 외 e4(→ r3). */
    static String ifErrorFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("if1", "IF", null, null)
                .node("r2", "RULE", "GT_FAST", null).node("r3", "RULE", "GT_SLOW", null).node("m1", "MERGE", null, "if1")
                .node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "if1", null, null, false)
                .edge("e3", "if1", "r2", 1, "GT_THK + 1", false).edge("e5", "if1", "m1", 2, "true", false)
                .edge("e4", "if1", "r3", null, null, true)
                .edge("e6", "r2", "m1", null, null, false).edge("e7", "r3", "m1", null, null, false)
                .edge("e8", "m1", "end", null, null, false);
        return f.canonical();
    }

    /** 사례 4 — start → r1 → par1 { p1 order1 → r2(GT_FAST) → rs1(GT_SAME1) ; p2 order2 → r3(GT_SLOW) → rs2(GT_SAME2) } → m1 → end. */
    static String parallelFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("par1", "PARALLEL", null, null)
                .node("r2", "RULE", "GT_FAST", null).node("rs1", "RULE", "GT_SAME1", null)
                .node("r3", "RULE", "GT_SLOW", null).node("rs2", "RULE", "GT_SAME2", null)
                .node("m1", "MERGE", null, "par1").node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "par1", null, null, false)
                .edge("p1", "par1", "r2", 1, null, false).edge("e3", "r2", "rs1", null, null, false)
                .edge("e4", "rs1", "m1", null, null, false)
                .edge("p2", "par1", "r3", 2, null, false).edge("e5", "r3", "rs2", null, null, false)
                .edge("e6", "rs2", "m1", null, null, false)
                .edge("e7", "m1", "end", null, null, false);
        return f.canonical();
    }

    /**
     * 사례 5 — start → r1 → par1 { p1 order1 → if1 { e3 order1 GT_G = "A" → r2(GT_FAST) ; e4 그 외 → r3(GT_SLOW) } → m2(if1 합류) ;
     * p2 order2 → rs1(GT_SAME1) } → m1(par1 합류) → end.
     */
    static String ifInParallelFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("par1", "PARALLEL", null, null)
                .node("if1", "IF", null, null).node("r2", "RULE", "GT_FAST", null).node("r3", "RULE", "GT_SLOW", null)
                .node("m2", "MERGE", null, "if1").node("rs1", "RULE", "GT_SAME1", null)
                .node("m1", "MERGE", null, "par1").node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "par1", null, null, false)
                .edge("p1", "par1", "if1", 1, null, false)
                .edge("e3", "if1", "r2", 1, "GT_G = \"A\"", false).edge("e4", "if1", "r3", null, null, true)
                .edge("e5", "r2", "m2", null, null, false).edge("e6", "r3", "m2", null, null, false)
                .edge("e7", "m2", "m1", null, null, false)
                .edge("p2", "par1", "rs1", 2, null, false).edge("e8", "rs1", "m1", null, null, false)
                .edge("e9", "m1", "end", null, null, false);
        return f.canonical();
    }

    /** 사례 6 — 사례 1 에서 그 외 갈래(e4·r3·e6)를 뺀 흐름. IF 에 그 외가 없어 구조 오류다. */
    static String noElseFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("if1", "IF", null, null)
                .node("r2", "RULE", "GT_FAST", null).node("m1", "MERGE", null, "if1").node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "if1", null, null, false)
                .edge("e3", "if1", "r2", 1, "GT_G = \"A\"", false)
                .edge("e5", "r2", "m1", null, null, false).edge("e7", "m1", "end", null, null, false);
        return f.canonical();
    }

    /** 흐름 JSON 조립기 — 결과는 {@link RuleSetFlowJson#canonical} 정규 JSON. */
    static final class Flow {
        private final ObjectNode root = JSON.createObjectNode().put("version", 1);
        private final ArrayNode nodes = root.putArray("nodes");
        private final ArrayNode edges = root.putArray("edges");

        Flow node(String id, String kind, String ruleId, String splitId) {
            nodes.addObject().put("id", id).put("kind", kind).put("ruleId", ruleId).put("splitId", splitId);
            return this;
        }

        Flow edge(String id, String from, String to, Integer order, String cond, boolean otherwise) {
            edges.addObject().put("id", id).put("from", from).put("to", to).put("order", order).put("cond", cond).put("otherwise", otherwise);
            return this;
        }

        String canonical() {
            try {
                return RuleSetFlowJson.canonical(JSON.writeValueAsString(root));
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException(e);
            }
        }
    }

    // ────────────────────────────────────────────────────────────────
    // 기록 실행·골든(P5)
    // ────────────────────────────────────────────────────────────────

    private RuleSetSimulateResult simulate(GoldenCase c) {
        return service.simulate(request(c.flowJson(), c.recordJson(), EVAL_TS));
    }

    private static RuleSetSimulateRequest request(String flowJson, String recordJson, String evalTs) {
        RuleSetSimulateRequest req = new RuleSetSimulateRequest();
        req.setFlowJson(flowJson);
        req.setRecordJson(recordJson);
        req.setEvalTs(evalTs);
        return req;
    }

    /** 응답 {@code {trace, warnings}} 를 JSON 트리로. */
    private static JsonNode response(RuleSetSimulateResult r) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("trace", r.getTrace());
        m.put("warnings", r.getWarnings());
        return JSON.valueToTree(m);
    }

    @Test
    void 골든_기록과_같다() throws IOException {
        ArrayNode out = JSON.createArrayNode();
        for (GoldenCase c : cases()) {
            ObjectNode o = out.addObject();
            o.put("name", c.name());
            o.put("rules", SEED);
            o.put("flowJson", c.flowJson());
            o.put("recordJson", c.recordJson());
            o.put("evalTs", EVAL_TS);
            o.set("response", response(simulate(c)));
        }
        if (Boolean.parseBoolean(System.getProperty("golden.update"))) {
            ObjectNode root = JSON.createObjectNode();
            root.set("cases", out);
            Files.createDirectories(GOLDEN.getParent());
            Files.writeString(GOLDEN, JSON.copy().enable(SerializationFeature.INDENT_OUTPUT).writeValueAsString(root) + "\n",
                    StandardCharsets.UTF_8);
            return;
        }
        Map<String, JsonNode> golden = readGolden();
        assertEquals(cases().stream().map(GoldenCase::name).toList(), List.copyOf(golden.keySet()), "사례 이름·순서(P5)");
        for (JsonNode actual : out) {
            JsonNode expected = golden.get(actual.path("name").asText());
            assertSameJson(expected, actual, actual.path("name").asText());
        }
    }

    @Test
    void 기록은_엔진_스키마_RunTrace_를_따른다() {
        for (GoldenCase c : cases()) {
            JsonNode trace = response(simulate(c)).path("trace");
            Set<ValidationMessage> errors = RUN_TRACE_SCHEMA.validate(trace);
            assertTrue(errors.isEmpty(), c.name() + " " + errors);
            for (JsonNode n : trace.path("nodes")) {
                assertTrue(!n.has("result") || !n.get("result").isNull(), c.name() + " result 는 null 로 싣지 않는다: " + n);
            }
        }
        // 음성 대조 — 검증기가 빈 통과가 아님을 보인다: 필수 칸(ruleId)을 뺀 노드는 거부된다.
        ObjectNode broken = (ObjectNode) response(simulate(golden("IF_FIRST_TRUE"))).path("trace").deepCopy();
        ((ObjectNode) broken.path("nodes").get(0)).remove("ruleId");
        assertTrue(!RUN_TRACE_SCHEMA.validate(broken).isEmpty(), "ruleId 가 빠진 노드를 통과시켰다");
    }

    @Test
    void 입력_검증() {
        String flow = golden("IF_FIRST_TRUE").flowJson();
        for (String none : java.util.Arrays.asList(null, " ")) {
            BusinessException e = assertThrows(BusinessException.class, () -> service.simulate(request(none, "{}", null)));
            assertEquals(ErrorCode.REQUIRED_VALUE, e.getErrorCode());
            assertEquals("흐름은 필수입니다.", e.getMessage());
        }
        BusinessException record = assertThrows(BusinessException.class, () -> service.simulate(request(flow, "[1]", null)));
        assertEquals(ErrorCode.INVALID_VALUE, record.getErrorCode());
        assertEquals("레코드 JSON 은 객체여야 합니다: [1]", record.getMessage());
        BusinessException ts = assertThrows(BusinessException.class, () -> service.simulate(request(flow, "{}", "2026/06/01")));
        assertEquals(ErrorCode.INVALID_VALUE, ts.getErrorCode());
        assertEquals("판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: 2026/06/01", ts.getMessage());
        BusinessException nullRecord = assertThrows(BusinessException.class, () -> runner.trace(flow, null, null));
        assertEquals(ErrorCode.REQUIRED_VALUE, nullRecord.getErrorCode());
        assertEquals("레코드는 필수입니다.", nullRecord.getMessage());

        // 레코드가 없거나 공백이면 {} — 입력 키 검사가 기록에 담는다(던지지 않는다).
        RuleSetSimulateResult blank = service.simulate(request(flow, " ", EVAL_TS));
        assertEquals("MISSING_KEY", ((Map<?, ?>) ((List<?>) blank.getTrace().get("violations")).get(0)).get("code"));
    }

    @Test
    void 폐기_룰_경고가_앞에_온다() {
        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = 'GT_SLOW'");

        // 사례 1 은 e3 를 타서 r3(GT_SLOW) 를 실행하지 않지만 흐름에 있으므로 경고한다.
        List<Map<String, Object>> w = simulate(golden("IF_FIRST_TRUE")).getWarnings();
        assertEquals(Map.of("code", "RULE_DEPRECATED", "ruleId", "GT_SLOW",
                "message", "GT_SLOW는 폐기된 룰이지만 판정 시각에 유효한 RELEASED 버전으로 판정했다"), w.get(0), w.toString());

        // 갈래 NULL 경고보다 앞이다(P5 경고 순서).
        List<Map<String, Object>> both = simulate(golden("IF_NULL_ELSE")).getWarnings();
        assertEquals(List.of("RULE_DEPRECATED", "BRANCH_COND_NULL"), both.stream().map(x -> x.get("code")).toList(), both.toString());
    }

    @Test
    void condIo() {
        RuleSetCondIoRequest req = new RuleSetCondIoRequest();
        req.setFlowJson(golden("IF_FIRST_TRUE").flowJson());

        RuleSetCondIoResult r = service.condIo(req);

        assertEquals(List.of("e3"), List.copyOf(r.getCondIo().keySet()));
        CondIo io = r.getCondIo().get("e3");
        assertTrue(io.ok(), io.toString());
        assertEquals(List.of("GT_G NONE"), io.vars().stream().map(v -> v.name() + " " + v.source()).toList());

        RuleSetCondIoRequest none = new RuleSetCondIoRequest();
        BusinessException e = assertThrows(BusinessException.class, () -> service.condIo(none));
        assertEquals(ErrorCode.REQUIRED_VALUE, e.getErrorCode());
        assertEquals("흐름은 필수입니다.", e.getMessage());
        none.setFlowJson("{\"version\":2}");
        BusinessException bad = assertThrows(BusinessException.class, () -> service.condIo(none));
        assertEquals("MDM021", code(bad), bad.getMessage());
    }

    // ────────────────────────────────────────────────────────────────
    // 저장값 손상(P-D9, Ruling 5)
    // ────────────────────────────────────────────────────────────────

    static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private void storedSet(String setId, String status, String flowJson) {
        DmeTestSupport.ruleSet(jdbc, setId, setId + " 세트", "[\"GT_GRADE\",\"GT_FAST\",\"GT_SLOW\"]", status, 0);
        DmeTestSupport.ruleSetFlow(jdbc, setId, flowJson);
    }

    /**
     * GT_FAST 의 RELEASED 행 CELLS 를 깨뜨린다. SQLite CHECK({@code json_valid(CELLS)})가 문법이 깨진 JSON 을 막으므로 JSON 으로는 맞지만 셀 코덱이
     * 읽지 못하는 모양(var_id 가 아닌 키)을 넣는다 — 코덱이 BusinessException(MDM021)을 던진다.
     */
    private void breakFastCells() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = '{\"x\":1}' WHERE MARU_RULE_ID = 'GT_FAST' AND VER = 1 AND ROW_ID = 1");
    }

    @Test
    void 저장값_손상은_MDM026() {
        storedSet("GT_SET", "INUSE", golden("IF_FIRST_TRUE").flowJson());
        breakFastCells();

        BusinessException sim = assertThrows(BusinessException.class, () -> simulate(golden("IF_FIRST_TRUE")));
        assertEquals("MDM026", code(sim), sim.getMessage());
        assertTrue(sim.getMessage().startsWith(MdmErrorCode.STORED_DEFINITION_CORRUPT.defaultMessage()
                + ": 룰 세트 흐름의 저장된 룰 정의를 읽을 수 없어 실행하지 않습니다 — "), sim.getMessage());
        assertTrue(sim.getMessage().contains("셀 키는 var_id 정수여야 합니다"), sim.getMessage());

        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("GT_SET");
        req.setRecordJson("{\"GT_THK\":\"12\"}");
        req.setEvalTs(EVAL_TS);
        BusinessException e = assertThrows(BusinessException.class, () -> runner.execute(req));
        assertEquals("MDM026", code(e), e.getMessage());
        assertTrue(e.getMessage().startsWith(MdmErrorCode.STORED_DEFINITION_CORRUPT.defaultMessage()), e.getMessage());
        assertTrue(e.getMessage().contains("GT_SET"), e.getMessage());
    }

    /** Ruling 5 — 조회·되살리기가 저장된 FLOW_JSON 을 읽지 못하면 날것의 IAE 가 아니라 MDM026, 문구에 세트 ID 를 싣는다. */
    @Test
    void 저장된_흐름이_깨진_세트의_조회와_되살리기는_MDM026() {
        storedSet("GT_BROKEN", "INUSE", "{\"version\":1}");
        RuleSetViewRequest view = new RuleSetViewRequest();
        view.setSetId("GT_BROKEN");

        BusinessException e = assertThrows(BusinessException.class, () -> service.view(view));
        assertEquals("MDM026", code(e), e.getMessage());
        assertTrue(e.getMessage().startsWith(MdmErrorCode.STORED_DEFINITION_CORRUPT.defaultMessage()), e.getMessage());
        assertTrue(e.getMessage().contains("GT_BROKEN") && e.getMessage().contains("nodes"), e.getMessage());

        storedSet("GT_BROKEN_OLD", "DEPRECATED", "{\"version\":1}");
        RuleSetStatusRequest restore = new RuleSetStatusRequest();
        restore.setSetId("GT_BROKEN_OLD");
        restore.setRowVersion(0L);
        BusinessException r = assertThrows(BusinessException.class, () -> service.restore(restore));
        assertEquals("MDM026", code(r), r.getMessage());
        assertTrue(r.getMessage().contains("GT_BROKEN_OLD"), r.getMessage());
        assertEquals("DEPRECATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'GT_BROKEN_OLD'", String.class));
    }

    // ────────────────────────────────────────────────────────────────
    // 4단계 E4(editsJson)·T1(빈 단계)
    // ────────────────────────────────────────────────────────────────

    /** IF_FIRST_TRUE 의 if1(순번 3) 직전에 GT_G 를 B 로 고친다 — 그 외 갈래(e4 → r3 GT_SLOW)로 간다. */
    public static final String EDIT_IF1_B = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"GT_G\":\"B\"}}]";

    private RuleSetSimulateResult simulate(String flowJson, String recordJson, String editsJson) {
        RuleSetSimulateRequest req = request(flowJson, recordJson, EVAL_TS);
        req.setEditsJson(editsJson);
        return service.simulate(req);
    }

    private static List<String> nodeIds(JsonNode trace) {
        List<String> ids = new ArrayList<>();
        trace.path("nodes").forEach(n -> ids.add(n.path("nodeId").asText()));
        return ids;
    }

    @Test
    void 고친_값을_끼워_다시_실행하면_갈래가_바뀌고_받은_edits_를_TypedValue_로_되돌려_준다() throws Exception {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode trace = response(simulate(c.flowJson(), c.recordJson(), EDIT_IF1_B)).path("trace");

        assertEquals(List.of("start", "r1", "if1", "r3", "m1", "end"), nodeIds(trace));
        assertEquals("e4", trace.path("nodes").get(2).path("chosenEdgeId").asText());
        assertEquals("B", trace.path("finalValues").path("GT_G").path("value").asText());
        assertEquals("5", trace.path("finalValues").path("GT_S").path("value").asText());
        assertTrue(trace.path("violations").isNull(), trace.toString());
        assertEquals(JSON.readTree("[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"GT_G\":{\"type\":\"STRING\",\"value\":\"B\"}}}]"),
                trace.path("edits"));
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }

    @Test
    void 비었거나_빈_배열인_editsJson_은_고친_값_없는_골든과_같고_edits_키가_없다() throws IOException {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode expected = readGolden().get("IF_FIRST_TRUE").path("response").path("trace");
        for (String none : java.util.Arrays.asList(null, "", " ", "[]")) {
            JsonNode trace = response(simulate(c.flowJson(), c.recordJson(), none)).path("trace");
            assertSameJson(expected, trace, String.valueOf(none));
            assertTrue(!trace.has("edits"), String.valueOf(none));
        }
    }

    @Test
    void 잘못된_editsJson_은_recordJson_과_같은_INVALID_VALUE_로_거부한다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        for (String notArray : List.of("{}", "고침")) {
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), notArray));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), notArray);
            assertEquals("고친 값 JSON 은 배열이어야 합니다: " + notArray, e.getMessage());
        }
        for (String bad : List.of("[1]",
                "[{\"beforeSeq\":0,\"nodeId\":\"if1\",\"values\":{}}]",
                "[{\"beforeSeq\":\"3\",\"nodeId\":\"if1\",\"values\":{}}]",
                "[{\"beforeSeq\":3,\"nodeId\":\" \",\"values\":{}}]",
                "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":[]}]",
                "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":null}]",
                "[{\"beforeSeq\":3,\"nodeId\":\"if1\"}]",
                "[{\"nodeId\":\"if1\",\"values\":{}}]",
                "[{\"beforeSeq\":3,\"values\":{}}]")) {
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), bad));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), bad);
            assertEquals("고친 값 JSON 의 1번째 항목은 {beforeSeq: 1 이상 정수, nodeId: 글자, values: 객체} 여야 합니다: " + bad, e.getMessage());
        }
        String second = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{}},5]";
        BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), second));
        assertTrue(e.getMessage().startsWith("고친 값 JSON 의 2번째 항목은"), e.getMessage());
    }

    @Test
    void 레코드_입력이_막는_예약_이름은_고친_값_이름으로도_INVALID_VALUE_로_거부한다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        for (String key : List.of("EVAL_TS", "eval_ts", "PI", "_hidden")) {
            String edits = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"" + key + "\":\"B\"}}]";
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), edits));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), key);
            assertTrue(e.getMessage().contains("고친 값 이름 '" + key + "'"), e.getMessage());
        }
    }

    @Test
    void 받는_노드_예약_이름_CATCH_은_대소문자와_상관없이_고친_값_이름으로_거부한다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        for (String key : List.of("CATCH_MSG", "catch_kind")) {
            String edits = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"" + key + "\":\"B\"}}]";
            BusinessException e = assertThrows(BusinessException.class, () -> simulate(c.flowJson(), c.recordJson(), edits));
            assertEquals(ErrorCode.INVALID_VALUE, e.getErrorCode(), key);
            assertEquals("고친 값 이름 '" + key + "' 는 받는 노드 예약 이름이다", e.getMessage());
        }
    }

    @Test
    void 고친_값의_NUMBER_글자와_비우기_null_이_왕복한다() throws Exception {
        GoldenCase c = golden("IF_FIRST_TRUE");
        String edits = "[{\"beforeSeq\":3,\"nodeId\":\"if1\",\"values\":{\"GT_THK\":2.50,\"GT_G\":null}}]";
        JsonNode trace = response(simulate(c.flowJson(), c.recordJson(), edits)).path("trace");

        JsonNode values = trace.path("edits").get(0).path("values");
        assertEquals("NUMBER", values.path("GT_THK").path("type").asText(), trace.toString());
        assertEquals("2.50", values.path("GT_THK").path("value").asText(), trace.toString());
        assertEquals("NULL", values.path("GT_G").path("type").asText(), trace.toString());
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }

    @Test
    void 자리가_어긋난_고친_값은_EDIT_POINT_MISMATCH_위반으로_기록에_담긴다() {
        GoldenCase c = golden("IF_FIRST_TRUE");
        JsonNode trace = response(simulate(c.flowJson(), c.recordJson(),
                "[{\"beforeSeq\":3,\"nodeId\":\"r2\",\"values\":{\"GT_G\":\"B\"}}]")).path("trace");

        assertEquals(List.of("start", "r1", "if1"), nodeIds(trace));
        assertEquals("ERROR", trace.path("nodes").get(2).path("status").asText());
        JsonNode v = trace.path("violations").get(0);
        assertEquals("INPUT_CHECK", v.path("stage").asText());
        assertEquals("EDIT_POINT_MISMATCH", v.path("code").asText());
        assertEquals("r2", v.path("name").asText());
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }

    /** start → r1(GT_GRADE) → t1(TASK) → end. */
    static String taskFlow() {
        Flow f = new Flow();
        f.node("start", "START", null, null).node("r1", "RULE", "GT_GRADE", null).node("t1", "TASK", null, null).node("end", "END", null, null);
        f.edge("e1", "start", "r1", null, null, false).edge("e2", "r1", "t1", null, null, false).edge("e3", "t1", "end", null, null, false);
        return f.canonical();
    }

    @Test
    void 빈_단계가_있는_흐름은_저장되고_view_와_save_가_EMPTY_TASK_경고를_싣고_실행은_지나간다() throws Exception {
        RuleSetCheck warn = new RuleSetCheck(RuleSetCheck.EMPTY_TASK, RuleSetCheck.WARN, null, null, null, "빈 단계 1개 — 실행 때 그냥 지나간다");
        storedSet("GT_TASK", "INUSE", taskFlow());
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        try {
            RuleSetViewRequest view = new RuleSetViewRequest();
            view.setSetId("GT_TASK");
            List<RuleSetCheck> viewChecks = service.view(view).getChecks();
            assertTrue(viewChecks.contains(warn), viewChecks.toString());

            RuleSetSaveRequest save = new RuleSetSaveRequest();
            save.setSetId("GT_TASK");
            save.setSetName("빈 단계 세트");
            save.setRowVersion(0L);
            save.setFlowJson(taskFlow());
            RuleSetSaveResult saved = service.save(save);
            assertTrue(saved.getChecks().contains(warn), saved.getChecks().toString());
            assertEquals(JSON.readTree("[\"GT_GRADE\"]"),
                    JSON.readTree(jdbc.queryForObject("SELECT RULE_IDS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'GT_TASK'", String.class)));
        } finally {
            AuditHolder.remove();
        }

        JsonNode trace = response(simulate(taskFlow(), "{\"GT_THK\":\"12\"}", null)).path("trace");
        assertEquals(List.of("start", "r1", "t1", "end"), nodeIds(trace));
        assertEquals("TASK", trace.path("nodes").get(2).path("kind").asText());
        assertTrue(trace.path("violations").isNull(), trace.toString());
        assertTrue(RUN_TRACE_SCHEMA.validate(trace).isEmpty(), trace.toString());
    }
}
