package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.expr.ReservedNames;
import kr.dongkuk.maru.mdm.engine.rule.CellTextGenerator;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;

/**
 * 생성해 보기(TSK-08-04 design §2.2, I13, 06 「저장 시 검사」 생성해 보기). NA 가 아닌 op-code 조건 셀과 결과 Value 셀마다 엔진 생성기
 * ({@code CellTextGenerator.conditionText}/{@code resultText})로 텍스트를 만들어 {@code MdmEvaluator.compile} 로 파싱해 보고, String
 * {@code =} 값은 {@code patternRegex} 결과를 {@code Pattern.compile} 로 따로 컴파일한다. 만든 텍스트는 버린다.
 *
 * <p>셀마다 따로 부른다({@code withTexts} 는 첫 실패에서 멈춘다, design §7.2). <b>정규화한 셀</b>을 넣어야 한다 — 한쪽 빈 구간을 그대로
 * 넣으면 생성기가 거부한다(§7.1). Expression 셀은 {@link RuleExpressionChecks} 몫이라 건너뛴다.
 */
public final class RuleGenerateTry {

    private RuleGenerateTry() {
    }

    /** 실패면 GENERATE_FAILED ERROR 이슈 하나. */
    public static Optional<Map<String, Object>> cell(int rowId, ResolvedVar var, Map<String, Object> cell, MdmEvaluator evaluator) {
        String op = str(cell.get("op"));
        boolean cond = "COND".equals(var.varKind());
        if (cond ? op == null || op.equals("NA") : cell.get("val") == null) {
            return Optional.empty();
        }
        DataType dataType = var.dataType() == null ? DataType.STRING : DataType.valueOf(var.dataType());
        RuleCell rc = toRuleCell(cell);
        try {
            if (cond) {
                String subject = var.exprVar() ? ReservedNames.EXPR_VAR_PREFIX + var.varId() : var.varName();
                evaluator.compile(CellTextGenerator.conditionText(rc, subject, dataType, var.maruCodeId()));
                if (op.equals("EQ") && dataType == DataType.STRING && rc.left() != null) {
                    CellTextGenerator.patternRegex(rc.left()).ifPresent(Pattern::compile);
                }
            } else {
                evaluator.compile(CellTextGenerator.resultText(rc, dataType));
            }
            return Optional.empty();
        } catch (RuntimeException e) {
            return Optional.of(RuleCheckReport.cellIssue(RuleSaveIssueCode.GENERATE_FAILED, RuleCheckReport.ERROR, rowId, var,
                    "식을 만들 수 없다: " + e.getMessage()));
        }
    }

    private static RuleCell toRuleCell(Map<String, Object> c) {
        return new RuleCell(str(c.get("op")), str(c.get("left")), str(c.get("right")),
                c.get("list") instanceof List<?> list ? list.stream().map(x -> x == null ? null : x.toString()).toList() : null,
                str(c.get("expr")), RuleCellsCodec.ast(c.get("ast")), str(c.get("val")), null);
    }
}
