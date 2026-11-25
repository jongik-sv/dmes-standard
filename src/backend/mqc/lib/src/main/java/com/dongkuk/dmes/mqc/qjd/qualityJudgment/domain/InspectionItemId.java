package com.dongkuk.dmes.mqc.qjd.qualityJudgment.domain;

import java.io.Serializable;
import java.util.Objects;

/** TB_MQC_COIL_INSP 복합 키(COIL_NO, ITEM_CD). */
public class InspectionItemId implements Serializable {
    private String coilNo;
    private String itemCd;

    public InspectionItemId() {
    }

    public InspectionItemId(String coilNo, String itemCd) {
        this.coilNo = coilNo;
        this.itemCd = itemCd;
    }

    @Override
    public boolean equals(Object o) {
        return o instanceof InspectionItemId other && Objects.equals(coilNo, other.coilNo) && Objects.equals(itemCd, other.itemCd);
    }

    @Override
    public int hashCode() {
        return Objects.hash(coilNo, itemCd);
    }
}
