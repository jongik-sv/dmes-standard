package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 흐름 경로 상태(2단계 계획 P4, 1단계 계획 C4 4번) — 트리를 깊이 우선으로 돌 때 각 지점에서 반드시 정의된 이름(defined)과 IF 의 일부 갈래에서만
 * 정의된 이름(maybe). 세트 저장 검사({@link RuleSetAnalyzer})와 룰 확정 시 세트 순서 검사({@code RuleSetOrderCheck})가 같은 합치기 규칙을 쓴다.
 *
 * <p>분기 합치기(갈래마다 분기 직전 상태의 사본으로 본문을 돈 뒤):
 * <ul>
 *   <li>IF: {@code defined = base.defined ∪ ⋂ 갈래 defined}, {@code maybe = base.maybe ∪ ⋃ 갈래 maybe ∪ (⋃ 갈래 defined − defined)}. 끝내는 IF 갈래(implicit-join spec §2.2)는 합치지 않는다.</li>
 *   <li>PARALLEL: {@code defined = base.defined ∪ ⋃ 갈래 defined}, {@code maybe = base.maybe ∪ ⋃ 갈래 maybe}</li>
 *   <li>받는 룰: 정상 갈래는 룰 결과 뒤, 처리 갈래는 룰 직전 상태 + CATCH_* 에서 시작하고 끝나면 CATCH_* 를 뺀다. 합류는 IF 규칙(끝내는 처리 갈래 제외).</li>
 * </ul>
 */
public final class RuleSetPathState {

    /** 노드별 "그 노드 직전 경로 상태" — defined(반드시 정의됨)·maybe(일부 IF 갈래에서만). */
    public record At(Set<String> defined, Set<String> maybe) {

        /** defined ∪ maybe 에 있는가 — 이 지점에서 어느 경로로든 이미 만들어졌을 수 있는 이름. */
        public boolean seen(String name) {
            return defined.contains(name) || maybe.contains(name);
        }
    }

    /**
     * SET 노드가 만드는 이름(하위 세트 spec §2, Ruling 7) — always 출력과 always=false 출력. 분석기({@link RuleSetAnalyzer})가 SET 출력을 경로 상태에
     * 넣는 규칙과 한 벌이다({@link #define}).
     */
    public record SetOut(Set<String> always, Set<String> partial) {

        public static final SetOut NONE = new SetOut(Set.of(), Set.of());

        /** 겉모양의 출력을 always 로 가른다. 겉모양이 없거나 exists=false 면 아무것도 만들지 않는다(분석기 asRuleIo 와 같다 — 상태는 보지 않는다). */
        public static SetOut of(SetCallIo io) {
            if (io == null || !io.exists()) {
                return NONE;
            }
            Set<String> always = new LinkedHashSet<>();
            Set<String> partial = new LinkedHashSet<>();
            io.outputs().forEach(o -> (o.always() ? always : partial).add(o.name()));
            return new SetOut(Set.copyOf(always), Set.copyOf(partial));
        }
    }

    private RuleSetPathState() {
    }

    /**
     * 단계 하나가 이름 하나를 만들었을 때 경로 상태 갱신(하위 세트 Ruling 7) — partial(SET 의 always=false 출력)이고 이미 반드시 정의된 이름이 아니면
     * maybe, 아니면 defined. maybe 에서 빼지는 않는다. 분석기와 이 걷기가 같이 쓴다.
     */
    static void define(Set<String> defined, Set<String> maybe, String name, boolean partial) {
        if (partial && !defined.contains(name)) {
            maybe.add(name);
        } else {
            defined.add(name);
        }
    }

    /**
     * 트리를 깊이 우선으로 돌며 RULE 노드마다 직전 상태를 적는다. produces 는 룰 ID → 만드는 이름. 키는 RULE 노드 ID(깊이 우선 순서), 값은 수정할 수
     * 없는 사본이다. SET 노드는 아무것도 더하지 않는다(세트 출력은 3인자 겹정의).
     */
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces) {
        return before(tree, produces, setId -> SetOut.NONE);
    }

    /**
     * {@link #before(FlowTree, Function)} 와 같되 SET 노드(하위 세트 호출)를 지나면 setProduces(세트 ID → 그 세트의 출력, 하위 세트 spec §2)를 더한다 —
     * always 출력은 defined, always=false 출력은 이미 defined 가 아니면 maybe(분석기와 한 벌, srv:5 넘김 1). 키에는 SET 노드를 적지 않는다(RULE
     * 노드만). 세트 ID 가 빈 SET 노드는 아무것도 더하지 않는다. setProduces 가 null 을 주면 아무것도 만들지 않는 세트로 본다.
     */
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces, Function<String, SetOut> setProduces) {
        Map<String, At> out = new LinkedHashMap<>();
        new Walk(produces, setProduces, out).seq(tree.root(), new At(new HashSet<>(), new HashSet<>()));
        return out;
    }

    /**
     * 분기 합치기 — kind 가 IF 면 {@link #mergeIf}, 아니면(PARALLEL) {@link #mergeParallel}. 새 가변 집합으로 돌려준다(인자는 바꾸지 않는다).
     *
     * @param base     분기 직전 상태
     * @param branches 갈래마다 본문을 돈 뒤 상태(실행 순서)
     */
    public static At merge(NodeKind kind, At base, List<At> branches) {
        return kind == NodeKind.IF ? mergeIf(base, branches) : mergeParallel(base, branches);
    }

    /** IF 합치기 — 모든 갈래에서 정의된 이름만 defined, 일부 갈래에서만 정의된 이름은 maybe. */
    public static At mergeIf(At base, List<At> branches) {
        Set<String> defined = new HashSet<>(base.defined());
        Set<String> maybe = new HashSet<>(base.maybe());
        Set<String> inter = null;
        Set<String> union = new HashSet<>();
        for (At b : branches) {
            inter = inter == null ? new HashSet<>(b.defined()) : inter;
            inter.retainAll(b.defined());
            union.addAll(b.defined());
            maybe.addAll(b.maybe());
        }
        defined.addAll(inter == null ? Set.of() : inter);
        union.removeAll(defined);
        maybe.addAll(union);
        return new At(defined, maybe);
    }

    /** PARALLEL 합치기 — 모든 갈래가 돌므로 어느 갈래의 이름이든 defined. */
    public static At mergeParallel(At base, List<At> branches) {
        Set<String> defined = new HashSet<>(base.defined());
        Set<String> maybe = new HashSet<>(base.maybe());
        for (At b : branches) {
            defined.addAll(b.defined());
            maybe.addAll(b.maybe());
        }
        return new At(defined, maybe);
    }

    /** 깊이 우선 걷기 — st 는 가변 집합을 가진 상태다. */
    private record Walk(Function<String, Set<String>> produces, Function<String, SetOut> setProduces, Map<String, At> out) {

        /** SET 노드가 만드는 이름을 st 에 더한다({@link #define}). 세트 ID 가 비면 아무것도 하지 않는다. */
        void setMade(SetStep s, At st) {
            if (s.setId() == null || s.setId().isBlank()) {
                return;
            }
            SetOut made = setProduces.apply(s.setId());
            if (made == null) {
                return;
            }
            made.always().forEach(n -> define(st.defined(), st.maybe(), n, false));
            made.partial().forEach(n -> define(st.defined(), st.maybe(), n, true));
        }

        void seq(Seq s, At st) {
            for (Block b : s.items()) {
                if (b instanceof RuleStep r) {
                    out.putIfAbsent(r.nodeId(), new At(Set.copyOf(st.defined()), Set.copyOf(st.maybe())));
                    Set<String> made = produces.apply(r.ruleId());
                    if (made != null) {
                        st.defined().addAll(made);
                    }
                } else if (b instanceof SetStep set) {
                    setMade(set, st);
                } else if (b instanceof Guarded g) {
                    guarded(g, st);
                } else if (b instanceof Split sp) {
                    List<At> outs = new ArrayList<>();
                    for (Branch br : sp.branches()) {
                        At copy = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
                        seq(br.body(), copy);
                        if (!br.ends()) {
                            outs.add(copy);
                        }
                    }
                    At merged = merge(sp.kind(), st, outs);
                    st.defined().clear();
                    st.defined().addAll(merged.defined());
                    st.maybe().clear();
                    st.maybe().addAll(merged.maybe());
                } else if (b instanceof Seq q) {
                    seq(q, st);
                }
            }
        }

        /** 받는 노드 블록 — 받는 룰·정상 갈래 룰·처리 갈래 룰을 모두 적는다(룰 확정 형제 판정이 노드마다 직전 상태를 읽는다). SET 이면 정상 갈래가 SET 출력 뒤에서 시작한다. */
        void guarded(Guarded g, At st) {
            At before = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
            if (g.step() instanceof RuleStep r) {
                out.putIfAbsent(r.nodeId(), new At(Set.copyOf(st.defined()), Set.copyOf(st.maybe())));
            }
            At normal = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
            if (g.step() instanceof RuleStep r) {
                Set<String> made = produces.apply(r.ruleId());
                if (made != null) {
                    normal.defined().addAll(made);
                }
            } else if (g.step() instanceof SetStep s) {
                setMade(s, normal);
            }
            seq(g.normal(), normal);
            List<At> back = new ArrayList<>(List.of(normal));
            for (Guarded.Handler h : g.handlers()) {
                At hs = new At(new HashSet<>(before.defined()), new HashSet<>(before.maybe()));
                hs.defined().addAll(ReservedNames.CATCH_NAMES);
                seq(h.body(), hs);
                hs.defined().removeAll(ReservedNames.CATCH_NAMES);
                if (!h.ends()) {
                    back.add(hs);
                }
            }
            At merged = mergeIf(before, back);
            st.defined().clear();
            st.defined().addAll(merged.defined());
            st.maybe().clear();
            st.maybe().addAll(merged.maybe());
        }
    }
}
