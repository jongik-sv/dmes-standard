package com.dongkuk.dmes.mdm.dma.unitMng.dto;

/** {@code unitMng} action={@code search} 요청 — 기능설계서 §3 S-001·S-002. */
public class UnitSearchRequest {

    /** S-001 — UNIT_CODE 부분 일치. */
    private String unitCode;

    /** S-002 — DIMENSION 일치(빈 값이면 전체). */
    private String dimension;

    public String getUnitCode() { return unitCode; }
    public String getDimension() { return dimension; }

    public void setUnitCode(String v) { this.unitCode = v; }
    public void setDimension(String v) { this.dimension = v; }
}
