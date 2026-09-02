/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserRoleCopy search 액션의 입력 DTO — 단일 파라미터 pUserIdCopy (S-001)
 */
package com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto;

/**
 * commUserRoleCopy {@code search} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_search} (xfdl:299~314) 의 sArgument:
 * {@code gfn_setParam("pUserIdCopy", edt_userIdCopy.value)} 단일 파라미터.
 *
 * <p>BPMN serviceTask {@code searchTask} 의 dto property — OASIS executor 가 CactusRequest body 의
 * {@code params} 를 본 DTO 로 변환 (가이드 §6-E-2 / W1·W2·W3·W4·W5·W6 정본 패턴).
 *
 * <p>USER_ID 또는 USER_EMP_NO 로 Copy 대상 사용자 1명을 식별한다 (SQL OR 조건 / xml:26 / 36).
 *
 * <p>인용: 분석리포트 §3.2 S-001 / §6.1 #2~#4 / 기능설계서 §3.1 / BPMN설계서 §2.2.
 */
public class CommUserRoleCopySearchRequest {

    /** S-001 — Copy 대상 사용자 식별자 (USER_ID 또는 USER_EMP_NO). */
    private String pUserIdCopy;

    public CommUserRoleCopySearchRequest() {}

    public String getPUserIdCopy() { return pUserIdCopy; }
    public void setPUserIdCopy(String pUserIdCopy) { this.pUserIdCopy = pUserIdCopy; }
}
