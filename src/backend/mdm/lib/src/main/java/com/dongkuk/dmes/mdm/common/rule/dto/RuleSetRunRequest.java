package com.dongkuk.dmes.mdm.common.rule.dto;

/**
 * OASIS 업무 서비스에서 룰 세트를 부르는 요청(spec §6.2, 계획 Task 11). 레코드는 JSON 문자열로 받는다(실수는 BigDecimal, 정수는 Integer·Long — 엔진이 선언 타입으로 바꾼다) —
 * OASIS params 는 평평한 값만 확실히 바인딩한다. {@code evalTs} 는 KST {@code yyyy-MM-dd HH:mm:ss}, 없으면 서비스 시계.
 */
public class RuleSetRunRequest {

    private String setId;
    private String recordJson;
    private String evalTs;

    public String getSetId() { return setId; }
    public String getRecordJson() { return recordJson; }
    public String getEvalTs() { return evalTs; }

    public void setSetId(String v) { this.setId = v; }
    public void setRecordJson(String v) { this.recordJson = v; }
    public void setEvalTs(String v) { this.evalTs = v; }
}
