package kr.dongkuk.maru.mdm.engine.rule;

import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleVar;
import kr.dongkuk.maru.mdm.engine.spi.Nullable;

/**
 * 셀 요약 문자열(06-business-rule.md:315·490, TSK-03-03 design §6.12). 값은 저장 문자열 그대로 쓴다(정규화·따옴표·이스케이프
 * 해석 없음). null 값 칸은 빈 문자열로 본다.
 */
public final class CellSummary {

    private CellSummary() {}

    /** 셀 요약. {@code var} 가 null 이면 셀 모양만으로 만든다. */
    public static String of(@Nullable RuleVar var, RuleCell cell) {
        String op = cell.op();
        if (op == null) {
            if (cell.val() != null) {
                return cell.val();
            }
            return s(cell.expr());
        }
        String l = s(cell.left());
        switch (op) {
            case "NA":
                return "-";
            case "EQ":
                return var != null && var.dispType() == DispType.EQUAL ? l : "= " + l;
            case "NE":
                return "<> " + l;
            case "LT":
                return "< " + l;
            case "LE":
                return "<= " + l;
            case "GT":
                return "> " + l;
            case "GE":
                return ">= " + l;
            case "IN":
                return "IN (" + join(cell.list()) + ")";
            case "NOT_IN":
                return "NOT IN (" + join(cell.list()) + ")";
            case "CODE_IN":
                return "IN 카테고리 " + l;
            case "CONTAINS":
                return "CONTAINS " + l;
            case "INSTR":
                return "INSTR " + l;
            case "IS_NULL":
                return "IS NULL";
            case "NOT_NULL":
                return "IS NOT NULL";
            case "<= 변수 <=":
            case "<= 변수 <":
            case "< 변수 <=":
            case "< 변수 <":
                return l + " " + op + " " + s(cell.right());
            default:
                return op;
        }
    }

    private static String s(String value) {
        return value == null ? "" : value;
    }

    private static String join(List<String> list) {
        return list == null ? "" : String.join(", ", list);
    }
}
