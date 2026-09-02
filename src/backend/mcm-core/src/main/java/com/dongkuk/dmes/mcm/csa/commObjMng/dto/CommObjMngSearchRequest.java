/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commObjMng searchCmObj 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 2 파라미터)
 */
package com.dongkuk.dmes.mcm.csa.commObjMng.dto;

/**
 * commObjMng {@code searchCmObj} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_run("searchCmObj")} 의 sArgument =
 * {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집 (xfdl:336):
 * <ul>
 *   <li>{@code edt_OBJECT_ID} — S-002 (LIKE OBJECT_ID OR OBJECT_NM)</li>
 *   <li>{@code cbo_USE_TP} — S-003 (USE_TP 일치)</li>
 *   <li>{@code cbo_bizSystemCode} — S-001 (As-Is BIZ_SYSTEM_CODE) — <b>To-Be 정책 #1 폐기</b></li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환.
 *
 * <p>인용: 분석리포트 §3.2 / §4.4 #5 / §6 #1 / BPMN설계서 §5.1.
 */
public class CommObjMngSearchRequest {

    /** S-002 — OBJECT ID (또는 OBJECT_NM) UPPER LIKE 부분 일치. */
    private String edtOBJECTID;

    /** S-003 — 사용 여부 (Y/N) 일치. */
    private String cboUSETP;

    public CommObjMngSearchRequest() {}

    public String getEdtOBJECTID() { return edtOBJECTID; }
    public void setEdtOBJECTID(String edtOBJECTID) { this.edtOBJECTID = edtOBJECTID; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }
}
