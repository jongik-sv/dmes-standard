package com.dongkuk.dmes.mcm.widget.layout.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/** 기본 탭에 놓인 위젯 — {@link WidgetDefaultLayout} 과 같은 칸에 TAB_ID 를 더했다(design-widget-tabs.md §2). */
@Entity
@Table(name = "TB_MCM_WIDGET_DEFAULT_TAB_ITEM", schema = "MCMAPUSER")
@IdClass(WidgetDefaultTabItemId.class)
public class WidgetDefaultTabItem extends McmAuditEntity {

    @Id
    @Column(name = "LAYOUT_KEY", length = 30, nullable = false)
    private String layoutKey;

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
    private String lockYn = "N";

    public WidgetDefaultTabItem() {}

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
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
}
