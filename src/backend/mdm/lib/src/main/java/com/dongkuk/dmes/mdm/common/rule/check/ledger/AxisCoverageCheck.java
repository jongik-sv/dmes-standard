package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.check.AxisCoverage;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import java.util.List;
import java.util.Map;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 축 조합 완전성(06:344) — TABLE·STORED 에서 {@link AxisCoverage} 를 부른다. COLUMNS 는 08-03 자리({@code RuleColumnsService})에서 그대로 경고한다. */
@Component
@Order(7)
public class AxisCoverageCheck implements RuleSaveCheck {

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        Integer rowVar = null;
        Integer colVar = null;
        for (MdmRuleVar v : ctx.rawVars()) {
            if (!"COND".equals(v.getVarKind())) {
                continue;
            }
            if ("ROW".equals(v.getAxis()) && rowVar == null) {
                rowVar = v.getVarId();
            }
            if ("COL".equals(v.getAxis()) && colVar == null) {
                colVar = v.getVarId();
            }
        }
        List<Map<Integer, Map<String, Object>>> normal = ctx.rows().stream().filter(r -> "NORMAL".equals(r.rowKind()))
                .map(r -> RuleCellsCodec.parse(r.cells())).toList();
        return AxisCoverage.gap(ctx.hitPolicy(), rowVar, colVar, normal)
                .map(message -> List.of(RuleCheckReport.issue(AxisCoverage.CODE, RuleCheckReport.WARNING, List.of(), null, message)))
                .orElse(List.of());
    }
}
