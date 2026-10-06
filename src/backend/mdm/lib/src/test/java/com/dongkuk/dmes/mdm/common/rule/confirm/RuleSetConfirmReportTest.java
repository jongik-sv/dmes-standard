package com.dongkuk.dmes.mdm.common.rule.confirm;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Issue;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** 룰 세트 확정 보고서(순수) — 코드의 항목 배정, NO_RELEASED 버림, 심각도, itemKey, 미래 경계 경고(Ruling P2-14), 케이스 문구. */
class RuleSetConfirmReportTest {

    private static final VersionRef DRAFT = new VersionRef(VersionTarget.RULE_SET, "S", new BigDecimal("1.000"));
    private static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    private static final LocalDateTime AUG1 = LocalDateTime.of(2026, 8, 1, 0, 0, 0);
    private static final LocalDateTime SEP1 = LocalDateTime.of(2026, 9, 1, 0, 0, 0);

    private static RuleSetCheck check(String code, String severity, String ruleId, String nodeId, String edgeId) {
        return new RuleSetCheck(code, severity, ruleId, null, null, code + " 문구", nodeId, edgeId);
    }

    private static RuleSetConfirmReport.Report report(List<RuleSetCheck> checks, List<RuleSetConfirmReport.FutureChecks> future) {
        return RuleSetConfirmReport.report(DRAFT, checks, future, List.of(), JUL1, List.of(), null);
    }

    private static RuleSetConfirmReport.Item item(RuleSetConfirmReport.Report r, MdmRuleSetConfirmCheckItem which) {
        return r.items().stream().filter(i -> i.item() == which).findFirst().orElseThrow();
    }

    private static List<String> codes(RuleSetConfirmReport.Item item) {
        return item.issues().stream().map(i -> i.issue().code()).toList();
    }

    @Test
    void codesGoToOrderOrFlowStructureAndNoReleasedIsDropped() {
        RuleSetConfirmReport.Report r = report(List.of(
                check(RuleSetCheck.CYCLE, RuleSetCheck.REJECT, "R_A", "r1", null),
                check(RuleSetCheck.IF_SIBLING, RuleSetCheck.WARN, "R_B", "r2", null),
                check(RuleSetCheck.DUP_RESULT, RuleSetCheck.REJECT, "R_C", "r3", null),
                check(RuleSetCheck.RULE_NOT_FOUND, RuleSetCheck.REJECT, "R_X", "r4", null),
                check(RuleSetCheck.UNKNOWN_INPUT, RuleSetCheck.REJECT, "R_A", "r1", null),
                check(RuleSetCheck.NO_RELEASED, RuleSetCheck.REJECT, "R_N", "r5", null),
                check(RuleSetCheck.COND_UNTYPED, RuleSetCheck.WARN, null, null, "e3")), List.of());

        assertThat(r.items()).extracting(RuleSetConfirmReport.Item::item).containsExactly(MdmRuleSetConfirmCheckItem.values());
        assertThat(codes(item(r, MdmRuleSetConfirmCheckItem.ORDER))).containsExactly("CYCLE", "IF_SIBLING", "DUP_RESULT");
        assertThat(codes(item(r, MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE))).containsExactly("RULE_NOT_FOUND", "UNKNOWN_INPUT", "COND_UNTYPED");
        assertThat(item(r, MdmRuleSetConfirmCheckItem.RULES_RELEASED).issues()).isEmpty();   // NO_RELEASED 는 항목 2가 다시 본다
        assertThat(item(r, MdmRuleSetConfirmCheckItem.ORDER).issues()).extracting(i -> i.issue().field()).containsOnly("ORDER");
        assertThat(item(r, MdmRuleSetConfirmCheckItem.ORDER).status()).isEqualTo(ItemStatus.REJECTED);
    }

    @Test
    void rejectIsErrorAndWarnIsWarningInFlatten() {
        RuleSetConfirmReport.Report r = report(List.of(
                check(RuleSetCheck.ORDER, RuleSetCheck.REJECT, "R_A", "r1", null),
                check(RuleSetCheck.COND_UNTYPED, RuleSetCheck.WARN, null, null, "e3")), List.of());
        assertThat(item(r, MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE).status()).isEqualTo(ItemStatus.WARNED);
        ConfirmCheckResult flat = RuleSetConfirmReport.flatten(r);
        assertThat(flat.errors()).extracting(MdmCheckIssue::code).containsExactly("ORDER");
        assertThat(flat.warnings()).extracting(MdmCheckIssue::code).containsExactly("COND_UNTYPED");
    }

    @Test
    void itemKeyPrefersNodeThenEdgeThenRule() {
        RuleSetConfirmReport.Report r = report(List.of(
                check(RuleSetCheck.FLOW_STRUCTURE, RuleSetCheck.REJECT, "R_A", "n1", "e1"),
                check(RuleSetCheck.FLOW_COND, RuleSetCheck.REJECT, "R_A", null, "e2"),
                check(RuleSetCheck.RULE_DEPRECATED, RuleSetCheck.WARN, "R_A", null, null),
                check(RuleSetCheck.EMPTY, RuleSetCheck.REJECT, null, null, null)), List.of());
        assertThat(item(r, MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE).issues()).extracting(i -> i.issue().itemKey())
                .containsExactly("NODE:n1", "EDGE:e2", "RULE:R_A", null);
    }

    @Test
    void callerCodesUseSetItemKeyBeforeNodeAndEdge() {
        RuleSetConfirmReport.Report r = report(List.of(
                check(RuleSetCheck.CALLER_WARN, RuleSetCheck.WARN, "S", null, null),
                check(RuleSetCheck.CALLER_BROKEN, RuleSetCheck.REJECT, "P", "n9", null),
                check(RuleSetCheck.CALL_MISSING, RuleSetCheck.WARN, "OLD", "s1", null)), List.of());
        assertThat(item(r, MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE).issues()).extracting(i -> i.issue().itemKey())
                .containsExactly("SET:S", "SET:P", "NODE:s1");
    }

    @Test
    void futureBoundaryIssuesAreWarningsWithTimeAndCauseAndAreNotRepeated() {
        RuleSetCheck order = check(RuleSetCheck.ORDER, RuleSetCheck.REJECT, "R_X", "r1", null);
        RuleSetCheck dup = check(RuleSetCheck.DUP_RESULT, RuleSetCheck.REJECT, "R_Y", "r2", null);
        RuleSetConfirmReport.Report r = report(List.of(order), List.of(
                new RuleSetConfirmReport.FutureChecks(AUG1, List.of("R_Y v2.000"), List.of(order, dup,
                        check(RuleSetCheck.NO_RELEASED, RuleSetCheck.REJECT, "R_Z", "r3", null))),
                new RuleSetConfirmReport.FutureChecks(SEP1, List.of("R_X v3.000", "R_Z v2.000"), List.of(dup))));

        RuleSetConfirmReport.Item orderItem = item(r, MdmRuleSetConfirmCheckItem.ORDER);
        assertThat(orderItem.status()).isEqualTo(ItemStatus.REJECTED);                 // apply_from 시점 ORDER 는 그대로 ERROR
        assertThat(orderItem.issues()).extracting(Issue::severity).containsExactly("ERROR", "WARNING");
        Issue future = orderItem.issues().get(1);
        assertThat(future.issue().code()).isEqualTo("DUP_RESULT");
        assertThat(future.issue().message()).isEqualTo("2026-08-01 00:00:00 부터 R_Y v2.000 적용 시: DUP_RESULT 문구");
        assertThat(future.issue().itemKey()).isEqualTo("NODE:r2");
        assertThat(item(r, MdmRuleSetConfirmCheckItem.RULES_RELEASED).issues()).isEmpty();
        assertThat(RuleSetConfirmReport.flatten(r).warnings()).extracting(MdmCheckIssue::code).containsExactly("DUP_RESULT");
    }

    @Test
    void futureOnlyIssueWarnsTheItem() {
        RuleSetConfirmReport.Report r = report(List.of(), List.of(new RuleSetConfirmReport.FutureChecks(AUG1, List.of("R_X v2.000"),
                List.of(check(RuleSetCheck.ORDER, RuleSetCheck.REJECT, "R_X", "r1", null)))));
        assertThat(item(r, MdmRuleSetConfirmCheckItem.ORDER).status()).isEqualTo(ItemStatus.WARNED);
        assertThat(RuleSetConfirmReport.flatten(r).errors()).isEmpty();
    }

    @Test
    void failedCaseMessageShowsMismatchesOrErrors() {
        Map<String, Object> mismatch = new LinkedHashMap<>();
        mismatch.put("key", "OUT_A");
        mismatch.put("expected", "Z");
        mismatch.put("actual", "A");
        Map<String, Object> wrong = new LinkedHashMap<>();
        wrong.put("caseId", 1);
        wrong.put("caseName", "c1");
        wrong.put("outcome", "OK");
        wrong.put("pass", false);
        wrong.put("mismatches", List.of(mismatch));
        Map<String, Object> failed = new LinkedHashMap<>();
        failed.put("caseId", 2);
        failed.put("caseName", "c2");
        failed.put("outcome", "ERROR");
        failed.put("pass", false);
        failed.put("mismatches", List.of());
        failed.put("errors", List.of(Map.of("message", "일치하는 행이 없다")));
        Map<String, Object> runOnly = new LinkedHashMap<>();
        runOnly.put("caseId", 3);
        runOnly.put("pass", null);

        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), JUL1,
                List.of(wrong, failed, runOnly), null);
        assertThat(item(r, MdmRuleSetConfirmCheckItem.TEST_CASES).issues()).extracting(i -> i.issue().message())
                .containsExactly("케이스 1 c1: OUT_A Z → A", "케이스 2 c2: 일치하는 행이 없다");
        assertThat(r.cases()).isEqualTo(new RuleConfirmReport.CaseSummary(3, 2, 0, 2));
    }

    private static Map<String, Object> failedCase() {
        return new LinkedHashMap<>(Map.of("caseId", 1, "caseName", "c1", "pass", false,
                RuleSetConfirmReport.HAS_EXPECTED, true, "mismatches", List.of(), "errors", List.of()));
    }

    private static List<MdmCheckIssue> caseIssues(RuleSetConfirmReport.Report r) {
        return item(r, MdmRuleSetConfirmCheckItem.TEST_CASES).issues().stream().map(Issue::issue).toList();
    }

    @Test
    void 케이스_실패이고_작성자의_룰_DRAFT_가_있으면_실패_문구_뒤에_안내한다() {
        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), JUL1,
                List.of(failedCase()), null, List.of("R1", "R2"));
        MdmCheckIssue issue = caseIssues(r).get(0);
        assertThat(issue.code()).isEqualTo(RuleConfirmReport.CASE_FAILED);
        assertThat(issue.message()).endsWith(RuleSetConfirmReport.draftHint(List.of("R1", "R2")));
        assertThat(RuleSetConfirmReport.draftHint(List.of("R1", "R2")))
                .isEqualTo(" — 룰 R1·R2 에 확정하지 않은 DRAFT 가 있다. 확정 검사는 적용 중 버전으로 돌리므로, 그 DRAFT 로 시험해 통과했다면 룰 DRAFT 를 먼저 확정한다");
    }

    @Test
    void DRAFT_룰이_없으면_문구와_이슈_수가_그대로다() {
        RuleSetConfirmReport.Report before = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), JUL1, List.of(failedCase()), null);
        RuleSetConfirmReport.Report after = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), JUL1, List.of(failedCase()), null,
                List.of());
        assertThat(after).isEqualTo(before);
        assertThat(RuleSetConfirmReport.draftHint(List.of())).isEmpty();
    }

    @Test
    void 일괄_실행이_끝나지_못해도_안내한다() {
        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of(), JUL1, List.of(), "boom", List.of("R1"));
        MdmCheckIssue issue = caseIssues(r).get(0);
        assertThat(issue.code()).isEqualTo(RuleConfirmReport.CASE_RUN_FAILED);
        assertThat(issue.message()).endsWith(RuleSetConfirmReport.draftHint(List.of("R1")));
    }

    @Test
    void notReleasedRuleIsAnErrorWithApplyFrom() {
        RuleSetConfirmReport.Report r = RuleSetConfirmReport.report(DRAFT, List.of(), List.of(), List.of("R_B"), JUL1, List.of(), null);
        RuleSetConfirmReport.Item released = item(r, MdmRuleSetConfirmCheckItem.RULES_RELEASED);
        assertThat(released.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(released.issues().get(0).issue().message()).contains("2026-07-01 00:00:00");
        assertThat(released.issues().get(0).issue().itemKey()).isEqualTo("RULE:R_B");
    }
}
