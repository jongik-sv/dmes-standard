package com.dongkuk.dmes.mqc.qcd.rule.dto;

/** search 요청 params — 룰 ID 목록(쉼표 구분), 평가 시각(yyyy-MM-dd HH:mm:ss, 없으면 현재). */
public class QcdRuleSearchRequest {
    private String ruleIds;
    private String evalTs;
    public String getRuleIds() { return ruleIds; }
    public void setRuleIds(String v) { this.ruleIds = v; }
    public String getEvalTs() { return evalTs; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
