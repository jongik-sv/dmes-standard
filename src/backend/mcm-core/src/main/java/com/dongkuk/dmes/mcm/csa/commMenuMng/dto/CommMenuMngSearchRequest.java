/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commMenuMng searchCmMenu 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 4 파라미터)
 */
package com.dongkuk.dmes.mcm.csa.commMenuMng.dto;

/**
 * commMenuMng {@code searchCmMenu} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_search} 의 sArgument = {@code gfn_scanOpenerComponent(div_search.form)} 자동 수집 (xfdl:464):
 * <ul>
 *   <li>{@code edt_MENU_ID}        — S-002 (UPPER LIKE MENU_ID)</li>
 *   <li>{@code p_MENU_ID}          — GT-001 트리 click 시 전달 (정확 일치)</li>
 *   <li>{@code edt_MENU_NM}        — S-003 (LIKE MENU_NM)</li>
 *   <li>{@code cbo_USE_TP}         — S-004 (USE_TP 일치)</li>
 *   <li>{@code cbo_bizSystemCode}  — S-001 (As-Is BIZ_SYSTEM_CODE) — <b>To-Be 정책 #1 폐기</b></li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchCmMenuTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환 (가이드 §6-E-2 / W1 commObjMng 정본 패턴).
 *
 * <p>인용: 분석리포트 §3.2 / §4.4 #8 / §6 #1 / 기능설계서 §3.1 / BPMN설계서 §5.1.
 */
public class CommMenuMngSearchRequest {

    /** S-002 — 메뉴 ID UPPER LIKE 부분 일치 (xml:28). */
    private String edtMENUID;

    /** GT-001 트리 click 시 전달 — MENU_ID 정확 일치 (xml:32). 트리 click 외에는 null. */
    private String pMENUID;

    /** S-003 — 메뉴 명 LIKE 부분 일치 (xml:35). */
    private String edtMENUNM;

    /** S-004 — 사용 유무 (Y/N 일치 / 빈 값 = 전체) (xml:38). */
    private String cboUSETP;

    public CommMenuMngSearchRequest() {}

    public String getEdtMENUID() { return edtMENUID; }
    public void setEdtMENUID(String edtMENUID) { this.edtMENUID = edtMENUID; }

    public String getPMENUID() { return pMENUID; }
    public void setPMENUID(String pMENUID) { this.pMENUID = pMENUID; }

    public String getEdtMENUNM() { return edtMENUNM; }
    public void setEdtMENUNM(String edtMENUNM) { this.edtMENUNM = edtMENUNM; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }
}
