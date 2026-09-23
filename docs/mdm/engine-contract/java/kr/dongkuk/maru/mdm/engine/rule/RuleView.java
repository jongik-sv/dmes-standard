package kr.dongkuk.maru.mdm.engine.rule;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DataType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.DispType;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.HitPolicy;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.InputContract;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RowKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.VarKind;

/**
 * 정의 조회 결과(06-business-rule.md:486-497). 고르지 않은 부분은 null 이다
 * (TEXT 를 안 고르면 summary·text 가 null, AST 를 안 고르면 ast 가 null, CONTRACT 를 안 고르면 contract 가 null).
 */
public record RuleView(
        String ruleId,
        int ver,
        RuleKind ruleKind,
        HitPolicy hitPolicy,
        LocalDateTime applyFrom,
        LocalDateTime applyTo,
        List<ColumnView> columns,
        List<RowView> rows,
        InputContract contract) {

    public record ColumnView(
            int varId,
            VarKind varKind,
            DispType dispType,
            String varName,
            DataType dataType,
            Integer scale,
            String domainId,
            int seq,
            String exprText,
            Map<String, Object> exprAst) {}

    public record RowView(int rowId, int seq, RowKind rowKind, Map<Integer, CellView> cells) {}

    /**
     * @param summary 셀 요약({@code 1.6 <= 변수 < 2.5}, {@code COIL}, {@code -}) — 모듈이 구조에서 만든다(06:490)
     * @param text    op-code 셀은 생성 텍스트, Expression 셀·결과 식은 원문, 결과 Value 셀은 리터럴
     */
    public record CellView(String summary, String text, Map<String, Object> ast) {}
}
