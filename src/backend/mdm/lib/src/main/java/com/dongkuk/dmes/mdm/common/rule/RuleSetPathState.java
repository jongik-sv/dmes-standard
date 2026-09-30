package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;

/**
 * 흐름 경로 상태(2단계 계획 P4, 1단계 계획 C4 4번) — 트리를 깊이 우선으로 돌 때 각 지점에서 반드시 정의된 이름(defined)과 IF 의 일부 갈래에서만
 * 정의된 이름(maybe). 세트 저장 검사({@link RuleSetAnalyzer})와 룰 확정 시 세트 순서 검사({@code RuleSetOrderCheck})가 같은 합치기 규칙을 쓴다.
 *
 * <p>분기 합치기(갈래마다 분기 직전 상태의 사본으로 본문을 돈 뒤):
 * <ul>
 *   <li>IF: {@code defined = base.defined ∪ ⋂ 갈래 defined}, {@code maybe = base.maybe ∪ ⋃ 갈래 maybe ∪ (⋃ 갈래 defined − defined)}</li>
 *   <li>PARALLEL: {@code defined = base.defined ∪ ⋃ 갈래 defined}, {@code maybe = base.maybe ∪ ⋃ 갈래 maybe}</li>
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

    private RuleSetPathState() {
    }

    /**
     * 트리를 깊이 우선으로 돌며 RULE 노드마다 직전 상태를 적는다. produces 는 룰 ID → 만드는 이름. 키는 RULE 노드 ID(깊이 우선 순서), 값은 수정할 수
     * 없는 사본이다.
     */
    public static Map<String, At> before(FlowTree tree, Function<String, Set<String>> produces) {
        Map<String, At> out = new LinkedHashMap<>();
        new Walk(produces, out).seq(tree.root(), new At(new HashSet<>(), new HashSet<>()));
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
    private record Walk(Function<String, Set<String>> produces, Map<String, At> out) {

        void seq(Seq s, At st) {
            for (Block b : s.items()) {
                if (b instanceof RuleStep r) {
                    out.putIfAbsent(r.nodeId(), new At(Set.copyOf(st.defined()), Set.copyOf(st.maybe())));
                    Set<String> made = produces.apply(r.ruleId());
                    if (made != null) {
                        st.defined().addAll(made);
                    }
                } else if (b instanceof Split sp) {
                    List<At> outs = new ArrayList<>();
                    for (Branch br : sp.branches()) {
                        At copy = new At(new HashSet<>(st.defined()), new HashSet<>(st.maybe()));
                        seq(br.body(), copy);
                        outs.add(copy);
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
    }
}
