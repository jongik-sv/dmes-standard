package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;

/**
 * 테스트 도우미(mdm/api 테스트 소스, 엔진과 같은 패키지 — {@link FlowKeysProbe} 와 같은 방식) — package-private {@link SetShape} 를 엔진과 같은 재료로
 * 만들어 inputs·mustInputs·outputs·always 를 묻는다(하위 세트 srv:6 {@code SetCallIoEngineAgreementTest}). 엔진 main 코드는 바꾸지 않는다.
 */
public final class SetShapeProbe {

    private SetShapeProbe() {
    }

    /** 겉모양을 평범한 값으로 — 순서 있는 목록은 그대로, always 는 집합. */
    public record Shape(List<String> inputs, List<String> mustInputs, List<String> outputs, Set<String> always) {
    }

    /** 손주 겉모양(코퍼스 calls 처럼 이미 계산된 것) — mustInputs 는 비운다(부모 inputs·outputs·always 계산에 쓰지 않는다). */
    public static SetShape given(List<String> inputs, List<String> outputs, Set<String> always) {
        return new SetShape(inputs, List.of(), outputs, always);
    }

    /** 엔진 {@code MdmRuleEngine.prepareSet} 과 같은 재료로 겉모양을 만든다 — shapes 는 SET 노드 ID → 손주 겉모양. */
    public static SetShape of(FlowTree tree, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes, MdmEvaluator evaluator) {
        return SetShape.of(tree, defs, shapes, new FlowKeys(defs, shapes, evaluator));
    }

    public static Shape view(SetShape s) {
        return new Shape(s.inputs(), s.mustInputs(), s.outputs(), s.always());
    }

    /**
     * 저장된 세트의 엔진 겉모양 — {@code MdmRuleEngine.prepareSet}·{@code prepareCall} 을 따라 판정 시각의 정의를 조회해 손주부터 만든다. 하위 세트가
     * 없음·폐기·흐름 오류면 그 SET 노드를 빼고(엔진 준비와 같다), 조회 안 되는 룰도 뺀다. 순환·깊이는 보지 않는다(시험 데이터에 두지 않는다).
     */
    public static Optional<SetShape> stored(DefinitionLookup lookup, MdmEvaluator evaluator, String setId, Instant ts) {
        Optional<RuleSetDefinition> found = lookup.ruleSet(setId, ts);
        if (found.isEmpty() || found.get().status() == SetStatus.DEPRECATED) {
            return Optional.empty();
        }
        RuleSetDefinition def = found.get();
        FlowParse parsed = FlowParser.parse(def.flow() == null ? FlowParser.linear(def.ruleIds()) : def.flow());
        if (parsed.tree() == null) {
            return Optional.empty();
        }
        FlowTree tree = parsed.tree();
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (String ruleId : tree.ruleIds()) {
            lookup.rule(ruleId, ts).ifPresent(d -> defs.put(ruleId, d));
        }
        Map<String, SetShape> shapes = new LinkedHashMap<>();
        for (SetStep s : tree.setSteps()) {
            if (s.setId() != null && !s.setId().isBlank()) {
                stored(lookup, evaluator, s.setId(), ts).ifPresent(sh -> shapes.put(s.nodeId(), sh));
            }
        }
        return Optional.of(of(tree, defs, shapes, evaluator));
    }

    /** 엔진이 RULE 단계가 읽는다고 보는 이름({@link FlowKeys#needed}). */
    public static List<String> needed(RuleDefinition def) {
        return FlowKeys.needed(def);
    }

    /** 엔진이 RULE 단계가 만든다고 보는 이름({@link RuleEvaluator#resultNames}). */
    public static List<String> resultNames(RuleDefinition def) {
        return RuleEvaluator.resultNames(def);
    }
}
