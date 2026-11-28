package com.dongkuk.dmes.mdm.dma.columnMng.dto;

/**
 * {@code columnMng} action={@code save} 요청 params(TSK-04-04 design.md §6.1). 그리드 {@code systems}·{@code terms} 는 메서드 파라미터로 따로 받는다.
 *
 * <p>BPMN serviceTask 의 {@code dto} 속성이 이 FQCN 을 가리키고 요청 봉투의 {@code params} 가 이 타입으로 바인딩된다.
 * getter/setter 일반 클래스다(record·Lombok 없음, TSK-04-04 design.md F11).
 */
public class ColumnMngSaveRequest {

    /** 신규면 null. */
    private Long columnId;
    private String columnName;
    private String physName;
    private String labelLong;
    private String labelMid;
    private String labelShort;
    private String description;
    private Long domainId;
    /** 컬럼 기본 타입(NUMBER·STRING·BOOLEAN·DATE). 도메인이 있으면 무시하고 NULL 로 저장한다. */
    private String dataType;
    /** 컬럼 기본 길이. 도메인이 있으면 무시한다. */
    private Integer length;
    /** 컬럼 기본 소수 자릿수. 도메인이 있으면 무시한다. */
    private Integer scale;
    private Boolean required;
    private String defaultValue;
    /** null 또는 {@code MASTER}. */
    private String refKind;
    private String refTarget;
    private String refCateId;
    private String usageNote;

    public Long getColumnId() { return columnId; }
    public String getColumnName() { return columnName; }
    public String getPhysName() { return physName; }
    public String getLabelLong() { return labelLong; }
    public String getLabelMid() { return labelMid; }
    public String getLabelShort() { return labelShort; }
    public String getDescription() { return description; }
    public Long getDomainId() { return domainId; }
    public String getDataType() { return dataType; }
    public Integer getLength() { return length; }
    public Integer getScale() { return scale; }
    public Boolean getRequired() { return required; }
    public String getDefaultValue() { return defaultValue; }
    public String getRefKind() { return refKind; }
    public String getRefTarget() { return refTarget; }
    public String getRefCateId() { return refCateId; }
    public String getUsageNote() { return usageNote; }

    public void setColumnId(Long v) { this.columnId = v; }
    public void setColumnName(String v) { this.columnName = v; }
    public void setPhysName(String v) { this.physName = v; }
    public void setLabelLong(String v) { this.labelLong = v; }
    public void setLabelMid(String v) { this.labelMid = v; }
    public void setLabelShort(String v) { this.labelShort = v; }
    public void setDescription(String v) { this.description = v; }
    public void setDomainId(Long v) { this.domainId = v; }
    public void setDataType(String v) { this.dataType = v; }
    public void setLength(Integer v) { this.length = v; }
    public void setScale(Integer v) { this.scale = v; }
    public void setRequired(Boolean v) { this.required = v; }
    public void setDefaultValue(String v) { this.defaultValue = v; }
    public void setRefKind(String v) { this.refKind = v; }
    public void setRefTarget(String v) { this.refTarget = v; }
    public void setRefCateId(String v) { this.refCateId = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
}
