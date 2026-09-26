package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.function.Predicate;
import java.util.stream.Collectors;

/**
 * 룰 버전 확정 검사 4행 보고서(TSK-08-05 design §6.3) — 순수(Spring·DB 없음). 항목은 {@link MdmRuleConfirmCheckItem} 순서 그대로 넷이다(I1).
 * 항목 상태는 그 항목 이슈의 심각도로만 정한다 — ERROR 하나라도 있으면 REJECTED, 아니면 WARNING 이 있으면 WARNED, 아니면 PASSED(I2).
 * {@link #flatten} 은 항목 상태가 아니라 이슈 심각도로 errors·warnings 를 나눈다(I3). 이슈의 {@code field} 는 항목 {@code name()},
 * {@code code} 는 세부 코드다(I4 — 06-05 처럼 code 에 항목 이름을 넣지 않는다).
 */
public final class RuleConfirmReport {

    public static final String NO_VARS = "NO_VARS";
    public static final String NO_ROWS = "NO_ROWS";
    public static final String CASE_FAILED = "CASE_FAILED";
    public static final String CASE_RUN_FAILED = "CASE_RUN_FAILED";
    public static final String PRODUCER_NOT_RELEASED = "PRODUCER_NOT_RELEASED";
    public static final String PRODUCER_CHECK_FAILED = "PRODUCER_CHECK_FAILED";

    private static final String ERROR = RuleCheckReport.ERROR;
    private static final String WARNING = RuleCheckReport.WARNING;

    public enum ItemStatus { PASSED, WARNED, REJECTED }

    /** @param severity ERROR 또는 WARNING */
    public record Issue(String severity, MdmCheckIssue issue) {
    }

    public record Item(MdmRuleConfirmCheckItem item, ItemStatus status, List<Issue> issues) {
    }

    /** 테스트 케이스 건수 — 전체·기대값 있음·통과·실패(판정 오류 포함). */
    public record CaseSummary(int total, int withExpected, int passed, int failed) {
    }

    public record Report(VersionRef draft, List<Item> items, CaseSummary cases) {
    }

    private RuleConfirmReport() {
    }

    public static Report report(VersionRef draft, List<Map<String, Object>> saveIssues, int varCount, int rowCount,
                                List<Map<String, Object>> caseResults, List<MdmCheckIssue> resultVarIssues) {
        return report(draft, saveIssues, varCount, rowCount, caseResults, null, resultVarIssues);
    }

    /**
     * @param saveIssues      {@code RuleSaveValidator.validate(…, STORED).issues()} 전부(I5)
     * @param caseResults     {@code RuleCaseJudge.runCase} 결과 맵들
     * @param caseRunFailure  값 테스트 실행이 런타임 예외로 끝났으면 그 message, 아니면 null(§6.1 — CASE_RUN_FAILED)
     * @param resultVarIssues {@link #resultVarIssues} 결과 또는 {@link #producerCheckFailed}
     */
    public static Report report(VersionRef draft, List<Map<String, Object>> saveIssues, int varCount, int rowCount,
                                List<Map<String, Object>> caseResults, String caseRunFailure, List<MdmCheckIssue> resultVarIssues) {
        Map<MdmRuleConfirmCheckItem, List<Issue>> issues = new EnumMap<>(MdmRuleConfirmCheckItem.class);
        for (MdmRuleConfirmCheckItem item : MdmRuleConfirmCheckItem.values()) {
            issues.put(item, new ArrayList<>());
        }

        MdmRuleConfirmCheckItem save = MdmRuleConfirmCheckItem.SAVE_CHECKS;
        for (Map<String, Object> m : saveIssues) {
            issues.get(save).add(new Issue(String.valueOf(m.get("severity")), new MdmCheckIssue(String.valueOf(m.get("code")),
                    String.valueOf(m.get("message")), save.name(), itemKey(rowIds(m), m.get("varId") instanceof Integer id ? id : null))));
        }

        MdmRuleConfirmCheckItem notEmpty = MdmRuleConfirmCheckItem.NOT_EMPTY;
        if (varCount == 0) {
            issues.get(notEmpty).add(error(NO_VARS, "변수가 하나 이상이어야 합니다", notEmpty, null));
        }
        if (rowCount == 0) {
            issues.get(notEmpty).add(error(NO_ROWS, "행이 하나 이상이어야 합니다", notEmpty, null));
        }

        MdmRuleConfirmCheckItem tests = MdmRuleConfirmCheckItem.TEST_CASES;
        int withExpected = 0;
        int passed = 0;
        int failed = 0;
        for (Map<String, Object> c : caseResults) {
            Object pass = c.get("pass");
            if (pass == null) {
                continue;
            }
            withExpected++;
            if (Boolean.TRUE.equals(pass)) {
                passed++;
                continue;
            }
            failed++;
            issues.get(tests).add(error(CASE_FAILED, "케이스 " + c.get("caseId") + " " + c.get("caseName") + ": " + caseDetail(c), tests,
                    "CASE:" + c.get("caseId")));
        }
        if (caseRunFailure != null) {
            issues.get(tests).add(error(CASE_RUN_FAILED, "값 테스트를 끝내지 못했다: " + caseRunFailure, tests, null));
        }

        for (MdmCheckIssue issue : resultVarIssues) {
            issues.get(MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED).add(new Issue(ERROR, issue));
        }

        List<Item> items = new ArrayList<>(issues.size());
        for (MdmRuleConfirmCheckItem item : MdmRuleConfirmCheckItem.values()) {
            List<Issue> list = List.copyOf(issues.get(item));
            items.add(new Item(item, status(list), list));
        }
        return new Report(draft, List.copyOf(items), new CaseSummary(caseResults.size(), withExpected, passed, failed));
    }

    /** SPI {@code check()} — 모든 항목의 ERROR 이슈는 errors, WARNING 이슈는 warnings(항목 순서, 항목 안에서는 원래 순서, I3). */
    public static ConfirmCheckResult flatten(Report report) {
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (Item item : report.items()) {
            for (Issue issue : item.issues()) {
                if (ERROR.equals(issue.severity())) {
                    errors.add(issue.issue());
                } else if (WARNING.equals(issue.severity())) {
                    warnings.add(issue.issue());
                }
            }
        }
        return new ConfirmCheckResult(List.copyOf(errors), List.copyOf(warnings));
    }

    /**
     * 결과 변수 참조(I10, D7) — 읽는 이름 가운데 이 룰이 만드는 이름·컬럼 사전 이름을 뺀 것마다, 그 이름을 만드는 다른 룰이 있고 그 가운데 RELEASED
     * 버전이 있는 룰이 하나도 없으면 ERROR. 생산 룰이 없는 이름(프로그램 변수)은 보지 않는다. 컬럼 사전은 생산 룰이 있는 이름만 묻는다.
     *
     * @param producersByName 이름 → 그 이름을 RESULT 변수(VAR_NAME·RES_GRP)로 만드는 다른 룰 ID(모든 버전)
     * @param releasedRuleIds RELEASED 버전이 있는 룰 ID
     */
    public static List<MdmCheckIssue> resultVarIssues(Set<String> reads, Set<String> produces, Predicate<String> isColumn,
                                                      Map<String, Set<String>> producersByName, Set<String> releasedRuleIds) {
        List<MdmCheckIssue> out = new ArrayList<>();
        for (String name : reads) {
            if (produces.contains(name)) {
                continue;
            }
            Set<String> producers = producersByName.get(name);
            if (producers == null || producers.isEmpty() || isColumn.test(name)) {
                continue;
            }
            if (producers.stream().noneMatch(releasedRuleIds::contains)) {
                out.add(new MdmCheckIssue(PRODUCER_NOT_RELEASED, "조건 변수 " + name + " 을(를) 만드는 룰 " + String.join(", ", new TreeSet<>(producers))
                        + " 에 RELEASED 버전이 없습니다", MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED.name(), "NAME:" + name));
            }
        }
        return out;
    }

    /** 결과 변수 참조 검사 중 런타임 예외(§6.1). */
    public static MdmCheckIssue producerCheckFailed(String message) {
        return new MdmCheckIssue(PRODUCER_CHECK_FAILED, "결과 변수 참조 검사를 끝내지 못했다: " + message,
                MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED.name(), null);
    }

    /** {@code ROW:15,16;VAR:2}·{@code ROW:15}·{@code VAR:2}, 둘 다 없으면 null(§6.3). row_id 는 오름차순. */
    static String itemKey(List<Integer> rowIds, Integer varId) {
        List<String> parts = new ArrayList<>(2);
        if (rowIds != null && !rowIds.isEmpty()) {
            parts.add("ROW:" + rowIds.stream().sorted().map(String::valueOf).collect(Collectors.joining(",")));
        }
        if (varId != null) {
            parts.add("VAR:" + varId);
        }
        return parts.isEmpty() ? null : String.join(";", parts);
    }

    private static ItemStatus status(List<Issue> issues) {
        if (issues.stream().anyMatch(i -> ERROR.equals(i.severity()))) {
            return ItemStatus.REJECTED;
        }
        if (issues.stream().anyMatch(i -> WARNING.equals(i.severity()))) {
            return ItemStatus.WARNED;
        }
        return ItemStatus.PASSED;
    }

    private static Issue error(String code, String message, MdmRuleConfirmCheckItem item, String itemKey) {
        return new Issue(ERROR, new MdmCheckIssue(code, message, item.name(), itemKey));
    }

    private static List<Integer> rowIds(Map<String, Object> issue) {
        List<Integer> out = new ArrayList<>();
        if (issue.get("rowIds") instanceof List<?> ids) {
            ids.forEach(id -> out.add((Integer) id));
        }
        return out;
    }

    /** mismatches 가 있으면 {@code 키 기대 → 실제} 를 쉼표로, 없으면 판정 오류 message 들. */
    @SuppressWarnings("unchecked")
    private static String caseDetail(Map<String, Object> c) {
        if (c.get("mismatches") instanceof List<?> mismatches && !mismatches.isEmpty()) {
            return mismatches.stream().map(m -> (Map<String, Object>) m)
                    .map(m -> m.get("key") + " " + m.get("expected") + " → " + m.get("actual")).collect(Collectors.joining(", "));
        }
        if (c.get("errors") instanceof List<?> errors && !errors.isEmpty()) {
            return errors.stream().map(e -> String.valueOf(((Map<String, Object>) e).get("message"))).collect(Collectors.joining(", "));
        }
        return "판정 오류";
    }
}
