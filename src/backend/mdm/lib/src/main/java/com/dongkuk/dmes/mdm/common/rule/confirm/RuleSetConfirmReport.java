package com.dongkuk.dmes.mdm.common.rule.confirm;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.check.RuleCheckReport;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.CaseSummary;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Issue;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 룰 세트 확정 검사 4항목 보고서(D-144 2단계, 스펙 §6) — 순수(Spring·DB 없음). 항목은 {@link MdmRuleSetConfirmCheckItem} 순서 그대로 넷.
 * 이슈의 {@code field} 는 항목 이름, {@code code} 는 세부 코드(룰 {@link RuleConfirmReport} 와 같은 관례, I4).
 */
public final class RuleSetConfirmReport {

    public static final String SET_RULE_NOT_RELEASED = "SET_RULE_NOT_RELEASED";
    public static final String STORED_FLOW_CORRUPT = "STORED_FLOW_CORRUPT";
    /** 기대값이 없는(실행만) 케이스가 실행 오류로 끝남 — WARNING(스펙 §6 항목 4 는 기대값이 있는 케이스의 실패만 막는다, Ruling P2-22). */
    public static final String CASE_RUN_ERROR = "CASE_RUN_ERROR";
    /**
     * 케이스 결과 맵의 기대값 유무 키({@code Boolean}) — {@link RuleSetConfirmChecks} 가 싣는다. 없으면 기대값이 있는 것으로 본다(확정을 막는 쪽).
     */
    public static final String HAS_EXPECTED = "hasExpected";

    /** ORDER 항목으로 가는 흐름 검사 코드 — 나머지는 FLOW_STRUCTURE. NO_RELEASED 는 항목 2가 ERROR 로 다시 본다. */
    static final Set<String> ORDER_CODES = Set.of(RuleSetCheck.ORDER, RuleSetCheck.CYCLE, RuleSetCheck.IF_SIBLING,
            RuleSetCheck.PAR_SIBLING, RuleSetCheck.DUP_RESULT);

    private static final String ERROR = RuleCheckReport.ERROR;
    private static final String WARNING = RuleCheckReport.WARNING;
    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    public record Item(MdmRuleSetConfirmCheckItem item, ItemStatus status, List<Issue> issues) {
    }

    public record Report(VersionRef draft, List<Item> items, CaseSummary cases) {
    }

    /**
     * apply_from 뒤 경계 시각 하나의 흐름 검사(Ruling P2-14) — {@code at} 은 멤버 룰 RELEASED 의 APPLY_FROM, {@code causes} 는 그 시각에 적용되기
     * 시작하는 룰 버전 표기(예: {@code R_X v2.000}), {@code checks} 는 그 시각의 룰 버전으로 돌린 흐름 검사.
     */
    public record FutureChecks(LocalDateTime at, List<String> causes, List<RuleSetCheck> checks) {
    }

    private RuleSetConfirmReport() {
    }

    /**
     * @param checks  apply_from 시점 룰 버전으로 돌린 흐름 검사·호출 그래프·연쇄 재검사 — REJECT 와 {@link RuleSetCheck#CALL_CODES}(수준 무관)는 ERROR,
     *                나머지 WARN 은 WARNING
     * @param future  apply_from 뒤 경계 시각마다 돌린 흐름 검사(시각 오름차순, Ruling P2-14). 심각도와 무관하게 WARNING 이고 문구 머리에 시각과
     *                원인 룰 버전을 붙인다. apply_from 시점이나 앞 경계에서 이미 낸 이슈(같은 코드·위치)는 다시 내지 않는다
     */
    public static Report report(VersionRef draft, List<RuleSetCheck> checks, List<FutureChecks> future, List<String> notReleased,
                                LocalDateTime applyFrom, List<Map<String, Object>> caseResults, String caseRunFailure) {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = empty();
        Set<List<String>> seen = new HashSet<>();
        for (RuleSetCheck c : checks) {
            if (RuleSetCheck.NO_RELEASED.equals(c.code())) {
                continue;
            }
            seen.add(sameIssue(c));
            MdmRuleSetConfirmCheckItem item = itemOf(c);
            issues.get(item).add(new Issue(rejects(c) ? ERROR : WARNING, new MdmCheckIssue(c.code(), c.message(), item.name(), itemKey(c))));
        }
        for (FutureChecks f : future) {
            String head = TEXT.format(f.at()) + " 부터 " + String.join("·", f.causes()) + " 적용 시: ";
            for (RuleSetCheck c : f.checks()) {
                if (RuleSetCheck.NO_RELEASED.equals(c.code()) || !seen.add(sameIssue(c))) {
                    continue;
                }
                MdmRuleSetConfirmCheckItem item = itemOf(c);
                issues.get(item).add(new Issue(WARNING, new MdmCheckIssue(c.code(), head + c.message(), item.name(), itemKey(c))));
            }
        }
        for (String id : notReleased) {
            issues.get(MdmRuleSetConfirmCheckItem.RULES_RELEASED).add(error(SET_RULE_NOT_RELEASED,
                    id + " 에 적용 시각 " + TEXT.format(applyFrom) + " 의 RELEASED 버전이 없습니다", MdmRuleSetConfirmCheckItem.RULES_RELEASED,
                    "RULE:" + id));
        }
        int withExpected = 0;
        int passed = 0;
        int failed = 0;
        MdmRuleSetConfirmCheckItem tests = MdmRuleSetConfirmCheckItem.TEST_CASES;
        for (Map<String, Object> c : caseResults) {
            Object pass = c.get("pass");
            if (pass == null) {
                continue;
            }
            if (Boolean.FALSE.equals(c.get(HAS_EXPECTED))) {
                // 실행만 하는 케이스(기대값 없음)인데 실행이 오류로 끝남 — 룰 확정(RuleCaseJudge, pass=null)처럼 막지 않고 경고로 알린다.
                issues.get(tests).add(new Issue(WARNING, new MdmCheckIssue(CASE_RUN_ERROR,
                        "케이스 " + c.get("caseId") + " " + c.get("caseName") + "(기대값 없음) 실행 오류: " + caseDetail(c), tests.name(),
                        "CASE:" + c.get("caseId"))));
                continue;
            }
            withExpected++;
            if (Boolean.TRUE.equals(pass)) {
                passed++;
                continue;
            }
            failed++;
            issues.get(tests).add(error(RuleConfirmReport.CASE_FAILED, "케이스 " + c.get("caseId") + " " + c.get("caseName") + ": " + caseDetail(c),
                    tests, "CASE:" + c.get("caseId")));
        }
        if (caseRunFailure != null) {
            issues.get(tests).add(error(RuleConfirmReport.CASE_RUN_FAILED, "테스트 케이스를 끝내지 못했다: " + caseRunFailure, tests, null));
        }
        return new Report(draft, items(issues), new CaseSummary(caseResults.size(), withExpected, passed, failed));
    }

    /** 저장된 FLOW_JSON 을 읽지 못함 — 나머지 항목은 계산하지 않고 흐름 구조 ERROR 하나. */
    public static Report storedFlowCorrupt(VersionRef draft, String message) {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = empty();
        issues.get(MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE).add(error(STORED_FLOW_CORRUPT, "저장된 흐름을 읽을 수 없습니다 — " + message,
                MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE, null));
        return new Report(draft, items(issues), new CaseSummary(0, 0, 0, 0));
    }

    /** SPI {@code check()} — ERROR 는 errors, WARNING 은 warnings(항목 순서, 항목 안에서는 원래 순서). */
    public static ConfirmCheckResult flatten(Report report) {
        List<MdmCheckIssue> errors = new ArrayList<>();
        List<MdmCheckIssue> warnings = new ArrayList<>();
        for (Item item : report.items()) {
            for (Issue issue : item.issues()) {
                (ERROR.equals(issue.severity()) ? errors : warnings).add(issue.issue());
            }
        }
        return new ConfirmCheckResult(List.copyOf(errors), List.copyOf(warnings));
    }

    private static Map<MdmRuleSetConfirmCheckItem, List<Issue>> empty() {
        Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues = new EnumMap<>(MdmRuleSetConfirmCheckItem.class);
        for (MdmRuleSetConfirmCheckItem item : MdmRuleSetConfirmCheckItem.values()) {
            issues.put(item, new ArrayList<>());
        }
        return issues;
    }

    private static List<Item> items(Map<MdmRuleSetConfirmCheckItem, List<Issue>> issues) {
        List<Item> out = new ArrayList<>();
        for (MdmRuleSetConfirmCheckItem item : MdmRuleSetConfirmCheckItem.values()) {
            List<Issue> list = List.copyOf(issues.get(item));
            ItemStatus status = list.stream().anyMatch(i -> ERROR.equals(i.severity())) ? ItemStatus.REJECTED
                    : list.isEmpty() ? ItemStatus.PASSED : ItemStatus.WARNED;
            out.add(new Item(item, status, list));
        }
        return List.copyOf(out);
    }

    private static Issue error(String code, String message, MdmRuleSetConfirmCheckItem item, String itemKey) {
        return new Issue(ERROR, new MdmCheckIssue(code, message, item.name(), itemKey));
    }

    /** 확정을 막는 검사 — REJECT 이거나 하위 세트 호출 네 코드({@link RuleSetCheck#CALL_CODES}, 수준과 상관없이 거부, 편차 13·srv:6 조정 ②). */
    static boolean rejects(RuleSetCheck c) {
        return c.rejected() || RuleSetCheck.CALL_CODES.contains(c.code());
    }

    private static MdmRuleSetConfirmCheckItem itemOf(RuleSetCheck c) {
        return ORDER_CODES.contains(c.code()) ? MdmRuleSetConfirmCheckItem.ORDER : MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE;
    }

    /** 같은 이슈 판정 — 코드와 위치(룰·상대 룰·변수·노드·선). 문구는 보지 않는다. */
    private static List<String> sameIssue(RuleSetCheck c) {
        return Arrays.asList(c.code(), c.ruleId(), c.otherRuleId(), c.varName(), c.nodeId(), c.edgeId());
    }

    /** 룰 확정 보고서(RuleConfirmReport.caseDetail)와 같은 형식 — mismatches 가 있으면 {@code 키 기대 → 실제} 를 쉼표로, 없으면 오류 message 들. */
    private static String caseDetail(Map<String, Object> c) {
        if (c.get("mismatches") instanceof List<?> mismatches && !mismatches.isEmpty()) {
            return mismatches.stream().map(m -> (Map<?, ?>) m)
                    .map(m -> m.get("key") + " " + m.get("expected") + " → " + m.get("actual")).collect(Collectors.joining(", "));
        }
        if (c.get("errors") instanceof List<?> errors && !errors.isEmpty()) {
            return errors.stream().map(e -> String.valueOf(((Map<?, ?>) e).get("message"))).collect(Collectors.joining(", "));
        }
        return "판정 오류";
    }

    /**
     * 화면이 이슈를 짚는 키. 부르는 세트 쪽 두 코드({@code CALLER_WARN}·{@code CALLER_BROKEN})의 ruleId 는 세트 ID(이 세트·부르는 부모)라
     * {@code SET:<세트 ID>} 다(srv:6 E1 조정 기본안) — 노드·선보다 먼저 본다.
     */
    private static String itemKey(RuleSetCheck c) {
        if ((RuleSetCheck.CALLER_WARN.equals(c.code()) || RuleSetCheck.CALLER_BROKEN.equals(c.code())) && c.ruleId() != null) {
            return "SET:" + c.ruleId();
        }
        if (c.nodeId() != null) {
            return "NODE:" + c.nodeId();
        }
        if (c.edgeId() != null) {
            return "EDGE:" + c.edgeId();
        }
        return c.ruleId() == null ? null : "RULE:" + c.ruleId();
    }
}
