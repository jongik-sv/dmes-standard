/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commPermMng searchCmPerm 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 3 파라미터)
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.dto;

/**
 * commPermMng {@code searchCmPerm} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_run("searchCmPerm")} 의 sArgument =
 * {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집 (xfdl:301):
 * <ul>
 *   <li>{@code edt_PERMISSION_ID} — S-002 (UPPER LIKE PERMISSION_ID)</li>
 *   <li>{@code edt_PERMISSION_NM} — S-003 (UPPER LIKE PERMISSION_NM)</li>
 *   <li>{@code cbo_USE_TP} — S-004 (USE_TP 일치)</li>
 *   <li>{@code cbo_bizSystemCode} — S-001 (As-Is BIZ_SYSTEM_CODE) — <b>To-Be 정책 #1 폐기</b></li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmPermTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환.
 *
 * <p>인용: 분석리포트 §3.2 / §4.4 #5 / §6 #1 / BPMN설계서 §5.1.
 */
public class CommPermMngSearchRequest {

    /** S-002 — PERMISSION ID UPPER LIKE 부분 일치 (xml:27). */
    private String edtPERMISSIONID;

    /** S-003 — PERMISSION 명 UPPER LIKE 부분 일치 (xml:30). */
    private String edtPERMISSIONNM;

    /** S-004 — 사용 여부 (Y/N) 일치 (xml:33). */
    private String cboUSETP;

    public CommPermMngSearchRequest() {}

    public String getEdtPERMISSIONID() { return edtPERMISSIONID; }
    public void setEdtPERMISSIONID(String edtPERMISSIONID) { this.edtPERMISSIONID = edtPERMISSIONID; }

    public String getEdtPERMISSIONNM() { return edtPERMISSIONNM; }
    public void setEdtPERMISSIONNM(String edtPERMISSIONNM) { this.edtPERMISSIONNM = edtPERMISSIONNM; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }
}
