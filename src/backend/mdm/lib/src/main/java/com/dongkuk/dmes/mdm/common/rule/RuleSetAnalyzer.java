package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowIssue;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 룰 세트 계산 — 입출력 표·의존 룰·저장 시 검사(TSK-08-06 design §6.2·§6.3, I8·I10·I11). 스프링·DB 없는 순수 함수다.
 * 화면 {@code m-mdm pages/dme/ruleSetEdit/set-model.ts} 가 같은 알고리즘·같은 문구로 즉시 계산하고, 한 벌 코퍼스
 * {@code rule-set-corpus.json} 이 두 구현의 동치를 고정한다(I9). 알고리즘을 바꾸면 TS 쪽과 코퍼스를 함께 바꾼다.
 *
 * <p>{@code rules} 는 호출자가 넘긴다 — 서버는 {@code RuleIoReader} 로 읽은 맵을, 08-04 는 저장하려는 정의로 한 항목을 바꾼 맵을 넘긴다(06:327).
 * 맵에 없거나 {@code exists=false} 인 룰은 조건·결과가 없는 것으로 본다. 이름 비교는 대소문자를 구분한다(이름은 {@code RuleIoReader} 가 정한 표기 그대로).
 *
 * <p>흐름 입력(계획 C4)은 {@code FlowParser} 로 블록 트리를 만든 뒤 경로를 깊이 우선으로 돈다. 목록 입력은 {@code FlowParser.linear(ids)} 한 줄
 * 흐름과 같고 노드 위치는 null 이다.
 */
public final class RuleSetAnalyzer {

    /** 세트 입출력 표. 저장하지 않는다. */
    public record SetIo(List<InputRow> inputs, List<ResultRow> results) {
    }

    /** 입력 변수 — 앞 룰이 만들지 않은 이름. 타입·출처는 처음 읽은 룰의 것, {@code users} 는 읽는 룰(목록 순). */
    public record InputRow(String name, String label, String dataType, Integer scale, boolean dateString, String maruCodeId, String source,
            List<String> users) {
    }

    /** 결과 변수 — 타입은 처음 만든 룰의 것. {@code by} 는 만드는 룰, {@code readers} 는 만든 뒤에 읽는 룰(목록 순). */
    public record ResultRow(String name, String dataType, Integer scale, boolean dateString, String maruCodeId, List<String> by,
            List<String> readers) {

        /** 최종 결과 = 세트 안에서 아무도 뒤에서 읽지 않는다. 그 밖은 중간 결과. */
        public boolean finalResult() {
            return readers.isEmpty();
        }
    }

    private RuleSetAnalyzer() {
    }

    /** §6.2 — 목록 순서대로 훑어 앞 룰이 이미 만든 이름을 읽으면 그 결과의 readers 에, 아니면 입력 변수로 모은다. */
    public static SetIo io(List<String> ids, Map<String, RuleIo> rules) {
        Map<String, InputRow> ins = new LinkedHashMap<>();
        Map<String, ResultRow> res = new LinkedHashMap<>();
        for (String id : ids) {
            for (IoName c : conds(rules, id)) {
                ResultRow made = res.get(c.name());
                if (made != null) {
                    made.readers().add(id);
                    continue;
                }
                ins.computeIfAbsent(c.name(), n -> new InputRow(n, c.label(), c.dataType(), c.scale(), c.dateString(), c.maruCodeId(), c.source(),
                        new ArrayList<>())).users().add(id);
            }
            for (IoName x : results(rules, id)) {
                res.computeIfAbsent(x.name(), n -> new ResultRow(n, x.dataType(), x.scale(), x.dateString(), x.maruCodeId(), new ArrayList<>(),
                        new ArrayList<>())).by().add(id);
            }
        }
        return new SetIo(List.copyOf(ins.values()), List.copyOf(res.values()));
    }

    /** I11 — deps[id] = 세트 안에서 id 가 아닌 룰 가운데 id 의 DICT 가 아닌 조건 이름을 만드는 룰(목록 순, 중복 없음). 목록의 모든 ID 가 키다. */
    public static Map<String, List<String>> deps(List<String> ids, Map<String, RuleIo> rules) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        for (String id : ids) {
            if (out.containsKey(id)) {
                continue;
            }
            Set<String> reads = new HashSet<>();
            for (IoName c : conds(rules, id)) {
                if (!RuleIo.DICT.equals(c.source())) {
                    reads.add(c.name());
                }
            }
            List<String> d = new ArrayList<>();
            for (String j : ids) {
                if (!j.equals(id) && !d.contains(j) && results(rules, j).stream().anyMatch(x -> reads.contains(x.name()))) {
                    d.add(j);
                }
            }
            out.put(id, d);
        }
        return out;
    }

    /** 흐름 입력의 입출력 표 — 펼친 목록 기준(D10). */
    public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules) {
        return io(RuleSetFlowJson.ruleIds(flow), rules);
    }

    /** 흐름 입력의 의존 룰 — 펼친 목록 기준(D10). */
    public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules) {
        return deps(RuleSetFlowJson.ruleIds(flow), rules);
    }

    /** §6.3 목록 입력 — 한 줄 흐름으로 같은 알고리즘을 돌리고 노드 위치를 지운다(기존 코퍼스 불변, D8). */
    public static List<RuleSetCheck> checks(List<String> ids, Map<String, RuleIo> rules) {
        return checks(FlowParser.linear(ids), rules, Map.of()).stream().map(RuleSetCheck::withoutLocation).toList();
    }

    /** 계획 C4 — 존재·상태 → EMPTY → 구조 → 경로(깊이 우선). */
    public static List<RuleSetCheck> checks(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, CondIo> condIo) {
        List<RuleSetCheck> out = new ArrayList<>();
        FlowParse parse = FlowParser.parse(flow);
        List<String> ids = RuleSetFlowJson.ruleIds(flow, parse);
        Map<String, String> firstNode = new HashMap<>();
        Set<String> seenNodes = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (seenNodes.add(n.id()) && n.kind() == NodeKind.RULE && n.ruleId() != null) {
                firstNode.putIfAbsent(n.ruleId(), n.id());
            }
        }
        for (String id : ids) {
            RuleIo r = rules.get(id);
            String node = firstNode.get(id);
            if (r == null || !r.exists()) {
                out.add(new RuleSetCheck(RuleSetCheck.RULE_NOT_FOUND, RuleSetCheck.REJECT, id, null, null, id + "는 없는 룰이다", node, null));
            } else if ("DEPRECATED".equals(r.status())) {
                out.add(new RuleSetCheck(RuleSetCheck.RULE_DEPRECATED, RuleSetCheck.REJECT, id, null, null, id + "는 DEPRECATED다", node, null));
            } else if (r.releasedVer() == null) {
                out.add(new RuleSetCheck(RuleSetCheck.NO_RELEASED, RuleSetCheck.WARN, id, null, null,
                        id + "는 RELEASED 버전이 없어 입출력을 계산하지 않았다. 이대로 부르면 판정 오류다", node, null));
            }
        }
        if (flow.nodes().stream().noneMatch(n -> n.kind() == NodeKind.RULE)) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null, "룰이 하나도 없다"));
        }
        for (FlowIssue i : parse.issues()) {
            out.add(new RuleSetCheck(i.code(), RuleSetCheck.REJECT, null, null, null, i.message(), i.nodeId(), i.edgeId()));
        }
        if (!parse.issues().isEmpty() || parse.tree() == null) {
            return out;
        }
        new PathWalk(parse.tree(), rules, condIo, deps(parse.tree().ruleIds(), rules), out).seq(parse.tree().root(), new State());
        return out;
    }

    /** 경로 상태(계획 C4 4번) — 반드시 정의된 이름, 일부 갈래에서만 정의된 이름, 이름 → 그 경로에서 마지막으로 만든 룰 노드. */
    private record State(Set<String> defined, Set<String> maybe, Map<String, RuleStep> prodBy) {

        State() {
            this(new HashSet<>(), new HashSet<>(), new LinkedHashMap<>());
        }

        State copy() {
            return new State(new HashSet<>(defined), new HashSet<>(maybe), new LinkedHashMap<>(prodBy));
        }
    }

    /** 트리를 깊이 우선으로 돌며 경로 검사를 낸다. */
    private static final class PathWalk {

        private final FlowTree tree;
        private final Map<String, RuleIo> rules;
        private final Map<String, CondIo> condIo;
        private final Map<String, List<String>> d;
        private final List<RuleSetCheck> out;

        PathWalk(FlowTree tree, Map<String, RuleIo> rules, Map<String, CondIo> condIo, Map<String, List<String>> d, List<RuleSetCheck> out) {
            this.tree = tree;
            this.rules = rules;
            this.condIo = condIo;
            this.d = d;
            this.out = out;
        }

        void seq(Seq s, State st) {
            for (Block b : s.items()) {
                if (b instanceof RuleStep r) {
                    rule(r, st);
                } else if (b instanceof Split sp) {
                    split(sp, st);
                } else if (b instanceof Seq q) {
                    seq(q, st);
                }
            }
        }

        void split(Split sp, State st) {
            if (sp.kind() == NodeKind.IF) {
                for (Branch br : sp.branches()) {
                    if (!br.otherwise()) {
                        cond(sp, br, st);
                    }
                }
            }
            List<State> outs = new ArrayList<>();
            for (Branch br : sp.branches()) {
                State b = st.copy();
                seq(br.body(), b);
                outs.add(b);
            }
            Set<String> defined = new HashSet<>(st.defined());
            Set<String> maybe = new HashSet<>(st.maybe());
            if (sp.kind() == NodeKind.IF) {
                Set<String> inter = null;
                Set<String> union = new HashSet<>();
                for (State b : outs) {
                    inter = inter == null ? new HashSet<>(b.defined()) : inter;
                    inter.retainAll(b.defined());
                    union.addAll(b.defined());
                    maybe.addAll(b.maybe());
                }
                defined.addAll(inter == null ? Set.of() : inter);
                union.removeAll(defined);
                maybe.addAll(union);
            } else {
                for (State b : outs) {
                    defined.addAll(b.defined());
                    maybe.addAll(b.maybe());
                }
            }
            Map<String, RuleStep> over = new LinkedHashMap<>();
            for (State b : outs) {
                b.prodBy().forEach((k, v) -> {
                    if (!v.equals(st.prodBy().get(k))) {
                        over.putIfAbsent(k, v);
                    }
                });
            }
            st.defined().clear();
            st.defined().addAll(defined);
            st.maybe().clear();
            st.maybe().addAll(maybe);
            st.prodBy().putAll(over);
        }

        /** 계획 C4.1 — IF 의 otherwise 가 아닌 갈래 조건식. */
        void cond(Split sp, Branch br, State st) {
            CondIo io = condIo.get(br.edgeId());
            if (io == null || !io.ok()) {
                String msg = io == null || io.message() == null ? "조건식 정보 없음" : io.message();
                out.add(new RuleSetCheck(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, null, null, null,
                        br.edgeId() + " 갈래 조건식을 읽을 수 없다: " + msg, sp.nodeId(), br.edgeId()));
                return;
            }
            for (IoName v : io.vars()) {
                if (RuleIo.DICT.equals(v.source()) || st.defined().contains(v.name())) {
                    continue;
                }
                if (st.maybe().contains(v.name())) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, null, null, v.name(), br.edgeId() + " 갈래 조건식이 읽는 "
                            + v.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", sp.nodeId(), br.edgeId()));
                } else {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, null, null, v.name(),
                            br.edgeId() + " 갈래 조건식이 읽는 " + v.name() + "는 이 지점에서 정의되지 않았다", sp.nodeId(), br.edgeId()));
                }
            }
        }

        void rule(RuleStep n, State st) {
            String id = n.ruleId();
            String node = n.nodeId();
            for (IoName c : conds(rules, id)) {
                if (RuleIo.DICT.equals(c.source()) || st.defined().contains(c.name())) {
                    continue;
                }
                if (st.maybe().contains(c.name())) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, id, null, c.name(),
                            id + "가 읽는 " + c.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", node, null));
                    continue;
                }
                List<String> later = producers(n, c.name(), Relation.BEFORE, id);
                if (!later.isEmpty()) {
                    String cyc = null;
                    for (String j : later) {
                        if (reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) {
                            cyc = j;
                            break;
                        }
                    }
                    if (cyc != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, id, cyc, c.name(),
                                id + "와 " + cyc + "가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다", node, null));
                    } else {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, id, later.get(0), c.name(),
                                id + "가 뒤에 도는 " + String.join(", ", later) + "의 결과 변수 " + c.name() + "를 읽는다. " + later.get(0) + "를 " + id
                                        + " 앞으로 옮긴다", node, null));
                    }
                    continue;
                }
                List<String> excl = producers(n, c.name(), Relation.EXCLUSIVE, null);
                if (!excl.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.IF_SIBLING, RuleSetCheck.REJECT, id, excl.get(0), c.name(), id + "가 읽는 " + c.name()
                            + "는 같은 IF 의 다른 갈래(" + String.join(", ", excl) + ")에서만 만들어진다. 이 갈래를 타면 값이 없다", node, null));
                    continue;
                }
                List<String> par = producers(n, c.name(), Relation.PARALLEL, null);
                if (!par.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, id, par.get(0), c.name(), id + "가 병렬 형제 갈래의 "
                            + par.get(0) + "가 만드는 " + c.name() + "를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", node, null));
                    continue;
                }
                if (!RuleIo.PROG.equals(c.source())) {
                    out.add(new RuleSetCheck(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, id, null, c.name(),
                            id + "의 조건 변수 " + c.name() + "는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", node, null));
                }
            }
            for (IoName x : results(rules, id)) {
                RuleStep sib = parallelEarlier(n, x.name());
                if (sib != null) {
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, id, sib.ruleId(), x.name(),
                            "병렬 갈래의 " + sib.ruleId() + "와 " + id + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                } else {
                    RuleStep prev = st.prodBy().get(x.name());
                    if (prev != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.DUP_RESULT, RuleSetCheck.WARN, id, prev.ruleId(), x.name(),
                                prev.ruleId() + "와 " + id + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                    }
                }
                st.prodBy().put(x.name(), n);
                st.defined().add(x.name());
            }
        }

        /** relation(n, m) == rel 이고 name 을 만드는 룰 노드 m 의 ruleId(깊이 우선, 중복 없음). exceptId 가 있으면 그 ruleId 는 뺀다. */
        private List<String> producers(RuleStep n, String name, Relation rel, String exceptId) {
            List<String> ids = new ArrayList<>();
            for (RuleStep m : tree.ruleSteps()) {
                if (m.nodeId().equals(n.nodeId()) || (exceptId != null && m.ruleId().equals(exceptId)) || ids.contains(m.ruleId())) {
                    continue;
                }
                if (tree.relation(n.nodeId(), m.nodeId()) == rel && produces(rules, m.ruleId(), name)) {
                    ids.add(m.ruleId());
                }
            }
            return ids;
        }

        /** 깊이 우선으로 n 보다 앞에 있고 n 과 병렬 형제이며 name 을 만드는 첫 룰 노드. */
        private RuleStep parallelEarlier(RuleStep n, String name) {
            for (RuleStep m : tree.ruleSteps()) {
                if (m.nodeId().equals(n.nodeId())) {
                    return null;
                }
                if (tree.relation(n.nodeId(), m.nodeId()) == Relation.PARALLEL && produces(rules, m.ruleId(), name)) {
                    return m;
                }
            }
            return null;
        }
    }

    /** 의존 그래프(a → d[a] 의 각 원소)를 j 에서 따라가 target 에 닿는가. */
    private static boolean reaches(String j, String target, Map<String, List<String>> d) {
        Set<String> seen = new HashSet<>();
        Deque<String> stack = new ArrayDeque<>();
        seen.add(j);
        stack.push(j);
        while (!stack.isEmpty()) {
            for (String b : d.getOrDefault(stack.pop(), List.of())) {
                if (b.equals(target)) {
                    return true;
                }
                if (seen.add(b)) {
                    stack.push(b);
                }
            }
        }
        return false;
    }

    /** 이 룰의 결과 이름과 상대 룰의 조건 이름(출처 무관)이 겹치는가. */
    private static boolean overlaps(List<IoName> results, List<IoName> otherConds) {
        return results.stream().anyMatch(x -> otherConds.stream().anyMatch(c -> c.name().equals(x.name())));
    }

    private static boolean produces(Map<String, RuleIo> rules, String id, String name) {
        return results(rules, id).stream().anyMatch(x -> x.name().equals(name));
    }

    private static List<IoName> conds(Map<String, RuleIo> rules, String id) {
        RuleIo r = rules.get(id);
        return r == null || !r.exists() || r.conds() == null ? List.of() : r.conds();
    }

    private static List<IoName> results(Map<String, RuleIo> rules, String id) {
        RuleIo r = rules.get(id);
        return r == null || !r.exists() || r.results() == null ? List.of() : r.results();
    }
}
