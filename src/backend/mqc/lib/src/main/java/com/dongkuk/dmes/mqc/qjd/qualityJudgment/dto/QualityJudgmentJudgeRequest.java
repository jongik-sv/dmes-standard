package com.dongkuk.dmes.mqc.qjd.qualityJudgment.dto;

/**
 * judge 요청 params — 코일 번호와 고칠 검사값 JSON 객체 문자열(항목 코드 → 값, 예 {"YP":"268"}).
 * valuesJson 이 비면 저장된 검사값으로 다시 계산만 한다. 빈 값은 미검, 「재검」 은 보류다.
 */
public class QualityJudgmentJudgeRequest {
    private String coilNo;
    private String valuesJson;
    public String getCoilNo() { return coilNo; }
    public void setCoilNo(String v) { this.coilNo = v; }
    public String getValuesJson() { return valuesJson; }
    public void setValuesJson(String v) { this.valuesJson = v; }
}
