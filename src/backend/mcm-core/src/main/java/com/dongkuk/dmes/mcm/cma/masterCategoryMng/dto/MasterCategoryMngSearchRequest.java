package com.dongkuk.dmes.mcm.cma.masterCategoryMng.dto;

/**
 * masterCategoryMng 조회 요청 DTO — 4 동적 LIKE WHERE 파라미터.
 *
 * <p>As-Is xfdl 조회조건 S-002 / S-004 / S-006 / S-008 (분석 §3.2) 와 1:1 매핑.
 *
 * <p>OASIS BPMN 의 {@code searchTask} property dto = 본 클래스 → CactusRequestConverter 가
 * body 의 JSON 을 본 DTO 로 변환해 Service 메서드 인자로 전달.
 */
public class MasterCategoryMngSearchRequest {

    /** S-002 edt_codeVal — TB_MCM_CODE_MASTER.MASTER_CODE LIKE. */
    private String pCodeId;

    /** S-004 edt_codeNm — TB_MCM_CODE_MASTER.CODE_NM LIKE. */
    private String pCodeNm;

    /** S-006 edt_categoryId — TB_MCM_CODE_CATEGORY.CATEGORY_ID LIKE. */
    private String pCategoryId;

    /** S-008 edt_categoryNm — TB_MCM_CODE_CATEGORY.CATEGORY_NM LIKE. */
    private String pCategoryNm;

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPCodeNm() { return pCodeNm; }
    public void setPCodeNm(String pCodeNm) { this.pCodeNm = pCodeNm; }

    public String getPCategoryId() { return pCategoryId; }
    public void setPCategoryId(String pCategoryId) { this.pCategoryId = pCategoryId; }

    public String getPCategoryNm() { return pCategoryNm; }
    public void setPCategoryNm(String pCategoryNm) { this.pCategoryNm = pCategoryNm; }
}
