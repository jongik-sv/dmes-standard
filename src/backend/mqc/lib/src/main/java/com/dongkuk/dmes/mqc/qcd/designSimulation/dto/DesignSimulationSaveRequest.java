package com.dongkuk.dmes.mqc.qcd.designSimulation.dto;

/** save params — 케이스 ID(비우면 신규 TC-1nn), 이름, 기준 주문 키, 주문 JSON, pin JSON 배열, 단계 판정 기대 JSON 배열. */
public class DesignSimulationSaveRequest {
    private String caseId;
    private String caseNm;
    private String baseOrdRef;
    private String orderJson;
    private String pinsJson;
    private String verdictsJson;
    public String getCaseId() { return caseId; }
    public void setCaseId(String v) { this.caseId = v; }
    public String getCaseNm() { return caseNm; }
    public void setCaseNm(String v) { this.caseNm = v; }
    public String getBaseOrdRef() { return baseOrdRef; }
    public void setBaseOrdRef(String v) { this.baseOrdRef = v; }
    public String getOrderJson() { return orderJson; }
    public void setOrderJson(String v) { this.orderJson = v; }
    public String getPinsJson() { return pinsJson; }
    public void setPinsJson(String v) { this.pinsJson = v; }
    public String getVerdictsJson() { return verdictsJson; }
    public void setVerdictsJson(String v) { this.verdictsJson = v; }
}
