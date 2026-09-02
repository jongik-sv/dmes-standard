/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserMng commonUserDept (부서 팝업 조회) 입력 DTO — 단일 edt_DEPT_CD 파라미터
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code commonUserDept} action 의 입력 DTO — 부서 팝업 조회 (D-007 / LV-005).
 *
 * <p>As-Is FX-006 commonDynamic — cond=edt_DEPT_CD 단일 파라미터 전달.
 * To-Be 정책 #2 / Q-002 해소 — As-Is {@code EAIUSER.IF_DSHRMMCMHD02} 외부 EAI 폐기 →
 * DMES 자체 부서 마스터 {@code MCMAPUSER.TB_MCM_DEPT_INFO} 단독 조회.
 *
 * <p>BPMN serviceTask {@code commonUserDeptTask} 의 dto property — OASIS executor 가 변환.
 *
 * <p>인용: 분석리포트 §4.6 / §6 #18 (selectCommDept) / 기능설계서.
 */
public class CommUserMngDeptRequest {

    /** 부서 키 (DEPT_CD prefix LIKE 또는 DEPT_NM 부분 일치). */
    private String edt_DEPT_CD;

    public CommUserMngDeptRequest() {}

    public String getEdt_DEPT_CD() { return edt_DEPT_CD; }
    public void setEdt_DEPT_CD(String edt_DEPT_CD) { this.edt_DEPT_CD = edt_DEPT_CD; }
}
