package com.dongkuk.dmes.mcm.code.dto;

public class SecCodeCategorySearchRequest {
    private String groupCd;
    private String categoryCd;
    private String categoryNm;

    public SecCodeCategorySearchRequest() {}

    public String getGroupCd() { return groupCd; }
    public void setGroupCd(String groupCd) { this.groupCd = groupCd; }
    public String getCategoryCd() { return categoryCd; }
    public void setCategoryCd(String categoryCd) { this.categoryCd = categoryCd; }
    public String getCategoryNm() { return categoryNm; }
    public void setCategoryNm(String categoryNm) { this.categoryNm = categoryNm; }
}
