package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

/** TSK-08-02 design §3.1 「RuleAnalysisInputMapperTest」·§6.5 — 저장 형태 → 엔진 분석 입력. */
class RuleAnalysisInputMapperTest {

    static ResolvedVar var(int varId, String varKind, String disp, String varName, boolean exprVar, String dataType) {
        return new ResolvedVar(varId, varKind, disp, varId, varName, exprVar, "표시" + varId, dataType, 2, false, "CD", 7L, "도메인",
                "COLUMN", "설명");
    }

    @ParameterizedTest
    @CsvSource({"Equal, EQUAL", "1, ONE", "2, TWO", "Expression, EXPRESSION", "Value, VALUE"})
    void _06_표기_DISP_TYPE_을_엔진_enum_으로_바꾼다(String stored, DispType expected) {
        AnalysisRule rule = RuleAnalysisInputMapper.toAnalysisRule("R", "DECISION", "FIRST",
                List.of(var(1, "COND", stored, "A", false, "STRING")), List.of());
        assertEquals(expected, rule.vars().get(0).dispType());
    }

    @Test
    void 룰_칸과_변수_칸을_옮긴다() {
        ResolvedVar r = new ResolvedVar(3, "RESULT", "Value", 2, "OUT", false, "결과", "NUMBER", 1, true, "GRD", null, null, "DECLARED", null);
        AnalysisRule rule = RuleAnalysisInputMapper.toAnalysisRule("QLTY", "DERIVE", null, List.of(r), List.of());
        assertEquals("QLTY", rule.ruleId());
        assertEquals(RuleKind.DERIVE, rule.ruleKind());
        assertNull(rule.hitPolicy());
        assertEquals(new AnalysisVar(3, VarKind.RESULT, DispType.VALUE, 2, "OUT", false, DataType.NUMBER, 1, true, "GRD"), rule.vars().get(0));
        assertEquals(HitPolicy.UNIQUE,
                RuleAnalysisInputMapper.toAnalysisRule("QLTY", "DECISION", "UNIQUE", List.of(), List.of()).hitPolicy());
    }

    @Test
    void 식_변수는_varName_을_null_로_두고_exprVar_를_켠다() {
        AnalysisVar v = RuleAnalysisInputMapper.toAnalysisRule("R", "DECISION", "FIRST",
                List.of(var(1, "COND", "1", "COIL_THK * 2", true, "NUMBER")), List.of()).vars().get(0);
        assertNull(v.varName());
        assertTrue(v.exprVar());
    }

    @Test
    void Expression_조건_열은_varName_을_null_로_둔다() {
        AnalysisVar v = RuleAnalysisInputMapper.toAnalysisRule("R", "DECISION", "FIRST",
                List.of(var(2, "COND", "Expression", "무엇이든", false, "STRING")), List.of()).vars().get(0);
        assertNull(v.varName());
        assertEquals(DispType.EXPRESSION, v.dispType());
    }

    @Test
    void 셀_JSON_을_RuleCell_로_바꾸고_text_는_비운다() {
        StoredRow row = new StoredRow(4, 2, "NORMAL", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.60\",\"right\":\"2.5\"},"
                + "\"2\":{\"op\":\"IN\",\"list\":[\"A\",\"B\"]},\"3\":{\"expr\":\"A > 1\",\"ast\":{\"type\":\"OPERATOR\"}},\"4\":{\"val\":\"X\"}}");
        StoredRow def = new StoredRow(9, 0, "DEFAULT", "{\"4\":{\"val\":\"Z\"}}");
        AnalysisRule rule = RuleAnalysisInputMapper.toAnalysisRule("R", "DECISION", "FIRST", List.of(), List.of(row, def));
        RuleRow first = rule.rows().get(0);
        assertEquals(4, first.rowId());
        assertEquals(2, first.seq());
        assertEquals(RowKind.NORMAL, first.rowKind());
        assertEquals(new RuleCell("<= 변수 <", "1.60", "2.5", null, null, null, null, null), first.cells().get(1));
        assertEquals(new RuleCell("IN", null, null, List.of("A", "B"), null, null, null, null), first.cells().get(2));
        assertEquals(new RuleCell(null, null, null, null, "A > 1", Map.of("type", "OPERATOR"), null, null), first.cells().get(3));
        assertEquals(new RuleCell(null, null, null, null, null, null, "X", null), first.cells().get(4));
        assertEquals(RowKind.DEFAULT, rule.rows().get(1).rowKind());
    }
}
