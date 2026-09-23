package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.config.ExpressionConfiguration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.TreeMap;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 룰 판정 엔진(06-business-rule.md:394-430 엔진 골격, 06:473-498 정의 조회, TSK-03-03 design §6.1·§6.13·§6.14).
 *
 * <p>EvalEx 설정과 정의 조회를 생성자로 받는다(D1). 운영 설정은 {@code MdmExpressionConfig.create(...)}(TSK-03-02),
 * 테스트는 같은 상수로 조립한 fixture 설정을 넣는다 — 엔진 코드는 같고 설정만 다르다.
 * 평가 입력은 스냅샷의 식 텍스트이고 op-code 생성기는 부르지 않는다(06:269·426·471, D4).
 */
public final class MdmRuleEngine implements RuleEngine {

    private final DefinitionLookup definitions;
    private final RuleEvaluator evaluator;

    public MdmRuleEngine(ExpressionConfiguration configuration, DefinitionLookup definitions) {
        this.definitions = Objects.requireNonNull(definitions, "definitions");
        this.evaluator = new RuleEvaluator(new ExpressionRunner(Objects.requireNonNull(configuration, "configuration")));
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
        RuleSetDefinition set = set(setId);
        if (set.status() == SetStatus.DEPRECATED) {
            throw new EngineEvaluationException(List.of(new Violation(Stage.SET_CHECK, Code.SET_DEPRECATED, null, null,
                    null, "폐기된 세트는 판정하지 않는다: " + setId)));
        }

        List<Violation> violations = new ArrayList<>(RecordKeys.check(record.keySet(), Stage.SET_CHECK, null));
        List<RuleDefinition> defs = new ArrayList<>();
        for (String ruleId : set.ruleIds()) {
            Optional<RuleDefinition> def = definitions.rule(ruleId, ts);
            if (def.isEmpty()) {
                violations.add(new Violation(Stage.SET_CHECK, Code.RULE_NOT_FOUND, ruleId, null, null,
                        "세트 " + setId + " 의 룰이 없다: " + ruleId + " @ " + ts));
            }
            defs.add(def.orElse(null));
        }
        violations.addAll(missingInputKeys(defs, record));
        if (!violations.isEmpty()) {
            throw new EngineEvaluationException(violations);
        }

        Map<String, Object> ctx = new LinkedHashMap<>(record);
        Map<String, Object> finalValues = new LinkedHashMap<>();
        List<RuleResult> steps = new ArrayList<>();
        for (RuleDefinition def : defs) {
            RuleResult r = evaluator.evaluate(def, ctx, ts);
            for (Map.Entry<String, Object> e : r.results().entrySet()) {
                RecordKeys.putReplacing(ctx, e.getKey(), e.getValue());
                finalValues.put(e.getKey(), e.getValue());
            }
            steps.add(r);
        }
        return new RuleSetResult(setId, ts, List.copyOf(steps), Collections.unmodifiableMap(finalValues));
    }

    /**
     * 세트 입력 키 일괄 확인(06:420, design §6.13 4). 룰 순서대로 (조건 변수 ∪ DERIVE 행 변수) − 앞 룰 결과 이름 가운데
     * 레코드에 정확한 키가 없는 것. 조회에 실패한 룰(null)은 건너뛴다.
     */
    private static List<Violation> missingInputKeys(List<RuleDefinition> defs, Map<String, Object> record) {
        List<Violation> out = new ArrayList<>();
        Set<String> produced = new HashSet<>();
        Set<String> reported = new HashSet<>();
        for (RuleDefinition def : defs) {
            if (def == null) {
                continue;
            }
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
            for (String name : needed) {
                if (!produced.contains(name) && !record.containsKey(name) && reported.add(name)) {
                    out.add(new Violation(Stage.SET_CHECK, Code.MISSING_KEY, def.ruleId(), null, name,
                            "세트 입력 키가 레코드에 없다: " + name + " (룰 " + def.ruleId() + ")"));
                }
            }
            produced.addAll(RuleEvaluator.resultNames(def));
        }
        return out;
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
