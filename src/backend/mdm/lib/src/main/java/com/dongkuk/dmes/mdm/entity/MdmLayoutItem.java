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

    /** 옛 방언의 예약어 칼럼(D1, 불변 규칙 7). Oracle 에서는 예약어가 아니라 따옴표 없이 쓴다 — 백틱이면 Spring 이름 전략이 소문자 "offset" 로 따옴표를 남겨 V1 의 대문자 칼럼과 어긋난다(ORA-00904). */
    @Column(name = "OFFSET", nullable = false)
    private int offset;

    /** 옛 방언의 예약어 칼럼(D1, 불변 규칙 7). Oracle 에서는 예약어가 아니라 따옴표 없이 쓴다 — 백틱이면 Spring 이름 전략이 소문자 "offset" 로 따옴표를 남겨 V1 의 대문자 칼럼과 어긋난다(ORA-00904). */
    @Column(name = "LENGTH", nullable = false)
    private int length;

    /*
     * 확정 고정값(D-151, V22) — 확정이 그 버전 항목 행 전부를 고정 표시(PINNED_YN 'Y')하고 확정 시점 사전 유효값(도메인 최상위 타입·
     * 소수·단위, 없으면 NULL)을 쓰며, 확정 취소가 표시와 값을 비운다. DRAFT 는 'N'·NULL 이다. 고정 표시 행은 NULL 까지 이 값으로 합성하고,
     * 아닌 행은 지금 사전을 읽는다. 쓰기는 네이티브 UPDATE({@code LayoutVersionStore#markPinned}·{@code pinColumnAttrs}·
     * {@code clearColumnAttrs})만 한다 — insertable·updatable 을 끈다: 다른 칸이 바뀐 엔티티를 flush 하면 Hibernate 가 행 전체를
     * UPDATE 해 네이티브로 쓴 고정값을 옛 값으로 덮는다({@code MdmLayoutVer} 확정 기록 칸과 같은 선례). 새 항목은 늘 'N'·NULL 로
     * 들어간다(새 버전 복사도 옮기지 않는다).
     */

    /** 확정 고정 타입 — {@code TB_MDM_DOMAIN.DATA_TYPE}(최상위 조상) 값. */
    @Column(name = "DATA_TYPE", length = 20, insertable = false, updatable = false)
    private String dataType;

    /** 확정 고정 단위 — {@code TB_MDM_UNIT.UNIT_CODE} FK. */
    @Column(name = "UNIT_CODE", length = 20, insertable = false, updatable = false)
    private String unitCode;

    /** 확정 고정 소수 자릿수. */
    @Column(name = "SCALE", insertable = false, updatable = false)
    private Integer scale;

    /** 고정 표시 Y·N(DB 기본 'N') — 세 값이 실제로 NULL 일 수 있어 값만으로는 "NULL 로 고정" 과 "고정한 적 없음" 을 가를 수 없다. */
    @Column(name = "PINNED_YN", length = 1, insertable = false, updatable = false)
    private String pinnedYn;

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
    public String getDataType() { return dataType; }
    public String getUnitCode() { return unitCode; }
    public Integer getScale() { return scale; }
    public boolean isPinned() { return "Y".equals(pinnedYn); }

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
