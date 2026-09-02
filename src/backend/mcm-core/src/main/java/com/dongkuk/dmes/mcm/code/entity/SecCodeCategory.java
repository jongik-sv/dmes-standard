package com.dongkuk.dmes.mcm.code.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.*;

/**
 * 마스터 코드 카테고리 — TB_SEC_CODE_CATEGORY.
 *
 * <p>{@link SecCodeGroup} 의 하위 분류 메타데이터. {@link SecCodeItem} 의 EXTRA_VAL1 컬럼이
 * 카테고리 코드(CATEGORY_CD)를 참조. 본 엔티티는 (groupCd, categoryCd) 와 함께 categoryNm
 * 등 표시·정렬 메타데이터를 보관.
 */
@Entity
@Table(name = "TB_SEC_CODE_CATEGORY")
public class SecCodeCategory extends McmAuditEntity {

    @EmbeddedId
    private SecCodeCategoryId id;

    @Column(name = "CATEGORY_NM", length = 200)
    private String categoryNm;

    @Column(name = "SORT_ORD")
    private Integer sortOrd;

    @Column(name = "USE_YN", length = 1)
    private String useYn;

    public SecCodeCategoryId getId() { return id; }
    public void setId(SecCodeCategoryId id) { this.id = id; }
    public String getCategoryNm() { return categoryNm; }
    public void setCategoryNm(String categoryNm) { this.categoryNm = categoryNm; }
    public Integer getSortOrd() { return sortOrd; }
    public void setSortOrd(Integer sortOrd) { this.sortOrd = sortOrd; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
