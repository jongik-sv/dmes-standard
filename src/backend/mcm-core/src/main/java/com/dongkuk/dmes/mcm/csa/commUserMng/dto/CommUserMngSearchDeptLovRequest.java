/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-04
 * 내용: commUserMng searchDeptLov 액션의 입력 DTO — Detail 부서 LoV (DEPT_CD/DEPT_NM 검색 모달)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code searchDeptLov} action 의 입력 DTO (2026-06-04 신설 — 사용자 결정).
 *
 * <p>Detail 영역 부서코드 Input 을 직접 타이핑 ✗ → 검색 버튼 + LoV 모달 패턴으로 전환.
 * 모달 그리드: DEPT_CD / DEPT_NM (TB_MCM_DEPT_INFO 조회, UPPER LIKE 부분 일치).
 * 선택 시 DEPT_CD + DEPT_NM 자동 세트.
 *
 * <p>참고 패턴: commRoleMng round 3 {@code searchObjectLov} action — sub2 OBJECT-LoV 의 LoV 모달 정합.
 *
 * <p>BPMN serviceTask {@code searchDeptLovTask} 의 dto property.
 *
 * <ul>
 *   <li>{@code keyword} — DEPT_CD 또는 DEPT_NM 부분 검색어 (UPPER LIKE).
 *       빈 값 → USE_TP='Y' 전체 반환.</li>
 * </ul>
 *
 * <p>Cactus camelCase 정합 (FE 의 {@code keyword} 그대로 매핑) — W1·W2·W3 정본 패턴.
 */
public class CommUserMngSearchDeptLovRequest {

    /** DEPT_CD 또는 DEPT_NM 부분 검색어 (UPPER LIKE). 빈 값 = 전체. */
    private String keyword;

    public CommUserMngSearchDeptLovRequest() {}

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
}
