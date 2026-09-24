package com.dongkuk.dmes.mdm.dma.domainMng.dto;

/**
 * {@code domainMng} action={@code validate}·{@code save} 요청 — 화면 초안(기능설계서 §4 D-001~D-014, design.md §3.1).
 * 테스트 케이스·예시 값은 배열이라 {@code params} 가 아니라 grids {@code testCases}·{@code examples} 로 받는다.
 *
 * <p>{@code domainId} 가 null 이면 신규, {@code ver} 는 조회 때 받은 감사 {@code VER}(동시 수정 검사, design D5).
 */
public class DomainDraftRequest {

    private Long domainId;
    private Long ver;
    private String domainName;
    private String stdName;
    private Long parentDomainId;
    private String domainKind;
    private String dataType;
    private Integer length;
    private Integer scale;
    private String unitCode;
    private String maruCodeId;
    private String cateId;
    private String stdRule;
    private String bizRule;
    private String description;

    public Long getDomainId() { return domainId; }
    public Long getVer() { return ver; }
    public String getDomainName() { return domainName; }
    public String getStdName() { return stdName; }
    public Long getParentDomainId() { return parentDomainId; }
    public String getDomainKind() { return domainKind; }
    public String getDataType() { return dataType; }
    public Integer getLength() { return length; }
    public Integer getScale() { return scale; }
    public String getUnitCode() { return unitCode; }
    public String getMaruCodeId() { return maruCodeId; }
    public String getCateId() { return cateId; }
    public String getStdRule() { return stdRule; }
    public String getBizRule() { return bizRule; }
    public String getDescription() { return description; }

    public void setDomainId(Long v) { this.domainId = v; }
    public void setVer(Long v) { this.ver = v; }
    public void setDomainName(String v) { this.domainName = v; }
    public void setStdName(String v) { this.stdName = v; }
    public void setParentDomainId(Long v) { this.parentDomainId = v; }
    public void setDomainKind(String v) { this.domainKind = v; }
    public void setDataType(String v) { this.dataType = v; }
    public void setLength(Integer v) { this.length = v; }
    public void setScale(Integer v) { this.scale = v; }
    public void setUnitCode(String v) { this.unitCode = v; }
    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setStdRule(String v) { this.stdRule = v; }
    public void setBizRule(String v) { this.bizRule = v; }
    public void setDescription(String v) { this.description = v; }
}
