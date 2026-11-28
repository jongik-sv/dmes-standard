/*
 * 작성일: 2026-11-26
 * 내용: commMenuMng searchUnplacedObj 액션의 입력 DTO — 메뉴 셋 + OBJECT 검색어
 */
package com.dongkuk.dmes.mcm.csa.commMenuMng.dto;

/**
 * commMenuMng {@code searchUnplacedObj} action 의 입력 DTO — 그 메뉴 셋에 아직 놓이지 않은 OBJECT 목록 조회 조건.
 *
 * <ul>
 *   <li>{@code cboMENUTP} — 메뉴 셋(필수). 지금은 {@code SEC_MENU.MENU_TP}(WEB / MOBIL). 빈 값은 WEB 으로 본다.</li>
 *   <li>{@code edtOBJECTID} — OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어(선택).</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchUnplacedObjTask} 의 dto property.
 */
public class CommMenuMngSearchUnplacedObjRequest {

    /** 메뉴 셋 (MENU_TP). 빈 값 = WEB. */
    private String cboMENUTP;

    /** OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어. 빈 값 = 전체. */
    private String edtOBJECTID;

    public CommMenuMngSearchUnplacedObjRequest() {}

    public String getCboMENUTP() { return cboMENUTP; }
    public void setCboMENUTP(String cboMENUTP) { this.cboMENUTP = cboMENUTP; }

    public String getEdtOBJECTID() { return edtOBJECTID; }
    public void setEdtOBJECTID(String edtOBJECTID) { this.edtOBJECTID = edtOBJECTID; }
}
