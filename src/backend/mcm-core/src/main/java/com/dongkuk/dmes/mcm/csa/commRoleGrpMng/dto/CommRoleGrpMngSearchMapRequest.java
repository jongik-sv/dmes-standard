/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleGrpMng searchCmRoleGrpMap / searchCmRole / searchCmRoleGrpMenu 공용 입력 DTO — 단일 ROLE_GROUP_ID 파라미터
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto;

/**
 * commRoleGrpMng 의 3 action 공용 입력 DTO — 단일 {@code ROLE_GROUP_ID} 파라미터:
 * <ul>
 *   <li>{@code searchCmRoleGrpMap} — 선택 역할 그룹의 매핑 역할 조회 (xml:96)</li>
 *   <li>{@code searchCmRole} — 미매핑 전체 역할 조회 (NOT EXISTS 서브쿼리 키 — xml:141)</li>
 *   <li>{@code searchCmRoleGrpMenu} — 매핑 역할이 보유한 메뉴 트리 조회 (CTE WHERE 키 — xml:163)</li>
 * </ul>
 *
 * <p>As-Is xfdl:478 / 499 / 511 — {@code ds_main.getColumn(rowposition, "ROLE_GROUP_ID")} 단일 파라미터 전달.
 *
 * <p>BPMN serviceTask 3 개의 dto property 공용 — OASIS executor 가 CactusRequest body 의 {@code params} 를 본 DTO 로 변환.
 *
 * <p>인용: 분석리포트 §6 #5 / #9 / #10 / 기능설계서 §5.2 / BPMN설계서 §2.4 / §2.6 / §2.7.
 */
public class CommRoleGrpMngSearchMapRequest {

    /** 선택된 역할 그룹 ID — TB_MCM_SEC_ROLEGROUP_MAPPING.ROLE_GROUP_ID 검색 키 (xml:96 / xml:141 / xml:163). */
    private String ROLE_GROUP_ID;

    public CommRoleGrpMngSearchMapRequest() {}

    public String getROLE_GROUP_ID() { return ROLE_GROUP_ID; }
    public void setROLE_GROUP_ID(String ROLE_GROUP_ID) { this.ROLE_GROUP_ID = ROLE_GROUP_ID; }
}
