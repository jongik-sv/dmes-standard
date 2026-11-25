package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** confirm·send params — 사양번호 여러 개(쉼표). */
public class QualitySpecBatchRequest {
    private String specNos;
    public String getSpecNos() { return specNos; }
    public void setSpecNos(String v) { this.specNos = v; }
}
