package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCellRules.Problem;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCellRules.Result;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.function.Predicate;
import java.util.stream.Collectors;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.FunctionSets.Slot;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;

/**
 * Expression 조건 셀·결과 식 셀 검사(TSK-08-04 design §2.2, I11·I12, 06 「저장 시 검사」 Expression·범위 자리·산출 룰 순서).
 *
 * <ol>
 *   <li>길이 상한({@link RuleLimits#MAX_EXPR_CHARS})</li>
 *   <li>{@code ExpressionChecker.check} — 파싱(EXPR_PARSE), 표준 칸용 함수·예약 변수·MASTER 인자·STR_MATCHES 정규식(EXPR_PROBLEM)</li>
 *   <li>서버 AST 로 셀의 {@code ast} 를 덮어쓴다(화면이 보낸 AST 는 믿지 않는다)</li>
 *   <li>참조 변수 ⊆ 외부 이름(컬럼 사전 ∪ 다른 룰의 최신 RELEASED 결과) ∪ 이 룰의 조건 변수 ∪ (DERIVE 결과 식) 앞 seq 결과 변수.
 *       DERIVE 결과 식이 자기·뒤 seq 결과를 읽으면 EXPR_DERIVE_ORDER</li>
 *   <li>(조건 식만) 같은 변수를 {@code < <= > >=} 로 두 번 이상 견주면 RANGE_IN_EXPR — 2 타입 열로 보낸다</li>
 * </ol>
 * 이 룰의 조건·결과 이름은 대소문자를 가리지 않는다. 외부 이름 판정은 원장을 읽으므로 호출자가 {@link Scope#external()} 로 넘기고, 식에 적은
 * 표기 그대로 묻는다(컬럼 사전 조회는 대소문자를 가린다 — 08-03 {@code typeSourceOf} 와 같다).
 */
public final class RuleExpressionChecks {

    private static final Set<String> ORDER_OPS = Set.of("<", "<=", ">", ">=");

    /**
     * 룰 하나의 이름 범위.
     *
     * @param condNames   이 룰의 조건 변수 이름(대문자, 식 변수·Expression 열 제외)
     * @param resultNames 이 룰의 결과 변수 이름(대문자, seq 순)
     * @param external    컬럼 사전 또는 다른 룰 결과 변수인가(원래 표기로 묻는다)
     */
    public record Scope(Set<String> condNames, List<String> resultNames, boolean derive, Predicate<String> external) {
    }

    private final ExpressionChecker checker;
    private final MdmEvaluator evaluator;

    public RuleExpressionChecks(ExpressionChecker checker, MdmEvaluator evaluator) {
        this.checker = Objects.requireNonNull(checker, "checker");
        this.evaluator = Objects.requireNonNull(evaluator, "evaluator");
    }

    public static Scope scope(List<ResolvedVar> vars, String ruleKind, Predicate<String> external) {
        Set<String> cond = vars.stream()
                .filter(v -> "COND".equals(v.varKind()) && !v.exprVar() && !"Expression".equals(v.dispType()) && v.varName() != null)
                .map(v -> upper(v.varName())).collect(Collectors.toUnmodifiableSet());
        List<String> results = vars.stream().filter(v -> "RESULT".equals(v.varKind()) && v.varName() != null)
                .sorted(Comparator.comparingInt(ResolvedVar::seq)).map(v -> upper(v.varName())).toList();
        return new Scope(cond, results, "DERIVE".equals(ruleKind), external);
    }

    /** Expression 조건 셀({@code expr} 이 있다). */
    public Result condition(Scope scope, Map<String, Object> cell) {
        return check(scope, null, cell, Slot.RULE_COND_EXPR);
    }

    /** 결과 식 셀({@code expr} 이 있다). */
    public Result result(Scope scope, ResolvedVar var, Map<String, Object> cell) {
        return check(scope, var, cell, Slot.RULE_RESULT_EXPR);
    }

    private Result check(Scope scope, ResolvedVar resultVar, Map<String, Object> cell, Slot slot) {
        Map<String, Object> out = new LinkedHashMap<>(cell);
        List<Problem> problems = new ArrayList<>();
        String text = String.valueOf(cell.get("expr"));
        if (text.length() > RuleLimits.MAX_EXPR_CHARS) {
            problems.add(new Problem(RuleSaveIssueCode.LIMIT_EXCEEDED, "식이 " + RuleLimits.MAX_EXPR_CHARS + "자를 넘는다"));
            return new Result(out, problems);
        }
        for (ExpressionChecker.Problem p : checker.check(text, slot)) {
            if (ExpressionChecker.PARSE.equals(p.kind())) {
                problems.add(new Problem(RuleSaveIssueCode.EXPR_PARSE, "식을 파싱할 수 없다: " + p.detail()));
                return new Result(out, problems);
            }
            problems.add(new Problem(RuleSaveIssueCode.EXPR_PROBLEM, p.kind() + ": " + p.detail()));
        }
        Map<String, Object> ast;
        try {
            ast = AstExporter.export(text, evaluator.configuration());
        } catch (ParseException e) {
            problems.add(new Problem(RuleSaveIssueCode.EXPR_PARSE, "식을 파싱할 수 없다: " + e.getMessage()));
            return new Result(out, problems);
        }
        out.put("ast", ast);
        int self = resultVar == null ? -1 : scope.resultNames().indexOf(upper(resultVar.varName()));
        for (String name : evaluator.usedVariables(text)) {
            String u = upper(name);
            if (u.startsWith(ReservedNames.RESERVED_PREFIX) || ReservedNames.EVAL_TS.equals(u)) {
                continue; // 예약 이름은 ExpressionChecker 가 이미 RESERVED 로 알린다.
            }
            if (resultVar == null ? scope.condNames().contains(u) : scope.condNames().contains(u) || derivePrior(scope, self, u)) {
                continue;
            }
            if (resultVar != null && scope.derive() && scope.resultNames().indexOf(u) >= Math.max(self, 0)) {
                problems.add(new Problem(RuleSaveIssueCode.EXPR_DERIVE_ORDER, "산출 룰 결과 식은 자기 자신·뒤 순서의 결과 변수를 읽지 못한다: " + name));
                continue;
            }
            if (!scope.external().test(name)) {
                problems.add(new Problem(RuleSaveIssueCode.EXPR_UNKNOWN_VAR, "컬럼 사전·앞 룰 결과·이 룰의 조건 변수에 없는 변수: " + name));
            }
        }
        if (resultVar == null) {
            List<String> repeated = repeatedOrderComparisons(ast);
            if (!repeated.isEmpty()) {
                problems.add(new Problem(RuleSaveIssueCode.RANGE_IN_EXPR,
                        "같은 변수를 대소 비교로 두 번 이상 견준다(2 타입 열로 보낸다): " + String.join(", ", repeated)));
            }
        }
        return new Result(out, problems);
    }

    private static boolean derivePrior(Scope scope, int self, String name) {
        int at = scope.resultNames().indexOf(name);
        return scope.derive() && at >= 0 && self >= 0 && at < self;
    }

    /** 대소 비교 노드의 바로 아래 피연산자가 변수인 횟수를 변수마다 세어 둘 이상인 이름(대문자, 정렬). */
    private static List<String> repeatedOrderComparisons(Map<String, Object> ast) {
        Map<String, Integer> counts = new TreeMap<>();
        count(ast, counts);
        return counts.entrySet().stream().filter(e -> e.getValue() >= 2).map(Map.Entry::getKey).toList();
    }

    private static void count(Map<String, Object> node, Map<String, Integer> counts) {
        List<Map<String, Object>> params = params(node);
        if ("INFIX_OPERATOR".equals(node.get("type")) && ORDER_OPS.contains(String.valueOf(node.get("value")))) {
            for (Map<String, Object> p : params) {
                if ("VARIABLE_OR_CONSTANT".equals(p.get("type"))) {
                    String u = upper(String.valueOf(p.get("value")));
                    if (!ReservedNames.CONSTANTS.contains(u)) {
                        counts.merge(u, 1, Integer::sum);
                    }
                }
            }
        }
        params.forEach(p -> count(p, counts));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> params(Map<String, Object> node) {
        return node.get("params") instanceof List<?> l ? (List<Map<String, Object>>) l : List.of();
    }

    private static String upper(String name) {
        return name.toUpperCase(Locale.ROOT);
    }
}
