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
        Prepared p = prepare(set(setId), record, ts);
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, false);
        run.run();
        return new RuleSetResult(setId, ts, List.copyOf(run.steps), Collections.unmodifiableMap(run.finalValues),
                List.copyOf(run.path), List.copyOf(run.warnings));
    }

    @Override
    public RunTrace traceSet(RuleSetDefinition set, Map<String, Object> record, Instant evalTs) {
        Objects.requireNonNull(set, "set");
        Objects.requireNonNull(record, "record");
        Instant ts = truncate(evalTs);
        Map<String, Object> input = Collections.unmodifiableMap(new LinkedHashMap<>(record));
        Prepared p;
        try {
            p = prepare(set, record, ts);
        } catch (EngineEvaluationException e) {
            return new RunTrace(set.setId(), ts, input, List.of(), Map.of(), e.violations());
        }
        FlowRun run = new FlowRun(evaluator, runner, p.tree, p.defs, p.keys, record, ts, true);
        try {
            run.run();
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues), null);
        } catch (EngineEvaluationException e) {
            run.nodes.add(run.failed(e.violations()));
            return new RunTrace(set.setId(), ts, input, List.copyOf(run.nodes), Collections.unmodifiableMap(run.finalValues),
                    e.violations());
        }
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
     * 상태 → 흐름 구조 → 레코드 키·룰 조회·입력 키 사전 검사(plan C5, design §6.13). 구조 오류는 FLOW_INVALID 로 바로 던지고,
     * 나머지는 모아 한 번에 던진다. 폐기 세트는 룰을 조회하지 않는다.
     */
    private Prepared prepare(RuleSetDefinition set, Map<String, Object> record, Instant ts) {
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + set.setId())));
        }
        FlowDefinition flow = set.flow() == null ? FlowParser.linear(set.ruleIds()) : set.flow();
        FlowParse parsed = FlowParser.parse(flow);
        if (parsed.tree() == null) {
            throw new EngineEvaluationException(parsed.issues().stream()
                    .map(i -> new Violation(Stage.SET_CHECK, Code.FLOW_INVALID, null, null, i.nodeId(),
                            "세트 " + set.setId() + " 의 흐름이 올바르지 않다: " + i.message()))
                    .toList());
        }
        FlowTree tree = parsed.tree();
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
        FlowKeys keys = new FlowKeys(defs, expressions);
        violations.addAll(keys.check(tree.root(), record.keySet()));
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }
        return new Prepared(tree, defs, keys);
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
        RuleSetDefinition set = set(setId);
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

    private RuleSetDefinition set(String setId) {
        return definitions.ruleSet(setId).orElseThrow(() -> new EngineEvaluationException(List.of(new Violation(
                Stage.SET_CHECK, Code.SET_NOT_FOUND, null, null, null, "세트가 없다: " + setId))));
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
