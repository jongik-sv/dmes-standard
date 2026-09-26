package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleIssueMaps;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import com.dongkuk.dmes.mdm.common.rule.check.RuleExpressionChecks.Scope;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.function.Function;
import java.util.function.Predicate;
import kr.dongkuk.maru.mdm.engine.expr.ExpressionChecker;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Component;

/**
 * 룰 저장 시 검사의 유일한 진입점(TSK-08-04 design §1·§2.2·§6.1). TABLE 저장·COLUMNS 적용·값 테스트 BODY·08-05 상신(STORED)이 같은
 * 검사기를 부른다. 원장에 쓰지 않는다.
 *
 * <p>순서(모양은 호출자가 이미 확인했다):
 * <ol>
 *   <li>셀 — {@link RuleCellRules}(정규화) · {@link RuleExpressionChecks}(식 셀, 서버 AST) → 문제가 없는 셀만 {@link RuleGenerateTry}</li>
 *   <li>{@link RuleCompleteness}</li>
 *   <li>분석기({@code RuleAnalyzer}, 정규화한 행으로) — 앞 단계에 ERROR 가 없을 때만. 예외는 ANALYSIS_FAILED ERROR(§7.12)</li>
 *   <li>{@link RuleSaveCheck} 빈 — {@code targets()} 에 적용 지점이 든 것만, 앞 단계에 ERROR 가 없을 때만</li>
 * </ol>
 * 적용 지점별로 도는 단계는 §6.1 표를 따른다: COLUMNS 는 1-3 을 돌리지 않고(열 추가가 가능해야 한다, I18), TEST_BODY 는 1 만 돌려
 * 깨진 행을 {@link RuleCheckReport#brokenRowIds()} 로 모은다.
 */
@Component
public class RuleSaveValidator {

    private final RuleExpressionChecks expressions;
    private final MdmEvaluator evaluator;
    private final RuleVarTypeResolver resolver;
    private final ObjectProvider<RuleSaveCheck> checks;

    public RuleSaveValidator(ExpressionChecker checker, MdmEvaluator evaluator, RuleVarTypeResolver resolver, ObjectProvider<RuleSaveCheck> checks) {
        this.expressions = new RuleExpressionChecks(checker, evaluator);
        this.evaluator = evaluator;
        this.resolver = resolver;
        this.checks = checks;
    }

    public RuleCheckReport validate(RuleCheckInput in) {
        RuleSaveTarget target = in.target();
        List<Map<String, Object>> issues = new ArrayList<>();
        List<DraftRow> rows = in.rows();
        if (target != RuleSaveTarget.COLUMNS) {
            rows = cells(in, issues);
        }
        List<RuleIssue> analysis = List.of();
        if (target == RuleSaveTarget.TABLE || target == RuleSaveTarget.STORED) {
            issues.addAll(RuleCompleteness.check(in.vars(), rows));
            if (noErrors(issues)) {
                analysis = analyze(in, rows, issues);
            }
        }
        if (noErrors(issues)) {
            RuleSaveContext context = new RuleSaveContext(in.ruleId(), in.ver(), in.ruleKind(), in.hitPolicy(), in.rawVars(), in.vars(),
                    stored(rows), analysis, target);
            checks.orderedStream().filter(c -> c.targets().contains(target)).forEach(c -> issues.addAll(c.check(context)));
        }
        return new RuleCheckReport(List.copyOf(rows), List.copyOf(issues));
    }

    /** 셀 정규화·식·생성해 보기. 셀 키가 변수에 없으면(모양 검사를 거치지 않은 입력) 그대로 둔다. */
    private List<DraftRow> cells(RuleCheckInput in, List<Map<String, Object>> issues) {
        Map<Integer, ResolvedVar> byId = new LinkedHashMap<>();
        in.vars().forEach(v -> byId.put(v.varId(), v));
        Scope scope = RuleExpressionChecks.scope(in.vars(), in.ruleKind(), externalNames(in));
        List<DraftRow> out = new ArrayList<>(in.rows().size());
        for (DraftRow row : in.rows()) {
            Map<Integer, Map<String, Object>> cells = new LinkedHashMap<>();
            for (Map.Entry<Integer, Map<String, Object>> e : row.cells().entrySet()) {
                ResolvedVar var = byId.get(e.getKey());
                if (var == null) {
                    cells.put(e.getKey(), e.getValue());
                    continue;
                }
                RuleCellRules.Result r = cell(scope, var, e.getValue());
                r.problems().forEach(p -> issues.add(RuleCheckReport.cellIssue(p.code(), RuleCheckReport.ERROR, row.rowId(), var, p.message())));
                if (r.ok()) {
                    RuleGenerateTry.cell(row.rowId(), var, r.cell(), evaluator).ifPresent(issues::add);
                }
                cells.put(e.getKey(), r.cell());
            }
            out.add(new DraftRow(row.rowId(), row.seq(), row.rowKind(), cells));
        }
        return out;
    }

    private RuleCellRules.Result cell(Scope scope, ResolvedVar var, Map<String, Object> cell) {
        boolean cond = "COND".equals(var.varKind());
        RuleCellRules.Result r = cond ? RuleCellRules.condition(var, cell) : RuleCellRules.result(var, cell);
        boolean exprCell = RuleExpressionChecks.exprCell(var.varKind(), var.dispType(), cell);
        if (!r.ok() || !exprCell) {
            return r;
        }
        return cond ? expressions.condition(scope, r.cell()) : expressions.result(scope, var, r.cell());
    }

    private List<RuleIssue> analyze(RuleCheckInput in, List<DraftRow> rows, List<Map<String, Object>> issues) {
        try {
            List<RuleIssue> analysis = RuleAnalyzer.analyze(
                    RuleAnalysisInputMapper.toAnalysisRule(in.ruleId(), in.ruleKind(), in.hitPolicy(), in.vars(), stored(rows)));
            issues.addAll(RuleIssueMaps.of(analysis));
            return analysis;
        } catch (RuntimeException e) {
            issues.add(RuleCheckReport.issue(RuleSaveIssueCode.ANALYSIS_FAILED.name(), RuleCheckReport.ERROR, List.of(), null,
                    "겹침·빈틈 분석을 끝내지 못했다: " + e.getMessage()));
            return List.of();
        }
    }

    /** 컬럼 사전 또는 다른 룰의 최신 RELEASED 결과 변수인가 — 해석기에 이름 하나짜리 변수를 물어 본다(08-03 {@code typeSourceOf} 와 같다). */
    private Predicate<String> externalNames(RuleCheckInput in) {
        Map<String, Boolean> cache = new HashMap<>();
        Function<String, Boolean> lookup = name -> {
            MdmRuleVar probe = new MdmRuleVar(in.ruleId(), in.ver(), 0, "COND", 1);
            probe.setDispType("Equal");
            probe.setVarName(name);
            String source = Optional.ofNullable(resolver.resolve(in.ruleId(), in.ver(), List.of(probe)))
                    .filter(l -> !l.isEmpty()).map(l -> l.get(0).typeSource()).orElse(null);
            return RuleVarTypeResolver.COLUMN.equals(source) || RuleVarTypeResolver.RULE_RESULT.equals(source);
        };
        return name -> cache.computeIfAbsent(name, lookup);
    }

    private static List<StoredRow> stored(List<DraftRow> rows) {
        return rows.stream().map(r -> new StoredRow(r.rowId(), r.seq(), r.rowKind(), RuleCellsCodec.write(r.cells()))).toList();
    }

    private static boolean noErrors(List<Map<String, Object>> issues) {
        return issues.stream().noneMatch(RuleCheckReport::isError);
    }
}
