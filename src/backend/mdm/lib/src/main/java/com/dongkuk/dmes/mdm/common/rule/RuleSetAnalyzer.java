package com.dongkuk.dmes.mdm.common.rule;

import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.flow.FlowIssue;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree.Relation;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.Step;
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
 *
 * <p>SET 노드(하위 세트 호출)는 그 세트의 겉모양 {@link SetCallIo} 를 키 {@code set:{setId}} 의 룰 입출력으로 넣어 RULE 처럼 돈다(하위 세트 Ruling 6).
 * 입출력 표·의존 룰에는 그 키가 그대로 나오고, 검사 문구에서는 "세트 {setId}", 검사 칸(ruleId·otherRuleId)은 세트 ID 다.
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

    /** 흐름 입력의 입출력 표 — 펼친 목록 기준(D10). 하위 세트 없는 겹정의. */
    public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules) {
        return io(flow, rules, Map.of());
    }

    /** 흐름 입력의 입출력 표 — 펼친 목록 기준(D10). SET 노드는 키 set:{setId} 의 룰처럼 센다(하위 세트 Ruling 6). */
    public static SetIo io(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        return io(callKeys(flow, FlowParser.parse(flow)), withCalls(rules, calls));
    }

    /** 흐름 입력의 의존 룰 — 펼친 목록 기준(D10). 하위 세트 없는 겹정의. */
    public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules) {
        return deps(flow, rules, Map.of());
    }

    /** 흐름 입력의 의존 룰 — 펼친 목록 기준(D10). SET 노드는 키 set:{setId} 의 룰처럼 센다(하위 세트 Ruling 6). */
    public static Map<String, List<String>> deps(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        return deps(callKeys(flow, FlowParser.parse(flow)), withCalls(rules, calls));
    }

    /** §6.3 목록 입력 — 한 줄 흐름으로 같은 알고리즘을 돌리고 노드 위치를 지운다(기존 코퍼스 불변, D8). */
    public static List<RuleSetCheck> checks(List<String> ids, Map<String, RuleIo> rules) {
        return checks(FlowParser.linear(ids), rules, Map.of()).stream().map(RuleSetCheck::withoutLocation).toList();
    }

    /** 하위 세트 없는 겹정의 — SET 노드가 있으면 모두 겉모양이 없는 세트로 본다(CALL_MISSING). */
    public static List<RuleSetCheck> checks(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, CondIo> condIo) {
        return checks(flow, rules, condIo, Map.of());
    }

    /**
     * 계획 C4 — 존재·상태 → 세트 호출(CALL_MISSING) → EMPTY → 빈 단계(EMPTY_TASK) → 구조 → 경로(깊이 우선).
     *
     * @param calls SET 노드가 부르는 세트의 겉모양(세트 ID →). 없는 키는 없는 세트다(하위 세트 Ruling 8)
     */
    public static List<RuleSetCheck> checks(FlowDefinition flow, Map<String, RuleIo> rules, Map<String, CondIo> condIo, Map<String, SetCallIo> calls) {
        List<RuleSetCheck> out = new ArrayList<>();
        FlowParse parse = FlowParser.parse(flow);
        List<String> ids = RuleSetFlowJson.ruleIds(flow, parse);
        Map<String, String> firstNode = new HashMap<>();
        Set<String> seenNodes = new HashSet<>();
        int tasks = 0;
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null) {
                firstNode.putIfAbsent(n.ruleId(), n.id());
            } else if (n.kind() == NodeKind.TASK) {
                tasks++;
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
        callMissing(flow, calls, out);
        // 빈 단계·SET 노드도 단계로 센다 — 그림부터 그리고 룰을 나중에 채우는 흐름, SET 노드만 있는 세트를 저장할 수 있게(컨트롤러 Ruling, 하위 세트 Ruling 18)
        if (flow.nodes().stream().noneMatch(n -> n.kind() == NodeKind.RULE || n.kind() == NodeKind.TASK || n.kind() == NodeKind.SET)) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null, "룰이 하나도 없다"));
        }
        if (tasks > 0) {
            out.add(new RuleSetCheck(RuleSetCheck.EMPTY_TASK, RuleSetCheck.WARN, null, null, null, "빈 단계 " + tasks + "개 — 실행 때 그냥 지나간다"));
        }
        for (FlowIssue i : parse.issues()) {
            out.add(new RuleSetCheck(i.code(), RuleSetCheck.REJECT, null, null, null, i.message(), i.nodeId(), i.edgeId()));
        }
        if (!parse.issues().isEmpty() || parse.tree() == null) {
            return out;
        }
        Map<String, RuleIo> all = withCalls(rules, calls);
        new PathWalk(parse.tree(), all, condIo, calls, deps(callKeys(flow, parse), all), out).seq(parse.tree().root(), new State());
        return out;
    }

    /**
     * 흐름 트리의 RULE·SET 단계(하위 세트 계획 srv:5 조정 — 엔진에 {@code callSteps()} 를 두지 않는다). 루트부터 깊이 우선으로 RULE·SET 은 담고 TASK 는
     * 건너뛴다. 받는 노드 블록은 자기 단계(RULE·SET 일 때) → 정상 갈래 → 처리 갈래(배열 순서), 분기는 갈래 실행 순서다. RULE 부분은
     * {@code FlowTree.ruleSteps()} 와 같은 순서다(시험이 코퍼스 전체로 단언한다). m-mdm {@code set-model.ts} 가 같은 규칙을 쓴다.
     */
    static List<Step> callSteps(FlowTree tree) {
        List<Step> out = new ArrayList<>();
        collect(tree.root(), out, new HashSet<>());
        return List.copyOf(out);
    }

    private static void collect(Seq s, List<Step> out, Set<String> seen) {
        for (Block b : s.items()) {
            if (b instanceof Step st) {
                add(st, out, seen);
            } else if (b instanceof Guarded g) {
                add(g.step(), out, seen);
                collect(g.normal(), out, seen);
                for (Guarded.Handler h : g.handlers()) {
                    collect(h.body(), out, seen);
                }
            } else if (b instanceof Split sp) {
                for (Branch br : sp.branches()) {
                    collect(br.body(), out, seen);
                }
            } else if (b instanceof Seq q) {
                collect(q, out, seen);
            }
        }
    }

    private static void add(Step st, List<Step> out, Set<String> seen) {
        if ((st instanceof RuleStep || st instanceof SetStep) && seen.add(st.nodeId())) {
            out.add(st);
        }
    }

    /**
     * 흐름의 RULE·SET 노드 키(룰 ID, SET 은 set:{setId})를 깊이 우선으로 중복 없이(빈 ID 제외). 구조 오류로 트리가 없으면 노드 배열 순서(노드 ID 가 겹치면
     * 첫 노드만 — {@code RuleSetFlowJson.ruleIds} 와 같다). 세트 키를 뺀 목록은 {@code RuleSetFlowJson.ruleIds} 와 같다(하위 세트 Ruling 6).
     */
    static List<String> callKeys(FlowDefinition flow, FlowParse p) {
        Set<String> out = new LinkedHashSet<>();
        if (p.tree() != null) {
            for (Step c : callSteps(p.tree())) {
                String k = keyOf(c);
                if (k != null) {
                    out.add(k);
                }
            }
            return List.copyOf(out);
        }
        Set<String> seenNodes = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id())) {
                continue;
            }
            if (n.kind() == NodeKind.RULE && n.ruleId() != null && !n.ruleId().isBlank()) {
                out.add(n.ruleId());
            } else if (n.kind() == NodeKind.SET && n.setId() != null && !n.setId().isBlank()) {
                out.add(SetCallIo.key(n.setId()));
            }
        }
        return List.copyOf(out);
    }

    /** RULE 은 룰 ID, SET 은 set:{setId}. 빈 세트 ID·TASK 는 null. */
    static String keyOf(Step c) {
        if (c instanceof RuleStep r) {
            return r.ruleId();
        }
        if (c instanceof SetStep s) {
            return s.setId() == null || s.setId().isBlank() ? null : SetCallIo.key(s.setId());
        }
        return null;
    }

    /** 룰 입출력 맵에 세트 겉모양을 키 set:{setId} 로 더한 사본(calls 가 비면 rules 그대로). */
    static Map<String, RuleIo> withCalls(Map<String, RuleIo> rules, Map<String, SetCallIo> calls) {
        if (calls.isEmpty()) {
            return rules;
        }
        Map<String, RuleIo> all = new LinkedHashMap<>(rules);
        calls.forEach((id, c) -> all.put(SetCallIo.key(id), c.asRuleIo()));
        return all;
    }

    /** 검사 문구의 이름 — 세트 키면 "세트 {setId}", 룰이면 그대로. */
    static String disp(String key) {
        return SetCallIo.isKey(key) ? "세트 " + SetCallIo.idOf(key) : key;
    }

    /** 하위 세트 spec §5 CALL_MISSING(Ruling 8, 수준 WARN — 편차 13) — 노드 배열 순서, 같은 세트 ID 는 첫 노드에만, 빈 ID 는 노드마다. */
    private static void callMissing(FlowDefinition flow, Map<String, SetCallIo> calls, List<RuleSetCheck> out) {
        Set<String> seenNodes = new HashSet<>();
        Set<String> seenSets = new HashSet<>();
        for (FlowNode n : flow.nodes()) {
            if (!seenNodes.add(n.id()) || n.kind() != NodeKind.SET) {
                continue;
            }
            String id = n.setId();
            if (id == null || id.isBlank()) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.WARN, null, null, null, "세트 노드 " + n.id() + "에 세트 ID가 없다", n.id(), null));
                continue;
            }
            if (!seenSets.add(id)) {
                continue;
            }
            SetCallIo c = calls.get(id);
            if (c == null || !c.exists()) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.WARN, id, null, null, id + "는 없는 세트다", n.id(), null));
            } else if ("DEPRECATED".equals(c.status())) {
                out.add(new RuleSetCheck(RuleSetCheck.CALL_MISSING, RuleSetCheck.WARN, id, null, null, id + "는 폐기된 세트다", n.id(), null));
            }
        }
    }

    /**
     * 경로 상태(계획 C4 4번) — 반드시 정의된 이름, 일부 갈래에서만 정의된 이름, 이름 → 그 경로에서 마지막으로 만든 RULE·SET 노드. defined·maybe 의 분기
     * 합치기는 {@link RuleSetPathState} 가 정한다(확정 검사와 한 벌).
     */
    private record State(Set<String> defined, Set<String> maybe, Map<String, Step> prodBy) {

        State() {
            this(new HashSet<>(), new HashSet<>(), new LinkedHashMap<>());
        }

        State copy() {
            return new State(new HashSet<>(defined), new HashSet<>(maybe), new LinkedHashMap<>(prodBy));
        }

        /** defined·maybe 를 경로 상태로 본다(같은 집합, 사본 아님). */
        RuleSetPathState.At at() {
            return new RuleSetPathState.At(defined, maybe);
        }
    }

    /** 트리를 깊이 우선으로 돌며 경로 검사를 낸다. */
    private static final class PathWalk {

        private final FlowTree tree;
        /** 룰 입출력에 세트 겉모양(키 set:{setId})을 더한 맵. */
        private final Map<String, RuleIo> rules;
        private final Map<String, CondIo> condIo;
        /** 세트 ID → 겉모양(always·endsEarly 판정용). */
        private final Map<String, SetCallIo> calls;
        private final Map<String, List<String>> d;
        private final List<RuleSetCheck> out;
        /** 트리의 RULE·SET 단계(깊이 우선) — 한 번만 모은다. */
        private final List<Step> steps;
        /** P3 — 세트 안 룰(입출력을 아는 룰)이 선언한 이름(대문자). 경로와 무관하게 세트 전체로 센다. 하위 세트 선언은 세지 않는다(하위 세트 Ruling 20). */
        private final Set<String> declared = new HashSet<>();

        PathWalk(FlowTree tree, Map<String, RuleIo> rules, Map<String, CondIo> condIo, Map<String, SetCallIo> calls, Map<String, List<String>> d,
                List<RuleSetCheck> out) {
            this.tree = tree;
            this.rules = rules;
            this.condIo = condIo;
            this.calls = calls;
            this.d = d;
            this.out = out;
            this.steps = callSteps(tree);
            for (String id : tree.ruleIds()) {
                RuleIo r = rules.get(id);
                if (r != null && r.exists() && r.releasedVer() != null) {
                    conds(rules, id).forEach(c -> declared.add(c.name().toUpperCase(Locale.ROOT)));
                    results(rules, id).forEach(x -> declared.add(x.name().toUpperCase(Locale.ROOT)));
                }
            }
        }

        void seq(Seq s, State st) {
            for (Block b : s.items()) {
                if (b instanceof RuleStep || b instanceof SetStep) {
                    String k = keyOf((Step) b);
                    if (k != null) {
                        step((Step) b, k, st);
                    }
                } else if (b instanceof Guarded g) {
                    guarded(g, st);
                } else if (b instanceof Split sp) {
                    split(sp, st);
                } else if (b instanceof Seq q) {
                    seq(q, st);
                }
            }
        }

        /**
         * 받는 노드 블록(받는 노드 spec §5) — 단계 검사(RULE·SET), CATCH_NEVER·FLOW_CATCH, 정상 갈래(단계 결과 뒤), 처리 갈래(단계 직전 상태 + CATCH_*,
         * 끝나면 CATCH_* 를 뺀다). 합류 뒤는 IF 합류 규칙 — 정상 갈래 끝과 돌아오는 처리 갈래 끝의 교집합이 defined, 나머지는 maybe. 끝내는 처리 갈래는 세지 않는다.
         */
        void guarded(Guarded g, State st) {
            State before = st.copy();
            String key = keyOf(g.step());
            if (key != null) {
                step(g.step(), key, st);
            }
            never(g);
            State normal = st.copy();
            seq(g.normal(), normal);
            List<State> back = new ArrayList<>(List.of(normal));
            for (Guarded.Handler h : g.handlers()) {
                State hs = before.copy();
                hs.defined().addAll(ReservedNames.CATCH_NAMES);
                seq(h.body(), hs);
                hs.defined().removeAll(ReservedNames.CATCH_NAMES);
                if (!h.ends()) {
                    back.add(hs);
                }
            }
            RuleSetPathState.At merged = RuleSetPathState.mergeIf(before.at(), back.stream().map(State::at).toList());
            Map<String, Step> over = new LinkedHashMap<>();
            for (State b : back) {
                b.prodBy().forEach((k, v) -> {
                    if (!v.equals(before.prodBy().get(k))) {
                        over.putIfAbsent(k, v);
                    }
                });
            }
            st.defined().clear();
            st.defined().addAll(merged.defined());
            st.maybe().clear();
            st.maybe().addAll(merged.maybe());
            st.prodBy().clear();
            st.prodBy().putAll(before.prodBy());
            st.prodBy().putAll(over);
        }

        /**
         * CATCH_NEVER(R12, implicit-join spec §6)와 종류·대상 불일치 FLOW_CATCH(하위 세트 Ruling 9). 분기 순서는 SET → TASK → RULE. TASK·RULE 은 먼저
         * SUBSET_ENDED 를 받는 처리 갈래마다 FLOW_CATCH 를 낸 뒤 기존 CATCH_NEVER 를 낸다. 빈 단계는 받는 노드마다 한 줄, 룰은 받는 종류 저장 순서·룰이
         * 있고 RELEASED 가 있을 때만. FLOW_CATCH 는 ruleId 가 null, CATCH_NEVER 는 대상 ID(SET 이면 세트 ID), nodeId 는 둘 다 받는 노드다.
         */
        void never(Guarded g) {
            if (g.step() instanceof SetStep s) {
                neverSet(g, s);
                return;
            }
            if (!(g.step() instanceof RuleStep step)) {
                subsetEndedMisplaced(g, "빈 단계 노드");
                for (Guarded.Handler h : g.handlers()) {
                    out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, null, null, null,
                            g.nodeId() + "는 빈 단계라 " + h.catchNodeId() + "가 받는 예외가 일어나지 않는다", h.catchNodeId(), null));
                }
                return;
            }
            subsetEndedMisplaced(g, "룰 노드");
            String id = step.ruleId();
            RuleIo r = rules.get(id);
            if (r == null || !r.exists() || r.releasedVer() == null) {
                return;
            }
            for (Guarded.Handler h : g.handlers()) {
                for (CatchKind k : h.kinds()) {
                    if (k == CatchKind.NO_RESULT && r.hasDefault()) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, id, null, null,
                                id + "에 기본 행이 있어 " + h.catchNodeId() + "가 받는 결과 없음이 일어나지 않는다", h.catchNodeId(), null));
                    } else if (k == CatchKind.HIT_CONFLICT && !"UNIQUE".equals(r.hitPolicy()) && !"ANY".equals(r.hitPolicy())) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, id, null, null,
                                id + "의 적중 정책 " + (r.hitPolicy() == null ? "-" : r.hitPolicy()) + "에서는 " + h.catchNodeId()
                                        + "가 받는 판정 충돌이 일어나지 않는다", h.catchNodeId(), null));
                    }
                }
            }
        }

        /** RULE·TASK 노드의 받는 노드가 SUBSET_ENDED 를 받으면 처리 갈래마다 FLOW_CATCH(하위 세트 Ruling 9). what 은 "룰 노드"·"빈 단계 노드". */
        private void subsetEndedMisplaced(Guarded g, String what) {
            for (Guarded.Handler h : g.handlers()) {
                if (h.kinds().contains(CatchKind.SUBSET_ENDED)) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_CATCH, RuleSetCheck.REJECT, null, null, null,
                            "받는 노드 " + h.catchNodeId() + ": " + what + "에는 하위 세트 예외 끝(SUBSET_ENDED)을 붙일 수 없다", h.catchNodeId(), null));
                }
            }
        }

        /**
         * SET 노드의 받는 노드(하위 세트 Ruling 9) — 처리 갈래 순서·받는 종류 저장 순서. NO_RESULT 는 FLOW_CATCH, SUBSET_ENDED 인데 겉모양이 있고 끝냄이
         * 없으면(endsEarly=false) CATCH_NEVER. 겉모양이 없는 세트는 CALL_MISSING 이 따로 알린다.
         */
        private void neverSet(Guarded g, SetStep s) {
            SetCallIo call = s.setId() == null || s.setId().isBlank() ? null : calls.get(s.setId());
            for (Guarded.Handler h : g.handlers()) {
                for (CatchKind k : h.kinds()) {
                    if (k == CatchKind.NO_RESULT) {
                        out.add(new RuleSetCheck(RuleSetCheck.FLOW_CATCH, RuleSetCheck.REJECT, null, null, null,
                                "받는 노드 " + h.catchNodeId() + ": 세트 노드에는 결과 없음(NO_RESULT)을 붙일 수 없다", h.catchNodeId(), null));
                    } else if (k == CatchKind.SUBSET_ENDED && call != null && call.exists() && !call.endsEarly()) {
                        out.add(new RuleSetCheck(RuleSetCheck.CATCH_NEVER, RuleSetCheck.WARN, s.setId(), null, null,
                                "받는 노드 " + h.catchNodeId() + ": 세트 " + s.setId() + "에는 END 로 가는 처리 갈래가 없어 하위 세트 예외 끝이 일어나지 않는다",
                                h.catchNodeId(), null));
                    }
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
                if (!br.ends()) {
                    outs.add(b); // 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §6) — 조건식·몸 검사는 했다
                }
            }
            // defined·maybe 합치기는 확정 검사와 한 벌(P4 RuleSetPathState), prodBy 합치기는 이 검사 전용.
            RuleSetPathState.At merged = RuleSetPathState.merge(sp.kind(), st.at(), outs.stream().map(State::at).toList());
            Map<String, Step> over = new LinkedHashMap<>();
            for (State b : outs) {
                b.prodBy().forEach((k, v) -> {
                    if (!v.equals(st.prodBy().get(k))) {
                        over.putIfAbsent(k, v);
                    }
                });
            }
            st.defined().clear();
            st.defined().addAll(merged.defined());
            st.maybe().clear();
            st.maybe().addAll(merged.maybe());
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
                boolean dict = RuleIo.DICT.equals(v.source());
                if (!dict && !st.defined().contains(v.name())) {
                    if (st.maybe().contains(v.name())) {
                        out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, null, null, v.name(), br.edgeId() + " 갈래 조건식이 읽는 "
                                + v.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", sp.nodeId(), br.edgeId()));
                    } else {
                        out.add(new RuleSetCheck(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, null, null, v.name(),
                                br.edgeId() + " 갈래 조건식이 읽는 " + v.name() + "는 이 지점에서 정의되지 않았다", sp.nodeId(), br.edgeId()));
                    }
                }
                // P3 — DICT 변수는 판정을 통과해도 선언 검사로 이어진다(엔진은 선언이 없으면 레코드 값 그대로 비교한다).
                if (dict && !declared.contains(v.name().toUpperCase(Locale.ROOT))) {
                    out.add(new RuleSetCheck(RuleSetCheck.COND_UNTYPED, RuleSetCheck.WARN, null, null, v.name(), br.edgeId() + " 갈래 조건식이 읽는 "
                            + v.name() + "는 세트 안 어느 룰도 타입을 선언하지 않아 레코드 값 그대로 비교한다. 숫자를 문자열로 넘기면 사전순으로 비교된다",
                            sp.nodeId(), br.edgeId()));
                }
            }
        }

        /**
         * RULE·SET 노드 하나 — id 는 룰 ID 또는 set:{setId}. 문구의 이름은 {@link #disp}(세트면 "세트 {setId}"), 검사 칸은 {@link SetCallIo#idOf}
         * (하위 세트 Ruling 6). RULE 만 있는 흐름의 문구·순서는 바뀌지 않는다.
         */
        void step(Step n, String id, State st) {
            String node = n.nodeId();
            String me = disp(id);
            String meId = SetCallIo.idOf(id);
            for (IoName c : conds(rules, id)) {
                // 받는 노드 예약 이름(R13) — 처리 갈래 안이면 지나가고, 밖이면 ORDER 다.
                String upper = c.name().toUpperCase(Locale.ROOT);
                if (ReservedNames.CATCH_NAMES.contains(upper)) {
                    if (!st.defined().contains(upper)) {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, meId, null, c.name(),
                                me + "가 읽는 " + c.name() + "는 받는 노드의 처리 갈래 안에서만 있다", node, null));
                    }
                    continue;
                }
                if (RuleIo.DICT.equals(c.source()) || st.defined().contains(c.name())) {
                    continue;
                }
                if (st.maybe().contains(c.name())) {
                    out.add(new RuleSetCheck(RuleSetCheck.FLOW_PARTIAL, RuleSetCheck.WARN, meId, null, c.name(),
                            me + "가 읽는 " + c.name() + "는 IF 의 일부 갈래에서만 만들어진다. 다른 갈래를 타면 판정 오류다", node, null));
                    continue;
                }
                List<String> later = producers(node, c.name(), Relation.BEFORE, id);
                if (!later.isEmpty()) {
                    String cyc = null;
                    for (String j : later) {
                        if (reaches(j, id, d) || overlaps(results(rules, id), conds(rules, j))) {
                            cyc = j;
                            break;
                        }
                    }
                    if (cyc != null) {
                        out.add(new RuleSetCheck(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, meId, SetCallIo.idOf(cyc), c.name(),
                                me + "와 " + disp(cyc) + "가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다", node, null));
                    } else {
                        out.add(new RuleSetCheck(RuleSetCheck.ORDER, RuleSetCheck.REJECT, meId, SetCallIo.idOf(later.get(0)), c.name(),
                                me + "가 뒤에 도는 " + String.join(", ", later.stream().map(RuleSetAnalyzer::disp).toList()) + "의 결과 변수 " + c.name()
                                        + "를 읽는다. " + disp(later.get(0)) + "를 " + me + " 앞으로 옮긴다", node, null));
                    }
                    continue;
                }
                List<String> excl = producers(node, c.name(), Relation.EXCLUSIVE, null);
                if (!excl.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.IF_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(excl.get(0)), c.name(), me + "가 읽는 "
                            + c.name() + "는 같은 IF 의 다른 갈래(" + String.join(", ", excl.stream().map(RuleSetAnalyzer::disp).toList())
                            + ")에서만 만들어진다. 이 갈래를 타면 값이 없다", node, null));
                    continue;
                }
                List<String> par = producers(node, c.name(), Relation.PARALLEL, null);
                if (!par.isEmpty()) {
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(par.get(0)), c.name(), me + "가 병렬 형제 갈래의 "
                            + disp(par.get(0)) + "가 만드는 " + c.name() + "를 읽는다. 병렬 갈래끼리는 결과를 읽을 수 없다", node, null));
                    continue;
                }
                if (!RuleIo.PROG.equals(c.source())) {
                    out.add(new RuleSetCheck(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, meId, null, c.name(),
                            me + "의 조건 변수 " + c.name() + "는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다", node, null));
                }
            }
            Set<String> partial = partial(id);
            for (IoName x : results(rules, id)) {
                Step sib = parallelEarlier(n, x.name());
                if (sib != null) {
                    String sk = keyOf(sib);
                    out.add(new RuleSetCheck(RuleSetCheck.PAR_SIBLING, RuleSetCheck.REJECT, meId, SetCallIo.idOf(sk), x.name(),
                            "병렬 갈래의 " + disp(sk) + "와 " + me + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                } else {
                    Step prev = st.prodBy().get(x.name());
                    if (prev != null) {
                        String pk = keyOf(prev);
                        out.add(new RuleSetCheck(RuleSetCheck.DUP_RESULT, RuleSetCheck.WARN, meId, SetCallIo.idOf(pk), x.name(),
                                disp(pk) + "와 " + me + "가 같은 결과 변수 " + x.name() + "에 대입한다", node, null));
                    }
                }
                st.prodBy().put(x.name(), n);
                // always=false 출력은 이미 반드시 정의된 이름이 아니면 일부 갈래에서만 정의된 이름이다(하위 세트 Ruling 7). prodBy 는 always 와 무관하게 갱신한다.
                if (partial.contains(x.name()) && !st.defined().contains(x.name())) {
                    st.maybe().add(x.name());
                } else {
                    st.defined().add(x.name());
                }
            }
        }

        /** 세트 키면 그 세트의 always=false 출력 이름(하위 세트 Ruling 7). 룰이면 빈 집합. */
        private Set<String> partial(String id) {
            SetCallIo c = SetCallIo.isKey(id) ? calls.get(SetCallIo.idOf(id)) : null;
            Set<String> names = new HashSet<>();
            if (c != null) {
                c.outputs().stream().filter(o -> !o.always()).forEach(o -> names.add(o.name()));
            }
            return names;
        }

        /** relation(node, m) == rel 이고 name 을 만드는 RULE·SET 노드 m 의 키(깊이 우선, 중복 없음). exceptId 가 있으면 그 키는 뺀다. */
        private List<String> producers(String node, String name, Relation rel, String exceptId) {
            List<String> ids = new ArrayList<>();
            for (Step m : steps) {
                String k = keyOf(m);
                if (k == null || m.nodeId().equals(node) || (exceptId != null && k.equals(exceptId)) || ids.contains(k)) {
                    continue;
                }
                if (tree.relation(node, m.nodeId()) == rel && produces(rules, k, name)) {
                    ids.add(k);
                }
            }
            return ids;
        }

        /** 깊이 우선으로 n 보다 앞에 있고 n 과 병렬 형제이며 name 을 만드는 첫 RULE·SET 노드. */
        private Step parallelEarlier(Step n, String name) {
            for (Step m : steps) {
                if (m.nodeId().equals(n.nodeId())) {
                    return null;
                }
                String k = keyOf(m);
                if (k != null && tree.relation(n.nodeId(), m.nodeId()) == Relation.PARALLEL && produces(rules, k, name)) {
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
