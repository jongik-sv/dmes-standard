package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.Arrays;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.RuleResult;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.CaughtException;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.PathStep;
import kr.dongkuk.maru.mdm.engine.rule.RuleSetResult.SetCall;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.Test;

/**
 * 실행 응답 매핑(하위 세트 spec §4.1·§4.3·§8, srv:6 묶음 D) — 엔진 결과 객체를 손으로 만들어 {@link RuleSetRunner#result}·
 * {@link RuleSetRunner#engineWarnings}·{@link RuleSetRunner#pathText}·{@link RuleSetRunner#violationText} 를 본다. SET 노드를 엔진이 실제로
 * 실행하는 끝에서 끝 시험은 api 의 {@code RuleSetRunnerSubsetTest}(srv:6 묶음 E1).
 */
class RuleSetRunnerMappingTest {

    private static final Instant TS = Instant.parse("2026-03-01T00:00:00Z");

    private static EngineWarning warn(String ruleId, String message) {
        return new EngineWarning(EngineWarning.Code.EXPR_CELL_NULL, ruleId, null, null, message);
    }

    private static RuleResult step(String ruleId, EngineWarning... warnings) {
        return new RuleResult(ruleId, BigDecimal.ONE, TS, List.of(), false, Map.of(), List.of(), List.of(warnings));
    }

    /** 하위 세트 RS_CHILD — 처리 갈래 c9 로 끝났고 세트 경고·룰 경고가 하나씩. */
    private static RuleSetResult child() {
        return new RuleSetResult("RS_CHILD", TS, List.of(step("R_C", warn("R_C", "child-rule"))), Map.of("Q", "B"),
                List.of(new PathStep("c_start", NodeKind.START, null, null, null), new PathStep("c_r1", NodeKind.RULE, null, 0, null)),
                List.of(warn(null, "child-set")), List.of(), "c9", List.of());
    }

    /** 최상위 RS_TOP — RULE r1, SET s1(RS_CHILD), 하위 세트에서 받은 exception 하나(setPath [s1]). */
    private static RuleSetResult top() {
        return new RuleSetResult("RS_TOP", TS, List.of(step("R_T", warn("R_T", "top-rule"))), Map.of("Q", "A"),
                List.of(new PathStep("start", NodeKind.START, null, null, null),
                        new PathStep("r1", NodeKind.RULE, null, 0, null),
                        new PathStep("s1", NodeKind.SET, null, null, 0),
                        new PathStep("end", NodeKind.END, null, null, null)),
                List.of(warn(null, "top-set")),
                List.of(new CaughtException("c_r1", "R_C", "c9", CatchKind.INPUT_ERROR, "MISSING_KEY", "키 없음", List.of("s1"))),
                null, List.of(new SetCall("s1", "RS_CHILD", child())));
    }

    @Test
    void 경로에_callIndex_를_SET_만_채우고_응답에_calls_요약을_싣는다() {
        RuleSetRunResult r = RuleSetRunner.result(top());

        assertEquals(Arrays.asList(null, null, 0, null), r.getPath().stream().map(p -> p.get("callIndex")).toList());
        assertEquals(List.of("nodeId", "kind", "chosenEdgeId", "stepIndex", "callIndex"), List.copyOf(r.getPath().get(0).keySet()));
        assertEquals(0, r.getPath().get(1).get("stepIndex"));

        Map<String, Object> call = new LinkedHashMap<>();
        call.put("nodeId", "s1");
        call.put("setId", "RS_CHILD");
        call.put("endedBy", "c9");
        assertEquals(List.of(call), r.getCalls());
        assertNull(r.getEndedBy(), "하위 세트의 endedBy 는 calls 에만 있다(spec §4.3)");
        assertEquals("2026-03-01 09:00:00", r.getEvalTs());
        assertEquals(Map.of("Q", "A"), r.getFinalValues());
    }

    @Test
    void caught_맵_끝에_setPath_를_싣는다() {
        Map<String, Object> c = RuleSetRunner.result(top()).getCaught().get(0);
        assertEquals(List.of("ruleNodeId", "ruleId", "catchNodeId", "kind", "code", "message", "setPath"), List.copyOf(c.keySet()));
        assertEquals(List.of("s1"), c.get("setPath"));
        assertEquals("INPUT_ERROR", c.get("kind"));
    }

    @Test
    void SET_이_없는_결과는_calls_가_비고_callIndex_는_모두_null_이다() {
        RuleSetRunResult r = RuleSetRunner.result(child());
        assertEquals(List.of(), r.getCalls());
        assertEquals(Arrays.asList(null, null), r.getPath().stream().map(p -> p.get("callIndex")).toList());
        assertEquals("c9", r.getEndedBy());
    }

    @Test
    void 엔진_경고는_세트_룰_다음에_하위_세트_결과를_calls_순서로_재귀해_모은다() {
        RuleSetResult grand = new RuleSetResult("RS_G", TS, List.of(step("R_G", warn("R_G", "grand-rule"))), Map.of(), List.of(),
                List.of(), List.of(), null, List.of());
        RuleSetResult mid = new RuleSetResult("RS_M", TS, List.of(), Map.of(), List.of(), List.of(warn(null, "mid-set")), List.of(), null,
                List.of(new SetCall("m1", "RS_G", grand)));
        RuleSetResult t = new RuleSetResult("RS_TOP", TS, List.of(step("R_T", warn("R_T", "top-rule"))), Map.of(), List.of(),
                List.of(warn(null, "top-set")), List.of(), null,
                List.of(new SetCall("s1", "RS_M", mid), new SetCall("s2", "RS_CHILD", child())));

        assertEquals(List.of("top-set", "top-rule", "mid-set", "grand-rule", "child-set", "child-rule"),
                RuleSetRunner.engineWarnings(t).stream().map(EngineWarning::message).toList());
    }

    private static FlowNode setNode(String id, String setId, String label) {
        return new FlowNode(id, NodeKind.SET, null, null, label, null, null, setId);
    }

    private static Map<String, FlowDefinition> flows() {
        Map<String, FlowDefinition> m = new HashMap<>();
        m.put("RS_TOP", new FlowDefinition(1, List.of(setNode("s1", "RS_MID", "품질 판정")), List.of()));
        m.put("RS_MID", new FlowDefinition(1, List.of(setNode("s2", "RS_LEAF", " ")), List.of()));
        return m;
    }

    @Test
    void 세트_경로는_label_이_있으면_label_없으면_세트_ID_를_쓰고_모르는_단계부터는_노드_ID_만_쓴다() {
        Map<String, FlowDefinition> f = flows();
        assertEquals("세트 RS_TOP › 품질 판정(s1) › RS_LEAF(s2) › s3 › ",
                RuleSetRunner.pathText("RS_TOP", List.of("s1", "s2", "s3"), f::get));
        assertEquals("세트 RS_TOP › zz › s2 › ", RuleSetRunner.pathText("RS_TOP", List.of("zz", "s2"), f::get),
                "노드를 못 찾으면 그 뒤 단계는 흐름을 모른다");
        assertEquals("", RuleSetRunner.pathText("RS_TOP", List.of(), f::get));
        assertEquals("", RuleSetRunner.pathText("RS_TOP", null, f::get));
    }

    @Test
    void 흐름_조회가_런타임_예외로_실패해도_던지지_않고_그_단계부터_노드_ID_만_쓴다() {
        Map<String, FlowDefinition> f = flows();
        assertEquals("세트 RS_TOP › s1 › s2 › ", RuleSetRunner.pathText("RS_TOP", List.of("s1", "s2"), id -> {
            throw new UnsupportedOperationException("DB 끊김");
        }), "문구 만들기가 원래 위반을 가리지 않는다(D 리뷰)");
        assertEquals("세트 RS_TOP › 품질 판정(s1) › s2 › ", RuleSetRunner.pathText("RS_TOP", List.of("s1", "s2"), id -> {
            if ("RS_MID".equals(id)) {
                throw new IllegalMonitorStateException("둘째 단계만 실패");
            }
            return f.get(id);
        }));
    }

    @Test
    void 위반_문구는_세트_경로_다음에_룰_ID_와_사용자_문구를_붙인다() {
        Violation inner = new Violation(Stage.RESULT_EVAL, Code.TYPE_CONVERSION, "QLTY_GRD_JDG", 1, "COIL_THK", "원문", List.of("s1"));
        String path = RuleSetRunner.pathText("RS_PARENT", inner.setPath(),
                id -> "RS_PARENT".equals(id) ? new FlowDefinition(1, List.of(setNode("s1", "RS_LINE", "품질 판정")), List.of()) : null);
        assertEquals("세트 RS_PARENT › 품질 판정(s1) › [QLTY_GRD_JDG] 문구", RuleSetRunner.violationText(path, inner, "문구"));

        Violation here = new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "원문", List.of());
        assertEquals("문구", RuleSetRunner.violationText(RuleSetRunner.pathText("RS_PARENT", here.setPath(), id -> null), here, "문구"),
                "이 세트에서 난 위반은 경로를 붙이지 않는다");
    }
}
