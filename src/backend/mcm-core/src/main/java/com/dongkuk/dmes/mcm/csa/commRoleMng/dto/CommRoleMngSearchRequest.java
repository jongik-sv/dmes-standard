/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commRoleMng searchCmRole 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 3 파라미터)
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.dto;

/**
 * commRoleMng {@code searchCmRole} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_search} 의 sArgument = {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집:
 * <ul>
 *   <li>{@code edt_ROLE_ID} — S-002 (UPPER LIKE ROLE_ID)</li>
 *   <li>{@code edt_ROLE_NM} — S-003 (UPPER LIKE ROLE_NM)</li>
 *   <li>{@code cbo_USE_TP} — S-004 (USE_TP 일치)</li>
 *   <li>{@code cbo_bizSystemCode} — S-001 (As-Is BIZ_SYSTEM_CODE) — <b>To-Be 정책 #1 폐기</b></li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmRoleTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환 (가이드 §6-E-2 / W1·W2 정본 패턴).
 *
 * <p>인용: 분석리포트 §3.2 / §6 #1 / 기능설계서 §3.1 / BPMN설계서 §2.2.
 */
public class CommRoleMngSearchRequest {

    /** S-002 — 역할 ID UPPER LIKE 부분 일치 (xml:24). */
    private String edtROLEID;

    /** S-003 — 역할 명 UPPER LIKE 부분 일치 (xml:28). */
    private String edtROLENM;

    /** S-004 — 사용 여부 (Y/N 일치 / 빈 값 = 전체) (xml:32). */
    private String cboUSETP;

    public CommRoleMngSearchRequest() {}

    public String getEdtROLEID() { return edtROLEID; }
    public void setEdtROLEID(String edtROLEID) { this.edtROLEID = edtROLEID; }

    public String getEdtROLENM() { return edtROLENM; }
    public void setEdtROLENM(String edtROLENM) { this.edtROLENM = edtROLENM; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }
}
