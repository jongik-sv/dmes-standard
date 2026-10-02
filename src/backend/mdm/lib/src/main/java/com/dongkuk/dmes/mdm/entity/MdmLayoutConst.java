package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import jakarta.persistence.AttributeOverride;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * 전문별 헤더 상수 재정의 — {@code TB_MDM_LAYOUT_CONST}(신설, D4, TSK-05-01 design.md §2·§6.0). 대상
 * 항목의 {@code FILL_KIND=CONST} 여부는 앱 검사다(cross-table CHECK 불가). 복합 PK 는 {@link
 * MdmLayoutConstId} 로 표현한다.
 *
 * <p>{@code LAYOUT_ID}·{@code HEADER_LAYOUT_ID}·{@code HEADER_COLUMN_PHYS}(헤더 항목 물리명) 모두 FK 이지만 연관관계 매핑을
 * 쓰지 않는다(불변 규칙 9) — 원시 필드로만 둔다. {@code (LAYOUT_ID,HEADER_LAYOUT_ID)}는 {@code
 * TB_MDM_LAYOUT_HEADER} 의 실제 부착 조합만 허용한다(부착 무결성, FK3).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_CONST")
@IdClass(MdmLayoutConstId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmLayoutConst extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Id
    @Column(name = "HEADER_LAYOUT_ID")
    private Long headerLayoutId;

    @Id
    @Column(name = "HEADER_COLUMN_PHYS", length = 50)
    private String headerColumnPhys;

    @Column(name = "CONST_VALUE", length = 50, nullable = false)
    private String constValue;

    protected MdmLayoutConst() {
        // JPA 기본 생성자
    }

    public MdmLayoutConst(Long layoutId, BigDecimal ver, Long headerLayoutId, String headerColumnPhys, String constValue) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.headerLayoutId = headerLayoutId;
        this.headerColumnPhys = headerColumnPhys;
        this.constValue = constValue;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public Long getHeaderLayoutId() { return headerLayoutId; }
    public String getHeaderColumnPhys() { return headerColumnPhys; }
    public String getConstValue() { return constValue; }

    public void setConstValue(String v) { this.constValue = v; }
}
