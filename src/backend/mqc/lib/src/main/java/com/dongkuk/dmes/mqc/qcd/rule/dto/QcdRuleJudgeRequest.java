package com.dongkuk.dmes.mqc.qcd.rule.dto;

/** judge 요청 params — 룰 ID, 입력 JSON 객체 문자열(변수명→값), 평가 시각(없으면 현재). */
public class QcdRuleJudgeRequest {
    private String ruleId;
    private String inputJson;
    private String evalTs;
    public String getRuleId() { return ruleId; }
    public void setRuleId(String v) { this.ruleId = v; }
    public String getInputJson() { return inputJson; }
    public void setInputJson(String v) { this.inputJson = v; }
    public String getEvalTs() { return evalTs; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
