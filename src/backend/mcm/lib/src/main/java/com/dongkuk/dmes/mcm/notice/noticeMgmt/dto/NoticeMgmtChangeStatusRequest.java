/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: noticeMgmt action=changeStatus 요청 DTO — 기능설계서 §5.1 B-005 게시중지
 */
package com.dongkuk.dmes.mls.lsh.noticeMgmt.dto;

/**
 * {@code noticeMgmt} action={@code changeStatus} 요청 DTO (기능설계서 B-005 게시중지).
 *
 * <p>전이 대상 상태를 클라이언트가 보내지만 <b>서버가 전이 가능 여부를 재판정</b>한다
 * (기능설계서 §7.2 전이 규칙 / Mes-Guide §7 "처리에 영향을 주는 값은 backend 에서 DB 권위 값 재조회").
 * 클라이언트가 임의 상태를 보내도 §7.2 에 없는 전이는 거부된다.
 */
public class NoticeMgmtChangeStatusRequest {

    /** 대상 공지번호 — {@code NOTICE_ID}. */
    private String noticeId;

    /** 전이할 게시상태 — LV-001 ({@code DRAFT} / {@code POSTED} / {@code STOPPED}). */
    private String noticeStatus;

    public String getNoticeId() { return noticeId; }
    public String getNoticeStatus() { return noticeStatus; }

    public void setNoticeId(String v) { this.noticeId = v; }
    public void setNoticeStatus(String v) { this.noticeStatus = v; }
}
