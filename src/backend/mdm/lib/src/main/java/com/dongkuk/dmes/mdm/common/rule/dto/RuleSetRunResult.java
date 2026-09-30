package com.dongkuk.dmes.mdm.common.rule.dto;

import java.util.List;
import java.util.Map;

/** 룰 세트 실행 응답 — 결과 변수 전체와 방문 경로(노드 ID·종류·고른 선·결과 자리). 시각은 KST 문자열. */
public class RuleSetRunResult {

    private String setId;
    private String evalTs;
    private Map<String, Object> finalValues;
    private List<Map<String, Object>> path;

    public String getSetId() { return setId; }
    public String getEvalTs() { return evalTs; }
    public Map<String, Object> getFinalValues() { return finalValues; }
    public List<Map<String, Object>> getPath() { return path; }

    public void setSetId(String v) { this.setId = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
    public void setFinalValues(Map<String, Object> v) { this.finalValues = v; }
    public void setPath(List<Map<String, Object>> v) { this.path = v; }
}
