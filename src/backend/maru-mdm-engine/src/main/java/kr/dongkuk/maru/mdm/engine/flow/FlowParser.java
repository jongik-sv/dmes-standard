package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Frame;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Position;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowEdge;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 흐름 구조 검사와 블록 트리 만들기(plan C3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면 트리를 만들지 않는다.
 * 2단계(트리 만들기)는 첫 오류에서 멈춘다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";

    private FlowParser() {}

    /** ruleIds 순서의 한 줄 흐름. 노드 "start", "r1".."rN", "end", 선 "e1".."e(N+1)". */
    public static FlowDefinition linear(List<String> ruleIds) {
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null));
        String prev = "start";
        for (int i = 0; i < ruleIds.size(); i++) {
            String id = "r" + (i + 1);
            nodes.add(new FlowNode(id, NodeKind.RULE, ruleIds.get(i), null, null));
            edges.add(new FlowEdge("e" + (i + 1), prev, id, null, null, false, null));
            prev = id;
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null));
        edges.add(new FlowEdge("e" + (ruleIds.size() + 1), prev, "end", null, null, false, null));
        return new FlowDefinition(1, List.copyOf(nodes), List.copyOf(edges));
    }

    public static FlowParse parse(FlowDefinition flow) {
        List<FlowIssue> issues = new ArrayList<>();
        Map<String, FlowNode> byId = new LinkedHashMap<>();
        // a — 노드 ID 중복
        for (FlowNode n : flow.nodes()) {
            if (byId.containsKey(n.id())) {
                issues.add(structure(n.id(), null, "노드 ID " + n.id() + "가 겹친다"));
            } else {
                byId.put(n.id(), n);
            }
        }
        // b1·b2 — 시작·끝 개수
        long starts = byId.values().stream().filter(n -> n.kind() == NodeKind.START).count();
        long ends = byId.values().stream().filter(n -> n.kind() == NodeKind.END).count();
        if (starts != 1) {
            issues.add(structure(null, null, "시작 노드가 " + starts + "개다. 정확히 1개여야 한다"));
        }
        if (ends != 1) {
            issues.add(structure(null, null, "끝 노드가 " + ends + "개다. 정확히 1개여야 한다"));
        }
        // c — 없는 노드를 가리키는 선(걸린 선은 개수 계산에서 뺀다)
        Map<String, List<FlowEdge>> in = new HashMap<>();
        Map<String, List<FlowEdge>> out = new HashMap<>();
        for (FlowEdge e : flow.edges()) {
            boolean ok = true;
            if (!byId.containsKey(e.from())) {
                issues.add(structure(e.from(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.from() + "를 가리킨다"));
                ok = false;
            }
            if (!byId.containsKey(e.to())) {
                issues.add(structure(e.to(), e.id(), "선 " + e.id() + "가 없는 노드 " + e.to() + "를 가리킨다"));
                ok = false;
            }
            if (ok) {
                out.computeIfAbsent(e.from(), k -> new ArrayList<>()).add(e);
                in.computeIfAbsent(e.to(), k -> new ArrayList<>()).add(e);
            }
        }
        // d1·d2·e·f1 — 노드별
        for (FlowNode n : byId.values()) {
            int i = in.getOrDefault(n.id(), List.of()).size();
            int o = out.getOrDefault(n.id(), List.of()).size();
            degree(issues, n.id(), "들어오는", i, inRule(n.kind()));
            degree(issues, n.id(), "나가는", o, outRule(n.kind()));
            if (n.kind() == NodeKind.RULE && blank(n.ruleId())) {
                issues.add(structure(n.id(), null, "룰 노드 " + n.id() + "에 룰 ID가 없다"));
            }
            if (n.kind() == NodeKind.MERGE) {
                FlowNode s = n.splitId() == null ? null : byId.get(n.splitId());
                if (s == null || (s.kind() != NodeKind.IF && s.kind() != NodeKind.PARALLEL)) {
                    issues.add(structure(n.id(), null, "합류 " + n.id() + "의 짝 분기 " + (n.splitId() == null ? "-" : n.splitId()) + "가 없다"));
                }
            }
        }
        // f2·g1..g5 — 분기별
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.IF && n.kind() != NodeKind.PARALLEL) {
                continue;
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && n.id().equals(m.splitId())).count();
            if (merges != 1) {
                issues.add(structure(n.id(), null, "분기 " + n.id() + "를 닫는 합류가 " + merges + "개다. 정확히 1개여야 한다"));
            }
            List<FlowEdge> outs = out.getOrDefault(n.id(), List.of());
            List<FlowEdge> ordered = new ArrayList<>();
            if (n.kind() == NodeKind.IF) {
                long others = outs.stream().filter(FlowEdge::otherwise).count();
                if (others != 1) {
                    issues.add(new FlowIssue(IF_ELSE, n.id(), null, "IF " + n.id() + "에 \"그 외\" 갈래가 " + others + "개다. 정확히 1개여야 한다"));
                }
                for (FlowEdge e : outs) {
                    if (!e.otherwise() && blank(e.cond())) {
                        issues.add(new FlowIssue(IF_ELSE, n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "에 조건식이 없다"));
                    }
                }
                outs.stream().filter(e -> !e.otherwise()).forEach(ordered::add);
            } else {
                for (FlowEdge e : outs) {
                    if (!blank(e.cond()) || e.otherwise()) {
                        issues.add(structure(n.id(), e.id(), "병렬 분기 " + n.id() + "의 갈래 " + e.id() + "에는 조건을 둘 수 없다"));
                    }
                }
                ordered.addAll(outs);
            }
            for (FlowEdge e : ordered) {
                if (e.order() == null) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 " + e.id() + "에 순서가 없다"));
                }
            }
            Set<Integer> seen = new HashSet<>();
            for (FlowEdge e : ordered) {
                if (e.order() != null && !seen.add(e.order())) {
                    issues.add(structure(n.id(), e.id(), "분기 " + n.id() + "의 갈래 순서 " + e.order() + "가 겹친다"));
                }
            }
        }
        if (!issues.isEmpty()) {
            return new FlowParse(null, List.copyOf(issues));
        }
        try {
            return new FlowParse(new Builder(byId, out).build(), List.of());
        } catch (Stop s) {
            return new FlowParse(null, List.of(s.issue));
        }
    }

    // ------------------------------------------------------------------ 2단계

    /** 첫 오류에서 멈추려고 던진다. */
    private static final class Stop extends RuntimeException {
        private static final long serialVersionUID = 1L;
        final transient FlowIssue issue;

        Stop(FlowIssue issue) {
            super(issue.message(), null, false, false);
            this.issue = issue;
        }
    }

    private static final class Builder {
        final Map<String, FlowNode> nodes;
        final Map<String, List<FlowEdge>> out;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
        int order;

        Builder(Map<String, FlowNode> nodes, Map<String, List<FlowEdge>> out) {
            this.nodes = nodes;
            this.out = out;
            for (FlowNode n : nodes.values()) {
                if (n.kind() == NodeKind.MERGE) {
                    mergeOf.put(n.splitId(), n.id());
                }
            }
        }

        FlowTree build() {
            FlowNode start = nodes.values().stream().filter(n -> n.kind() == NodeKind.START).findFirst().orElseThrow();
            FlowNode end = nodes.values().stream().filter(n -> n.kind() == NodeKind.END).findFirst().orElseThrow();
            visited.add(start.id());
            Seq root = seq(next(start.id()), end.id(), List.of());
            visited.add(end.id());
            for (FlowNode n : nodes.values()) {
                if (!visited.contains(n.id())) {
                    throw new Stop(structure(n.id(), null, n.id() + "에 도달할 수 없다"));
                }
            }
            return new FlowTree(root, start.id(), end.id(), steps, positions, splitKinds);
        }

        Seq seq(String cur, String stop, List<Frame> chain) {
            List<Block> items = new ArrayList<>();
            while (!cur.equals(stop)) {
                FlowNode n = nodes.get(cur);
                if (visited.contains(cur)) {
                    throw new Stop(structure(cur, null, cur + "를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"));
                }
                if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                    throw new Stop(structure(cur, null, "갈래가 " + stop + "에서 닫히지 않고 " + cur + "로 나간다"));
                }
                visited.add(cur);
                positions.put(cur, new Position(chain, order++));
                if (n.kind() == NodeKind.RULE) {
                    RuleStep s = new RuleStep(cur, n.ruleId());
                    items.add(s);
                    steps.add(s);
                    cur = next(cur);
                    continue;
                }
                if (n.kind() == NodeKind.TASK) {
                    items.add(new TaskStep(cur));
                    cur = next(cur);
                    continue;
                }
                String mergeId = mergeOf.get(cur);
                splitKinds.put(cur, n.kind());
                List<FlowEdge> ordered = ordered(n.kind(), out.get(cur));
                List<Branch> branches = new ArrayList<>();
                for (int b = 0; b < ordered.size(); b++) {
                    FlowEdge e = ordered.get(b);
                    branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), seq(e.to(), mergeId, FlowTree.extend(chain, cur, b))));
                }
                visited.add(mergeId);
                items.add(new Split(cur, n.kind(), mergeId, List.copyOf(branches)));
                cur = next(mergeId);
            }
            return new Seq(List.copyOf(items));
        }

        String next(String nodeId) {
            return out.get(nodeId).get(0).to();
        }

        /** IF: 그 외가 아닌 선 order 오름차순 뒤 그 외. PARALLEL: order 오름차순. */
        static List<FlowEdge> ordered(NodeKind kind, List<FlowEdge> edges) {
            List<FlowEdge> main = new ArrayList<>(edges.stream().filter(e -> !e.otherwise()).toList());
            main.sort(Comparator.comparingInt(FlowEdge::order));
            if (kind == NodeKind.IF) {
                edges.stream().filter(FlowEdge::otherwise).forEach(main::add);
            }
            return main;
        }
    }

    // ------------------------------------------------------------------ 도우미

    /** 개수 규칙: 0 = 없어야, 1 = 1개, 2 = 2개 이상. */
    private static int inRule(NodeKind k) {
        return switch (k) {
            case START -> 0;
            case MERGE -> 2;
            default -> 1;
        };
    }

    private static int outRule(NodeKind k) {
        return switch (k) {
            case END -> 0;
            case IF, PARALLEL -> 2;
            default -> 1;
        };
    }

    private static void degree(List<FlowIssue> issues, String id, String dir, int n, int rule) {
        boolean ok = rule == 2 ? n >= 2 : n == rule;
        if (!ok) {
            String text = rule == 0 ? "없어야 한다" : rule == 1 ? "1개여야 한다" : "2개 이상이어야 한다";
            issues.add(structure(id, null, id + "의 " + dir + " 선이 " + n + "개다. " + text));
        }
    }

    private static FlowIssue structure(String nodeId, String edgeId, String message) {
        return new FlowIssue(STRUCTURE, nodeId, edgeId, message);
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
