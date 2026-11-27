/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleMng searchCmRoleMap 액션의 입력 DTO — 선택 역할의 현재 권한 조회
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.dto;

/**
 * commRoleMng {@code searchCmRoleMap} action 의 입력 DTO.
 *
 * <p>As-Is xfdl:393~402 — {@code ds_main.ROLE_ID} 단일 파라미터 전달(2026-11-27 새 키 {@code roleId} 도 받는다):
 * <ul>
 *   <li>{@code ROLE_ID} — 선택된 역할의 ROLE_ID (TB_MCM_SEC_ROLE_MAPPING.ROLE_ID WHERE 조건)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmRoleMapTask} 의 dto property.
 *
 * <p>인용: 분석리포트 §6 #5 / 기능설계서 §5.3 / BPMN설계서 §2.3.
 */
public class CommRoleMngSearchRoleMapRequest {

    /** 선택된 역할 ID — 옛 요청 키(ROLE_ID). 새 FE 는 {@link #roleId} 를 보낸다. */
    private String ROLE_ID;

    /** 선택된 역할 ID — 새 요청 키(perm-bench 계약). 비면 {@link #ROLE_ID} 를 쓴다. */
    private String roleId;

    public CommRoleMngSearchRoleMapRequest() {}

    public String getROLE_ID() { return ROLE_ID; }
    public void setROLE_ID(String ROLE_ID) { this.ROLE_ID = ROLE_ID; }

    /** 새 키 roleId 를 먼저, 비면 옛 키 ROLE_ID 를 돌려준다. */
    public String getRoleId() { return roleId != null && !roleId.isBlank() ? roleId : ROLE_ID; }
    public void setRoleId(String roleId) { this.roleId = roleId; }
}
