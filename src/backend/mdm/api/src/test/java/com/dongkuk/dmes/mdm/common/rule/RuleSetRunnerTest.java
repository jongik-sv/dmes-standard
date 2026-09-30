package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** RuleSetRunner(spec §6.2, 계획 Task 11) — 저장된 세트 실행, 저장 전 흐름 기록 실행, OASIS DTO 입구. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetRunnerTest extends AbstractMdmSharedDbTest {

    static final String IF_FLOW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},"
            + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
            + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"m1\",\"order\":1,\"cond\":\"COIL_THK >= 3\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r1\",\"otherwise\":true},"
            + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"m1\",\"to\":\"end\"}]}";

    static final Map<String, Object> RECORD = Map.of("COIL_THK", new BigDecimal("2.0"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A");
    static final Instant TS = Instant.parse("2026-03-01T00:00:00Z");

    @Autowired
    RuleSetRunner runner;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "RS_IF", "흐름", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_IF", IF_FLOW);
    }

    @Test
    void 한_줄_세트를_실행하면_결과와_경로를_돌려준다() {
        RuleSetResult r = runner.run("RS_LINE", RECORD, TS);

        assertEquals("A", r.finalValues().get("QLTY_GRD"));
        assertEquals(0, new BigDecimal("1.05").compareTo((BigDecimal) r.finalValues().get("PRC_FCT")));
        assertEquals(List.of("start", "r1", "end"), r.path().stream().map(RuleSetResult.PathStep::nodeId).toList());
    }

    @Test
    void 흐름_세트는_고른_갈래만_실행한다() {
        RuleSetResult r = runner.run("RS_IF", RECORD, TS);

        assertEquals("A", r.finalValues().get("QLTY_GRD"));
        RuleSetResult.PathStep ifStep = r.path().stream().filter(p -> p.kind() == NodeKind.IF).findFirst().orElseThrow();
        assertEquals("e3", ifStep.chosenEdgeId());

        RuleSetResult skipped = runner.run("RS_IF", Map.of("COIL_THK", new BigDecimal("3.5"), "COIL_WID", new BigDecimal("1200"), "SURF_GRD", "A"), TS);
        assertEquals(Map.of(), skipped.finalValues());
    }

    @Test
    void 판정_시각이_없으면_서비스_시계를_쓴다() {
        RuleSetResult r = runner.run("RS_LINE", RECORD, null);
        assertEquals(DmeTestSupport.NOW_INSTANT, r.evalTs());
    }

    @Test
    void 판정_오류는_엔진_예외로_올라간다() {
        assertThrows(EngineEvaluationException.class, () -> runner.run("RS_NONE", RECORD, TS));
    }

    @Test
    void 저장하지_않은_흐름도_기록_실행한다() {
        RunTrace t = runner.trace(RuleSetFlowJson.toMap(IF_FLOW), RECORD, TS);

        assertNull(t.violations());
        assertEquals(List.of("start", "if1", "r1", "m1", "end"), t.nodes().stream().map(RunTrace.NodeTrace::nodeId).toList());
        assertEquals("A", t.finalValues().get("QLTY_GRD"));
    }

    @Test
    void OASIS_입구는_JSON_레코드와_KST_시각을_받고_오류를_업무_예외로_바꾼다() {
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("RS_LINE");
        req.setRecordJson("{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetRunResult r = runner.execute(req);

        assertEquals("2026-03-01 09:00:00", r.getEvalTs());
        assertEquals("A", r.getFinalValues().get("QLTY_GRD"));
        assertEquals("r1", r.getPath().get(1).get("nodeId"));

        req.setRecordJson("{\"COIL_THK\":2.0}");
        BusinessException e = assertThrows(BusinessException.class, () -> runner.execute(req));
        assertEquals(true, e.getMessage().contains("COIL_WID"), e.getMessage());
    }
}
