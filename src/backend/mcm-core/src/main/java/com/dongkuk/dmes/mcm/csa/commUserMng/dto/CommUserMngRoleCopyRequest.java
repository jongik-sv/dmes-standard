/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng saveUserRoleGrpCopy (역할그룹 복사) 입력 DTO — USER_ID + USER_ID_COPY + INF_REQ_NO + DESCRIPTION
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code saveUserRoleGrpCopy} action 의 입력 DTO — 다른 사용자의 역할그룹을 본 사용자에 복사.
 *
 * <p>As-Is xfdl:640~648 — sArgs = {@code USER_ID + USER_ID_COPY=edt_role_copy.value + INF_REQ_NO + DESCRIPTION}.
 *
 * <p>처리 (BPMN SaveRoleGroupCopyHis → mergeCommonCopyRoleGrp):
 * <ol>
 *   <li>{@code selectRoleMergeObject} (xml:265~276) — USER_ID_COPY 의 ROLE_GROUP 중 USER_ID 에 없는 것만</li>
 *   <li>각 row 별 TB_MCM_SEC_USER_ROLL_HIS mergePK (RESP_GBN='A')</li>
 *   <li>(CommonInsertTask) mergeCommonCopyRoleGrp (xml:227~242) — TB_MCM_SEC_USER_MAPPING upsert</li>
 * </ol>
 *
 * <p>인용: 분석리포트 §4.6 / §7.7 / §11.0 / 기능설계서.
 */
public class CommUserMngRoleCopyRequest {

    /** 본 사용자 ID (역할 받는 사용자). */
    private String USER_ID;

    /** 역할 출처 사용자 ID (edt_role_copy 입력). */
    private String USER_ID_COPY;

    /** 정보처리의뢰서번호 (D-019). */
    private String INF_REQ_NO;

    /** 처리 사유 (D-020). */
    private String DESCRIPTION;

    public CommUserMngRoleCopyRequest() {}

    public String getUSER_ID() { return USER_ID; }
    public void setUSER_ID(String USER_ID) { this.USER_ID = USER_ID; }

    public String getUSER_ID_COPY() { return USER_ID_COPY; }
    public void setUSER_ID_COPY(String USER_ID_COPY) { this.USER_ID_COPY = USER_ID_COPY; }

    public String getINF_REQ_NO() { return INF_REQ_NO; }
    public void setINF_REQ_NO(String INF_REQ_NO) { this.INF_REQ_NO = INF_REQ_NO; }

    public String getDESCRIPTION() { return DESCRIPTION; }
    public void setDESCRIPTION(String DESCRIPTION) { this.DESCRIPTION = DESCRIPTION; }
}
