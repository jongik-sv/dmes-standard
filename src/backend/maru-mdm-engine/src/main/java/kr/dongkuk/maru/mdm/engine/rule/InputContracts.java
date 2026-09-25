package kr.dongkuk.maru.mdm.engine.rule;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.function.Function;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarType;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 입력 계약 계산(06 「입력 계약」 06:202-230, TSK-08-04 design §2.1). m-mdm {@code src/evalex/input-contract.ts} 의
 * {@code computeInputContract}·{@code alwaysNames}, {@code null-safety.ts} 의 {@code nullSafety} 를 함수 경계·순회 순서 그대로
 * 옮겼다. 두 구현이 같은지는 한 벌 코퍼스({@code contract/input-contract-corpus.json})를 JUnit·Vitest 가 함께 읽어 확인한다(I28).
 *
 * <p>always = 조건 열 변수(seq 순) + 식 변수 참조 + Expression 조건 셀 참조 + 열 조건 참조, 룰 결과 변수 제외.
 * rows = NORMAL 행(seq 순) 뒤 DEFAULT 행. 행마다 결과 셀 AST 의 필수·선택 변수와 사람이 읽는 조건 요약(cond).
 * 셀·식 AST 는 {@code Map}(AstExporter 모양) 그대로 읽는다.
 */
public final class InputContracts {

    private static final Set<String> RANGE_OPS = Set.of("<= 변수 <=", "<= 변수 <", "< 변수 <=", "< 변수 <");
    private static final String DEFAULT_COND = "기본 행";

    private InputContracts() {}

    /** 라벨 없이 계산한다 — 식 변수 열의 cond 이름은 {@code _V<varId>}. {@code kind} 는 계산에 쓰지 않는다(TS 와 같은 경계). */
    public static InputContract compute(List<RuleVar> vars, List<RuleRow> rows, RuleKind kind,
            Function<String, VarType> resolveType) {
        return compute(vars, rows, kind, resolveType, Map.of());
    }

    /**
     * 입력 계약.
     *
     * @param resolveType 이름 → 타입. null 을 돌려주면 {@link IllegalArgumentException}
     * @param labels      var_id → 열 라벨(화면 {@code ResolvedVar.label}). cond 요약에서 이름 없는 열(식 변수)의 이름으로 쓴다
     */
    public static InputContract compute(List<RuleVar> vars, List<RuleRow> rows, RuleKind kind,
            Function<String, VarType> resolveType, Map<Integer, String> labels) {
        Function<String, VarType> type = name -> {
            VarType t = resolveType.apply(name);
            if (t == null) {
                throw new IllegalArgumentException("변수 " + name + " 의 타입을 알 수 없다");
            }
            return t;
        };
        Set<String> excluded = resultNames(vars);
        List<RuleVar> results = resultVars(vars);
        List<RowContract> out = new ArrayList<>();
        for (RuleRow r : normalRows(rows)) {
            out.add(rowContract(r.rowId(), cells(r), condText(vars, cells(r), labels), results, excluded, type));
        }
        Optional<RuleRow> dflt = defaultRow(rows);
        if (dflt.isPresent()) {
            out.add(rowContract(dflt.get().rowId(), cells(dflt.get()), DEFAULT_COND, results, excluded, type));
        }
        return new InputContract(alwaysNames(vars, rows).stream().map(type).toList(), out);
    }

    /** 입력 계약 always 의 변수 이름(첫 등장 순, 대문자로 견주고 처음 나온 표기를 싣는다). */
    public static List<String> alwaysNames(List<RuleVar> vars, List<RuleRow> rows) {
        Set<String> excluded = resultNames(vars);
        List<String> names = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        List<RuleRow> normal = normalRows(rows);
        for (RuleVar v : condVars(vars)) {
            if (isExpressionColumn(v)) {
                for (RuleRow r : normal) {
                    RuleCell cell = cells(r).get(v.varId());
                    if (cell != null && cell.ast() != null) {
                        for (String n : usedVariables(cell.ast())) {
                            pushUnique(names, seen, n, excluded);
                        }
                    }
                }
            } else if (isExprVar(v)) {
                for (String n : v.refVars() != null ? v.refVars() : usedVariables(v.exprAst())) {
                    pushUnique(names, seen, n, excluded);
                }
            } else if (truthy(v.varName())) {
                pushUnique(names, seen, v.varName(), excluded);
            }
        }
        for (RuleVar v : resultVars(vars)) {
            if (v.grpCondAst() != null) {
                for (String n : usedVariables(v.grpCondAst())) {
                    pushUnique(names, seen, n, excluded);
                }
            }
        }
        return names;
    }

    private static RowContract rowContract(int rowId, Map<Integer, RuleCell> cells, String cond, List<RuleVar> results,
            Set<String> excluded, Function<String, VarType> type) {
        List<String> order = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        Set<String> required = new HashSet<>();
        for (RuleVar v : results) {
            RuleCell cell = cells.get(v.varId());
            if (cell == null || cell.ast() == null) {
                continue;
            }
            NullSafety ns = nullSafety(cell.ast());
            List<String> all = new ArrayList<>(ns.required());
            all.addAll(ns.optional());
            for (String n : all) {
                if (excluded.contains(n) || seen.contains(n)) {
                    continue;
                }
                seen.add(n);
                order.add(n);
            }
            required.addAll(ns.required());
        }
        return new RowContract(
                rowId,
                cond,
                order.stream().filter(required::contains).map(type).toList(),
                order.stream().filter(n -> !required.contains(n)).map(type).toList());
    }

    // ------------------------------------------------------------------ 룰 모양(rule-model.ts)

    /** 룰 결과 변수 이름(결과 열 varName ∪ resGrp) — 대문자. */
    private static Set<String> resultNames(List<RuleVar> vars) {
        Set<String> out = new HashSet<>();
        for (RuleVar v : resultVars(vars)) {
            if (truthy(v.varName())) {
                out.add(upper(v.varName()));
            }
            if (truthy(v.resGrp())) {
                out.add(upper(v.resGrp()));
            }
        }
        return out;
    }

    private static void pushUnique(List<String> list, Set<String> seen, String name, Set<String> excluded) {
        String u = upper(name);
        if (seen.contains(u) || excluded.contains(u)) {
            return;
        }
        seen.add(u);
        list.add(name);
    }

    private static List<RuleVar> condVars(List<RuleVar> vars) {
        return byKind(vars, VarKind.COND);
    }

    private static List<RuleVar> resultVars(List<RuleVar> vars) {
        return byKind(vars, VarKind.RESULT);
    }

    /** seq 순(같으면 varId 순). */
    private static List<RuleVar> byKind(List<RuleVar> vars, VarKind kind) {
        return vars.stream()
                .filter(v -> v.varKind() == kind)
                .sorted(Comparator.comparingInt(RuleVar::seq).thenComparingInt(RuleVar::varId))
                .toList();
    }

    /** NORMAL 행 — seq 순(같으면 rowId 순). */
    private static List<RuleRow> normalRows(List<RuleRow> rows) {
        return rows.stream()
                .filter(r -> r.rowKind() == RowKind.NORMAL)
                .sorted(Comparator.comparingInt(RuleRow::seq).thenComparingInt(RuleRow::rowId))
                .toList();
    }

    /** 입력 순서에서 첫 DEFAULT 행. */
    private static Optional<RuleRow> defaultRow(List<RuleRow> rows) {
        return rows.stream().filter(r -> r.rowKind() == RowKind.DEFAULT).findFirst();
    }

    private static boolean isExprVar(RuleVar v) {
        return v.varName() == null && v.exprAst() != null;
    }

    private static boolean isExpressionColumn(RuleVar v) {
        return v.varKind() == VarKind.COND && v.dispType() == DispType.EXPRESSION;
    }

    private static Map<Integer, RuleCell> cells(RuleRow r) {
        return r.cells() == null ? Map.of() : r.cells();
    }

    // ------------------------------------------------------------------ cond 요약

    /** 열 표시 이름 = varName ?? label ?? {@code _V<varId>}. */
    private static String columnName(RuleVar v, Map<Integer, String> labels) {
        if (v.varName() != null) {
            return v.varName();
        }
        String label = labels.get(v.varId());
        return label != null ? label : ReservedNames.EXPR_VAR_PREFIX + v.varId();
    }

    /** 조건 셀 요약에 열 이름을 붙인다(06:226-229 의 {@code PROD_TYPE = COIL} 모양). */
    private static String namedSummary(RuleVar v, RuleCell cell, Map<Integer, String> labels) {
        String s = CellSummary.of(v, cell);
        if (cell.expr() != null) {
            return s;
        }
        String n = columnName(v, labels);
        if (cell.op() != null) {
            if (RANGE_OPS.contains(cell.op())) {
                return replaceFirst(s, "변수", n);
            }
            if ("EQ".equals(cell.op()) && v.dispType() == DispType.EQUAL) {
                return n + " = " + s;
            }
        }
        return n + " " + s;
    }

    private static String condText(List<RuleVar> vars, Map<Integer, RuleCell> cells, Map<Integer, String> labels) {
        List<String> parts = new ArrayList<>();
        for (RuleVar v : condVars(vars)) {
            RuleCell cell = cells.get(v.varId());
            if (cell == null || "NA".equals(cell.op())) {
                continue;
            }
            parts.add(namedSummary(v, cell, labels));
        }
        return parts.isEmpty() ? "-" : String.join(" · ", parts);
    }

    /** JS {@code String.replace(문자열, …)} — 첫 자리 하나만 바꾼다. */
    private static String replaceFirst(String s, String target, String replacement) {
        int i = s.indexOf(target);
        return i < 0 ? s : s.substring(0, i) + replacement + s.substring(i + target.length());
    }

    // ------------------------------------------------------------------ AST(interpreter.ts usedVariables)

    /** AST 가 쓰는 변수 이름 — 대문자, 전위 순회 첫 등장 순, 상수 제외. */
    public static List<String> usedVariables(Map<String, Object> ast) {
        Set<String> seen = new LinkedHashSet<>();
        walk(ast, seen);
        return new ArrayList<>(seen);
    }

    private static void walk(Map<String, Object> n, Set<String> seen) {
        if ("VARIABLE_OR_CONSTANT".equals(type(n))) {
            String u = upper(value(n));
            if (!ReservedNames.CONSTANTS.contains(u)) {
                seen.add(u);
            }
        } else {
            for (Map<String, Object> p : params(n)) {
                walk(p, seen);
            }
        }
    }

    // ------------------------------------------------------------------ NULL 안전(null-safety.ts)

    /** 필수·선택 변수(대문자·첫 등장 순·상수 제외, 필수 ∩ 선택 = ∅). */
    public record NullSafety(List<String> required, List<String> optional) {}

    // 문맥 Ctx 와 인자 문맥 ArgContext 는 TS 문자열 리터럴 그대로 둔다(expr·rule 패키지에 새 enum 을 두지 않는다 — EngineContractSchemaTest).
    private static final String FAIL = "FAIL";
    private static final String SAFE = "SAFE";
    private static final String ARG_FAIL = "fail";
    private static final String ARG_SAFE = "safe";
    private static final String ARG_INHERIT = "inherit";

    /** 함수 인자 i(전체 count 개)의 ArgContext. 06:208 "함수마다 인자가 NULL 을 받는지는 함수 화이트리스트에 함께 적는다". */
    @FunctionalInterface
    private interface NullPolicy {
        String arg(int i, int count);
    }

    private static final NullPolicy FAIL_ALL = (i, count) -> ARG_FAIL;

    /** m-mdm {@code functions.ts} 의 {@code nullPolicy} 표. 없는 함수는 fail. */
    private static final Map<String, NullPolicy> POLICIES = Map.of(
            "IF", args(ARG_SAFE, ARG_INHERIT, ARG_INHERIT),
            // SWITCH(v, m1, r1, m2, r2, …[, 기본값]) — 첫 인자와 비교 값은 SAFE, 결과·기본값은 바깥 문맥.
            "SWITCH", (i, count) -> {
                if (i == 0) {
                    return ARG_SAFE;
                }
                boolean isDefault = count % 2 == 0 && i == count - 1;
                return !isDefault && i % 2 == 1 ? ARG_SAFE : ARG_INHERIT;
            },
            "COALESCE", (i, count) -> i < count - 1 ? ARG_SAFE : ARG_INHERIT,
            "STR_CONTAINS", (i, count) -> ARG_SAFE,
            "INSTR", (i, count) -> ARG_INHERIT,
            "MASTER", args(ARG_SAFE, ARG_SAFE, ARG_SAFE, ARG_SAFE),
            "MASTER_AT", args(ARG_SAFE, ARG_SAFE, ARG_SAFE, ARG_SAFE, ARG_SAFE));

    private static final Set<String> EQ_INFIX = Set.of("==", "=", "!=", "<>");
    private static final Set<String> NE_OPS = Set.of("!=", "<>");
    private static final Set<String> EQ_OPS = Set.of("==", "=");

    private static NullPolicy args(String... list) {
        return (i, count) -> list[Math.min(i, list.length - 1)];
    }

    /** AST NULL 안전 분석. NULL 이 들어오면 식이 깨지는 자리의 변수는 필수, 그렇지 않은 자리에만 쓰인 변수는 선택. 애매하면 필수. */
    public static NullSafety nullSafety(Map<String, Object> ast) {
        List<String> seen = new ArrayList<>();
        Set<String> seenSet = new HashSet<>();
        Set<String> required = new HashSet<>();
        visit(ast, FAIL, Set.of(), seen, seenSet, required);
        return new NullSafety(
                seen.stream().filter(required::contains).toList(),
                seen.stream().filter(x -> !required.contains(x)).toList());
    }

    private static void visit(Map<String, Object> n, String ctx, Set<String> g, List<String> seen, Set<String> seenSet,
            Set<String> required) {
        List<Map<String, Object>> params = params(n);
        switch (type(n)) {
            case "VARIABLE_OR_CONSTANT" -> {
                String name = varName(n);
                if (name == null) {
                    return;
                }
                if (seenSet.add(name)) {
                    seen.add(name);
                }
                if (FAIL.equals(ctx) && !g.contains(name)) {
                    required.add(name);
                }
            }
            case "PREFIX_OPERATOR" -> visit(params.get(0), FAIL, g, seen, seenSet, required);
            case "INFIX_OPERATOR" -> {
                Map<String, Object> l = params.get(0);
                Map<String, Object> r = params.get(1);
                String op = value(n);
                if (EQ_INFIX.contains(op)) {
                    visit(l, SAFE, g, seen, seenSet, required);
                    visit(r, SAFE, g, seen, seenSet, required);
                } else if ("&&".equals(op)) {
                    visit(l, FAIL, g, seen, seenSet, required);
                    visit(r, FAIL, union(g, nonNullIfTrue(l)), seen, seenSet, required);
                } else if ("||".equals(op)) {
                    visit(l, FAIL, g, seen, seenSet, required);
                    visit(r, FAIL, union(g, nonNullIfFalse(l)), seen, seenSet, required);
                } else {
                    // 사칙연산·대소 비교(+ - * / % ^ < <= > >=)와 모르는 연산자 모두 양쪽 FAIL.
                    visit(l, FAIL, g, seen, seenSet, required);
                    visit(r, FAIL, g, seen, seenSet, required);
                }
            }
            case "FUNCTION" -> {
                String name = upper(value(n));
                NullPolicy policy = POLICIES.getOrDefault(name, FAIL_ALL);
                if ("IF".equals(name) && params.size() == 3) {
                    Map<String, Object> c = params.get(0);
                    visit(c, SAFE, g, seen, seenSet, required);
                    visit(params.get(1), ctx, union(g, nonNullIfTrue(c)), seen, seenSet, required);
                    visit(params.get(2), ctx, union(g, nonNullIfFalse(c)), seen, seenSet, required);
                    return;
                }
                for (int i = 0; i < params.size(); i++) {
                    visit(params.get(i), ctxOf(policy.arg(i, params.size()), ctx), g, seen, seenSet, required);
                }
            }
            default -> {
                // NUMBER_LITERAL·STRING_LITERAL
            }
        }
    }

    private static String ctxOf(String a, String parent) {
        return switch (a) {
            case ARG_INHERIT -> parent;
            case ARG_FAIL -> FAIL;
            default -> SAFE;
        };
    }

    private static boolean isNullConst(Map<String, Object> n) {
        return "VARIABLE_OR_CONSTANT".equals(type(n)) && "NULL".equals(upper(value(n)));
    }

    private static @Nullable String varName(Map<String, Object> n) {
        if (!"VARIABLE_OR_CONSTANT".equals(type(n))) {
            return null;
        }
        String u = upper(value(n));
        return ReservedNames.CONSTANTS.contains(u) ? null : u;
    }

    /** {@code X op NULL}·{@code NULL op X} 의 X. */
    private static @Nullable String nullCompared(Map<String, Object> n, Set<String> ops) {
        if (!"INFIX_OPERATOR".equals(type(n)) || !ops.contains(value(n))) {
            return null;
        }
        List<Map<String, Object>> p = params(n);
        if (isNullConst(p.get(1))) {
            return varName(p.get(0));
        }
        if (isNullConst(p.get(0))) {
            return varName(p.get(1));
        }
        return null;
    }

    /** 조건이 참이면 NULL 이 아님이 보장되는 변수. */
    private static Set<String> nonNullIfTrue(Map<String, Object> c) {
        String x = nullCompared(c, NE_OPS);
        if (x != null) {
            return Set.of(x);
        }
        if ("INFIX_OPERATOR".equals(type(c)) && "&&".equals(value(c))) {
            return union(nonNullIfTrue(params(c).get(0)), nonNullIfTrue(params(c).get(1)));
        }
        return Set.of();
    }

    /** 조건이 거짓이면 NULL 이 아님이 보장되는 변수. */
    private static Set<String> nonNullIfFalse(Map<String, Object> c) {
        String x = nullCompared(c, EQ_OPS);
        if (x != null) {
            return Set.of(x);
        }
        if ("INFIX_OPERATOR".equals(type(c)) && "||".equals(value(c))) {
            return union(nonNullIfFalse(params(c).get(0)), nonNullIfFalse(params(c).get(1)));
        }
        return Set.of();
    }

    private static Set<String> union(Set<String> g, Set<String> extra) {
        if (extra.isEmpty()) {
            return g;
        }
        Set<String> out = new HashSet<>(g);
        out.addAll(extra);
        return out;
    }

    // ------------------------------------------------------------------ AST Map 읽기

    private static String type(Map<String, Object> n) {
        return String.valueOf(n.get("type"));
    }

    private static String value(Map<String, Object> n) {
        Object v = n.get("value");
        return v == null ? "" : v.toString();
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> params(Map<String, Object> n) {
        Object p = n.get("params");
        return p instanceof List<?> list ? (List<Map<String, Object>>) list : List.of();
    }

    private static String upper(String s) {
        return s.toUpperCase(Locale.ROOT);
    }

    private static boolean truthy(@Nullable String s) {
        return s != null && !s.isEmpty();
    }
}
