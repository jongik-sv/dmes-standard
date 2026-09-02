package com.dongkuk.dmes.mcm.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

import java.io.Serializable;
import java.util.Objects;

/**
 * MasterCodeCategory PK 복합키 — (MASTER_CODE, CATEGORY_ID).
 *
 * <p>인용: 분석 §9.1 ({@code (MASTER_CODE, CATEGORY_ID)} 복합 PK 추정 결론) /
 * Mapper {@code UpdateTbMcmCodeCategory} WHERE (xml:44~45) /
 * {@code DeleteTbMcmCodeCategory} WHERE (xml:50~51).
 *
 * <p>본 컬럼 Type 은 분석리포트 §9.1 sheet36 차용 결정 — MASTER_CODE VARCHAR(50) /
 * CATEGORY_ID VARCHAR(180). 사용자 결정 (분석리포트 §12).
 */
@Embeddable
public class MasterCodeCategoryId implements Serializable {

    /** PK 1 — TB_MCM_CODE_MASTER.CODE_ID 의 FK (분석 §9.2 BR-001). */
    @Column(name = "MASTER_CODE", length = 50, nullable = false)
    private String masterCode;

    /** PK 2 — 카테고리 식별자. */
    @Column(name = "CATEGORY_ID", length = 180, nullable = false)
    private String categoryId;

    public MasterCodeCategoryId() {}

    public MasterCodeCategoryId(String masterCode, String categoryId) {
        this.masterCode = masterCode;
        this.categoryId = categoryId;
    }

    public String getMasterCode() { return masterCode; }
    public void setMasterCode(String masterCode) { this.masterCode = masterCode; }

    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof MasterCodeCategoryId other)) return false;
        return Objects.equals(masterCode, other.masterCode)
                && Objects.equals(categoryId, other.categoryId);
    }

    @Override
    public int hashCode() { return Objects.hash(masterCode, categoryId); }
}
