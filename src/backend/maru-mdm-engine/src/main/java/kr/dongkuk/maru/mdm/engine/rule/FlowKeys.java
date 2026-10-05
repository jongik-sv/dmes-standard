package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.flow.Block;
import kr.dongkuk.maru.mdm.engine.flow.Branch;
import kr.dongkuk.maru.mdm.engine.flow.CatchKind;
import kr.dongkuk.maru.mdm.engine.flow.Guarded;
import kr.dongkuk.maru.mdm.engine.flow.RuleStep;
import kr.dongkuk.maru.mdm.engine.flow.Seq;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.flow.Split;
import kr.dongkuk.maru.mdm.engine.flow.Step;
import kr.dongkuk.maru.mdm.engine.flow.TaskStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 흐름 입력 키 검사(spec §4 "입력 키 사전 검사", plan C5). {@link #check} 는 seq 의 반드시 실행되는 부분만 본다 — IF 갈래 안은
 * 그 갈래에 들어갈 때 다시 부르고, IF 일부 갈래에서만 만들어지는 이름은 그 룰의 지연 목록({@link #deferred})에 넣어 실행 직전에 본다.
 * 병렬 갈래는 분기 직전 값만 보므로 형제 결과를 입력으로 치지 않는다.
 *
 * <p>IF 조건식 변수의 선언 타입({@link #condTypes})도 여기서 정한다 — 세트 안 룰의 계약·결과 변수 선언에서 이름마다 처음 나온 타입.
 *
 * <p>받는 룰(받는 노드 spec §4): 룰 자신의 입력은 보통 룰처럼 보되 INPUT_ERROR 를 받는 룰이면 없는 이름을 사전 검사에서 빼고 지연 목록에
 * 넣는다(실행 직전 검사). 정상 갈래·처리 갈래는 IF 갈래처럼 들어갈 때 본다. 뒤로는 (룰 결과 ∪ 정상 갈래) ∩ 돌아오는 처리 갈래가 반드시 있고,
 * 끝내는 처리 갈래는 세지 않는다. IF 의 반드시·있을 수 있는 이름은 이어지는 갈래만 센다 — 끝내는 IF 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §5).
 */
final class FlowKeys {

    private final Map<String, RuleDefinition> defs;
    private final MdmEvaluator expressions;
    /** 판정 한 번의 지연 목록 — {@link #check} 가 레코드 키에 따라 채운다. 판정마다 {@link #forRun} 으로 새로 받는다. */
    private final Map<String, List<String>> deferred = new HashMap<>();
    /**
     * 세트 안 룰이 선언한 변수 타입 — 이름마다 처음 선언한 타입(룰은 defs 순서, 룰 안은 always·행 required·optional·결과).
     * 이름은 대소문자를 가리지 않는다(EvalEx 변수 조회와 같다). 생성자에서 다 채운 뒤에는 읽기만 하므로 {@link #forRun} 사본끼리 나눠 쓴다.
     */
    private final Map<String, DataType> declared;

    FlowKeys(Map<String, RuleDefinition> defs, MdmEvaluator expressions) {
        this.defs = defs;
        this.expressions = expressions;
        this.declared = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
        for (RuleDefinition def : defs.values()) {
            declare(def);
        }
    }

    private FlowKeys(FlowKeys template) {
        this.defs = template.defs;
        this.expressions = template.expressions;
        this.declared = template.declared;
    }

    /**
     * 정의에만 의존하는 부분(룰 정의·선언 타입)은 이 객체와 나눠 쓰고 지연 목록만 비어 있는 새 검사기(항목5). 엔진은 정의별로 만든 검사기를
     * 기억해 두고 판정마다 이 사본으로 {@link #check} 한다 — 지연 목록이 레코드·스레드끼리 섞이지 않는다. 사본을 만든 원본에는 {@link #check}
     * 를 부르지 않는다.
     */
    FlowKeys forRun() {
        return new FlowKeys(this);
    }

    /**
     * IF 조건식이 쓰는 변수 가운데 세트 안 룰이 타입을 선언한 것(이름 대소문자 무시 알파벳 순 — {@code MdmEvaluator.usedVariables}
     * 순서, 키는 조건식에 쓴 표기). 선언과는 대소문자를 가리지 않고 맞춘다. 조건식은 이 타입으로 바꾼 값으로 평가한다
     * (의사결정표 열 조건과 같은 규칙, spec §4). 선언이 없는 변수는 레코드 값 그대로다.
     */
    Map<String, DataType> condTypes(String cond) {
        Map<String, DataType> out = new LinkedHashMap<>();
        for (String name : condVars(cond)) {
            DataType t = declared.get(name);
            if (t != null) {
                out.put(name, t);
            }
        }
        return out;
    }

    private void declare(RuleDefinition def) {
        if (def.contract() != null) {
            nonNull(def.contract().always()).forEach(this::declare);
            if (def.ruleKind() == RuleKind.DERIVE) {
                for (RowContract rc : nonNull(def.contract().rows())) {
                    nonNull(rc.required()).forEach(this::declare);
                    nonNull(rc.optional()).forEach(this::declare);
                }
            }
        }
        for (RuleVar v : RuleEvaluator.columns(def.vars(), VarKind.RESULT)) {
            String name = v.resGrp() != null && !v.resGrp().isEmpty() ? v.resGrp() : v.varName();
            if (name != null && v.dataType() != null) {
                declared.putIfAbsent(name, v.dataType());
            }
        }
    }

    private void declare(VarType t) {
        if (t.name() != null && t.dataType() != null) {
            declared.putIfAbsent(t.name(), t.dataType());
        }
    }

    /** 이 RULE 노드를 실행하기 직전에 ctx 에 있어야 하는 이름. */
    List<String> deferred(String nodeId) {
        return deferred.getOrDefault(nodeId, List.of());
    }

    List<Violation> check(Seq seq, Set<String> available) {
        List<Violation> out = new ArrayList<>();
        walk(seq, available, new HashSet<>(), new HashSet<>(), new HashSet<>(), out);
        return out;
    }

    private void walk(Seq seq, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported, List<Violation> out) {
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> ruleKeys(r, false, available, sure, maybe, reported, out);
                case TaskStep t -> {
                    // 빈 단계 — 읽는 이름도 만드는 이름도 없다(4단계 spec §1.1).
                }
                case SetStep s -> {
                    // SEAM(T4) — 하위 세트 입력·출력은 Task 4(eng:4)가 넣는다.
                }
                case Split s when s.kind() == NodeKind.IF -> {
                    for (Branch br : s.branches()) {
                        if (br.otherwise()) {
                            continue;
                        }
                        for (String name : condVars(br.cond())) {
                            if (available.contains(name) || sure.contains(name) || maybe.contains(name)) {
                                continue;
                            }
                            if (reported.add(name)) {
                                out.add(new Violation(Stage.SET_CHECK, Code.MISSING_KEY, null, null, name,
                                        "세트 입력 키가 레코드에 없다: " + name + " (IF " + s.nodeId() + ")", List.of()));
                            }
                        }
                    }
                    Set<String> inter = null;
                    Set<String> any = new HashSet<>();
                    for (Branch br : s.branches()) {
                        if (br.ends()) {
                            continue; // 끝내는 갈래는 블록 뒤로 이어지지 않는다(implicit-join spec §5)
                        }
                        Set<String> made = sureProduced(br.body());
                        if (inter == null) {
                            inter = new HashSet<>(made);
                        } else {
                            inter.retainAll(made);
                        }
                        any.addAll(allProduced(br.body()));
                    }
                    if (inter != null) {
                        sure.addAll(inter);
                        maybe.removeAll(inter);
                    }
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
                case Split s -> {
                    Set<String> union = new HashSet<>();
                    Set<String> any = new HashSet<>();
                    for (Branch br : s.branches()) {
                        walk(br.body(), available, new HashSet<>(sure), new HashSet<>(maybe), reported, out);
                        union.addAll(sureProduced(br.body()));
                        any.addAll(allProduced(br.body()));
                    }
                    sure.addAll(union);
                    maybe.removeAll(union);
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
                case Seq inner -> walk(inner, available, sure, maybe, reported, out);
                case Guarded g -> {
                    Set<String> sureBefore = new HashSet<>(sure);
                    Set<String> maybeBefore = new HashSet<>(maybe);
                    if (g.step() instanceof RuleStep r) {
                        ruleKeys(r, g.handlerFor(CatchKind.INPUT_ERROR) != null, available, sure, maybe, reported, out);
                    }
                    // ruleKeys 가 룰 결과를 sure 에 넣었다 — 받는 룰은 갈래 합류 규칙으로 다시 정한다.
                    sure.clear();
                    sure.addAll(sureBefore);
                    maybe.clear();
                    maybe.addAll(maybeBefore);
                    Set<String> inter = guardSure(g);
                    Set<String> any = guardAll(g);
                    sure.addAll(inter);
                    maybe.removeAll(inter);
                    any.removeAll(sure);
                    maybe.addAll(any);
                }
            }
        }
    }

    /** 룰 하나의 입력 키 — late 면 없는 이름을 보고하지 않고 지연 목록에 넣는다(INPUT_ERROR 를 받는 룰, X-D9). 결과는 sure 에 넣는다. */
    private void ruleKeys(RuleStep r, boolean late, Set<String> available, Set<String> sure, Set<String> maybe, Set<String> reported,
            List<Violation> out) {
        RuleDefinition def = defs.get(r.ruleId());
        if (def == null) {
            return;
        }
        List<String> later = new ArrayList<>();
        for (String name : needed(def)) {
            if (available.contains(name) || sure.contains(name)) {
                continue;
            }
            if (maybe.contains(name) || late) {
                if (!later.contains(name)) {
                    later.add(name);
                }
                continue;
            }
            if (reported.add(name)) {
                out.add(missing(def.ruleId(), name));
            }
        }
        if (!later.isEmpty()) {
            deferred.put(r.nodeId(), List.copyOf(later));
        }
        List<String> results = RuleEvaluator.resultNames(def);
        sure.addAll(results);
        maybe.removeAll(results);
    }

    /** 단계 결과 이름 — 빈 단계·정의 없는 룰은 빈 집합. */
    private Set<String> produced(Step s) {
        if (!(s instanceof RuleStep r)) {
            return new HashSet<>();
        }
        RuleDefinition def = defs.get(r.ruleId());
        return def == null ? new HashSet<>() : new HashSet<>(RuleEvaluator.resultNames(def));
    }

    /** 받는 룰 뒤에 반드시 있는 이름 — (룰 결과 ∪ 정상 갈래) ∩ 돌아오는 처리 갈래(끝내는 갈래는 세지 않는다). */
    private Set<String> guardSure(Guarded g) {
        Set<String> inter = produced(g.step());
        inter.addAll(sureProduced(g.normal()));
        for (Guarded.Handler h : g.handlers()) {
            if (!h.ends()) {
                inter.retainAll(sureProduced(h.body()));
            }
        }
        return inter;
    }

    /** 받는 룰 뒤에 있을 수 있는 이름 — 룰 결과·정상 갈래·돌아오는 처리 갈래가 만들 수 있는 모든 이름. */
    private Set<String> guardAll(Guarded g) {
        Set<String> any = produced(g.step());
        any.addAll(allProduced(g.normal()));
        for (Guarded.Handler h : g.handlers()) {
            if (!h.ends()) {
                any.addAll(allProduced(h.body()));
            }
        }
        return any;
    }

    /** seq 를 끝까지 타면 반드시 만들어지는 결과 이름(IF 는 갈래 교집합, 병렬은 합집합). */
    private Set<String> sureProduced(Seq seq) {
        Set<String> out = new HashSet<>();
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> {
                    RuleDefinition def = defs.get(r.ruleId());
                    if (def != null) {
                        out.addAll(RuleEvaluator.resultNames(def));
                    }
                }
                case TaskStep t -> {
                    // 빈 단계 — 읽는 이름도 만드는 이름도 없다(4단계 spec §1.1).
                }
                case SetStep s -> {
                    // SEAM(T4) — 하위 세트 입력·출력은 Task 4(eng:4)가 넣는다.
                }
                case Split s when s.kind() == NodeKind.IF -> {
                    Set<String> inter = null;
                    for (Branch br : s.branches()) {
                        if (br.ends()) {
                            continue;
                        }
                        Set<String> made = sureProduced(br.body());
                        if (inter == null) {
                            inter = made;
                        } else {
                            inter.retainAll(made);
                        }
                    }
                    if (inter != null) {
                        out.addAll(inter);
                    }
                }
                case Split s -> s.branches().forEach(br -> out.addAll(sureProduced(br.body())));
                case Seq inner -> out.addAll(sureProduced(inner));
                case Guarded g -> out.addAll(guardSure(g));
            }
        }
        return out;
    }

    /** seq 안 어느 룰이든 만들 수 있는 결과 이름. */
    private Set<String> allProduced(Seq seq) {
        Set<String> out = new HashSet<>();
        for (Block b : seq.items()) {
            switch (b) {
                case RuleStep r -> {
                    RuleDefinition def = defs.get(r.ruleId());
                    if (def != null) {
                        out.addAll(RuleEvaluator.resultNames(def));
                    }
                }
                case TaskStep t -> {
                    // 빈 단계 — 읽는 이름도 만드는 이름도 없다(4단계 spec §1.1).
                }
                case SetStep s -> {
                    // SEAM(T4) — 하위 세트 입력·출력은 Task 4(eng:4)가 넣는다.
                }
                case Split s when s.kind() == NodeKind.IF ->
                        s.branches().stream().filter(br -> !br.ends()).forEach(br -> out.addAll(allProduced(br.body())));
                case Split s -> s.branches().forEach(br -> out.addAll(allProduced(br.body())));
                case Seq inner -> out.addAll(allProduced(inner));
                case Guarded g -> out.addAll(guardAll(g));
            }
        }
        return out;
    }

    /** 조건식 변수(예약 이름 제외). 파싱에 실패하면 빈 집합 — 그 오류는 평가 때 BRANCH_EVAL_ERROR 로 드러난다. */
    private Set<String> condVars(String cond) {
        if (cond == null || cond.isBlank()) {
            return Set.of();
        }
        try {
            Set<String> vars = new LinkedHashSet<>(expressions.usedVariables(cond));
            vars.removeIf(v -> v.equalsIgnoreCase(ReservedNames.EVAL_TS) || v.startsWith(ReservedNames.RESERVED_PREFIX));
            return vars;
        } catch (kr.dongkuk.maru.mdm.engine.expr.ExpressionFailure | IllegalStateException e) {
            // 파싱 실패(ExpressionFailure PARSE) 또는 사용 변수 추출 실패(IllegalStateException) — 이 패키지의 같은 이름 타입과 구분해 정규 이름으로 적는다.
            return Set.of();
        }
    }

    /** 룰이 요구하는 입력 이름 — 계약 always + DERIVE 행 required·optional(기존 missingInputKeys 와 같다, design §6.13 4). */
    static List<String> needed(RuleDefinition def) {
        List<String> needed = new ArrayList<>();
        if (def.contract() != null) {
            for (VarType t : nonNull(def.contract().always())) {
                needed.add(t.name());
            }
            if (def.ruleKind() == RuleKind.DERIVE) {
                for (RowContract rc : nonNull(def.contract().rows())) {
                    nonNull(rc.required()).forEach(t -> needed.add(t.name()));
                    nonNull(rc.optional()).forEach(t -> needed.add(t.name()));
                }
            }
        }
        return needed;
    }

    /** 이 룰이 읽는 입력 이름 가운데 지금 ctx 에 있는 것의 값(needed 순서, null 값 유지) — 기록 전용. */
    static Map<String, Object> reads(RuleDefinition def, Map<String, Object> ctx) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (String name : needed(def)) {
            if (ctx.containsKey(name) && !out.containsKey(name)) {
                out.put(name, ctx.get(name));
            }
        }
        return Collections.unmodifiableMap(out);
    }

    static Violation missing(String ruleId, String name) {
        return new Violation(Stage.SET_CHECK, Code.MISSING_KEY, ruleId, null, name,
                "세트 입력 키가 레코드에 없다: " + name + " (룰 " + ruleId + ")", List.of());
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }
}
