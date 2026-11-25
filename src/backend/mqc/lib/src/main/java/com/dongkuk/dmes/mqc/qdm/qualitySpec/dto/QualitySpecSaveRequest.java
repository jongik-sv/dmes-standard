package com.dongkuk.dmes.mqc.qdm.qualitySpec.dto;

/** save params — target 이 ATTR 이면 항목 사전 한 항목, 아니면 사양(text 한 줄 = 사양 하나, specNo 가 있으면 그 사양 수정, confirm=Y 면 저장 후 확정). */
public class QualitySpecSaveRequest {
    private String target;
    private String text;
    private String specNo;
    private String confirm;
    private String origAttrCd;
    private String attrCd;
    private String attrNm;
    private String kind;
    private String dataType;
    private String dataLen;
    private String unit;
    private String description;
    private String useYn;
    public String getTarget() { return target; }
    public void setTarget(String v) { this.target = v; }
    public String getText() { return text; }
    public void setText(String v) { this.text = v; }
    public String getSpecNo() { return specNo; }
    public void setSpecNo(String v) { this.specNo = v; }
    public String getConfirm() { return confirm; }
    public void setConfirm(String v) { this.confirm = v; }
    public String getOrigAttrCd() { return origAttrCd; }
    public void setOrigAttrCd(String v) { this.origAttrCd = v; }
    public String getAttrCd() { return attrCd; }
    public void setAttrCd(String v) { this.attrCd = v; }
    public String getAttrNm() { return attrNm; }
    public void setAttrNm(String v) { this.attrNm = v; }
    public String getKind() { return kind; }
    public void setKind(String v) { this.kind = v; }
    public String getDataType() { return dataType; }
    public void setDataType(String v) { this.dataType = v; }
    public String getDataLen() { return dataLen; }
    public void setDataLen(String v) { this.dataLen = v; }
    public String getUnit() { return unit; }
    public void setUnit(String v) { this.unit = v; }
    public String getDescription() { return description; }
    public void setDescription(String v) { this.description = v; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String v) { this.useYn = v; }
}
