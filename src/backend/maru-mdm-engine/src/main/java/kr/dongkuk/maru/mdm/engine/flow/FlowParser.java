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
 * 흐름 구조 검사와 블록 트리 만들기(plan C3, 받는 노드 spec §3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면 트리를 만들지 않는다.
 * 2단계(트리 만들기)는 첫 오류에서 멈춘다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";
    /** 받는 노드 붙임·종류 오류(받는 노드 spec §5). */
    public static final String CATCH = "FLOW_CATCH";

    private FlowParser() {}

    /** 받는 노드를 붙일 수 있는 노드 종류(받는 노드 spec §3). 하위 세트 호출 스펙이 SET 을 더한다. */
    public static boolean catchable(NodeKind k) {
        return k == NodeKind.RULE;
    }

    /** ruleIds 순서의 한 줄 흐름. 노드 "start", "r1".."rN", "end", 선 "e1".."e(N+1)". */
    public static FlowDefinition linear(List<String> ruleIds) {
        List<FlowNode> nodes = new ArrayList<>();
        List<FlowEdge> edges = new ArrayList<>();
        nodes.add(new FlowNode("start", NodeKind.START, null, null, null, null, null));
        String prev = "start";
        for (int i = 0; i < ruleIds.size(); i++) {
            String id = "r" + (i + 1);
            nodes.add(new FlowNode(id, NodeKind.RULE, ruleIds.get(i), null, null, null, null));
            edges.add(new FlowEdge("e" + (i + 1), prev, id, null, null, false, null));
            prev = id;
        }
        nodes.add(new FlowNode("end", NodeKind.END, null, null, null, null, null));
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
        boolean hasCatch = byId.values().stream().anyMatch(n -> n.kind() == NodeKind.CATCH);
        // 받는 룰 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — h 가 채우고 e·2단계가 쓴다.
        Map<String, List<FlowNode>> catchesOf = new LinkedHashMap<>();
        for (FlowNode n : byId.values()) {
            FlowNode target = n.kind() == NodeKind.CATCH && !blank(n.attachTo()) ? byId.get(n.attachTo()) : null;
            if (target != null && catchable(target.kind())) {
                catchesOf.computeIfAbsent(target.id(), k -> new ArrayList<>()).add(n);
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
            degree(issues, n.id(), "들어오는", i, inRule(n.kind(), hasCatch));
            degree(issues, n.id(), "나가는", o, outRule(n.kind()));
            if (n.kind() == NodeKind.RULE && blank(n.ruleId())) {
                issues.add(structure(n.id(), null, "룰 노드 " + n.id() + "에 룰 ID가 없다"));
            }
            if (n.kind() == NodeKind.MERGE) {
                FlowNode s = n.splitId() == null ? null : byId.get(n.splitId());
                boolean split = s != null && (s.kind() == NodeKind.IF || s.kind() == NodeKind.PARALLEL);
                boolean guard = s != null && catchesOf.containsKey(s.id());
                if (!split && !guard) {
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
        // h1..h5 — 받는 노드별(받는 노드 spec §5 FLOW_CATCH)
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.CATCH) {
                continue;
            }
            FlowNode target = blank(n.attachTo()) ? null : byId.get(n.attachTo());
            if (target == null) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "가 붙은 룰 " + (blank(n.attachTo()) ? "-" : n.attachTo()) + "가 없다"));
            } else if (!catchable(target.kind())) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "는 룰 노드에만 붙일 수 있다(" + target.id() + "는 " + target.kind() + ")"));
            }
            List<String> keys = n.catches() == null ? List.of() : n.catches();
            if (keys.isEmpty()) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "에 받을 예외 종류가 없다"));
            }
            Set<String> seen = new HashSet<>();
            for (String k : keys) {
                if (CatchKind.parse(k).isEmpty()) {
                    issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "의 예외 종류 " + k + "를 모른다"));
                } else if (!seen.add(k)) {
                    issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "에 예외 종류 " + k + "가 겹친다"));
                }
            }
        }
        // h6·h7 — 받는 룰별
        for (Map.Entry<String, List<FlowNode>> en : catchesOf.entrySet()) {
            Map<String, String> owner = new HashMap<>();
            for (FlowNode c : en.getValue()) {
                for (String k : c.catches() == null ? List.<String>of() : c.catches()) {
                    if (CatchKind.parse(k).isEmpty()) {
                        continue;
                    }
                    String prev = owner.putIfAbsent(k, c.id());
                    if (prev != null && !prev.equals(c.id())) {
                        issues.add(new FlowIssue(CATCH, c.id(), null, "룰 노드 " + en.getKey() + "에서 예외 종류 " + k + "를 " + prev + "와 " + c.id() + "가 함께 받는다"));
                    }
                }
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && en.getKey().equals(m.splitId())).count();
            if (merges > 1) {
                issues.add(structure(en.getKey(), null, "룰 " + en.getKey() + "로 돌아오는 합류가 " + merges + "개다. 1개까지 둔다"));
            }
        }
        if (!issues.isEmpty()) {
            return new FlowParse(null, List.copyOf(issues));
        }
        try {
            return new FlowParse(new Builder(byId, out, catchesOf).build(), List.of());
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
        final Map<String, List<FlowNode>> catchesOf;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
        String endId;
        int order;

        Builder(Map<String, FlowNode> nodes, Map<String, List<FlowEdge>> out, Map<String, List<FlowNode>> catchesOf) {
            this.nodes = nodes;
            this.out = out;
            this.catchesOf = catchesOf;
            for (FlowNode n : nodes.values()) {
                if (n.kind() == NodeKind.MERGE) {
                    mergeOf.put(n.splitId(), n.id());
                }
            }
        }

        FlowTree build() {
            FlowNode start = nodes.values().stream().filter(n -> n.kind() == NodeKind.START).findFirst().orElseThrow();
            FlowNode end = nodes.values().stream().filter(n -> n.kind() == NodeKind.END).findFirst().orElseThrow();
            endId = end.id();
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
                cur = step(cur, items, chain, "갈래가 " + stop + "에서 닫히지 않고 ");
            }
            return new Seq(List.copyOf(items));
        }

        /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다. notClosed 는 START·END·MERGE 에 닿았을 때 문구 앞부분. */
        String step(String cur, List<Block> items, List<Frame> chain, String notClosed) {
            FlowNode n = nodes.get(cur);
            if (visited.contains(cur)) {
                throw new Stop(structure(cur, null, cur + "를 두 번 지난다. 순환이 있거나 갈래가 짝 합류 밖에서 만난다"));
            }
            if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                throw new Stop(structure(cur, null, notClosed + cur + "로 나간다"));
            }
            visited.add(cur);
            positions.put(cur, new Position(chain, order++));
            if (n.kind() == NodeKind.RULE) {
                RuleStep s = new RuleStep(cur, n.ruleId());
                steps.add(s);
                List<FlowNode> catches = catchesOf.getOrDefault(cur, List.of());
                if (catches.isEmpty()) {
                    items.add(s);
                    return next(cur);
                }
                Guarded g = guarded(s, catches, chain);
                items.add(g);
                return g.mergeId() == null ? next(cur) : next(g.mergeId());
            }
            if (n.kind() == NodeKind.TASK) {
                items.add(new TaskStep(cur));
                return next(cur);
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
            return next(mergeId);
        }

        /** 받는 룰(R8·R9) — 정상 갈래(사슬 0) 다음 처리 갈래(사슬 k+1, 받는 노드 배열 순서). */
        Guarded guarded(RuleStep rule, List<FlowNode> catches, List<Frame> chain) {
            String id = rule.nodeId();
            String mergeId = mergeOf.get(id);
            Seq normal = mergeId == null ? new Seq(List.of()) : seq(next(id), mergeId, FlowTree.extend(chain, id, 0));
            List<Guarded.Handler> handlers = new ArrayList<>();
            for (int k = 0; k < catches.size(); k++) {
                FlowNode c = catches.get(k);
                visited.add(c.id());
                handlers.add(handler(c, mergeId, FlowTree.extend(chain, id, k + 1)));
            }
            if (mergeId != null) {
                visited.add(mergeId);
            }
            return new Guarded(rule, normal, List.copyOf(handlers), mergeId);
        }

        /** 처리 갈래 — 받는 노드에서 나가는 선부터 돌아오는 합류(있으면) 또는 END 까지. */
        Guarded.Handler handler(FlowNode c, String mergeId, List<Frame> chain) {
            List<Block> items = new ArrayList<>();
            String notClosed = "처리 갈래 " + c.id() + "가 " + (mergeId == null ? "끝" : "합류 " + mergeId + "나 끝") + "에 닿지 않고 ";
            String cur = next(c.id());
            while (!cur.equals(endId) && !cur.equals(mergeId)) {
                cur = step(cur, items, chain, notClosed);
            }
            List<CatchKind> kinds = c.catches().stream().map(k -> CatchKind.parse(k).orElseThrow()).toList();
            return new Guarded.Handler(c.id(), kinds, new Seq(List.copyOf(items)), cur.equals(endId));
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

    /** 개수 규칙: 0 = 없어야, 1 = 1개, 2 = 2개 이상, 3 = 1개 이상. */
    private static int inRule(NodeKind k, boolean hasCatch) {
        return switch (k) {
            case START, CATCH -> 0;
            case MERGE -> 2;
            case END -> hasCatch ? 3 : 1;
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
        boolean ok = rule == 2 ? n >= 2 : rule == 3 ? n >= 1 : n == rule;
        if (!ok) {
            String text = rule == 0 ? "없어야 한다" : rule == 1 ? "1개여야 한다" : rule == 2 ? "2개 이상이어야 한다" : "1개 이상이어야 한다";
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
