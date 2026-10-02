package com.dongkuk.dmes.mcm.screenusage.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;
import org.springframework.data.domain.Persistable;

/**
 * 화면 사용 일별 집계 — {@code TB_SEC_SCREEN_USAGE_DAY} (영구 보관, 설계 4.2).
 *
 * <p>키 (USAGE_DT yyyyMMdd Asia/Seoul, PAGE_ID, USER_ID, DEPT_CD — 없으면 '-'). 사용자 단위로 남겨
 * 화면별·부서별·사용자별·이용자 수 통계를 이 테이블 하나로 계산한다. schema 접두 없음.
 */
@Entity
@Table(name = "TB_SEC_SCREEN_USAGE_DAY")
@IdClass(ScreenUsageDayId.class)
public class ScreenUsageDay implements Persistable<ScreenUsageDayId> {

    @Id
    @JdbcTypeCode(SqlTypes.CHAR)
    @Column(name = "USAGE_DT", length = 8, nullable = false)
    private String usageDt;

    @Id
    @Column(name = "PAGE_ID", length = 200, nullable = false)
    private String pageId;

    @Id
    @Column(name = "USER_ID", length = 50, nullable = false)
    private String userId;

    @Id
    @Column(name = "DEPT_CD", length = 10, nullable = false)
    private String deptCd;

    @Column(name = "OPEN_CNT", nullable = false)
    private Integer openCnt = 0;

    @Column(name = "SEG_CNT", nullable = false)
    private Integer segCnt = 0;

    @Column(name = "DURATION_MS", nullable = false)
    private Long durationMs = 0L;

    @Transient
    private boolean newEntity = true;

    public ScreenUsageDay() {}

    public static ScreenUsageDay of(ScreenUsageDayId id) {
        ScreenUsageDay d = new ScreenUsageDay();
        d.usageDt = id.getUsageDt();
        d.pageId = id.getPageId();
        d.userId = id.getUserId();
        d.deptCd = id.getDeptCd();
        return d;
    }

    /** 구간 1개를 더한다 — OPEN 이면 열람 1, 모든 구간은 구간 수 1, 길이는 합산. */
    public void accumulate(boolean open, long durationMs) {
        if (open) openCnt = openCnt + 1;
        segCnt = segCnt + 1;
        this.durationMs = this.durationMs + durationMs;
    }

    @Override
    public ScreenUsageDayId getId() { return new ScreenUsageDayId(usageDt, pageId, userId, deptCd); }

    @Override
    public boolean isNew() { return newEntity; }

    @PostPersist
    @PostLoad
    void markPersisted() { this.newEntity = false; }

    public String getUsageDt() { return usageDt; }
    public void setUsageDt(String usageDt) { this.usageDt = usageDt; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public Integer getOpenCnt() { return openCnt; }
    public void setOpenCnt(Integer openCnt) { this.openCnt = openCnt; }
    public Integer getSegCnt() { return segCnt; }
    public void setSegCnt(Integer segCnt) { this.segCnt = segCnt; }
    public Long getDurationMs() { return durationMs; }
    public void setDurationMs(Long durationMs) { this.durationMs = durationMs; }
}
