/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleGrpMng searchCmRoleGrp 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 3 파라미터)
 */
package com.dongkuk.dmes.mcm.csa.commRoleGrpMng.dto;

/**
 * commRoleGrpMng {@code searchCmRoleGrp} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_search} 의 sArgument = {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집:
 * <ul>
 *   <li>{@code edt_ROLE_GROUP_ID} — S-002 (UPPER LIKE ROLE_GROUP_ID)</li>
 *   <li>{@code edt_ROLE_GROUP_NM} — S-003 (UPPER LIKE ROLE_GROUP_NM)</li>
 *   <li>{@code cbo_USE_TP} — S-004 (USE_TP 일치)</li>
 *   <li>{@code cbo_bizSystemCode} — S-001 (As-Is BIZ_SYSTEM_CODE) — <b>To-Be 정책 #1 폐기</b></li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmRoleGrpTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환 (가이드 §6-E-2 / W1·W2·W3 정본 패턴).
 *
 * <p>인용: 분석리포트 §3.2 / §6 #1 / 기능설계서 §3.1 / BPMN설계서 §2.2.
 */
public class CommRoleGrpMngSearchRequest {

    /** S-002 — 역할 그룹 ID UPPER LIKE 부분 일치 (xml:22). */
    private String edtROLEGROUPID;

    /** S-003 — 역할 그룹명 UPPER LIKE 부분 일치 (xml:25). */
    private String edtROLEGROUPNM;

    /** S-004 — 사용 여부 (Y/N 일치 / 빈 값 = 전체) (xml:28). */
    private String cboUSETP;

    public CommRoleGrpMngSearchRequest() {}

    public String getEdtROLEGROUPID() { return edtROLEGROUPID; }
    public void setEdtROLEGROUPID(String edtROLEGROUPID) { this.edtROLEGROUPID = edtROLEGROUPID; }

    public String getEdtROLEGROUPNM() { return edtROLEGROUPNM; }
    public void setEdtROLEGROUPNM(String edtROLEGROUPNM) { this.edtROLEGROUPNM = edtROLEGROUPNM; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }
}
