package kr.dongkuk.maru.mdm.engine.rule;

import static kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules.calc;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.RuleFixtures.rec;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.inuse;
import static kr.dongkuk.maru.mdm.engine.rule.fixture.SubsetFlows.line;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.rule;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.set;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §3.3·C-D10 — 순환·깊이(5 통과, 6 거부). 서버 RuleSetCallGraphTest·cactus 미리 받기와 같은 경계다(Review Focus 4). */
class SubsetCycleDepthTest {

    private final InMemoryDefinitionLookup lookup = FlowRules.lookup(calc("R_K", "K", "1"));
    private final MdmRuleEngine engine = new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);

    private Violation first(String setId) {
        return assertThrows(EngineEvaluationException.class, () -> engine.evaluateSet(setId, rec(), SampleRules.EVAL_TS)).violations().get(0);
    }

    @Test
    void 세트끼리_서로_부르면_SET_CALL_CYCLE() {
        lookup.addSet(inuse("A", line(set("s1", "B"))));
        lookup.addSet(inuse("B", line(set("s1", "A"))));
        Violation v = first("A");
        assertEquals(List.of(Stage.SET_CHECK, Code.SET_CALL_CYCLE, "세트 호출이 순환한다: A › B › A", List.of("s1")),
                List.of(v.stage(), v.code(), v.message(), v.setPath()));
    }

    @Test
    void 자기_자신을_부르면_SET_CALL_CYCLE() {
        lookup.addSet(inuse("A", line(set("s1", "A"))));
        Violation v = first("A");
        assertEquals(List.of(Code.SET_CALL_CYCLE, "세트 호출이 순환한다: A › A", List.of()), List.of(v.code(), v.message(), v.setPath()));
    }

    @Test
    void 다섯_단계는_돌고_여섯_단계는_SET_CALL_DEPTH() {
        assertEquals(5, SetShape.MAX_CALL_DEPTH);
        for (int i = 0; i < 5; i++) {
            lookup.addSet(inuse("S" + i, line(set("s1", "S" + (i + 1)))));
        }
        lookup.addSet(inuse("S5", line(rule("k", "R_K"))));
        RuleSetResult ok = engine.evaluateSet("S0", rec(), SampleRules.EVAL_TS);
        assertEquals(1, ok.calls().size(), "S0 → … → S5 는 5단계");
        RuleSetResult deepest = ok;
        for (int i = 0; i < 5; i++) {
            deepest = deepest.calls().get(0).result();
        }
        assertEquals("S5", deepest.setId());

        // 같은 엔진(준비 기억이 있다)에서 손주 아래 세트만 바꿔도 새 정의로 다시 준비한다.
        lookup.addSet(inuse("S5", line(set("s1", "S6"))));
        lookup.addSet(inuse("S6", line(rule("k", "R_K"))));
        Violation v = first("S0");
        assertEquals(Code.SET_CALL_DEPTH, v.code());
        assertEquals("S6", v.name());
        assertEquals("세트 호출이 6단계다. 5단계까지 부른다: S0 › S1 › S2 › S3 › S4 › S5 › S6", v.message());
        assertEquals(List.of("s1", "s1", "s1", "s1", "s1"), v.setPath());
    }
}
