package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 컬럼 사전 — {@code TB_MDM_COLUMN}(TSK-04-01 design.md §2, ERD {@code 02-term-domain-column.sql}).
 *
 * <p>{@code DOMAIN_ID} 는 {@code TB_MDM_DOMAIN} 을 가리키는 FK 이지만 연관관계 매핑을 쓰지 않는다(불변 규칙 9,
 * MES 모듈 규칙) — 원시 {@code Long} 필드로만 둔다. {@code REQUIRED} 는 원시 {@code boolean}(DB {@code BIT}/
 * {@code INTEGER CHECK(0,1)})로 매핑한다 — {@code Boolean} 이면 null INSERT 가 NOT NULL 을 위반한다.
 *
 * <p>ID 채번은 {@link GenerationType#IDENTITY} 로 고정한다(불변 규칙 10).
 */
@Entity
@Table(name = "TB_MDM_COLUMN")
public class MdmColumn extends CactusAuditEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "COLUMN_ID")
    private Long columnId;

    @Column(name = "COLUMN_NAME", nullable = false)
    private String columnName;

    @Column(name = "LABEL_LONG")
    private String labelLong;

    @Column(name = "LABEL_MID")
    private String labelMid;

    @Column(name = "LABEL_SHORT")
    private String labelShort;

    @Column(name = "PHYS_NAME", length = 50, nullable = false)
    private String physName;

    @Column(name = "DESCRIPTION")
    private String description;

    /** {@code TB_MDM_DOMAIN.DOMAIN_ID} 를 가리키는 원시 FK 필드(불변 규칙 9). */
    @Column(name = "DOMAIN_ID", nullable = false)
    private Long domainId;

    @Column(name = "REQUIRED", nullable = false)
    private boolean required;

    @Column(name = "DEFAULT_VALUE", length = 50)
    private String defaultValue;

    @Column(name = "REF_KIND", length = 20)
    private String refKind;

    @Column(name = "REF_TARGET", length = 50)
    private String refTarget;

    @Column(name = "REF_CATE_ID", length = 50)
    private String refCateId;

    @Column(name = "TERM_IDS")
    private String termIds;

    @Column(name = "USAGE_NOTE")
    private String usageNote;

    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmColumn() {
        // JPA 기본 생성자
    }

    public MdmColumn(String columnName, String physName, Long domainId) {
        this.columnName = columnName;
        this.physName = physName;
        this.domainId = domainId;
    }

    public Long getColumnId() { return columnId; }
    public String getColumnName() { return columnName; }
    public String getLabelLong() { return labelLong; }
    public String getLabelMid() { return labelMid; }
    public String getLabelShort() { return labelShort; }
    public String getPhysName() { return physName; }
    public String getDescription() { return description; }
    public Long getDomainId() { return domainId; }
    public boolean isRequired() { return required; }
    public String getDefaultValue() { return defaultValue; }
    public String getRefKind() { return refKind; }
    public String getRefTarget() { return refTarget; }
    public String getRefCateId() { return refCateId; }
    public String getTermIds() { return termIds; }
    public String getUsageNote() { return usageNote; }
    public long getChgSeq() { return chgSeq; }

    public void setColumnName(String v) { this.columnName = v; }
    public void setLabelLong(String v) { this.labelLong = v; }
    public void setLabelMid(String v) { this.labelMid = v; }
    public void setLabelShort(String v) { this.labelShort = v; }
    public void setPhysName(String v) { this.physName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setDomainId(Long v) { this.domainId = v; }
    public void setRequired(boolean v) { this.required = v; }
    public void setDefaultValue(String v) { this.defaultValue = v; }
    public void setRefKind(String v) { this.refKind = v; }
    public void setRefTarget(String v) { this.refTarget = v; }
    public void setRefCateId(String v) { this.refCateId = v; }
    public void setTermIds(String v) { this.termIds = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
