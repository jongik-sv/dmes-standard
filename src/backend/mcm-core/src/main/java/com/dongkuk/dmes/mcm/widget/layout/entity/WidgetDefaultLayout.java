package com.dongkuk.dmes.mcm.widget.layout.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 「홈」 기본 배치 — 스펙 2026-10-02-widget-admin-generic §4.2.
 * LAYOUT_KEY 는 {@code *}(전사) 또는 부서 코드. 한 키의 행이 하나라도 있으면 그 키의 배치가 있다고 본다(빈 배치는 두지 않는다).
 * 적용 순서: 사용자 부서 → 상위 부서(최대 10단) → {@code *} → 화면 코드 상수 HOME_DEFAULT_LAYOUT.
 */
@Entity
@Table(name = "TB_MCM_WIDGET_DEFAULT_LAYOUT", schema = "MCMAPUSER")
@IdClass(WidgetDefaultLayoutId.class)
public class WidgetDefaultLayout extends McmAuditEntity {

    /** 전사 기본 배치 키. */
    public static final String COMPANY_KEY = "*";

    @Id
    @Column(name = "LAYOUT_KEY", length = 30, nullable = false)
    private String layoutKey;

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

    /** 기본 배치에서 잠근 위젯 — 사용자 「홈」 에 복사될 때 잠금을 유지한다. */
    @Column(name = "LOCK_YN", length = 1, nullable = false)
    private String lockYn = "N";

    public WidgetDefaultLayout() {}

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
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
