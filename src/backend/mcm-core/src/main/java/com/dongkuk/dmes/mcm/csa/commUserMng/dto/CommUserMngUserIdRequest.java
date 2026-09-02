/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng searchUserRoleGrp / searchRoleGrp 공용 입력 DTO — 단일 USER_ID 파라미터
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng 의 2 action 공용 입력 DTO — 단일 {@code USER_ID} 파라미터:
 * <ul>
 *   <li>{@code searchUserRoleGrp} — 선택 사용자의 보유 역할그룹 조회 (xml:158 WHERE USER_ID = #{USER_ID})</li>
 *   <li>{@code searchRoleGrp} — 추가 가능 역할그룹 조회 (xml:191~193 NOT EXISTS USER_ID subquery)</li>
 * </ul>
 *
 * <p>As-Is xfdl:607 / 620 — {@code USER_ID=ds_main.rowposition.USER_ID} 단일 파라미터 전달.
 *
 * <p>BPMN serviceTask 의 dto property 공용 — OASIS executor 가 CactusRequest body 의 {@code params} 를 본 DTO 로 변환.
 *
 * <p>인용: 분석리포트 §4.6 / §6 #10 / #13 / 기능설계서 §5.2.
 */
public class CommUserMngUserIdRequest {

    /** 선택된 사용자 ID — TB_MCM_SEC_USER_MAPPING.USER_ID 검색 키 (xml:158 / xml:191). */
    private String USER_ID;

    public CommUserMngUserIdRequest() {}

    public String getUSER_ID() { return USER_ID; }
    public void setUSER_ID(String USER_ID) { this.USER_ID = USER_ID; }
}
