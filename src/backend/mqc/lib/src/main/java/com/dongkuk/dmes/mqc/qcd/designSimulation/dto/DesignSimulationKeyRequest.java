package com.dongkuk.dmes.mqc.qcd.designSimulation.dto;

/** view·run·apply·delete params — 케이스 ID, 실행할 주문 JSON(편집 중인 값, 저장하지 않음 — 생략하면 저장된 주문). */
public class DesignSimulationKeyRequest {
    private String caseId;
    private String orderJson;
    public String getCaseId() { return caseId; }
    public void setCaseId(String v) { this.caseId = v; }
    public String getOrderJson() { return orderJson; }
    public void setOrderJson(String v) { this.orderJson = v; }
}
