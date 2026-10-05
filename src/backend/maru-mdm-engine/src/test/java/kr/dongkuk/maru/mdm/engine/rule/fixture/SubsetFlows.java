package kr.dongkuk.maru.mdm.engine.rule.fixture;

import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.e;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.end;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.flow;
import static kr.dongkuk.maru.mdm.engine.testsupport.FlowFixtures.start;

import java.util.ArrayList;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;

/** 하위 세트 시험용 흐름(하위 세트 계획 Task 4). */
public final class SubsetFlows {

    private SubsetFlows() {}

    /** start → mids(차례로) → end. 선 ID 는 e1, e2, … */
    public static FlowDefinition line(FlowNode... mids) {
        List<FlowNode> nodes = new ArrayList<>();
        nodes.add(start());
        nodes.addAll(List.of(mids));
        nodes.add(end());
        List<FlowEdge> edges = new ArrayList<>();
        for (int i = 0; i + 1 < nodes.size(); i++) {
            edges.add(e("e" + (i + 1), nodes.get(i).id(), nodes.get(i + 1).id()));
        }
        return flow(nodes, edges);
    }

    /** 사용 중 세트(흐름만, RULE_IDS 는 비움 — 엔진은 흐름이 있으면 RULE_IDS 를 보지 않는다). */
    public static RuleSetDefinition inuse(String setId, FlowDefinition f) {
        return new RuleSetDefinition(setId, null, null, null, List.of(), SetStatus.INUSE, f);
    }

    public static RuleSetDefinition deprecated(String setId, FlowDefinition f) {
        return new RuleSetDefinition(setId, null, null, null, List.of(), SetStatus.DEPRECATED, f);
    }

    /** 라벨이 있는 받는 노드. {@code FlowFixtures.catchNode(id, attachTo, String... kinds)} 는 라벨을 받지 않는다. */
    public static FlowNode labeledCatch(String id, String attachTo, String label, String... kinds) {
        return new FlowNode(id, NodeKind.CATCH, null, null, label, attachTo, List.of(kinds), null);
    }
}
