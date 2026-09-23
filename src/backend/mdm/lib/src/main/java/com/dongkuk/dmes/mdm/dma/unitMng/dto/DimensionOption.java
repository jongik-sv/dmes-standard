package com.dongkuk.dmes.mdm.dma.unitMng.dto;

/**
 * {@code search} 응답에 함께 실리는 "차원별 확립된 base_unit" 후보 — D-002 ComboBox 자동완성용
 * (design.md §2). D2 — 별도 차원 마스터가 없으므로 현재 {@code TB_MDM_UNIT} 행들의 집합적 사실에서 뽑는다.
 */
public class DimensionOption {

    private String dimension;
    private String baseUnit;

    public DimensionOption() {
    }

    public DimensionOption(String dimension, String baseUnit) {
        this.dimension = dimension;
        this.baseUnit = baseUnit;
    }

    public String getDimension() { return dimension; }
    public String getBaseUnit() { return baseUnit; }

    public void setDimension(String v) { this.dimension = v; }
    public void setBaseUnit(String v) { this.baseUnit = v; }
}
