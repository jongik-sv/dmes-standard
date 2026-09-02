/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng pwdinit (비밀번호/SSO 초기화) 입력 DTO — USER_ID + USER_EMP_NO + SSO_RESET_FLAG
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code pwdinit} action 의 입력 DTO — 비밀번호 초기화 / SSO 비밀번호 초기화.
 *
 * <p>As-Is xfdl:625~633 — sArgs = {@code USER_ID + USER_EMP_NO + SSO_RESET_FLAG="Y"}.
 *
 * <p>PasswordInit.java:31 분기:
 * <ul>
 *   <li>{@code SSO_RESET_FLAG="Y"} → ds_main for-loop 모두에 대해 updateCommonSSOPwdInit (SSO 전체 초기화)</li>
 *   <li>그 외 → 단건 mergeCommonPwdInit (USER_ENC_PWD + USER_SSO_PWD bcrypt)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code pwdinitTask} 의 dto property — OASIS executor 가 변환.
 *
 * <p>인용: 분석리포트 §4.6 / §7.5 / §11.0 P-3-F (정책 #3 (F)) / 기능설계서.
 */
public class CommUserMngPwdInitRequest {

    /** 단건 초기화 대상 사용자 ID (SSO_RESET_FLAG ≠ "Y" 분기). */
    private String USER_ID;

    /** 단건 초기화 대상 사번 (USER_SSO_PWD = bcrypt(USER_ID + USER_EMP_NO) 생성용). */
    private String USER_EMP_NO;

    /** SSO 일괄 초기화 플래그 — "Y" 인 경우 ds_main for-loop SSO 전체 초기화. */
    private String SSO_RESET_FLAG;

    public CommUserMngPwdInitRequest() {}

    public String getUSER_ID() { return USER_ID; }
    public void setUSER_ID(String USER_ID) { this.USER_ID = USER_ID; }

    public String getUSER_EMP_NO() { return USER_EMP_NO; }
    public void setUSER_EMP_NO(String USER_EMP_NO) { this.USER_EMP_NO = USER_EMP_NO; }

    public String getSSO_RESET_FLAG() { return SSO_RESET_FLAG; }
    public void setSSO_RESET_FLAG(String SSO_RESET_FLAG) { this.SSO_RESET_FLAG = SSO_RESET_FLAG; }
}
