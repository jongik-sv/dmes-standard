/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng searchCmUser 액션의 입력 DTO — 3 조회 파라미터 (S-001 / S-002 / S-003)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code searchCmUser} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_search} 의 sArgument = {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집:
 * <ul>
 *   <li>{@code edt_USER_ID} — S-001 (UPPER LIKE USER_ID / USER_EMP_NO / USER_NM 3 컬럼 OR)</li>
 *   <li>{@code cbo_USE_TP} — S-002 (USE_TP 일치)</li>
 *   <li>{@code cbo_IN_OUT_EMP_TP} — S-003 (IN_OUT_EMP_TP 일치)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmUserTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환 (가이드 §6-E-2 / W1·W2·W3·W4 정본 패턴).
 *
 * <p>인용: 분석리포트 §3.2 / §4.6 / §6 #1 / 기능설계서 §3.1 / BPMN설계서.
 */
public class CommUserMngSearchRequest {

    /** S-001 — 사용자 키 (USER_ID / USER_EMP_NO / USER_NM 3 컬럼 UPPER LIKE OR 부분 일치). */
    private String edtUSERID;

    /** S-002 — 사용 여부 (Y/N 일치 / 빈 값 = 전체). */
    private String cboUSETP;

    /** S-003 — 내부 외부 구분 (I/O 일치 / 빈 값 = 전체). */
    private String cboINOUTEMPTP;

    /** 2026-11-28 — 계정 상태(ACTIVE·LOCKED·SUSPENDED·EXPIRED·RETIRED, 빈 값 = 전체). */
    private String cboUSERST;

    /** 2026-11-28 — 관리 구분(HR = ERP 인사, MANUAL = 수동 관리(외부 구분 O), 빈 값 = 전체). D13. */
    private String cboMANAGETP;

    /** 2026-11-28 — 「비밀번호 미변경」만(Y). 임시 비밀번호 상태 = 마지막 변경일 빈칸. */
    private String chkPWDTEMP;

    /** 2026-11-28 — 「퇴직자가 담당인 데이터만」(Y) — 퇴직자 중 MDM 담당 데이터가 남은 사람. D4. */
    private String chkORPHAN;

    public CommUserMngSearchRequest() {}

    public String getCboUSERST() { return cboUSERST; }
    public void setCboUSERST(String cboUSERST) { this.cboUSERST = cboUSERST; }
    public String getCboMANAGETP() { return cboMANAGETP; }
    public void setCboMANAGETP(String cboMANAGETP) { this.cboMANAGETP = cboMANAGETP; }
    public String getChkPWDTEMP() { return chkPWDTEMP; }
    public void setChkPWDTEMP(String chkPWDTEMP) { this.chkPWDTEMP = chkPWDTEMP; }
    public String getChkORPHAN() { return chkORPHAN; }
    public void setChkORPHAN(String chkORPHAN) { this.chkORPHAN = chkORPHAN; }

    public String getEdtUSERID() { return edtUSERID; }
    public void setEdtUSERID(String edtUSERID) { this.edtUSERID = edtUSERID; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }

    public String getCboINOUTEMPTP() { return cboINOUTEMPTP; }
    public void setCboINOUTEMPTP(String cboINOUTEMPTP) { this.cboINOUTEMPTP = cboINOUTEMPTP; }
}
