/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: commUserMng searchActiveUserLov 액션의 입력 DTO — 받을 사람 고르기(활성·잠금 사용자 검색)
 */
package com.dongkuk.dmes.mcm.csa.commUserMng.dto;

/**
 * commUserMng {@code searchActiveUserLov} action 입력. 퇴직 처리·담당 데이터 인계 팝업의 「받을 사람」 찾기가 쓴다.
 *
 * <ul>
 *   <li>{@code keyword} — USER_ID·사번·이름 앞부분 일치(대소문자 무시). 빈 값 = 전체(상한까지).</li>
 * </ul>
 *
 * <p>이름은 {@code searchDeptLov} 의 {@code keyword} 와 같은 camelCase 다(FE 값을 그대로 묶는다).
 */
public class CommUserMngSearchUserLovRequest {

    /** USER_ID·USER_EMP_NO·USER_NM 앞부분 검색어. 빈 값 = 전체. */
    private String keyword;

    public CommUserMngSearchUserLovRequest() {}

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
}
