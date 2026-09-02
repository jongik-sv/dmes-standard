/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commMenuMng searchObj 액션의 입력 DTO — 선택 메뉴의 OBJECT_ID 단건
 */
package com.dongkuk.dmes.mcm.csa.commMenuMng.dto;

/**
 * commMenuMng {@code searchObj} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_searchObj} 의 sArgument = {@code "OBJECT_ID=" + vObjId} (xfdl:758~766):
 * <ul>
 *   <li>{@code OBJECT_ID} — 선택 메뉴 row 의 OBJECT_ID (G-NNN oncellclick 또는 fn_callBack searchCmMenu 자동 전달)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchObjTask} 의 dto property.
 *
 * <p>인용: 분석리포트 §4.4 #20 / §6 #7 / 기능설계서 §5.2 / BPMN설계서 §5.4.
 */
public class CommMenuMngSearchObjRequest {

    /** 선택 메뉴의 OBJECT_ID — TB_MCM_SEC_OBJ.OBJECT_ID 단건 검색 키 (xml:153). */
    private String OBJECT_ID;

    public CommMenuMngSearchObjRequest() {}

    public String getOBJECT_ID() { return OBJECT_ID; }
    public void setOBJECT_ID(String OBJECT_ID) { this.OBJECT_ID = OBJECT_ID; }
}
