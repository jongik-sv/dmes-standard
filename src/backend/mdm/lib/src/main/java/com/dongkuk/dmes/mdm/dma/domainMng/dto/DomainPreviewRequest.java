package com.dongkuk.dmes.mdm.dma.domainMng.dto;

/**
 * {@code domainMng} action={@code execute}(서버 미리보기) 요청 — 초안의 식 관련 필드 + 입력값(기능설계서 D-017,
 * design.md §3.1·§3.5). 비즈니스식 변수 값은 grids {@code vars}({@code [{NAME, VALUE}]})로 받는다.
 */
public class DomainPreviewRequest {

    private Long domainId;
    private Long parentDomainId;
    private String domainKind;
    private String dataType;
    private Integer scale;
    private String stdName;
    private String maruCodeId;
    private String cateId;
    private String stdRule;
    private String bizRule;
    /** 미리보기 입력값(문자열 그대로, 유효 타입으로 변환은 서버가 한다). */
    private String value;

    public Long getDomainId() { return domainId; }
    public Long getParentDomainId() { return parentDomainId; }
    public String getDomainKind() { return domainKind; }
    public String getDataType() { return dataType; }
    public Integer getScale() { return scale; }
    public String getStdName() { return stdName; }
    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public String getStdRule() { return stdRule; }
    public String getBizRule() { return bizRule; }
    public String getValue() { return value; }

    public void setDomainId(Long v) { this.domainId = v; }
    public void setParentDomainId(Long v) { this.parentDomainId = v; }
    public void setDomainKind(String v) { this.domainKind = v; }
    public void setDataType(String v) { this.dataType = v; }
    public void setScale(Integer v) { this.scale = v; }
    public void setStdName(String v) { this.stdName = v; }
    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setStdRule(String v) { this.stdRule = v; }
    public void setBizRule(String v) { this.bizRule = v; }
    public void setValue(String v) { this.value = v; }
}
