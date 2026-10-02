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
 * 전문/헤더 항목 — {@code TB_MDM_LAYOUT_ITEM}(TSK-05-01 design.md §2·§6.0, ERD {@code
 * 03-interface-layout.sql}). 복합 PK(레이아웃·버전·순번)는 {@link MdmLayoutItemId} 로 표현한다. 항목은 레이아웃 버전에 속한다(D-144 3단계).
 *
 * <p>{@code COLUMN_PHYS}({@code TB_MDM_COLUMN})·{@code TRANS_UNIT}({@code TB_MDM_UNIT}) 모두 FK 이지만
 * 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 원시 필드로만 둔다. 예약어 칼럼 {@code OFFSET}·{@code
 * LENGTH}는 방언-중립 백틱 인용으로 매핑한다(D1, 불변 규칙 7).
 */
@Entity
@Table(name = "TB_MDM_LAYOUT_ITEM")
@IdClass(MdmLayoutItemId.class)
@AttributeOverride(name = "version", column = @Column(name = "AUD_VER"))
public class MdmLayoutItem extends CactusAuditEntity {

    @Id
    @Column(name = "LAYOUT_ID")
    private Long layoutId;

    @Id
    @Column(name = "VER", nullable = false, precision = 7, scale = 3)
    private BigDecimal ver;

    @Id
    @Column(name = "SEQ")
    private Integer seq;

    @Column(name = "FILL_KIND", length = 20, nullable = false)
    private String fillKind;

    /** {@code TB_MDM_COLUMN.PHYS_NAME} 을 가리키는 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "COLUMN_PHYS", length = 50)
    private String columnPhys;

    /** {@code TB_MDM_UNIT.UNIT_CODE} 를 가리키는 FK. 원시 필드로만 둔다(불변 규칙 9). */
    @Column(name = "TRANS_UNIT", length = 20)
    private String transUnit;

    @Column(name = "UNIT_ITEM", length = 50)
    private String unitItem;

    @Column(name = "NUM_FORMAT", length = 50)
    private String numFormat;

    @Column(name = "DEFAULT_VALUE", length = 50)
    private String defaultValue;

    @Column(name = "FILLER_LENGTH")
    private Integer fillerLength;

    /** 예약어 칼럼(D1, 불변 규칙 7). */
    @Column(name = "`OFFSET`", nullable = false)
    private int offset;

    /** 예약어 칼럼(D1, 불변 규칙 7). */
    @Column(name = "`LENGTH`", nullable = false)
    private int length;

    protected MdmLayoutItem() {
        // JPA 기본 생성자
    }

    public MdmLayoutItem(Long layoutId, BigDecimal ver, Integer seq, String fillKind) {
        this.layoutId = layoutId;
        this.ver = VersionNumbers.scaled(ver);
        this.seq = seq;
        this.fillKind = fillKind;
    }

    public Long getLayoutId() { return layoutId; }
    public BigDecimal getVer() { return VersionNumbers.scaled(ver); }
    public Integer getSeq() { return seq; }
    public String getFillKind() { return fillKind; }
    public String getColumnPhys() { return columnPhys; }
    public String getTransUnit() { return transUnit; }
    public String getUnitItem() { return unitItem; }
    public String getNumFormat() { return numFormat; }
    public String getDefaultValue() { return defaultValue; }
    public Integer getFillerLength() { return fillerLength; }
    public int getOffset() { return offset; }
    public int getLength() { return length; }

    public void setFillKind(String v) { this.fillKind = v; }
    public void setColumnPhys(String v) { this.columnPhys = v; }
    public void setTransUnit(String v) { this.transUnit = v; }
    public void setUnitItem(String v) { this.unitItem = v; }
    public void setNumFormat(String v) { this.numFormat = v; }
    public void setDefaultValue(String v) { this.defaultValue = v; }
    public void setFillerLength(Integer v) { this.fillerLength = v; }
    public void setOffset(int v) { this.offset = v; }
    public void setLength(int v) { this.length = v; }
}
