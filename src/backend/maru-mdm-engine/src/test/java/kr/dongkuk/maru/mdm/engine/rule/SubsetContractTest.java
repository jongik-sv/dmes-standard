package kr.dongkuk.maru.mdm.engine.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluatorFixtures;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.rule.fixture.FlowRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.InMemoryDefinitionLookup;
import kr.dongkuk.maru.mdm.engine.rule.fixture.SampleRules;
import kr.dongkuk.maru.mdm.engine.rule.fixture.TestExpressionConfig;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.Test;

/** 하위 세트 spec §7 — 계약에 더한 이름(실행 의미는 SubsetCallTest 등 Task 4). */
class SubsetContractTest {

    private static MdmRuleEngine engine(InMemoryDefinitionLookup lookup) {
        return new MdmRuleEngine(MdmEvaluatorFixtures.of(TestExpressionConfig.create()), lookup);
    }

    private static InMemoryDefinitionLookup oneLineSet() {
        InMemoryDefinitionLookup lookup = FlowRules.lookup(FlowRules.calc("R_K", "K", "1"));
        lookup.addSet(new RuleSetDefinition("S", null, null, null, List.of("R_K"), SetStatus.INUSE, null));
        return lookup;
    }

    @Test
    void SET_노드_종류와_호출_오류_두_코드와_끝난_종류가_있다() {
        assertEquals(NodeKind.SET, NodeKind.valueOf("SET"));
        assertEquals(Code.SET_CALL_CYCLE, Code.valueOf("SET_CALL_CYCLE"));
        assertEquals(Code.SET_CALL_DEPTH, Code.valueOf("SET_CALL_DEPTH"));
        assertEquals(CatchKind.SUBSET_ENDED, CatchKind.parse("SUBSET_ENDED").orElseThrow());
    }

    @Test
    void 위반의_setPath_는_이_세트에서_난_위반이면_빈_목록이다() {
        Violation v = new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, "QD_S_X", "세트가 없다: QD_S_X", List.of());
        assertEquals(List.of(), v.setPath());
    }

    @Test
    void CATCH_SET_은_예약_이름이라_레코드_키로_오면_RESERVED_KEY() {
        assertEquals(5, ReservedNames.CATCH_NAMES.size());
        assertTrue(ReservedNames.CATCH_NAMES.contains(ReservedNames.CATCH_SET));
        MdmRuleEngine engine = engine(oneLineSet());
        Map<String, Object> record = new LinkedHashMap<>();
        record.put("CATCH_SET", "S");
        EngineEvaluationException e = assertThrows(EngineEvaluationException.class,
                () -> engine.evaluateSet("S", record, SampleRules.EVAL_TS));
        assertEquals(Code.RESERVED_KEY, e.violations().get(0).code());
    }

    @Test
    void 하위_세트가_없는_한_줄_세트의_calls_는_비고_path_의_callIndex_는_null() {
        RuleSetResult r = engine(oneLineSet()).evaluateSet("S", Map.of(), SampleRules.EVAL_TS);
        assertEquals(List.of(), r.calls());
        assertTrue(r.path().stream().allMatch(p -> p.callIndex() == null));
    }
}
