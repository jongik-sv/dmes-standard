package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.Step;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;

/**
 * 하위 세트의 실행용 겉모양(하위 세트 계획 편차 8) — 부모가 SET 노드를 RULE 처럼 볼 때 쓰는 입력·출력. 서버 {@code RuleSetInterface}(mdm/lib)가
 * 화면용 {@code SetCallIo} 를 같은 알고리즘으로 {@code RuleIo} 에서 계산한다 — 알고리즘을 바꾸면 그쪽과 {@code SetCallIoEngineAgreementTest} 를 함께
 * 바꾼다.
 *
 * <ul>
 *   <li>{@link #inputs()}: 단계(RULE·SET)를 깊이 우선(갈래 실행 순서, 받는 노드가 붙은 단계는 단계 → 정상 갈래 → 처리 갈래) 순서로 훑어, 앞 단계가 아직
 *       만들지 않은 이름을 읽으면 입력(첫 등장 순). 같은 룰 ID·같은 세트 ID 는 처음 것만 센다(서버 {@code RuleSetAnalyzer.io} 의 중복 없는 목록과 같다).
 *       RULE 이 읽는 이름은 {@link FlowKeys#needed}, SET 은 그 하위 세트의 inputs. IF 조건식 변수는 세지 않는다.</li>
 *   <li>{@link #mustInputs()}: 이 세트의 입력 키 사전 검사({@code FlowKeys.check(root, ∅)})가 모자란다고 보는 이름 — 반드시 실행되는 부분에서 읽는 입력
 *       (IF 조건식 변수 포함, INPUT_ERROR 를 받는 단계의 입력 제외). 부모의 입력 키 사전 검사에 넣는다.</li>
 *   <li>{@link #outputs()}: 같은 훑기에서 만든 이름 가운데 만든 뒤 아무 단계도 읽지 않은 것(첫 생산 순) = 최종 결과.</li>
 *   <li>{@link #always()}: END 에 닿는 모든 경로에서 END 직전에 반드시 정의된 출력(Ruling 16, implicit-join spec §13). {@link #endSure} 참고.</li>
 * </ul>
 *
 * <p>record 가 아니다: {@code EngineContractSchemaTest} 가 rule 패키지의 모든 record·enum 을 계약 대조표와 견준다(CATCH 의 {@code FlowRun.Caught}·
 * {@code Ended} 와 같은 방식). 공개 클래스인 까닭은 {@link #MAX_CALL_DEPTH} 를 cactus 미리 받기가 같이 쓰게 하려는 것뿐이다.
 */
public final class SetShape {

    /**
     * 최상위 세트에서 하위로 들어가는 단계 상한(하위 세트 spec §3.3, Global Constraints). 단계 5 까지 부르고 6 부터 {@code SET_CALL_DEPTH} 다. 서버
     * {@code RuleSetCallGraph.MAX_DEPTH}·cactus 미리 받기와 같은 값이다.
     */
    public static final int MAX_CALL_DEPTH = 5;

    private final List<String> inputs;
    private final List<String> mustInputs;
    private final List<String> outputs;
    private final Set<String> always;

    SetShape(List<String> inputs, List<String> mustInputs, List<String> outputs, Set<String> always) {
        this.inputs = List.copyOf(inputs);
        this.mustInputs = List.copyOf(mustInputs);
        this.outputs = List.copyOf(outputs);
        this.always = Set.copyOf(always);
    }

    List<String> inputs() {
        return inputs;
    }

    List<String> mustInputs() {
        return mustInputs;
    }

    List<String> outputs() {
        return outputs;
    }

    Set<String> always() {
        return always;
    }

    /**
     * @param defs   이 세트의 룰 정의(룰 ID →, 조회 실패한 룰은 없다)
     * @param shapes SET 노드 ID → 손주 세트의 겉모양(준비에 실패한 노드는 없다)
     * @param keys   이 세트의 입력 키 검사기 — 사본({@link FlowKeys#forRun})으로 사전 검사를 돌려 반드시 읽는 입력을 얻는다
     */
    static SetShape of(FlowTree tree, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes, FlowKeys keys) {
        Io io = new Io(defs, shapes);
        io.seq(tree.root());
        List<String> outputs = new ArrayList<>();
        for (String n : io.made) {
            if (!io.mid.contains(n)) {
                outputs.add(n);
            }
        }
        Set<String> end = endSure(tree.root(), s -> sure(s, defs, shapes));
        Set<String> always = new LinkedHashSet<>();
        for (String n : outputs) {
            if (end.contains(n)) {
                always.add(n);
            }
        }
        List<String> must = keys.forRun().check(tree.root(), Set.of()).stream().map(Violation::name).filter(Objects::nonNull).distinct().toList();
        return new SetShape(List.copyOf(io.inputs), must, outputs, always);
    }

    /** 입출력 훑기 — 단계 깊이 우선 순서(FlowParser 의 ruleSteps·setSteps 순서와 같다). */
    private static final class Io {
        final Map<String, RuleDefinition> defs;
        final Map<String, SetShape> shapes;
        final Set<String> made = new LinkedHashSet<>();
        final Set<String> mid = new HashSet<>();
        final Set<String> inputs = new LinkedHashSet<>();
        final Set<String> seen = new HashSet<>();

        Io(Map<String, RuleDefinition> defs, Map<String, SetShape> shapes) {
            this.defs = defs;
            this.shapes = shapes;
        }

        void seq(Seq s) {
            for (Block b : s.items()) {
                switch (b) {
                    case RuleStep r -> step(r);
                    case SetStep st -> step(st);
                    case TaskStep t -> {
                        // 빈 단계 — 읽는 이름도 만드는 이름도 없다.
                    }
                    case Split sp -> sp.branches().forEach(br -> seq(br.body()));
                    case Guarded g -> {
                        if (!(g.step() instanceof TaskStep)) {
                            step(g.step());
                        }
                        seq(g.normal());
                        g.handlers().forEach(h -> seq(h.body()));
                    }
                    case Seq q -> seq(q);
                }
            }
        }

        void step(Step s) {
            String key = s instanceof RuleStep r ? "rule:" + r.ruleId() : "set:" + ((SetStep) s).setId();
            if (!seen.add(key)) {
                return;
            }
            for (String n : reads(s)) {
                if (made.contains(n)) {
                    mid.add(n);
                } else {
                    inputs.add(n);
                }
            }
            made.addAll(produces(s));
        }

        private List<String> reads(Step s) {
            if (s instanceof RuleStep r) {
                RuleDefinition d = defs.get(r.ruleId());
                return d == null ? List.of() : FlowKeys.needed(d);
            }
            SetShape sh = shapes.get(s.nodeId());
            return sh == null ? List.of() : sh.inputs;
        }

        private List<String> produces(Step s) {
            if (s instanceof RuleStep r) {
                RuleDefinition d = defs.get(r.ruleId());
                return d == null ? List.of() : RuleEvaluator.resultNames(d);
            }
            SetShape sh = shapes.get(s.nodeId());
            return sh == null ? List.of() : sh.outputs;
        }
    }

    /** 이 단계를 지나면 반드시 정의되는 이름 — RULE 은 결과 전부, SET 은 always 출력, TASK 는 없음. */
    private static Set<String> sure(Step s, Map<String, RuleDefinition> defs, Map<String, SetShape> shapes) {
        if (s instanceof RuleStep r) {
            RuleDefinition d = defs.get(r.ruleId());
            return d == null ? Set.of() : new HashSet<>(RuleEvaluator.resultNames(d));
        }
        if (s instanceof SetStep) {
            SetShape sh = shapes.get(s.nodeId());
            return sh == null ? Set.of() : sh.always;
        }
        return Set.of();
    }

    /**
     * END 에 닿는 모든 경로에서 END 직전에 반드시 정의된 이름(Ruling 16, implicit-join spec §13). 서버 {@code RuleSetPathState} 의 합치기 규칙으로
     * 트리를 깊이 우선으로 돌며 "반드시 정의됨" 집합만 따라간다.
     * <ul>
     *   <li>단계: RULE 은 결과 이름, SET 은 하위 always 를 더한다. TASK 는 그대로.</li>
     *   <li>IF: 갈래마다 분기 직전 상태의 사본으로 본문을 돈다. 이어지는 갈래끼리 교집합을 더한다(끝내는 갈래는 합치지 않는다).</li>
     *   <li>PARALLEL: 갈래마다 분기 직전 상태의 사본으로 돌고 합집합을 더한다.</li>
     *   <li>받는 노드 블록(TASK 포함): 정상 = 직전 + 단계 결과 + 정상 갈래, 처리 갈래 = 직전 상태에서 본문. 돌아오는 처리 갈래와 정상의 교집합이 블록 뒤
     *       상태다(IF 규칙, 끝내는 처리 갈래 제외). CATCH_* 는 예약 이름이라 세지 않는다.</li>
     *   <li>끝냄 지점: 끝내는 IF 갈래(처리 갈래 안 포함)의 본문 끝 상태, 끝내는 처리 갈래의 본문 끝 상태. 병렬 갈래 안 끝냄은 그 갈래 사본의 상태(분기 직전 +
     *       그 갈래가 만든 것)다.</li>
     * </ul>
     * 결과 = 루트 순차 끝 상태 ∩ 모든 끝냄 지점 상태.
     */
    static Set<String> endSure(Seq root, java.util.function.Function<Step, Set<String>> sure) {
        List<Set<String>> ends = new ArrayList<>();
        Set<String> st = new HashSet<>();
        walk(root, st, sure, ends);
        Set<String> out = new HashSet<>(st);
        for (Set<String> e : ends) {
            out.retainAll(e);
        }
        return out;
    }

    private static void walk(Seq seq, Set<String> st, java.util.function.Function<Step, Set<String>> sure, List<Set<String>> ends) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> st.addAll(sure.apply(r));
                case SetStep s -> st.addAll(sure.apply(s));
                case TaskStep t -> {
                    // 빈 단계 — 만드는 이름이 없다.
                }
                case Seq q -> walk(q, st, sure, ends);
                case Split sp -> {
                    List<Set<String>> outs = new ArrayList<>();
                    for (Branch br : sp.branches()) {
                        Set<String> copy = new HashSet<>(st);
                        walk(br.body(), copy, sure, ends);
                        if (br.ends()) {
                            ends.add(copy);
                        } else {
                            outs.add(copy);
                        }
                    }
                    if (sp.kind() == NodeKind.IF) {
                        Set<String> inter = intersect(outs);
                        if (inter != null) {
                            st.addAll(inter);
                        }
                    } else {
                        outs.forEach(st::addAll);
                    }
                }
                case Guarded g -> {
                    Set<String> before = new HashSet<>(st);
                    Set<String> normal = new HashSet<>(before);
                    normal.addAll(sure.apply(g.step()));
                    walk(g.normal(), normal, sure, ends);
                    List<Set<String>> back = new ArrayList<>(List.of(normal));
                    for (Guarded.Handler h : g.handlers()) {
                        Set<String> hs = new HashSet<>(before);
                        walk(h.body(), hs, sure, ends);
                        if (h.ends()) {
                            ends.add(hs);
                        } else {
                            back.add(hs);
                        }
                    }
                    st.addAll(intersect(back));
                }
            }
        }
    }

    /** 교집합. 빈 목록이면 null(이어지는 갈래가 없다 — 분기 직전 상태 그대로). */
    private static Set<String> intersect(List<Set<String>> sets) {
        if (sets.isEmpty()) {
            return null;
        }
        Set<String> out = new HashSet<>(sets.get(0));
        for (Set<String> s : sets) {
            out.retainAll(s);
        }
        return out;
    }
}
