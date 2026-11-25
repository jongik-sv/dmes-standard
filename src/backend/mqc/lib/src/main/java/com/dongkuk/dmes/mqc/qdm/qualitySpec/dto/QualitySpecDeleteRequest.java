package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** delete params — target 이 ATTR 이면 attrCd 한 항목, 아니면 specNos(쉼표). */
public class QualitySpecDeleteRequest {
    private String target;
    private String specNos;
    private String attrCd;
    public String getTarget() { return target; }
    public void setTarget(String v) { this.target = v; }
    public String getSpecNos() { return specNos; }
    public void setSpecNos(String v) { this.specNos = v; }
    public String getAttrCd() { return attrCd; }
    public void setAttrCd(String v) { this.attrCd = v; }
}
