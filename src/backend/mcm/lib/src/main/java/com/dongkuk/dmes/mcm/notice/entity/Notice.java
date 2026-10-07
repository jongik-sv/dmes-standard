/*
 * 작성자: Agent
 * 작성일: 2026-09-03
 * 내용: Notice 엔티티 — TB_MCM_NOTICE (공지사항) 본 컬럼 1:1 정의 (noticeMgmt 화면 owner)
 */
package com.dongkuk.dmes.mcm.notice.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDate;

/**
 * 공지사항 — {@code TB_MCM_NOTICE} JPA Entity (noticeMgmt 화면 owner).
 *
 * <p>본 화면은 <b>As-Is 레거시가 없는 To-Be only 신규 화면</b>이다
 * (기능설계서 {@code docs/mcm/design/noticeMgmt/noticeMgmt_기능설계서.md} 상단 인용 정본 예외).
 * 따라서 As-Is 컬럼 카탈로그 인용은 존재하지 않고, 기능설계서 §3.2 / §4 의 To-Be 컬럼 정의가 정본이다.
 *
 * <p>본 컬럼 9 (기능설계서 §4 D-001~D-009):
 * <ul>
 *   <li>PK 단일 = {@code NOTICE_ID} — 서버 채번 (Service 의 {@code nextNoticeId()})</li>
 *   <li>{@code TITLE} / {@code CONTENT} / {@code NOTICE_STATUS} / {@code POST_START_DT} / {@code POST_END_DT}</li>
 *   <li>V3(2026-10-02) — {@code CONTENT_FORMAT} / {@code NOTICE_CATEGORY} / {@code PIN_YN}</li>
 *   <li>V4(2026-10-02) — {@code TARGET_SCOPE} (대상 역할은 자식 테이블 {@link NoticeTarget})</li>
 * </ul>
 *
 * <p>audit 9 컬럼({@code C_USR_ID}/{@code C_AT}/{@code C_SVC_ID}/{@code C_PGM_ID}/{@code U_USR_ID}/
 * {@code U_AT}/{@code U_SVC_ID}/{@code U_PGM_ID}/{@code VER})은 cactus-core {@link CactusAuditEntity}
 * 상속으로 자동 적용된다 — 본 클래스에 재선언하지 않는다 (설계 가이드 02 §A.5-3-1 MUST).
 *
 * <p><b>모듈 이전(2026-10-07)</b> — mls {@code TB_MLS_NOTICE} 에서 mcm 으로 옮겼다(DEC-001 「재검토 → 이전」).
 * mcm 관례대로 {@code MCMAPUSER} 스키마를 명시하고, 로컬은 ddl-auto update 가 테이블을 만든다. ddl-auto 는 DB DEFAULT 를
 * 만들지 않으므로 기본값은 필드 초기값이 보장한다. 운영 DDL 은 {@code docs/mcm/erd/notice-tables.md}.
 */
@Entity
@Table(name = "TB_MCM_NOTICE", schema = "MCMAPUSER",
        indexes = @Index(name = "IX_TB_MCM_NOTICE_STATUS", columnList = "NOTICE_STATUS"))
public class Notice extends CactusAuditEntity {

    /** PK — 공지번호 (기능설계서 G-001 / D-001). 서버 채번 {@code NT + yyyyMMdd + 4자리}. VARCHAR(30). */
    @Id
    @Column(name = "NOTICE_ID", length = 30, nullable = false)
    private String noticeId;

    /** 제목 (G-002 / D-002 — V-001 필수 / V-002 최대 200자). VARCHAR(200). */
    @Column(name = "TITLE", length = 200, nullable = false)
    private String title;

    /**
     * 내용 (D-003). 그리드 미표시.
     *
     * <p>DB 쪽 길이 제한은 없다. 상한(20만 자)은 서비스 검증 V-003 이 맡는다. 긴 본문이라 WidgetDef.CONFIG_JSON 과 같이
     * {@code LONG32VARCHAR} 로 둔다(Oracle V1 기준선은 CLOB 칸, OracleDialect 가 LONG32VARCHAR 를 CLOB 으로 다룬다).
     * {@code @Lob} 은 옛 SQLite JDBC 가 {@code getClob} 을 지원하지 않아 쓰지 않았다. 이 칸에는 JPQL 문자열 함수·LIKE 를 쓰지 않는다
     * (Hibernate 7.2 는 CLOB 인자에 upper()·lower() 를 거절한다 — 검색이 필요하면 네이티브 SQL 로).
     */
    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "CONTENT")
    private String content;

    /**
     * 본문 형식 (D-007 — LV-002). {@code TEXT}(일반 글) / {@code MD}(마크다운) / {@code HTML}(서버 소독 HTML). VARCHAR(10).
     *
     * <p>초기값을 두는 이유: Hibernate 는 null 필드도 INSERT 문에 NULL 로 넣으므로 DB DEFAULT 가 적용되지 않고
     * NOT NULL 위반이 난다. 서비스가 값을 정하지 않은 경로에서도 안전하게 기본값이 들어가게 한다.
     */
    @Column(name = "CONTENT_FORMAT", length = 10, nullable = false)
    private String contentFormat = "TEXT";

    /** 공지 분류 (D-008 — LV-003). {@code NORMAL}(일반) / {@code MAINT}(점검) / {@code URGENT}(긴급). VARCHAR(10). */
    @Column(name = "NOTICE_CATEGORY", length = 10, nullable = false)
    private String noticeCategory = "NORMAL";

    /**
     * 홈 목록 상단 고정 (D-009). {@code Y} / {@code N}. CHAR(1).
     *
     * <p>빈 문자열은 넣지 않는다 — 길이 1 컬럼의 {@code ''} 는 native 조회에서 {@code Character} 변환 오류를 낸 이력이 있다
     * (mcm DataInitializer {@code normalizeSecMenuCharColumns}). 서비스가 Y/N 으로 정규화한다.
     */
    @Column(name = "PIN_YN", length = 1, nullable = false)
    private String pinYn = "N";

    /**
     * 게시 대상 범위 (D-010 — LV-004, V4 2026-10-02). {@code ALL}(전체 사용자) / {@code ROLE}(TB_MCM_NOTICE_TARGET 의 역할만).
     * VARCHAR(10). 초기값을 두는 이유는 {@link #contentFormat} 과 같다.
     */
    @Column(name = "TARGET_SCOPE", length = 10, nullable = false)
    private String targetScope = "ALL";

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
    public String getContentFormat() { return contentFormat; }
    public String getNoticeCategory() { return noticeCategory; }
    public String getPinYn() { return pinYn; }
    public String getTargetScope() { return targetScope; }

    public void setNoticeId(String v) { this.noticeId = v; }
    public void setTitle(String v) { this.title = v; }
    public void setContent(String v) { this.content = v; }
    public void setNoticeStatus(String v) { this.noticeStatus = v; }
    public void setPostStartDt(LocalDate v) { this.postStartDt = v; }
    public void setPostEndDt(LocalDate v) { this.postEndDt = v; }
    public void setContentFormat(String v) { this.contentFormat = v; }
    public void setNoticeCategory(String v) { this.noticeCategory = v; }
    public void setPinYn(String v) { this.pinYn = v; }
    public void setTargetScope(String v) { this.targetScope = v; }
}
