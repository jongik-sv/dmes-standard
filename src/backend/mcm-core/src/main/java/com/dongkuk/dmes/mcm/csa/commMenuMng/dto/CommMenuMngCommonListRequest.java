/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commMenuMng commonList 액션의 입력 DTO — OBJECT 팝업 LoV 검색어
 */
package com.dongkuk.dmes.mcm.csa.commMenuMng.dto;

/**
 * commMenuMng {@code commonList} action 의 입력 DTO.
 *
 * <p>As-Is commonDynamic.xfdl 내부 검색창 입력값 (P-001 동적 LoV):
 * <ul>
 *   <li>{@code edt_OBJECT_ID} — OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code commonListTask} 의 dto property — As-Is xml:156~168 selectMenuObjPop.
 *
 * <p>인용: 분석리포트 §5 P-001 / §6 #8 / 기능설계서 §9 / BPMN설계서 §5.5.
 */
public class CommMenuMngCommonListRequest {

    /** OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어 (xml:165~166). */
    private String edtOBJECTID;

    public CommMenuMngCommonListRequest() {}

    public String getEdtOBJECTID() { return edtOBJECTID; }
    public void setEdtOBJECTID(String edtOBJECTID) { this.edtOBJECTID = edtOBJECTID; }
}
