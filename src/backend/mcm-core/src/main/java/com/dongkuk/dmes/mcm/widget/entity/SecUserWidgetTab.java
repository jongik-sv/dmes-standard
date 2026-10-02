package com.dongkuk.dmes.mcm.widget.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 사용자 위젯 탭 — 포털 홈 위젯 화면의 탭 하나(스펙 2026-10-02-widget-foundation §4.1).
 * TAB_ID 는 "home" 또는 "tab-{n}". 감사컬럼은 {@link McmAuditEntity}.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET_TAB", schema = "MCMAPUSER")
@IdClass(SecUserWidgetTabId.class)
public class SecUserWidgetTab extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "TAB_ID", length = 30, nullable = false)
    private String tabId;

    @Column(name = "TAB_NM", length = 60, nullable = false)
    private String tabNm;

    @Column(name = "TAB_SEQ", nullable = false)
    private Integer tabSeq;

    @Column(name = "LOCK_YN", length = 1, nullable = false)
    private String lockYn;

    public SecUserWidgetTab() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getTabNm() { return tabNm; }
    public void setTabNm(String tabNm) { this.tabNm = tabNm; }
    public Integer getTabSeq() { return tabSeq; }
    public void setTabSeq(Integer tabSeq) { this.tabSeq = tabSeq; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
}
