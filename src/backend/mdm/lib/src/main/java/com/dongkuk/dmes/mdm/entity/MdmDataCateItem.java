package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.time.LocalDateTime;

/**
 * 카테고리 소속 — {@code TB_MDM_DATA_CATE_ITEM}(TSK-07-01 design.md §2·§6.0, ERD {@code
 * 05-master-data.sql}). 복합 PK 는 {@link MdmDataCateItemId} 로 표현한다(F6). {@code CATE_ID}·{@code
 * CODE} 는 FK 가 아니다(F13, 선분 때문에 앱이 검사한다) — {@code MARU_DATA_ID → TB_MDM_DATA} FK 하나만
 * DDL 에 있다. 모두 원시 필드다(불변 규칙 9).
 */
@Entity
@Table(name = "TB_MDM_DATA_CATE_ITEM")
@IdClass(MdmDataCateItemId.class)
public class MdmDataCateItem extends CactusAuditEntity {

    @Id
    @Column(name = "MARU_DATA_ID", length = 50)
    private String maruDataId;

    @Id
    @Column(name = "CATE_ID", length = 50)
    private String cateId;

    @Id
    @Column(name = "CODE", length = 50)
    private String code;

    /** PK 구성 요소 — Hibernate 기본 LocalDateTime(TIMESTAMP) 매핑, 값은 생성자에서 초 단위로 자른다. */
    @Id
    @Column(name = "VALID_FROM")
    private LocalDateTime validFrom;

    @Column(name = "VALID_TO", nullable = false)
    private LocalDateTime validTo;

    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmDataCateItem() {
        // JPA 기본 생성자
    }

    public MdmDataCateItem(String maruDataId, String cateId, String code, LocalDateTime validFrom) {
        this.maruDataId = maruDataId;
        this.cateId = cateId;
        this.code = code;
        this.validFrom = MdmEntityTimes.seconds(validFrom);
    }

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }
    public String getCode() { return code; }
    public LocalDateTime getValidFrom() { return validFrom; }
    public LocalDateTime getValidTo() { return validTo; }
    public long getChgSeq() { return chgSeq; }

    public void setValidTo(LocalDateTime v) { this.validTo = MdmEntityTimes.seconds(v); }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
