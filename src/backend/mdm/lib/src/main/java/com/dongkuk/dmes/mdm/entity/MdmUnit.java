package com.dongkuk.dmes.mdm.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;

/**
 * 단위 원장 — {@code TB_MDM_UNIT}(TSK-04-01 design.md §2, ERD {@code 02-term-domain-column.sql}).
 *
 * <p>PK 는 서버·화면이 정하는 코드값({@code UNIT_CODE})이라 채번 전략이 없다(mls {@code Notice} 와 같은 모양).
 * 감사 9칼럼은 {@link CactusAuditEntity} 상속으로 얻는다(재선언 금지, 불변 규칙 4). mdm 은 MES 모듈이라
 * {@code @ManyToOne}/{@code @OneToMany} 연관관계 매핑을 쓰지 않는다(불변 규칙 9) — 이 엔티티는 FK 대상이
 * 아니므로 해당 없음.
 */
@Entity
@Table(name = "TB_MDM_UNIT")
public class MdmUnit extends CactusAuditEntity {

    @Id
    @Column(name = "UNIT_CODE", length = 20, nullable = false)
    private String unitCode;

    @Column(name = "DIMENSION", length = 50, nullable = false)
    private String dimension;

    @Column(name = "BASE_UNIT", length = 20, nullable = false)
    private String baseUnit;

    @Column(name = "FACTOR", precision = 18, scale = 9, nullable = false)
    private BigDecimal factor;

    /** 원시 long — Hibernate INSERT 는 매핑 칼럼을 전부 명시하므로 DB DEFAULT(0)에 기대지 않는다. */
    @Column(name = "CHG_SEQ", nullable = false)
    private long chgSeq;

    protected MdmUnit() {
        // JPA 기본 생성자
    }

    public MdmUnit(String unitCode) {
        this.unitCode = unitCode;
    }

    public String getUnitCode() { return unitCode; }
    public String getDimension() { return dimension; }
    public String getBaseUnit() { return baseUnit; }
    public BigDecimal getFactor() { return factor; }
    public long getChgSeq() { return chgSeq; }

    public void setUnitCode(String v) { this.unitCode = v; }
    public void setDimension(String v) { this.dimension = v; }
    public void setBaseUnit(String v) { this.baseUnit = v; }
    public void setFactor(BigDecimal v) { this.factor = v; }
    public void setChgSeq(long v) { this.chgSeq = v; }
}
