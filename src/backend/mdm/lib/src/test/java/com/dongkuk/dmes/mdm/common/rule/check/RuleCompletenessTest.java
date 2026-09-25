package com.dongkuk.dmes.mdm.common.rule.check;

import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.at;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.cond;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.issueCodes;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.na;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.op;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.result;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.row;
import static com.dongkuk.dmes.mdm.common.rule.check.CheckFixtures.val;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** TSK-08-04 design §3.1 「RuleCompletenessTest」 — I4. */
class RuleCompletenessTest {

    private static final List<ResolvedVar> VARS = List.of(cond(1, "1", "COIL_THK", "NUMBER"), cond(2, "1", "COIL_WID", "NUMBER"),
            result(3, 1, "Value", "QLTY_GRD", "STRING"));

    @Test
    void 완성된_표는_이슈가_없고_무관_셀은_완성이다() {
        assertEquals(List.of(), RuleCompleteness.check(VARS, List.of(
                row(1, 1, "NORMAL", at(1, op("GE", "1")), at(2, na()), at(3, val("A"))),
                row(2, 0, "DEFAULT", at(3, val("C"))))));
    }

    @Test
    void NORMAL_행의_조건_셀이_없으면_거부한다() {
        List<Map<String, Object>> issues = RuleCompleteness.check(VARS, List.of(row(-1, 1, "NORMAL", at(1, op("GE", "1")), at(3, val("A")))));
        assertEquals(List.of("INCOMPLETE_COND"), issueCodes(issues));
        Map<String, Object> issue = issues.get(0);
        assertEquals("ERROR", issue.get("severity"));
        assertEquals(List.of(-1), issue.get("rowIds"));
        assertEquals(2, issue.get("varId"));
        assertEquals(true, ((String) issue.get("message")).startsWith("새 행 -1·COIL_WID"), (String) issue.get("message"));
    }

    @Test
    void 결과_셀이_없으면_기본_행도_거부한다() {
        List<Map<String, Object>> issues = RuleCompleteness.check(VARS, List.of(
                row(1, 1, "NORMAL", at(1, na()), at(2, na())),
                row(2, 0, "DEFAULT")));
        assertEquals(List.of("INCOMPLETE_RESULT", "INCOMPLETE_RESULT"), issueCodes(issues));
        assertEquals(List.of(1), issues.get(0).get("rowIds"));
        assertEquals(List.of(2), issues.get(1).get("rowIds"));
        assertEquals(3, issues.get(1).get("varId"));
    }

    @Test
    void 기본_행에는_조건_셀을_요구하지_않는다() {
        assertEquals(List.of(), RuleCompleteness.check(VARS, List.of(row(2, 0, "DEFAULT", at(3, val("C"))))));
    }
}
