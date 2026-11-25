package com.dongkuk.dmes.mqc.qcd.order.pipeline;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 룰 한 번 부른 결과와 근거. status = MATCHED · NO_MATCH · RULE_NOT_FOUND · UNAVAILABLE · INPUT_ERROR.
 * results 는 첫 적중 행의 결과 변수(FIRST), all 은 적중 행 전부(COLLECT).
 */
public record RuleHit(String ruleId, String ver, String status, Integer seq, Integer rowId,
                      Map<String, String> results, List<Map<String, String>> all, Map<String, String> input, String message) {

    static RuleHit failed(String ruleId, String status, String message, Map<String, String> input) {
        return new RuleHit(ruleId, null, status, null, null, Map.of(), List.of(), input, message);
    }

    RuleHit withVer(String v) {
        return new RuleHit(ruleId, v, status, seq, rowId, results, all, input, message);
    }

    public boolean matched() {
        return "MATCHED".equals(status);
    }

    /** 룰 정의가 없거나 받을 수 없음(기준 없음). */
    public boolean missing() {
        return "RULE_NOT_FOUND".equals(status) || "UNAVAILABLE".equals(status);
    }

    public String result(String name) {
        return results == null ? null : results.get(name);
    }

    public String ruleKey() {
        return result("RULE_KEY");
    }

    /** 화면 계약 Evidence. */
    public Map<String, Object> evidence() {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("ruleId", ruleId);
        m.put("title", DesignCatalog.ruleTitle(ruleId));
        m.put("ver", ver);
        m.put("status", status);
        m.put("seq", seq);
        m.put("rowId", rowId);
        m.put("ruleKey", ruleKey());
        m.put("results", results == null ? Map.of() : results);
        m.put("input", input == null ? Map.of() : input);
        m.put("message", message);
        m.put("screen", DesignCatalog.screenOf(ruleId));
        return m;
    }

    /** 근거 요약 한 줄 — "C10B2060 v1.000 · TS-008" / "C10B2060 기준 없음". */
    public String label() {
        if (matched()) return ruleId + (ver == null ? "" : " v" + ver) + (ruleKey() == null ? "" : " · " + ruleKey());
        if (missing()) return ruleId + " 기준 없음";
        if ("NO_MATCH".equals(status)) return ruleId + (ver == null ? "" : " v" + ver) + " 미적중";
        return ruleId + " 판정 오류";
    }
}
