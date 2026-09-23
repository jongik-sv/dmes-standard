package com.dongkuk.dmes.mdm.dma.unitMng.dto;

/**
 * {@code unitMng} action={@code save} 요청 — 기능설계서 §4 D-001~D-004.
 *
 * <p>{@code factor} 는 문자열로 받는다 — FE TextBox 입력을 그대로 전달하고, 서비스가
 * {@link java.math.BigDecimal}로 파싱하며 형식 오류를 명확한 검증 메시지로 바꾼다.
 */
public class UnitSaveRequest {

    private String unitCode;
    private String dimension;
    private String baseUnit;
    private String factor;

    public String getUnitCode() { return unitCode; }
    public String getDimension() { return dimension; }
    public String getBaseUnit() { return baseUnit; }
    public String getFactor() { return factor; }

    public void setUnitCode(String v) { this.unitCode = v; }
    public void setDimension(String v) { this.dimension = v; }
    public void setBaseUnit(String v) { this.baseUnit = v; }
    public void setFactor(String v) { this.factor = v; }
}
