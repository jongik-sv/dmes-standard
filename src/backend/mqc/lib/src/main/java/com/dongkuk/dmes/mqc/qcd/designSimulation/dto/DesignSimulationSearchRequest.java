package com.dongkuk.dmes.mqc.qcd.designSimulation.dto;

/** search params — 키워드(케이스 ID·이름·주문 키). 생략 가능. */
public class DesignSimulationSearchRequest {
    private String keyword;
    public String getKeyword() { return keyword; }
    public void setKeyword(String v) { this.keyword = v; }
}
