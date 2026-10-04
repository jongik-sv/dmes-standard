package kr.dongkuk.maru.mdm.engine.flow;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
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
 * 흐름 구조 검사와 블록 트리 만들기(plan C3, 받는 노드 spec §3, implicit-join spec §2·§3). 1단계는 어긋난 것을 모두 모으고, 하나라도 있으면
 * 트리를 만들지 않는다. 2단계(트리 만들기)는 첫 오류에서 멈춘다. IF 의 모이는 자리와 처리 갈래의 돌아오는 자리는 그 블록에 닿을 때
 * 줄기(spine)로 계산하고 IF 별로 기억한다. 문구·순서를 바꾸면 m-mdm flow-model.ts 와 rule-set-corpus.json 을 함께 바꾼다.
 */
public final class FlowParser {

    public static final String STRUCTURE = "FLOW_STRUCTURE";
    public static final String IF_ELSE = "FLOW_IF_ELSE";
    /** 받는 노드 붙임·종류 오류(받는 노드 spec §5). */
    public static final String CATCH = "FLOW_CATCH";

    private FlowParser() {}

    /** 받는 노드를 붙일 수 있는 노드 종류(implicit-join spec §2.7 — RULE·TASK). 하위 세트 호출 스펙이 SET 을 더한다. */
    public static boolean catchable(NodeKind k) {
        return k == NodeKind.RULE || k == NodeKind.TASK;
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
        Map<String, FlowNode> byId = indexNodes(flow, issues);
        Map<String, List<FlowNode>> catchesOf = attachedCatches(byId);
        checkStartEnd(byId, issues);
        Map<String, List<FlowEdge>> in = new HashMap<>();
        Map<String, List<FlowEdge>> out = new HashMap<>();
        linkEdges(flow, byId, issues, in, out);
        checkNodes(byId, in, out, catchesOf, issues);
        checkSplits(byId, out, issues);
        checkCatchNodes(byId, issues);
        checkCatchTargets(byId, catchesOf, issues);
        if (!issues.isEmpty()) {
            return new FlowParse(null, List.copyOf(issues));
        }
        return buildTree(byId, out, catchesOf);
    }

    // ------------------------------------------------------------------ 1단계(어긋난 것을 모두 모은다 — 호출 순서가 이슈 순서다)

    /** a — 노드 ID 중복. 처음 나온 노드만 색인에 넣는다(노드 배열 순서). */
    private static Map<String, FlowNode> indexNodes(FlowDefinition flow, List<FlowIssue> issues) {
        Map<String, FlowNode> byId = new LinkedHashMap<>();
        for (FlowNode n : flow.nodes()) {
            if (byId.containsKey(n.id())) {
                issues.add(structure(n.id(), null, "노드 ID " + n.id() + "가 겹친다"));
            } else {
                byId.put(n.id(), n);
            }
        }
        return byId;
    }

    /** 받는 노드가 붙은 노드 → 붙은 받는 노드(노드 배열 순서). 붙임이 맞는 것만 — h 가 채우고 e·2단계가 쓴다. */
    private static Map<String, List<FlowNode>> attachedCatches(Map<String, FlowNode> byId) {
        Map<String, List<FlowNode>> catchesOf = new LinkedHashMap<>();
        for (FlowNode n : byId.values()) {
            FlowNode target = n.kind() == NodeKind.CATCH && !blank(n.attachTo()) ? byId.get(n.attachTo()) : null;
            if (target != null && catchable(target.kind())) {
                catchesOf.computeIfAbsent(target.id(), k -> new ArrayList<>()).add(n);
            }
        }
        return catchesOf;
    }

    /** b1·b2 — 시작·끝 개수. */
    private static void checkStartEnd(Map<String, FlowNode> byId, List<FlowIssue> issues) {
        long starts = byId.values().stream().filter(n -> n.kind() == NodeKind.START).count();
        long ends = byId.values().stream().filter(n -> n.kind() == NodeKind.END).count();
        if (starts != 1) {
            issues.add(structure(null, null, "시작 노드가 " + starts + "개다. 정확히 1개여야 한다"));
        }
        if (ends != 1) {
            issues.add(structure(null, null, "끝 노드가 " + ends + "개다. 정확히 1개여야 한다"));
        }
    }

    /** c — 없는 노드를 가리키는 선. 걸린 선은 in·out 에 넣지 않는다(개수 계산에서 뺀다). */
    private static void linkEdges(FlowDefinition flow, Map<String, FlowNode> byId, List<FlowIssue> issues, Map<String, List<FlowEdge>> in,
            Map<String, List<FlowEdge>> out) {
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
    }

    /** d1·d2·e·f1 — 노드별 선 개수, 룰 ID, 합류의 짝 분기. */
    private static void checkNodes(Map<String, FlowNode> byId, Map<String, List<FlowEdge>> in, Map<String, List<FlowEdge>> out,
            Map<String, List<FlowNode>> catchesOf, List<FlowIssue> issues) {
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
                boolean split = s != null && (s.kind() == NodeKind.IF || s.kind() == NodeKind.PARALLEL);
                boolean guard = s != null && catchesOf.containsKey(s.id());
                if (!split && !guard) {
                    issues.add(structure(n.id(), null, "합류 " + n.id() + "의 짝 분기 " + (n.splitId() == null ? "-" : n.splitId()) + "가 없다"));
                }
            }
        }
    }

    /** f2·g1..g5·f4 — 분기별. 한 분기 안 순서는 합류 개수 → 갈래 조건 → 갈래 순서 → 같은 도착 갈래다. */
    private static void checkSplits(Map<String, FlowNode> byId, Map<String, List<FlowEdge>> out, List<FlowIssue> issues) {
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.IF && n.kind() != NodeKind.PARALLEL) {
                continue;
            }
            long merges = byId.values().stream().filter(m -> m.kind() == NodeKind.MERGE && n.id().equals(m.splitId())).count();
            if (n.kind() == NodeKind.PARALLEL && merges != 1) {
                issues.add(structure(n.id(), null, "분기 " + n.id() + "를 닫는 합류가 " + merges + "개다. 정확히 1개여야 한다"));
            }
            if (n.kind() == NodeKind.IF && merges > 1) {
                issues.add(structure(n.id(), null, "IF " + n.id() + "를 닫는 합류가 " + merges + "개다. IF 는 합류를 두지 않는다"));
            }
            List<FlowEdge> outs = out.getOrDefault(n.id(), List.of());
            List<FlowEdge> ordered = n.kind() == NodeKind.IF ? checkIfBranches(n, outs, issues) : checkParallelBranches(n, outs, issues);
            checkBranchOrders(n, ordered, issues);
            // f4 — 새 형식 IF(짝 MERGE 없음)의 같은 도착 갈래 선(J-D7). 옛 IF·병렬은 보지 않는다.
            if (n.kind() == NodeKind.IF && merges == 0) {
                checkSameTarget(n, outs, issues);
            }
        }
    }

    /** IF 의 "그 외" 갈래 개수와 조건식 없는 갈래. 순서를 볼 갈래(그 외가 아닌 것)를 돌려준다. */
    private static List<FlowEdge> checkIfBranches(FlowNode n, List<FlowEdge> outs, List<FlowIssue> issues) {
        long others = outs.stream().filter(FlowEdge::otherwise).count();
        if (others != 1) {
            issues.add(new FlowIssue(IF_ELSE, n.id(), null, "IF " + n.id() + "에 \"그 외\" 갈래가 " + others + "개다. 정확히 1개여야 한다"));
        }
        for (FlowEdge e : outs) {
            if (!e.otherwise() && blank(e.cond())) {
                issues.add(new FlowIssue(IF_ELSE, n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "에 조건식이 없다"));
            }
        }
        List<FlowEdge> ordered = new ArrayList<>();
        outs.stream().filter(e -> !e.otherwise()).forEach(ordered::add);
        return ordered;
    }

    /** 병렬 분기 갈래에 붙은 조건·그 외 표시. 순서를 볼 갈래(전부)를 돌려준다. */
    private static List<FlowEdge> checkParallelBranches(FlowNode n, List<FlowEdge> outs, List<FlowIssue> issues) {
        for (FlowEdge e : outs) {
            if (!blank(e.cond()) || e.otherwise()) {
                issues.add(structure(n.id(), e.id(), "병렬 분기 " + n.id() + "의 갈래 " + e.id() + "에는 조건을 둘 수 없다"));
            }
        }
        return new ArrayList<>(outs);
    }

    /** 갈래 순서 없음, 그 다음 갈래 순서 겹침. */
    private static void checkBranchOrders(FlowNode n, List<FlowEdge> ordered, List<FlowIssue> issues) {
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

    /** f4 — 같은 노드로 가는 갈래 선이 둘 이상. */
    private static void checkSameTarget(FlowNode n, List<FlowEdge> outs, List<FlowIssue> issues) {
        Map<String, String> first = new HashMap<>();
        for (FlowEdge e : outs) {
            String prev = first.putIfAbsent(e.to(), e.id());
            if (prev != null) {
                issues.add(structure(n.id(), e.id(), "IF " + n.id() + "의 갈래 " + e.id() + "가 갈래 " + prev + "와 같은 노드 " + e.to()
                        + "로 간다. 같은 노드로 가는 갈래는 하나만 둔다"));
            }
        }
    }

    /** h1..h5 — 받는 노드별(받는 노드 spec §5 FLOW_CATCH). */
    private static void checkCatchNodes(Map<String, FlowNode> byId, List<FlowIssue> issues) {
        for (FlowNode n : byId.values()) {
            if (n.kind() != NodeKind.CATCH) {
                continue;
            }
            FlowNode target = blank(n.attachTo()) ? null : byId.get(n.attachTo());
            if (target == null) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "가 붙은 노드 " + (blank(n.attachTo()) ? "-" : n.attachTo()) + "가 없다"));
            } else if (!catchable(target.kind())) {
                issues.add(new FlowIssue(CATCH, n.id(), null, "받는 노드 " + n.id() + "는 룰·빈 단계 노드에만 붙일 수 있다(" + target.id() + "는 " + target.kind() + ")"));
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
    }

    /** h6·h7 — 받는 노드가 붙은 노드별. */
    private static void checkCatchTargets(Map<String, FlowNode> byId, Map<String, List<FlowNode>> catchesOf, List<FlowIssue> issues) {
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
    }

    /** 2단계 — 블록 트리를 만든다. 첫 오류(Stop)는 이슈 1건으로 돌려준다. */
    private static FlowParse buildTree(Map<String, FlowNode> byId, Map<String, List<FlowEdge>> out, Map<String, List<FlowNode>> catchesOf) {
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

    /** IF 하나의 모이는 자리와 끝내는 갈래 선 ID(implicit-join spec §2.2). */
    private record Join(String joinId, Set<String> ending) {}

    /** 지켜보는 정상 줄기 하나(§2.4 1) — 받는 노드가 붙은 노드, 지금 만드는 처리 갈래의 받는 노드, 정상 줄기(END 제외). */
    private record Watch(String guardId, String catchId, Set<String> normal) {}

    private static final class Builder {
        final Map<String, FlowNode> nodes;
        final Map<String, List<FlowEdge>> out;
        final Map<String, List<FlowNode>> catchesOf;
        final Map<String, String> mergeOf = new HashMap<>();
        final Set<String> visited = new HashSet<>();
        final List<RuleStep> steps = new ArrayList<>();
        final Map<String, Position> positions = new HashMap<>();
        final Map<String, NodeKind> splitKinds = new HashMap<>();
        /** IF ID → 모이는 자리(§2.2 6 — 해석 한 번 동안 기억한다). */
        final Map<String, Join> joins = new HashMap<>();
        /** 지금 모이는 자리를 계산 중인 IF — 다시 필요하면 S6. */
        final Set<String> joining = new HashSet<>();
        /** 지켜보는 정상 줄기 묶음 — push 로 넣으므로 반복은 가장 안쪽부터다. */
        final Deque<Watch> watches = new ArrayDeque<>();
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
            Seq root = seq(next(start.id()), endId, List.of());
            visited.add(endId);
            for (FlowNode n : nodes.values()) {
                if (!visited.contains(n.id())) {
                    throw new Stop(structure(n.id(), null, n.id() + "에 도달할 수 없다"));
                }
            }
            return new FlowTree(root, start.id(), endId, steps, positions, splitKinds);
        }

        Seq seq(String cur, String stop, List<Frame> chain) {
            return seq(cur, stop, chain, "갈래가 " + stop + "에서 닫히지 않고 ");
        }

        Seq seq(String cur, String stop, List<Frame> chain, String notClosed) {
            List<Block> items = new ArrayList<>();
            while (!cur.equals(stop)) {
                cur = step(cur, stop, items, chain, notClosed);
            }
            return new Seq(List.copyOf(items));
        }

        /** 노드 하나를 블록으로 만들어 items 에 넣고 다음 노드 ID 를 돌려준다(§2.4 — 침범 → 방문 → 종류). stop 은 둘러싼 끝. */
        String step(String cur, String stop, List<Block> items, List<Frame> chain, String notClosed) {
            for (Watch w : watches) {
                if (w.normal().contains(cur)) {
                    throw new Stop(structure(cur, null, "처리 갈래 " + w.catchId() + "가 " + w.guardId() + "의 정상 갈래 노드 " + cur
                            + "로 들어간다. 처리 갈래는 한 노드로 돌아오거나 끝 노드로 가야 한다"));
                }
            }
            if (visited.contains(cur)) {
                throw new Stop(structure(cur, null, twice(cur)));
            }
            FlowNode n = nodes.get(cur);
            if (n.kind() == NodeKind.START || n.kind() == NodeKind.END || n.kind() == NodeKind.MERGE) {
                throw new Stop(structure(cur, null, notClosed + cur + "로 나간다"));
            }
            visited.add(cur);
            positions.put(cur, new Position(chain, order++));
            return switch (n.kind()) {
                case RULE, TASK -> stepNode(n, stop, items, chain);
                case IF -> ifBlock(n, items, chain);
                default -> parallelBlock(n, items, chain);
            };
        }

        String stepNode(FlowNode n, String stop, List<Block> items, List<Frame> chain) {
            String id = n.id();
            Step s;
            if (n.kind() == NodeKind.RULE) {
                RuleStep r = new RuleStep(id, n.ruleId());
                steps.add(r);
                s = r;
            } else {
                s = new TaskStep(id);
            }
            List<FlowNode> catches = catchesOf.getOrDefault(id, List.of());
            if (catches.isEmpty()) {
                items.add(s);
                return next(id);
            }
            return guarded(s, catches, stop, items, chain);
        }

        /** 받는 노드 블록(§2.3) — 정상 갈래(사슬 0) 다음 처리 갈래(사슬 k+1, 받는 노드 배열 순서). */
        String guarded(Step s, List<FlowNode> catches, String stop, List<Block> items, List<Frame> chain) {
            String id = s.nodeId();
            List<String> normalSpine = spine(next(id), stop);
            Set<String> inS = new LinkedHashSet<>(normalSpine);
            List<String> targets = new ArrayList<>();
            for (FlowNode c : catches) {
                String t = endId;
                for (String x : spine(next(c.id()), null)) {
                    if (inS.contains(x) || x.equals(endId)) {
                        t = x;
                        break;
                    }
                }
                targets.add(t);
            }
            String j = null;
            String jCatch = null;
            for (int k = 0; k < catches.size(); k++) {
                String t = targets.get(k);
                if (t.equals(endId)) {
                    continue;
                }
                if (j == null) {
                    j = t;
                    jCatch = catches.get(k).id();
                } else if (!t.equals(j)) {
                    String c = catches.get(k).id();
                    throw new Stop(structure(c, null, id + "의 처리 갈래 " + c + "가 " + t + "로 돌아온다. 앞 처리 갈래 " + jCatch + "처럼 " + j + "로 돌아와야 한다"));
                }
            }
            String mergeId = j != null && j.equals(mergeOf.get(id)) ? j : null;
            Seq normal = j == null ? new Seq(List.of()) : seq(next(id), j, FlowTree.extend(chain, id, 0));
            Set<String> watched = new LinkedHashSet<>(normalSpine);
            watched.remove(endId);
            List<Guarded.Handler> handlers = new ArrayList<>();
            for (int k = 0; k < catches.size(); k++) {
                FlowNode c = catches.get(k);
                visited.add(c.id());
                String t = targets.get(k);
                String notClosed = "처리 갈래 " + c.id() + "가 " + (t.equals(endId) ? "끝" : t.equals(mergeId) ? "합류 " + t + "나 끝" : "돌아올 자리 " + t + "나 끝")
                        + "에 닿지 않고 ";
                watches.push(new Watch(id, c.id(), watched));
                try {
                    Seq body = seq(next(c.id()), t, FlowTree.extend(chain, id, k + 1), notClosed);
                    List<CatchKind> kinds = c.catches().stream().map(key -> CatchKind.parse(key).orElseThrow()).toList();
                    handlers.add(new Guarded.Handler(c.id(), kinds, body, t.equals(endId)));
                } finally {
                    watches.pop();
                }
            }
            if (mergeId != null) {
                visited.add(mergeId);
            }
            items.add(new Guarded(s, normal, List.copyOf(handlers), mergeId, j));
            return j == null ? next(id) : mergeId != null ? next(mergeId) : j;
        }

        String ifBlock(FlowNode n, List<Block> items, List<Frame> chain) {
            String id = n.id();
            splitKinds.put(id, NodeKind.IF);
            String legacy = mergeOf.get(id);
            Join jn = legacy != null ? new Join(legacy, Set.of()) : join(id);
            List<FlowEdge> ordered = ordered(NodeKind.IF, out.get(id));
            List<Branch> branches = new ArrayList<>();
            for (int b = 0; b < ordered.size(); b++) {
                FlowEdge e = ordered.get(b);
                boolean ends = jn.ending().contains(e.id());
                Seq body = seq(e.to(), ends ? endId : jn.joinId(), FlowTree.extend(chain, id, b));
                branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), body, ends));
            }
            if (legacy != null) {
                visited.add(legacy);
                items.add(new Split(id, NodeKind.IF, legacy, legacy, List.copyOf(branches)));
                return next(legacy);
            }
            items.add(new Split(id, NodeKind.IF, null, jn.joinId(), List.copyOf(branches)));
            return jn.joinId();
        }

        String parallelBlock(FlowNode n, List<Block> items, List<Frame> chain) {
            String id = n.id();
            splitKinds.put(id, NodeKind.PARALLEL);
            String mergeId = mergeOf.get(id);
            List<FlowEdge> ordered = ordered(NodeKind.PARALLEL, out.get(id));
            List<Branch> branches = new ArrayList<>();
            for (int b = 0; b < ordered.size(); b++) {
                FlowEdge e = ordered.get(b);
                branches.add(new Branch(e.id(), e.cond(), e.otherwise(), e.label(), seq(e.to(), mergeId, FlowTree.extend(chain, id, b)), false));
            }
            visited.add(mergeId);
            items.add(new Split(id, NodeKind.PARALLEL, mergeId, mergeId, List.copyOf(branches)));
            return next(mergeId);
        }

        /** 블록 단위 다음 노드(§2.1 after). END 면 null. */
        String after(String x) {
            FlowNode n = nodes.get(x);
            return switch (n.kind()) {
                case END -> null;
                case IF -> mergeOf.containsKey(x) ? mergeOf.get(x) : join(x).joinId();
                case PARALLEL -> mergeOf.get(x);
                default -> next(x);
            };
        }

        /** 줄기 — from 에서 after 를 따라간다. stop 이나 END 에 닿으면 그 노드까지 넣고 멈춘다. 같은 노드를 두 번 만나면 S6. */
        List<String> spine(String from, String stop) {
            List<String> out = new ArrayList<>();
            Set<String> seen = new HashSet<>();
            String cur = from;
            while (cur != null) {
                if (!seen.add(cur)) {
                    throw new Stop(structure(cur, null, twice(cur)));
                }
                out.add(cur);
                if (cur.equals(stop) || cur.equals(endId)) {
                    break;
                }
                cur = after(cur);
            }
            return out;
        }

        /** 새 형식 IF 의 모이는 자리와 끝내는 갈래(§2.2 2~6). 계산 중에 다시 필요하면 S6. */
        Join join(String s) {
            Join have = joins.get(s);
            if (have != null) {
                return have;
            }
            if (!joining.add(s)) {
                throw new Stop(structure(s, null, twice(s)));
            }
            List<FlowEdge> br = ordered(NodeKind.IF, out.get(s));
            List<List<String>> spines = new ArrayList<>();
            List<Set<String>> ns = new ArrayList<>();
            for (FlowEdge e : br) {
                List<String> sp = spine(e.to(), null);
                spines.add(sp);
                Set<String> n = new HashSet<>(sp);
                n.remove(endId);
                ns.add(n);
            }
            Set<String> ending = new LinkedHashSet<>();
            List<Integer> cont = new ArrayList<>();
            for (int i = 0; i < br.size(); i++) {
                boolean alone = true;
                for (int k = 0; k < br.size() && alone; k++) {
                    if (k != i && !Collections.disjoint(ns.get(i), ns.get(k))) {
                        alone = false;
                    }
                }
                if (alone) {
                    ending.add(br.get(i).id());
                } else {
                    cont.add(i);
                }
            }
            String joinId = endId;
            if (!cont.isEmpty()) {
                int first = cont.get(0);
                for (String x : spines.get(first)) {
                    if (x.equals(endId)) {
                        break;
                    }
                    boolean all = true;
                    for (int k : cont) {
                        if (k != first && !ns.get(k).contains(x)) {
                            all = false;
                            break;
                        }
                    }
                    if (all) {
                        joinId = x;
                        break;
                    }
                }
                if (joinId.equals(endId)) {
                    ending.clear(); // §2.2 4 예외 — 갈래를 만들 때 S6·S5 로 거부된다
                }
            } else {
                int pick = -1;
                for (int i = br.size() - 1; i >= 0; i--) {
                    if (!br.get(i).to().equals(endId)) {
                        pick = i;
                        break;
                    }
                }
                if (pick < 0) {
                    ending.clear(); // 모든 갈래가 END 로 바로 감 — 1단계 f4 가 막으므로 여기 오지 않는다
                } else {
                    joinId = br.get(pick).to();
                    ending.remove(br.get(pick).id());
                }
            }
            joining.remove(s);
            Join j = new Join(joinId, Set.copyOf(ending));
            joins.put(s, j);
            return j;
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

    private static String twice(String id) {
        return id + "를 두 번 지난다. 순환이 있거나 갈래가 모이는 자리 밖에서 만난다";
    }

    /** 개수 규칙: 0 = 없어야, 2 = 2개 이상, 3 = 1개 이상. */
    private static int inRule(NodeKind k) {
        return switch (k) {
            case START, CATCH -> 0;
            case MERGE -> 2;
            default -> 3;
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
