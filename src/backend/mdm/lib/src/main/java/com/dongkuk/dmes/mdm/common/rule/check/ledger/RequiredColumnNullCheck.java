package com.dongkuk.dmes.mdm.common.rule.check.ledger;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveIssueCode;
import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/** 필수 컬럼(06:340) — 컬럼 사전의 필수 컬럼({@code MdmColumn.required})에 {@code IS_NULL}·{@code NOT_NULL} 셀을 쓰면 경고한다. 이상 데이터를 잡는 행일 수 있어 거부하지 않는다(I16). */
@Component
@Order(6)
public class RequiredColumnNullCheck implements RuleSaveCheck {

    private final MdmColumnRepository columns;

    public RequiredColumnNullCheck(MdmColumnRepository columns) {
        this.columns = columns;
    }

    @Override
    public List<Map<String, Object>> check(RuleSaveContext ctx) {
        List<Map<String, Object>> out = new ArrayList<>();
        Map<String, Boolean> required = new HashMap<>();
        for (LedgerCells.Cell c : LedgerCells.cells(ctx)) {
            ResolvedVar var = c.var();
            String op = c.op();
            if (!"IS_NULL".equals(op) && !"NOT_NULL".equals(op)) {
                continue;
            }
            if (!"COND".equals(var.varKind()) || var.exprVar() || !RuleVarTypeResolver.COLUMN.equals(var.typeSource()) || var.varName() == null) {
                continue;
            }
            if (required.computeIfAbsent(var.varName(), n -> columns.findByPhysName(n).map(MdmColumn::isRequired).orElse(false))) {
                out.add(RuleCheckReport.cellIssue(RuleSaveIssueCode.REQUIRED_NULL_CHECK, RuleCheckReport.WARNING, c.row().rowId(), var,
                        "필수 컬럼 " + var.varName() + " 에 " + op + " 을(를) 쓴다 — 이상 데이터를 잡는 행인지 확인한다"));
            }
        }
        return out;
    }
}
