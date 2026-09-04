/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: noticeMgmt action=search 요청 DTO — 기능설계서 §3 조회조건 S-001~S-004
 */
package com.dongkuk.dmes.mls.lsh.noticeMgmt.dto;

/**
 * {@code noticeMgmt} action={@code search} 요청 DTO.
 *
 * <p>BPMN {@code searchTask} 의 {@code <camunda:property name="dto" .../>} 가 본 클래스 FQCN 을 가리키고,
 * {@code CactusRequestConverter} 가 요청 봉투의 {@code params} 를 본 타입으로 변환해 Service 에 넘긴다.
 *
 * <p><b>plain class + getter/setter</b> — record 도 Lombok 도 쓰지 않는다. mcm cma
 * {@code MasterCategoryMngSearchRequest} 와 동일한 관행이며, OASIS 바인딩이 파라미터명
 * ({@code -parameters} 컴파일 옵션)에 의존하므로 생성자 시그니처를 단순하게 유지한다.
 *
 * <p>필드는 기능설계서 §3 의 S-NNN 과 1:1 이다. 미입력 조건은 FE 가 빈 문자열로 보내며
 * {@code NoticeRepository.searchByFilter} 의 null-guard 가 흡수한다.
 */
public class NoticeMgmtSearchRequest {

    /** S-001 제목 — {@code TITLE} 부분 일치 (LIKE). */
    private String title;

    /** S-002 게시상태 — {@code NOTICE_STATUS} 일치. 전체 조회 시 빈 문자열. */
    private String noticeStatus;

    /** S-003 게시기간(시작) — 조회 구간 하한. {@code yyyy-MM-dd} 문자열. */
    private String postStartDt;

    /** S-004 게시기간(종료) — 조회 구간 상한. {@code yyyy-MM-dd} 문자열. */
    private String postEndDt;

    public String getTitle() { return title; }
    public String getNoticeStatus() { return noticeStatus; }
    public String getPostStartDt() { return postStartDt; }
    public String getPostEndDt() { return postEndDt; }

    public void setTitle(String v) { this.title = v; }
    public void setNoticeStatus(String v) { this.noticeStatus = v; }
    public void setPostStartDt(String v) { this.postStartDt = v; }
    public void setPostEndDt(String v) { this.postEndDt = v; }
}
