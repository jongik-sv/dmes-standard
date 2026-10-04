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
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;

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
     * 세트 ID → 정의에만 의존하는 판정 준비(흐름 트리·입력 키 검사기 원본, 항목5). 세트 정의 객체와 룰 정의 객체가 앞 호출과 같은(동일성)
     * 때만 다시 쓴다. 재등록·RELOAD·상태 변화로 새 정의 객체가 오면 새로 만들어 바꿔 넣는다. 파싱 실패는 넣지 않는다.
     */
    private final ConcurrentHashMap<String, Plan> plans = new ConcurrentHashMap<>();

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
                        "룰이 없다: " + ruleId + " @ " + ts))));
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
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, false, List.of());
        run.run();
        return new RuleSetResult(setId, ts, List.copyOf(run.steps), Collections.unmodifiableMap(run.finalValues),
                List.copyOf(run.path), List.copyOf(run.warnings), List.copyOf(run.caught), run.endedBy);
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
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true, edits);
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

    /** 판정 준비된 세트 — 트리·룰 정의(룰 ID → 정의)·입력 키 검사기. */
    private static final class Prepared {
        final FlowTree tree;
        final Map<String, RuleDefinition> defs;
        final FlowKeys keys;

        Prepared(FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys) {
            this.tree = tree;
            this.defs = defs;
            this.keys = keys;
        }
    }

    /**
     * 세트 정의에만 의존하는 판정 준비 — 흐름 트리, 그리고 그 트리를 만든 시각의 룰 정의 묶음으로 만든 입력 키 검사기 원본.
     * 키는 세트 ID 이고 적중은 세트 정의 객체·룰 정의 객체가 모두 같을(동일성) 때다. 판정마다 {@link FlowKeys#forRun} 사본을 쓴다.
     */
    private static final class Plan {
        final RuleSetDefinition set;
        final FlowTree tree;
        final Map<String, RuleDefinition> defs;
        final FlowKeys keys;

        Plan(RuleSetDefinition set, FlowTree tree, Map<String, RuleDefinition> defs, FlowKeys keys) {
            this.set = set;
            this.tree = tree;
            this.defs = defs;
            this.keys = keys;
        }

        /** 이번 호출이 고른 룰 정의가 이 준비를 만든 정의와 같은 객체들인가(룰 ID·순서·객체 동일성). */
        boolean sameDefs(Map<String, RuleDefinition> current) {
            if (current.size() != defs.size()) {
                return false;
            }
            var a = defs.entrySet().iterator();
            var b = current.entrySet().iterator();
            while (a.hasNext()) {
                Map.Entry<String, RuleDefinition> x = a.next();
                Map.Entry<String, RuleDefinition> y = b.next();
                if (!x.getKey().equals(y.getKey()) || x.getValue() != y.getValue()) {
                    return false;
                }
            }
            return true;
        }
    }

    /** 이 세트 정의 객체로 만든 준비가 있으면 그것, 없으면 null. */
    private Plan cachedPlan(RuleSetDefinition set) {
        if (set.setId() == null) {
            return null;
        }
        Plan p = plans.get(set.setId());
        return p != null && p.set == set ? p : null;
    }

    private void remember(Plan p) {
        if (p.set.setId() == null) {
            return;
        }
        if (plans.size() >= MAX_PLANS && !plans.containsKey(p.set.setId())) {
            plans.clear();
        }
        plans.put(p.set.setId(), p);
    }

    /** 기억 중인 세트 준비 수(시험용). */
    int cachedPlans() {
        return plans.size();
    }

    /** 세트 ID 로 기억 중인 흐름 트리(시험용 — 적중 시 같은 객체인지 본다). 없으면 null. */
    FlowTree cachedTree(String setId) {
        Plan p = plans.get(setId);
        return p == null ? null : p.tree;
    }

    /** 세트 ID 로 기억 중인 입력 키 검사기 원본(시험용 — 적중 시 같은 객체인지 본다). 없으면 null. */
    FlowKeys cachedKeys(String setId) {
        Plan p = plans.get(setId);
        return p == null ? null : p.keys;
    }

    /**
     * 상태 → 흐름 구조 → 레코드 키·룰 조회·입력 키 사전 검사(plan C5, design §6.13). 구조 오류는 FLOW_INVALID 로 바로 던지고,
     * 나머지는 모아 한 번에 던진다. 폐기 세트는 룰을 조회하지 않는다. 흐름 파싱과 입력 키 검사기 생성은 정의가 같으면 기억한 것을 쓴다(항목5) —
     * 상태 검사·룰 조회·레코드 키 검사는 호출마다 한다.
     */
    private Prepared prepare(RuleSetDefinition set, Map<String, Object> record, Instant ts) {
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + set.setId())));
        }
        Plan cached = cachedPlan(set);
        FlowTree tree = cached != null ? cached.tree : parse(set);
        List<Violation> violations = new ArrayList<>(RecordKeys.check(record.keySet(), Stage.SET_CHECK, null));
        Map<String, RuleDefinition> defs = new LinkedHashMap<>();
        for (String ruleId : tree.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isEmpty()) {
                violations.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + set.setId() + " 의 룰이 없다: " + ruleId + " @ " + ts));
            } else {
                defs.put(ruleId, def.get());
            }
        }
        FlowKeys template;
        if (cached != null && cached.sameDefs(defs)) {
            template = cached.keys;
        } else {
            Map<String, RuleDefinition> snapshot = Collections.unmodifiableMap(new LinkedHashMap<>(defs));
            template = new FlowKeys(snapshot, expressions);
            remember(new Plan(set, tree, snapshot, template));
        }
        FlowKeys keys = template.forRun();
        violations.addAll(keys.check(tree.root(), record.keySet()));
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return new Prepared(tree, defs, keys);
    }

    /** 흐름 구조 검사 — 실패하면 FLOW_INVALID 를 던지고 기억하지 않는다. */
    private static FlowTree parse(RuleSetDefinition set) {
        FlowDefinition flow = set.flow() == null ? FlowParser.linear(set.ruleIds()) : set.flow();
        FlowParse parsed = FlowParser.parse(flow);
        if (parsed.tree() == null) {
            throw new EngineEvaluationException(parsed.issues().stream()
                    .map(i -> new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                            "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message()))
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
                        Code.RULE_NOT_FOUND, ruleId, null, null, "룰이 없다: " + ruleId + " @ " + ts))));
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
                        "세트 " + setId + " 의 룰이 없다: " + ruleId + " @ " + ts));
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
                Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트가 없다: " + setId + " @ " + ts))));
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
