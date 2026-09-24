package com.dongkuk.dmes.mdm.dma.unitMng.dto;

import java.math.BigDecimal;

/** {@code unitMng} 그리드 행 — 기능설계서 §3.2 G-001~G-004(G-005 는 클라이언트 계산). */
public class UnitRow {

    private String unitCode;
    private String dimension;
    private String baseUnit;
    private BigDecimal factor;

    public UnitRow() {
    }

    public UnitRow(String unitCode, String dimension, String baseUnit, BigDecimal factor) {
        this.unitCode = unitCode;
        this.dimension = dimension;
        this.baseUnit = baseUnit;
        this.factor = factor;
    }

    public String getUnitCode() { return unitCode; }
    public String getDimension() { return dimension; }
    public String getBaseUnit() { return baseUnit; }
    public BigDecimal getFactor() { return factor; }

    public void setUnitCode(String v) { this.unitCode = v; }
    public void setDimension(String v) { this.dimension = v; }
    public void setBaseUnit(String v) { this.baseUnit = v; }
    public void setFactor(BigDecimal v) { this.factor = v; }
}
