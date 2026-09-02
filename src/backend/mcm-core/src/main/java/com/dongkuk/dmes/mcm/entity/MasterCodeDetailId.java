package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * MasterCodeDetail PK 복합키 — (MASTER_CODE, CATEGORY_ID, CODE_VAL).
 *
 * <p>인용: 분석 §9.2 (3 컬럼 복합 PK) / Mapper {@code UpdateTbMcmCodeDetail} WHERE
 * (xml:197~199) / {@code DeleteTbMcmCodeDetail} WHERE (xml:204~206).
 */
@Embeddable
public class MasterCodeDetailId implements Serializable {

    @Column(name = "MASTER_CODE", length = 50, nullable = false)
    private String masterCode;

    @Column(name = "CATEGORY_ID", length = 180, nullable = false)
    private String categoryId;

    @Column(name = "CODE_VAL", length = 50, nullable = false)
    private String codeVal;

    public MasterCodeDetailId() {}

    public MasterCodeDetailId(String masterCode, String categoryId, String codeVal) {
        this.masterCode = masterCode;
        this.categoryId = categoryId;
        this.codeVal = codeVal;
    }

    public String getMasterCode() { return masterCode; }
    public void setMasterCode(String masterCode) { this.masterCode = masterCode; }

    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }

    public String getCodeVal() { return codeVal; }
    public void setCodeVal(String codeVal) { this.codeVal = codeVal; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MasterCodeDetailId other)) return false;
        return Objects.equals(masterCode, other.masterCode)
                && Objects.equals(categoryId, other.categoryId)
                && Objects.equals(codeVal, other.codeVal);
    }

    @Override
    public int hashCode() { return Objects.hash(masterCode, categoryId, codeVal); }
}
