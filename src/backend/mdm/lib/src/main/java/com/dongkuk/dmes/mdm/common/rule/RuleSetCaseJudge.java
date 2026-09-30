package com.dongkuk.dmes.mdm.common.rule;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.EngineEvaluationException.Violation;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;

/**
 * 룰 세트 테스트 케이스 판정(흐름도 3단계 P7, P-D3·P-D4). 기록 실행({@link RunTrace}) 결과의 {@code finalValues}(최상위에서 룰이 만든 결과
 * 변수)를 기대 JSON 과 견준다. 값 비교·키 찾기·오류 모양은 룰 케이스 판정({@link RuleCaseJudge})을 그대로 부른다 — 판정 논리를 두 벌 두지 않는다.
 */
public final class RuleSetCaseJudge {

    private RuleSetCaseJudge() {
    }

    /**
     * 결과 한 건 — {@code {caseId, caseName, outcome: OK|ERROR, pass: Boolean|null, mismatches, finalValues, errors}}.
     * 실행이 오류로 끝나면 {@code pass=false}(기대값이 없어도), 오류가 없고 기대값이 비면 {@code pass=null}(실행만).
     */
    public static Map<String, Object> judge(Integer caseId, String caseName, String expectedJson, RunTrace trace) {
        List<Violation> violations = violations(trace);
        boolean ok = violations.isEmpty();
        List<Map<String, Object>> errors = violations.stream().map(RuleCaseJudge::error).toList();
        List<Map<String, Object>> mismatches = new ArrayList<>();
        Boolean pass = compare(expectedJson, ok, trace.finalValues(), mismatches);

        Map<String, Object> finals = new LinkedHashMap<>();
        trace.finalValues().forEach((k, v) -> finals.put(k, RuleCaseJudge.value(v)));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("caseId", caseId);
        m.put("caseName", caseName);
        m.put("outcome", ok ? "OK" : "ERROR");
        m.put("pass", pass);
        m.put("mismatches", mismatches);
        m.put("finalValues", finals);
        m.put("errors", errors);
        return m;
    }

    /** 오류 = 기록의 위반, 없으면 status ERROR 인 첫 노드의 위반. */
    private static List<Violation> violations(RunTrace trace) {
        if (trace.violations() != null && !trace.violations().isEmpty()) {
            return trace.violations();
        }
        for (RunTrace.NodeTrace n : trace.nodes()) {
            if (n.status() == RunTrace.NodeStatus.ERROR && n.violations() != null && !n.violations().isEmpty()) {
                return n.violations();
            }
        }
        return List.of();
    }

    private static Boolean compare(String expectedJson, boolean ok, Map<String, Object> finalValues, List<Map<String, Object>> mismatches) {
        if (!ok) {
            return false;
        }
        if (expectedJson == null || expectedJson.isBlank()) {
            return null;
        }
        Map<String, Object> expected = RuleCaseJudge.object(expectedJson);
        if (expected == null) {
            mismatches.add(RuleCaseJudge.mismatch("(expected)", expectedJson, null));
            return false;
        }
        for (Map.Entry<String, Object> x : expected.entrySet()) {
            RuleCaseJudge.compareKey(x.getKey(), x.getValue(), finalValues, mismatches);
        }
        return mismatches.isEmpty();
    }
}
