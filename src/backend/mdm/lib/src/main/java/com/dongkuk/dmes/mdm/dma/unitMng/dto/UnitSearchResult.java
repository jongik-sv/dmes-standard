package com.dongkuk.dmes.mdm.dma.unitMng.dto;

import java.util.List;

/** {@code unitMng} action={@code search} 응답 — 목록 + 차원별 확립된 기준 단위 후보. */
public class UnitSearchResult {

    private List<UnitRow> list;
    private List<DimensionOption> dimensionOptions;
    /** 환산 미리보기 콤보용 전체 단위(조건·optionsOnly 와 무관). */
    private List<UnitRow> unitOptions;

    public UnitSearchResult() {
    }

    public UnitSearchResult(List<UnitRow> list, List<DimensionOption> dimensionOptions) {
        this.list = list;
        this.dimensionOptions = dimensionOptions;
    }

    public UnitSearchResult(List<UnitRow> list, List<DimensionOption> dimensionOptions, List<UnitRow> unitOptions) {
        this(list, dimensionOptions);
        this.unitOptions = unitOptions;
    }

    public List<UnitRow> getList() { return list; }
    public List<DimensionOption> getDimensionOptions() { return dimensionOptions; }
    public List<UnitRow> getUnitOptions() { return unitOptions; }

    public void setList(List<UnitRow> v) { this.list = v; }
    public void setDimensionOptions(List<DimensionOption> v) { this.dimensionOptions = v; }
    public void setUnitOptions(List<UnitRow> v) { this.unitOptions = v; }
}
