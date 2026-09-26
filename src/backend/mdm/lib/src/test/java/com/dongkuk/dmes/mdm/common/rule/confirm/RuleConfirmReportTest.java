package com.dongkuk.dmes.mdm.common.rule.confirm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.CaseSummary;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Item;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Report;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.Test;

/**
 * TSK-08-05 design §3.1 「RuleConfirmReportTest」 — 확정 검사 4행 보고서(순수). 저장 시 검사 이슈 맵·변수 수·행 수·케이스 결과·생산자 표를 손으로
 * 만들어 넘긴다(I1~I4·I7·I8·I10).
 */
class RuleConfirmReportTest {

    private static final VersionRef DRAFT = new VersionRef(VersionTarget.BUSINESS_RULE, "R1", BigDecimal.valueOf(2));

    private static Map<String, Object> saveIssue(String code, String severity, List<Integer> rowIds, Integer varId, String message) {
        return RuleCheckReport.issue(code, severity, rowIds, varId, message);
    }

    private static Map<String, Object> caseResult(int caseId, String name, String outcome, Boolean pass, List<Map<String, Object>> mismatches,
                                                  List<Map<String, Object>> errors) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("caseId", caseId);
        m.put("caseName", name);
        m.put("outcome", outcome);
        m.put("pass", pass);
        m.put("mismatches", mismatches);
        m.put("errors", errors);
        return m;
    }

    private static Map<String, Object> mismatch(String key, Object expected, Object actual) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("key", key);
        m.put("expected", expected);
        m.put("actual", actual);
        return m;
    }

    private static Report clean() {
        return RuleConfirmReport.report(DRAFT, List.of(), 2, 3, List.of(), List.of());
    }

    private static Item item(Report r, MdmRuleConfirmCheckItem which) {
        return r.items().stream().filter(i -> i.item() == which).findFirst().orElseThrow();
    }

    private static List<String> codes(List<MdmCheckIssue> issues) {
        return issues.stream().map(MdmCheckIssue::code).toList();
    }

    private static List<String> itemCodes(Item item) {
        return item.issues().stream().map(i -> i.issue().code()).toList();
    }

    @Test
    void CR1_보고서는_계약_enum_순서대로_4행() {
        Report r = clean();

        assertEquals(Arrays.asList(MdmRuleConfirmCheckItem.values()), r.items().stream().map(Item::item).toList());
        assertEquals(4, r.items().size());
        assertEquals(DRAFT, r.draft());
        r.items().forEach(i -> assertEquals(ItemStatus.PASSED, i.status(), i.toString()));
    }

    @Test
    void CR2_항목_상태는_이슈_심각도로만_정한다() {
        Report warnOnly = RuleConfirmReport.report(DRAFT, List.of(saveIssue("GAP", "WARNING", List.of(), null, "빈틈")), 2, 3, List.of(), List.of());
        assertEquals(ItemStatus.WARNED, item(warnOnly, MdmRuleConfirmCheckItem.SAVE_CHECKS).status());

        Report mixed = RuleConfirmReport.report(DRAFT, List.of(saveIssue("GAP", "WARNING", List.of(), null, "빈틈"),
                saveIssue("CELL_RANGE_REVERSED", "ERROR", List.of(1), 2, "경계 역순")), 2, 3, List.of(), List.of());
        assertEquals(ItemStatus.REJECTED, item(mixed, MdmRuleConfirmCheckItem.SAVE_CHECKS).status());
        assertEquals(ItemStatus.PASSED, item(mixed, MdmRuleConfirmCheckItem.NOT_EMPTY).status(), "다른 항목에 번지지 않는다");

        assertEquals(ItemStatus.PASSED, item(clean(), MdmRuleConfirmCheckItem.SAVE_CHECKS).status());
    }

    @Test
    void CR3_flatten_은_이슈_심각도로_errors_warnings_를_나눈다() {
        Report r = RuleConfirmReport.report(DRAFT, List.of(
                        saveIssue("GAP", "WARNING", List.of(), null, "빈틈"),
                        saveIssue("CELL_RANGE_REVERSED", "ERROR", List.of(1), 2, "경계 역순"),
                        saveIssue("CONTRACT_CHANGED", "WARNING", List.of(), null, "계약")),
                0, 3, List.of(caseResult(7, "틀림", "OK", false, List.of(mismatch("G", "A", "B")), null)), List.of());

        ConfirmCheckResult flat = RuleConfirmReport.flatten(r);

        assertEquals(List.of("CELL_RANGE_REVERSED", RuleConfirmReport.NO_VARS, RuleConfirmReport.CASE_FAILED), codes(flat.errors()));
        assertEquals(List.of("GAP", "CONTRACT_CHANGED"), codes(flat.warnings()), "REJECTED 항목 안의 WARNING 도 warnings 로 간다");
        assertEquals(List.of("SAVE_CHECKS", "NOT_EMPTY", "TEST_CASES"), flat.errors().stream().map(MdmCheckIssue::field).toList());
    }

    @Test
    void CR4_이슈_모양은_field_항목이름_code_세부코드_itemKey_표형식() {
        Report r = RuleConfirmReport.report(DRAFT, List.of(
                        saveIssue("CELL_RANGE_REVERSED", "ERROR", List.of(16, 15), 2, "경계 역순"),
                        saveIssue("UNKNOWN_VAR", "ERROR", List.of(), 2, "변수"),
                        saveIssue("OVERLAP", "ERROR", List.of(3), null, "겹침"),
                        saveIssue("GAP", "WARNING", List.of(), null, "빈틈")),
                2, 3, List.of(caseResult(3, "c", "OK", false, List.of(mismatch("G", "A", "B")), null)),
                RuleConfirmReport.resultVarIssues(new LinkedHashSet<>(List.of("FOO")), Set.of(), n -> false, Map.of("FOO", Set.of("B")), Set.of()));

        List<MdmCheckIssue> save = item(r, MdmRuleConfirmCheckItem.SAVE_CHECKS).issues().stream().map(RuleConfirmReport.Issue::issue).toList();
        assertEquals(new MdmCheckIssue("CELL_RANGE_REVERSED", "경계 역순", "SAVE_CHECKS", "ROW:15,16;VAR:2"), save.get(0));
        assertEquals("VAR:2", save.get(1).itemKey());
        assertEquals("ROW:3", save.get(2).itemKey());
        assertNull(save.get(3).itemKey());

        MdmCheckIssue c = item(r, MdmRuleConfirmCheckItem.TEST_CASES).issues().get(0).issue();
        assertEquals("CASE:3", c.itemKey());
        assertEquals("TEST_CASES", c.field());
        assertEquals(RuleConfirmReport.CASE_FAILED, c.code());

        MdmCheckIssue p = item(r, MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED).issues().get(0).issue();
        assertEquals("NAME:FOO", p.itemKey());
        assertEquals("RESULT_VAR_RELEASED", p.field());
        assertEquals(RuleConfirmReport.PRODUCER_NOT_RELEASED, p.code());

        assertEquals("ROW:15,16;VAR:2", RuleConfirmReport.itemKey(List.of(16, 15), 2));
        assertNull(RuleConfirmReport.itemKey(List.of(), null));
    }

    @Test
    void CR5_NOT_EMPTY_는_변수_0개_행_0개를_각각_ERROR_로_본다() {
        Item both = item(RuleConfirmReport.report(DRAFT, List.of(), 0, 0, List.of(), List.of()), MdmRuleConfirmCheckItem.NOT_EMPTY);
        assertEquals(ItemStatus.REJECTED, both.status());
        assertEquals(List.of(RuleConfirmReport.NO_VARS, RuleConfirmReport.NO_ROWS), itemCodes(both));
        both.issues().forEach(i -> assertEquals("ERROR", i.severity()));
        both.issues().forEach(i -> assertNull(i.issue().itemKey()));

        assertEquals(List.of(RuleConfirmReport.NO_ROWS),
                itemCodes(item(RuleConfirmReport.report(DRAFT, List.of(), 1, 0, List.of(), List.of()), MdmRuleConfirmCheckItem.NOT_EMPTY)));
        assertEquals(List.of(RuleConfirmReport.NO_VARS),
                itemCodes(item(RuleConfirmReport.report(DRAFT, List.of(), 0, 1, List.of(), List.of()), MdmRuleConfirmCheckItem.NOT_EMPTY)));
        assertEquals(ItemStatus.PASSED,
                item(RuleConfirmReport.report(DRAFT, List.of(), 1, 1, List.of(), List.of()), MdmRuleConfirmCheckItem.NOT_EMPTY).status(),
                "행 하나(DEFAULT 뿐이어도)면 통과");
    }

    @Test
    void CR6_TEST_CASES_는_pass_false_만_거부하고_기대값_없는_케이스는_보지_않는다() {
        List<Map<String, Object>> cases = List.of(
                caseResult(1, "맞음", "OK", true, List.of(), null),
                caseResult(2, "돌려 보기만", "OK", null, List.of(), null),
                caseResult(3, "틀림", "OK", false, List.of(mismatch("QLTY_GRD", "B", "A"), mismatch("hit", 2, 1)), null),
                caseResult(4, "판정 오류", "ERROR", false, List.of(),
                        List.of(Map.of("code", "MISSING_INPUT", "message", "COIL_WID 입력이 없다"))));

        Report r = RuleConfirmReport.report(DRAFT, List.of(), 2, 3, cases, List.of());
        Item t = item(r, MdmRuleConfirmCheckItem.TEST_CASES);

        assertEquals(ItemStatus.REJECTED, t.status());
        assertEquals(List.of("CASE:3", "CASE:4"), t.issues().stream().map(i -> i.issue().itemKey()).toList());
        t.issues().forEach(i -> assertEquals("ERROR", i.severity()));
        String m3 = t.issues().get(0).issue().message();
        assertTrue(m3.startsWith("케이스 3 틀림: "), m3);
        assertTrue(m3.contains("QLTY_GRD B → A") && m3.contains("hit 2 → 1"), m3);
        assertTrue(t.issues().get(1).issue().message().contains("COIL_WID 입력이 없다"), t.issues().get(1).issue().message());
        assertEquals(new CaseSummary(4, 3, 1, 2), r.cases());

        assertEquals(ItemStatus.PASSED, item(RuleConfirmReport.report(DRAFT, List.of(), 2, 3, List.of(), List.of()),
                MdmRuleConfirmCheckItem.TEST_CASES).status(), "케이스 0건");
        assertEquals(ItemStatus.PASSED, item(RuleConfirmReport.report(DRAFT, List.of(), 2, 3, cases.subList(0, 2), List.of()),
                MdmRuleConfirmCheckItem.TEST_CASES).status(), "기대값 있는 케이스가 모두 통과");
    }

    @Test
    void CR6_값_테스트를_끝내지_못하면_CASE_RUN_FAILED_로_거부하고_4행을_돌려준다() {
        Report r = RuleConfirmReport.report(DRAFT, List.of(), 2, 3, List.of(), "정의 조립 실패", List.of());

        assertEquals(4, r.items().size());
        Item t = item(r, MdmRuleConfirmCheckItem.TEST_CASES);
        assertEquals(ItemStatus.REJECTED, t.status());
        MdmCheckIssue issue = t.issues().get(0).issue();
        assertEquals(RuleConfirmReport.CASE_RUN_FAILED, issue.code());
        assertNull(issue.itemKey());
        assertEquals("값 테스트를 끝내지 못했다: 정의 조립 실패", issue.message());
    }

    @Test
    void CR7_결과_변수_참조는_생산_룰이_있는데_RELEASED_가_하나도_없을_때만_거부() {
        Set<String> reads = new LinkedHashSet<>(List.of("COIL_THK", "FOO_GRD", "PROG_VAR", "OWN_RES", "BAR_GRD", "DUO"));
        Set<String> produces = Set.of("OWN_RES");
        Map<String, Set<String>> producers = new LinkedHashMap<>();
        producers.put("FOO_GRD", Set.of("B", "A"));
        producers.put("OWN_RES", Set.of("Z"));
        producers.put("COIL_THK", Set.of("Y"));
        producers.put("BAR_GRD", Set.of("C"));
        producers.put("DUO", Set.of("D1", "D2"));
        List<String> asked = new ArrayList<>();

        List<MdmCheckIssue> issues = RuleConfirmReport.resultVarIssues(reads, produces, n -> {
            asked.add(n);
            return "COIL_THK".equals(n);
        }, producers, Set.of("C", "D2"));

        assertEquals(1, issues.size(), issues.toString());
        MdmCheckIssue foo = issues.get(0);
        assertEquals(RuleConfirmReport.PRODUCER_NOT_RELEASED, foo.code());
        assertEquals("NAME:FOO_GRD", foo.itemKey());
        assertEquals("RESULT_VAR_RELEASED", foo.field());
        assertEquals("조건 변수 FOO_GRD 을(를) 만드는 룰 A, B 에 RELEASED 버전이 없습니다", foo.message());
        assertTrue(!asked.contains("PROG_VAR") && !asked.contains("OWN_RES"), "생산 룰 없는 이름·자기 결과는 컬럼 사전을 묻지 않는다: " + asked);

        Report r = RuleConfirmReport.report(DRAFT, List.of(), 2, 3, List.of(), issues);
        assertEquals(ItemStatus.REJECTED, item(r, MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED).status());
        assertEquals(ItemStatus.PASSED, item(clean(), MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED).status());

        MdmCheckIssue failed = RuleConfirmReport.producerCheckFailed("db down");
        assertEquals(RuleConfirmReport.PRODUCER_CHECK_FAILED, failed.code());
        assertEquals("결과 변수 참조 검사를 끝내지 못했다: db down", failed.message());
        assertNull(failed.itemKey());
    }
}
