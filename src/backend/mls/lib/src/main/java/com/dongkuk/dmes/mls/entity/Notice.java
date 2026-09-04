/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: Notice 엔티티 — TB_MLS_NOTICE (공지사항) 본 컬럼 1:1 정의 (noticeMgmt 화면 owner)
 */
package com.dongkuk.dmes.mls.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDate;

/**
 * 공지사항 — {@code TB_MLS_NOTICE} JPA Entity (noticeMgmt 화면 owner).
 *
 * <p>본 화면은 <b>As-Is 레거시가 없는 To-Be only 신규 화면</b>이다
 * (기능설계서 {@code docs/mls/design/noticeMgmt/noticeMgmt_기능설계서.md} 상단 인용 정본 예외).
 * 따라서 As-Is 컬럼 카탈로그 인용은 존재하지 않고, 기능설계서 §3.2 / §4 의 To-Be 컬럼 정의가 정본이다.
 *
 * <p>본 컬럼 6 (기능설계서 §4 D-001~D-006):
 * <ul>
 *   <li>PK 단일 = {@code NOTICE_ID} — 서버 채번 (Service 의 {@code nextNoticeId()})</li>
 *   <li>{@code TITLE} / {@code CONTENT} / {@code NOTICE_STATUS} / {@code POST_START_DT} / {@code POST_END_DT}</li>
 * </ul>
 *
 * <p>audit 9 컬럼({@code C_USR_ID}/{@code C_AT}/{@code C_SVC_ID}/{@code C_PGM_ID}/{@code U_USR_ID}/
 * {@code U_AT}/{@code U_SVC_ID}/{@code U_PGM_ID}/{@code VER})은 cactus-core {@link CactusAuditEntity}
 * 상속으로 자동 적용된다 — 본 클래스에 재선언하지 않는다 (설계 가이드 02 §A.5-3-1 MUST).
 *
 * <p><b>스키마 접두 미사용</b> — mcm 은 {@code MCMAPUSER.} 스키마를 명시하지만 mls 는 단일 스키마
 * (local SQLite {@code mls.db}) 이므로 {@code @Table(schema=...)} 를 두지 않는다. 테이블명은 mls 기 등재
 * 자산({@code TB_MLS_SL_LOC} / {@code TB_MLS_MOVE_TYPE})과 동일하게 <b>대문자</b>를 유지한다
 * (기능설계서 §11.1 GAP-002).
 */
@Entity
@Table(name = "TB_MLS_NOTICE")
public class Notice extends CactusAuditEntity {

    /** PK — 공지번호 (기능설계서 G-001 / D-001). 서버 채번 {@code NT + yyyyMMdd + 4자리}. VARCHAR(30). */
    @Id
    @Column(name = "NOTICE_ID", length = 30, nullable = false)
    private String noticeId;

    /** 제목 (G-002 / D-002 — V-001 필수 / V-002 최대 200자). VARCHAR(200). */
    @Column(name = "TITLE", length = 200, nullable = false)
    private String title;

    /** 내용 (D-003 — V-003 최대 4000자). VARCHAR(4000). 그리드 미표시. */
    @Column(name = "CONTENT", length = 4000)
    private String content;

    /**
     * 게시상태 (G-003 / D-004 — LV-001).
     * {@code DRAFT}(작성중) / {@code POSTED}(게시중) / {@code STOPPED}(게시중지). VARCHAR(10).
     *
     * <p>길이 10 인 이유 — cactus 가 length=1 VARCHAR 를 {@code Character} 로 추론해 빈 문자열 행에서
     * CoercionException 을 내는 함정을 피하려고 상태코드는 대문자 SNAKE_CASE 10자 이내로 둔다
     * (설계 가이드 02 §A.5-4-5 상태코드 규칙).
     */
    @Column(name = "NOTICE_STATUS", length = 10, nullable = false)
    private String noticeStatus;

    /** 게시시작일 (G-004 / D-005 — XV-001 / XV-002). DATE. */
    @Column(name = "POST_START_DT")
    private LocalDate postStartDt;

    /** 게시종료일 (G-005 / D-006 — XV-001 / XV-002). DATE. */
    @Column(name = "POST_END_DT")
    private LocalDate postEndDt;

    protected Notice() {
        // JPA 기본 생성자
    }

    public Notice(String noticeId) {
        this.noticeId = noticeId;
    }

    public String getNoticeId() { return noticeId; }
    public String getTitle() { return title; }
    public String getContent() { return content; }
    public String getNoticeStatus() { return noticeStatus; }
    public LocalDate getPostStartDt() { return postStartDt; }
    public LocalDate getPostEndDt() { return postEndDt; }

    public void setNoticeId(String v) { this.noticeId = v; }
    public void setTitle(String v) { this.title = v; }
    public void setContent(String v) { this.content = v; }
    public void setNoticeStatus(String v) { this.noticeStatus = v; }
    public void setPostStartDt(LocalDate v) { this.postStartDt = v; }
    public void setPostEndDt(LocalDate v) { this.postEndDt = v; }
}
