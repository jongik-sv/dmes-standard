package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 구조 검사를 통과한 흐름(plan C2). 블록 트리와, 노드마다 루트에서 지나온 (분기, 갈래 번호) 목록·깊이 우선 순번을 갖는다.
 * {@link FlowParser#parse} 만 만든다.
 */
public final class FlowTree {

    /** 두 노드의 관계. BEFORE = 앞 노드가 같은 경로에서 먼저 실행된다. */
    public enum Relation { SAME, BEFORE, AFTER, EXCLUSIVE, PARALLEL }

    /** 지나온 분기와 그 안의 갈래 번호(실행 순서 0부터). */
    record Frame(String splitId, int branch) {}

    /** 노드 위치 — 지나온 분기 목록과 깊이 우선 순번. */
    record Position(List<Frame> chain, int order) {}

    private final Seq root;
    private final String startId;
    private final String endId;
    private final List<RuleStep> ruleSteps;
    private final Map<String, Position> positions;
    private final Map<String, NodeKind> splitKinds;

    FlowTree(Seq root, String startId, String endId, List<RuleStep> ruleSteps, Map<String, Position> positions,
            Map<String, NodeKind> splitKinds) {
        this.root = root;
        this.startId = startId;
        this.endId = endId;
        this.ruleSteps = List.copyOf(ruleSteps);
        this.positions = Map.copyOf(positions);
        this.splitKinds = Map.copyOf(splitKinds);
    }

    public Seq root() {
        return root;
    }

    public String startId() {
        return startId;
    }

    public String endId() {
        return endId;
    }

    /** 모든 RULE 노드, 깊이 우선(갈래 실행 순서) 순서. */
    public List<RuleStep> ruleSteps() {
        return ruleSteps;
    }

    /** ruleSteps 의 ruleId 를 처음 나온 순서로 중복 없이 — RULE_IDS 로 저장할 목록. */
    public List<String> ruleIds() {
        LinkedHashSet<String> ids = new LinkedHashSet<>();
        ruleSteps.forEach(s -> ids.add(s.ruleId()));
        return List.copyOf(ids);
    }

    /** 분기가 하나라도 있으면 true. */
    public boolean branched() {
        return !splitKinds.isEmpty();
    }

    /**
     * 두 노드(RULE·TASK·IF·PARALLEL)의 관계. 두 ID 가 같으면(a==b) 노드를 찾지 않고 바로 SAME 을 낸다. 지나온 분기 목록을 앞에서부터 비교해 같은 분기에서 갈래 번호가 처음 달라지면 그
     * 분기 종류로 EXCLUSIVE(IF)·PARALLEL 을 낸다. 달라지는 곳이 없으면 같은 경로이고 깊이 우선 순번으로 BEFORE·AFTER 다.
     *
     * @throws IllegalArgumentException 트리에 없는 노드(START·END·MERGE 포함)
     */
    public Relation relation(String nodeA, String nodeB) {
        if (nodeA.equals(nodeB)) {
            return Relation.SAME;
        }
        Position a = position(nodeA);
        Position b = position(nodeB);
        int n = Math.min(a.chain().size(), b.chain().size());
        for (int i = 0; i < n; i++) {
            Frame fa = a.chain().get(i);
            Frame fb = b.chain().get(i);
            if (!fa.splitId().equals(fb.splitId())) {
                break;
            }
            if (fa.branch() != fb.branch()) {
                return splitKinds.get(fa.splitId()) == NodeKind.IF ? Relation.EXCLUSIVE : Relation.PARALLEL;
            }
        }
        return a.order() < b.order() ? Relation.BEFORE : Relation.AFTER;
    }

    private Position position(String nodeId) {
        Position p = positions.get(nodeId);
        if (p == null) {
            throw new IllegalArgumentException("흐름 트리에 없는 노드: " + nodeId);
        }
        return p;
    }

    static List<Frame> extend(List<Frame> chain, String splitId, int branch) {
        List<Frame> out = new ArrayList<>(chain);
        out.add(new Frame(splitId, branch));
        return List.copyOf(out);
    }
}
