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

    /** false 면 본문(CONTENT)을 싣지 않는다. 비면 true(기존 응답과 같다). */
    private Boolean includeContent;

    /** 값이 있으면 그 공지 1건의 상세(본문 포함)만 돌려준다. 목록과 같은 가시성 조건이 걸린다. */
    private String noticeId;

    public Integer getLimit() { return limit; }

    public void setLimit(Integer v) { this.limit = v; }

    public Boolean getIncludeContent() { return includeContent; }

    public void setIncludeContent(Boolean v) { this.includeContent = v; }

    public String getNoticeId() { return noticeId; }

    public void setNoticeId(String v) { this.noticeId = v; }
}
