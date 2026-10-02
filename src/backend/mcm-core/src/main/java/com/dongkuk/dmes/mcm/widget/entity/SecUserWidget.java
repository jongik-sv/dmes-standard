package com.dongkuk.dmes.mcm.widget.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 탭에 놓인 위젯 인스턴스 — 넓은 화면(24칸) 격자 좌표·크기(스펙 §4.1).
 * CONFIG_JSON 은 인스턴스 설정(C 단계). 세 방언에서 같은 형으로 쓰려고 VARCHAR(4000).
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET", schema = "MCMAPUSER")
@IdClass(SecUserWidgetId.class)
public class SecUserWidget extends McmAuditEntity {

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "TAB_ID", length = 30, nullable = false)
    private String tabId;

    @Id
    @Column(name = "INST_ID", length = 40, nullable = false)
    private String instId;

    @Column(name = "WIDGET_ID", length = 100, nullable = false)
    private String widgetId;

    @Column(name = "POS_X", nullable = false)
    private Integer posX;

    @Column(name = "POS_Y", nullable = false)
    private Integer posY;

    @Column(name = "SIZE_W", nullable = false)
    private Integer sizeW;

    @Column(name = "SIZE_H", nullable = false)
    private Integer sizeH;

    @Column(name = "LOCK_YN", length = 1, nullable = false)
    private String lockYn;

    @Column(name = "CONFIG_JSON", length = 4000)
    private String configJson;

    public SecUserWidget() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public Integer getPosX() { return posX; }
    public void setPosX(Integer posX) { this.posX = posX; }
    public Integer getPosY() { return posY; }
    public void setPosY(Integer posY) { this.posY = posY; }
    public Integer getSizeW() { return sizeW; }
    public void setSizeW(Integer sizeW) { this.sizeW = sizeW; }
    public Integer getSizeH() { return sizeH; }
    public void setSizeH(Integer sizeH) { this.sizeH = sizeH; }
    public String getLockYn() { return lockYn; }
    public void setLockYn(String lockYn) { this.lockYn = lockYn; }
    public String getConfigJson() { return configJson; }
    public void setConfigJson(String configJson) { this.configJson = configJson; }
}
