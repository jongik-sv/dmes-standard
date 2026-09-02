/*
 * 작성자: Agent
 * 작성일: 2026-05-28
 * 내용: masterCodeUploadFilePopup search 요청 DTO — As-Is `pCodeId` 단일 파라미터 (xfdl:192).
 */
package com.dongkuk.dmes.mcm.cma.masterCodeUploadFilePopup.dto;

public class MasterCodeUploadFilePopupSearchRequest {

    /** As-Is `pCodeId` — 호출자가 넘긴 MASTER_CODE */
    private String pCodeId;

    public MasterCodeUploadFilePopupSearchRequest() {}

    public String getPCodeId() { return pCodeId; }
    public void setPCodeId(String pCodeId) { this.pCodeId = pCodeId; }
}
