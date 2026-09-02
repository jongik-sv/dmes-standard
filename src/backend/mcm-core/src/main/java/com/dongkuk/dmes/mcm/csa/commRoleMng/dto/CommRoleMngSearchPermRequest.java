/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleMng searchCmPerm 액션의 입력 DTO — 전체 권한 후보 조회 (선택 ROLE_ID 미할당)
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.dto;

/**
 * commRoleMng {@code searchCmPerm} action 의 입력 DTO.
 *
 * <p>As-Is xfdl:662~665 ({@code fn_permSearch}) + xfdl:758 ({@code ds_main_onrowposchanged}) —
 * {@code ds_main.ROLE_ID} 단일 파라미터 전달:
 * <ul>
 *   <li>{@code ROLE_ID} — 선택된 역할의 ROLE_ID
 *       (NOT EXISTS 서브쿼리에서 본 ROLE_ID 에 미할당 권한만 조회 / xml:152~155)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmPermTask} 의 dto property.
 *
 * <p>인용: 분석리포트 §6 #9 / 기능설계서 §5.3 / BPMN설계서 §2.3.
 */
public class CommRoleMngSearchPermRequest {

    /** 선택된 역할 ID — NOT EXISTS 서브쿼리의 ROLE_ID (xml:154). */
    private String ROLE_ID;

    public CommRoleMngSearchPermRequest() {}

    public String getROLE_ID() { return ROLE_ID; }
    public void setROLE_ID(String ROLE_ID) { this.ROLE_ID = ROLE_ID; }
}
