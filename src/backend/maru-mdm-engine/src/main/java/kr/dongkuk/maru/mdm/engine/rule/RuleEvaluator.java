package kr.dongkuk.maru.mdm.engine.rule;

import com.ezylang.evalex.data.EvaluationValue;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Code;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Stage;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.expr.EngineWarning;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;

/**
 * 룰 하나의 4단계 판정 — 조건 검사 → 행 고르기 → 결과 검사 → 결과 평가(06-business-rule.md:210-219, TSK-03-03 design §6.2).
 * 단계 안 위반은 모두 모아 그 단계 끝에 한 번 던지고, 앞 단계 위반이 있으면 뒤 단계를 돌지 않는다.
 * 평가 입력은 스냅샷의 식 텍스트다(06:471, D4). 예약 키 검사는 부르는 쪽이 이미 했다.
 */
final class RuleEvaluator {

    private static final InputContract EMPTY_CONTRACT = new InputContract(List.of(), List.of());
    private static final String NA = "NA";

    /** 조건 판정 결과. record·enum 을 두지 않는다(design D3). */
    private static final int FALSE = 0;
    private static final int TRUE = 1;
    private static final int ERROR = -1;

    private final ExpressionRunner runner;

    RuleEvaluator(ExpressionRunner runner) {
        this.runner = runner;
    }

    /**
     * @param ctx    레코드(+ 세트의 앞 룰 결과). 1·3단계 변환값으로 바뀐다
     * @param evalTs 초 미만을 자른 평가 시각
     */
    RuleResult evaluate(RuleDefinition definition, Map<String, Object> ctx, Instant evalTs) {
        return new Run(definition, ctx, evalTs).evaluate();
    }

    /** 결과 이름 하나 — 일반 결과 열 하나, 또는 같은 res_grp 의 열 묶음(자리는 첫 열 자리). */
    private static final class Slot {
        final String name;
        final boolean group;
        final List<RuleVar> columns = new ArrayList<>();
        RuleVar chosen;

        Slot(String name, boolean group) {
            this.name = name;
            this.group = group;
        }

        /** 평가할 열. 그룹이면 고른 열(없으면 null). */
        RuleVar column() {
            return group ? chosen : columns.get(0);
        }
    }

    /** 판정 한 번의 상태. */
    private final class Run {
        final RuleDefinition def;
        final String ruleId;
        final Map<String, Object> ctx;
        final Instant evalTs;
        final InputContract contract;
        final List<RuleVar> condColumns;
        final List<Slot> slots;
        final List<Violation> violations = new ArrayList<>();
        final List<EngineWarning> warnings = new ArrayList<>();
        /** EvalEx 값 맵 = ctx + EVAL_TS + _V<id> (+ DERIVE 결과). 영속 ctx 에는 EVAL_TS·_V 를 넣지 않는다. */
        Map<String, Object> values;
        Map<String, Integer> groupChoices = Map.of();
        /** 조건 셀 식 텍스트 → 참·거짓. 레코드 한 건 판정 동안만 산다(값 맵이 레코드마다 다르다). */
        final Map<String, Boolean> condResults = new HashMap<>();

        Run(RuleDefinition def, Map<String, Object> ctx, Instant evalTs) {
            this.def = def;
            this.ruleId = def.ruleId();
            this.ctx = ctx;
            this.evalTs = evalTs;
            this.contract = def.contract() == null ? EMPTY_CONTRACT : def.contract();
            this.condColumns = columns(def.vars(), VarKind.COND);
            this.slots = slots(columns(def.vars(), VarKind.RESULT));
        }

        RuleResult evaluate() {
            inputCheck();
            throwIfViolated();
            values = new LinkedHashMap<>(ctx);
            values.put(ReservedNames.EVAL_TS, evalTs);
            expressionVariables();
            throwIfViolated();
            List<RuleRow> normal = new ArrayList<>();
            RuleRow defaultRow = null;
            for (RuleRow r : def.rows()) {
                if (r.rowKind() == RowKind.DEFAULT) {
                    defaultRow = defaultRow == null ? r : defaultRow;
                } else {
                    normal.add(r);
                }
            }
            normal.sort(Comparator.comparingInt(RuleRow::seq).thenComparingInt(RuleRow::rowId));
            return def.ruleKind() == RuleKind.DERIVE ? derive(normal) : decision(normal, defaultRow);
        }

        // -------------------------------------------------------------- 1단계

        void inputCheck() {
            for (VarType t : nonNull(contract.always())) {
                if (!ctx.containsKey(t.name())) {
                    violations.add(violation(Stage.INPUT_CHECK, Code.MISSING_KEY, null, t.name(),
                            "조건 변수 키가 레코드에 없다: " + t.name()));
                } else {
                    convertInto(t, Stage.INPUT_CHECK, null);
                }
            }
        }

        private void convertInto(VarType t, Stage stage, Integer rowId) {
            try {
                Object converted = ValueConverter.toDeclared(ctx.get(t.name()), t.dataType());
                ctx.put(t.name(), converted);
                if (values != null) {
                    values.put(t.name(), converted);
                }
            } catch (IllegalArgumentException e) {
                violations.add(violation(stage, Code.TYPE_CONVERSION, rowId, t.name(), e.getMessage()));
            }
        }

        // -------------------------------------------------------------- 2단계

        void expressionVariables() {
            for (RuleVar v : condColumns) {
                if (v.varName() != null || v.exprText() == null || !isExpressionVariableDisp(v.dispType())) {
                    continue;
                }
                String name = ReservedNames.EXPR_VAR_PREFIX + v.varId();
                Object value = null;
                boolean nullRef = false;
                for (String ref : nonNull(v.refVars())) {
                    nullRef |= values.get(ref) == null;
                }
                if (!nullRef) {
                    value = evaluateValue(v.exprText(), v.dataType(), Stage.ROW_SELECT, null, name, name);
                }
                values.put(name, value);
            }
        }

        private boolean isExpressionVariableDisp(DispType d) {
            return d == DispType.EQUAL || d == DispType.ONE || d == DispType.TWO;
        }

        RuleResult decision(List<RuleRow> normal, RuleRow defaultRow) {
            HitPolicy policy = def.hitPolicy() == null ? HitPolicy.FIRST : def.hitPolicy();
            List<RuleRow> hits = new ArrayList<>();
            List<RuleResult.RowTrace> trace = new ArrayList<>();
            boolean stop = false;
            for (RuleRow row : normal) {
                if (stop) {
                    trace.add(new RuleResult.RowTrace(row.rowId(), row.seq(), false, false, null));
                    continue;
                }
                int before = violations.size();
                Integer firstFalse = firstFalse(row);
                boolean hit = violations.size() == before && firstFalse == null;
                trace.add(new RuleResult.RowTrace(row.rowId(), row.seq(), true, hit, hit ? null : firstFalse));
                if (hit) {
                    hits.add(row);
                    stop = policy == HitPolicy.FIRST;
                }
            }
            if (policy == HitPolicy.UNIQUE && hits.size() > 1) {
                violations.add(violation(Stage.ROW_SELECT, Code.UNIQUE_MULTIPLE_HITS, null, null,
                        "UNIQUE 룰에 적중 행이 둘 이상이다: " + hits.stream().map(RuleRow::rowId).toList()));
            }
            boolean defaultApplied = hits.isEmpty() && defaultRow != null;
            List<RuleRow> producing = defaultApplied ? List.of(defaultRow) : hits;
            if (!producing.isEmpty()) {
                chooseGroups();
            }
            throwIfViolated(trace);
            if (producing.isEmpty()) {
                return result(List.of(), false, nullResults(), trace);
            }

            resultCheck(producing);
            throwIfViolated(trace);

            List<Map<String, Object>> rowValues = new ArrayList<>();
            for (RuleRow row : producing) {
                rowValues.add(evaluateRow(row, false));
            }
            throwIfViolated(trace);

            Map<String, Object> results;
            List<RuleRow> ordered = hits;
            switch (policy) {
                case PRIORITY: {
                    List<Integer> order = ResultAggregator.priorityOrder(rowValues, priorityLists());
                    results = rowValues.get(order.get(0));
                    if (!defaultApplied) {
                        ordered = new ArrayList<>();
                        for (int i : order) {
                            ordered.add(hits.get(i));
                        }
                    }
                    break;
                }
                case COLLECT:
                    results = collect(rowValues);
                    break;
                case ANY:
                    results = rowValues.get(0);
                    anyConflicts(rowValues);
                    break;
                default:
                    results = rowValues.get(0);
            }
            throwIfViolated(trace);
            return result(toHits(ordered), defaultApplied, results, trace);
        }

        /** 조건 열 seq 순으로 첫 거짓 셀의 var_id. 모두 참이면 null. 평가 오류는 위반에 쌓고 멈춘다. */
        private Integer firstFalse(RuleRow row) {
            for (RuleVar col : condColumns) {
                RuleCell cell = row.cells().get(col.varId());
                if (cell == null || NA.equals(cell.op())) {
                    continue;
                }
                int t = cachedTest(cell.text(), row.rowId(), col.varId());
                if (t == ERROR) {
                    return null;
                }
                if (t == FALSE) {
                    return col.varId();
                }
            }
            return null;
        }

        /**
         * 조건 셀 판정을 식 텍스트로 재사용한다. 행 고르기 동안 값 맵이 바뀌지 않으므로 같은 텍스트는 같은 답이다.
         * NULL(경고)·평가 오류는 행마다 경고·위반을 남겨야 하므로 담지 않는다.
         */
        private int cachedTest(String text, int rowId, int varId) {
            Boolean cached = condResults.get(text);
            if (cached != null) {
                return cached ? TRUE : FALSE;
            }
            int warningsBefore = warnings.size();
            int t = test(text, rowId, varId, null);
            if (t != ERROR && warnings.size() == warningsBefore) {
                condResults.put(text, t == TRUE);
            }
            return t;
        }

        /**
         * 조건 셀·열 조건 판정. NULL 은 거짓 + 경고, 불린이 아니면 평가 오류(E13).
         *
         * @param group 열 조건이면 결과 열 그룹 이름(res_grp), 조건 셀이면 null
         */
        private int test(String text, Integer rowId, int varId, String group) {
            boolean groupCondition = group != null;
            EvaluationValue v;
            try {
                v = runner.run(text, values, evalTs);
            } catch (ExpressionFailure f) {
                violations.add(violation(Stage.ROW_SELECT, Code.EVALUATION_ERROR, groupCondition ? null : rowId, null,
                        where(rowId, varId, group) + " 식 '" + text + "' 평가 오류: " + f.getMessage()));
                return ERROR;
            }
            if (v.isNullValue()) {
                warnings.add(new EngineWarning(
                        groupCondition ? EngineWarning.Code.GRP_COND_NULL : EngineWarning.Code.EXPR_CELL_NULL,
                        ruleId, groupCondition ? null : rowId, varId,
                        where(rowId, varId, group) + " 식 '" + text + "' 결과가 NULL 이라 거짓으로 봤다"));
                return FALSE;
            }
            if (!v.isBooleanValue()) {
                violations.add(violation(Stage.ROW_SELECT, Code.EVALUATION_ERROR, groupCondition ? null : rowId, null,
                        where(rowId, varId, group) + " 식 '" + text + "' 결과가 불린이 아니다: " + v.getDataType()));
                return ERROR;
            }
            return v.getBooleanValue() ? TRUE : FALSE;
        }

        /** 열 조건은 어느 결과 열 그룹의 것인지 함께 적는다 — 화면이 사용자 문장으로 옮길 때 var_id 만으로는 그룹을 찾지 못한다. */
        private String where(Integer rowId, int varId, String group) {
            return group != null ? "결과 열 그룹 " + group + " 열 조건 var " + varId : "row " + rowId + " var " + varId;
        }

        /** 결과 열 그룹마다 열 seq 순 첫 참 열. 빈 열 조건은 기본 열. 레코드마다 한 번(06:69·425). */
        private void chooseGroups() {
            Map<String, Integer> choices = new LinkedHashMap<>();
            for (Slot s : slots) {
                if (!s.group) {
                    continue;
                }
                for (RuleVar col : s.columns) {
                    if (col.grpCond() == null || col.grpCond().isEmpty()) {
                        s.chosen = col;
                        break;
                    }
                    int t = test(col.grpCond(), null, col.varId(), s.name);
                    if (t == ERROR) {
                        break;
                    }
                    if (t == TRUE) {
                        s.chosen = col;
                        break;
                    }
                }
                choices.put(s.name, s.chosen == null ? null : s.chosen.varId());
            }
            groupChoices = Collections.unmodifiableMap(choices);
        }

        // -------------------------------------------------------------- 3단계

        /** 결과를 낼 행의 RowContract 만 본다(I26, D16). required 는 키 없음·NULL, optional 은 키 없음만 허용. */
        private void resultCheck(List<RuleRow> producing) {
            for (RuleRow row : producing) {
                RowContract rc = null;
                for (RowContract c : nonNull(contract.rows())) {
                    if (c.rowId() == row.rowId()) {
                        rc = c;
                        break;
                    }
                }
                if (rc == null) {
                    continue;
                }
                for (VarType t : nonNull(rc.required())) {
                    if (!ctx.containsKey(t.name())) {
                        violations.add(violation(Stage.RESULT_CHECK, Code.MISSING_KEY, row.rowId(), t.name(),
                                "row " + row.rowId() + " 결과 계산에 필요한 키가 없다: " + t.name()));
                    } else if (ctx.get(t.name()) == null) {
                        violations.add(violation(Stage.RESULT_CHECK, Code.REQUIRED_NULL, row.rowId(), t.name(),
                                "row " + row.rowId() + " 필수 변수가 NULL 이다: " + t.name()));
                    } else {
                        convertInto(t, Stage.RESULT_CHECK, row.rowId());
                    }
                }
                for (VarType t : nonNull(rc.optional())) {
                    if (ctx.get(t.name()) != null) {
                        convertInto(t, Stage.RESULT_CHECK, row.rowId());
                    }
                }
            }
        }

        // -------------------------------------------------------------- 4단계

        /** 결과 열 seq 순으로 행의 결과를 낸다. {@code derive} 면 값을 곧바로 값 맵에 넣어 뒤 식이 읽는다(I32). */
        private Map<String, Object> evaluateRow(RuleRow row, boolean derive) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Slot s : slots) {
                RuleVar col = s.column();
                Object value = null;
                if (col != null) {
                    RuleCell cell = row.cells().get(col.varId());
                    if (cell != null) {
                        value = evaluateValue(cell.text(), col.dataType(), Stage.RESULT_EVAL, row.rowId(), s.name,
                                "row " + row.rowId() + " var " + col.varId());
                    }
                }
                out.put(s.name, value);
                if (derive) {
                    values.put(s.name, value);
                }
            }
            return out;
        }

        /** 식을 평가해 Java 값 → 선언 타입. 실패는 위반에 쌓고 null. */
        private Object evaluateValue(String text, DataType type,
                Stage stage, Integer rowId, String name, String where) {
            Object raw;
            try {
                raw = ValueConverter.fromEvalEx(runner.run(text, values, evalTs));
            } catch (ExpressionFailure | IllegalArgumentException e) {
                violations.add(violation(stage, Code.EVALUATION_ERROR, rowId,
                        stage == Stage.ROW_SELECT ? name : null, where + " 식 '" + text + "' 평가 오류: " + e.getMessage()));
                return null;
            }
            try {
                return ValueConverter.toDeclared(raw, type);
            } catch (IllegalArgumentException e) {
                violations.add(violation(stage, Code.TYPE_CONVERSION, rowId, name, where + " " + e.getMessage()));
                return null;
            }
        }

        private Map<String, List<String>> priorityLists() {
            Map<String, List<String>> out = new LinkedHashMap<>();
            for (Slot s : slots) {
                RuleVar col = s.column() != null ? s.column() : s.columns.get(0);
                if (col.prioList() != null && !col.prioList().isEmpty()) {
                    out.put(s.name, col.prioList());
                }
            }
            return out;
        }

        private Map<String, Object> collect(List<Map<String, Object>> rowValues) {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Slot s : slots) {
                RuleVar col = s.column() != null ? s.column() : s.columns.get(0);
                List<Object> vals = new ArrayList<>();
                for (Map<String, Object> rv : rowValues) {
                    vals.add(rv.get(s.name));
                }
                Object value = null;
                try {
                    value = ResultAggregator.collect(col.collectAgg(), vals);
                } catch (IllegalArgumentException e) {
                    violations.add(violation(Stage.RESULT_EVAL, Code.EVALUATION_ERROR, null, s.name,
                            "COLLECT " + col.collectAgg() + " 집계 오류: " + e.getMessage()));
                }
                out.put(s.name, value);
            }
            return out;
        }

        private void anyConflicts(List<Map<String, Object>> rowValues) {
            for (Slot s : slots) {
                Object first = rowValues.get(0).get(s.name);
                for (int i = 1; i < rowValues.size(); i++) {
                    if (!ResultAggregator.sameValue(first, rowValues.get(i).get(s.name))) {
                        violations.add(violation(Stage.RESULT_EVAL, Code.ANY_CONFLICT, null, s.name,
                                "ANY 룰의 적중 행끼리 결과가 다르다: " + s.name));
                        break;
                    }
                }
            }
        }

        // -------------------------------------------------------------- DERIVE

        /** 첫 NORMAL 행 하나를 적중으로 삼아 결과 열 seq 순으로 평가한다(06:975). */
        RuleResult derive(List<RuleRow> normal) {
            if (normal.isEmpty()) {
                return result(List.of(), false, nullResults(), List.of());
            }
            RuleRow row = normal.get(0);
            List<RuleResult.RowTrace> trace = List.of(new RuleResult.RowTrace(row.rowId(), row.seq(), true, true, null));
            chooseGroups();
            throwIfViolated(trace);
            resultCheck(List.of(row));
            throwIfViolated(trace);
            Map<String, Object> results = evaluateRow(row, true);
            throwIfViolated(trace);
            return result(toHits(List.of(row)), false, results, trace);
        }

        // -------------------------------------------------------------- 조립

        private List<RuleResult.Hit> toHits(List<RuleRow> rows) {
            List<RuleResult.Hit> out = new ArrayList<>();
            for (RuleRow r : rows) {
                out.add(new RuleResult.Hit(r.rowId(), r.seq(), groupChoices));
            }
            return out;
        }

        private Map<String, Object> nullResults() {
            Map<String, Object> out = new LinkedHashMap<>();
            for (Slot s : slots) {
                out.put(s.name, null);
            }
            return out;
        }

        private RuleResult result(List<RuleResult.Hit> hits, boolean defaultApplied, Map<String, Object> results,
                List<RuleResult.RowTrace> trace) {
            return new RuleResult(ruleId, def.ver(), evalTs, List.copyOf(hits), defaultApplied,
                    Collections.unmodifiableMap(new LinkedHashMap<>(results)), List.copyOf(trace), List.copyOf(warnings));
        }

        private Violation violation(Stage stage, Code code, Integer rowId, String name, String message) {
            return new Violation(stage, code, ruleId, rowId, name, "rule " + ruleId + ": " + message);
        }

        private void throwIfViolated() {
            if (!violations.isEmpty()) {
                throw new EngineEvaluationException(violations);
            }
        }

        /**
         * 행을 고른 뒤의 오류 — 본 행 추적을 실어 던진다(룰 화면이 오류여도 적중·첫 거짓 칸을 칠한다).
         * 입력 검사 위반(키 없음·필수 NULL 등)이 섞여 있으면 입력이 틀린 판정이라 추적을 싣지 않는다.
         */
        private void throwIfViolated(List<RuleResult.RowTrace> trace) {
            if (violations.isEmpty()) {
                return;
            }
            boolean inputBroken = violations.stream().anyMatch(v -> v.stage() == Stage.SET_CHECK || v.stage() == Stage.INPUT_CHECK);
            throw inputBroken ? new EngineEvaluationException(violations) : new RuleEvaluationException(violations, trace);
        }
    }

    // ------------------------------------------------------------------ 정적 도우미

    /** {@code kind} 열을 seq(같으면 var_id) 순으로. */
    static List<RuleVar> columns(List<RuleVar> vars, VarKind kind) {
        List<RuleVar> out = new ArrayList<>();
        for (RuleVar v : nonNull(vars)) {
            if (v.varKind() == kind) {
                out.add(v);
            }
        }
        out.sort(Comparator.comparingInt(RuleVar::seq).thenComparingInt(RuleVar::varId));
        return out;
    }

    private static List<Slot> slots(List<RuleVar> resultColumns) {
        List<Slot> out = new ArrayList<>();
        Map<String, Slot> groups = new LinkedHashMap<>();
        for (RuleVar v : resultColumns) {
            if (v.resGrp() != null && !v.resGrp().isEmpty()) {
                Slot g = groups.get(v.resGrp());
                if (g == null) {
                    g = new Slot(v.resGrp(), true);
                    groups.put(v.resGrp(), g);
                    out.add(g);
                }
                g.columns.add(v);
            } else {
                Slot s = new Slot(v.varName(), false);
                s.columns.add(v);
                out.add(s);
            }
        }
        return out;
    }

    /** 결과 이름(그룹이면 res_grp, 아니면 var_name) — 결과 열 seq 순. 세트 입력 키 확인이 쓴다(design §6.13). */
    static List<String> resultNames(RuleDefinition def) {
        List<String> out = new ArrayList<>();
        for (Slot s : slots(columns(def.vars(), VarKind.RESULT))) {
            out.add(s.name);
        }
        return out;
    }

    private static <T> List<T> nonNull(List<T> list) {
        return list == null ? List.of() : list;
    }
}
