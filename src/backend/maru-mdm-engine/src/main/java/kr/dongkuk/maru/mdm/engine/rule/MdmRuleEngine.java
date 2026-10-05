package kr.dongkuk.maru.mdm.engine.rule;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.flow.SetStep;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowNode;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 룰 판정 엔진(06-business-rule.md:394-430 엔진 골격, 06:473-498 정의 조회, TSK-03-03 design §6.1·§6.13·§6.14).
 *
 * <p>공유 {@link MdmEvaluator} 를 생성자로 받는다(D19) — 컴파일 캐시는 엔진이 아니라 공유 평가기에 있다. 운영
 * 호출부는 요청마다 새 엔진을 만들어도 같은 평가기 빈을 넘기면 캐시를 공유한다. 테스트는 패키지 전용 생성자로 만든
 * fixture 평가기를 넣는다(D21) — 엔진 코드는 같고 평가기 설정만 다르다.
 * 평가 입력은 스냅샷의 식 텍스트이고 op-code 생성기는 부르지 않는다(06:269·426·471, D4).
 */
public final class MdmRuleEngine implements RuleEngine {

    private final DefinitionLookup definitions;
    private final MdmEvaluator expressions;
    private final ExpressionRunner runner;
    private final RuleEvaluator evaluator;
    /**
     * 세트 ID → 정의에만 의존하는 판정 준비(흐름 트리·입력 키 검사기 원본·하위 세트 준비, 항목5·하위 세트 계획 Task 4). 세트 정의 객체와 룰 정의
     * 객체가 — 하위 세트·손주 세트와 그 룰까지 — 앞 호출과 같은(동일성) 때만 다시 쓴다. 재등록·RELOAD·상태 변화로 새 정의 객체가 오면 새로 만들어
     * 바꿔 넣는다. 최상위 파싱 실패는 넣지 않는다.
     */
    private final ConcurrentHashMap<String, PreparedSet> plans = new ConcurrentHashMap<>();

    /** 기억하는 세트 준비 수 상한 — 넘으면 비우고 다시 채운다(오래 사는 엔진에서 무한히 늘지 않게). */
    static final int MAX_PLANS = 512;

    public MdmRuleEngine(MdmEvaluator evaluator, DefinitionLookup definitions) {
        this.definitions = Objects.requireNonNull(definitions, "definitions");
        this.expressions = Objects.requireNonNull(evaluator, "evaluator");
        this.runner = new ExpressionRunner(this.expressions);
        this.evaluator = new RuleEvaluator(runner);
    }

    @Override
    public RuleResult evaluate(String ruleId, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(ruleId, "ruleId");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        RuleDefinition def = definitions.rule(ruleId, ts).orElseThrow(() -> new EngineEvaluationException(List.of(
                new Violation(Stage.INPUT_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "룰이 없다: " + ruleId + " @ " + ts, List.of()))));
        List<Violation> reserved = RecordKeys.check(record.keySet(), Stage.INPUT_CHECK, ruleId);
        if (!reserved.isEmpty()) {
            throw new EngineEvaluationException(reserved);
        }
        return evaluator.evaluate(def, new LinkedHashMap<>(record), ts);
    }

    @Override
    public RuleSetResult evaluateSet(String setId, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(setId, "setId");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        Prepared p = prepare(set(setId, ts), record, ts);
        FlowRun run = new FlowRun(evaluator, runner, p.set, p.keys, record, ts, false, List.of());
        run.run();
        return run.result();
    }

    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs) {
        return traceSet(set, record, evalTs, List.of());
    }

    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs, List<RunTrace.TraceEdit> edits) {
        Objects.requireNonNull(set, "set");
        Objects.requireNonNull(record, "record");
        Objects.requireNonNull(edits, "edits");
        Instant ts = truncate(evalTs);
        Map<String, Object> input = Collections.unmodifiableMap(new LinkedHashMap<>(record));
        List<RunTrace.TraceEdit> echo = edits.isEmpty() ? null : List.copyOf(edits);
        Prepared p;
        try {
            p = prepare(set, record, ts);
        } catch (EngineEvaluationException e) {
            return new RunTrace(set.setId(), ts, input, List.of(), Map.of(), e.violations(), echo, null);
        }
        FlowRun run = new FlowRun(evaluator, runner, p.set, p.keys, record, ts, true, edits);
        try {
            run.run();
        } catch (EngineEvaluationException e) {
            run.nodes.add(run.failed(e.violations()));
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                    e.violations(), echo, null);
        }
        // 안 쓰인 고친 값은 정상 완료 때만 본다 — run() 안에서 던지면 failed() 가 END 를 ERROR 노드로 잘못 남긴다(4단계 spec §2.2).
        List<Violation> unused = run.unusedEdits();
        return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                unused.isEmpty() ? null : List.copyOf(unused), echo, run.endedBy);
    }

    /** 판정 한 번의 준비 — 기억에서 고른(또는 새로 만든) 세트 준비와 그 판정 전용 입력 키 검사기 사본(지연 목록이 채워져 있다). */
    private static final class Prepared {
        final PreparedSet set;
        final FlowKeys keys;

        Prepared(PreparedSet set, FlowKeys keys) {
            this.set = set;
            this.keys = keys;
        }
    }

    /** 이 세트 정의 객체로 만든 준비가 있으면 그것, 없으면 null. */
    private PreparedSet cachedPlan(RuleSetDefinition set) {
        if (set.setId() == null) {
            return null;
        }
        PreparedSet p = plans.get(set.setId());
        return p != null && p.set == set ? p : null;
    }

    private void remember(PreparedSet p) {
        if (p.setId == null) {
            return;
        }
        if (plans.size() >= MAX_PLANS && !plans.containsKey(p.setId)) {
            plans.clear();
        }
        plans.put(p.setId, p);
    }

    /** 기억 중인 세트 준비 수(시험용). */
    int cachedPlans() {
        return plans.size();
    }

    /** 세트 ID 로 기억 중인 흐름 트리(시험용 — 적중 시 같은 객체인지 본다). 없으면 null. */
    FlowTree cachedTree(String setId) {
        PreparedSet p = plans.get(setId);
        return p == null ? null : p.tree;
    }

    /** 세트 ID 로 기억 중인 입력 키 검사기 원본(시험용 — 적중 시 같은 객체인지 본다). 없으면 null. */
    FlowKeys cachedKeys(String setId) {
        PreparedSet p = plans.get(setId);
        return p == null ? null : p.keys;
    }

    /**
     * 상태 → 흐름 구조(최상위는 바로 FLOW_INVALID) → 레코드 키 → 세트 준비(룰 조회·하위 세트 재귀, 하위 세트 spec §3·편차 7) → 입력 키 사전 검사
     * (plan C5, design §6.13). 구조 오류 밖의 위반은 모아 한 번에 던진다. 폐기 세트는 룰을 조회하지 않는다. 정의에만 의존하는 준비(흐름 트리·입력 키
     * 검사기 원본·하위 세트 준비·겉모양)는 세트 ID 마다 기억하고, 판정마다 룰·하위 세트(손주까지)를 다시 조회해 정의 객체가 모두 같을 때만 다시 쓴다(항목5).
     * 상태 검사·조회·레코드 키 검사·입력 키 검사는 호출마다 한다.
     */
    private Prepared prepare(RuleSetDefinition set, Map<String, Object> record, Instant ts) {
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + set.setId(), List.of())));
        }
        PreparedSet cached = cachedPlan(set);
        FlowTree tree = cached != null ? cached.tree : parse(set);
        List<Violation> violations = new ArrayList<>(RecordKeys.check(record.keySet(), Stage.SET_CHECK, null));
        PreparedSet p = prepareSet(set, tree, cached, Collections.singletonList(set.setId()), List.of(), ts, violations, false);
        if (p != cached) {
            remember(p);
        }
        FlowKeys keys = p.keys.forRun();
        violations.addAll(keys.check(p.tree.root(), record.keySet()));
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return new Prepared(p, keys);
    }

    /**
     * 세트 하나 준비 — 룰 조회 → SET 노드마다 하위 세트(재귀) → 입력 키 검사기 원본·겉모양. 문제는 out 에 모은다(setPath = nodePath).
     * cached(같은 세트 정의 객체로 만든 앞 준비)의 룰 정의·하위 준비가 모두 같은 객체면 cached 를 그대로 돌려준다.
     *
     * @param chain    최상위부터 이 세트까지의 세트 ID(순환·깊이)
     * @param nodePath 최상위부터 이 세트까지 거친 SET 노드 ID(위반의 setPath)
     * @param child    하위 세트로 불리는 준비인가 — 겉모양·받는 노드 label 은 하위 세트에만 만든다(최상위는 쓰지 않는다)
     */
    private PreparedSet prepareSet(RuleSetDefinition set, FlowTree tree, @Nullable PreparedSet cached, List<String> chain, List<String> nodePath,
            Instant ts, List<Violation> out, boolean child) {
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (String ruleId : tree.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isEmpty()) {
                out.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + set.setId() + " 의 룰이 없다: " + ruleId + " @ " + ts, nodePath));
            } else {
                defs.put(ruleId, def.get());
            }
        }
        boolean same = cached != null && cached.sameDefs(defs);
        Map<String, PreparedSet> calls = Map.of();
        List<SetStep> steps = tree.setSteps();
        if (!steps.isEmpty()) {
            calls = new LinkedHashMap<>();
            for (SetStep s : steps) {
                PreparedSet prev = cached == null ? null : cached.calls.get(s.nodeId());
                PreparedSet c = prepareCall(s, prev, chain, nodePath, ts, out);
                if (c != null) {
                    calls.put(s.nodeId(), c);
                }
                if (c != prev) {
                    same = false;
                }
            }
        }
        if (same) {
            return cached;
        }
        Map<String, RuleDefinition> snapshot = Collections.unmodifiableMap(defs);
        Map<String, SetShape> shapes = Map.of();
        if (!calls.isEmpty()) {
            shapes = new LinkedHashMap<>();
            for (Map.Entry<String, PreparedSet> c : calls.entrySet()) {
                shapes.put(c.getKey(), c.getValue().shape);
            }
            shapes = Collections.unmodifiableMap(shapes);
            calls = Collections.unmodifiableMap(calls);
        }
        FlowKeys keys = new FlowKeys(snapshot, shapes, expressions);
        SetShape shape = child ? SetShape.of(tree, snapshot, shapes, keys) : null;
        return new PreparedSet(set, tree, snapshot, keys, calls, shape, child ? catchLabels(set) : Map.of());
    }

    /**
     * SET 노드 하나의 하위 세트 — 빈 ID·순환·깊이·없음·폐기·구조를 거른 뒤 재귀 준비(하위 세트 spec §3·§3.3, 편차 7). 실패하면 out 에 모으고 null.
     * prev 는 앞 준비에서 이 SET 노드의 하위 준비 — 같은 세트 정의 객체면 그 흐름 트리와 준비를 다시 쓴다.
     */
    private @Nullable PreparedSet prepareCall(SetStep s, @Nullable PreparedSet prev, List<String> chain, List<String> nodePath, Instant ts,
            List<Violation> out) {
        String id = s.setId();
        if (id == null || id.isBlank()) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트 노드 " + s.nodeId() + "에 세트 ID가 없다", nodePath));
            return null;
        }
        if (chain.contains(id)) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_CALL_CYCLE, null, null, id,
                    "세트 호출이 순환한다: " + String.join(" › ", chain) + " › " + id, nodePath));
            return null;
        }
        if (chain.size() > SetShape.MAX_CALL_DEPTH) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_CALL_DEPTH, null, null, id, "세트 호출이 " + chain.size() + "단계다. "
                    + SetShape.MAX_CALL_DEPTH + "단계까지 부른다: " + String.join(" › ", chain) + " › " + id, nodePath));
            return null;
        }
        Optional<RuleSetDefinition> found = definitions.ruleSet(id, ts);
        if (found.isEmpty()) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, id, "세트가 없다: " + id + " (SET 노드 " + s.nodeId() + ")", nodePath));
            return null;
        }
        RuleSetDefinition def = found.get();
        if (def.status() == SetStatus.DEPRECATED) {
            out.add(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null, id,
                    "폐기된 세트는 부르지 않는다: " + id + " (SET 노드 " + s.nodeId() + ")", nodePath));
            return null;
        }
        List<String> path = append(nodePath, s.nodeId());
        PreparedSet same = prev != null && prev.set == def ? prev : null;
        FlowTree tree;
        if (same != null) {
            tree = same.tree;
        } else {
            FlowParse parsed = FlowParser.parse(flowOf(def));
            if (parsed.tree() == null) {
                parsed.issues().forEach(i -> out.add(new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                        "세트 " + id + " 의 흐름이 올바르지 않다: " + i.message(), path)));
                return null;
            }
            tree = parsed.tree();
        }
        return prepareSet(def, tree, same, append(chain, id), path, ts, out, true);
    }

    /** 받는 노드 ID → label(비었으면 노드 ID) — SUBSET_ENDED 의 CATCH_MSG(Ruling 5). */
    private static Map<String, String> catchLabels(RuleSetDefinition set) {
        if (set.flow() == null) {
            return Map.of();
        }
        Map<String, String> labels = new LinkedHashMap<>();
        for (FlowNode n : set.flow().nodes()) {
            if (n.kind() == NodeKind.CATCH) {
                labels.put(n.id(), n.label() == null || n.label().isBlank() ? n.id() : n.label());
            }
        }
        return Collections.unmodifiableMap(labels);
    }

    private static List<String> append(List<String> list, String x) {
        List<String> out = new ArrayList<>(list.size() + 1);
        out.addAll(list);
        out.add(x);
        return Collections.unmodifiableList(out);
    }

    private static FlowDefinition flowOf(RuleSetDefinition set) {
        return set.flow() == null ? FlowParser.linear(set.ruleIds()) : set.flow();
    }

    /** 흐름 구조 검사 — 실패하면 FLOW_INVALID 를 던지고 기억하지 않는다. */
    private static FlowTree parse(RuleSetDefinition set) {
        FlowParse parsed = FlowParser.parse(flowOf(set));
        if (parsed.tree() == null) {
            throw new EngineEvaluationException(parsed.issues().stream()
                    .map(i -> new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                            "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message(), List.of()))
                    .toList());
        }
        return parsed.tree();
    }

    @Override
    public RuleView view(String ruleId, Instant evalTs, EnumSet<Part> parts) {
        Objects.requireNonNull(ruleId, "ruleId");
        Objects.requireNonNull(parts, "parts");
        Instant ts = truncate(evalTs);
        return definitions.rule(ruleId, ts)
                .map(def -> toView(def, parts))
                .orElseThrow(() -> new EngineEvaluationException(List.of(new Violation(Stage.INPUT_CHECK,
                        Code.RULE_NOT_FOUND, ruleId, null, null, "룰이 없다: " + ruleId + " @ " + ts, List.of()))));
    }

    /** 폐기 세트도 조회는 허용한다(판정이 아니라 이력 조회, design §6.14). */
    @Override
    public List<RuleView> setView(String setId, Instant evalTs, EnumSet<Part> parts) {
        Objects.requireNonNull(setId, "setId");
        Objects.requireNonNull(parts, "parts");
        Instant ts = truncate(evalTs);
        RuleSetDefinition set = set(setId, ts);
        List<RuleView> views = new ArrayList<>();
        List<Violation> violations = new ArrayList<>();
        for (String ruleId : set.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isPresent()) {
                views.add(toView(def.get(), parts));
            } else {
                violations.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + setId + " 의 룰이 없다: " + ruleId + " @ " + ts, List.of()));
            }
        }
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return List.copyOf(views);
    }

    // ------------------------------------------------------------------ 내부

    private static Instant truncate(Instant evalTs) {
        return Objects.requireNonNull(evalTs, "evalTs").truncatedTo(ChronoUnit.SECONDS);
    }

    private RuleSetDefinition set(String setId, Instant ts) {
        return definitions.ruleSet(setId, ts).orElseThrow(() -> new EngineEvaluationException(List.of(new Violation(
                Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트가 없다: " + setId + " @ " + ts, List.of()))));
    }

    /** 스냅샷의 text·AST·계약을 그대로 꺼낸다. 식을 컴파일하지도 평가하지도 않는다(06:475·490-496). */
    private static RuleView toView(RuleDefinition def, EnumSet<Part> parts) {
        boolean text = parts.contains(Part.TEXT);
        boolean ast = parts.contains(Part.AST);
        List<RuleVar> ordered = new ArrayList<>(RuleEvaluator.columns(def.vars(), VarKind.COND));
        ordered.addAll(RuleEvaluator.columns(def.vars(), VarKind.RESULT));
        Map<Integer, RuleVar> byId = new LinkedHashMap<>();
        List<RuleView.ColumnView> columns = new ArrayList<>();
        for (RuleVar v : ordered) {
            byId.put(v.varId(), v);
            columns.add(new RuleView.ColumnView(v.varId(), v.varKind(), v.dispType(), v.varName(), v.dataType(),
                    v.scale(), v.domainId(), v.seq(), text ? v.exprText() : null, ast ? v.exprAst() : null));
        }

        List<RuleRow> rows = new ArrayList<>();
        List<RuleRow> defaults = new ArrayList<>();
        for (RuleRow r : nonNull(def.rows())) {
            (r.rowKind() == RowKind.DEFAULT ? defaults : rows).add(r);
        }
        rows.sort(Comparator.comparingInt(RuleRow::seq).thenComparingInt(RuleRow::rowId));
        rows.addAll(defaults);

        List<RuleView.RowView> rowViews = new ArrayList<>();
        for (RuleRow r : rows) {
            Map<Integer, RuleView.CellView> cells = new LinkedHashMap<>();
            for (RuleVar v : ordered) {
                RuleCell c = r.cells().get(v.varId());
                if (c != null) {
                    cells.put(v.varId(), cellView(v, c, text, ast));
                }
            }
            for (Map.Entry<Integer, RuleCell> e : new TreeMap<>(r.cells()).entrySet()) {
                if (!byId.containsKey(e.getKey())) {
                    cells.put(e.getKey(), cellView(null, e.getValue(), text, ast));
                }
            }
            rowViews.add(new RuleView.RowView(r.rowId(), r.seq(), r.rowKind(), Collections.unmodifiableMap(cells)));
        }
        return new RuleView(def.ruleId(), def.ver(), def.ruleKind(), def.hitPolicy(), def.applyFrom(), def.applyTo(),
                List.copyOf(columns), List.copyOf(rowViews), parts.contains(Part.CONTRACT) ? def.contract() : null);
    }

    private static RuleView.CellView cellView(RuleVar var, RuleCell c, boolean text, boolean ast) {
        return new RuleView.CellView(text ? CellSummary.of(var, c) : null, text ? c.text() : null, ast ? c.ast() : null);
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }
}
