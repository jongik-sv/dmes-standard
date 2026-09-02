package com.dongkuk.dmes.mcm.cme.masterCodeMngList.dto;

/**
 * Master Code 상세조회 — search action 파라미터.
 *
 * <p>인용: 분석리포트 §4.4 #4 (fn_search) / §6 #1 (GetCodeMasterList) / xfdl:284~300 의 sArgument
 *  = {@code pCodeId} (edt_codeVal.value) + {@code pCodeNm} (edt_codeNm.value).
 *
 * <p>OASIS BPMN serviceTask {@code searchTask} 의 dto property — BPMN executor 가 JSON body
 *  의 params 를 본 DTO 로 변환.
 *
 * <p>본 화면은 cme 그룹 (Master/업무기준(가동)) — 조회 전용. cma masterCodeMng 의
 *  {@code MasterCodeSearchRequest} 와 시그니처 동일하지만 cme 그룹 격리 위해 신규 작성.
 */
public class MasterCodeMngListSearchRequest {

    /** 코드 ID — LIKE 부분 일치 (As-Is 는 CODE_ID OR MASTER_CODE LIKE, xml:32). */
    private String pCodeId;

    /** 코드명 — UPPER 대소문자 무시 LIKE 부분 일치 (xml:35). */
    private String pCodeNm;

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }

    public String getPCodeNm() { return pCodeNm; }
    public void setPCodeNm(String pCodeNm) { this.pCodeNm = pCodeNm; }
}
