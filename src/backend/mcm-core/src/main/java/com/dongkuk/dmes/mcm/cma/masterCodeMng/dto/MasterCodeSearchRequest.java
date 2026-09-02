package com.dongkuk.dmes.mcm.cma.masterCodeMng.dto;

/**
 * Master 그리드 조회 파라미터 — As-Is {@code fn_search} (xfdl:330) 의 sArgument 인용:
 * {@code pCodeId} (edt_codeVal.value) + {@code pCodeNm} (edt_codeNm.value).
 *
 * <p>OASIS BPMN serviceTask {@code searchTask} 의 dto property — BPMN executor 가 JSON
 * body 의 params 를 본 DTO 로 변환.
 */
public class MasterCodeSearchRequest {

    /** 코드 ID — LIKE 부분 일치 (As-Is 는 CODE_ID OR MASTER_CODE LIKE). */
    private String pCodeId;

    /** 코드명 — UPPER 대소문자 무시 LIKE 부분 일치. */
    private String pCodeNm;

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPCodeNm() { return pCodeNm; }
    public void setPCodeNm(String pCodeNm) { this.pCodeNm = pCodeNm; }
}
