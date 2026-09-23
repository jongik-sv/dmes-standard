package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 전문별 헤더 상수 재정의 — {@code TB_MDM_LAYOUT_CONST}(신설, D4, TSK-05-01 design.md §2·§6.0). 대상
 * 항목의 {@code FILL_KIND=CONST} 여부는 앱 검사다(cross-table CHECK 불가). 복합 PK 는 {@link
 * MdmLayoutConstId} 로 표현한다.
 *
 * <p>{@code LAYOUT_ID}·{@code HEADER_LAYOUT_ID}·{@code HEADER_SEQ} 모두 FK 이지만 연관관계 매핑을
 * 쓰지 않는다(불변 규칙 9) — 원시 필드로만 둔다. {@code (LAYOUT_ID,HEADER_LAYOUT_ID)}는 {@code
 * TB_MDM_LAYOUT_HEADER} 의 실제 부착 조합만 허용한다(부착 무결성, FK3).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_CONST")
@IdClass(MdmLayoutConstId.class)
public class MdmLayoutConst extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "HEADER_LAYOUT_ID")
    private Long headerLayoutId;

    @Id
    @Column(name = "HEADER_SEQ")
    private Integer headerSeq;

    @Column(name = "CONST_VALUE", length = 50, nullable = false)
    private String constValue;

    protected MdmLayoutConst() {
        // JPA 기본 생성자
    }

    public MdmLayoutConst(Long layoutId, Long headerLayoutId, Integer headerSeq, String constValue) {
        this.layoutId = layoutId;
        this.headerLayoutId = headerLayoutId;
        this.headerSeq = headerSeq;
        this.constValue = constValue;
    }

    public Long getLayoutId() { return layoutId; }
    public Long getHeaderLayoutId() { return headerLayoutId; }
    public Integer getHeaderSeq() { return headerSeq; }
    public String getConstValue() { return constValue; }

    public void setConstValue(String v) { this.constValue = v; }
}
