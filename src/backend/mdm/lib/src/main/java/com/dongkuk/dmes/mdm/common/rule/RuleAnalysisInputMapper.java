package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.common.support.MdmStrings.str;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.AnalysisRule;
import kr.dongkuk.maru.mdm.engine.rule.AnalysisVar;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleCell;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleRow;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;

/**
 * 저장 형태(06 표기 {@code DISP_TYPE}, 셀 JSON 문자열, 서버가 해석한 변수 타입) → 엔진 분석 입력(TSK-08-02 design §6.5·§6.6.3).
 * 표 저장 응답·view 의 issues 와 분석 코퍼스 Java 러너가 모두 이 메서드를 지난다(I12). TS 짝은 m-mdm
 * {@code pages/dme/ruleEdit/decision-table/grid-model.ts} 의 {@code ruleDefFromStored} 다.
 */
public final class RuleAnalysisInputMapper {

    private RuleAnalysisInputMapper() {
    }

    /** 저장된 행 하나. {@code cells} 는 JSON 문자열 그대로다. */
    public record StoredRow(int rowId, int seq, String rowKind, String cells) {
    }

    public static AnalysisRule toAnalysisRule(String ruleId, String ruleKind, String hitPolicy, List<ResolvedVar> vars, List<StoredRow> rows) {
        List<AnalysisVar> out = new ArrayList<>(vars.size());
        for (ResolvedVar v : vars) {
            VarKind kind = VarKind.valueOf(v.varKind());
            DispType disp = dispType(v.dispType(), kind);
            // TS RuleVarDef 와 같다 — 식 변수·Expression 조건 열은 이름이 없다.
            String name = v.exprVar() || (kind == VarKind.COND && disp == DispType.EXPRESSION) ? null : v.varName();
            out.add(new AnalysisVar(v.varId(), kind, disp, v.seq(), name, v.exprVar(),
                    v.dataType() == null ? DataType.STRING : DataType.valueOf(v.dataType()), v.scale(), v.dateString(), v.maruCodeId()));
        }
        List<RuleRow> converted = new ArrayList<>(rows.size());
        for (StoredRow r : rows) {
            Map<Integer, RuleCell> cells = new LinkedHashMap<>();
            RuleCellsCodec.parse(r.cells()).forEach((varId, cell) -> cells.put(varId, cell(cell)));
            converted.add(new RuleRow(r.rowId(), r.seq(), RowKind.valueOf(r.rowKind()), cells));
        }
        return new AnalysisRule(ruleId, RuleKind.valueOf(ruleKind), hitPolicy == null ? null : HitPolicy.valueOf(hitPolicy), out, converted);
    }

    /** 06 표기 → 엔진 enum. 비어 있으면 조건 열은 1 타입, 결과 열은 상수로 본다. */
    static DispType dispType(String stored, VarKind kind) {
        if (stored == null) {
            return kind == VarKind.COND ? DispType.ONE : DispType.VALUE;
        }
        return switch (stored) {
            case "Equal" -> DispType.EQUAL;
            case "1" -> DispType.ONE;
            case "2" -> DispType.TWO;
            case "Expression" -> DispType.EXPRESSION;
            case "Value" -> DispType.VALUE;
            default -> throw new IllegalArgumentException("모르는 DISP_TYPE: " + stored);
        };
    }

    private static RuleCell cell(Map<String, Object> c) {
        return new RuleCell(str(c.get("op")), str(c.get("left")), str(c.get("right")),
                c.get("list") instanceof List<?> list ? list.stream().map(x -> x == null ? null : x.toString()).toList() : null,
                str(c.get("expr")), RuleCellsCodec.ast(c.get("ast")), str(c.get("val")), null);
    }
}
