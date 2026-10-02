/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: noticeBoard action=search 요청 DTO — 포털 홈 공지 목록 (모든 로그인 사용자)
 */
package com.dongkuk.dmes.mls.lsh.noticeBoard.dto;

/**
 * {@code noticeBoard} action={@code search} 요청 DTO.
 *
 * <p>홈 화면은 조건 없이 부르므로 빈 봉투({@code params: {}})가 기본이다. 받는 값은 건수 하나뿐이다 —
 * 모든 로그인 사용자가 부르는 경로라 게시상태·기준일처럼 조회 범위를 넓히는 값은 받지 않는다(서비스가 고정한다).
 *
 * <p>plain class + getter/setter — noticeMgmt DTO 와 같은 관행이다.
 */
public class NoticeBoardSearchRequest {

    /** 최대 건수. 비었거나 1 미만이면 50, 50 을 넘으면 50 으로 자른다. */
    private Integer limit;

    public Integer getLimit() { return limit; }

    public void setLimit(Integer v) { this.limit = v; }
}
