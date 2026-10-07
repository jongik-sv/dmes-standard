/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: noticeMgmt action=search 요청 DTO — 기능설계서 §3 조회조건 S-001~S-006
 */
package com.dongkuk.dmes.mcm.notice.noticeMgmt.dto;

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

    /** S-005 공지 분류 — {@code NOTICE_CATEGORY} 일치 (LV-003). 빈 값 = 전체. 허용 코드 밖이면 서비스가 거부한다. */
    private String noticeCategory;

    /** S-006 본문 형식 — {@code CONTENT_FORMAT} 일치 (LV-002). 빈 값 = 전체. 허용 코드 밖이면 서비스가 거부한다. */
    private String contentFormat;

    /**
     * 조건(S-001~S-006)이 모두 비었을 때만 적용하는 행 수 상한(화면 성능 가이드 R1). 비우거나 0 이하면 상한 없음 — 이 값을 보내지
     * 않는 기존 호출자는 지금처럼 전체를 받는다. 조건이 있으면 무시한다. 응답의 {@code totalCount}·{@code truncated} 로 잘림을 알린다.
     */
    private Integer limit;

    /**
     * {@code false} 이면 목록 행에서 본문({@code CONTENT})을 뺀다(DB 에서도 읽지 않는다). 비우면 지금처럼 본문을 싣는다.
     * 본문은 행을 고를 때 {@code noticeId} 상세 조회로 받는다.
     */
    private Boolean includeContent;

    /** 상세 조회 — 값이 있으면 다른 조건·상한은 무시하고 그 공지 한 건을 본문 포함으로 돌려준다(없으면 빈 목록). */
    private String noticeId;

    public String getTitle() { return title; }
    public String getNoticeStatus() { return noticeStatus; }
    public String getPostStartDt() { return postStartDt; }
    public String getPostEndDt() { return postEndDt; }
    public String getNoticeCategory() { return noticeCategory; }
    public String getContentFormat() { return contentFormat; }

    public Integer getLimit() { return limit; }
    public Boolean getIncludeContent() { return includeContent; }
    public String getNoticeId() { return noticeId; }

    public void setLimit(Integer v) { this.limit = v; }
    public void setIncludeContent(Boolean v) { this.includeContent = v; }
    public void setNoticeId(String v) { this.noticeId = v; }

    public void setTitle(String v) { this.title = v; }
    public void setNoticeStatus(String v) { this.noticeStatus = v; }
    public void setPostStartDt(String v) { this.postStartDt = v; }
    public void setPostEndDt(String v) { this.postEndDt = v; }
    public void setNoticeCategory(String v) { this.noticeCategory = v; }
    public void setContentFormat(String v) { this.contentFormat = v; }
}
