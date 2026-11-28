/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commObjMng searchCmObj 액션의 입력 DTO — 조회 조건 (To-Be 정책 #1 폐기 후 2 파라미터)
 * 수정일: 2026-11-26 — SYSTEM / OBJECT TYPE / 접속 경로 조회 조건 3개 추가 (5 파라미터)
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
 * <p>2026-11-26 To-Be 추가 조건 (As-Is 에 없음):
 * <ul>
 *   <li>{@code cboSYSTEMCODE} — SYSTEM_CODE 일치</li>
 *   <li>{@code edtOBJECTTYPE} — OBJECT_TYPE UPPER LIKE 부분 일치 (자유 입력 값이라 일치 대신 부분 일치)</li>
 *   <li>{@code cboACCESSTP} — ACCESS_TP ("내부"/"외부") 일치</li>
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

    /** 메뉴 폴더 MENU_ID — 비면 전체, 값이 있으면 그 폴더(하위 포함)의 메뉴가 가리키는 오브젝트만(퍼미션 모델 v2). */
    private String menuFolderId;

    /** 2026-11-26 — SYSTEM_CODE 일치 (빈 값 = 전체). */
    private String cboSYSTEMCODE;

    /** 2026-11-26 — OBJECT_TYPE UPPER LIKE 부분 일치 (빈 값 = 전체). */
    private String edtOBJECTTYPE;

    /** 2026-11-26 — 접속 경로 ACCESS_TP 일치 ("내부"/"외부", 빈 값 = 전체). */
    private String cboACCESSTP;

    public CommObjMngSearchRequest() {}

    public String getEdtOBJECTID() { return edtOBJECTID; }
    public void setEdtOBJECTID(String edtOBJECTID) { this.edtOBJECTID = edtOBJECTID; }

    public String getCboUSETP() { return cboUSETP; }
    public void setCboUSETP(String cboUSETP) { this.cboUSETP = cboUSETP; }

    public String getMenuFolderId() { return menuFolderId; }
    public void setMenuFolderId(String menuFolderId) { this.menuFolderId = menuFolderId; }

    public String getCboSYSTEMCODE() { return cboSYSTEMCODE; }
    public void setCboSYSTEMCODE(String cboSYSTEMCODE) { this.cboSYSTEMCODE = cboSYSTEMCODE; }

    public String getEdtOBJECTTYPE() { return edtOBJECTTYPE; }
    public void setEdtOBJECTTYPE(String edtOBJECTTYPE) { this.edtOBJECTTYPE = edtOBJECTTYPE; }

    public String getCboACCESSTP() { return cboACCESSTP; }
    public void setCboACCESSTP(String cboACCESSTP) { this.cboACCESSTP = cboACCESSTP; }
}
