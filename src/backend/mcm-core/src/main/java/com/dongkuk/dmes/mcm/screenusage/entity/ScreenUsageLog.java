package com.dongkuk.dmes.mcm.screenusage.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import jakarta.persistence.UniqueConstraint;
import org.springframework.data.domain.Persistable;

import java.time.LocalDateTime;

/**
 * 화면 사용 구간 원본 — {@code TB_SEC_SCREEN_USAGE_LOG} (1년 보관, 설계 4.1).
 *
 * <p>감사 계열({@code TB_SEC_AUDIT_LOG})처럼 schema 접두를 두지 않는다. 운영 MSSQL DDL 정본은
 * {@code com.dongkuk.dmes.mcm.screenusage.schema.ScreenUsageMssqlDdl} 이며 제약·인덱스 이름이 이 매핑과 같다.
 * 시각은 Asia/Seoul 벽시계(LocalDateTime) — USAGE_DT 일자 귀속과 SQLite 문자열 변환기 비교를 단순하게 한다.
 *
 * <p>{@link Persistable} — 키(UUID)를 직접 넣으므로 Spring Data 가 merge(선 SELECT)로 가지 않고 바로 INSERT 하게 한다.
 */
@Entity
@Table(name = "TB_SEC_SCREEN_USAGE_LOG",
        uniqueConstraints = @UniqueConstraint(name = "UK_SEC_SCREEN_USAGE_LOG_SEG",
                columnNames = {"USER_ID", "CLIENT_SEG_ID"}),
        indexes = {
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_STARTED", columnList = "STARTED_AT"),
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_USER", columnList = "USER_ID, STARTED_AT"),
                @Index(name = "IX_SEC_SCREEN_USAGE_LOG_PAGE", columnList = "PAGE_ID, STARTED_AT")
        })
public class ScreenUsageLog implements Persistable<String> {

    @Id
    @Column(name = "USAGE_ID", length = 36, nullable = false)
    private String usageId;

    @Column(name = "USER_ID", length = 50, nullable = false)
    private String userId;

    /** 기록 시점 SecUser.deptCd 스냅숏. 없으면 null (집계에서 '-'). */
    @Column(name = "DEPT_CD", length = 10)
    private String deptCd;

    /** {@code ${PARENT_MENU_ID}/${OBJECT_ID}} — 메뉴 마스터 존재 여부는 기록 시 검사하지 않는다. */
    @Column(name = "PAGE_ID", length = 200, nullable = false)
    private String pageId;

    /** OPEN / SWITCH / RESUME */
    @Column(name = "START_KIND", length = 10, nullable = false)
    private String startKind;

    @Column(name = "STARTED_AT", nullable = false)
    private LocalDateTime startedAt;

    @Column(name = "ENDED_AT", nullable = false)
    private LocalDateTime endedAt;

    /** 서버가 ENDED_AT - STARTED_AT (ms) 로 계산. */
    @Column(name = "DURATION_MS", nullable = false)
    private Long durationMs;

    @Column(name = "CLIENT_SEG_ID", length = 36, nullable = false)
    private String clientSegId;

    @Column(name = "CLIENT_IP", length = 45)
    private String clientIp;

    @Column(name = "RECEIVED_AT", nullable = false)
    private LocalDateTime receivedAt;

    @Transient
    private boolean newEntity = true;

    public ScreenUsageLog() {}

    @Override
    public String getId() { return usageId; }

    @Override
    public boolean isNew() { return newEntity; }

    @PostPersist
    @PostLoad
    void markPersisted() { this.newEntity = false; }

    public String getUsageId() { return usageId; }
    public void setUsageId(String usageId) { this.usageId = usageId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getStartKind() { return startKind; }
    public void setStartKind(String startKind) { this.startKind = startKind; }
    public LocalDateTime getStartedAt() { return startedAt; }
    public void setStartedAt(LocalDateTime startedAt) { this.startedAt = startedAt; }
    public LocalDateTime getEndedAt() { return endedAt; }
    public void setEndedAt(LocalDateTime endedAt) { this.endedAt = endedAt; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
    public String getClientSegId() { return clientSegId; }
    public void setClientSegId(String clientSegId) { this.clientSegId = clientSegId; }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }
    public LocalDateTime getReceivedAt() { return receivedAt; }
    public void setReceivedAt(LocalDateTime receivedAt) { this.receivedAt = receivedAt; }
}
