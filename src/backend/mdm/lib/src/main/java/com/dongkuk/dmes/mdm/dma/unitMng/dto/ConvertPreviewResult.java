package com.dongkuk.dmes.mdm.dma.unitMng.dto;

import java.math.BigDecimal;

/** {@code unitMng} action={@code compare} 응답 — 불변 규칙 I2, 서버가 유일한 계산 근원. */
public class ConvertPreviewResult {

    private BigDecimal value;
    private String fromUnitCode;
    private String toUnitCode;
    private String dimension;

    public ConvertPreviewResult() {
    }

    public ConvertPreviewResult(BigDecimal value, String fromUnitCode, String toUnitCode, String dimension) {
        this.value = value;
        this.fromUnitCode = fromUnitCode;
        this.toUnitCode = toUnitCode;
        this.dimension = dimension;
    }

    public BigDecimal getValue() { return value; }
    public String getFromUnitCode() { return fromUnitCode; }
    public String getToUnitCode() { return toUnitCode; }
    public String getDimension() { return dimension; }

    public void setValue(BigDecimal v) { this.value = v; }
    public void setFromUnitCode(String v) { this.fromUnitCode = v; }
    public void setToUnitCode(String v) { this.toUnitCode = v; }
    public void setDimension(String v) { this.dimension = v; }
}
