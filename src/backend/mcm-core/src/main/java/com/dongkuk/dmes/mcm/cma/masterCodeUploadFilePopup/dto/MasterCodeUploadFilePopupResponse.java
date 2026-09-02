/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup search 응답 DTO — As-Is ds_GetCodeUploadList 7 컬럼 1:1.
 *       반환 컬럼: MASTER_CODE / CATEGORY_ID / CODE_VAL / CODE_VAL_MEAN / CODE_VAL_DESC / CODE_VER / SORT_SEQ
 *       (분석 §6.1 SELECT 본문 1:1 인용).
 *
 *       NOTE: As-Is ds_grdDownload 6 컬럼 (CODE_VER 미포함 — 의도된 누락, 분석 §3.4)
 *             — 본 응답은 7 컬럼 전수 반환하고 FE 측에서 Excel export 시 CODE_VER 제외.
 */
package com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.dto;

public class MasterCodeUploadFilePopupResponse {

    private String masterCode;
    private String categoryId;
    private String codeVal;
    private String codeValMean;
    private String codeValDesc;
    private String codeVer;
    private String sortSeq;

    public MasterCodeUploadFilePopupResponse() {}

    public String getMasterCode() { return masterCode; }
    public void setMasterCode(String masterCode) { this.masterCode = masterCode; }
    public String getCategoryId() { return categoryId; }
    public void setCategoryId(String categoryId) { this.categoryId = categoryId; }
    public String getCodeVal() { return codeVal; }
    public void setCodeVal(String codeVal) { this.codeVal = codeVal; }
    public String getCodeValMean() { return codeValMean; }
    public void setCodeValMean(String codeValMean) { this.codeValMean = codeValMean; }
    public String getCodeValDesc() { return codeValDesc; }
    public void setCodeValDesc(String codeValDesc) { this.codeValDesc = codeValDesc; }
    public String getCodeVer() { return codeVer; }
    public void setCodeVer(String codeVer) { this.codeVer = codeVer; }
    public String getSortSeq() { return sortSeq; }
    public void setSortSeq(String sortSeq) { this.sortSeq = sortSeq; }
}
