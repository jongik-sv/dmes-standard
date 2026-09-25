package com.dongkuk.dmes.mdm.common.rule.check;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckInput.DraftRow;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 미완성 검사(TSK-08-04 design §2.2, I4, 06 「저장 시 검사」 미완성). NORMAL 행 × 조건 열에 셀 키가 없으면 INCOMPLETE_COND, 어느 행이든
 * (기본 행 포함) 결과 열 셀 키가 없으면 INCOMPLETE_RESULT. 무관은 {@code {"op":"NA"}} 셀로 명시하므로 완성이다. 둘 다 ERROR 다.
 */
public final class RuleCompleteness {

    private RuleCompleteness() {
    }

    public static List<Map<String, Object>> check(List<ResolvedVar> vars, List<DraftRow> rows) {
        List<Map<String, Object>> out = new ArrayList<>();
        for (DraftRow row : rows) {
            boolean normal = "NORMAL".equals(row.rowKind());
            for (ResolvedVar v : vars) {
                if (row.cells().containsKey(v.varId())) {
                    continue;
                }
                if (normal && "COND".equals(v.varKind())) {
                    out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.INCOMPLETE_COND, RuleCheckReport.ERROR, row.rowId(), v,
                            "조건 셀이 없다(무관이면 - 로 둔다)"));
                } else if ("RESULT".equals(v.varKind())) {
                    out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.INCOMPLETE_RESULT, RuleCheckReport.ERROR, row.rowId(), v,
                            "결과 셀이 없다"));
                }
            }
        }
        return out;
    }
}
