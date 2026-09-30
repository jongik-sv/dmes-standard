package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetRunner;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.ArrayList;
import java.util.List;
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
}
