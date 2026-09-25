package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.EVALUATOR;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cell;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.code;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cond;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.expr;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.exprColumn;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.list;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.na;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.op;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.range;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.result;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.val;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;

/** TSK-08-04 design §3.1 「RuleGenerateTryTest」 — I13. */
class RuleGenerateTryTest {

    private static final ResolvedVar NUM2 = cond(1, "2", "COIL_THK", "NUMBER");
    private static final ResolvedVar STR1 = cond(2, "1", "SURF_GRD", "STRING");

    private static Optional<Map<String, Object>> run(ResolvedVar var, Map<String, Object> c) {
        return RuleGenerateTry.cell(7, var, c, EVALUATOR);
    }

    @Test
    void 정상_셀은_이슈가_없다() {
        assertEquals(Optional.empty(), run(NUM2, op("GE", "2.5")));
        assertEquals(Optional.empty(), run(NUM2, range("<= 변수 <", "1.6", "2.5")));
        assertEquals(Optional.empty(), run(STR1, list("IN", "A", "B")));
        assertEquals(Optional.empty(), run(STR1, op("EQ", "SGC_%")));
        assertEquals(Optional.empty(), run(STR1, op("EQ", "A\"B\\\\C")));
        assertEquals(Optional.empty(), run(code(3, "1", "STL_GRD", "STL_GRD_CD"), op("CODE_IN", "PLATING")));
        assertEquals(Optional.empty(), run(result(4, 1, "Value", "PRC_FCT", "NUMBER"), val("-1.05")));
    }

    @Test
    void 생성에_실패한_셀은_GENERATE_FAILED_이슈에_행과_열을_싣는다() {
        Map<String, Object> issue = run(NUM2, op("GE", "abc")).orElseThrow();
        assertEquals("GENERATE_FAILED", issue.get("code"));
        assertEquals("ERROR", issue.get("severity"));
        assertEquals(List.of(7), issue.get("rowIds"));
        assertEquals(1, issue.get("varId"));
        assertTrue(((String) issue.get("message")).startsWith("행 7·COIL_THK: "), (String) issue.get("message"));
    }

    @Test
    void 정규화하지_않은_한쪽_빈_구간은_생성기가_거부한다() {
        assertTrue(run(NUM2, range("<= 변수 <", "2.5", "")).isPresent() || run(NUM2, cell("op", "<= 변수 <", "left", "2.5")).isPresent());
        assertTrue(run(NUM2, cell("op", "<= 변수 <", "left", "2.5")).isPresent());
    }

    @Test
    void 생성기가_막는_값은_셀_단위로_거부한다() {
        assertTrue(run(code(3, "1", "STL_GRD", null), op("CODE_IN", "PLATING")).isPresent(), "마루 코드 없음");
        assertTrue(run(STR1, op("EQ", "A\\")).isPresent(), "홀로 선 백슬래시");
        assertTrue(run(STR1, op("NE", "A\u0001")).isPresent(), "제어문자");
        assertTrue(run(cond(5, "1", "1ABC", "NUMBER"), op("GT", "1")).isPresent(), "식별자 아님");
        assertTrue(run(result(4, 1, "Value", "OK_YN", "BOOLEAN"), val("maybe")).isPresent());
    }

    @Test
    void NA_와_식_셀은_생성하지_않는다() {
        assertEquals(Optional.empty(), run(NUM2, na()));
        assertEquals(Optional.empty(), run(exprColumn(6, "식"), expr("THIS IS NOT (")));
        assertEquals(Optional.empty(), run(result(4, 1, "Expression", "PRC_FCT", "NUMBER"), expr("1 +")));
    }
}
