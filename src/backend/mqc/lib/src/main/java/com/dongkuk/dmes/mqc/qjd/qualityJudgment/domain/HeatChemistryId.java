package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import java.io.Serializable;
import java.util.Objects;

/** TB_MQC_HEAT_CHEM 복합 키(HEAT_NO, ELEM_CD). */
public class HeatChemistryId implements Serializable {
    private String heatNo;
    private String elemCd;

    public HeatChemistryId() {
    }

    public HeatChemistryId(String heatNo, String elemCd) {
        this.heatNo = heatNo;
        this.elemCd = elemCd;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof HeatChemistryId other && Objects.equals(heatNo, other.heatNo) && Objects.equals(elemCd, other.elemCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(heatNo, elemCd);
    }
}
