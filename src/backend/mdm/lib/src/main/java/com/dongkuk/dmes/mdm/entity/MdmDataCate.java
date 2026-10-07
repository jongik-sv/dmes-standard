package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * 마스터데이터 카테고리 — {@code TB_MDM_DATA_CATE}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 복합 PK 는 {@link MdmDataCateId} 로 표현한다(F6). {@code DEF_KIND}·{@code
 * DEF_TARGET} 은 {@code contract.category} 의 {@code CategoryKind}/{@code CategoryDefTarget} 을 plain
 * {@code String} 필드로 매핑한다(F11 — 기존 {@code MdmLayoutItem.fillKind} 선례, 계약 재사용은 DDL CHECK
 * 값 목록 대조로 증명한다, F18).
 */
@Entity
@Table(name = "TB_MDM_DATA_CATE")
@IdClass(MdmDataCateId.class)
public class MdmDataCate extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    @Id
    @Column(name = "CATE_ID", length = 50)
    private String cateId;

    /** PK 구성 요소 — Hibernate 기본 LocalDateTime(TIMESTAMP) 매핑, 값은 생성자에서 초 단위로 자른다. */
    @Id
    @Column(name = "VALID_FROM")
    private LocalDateTime validFrom;

    @Column(name = "CATE_NAME")
    private String cateName;

    @Column(name = "DEF_KIND", length = 20, nullable = false)
    private String defKind;

    @Column(name = "DEF_EXPR")
    private String defExpr;

    @Column(name = "DEF_TARGET", length = 20)
    private String defTarget;

    @Column(name = "DESCRIPTION")
    private String description;

    @Column(name = "VALID_TO", nullable = false)
    private LocalDateTime validTo;

    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmDataCate() {
        // JPA 기본 생성자
    }

    public MdmDataCate(String maruDataId, String cateId, LocalDateTime validFrom, String defKind) {
        this.maruDataId = maruDataId;
        this.cateId = cateId;
        this.validFrom = MdmEntityTimes.seconds(validFrom);
        this.defKind = defKind;
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public LocalDateTime getValidFrom() { return validFrom; }
    public String getCateName() { return cateName; }
    public String getDefKind() { return defKind; }
    public String getDefExpr() { return defExpr; }
    public String getDefTarget() { return defTarget; }
    public String getDescription() { return description; }
    public LocalDateTime getValidTo() { return validTo; }
    public long getChgSeq() { return chgSeq; }

    public void setCateName(String v) { this.cateName = v; }
    public void setDefExpr(String v) { this.defExpr = v; }
    public void setDefTarget(String v) { this.defTarget = v; }
    public void setDescription(String v) { this.description = v; }
    public void setValidTo(LocalDateTime v) { this.validTo = MdmEntityTimes.seconds(v); }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
