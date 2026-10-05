package com.dongkuk.dmes.mcm.widget.collect.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.PostLoad;
import jakarta.persistence.PostPersist;
import jakarta.persistence.Table;
import jakarta.persistence.Transient;
import java.math.BigDecimal;
import org.springframework.data.domain.Persistable;

/**
 * 정시 수집 값 — 스펙 2026-10-05 정시 수집 §3. PK (WIDGET_ID, SLOT, ITEM_KEY). 숫자는 VALUE_NUM, 그 밖은 VALUE_TXT(200자).
 * {@link WidgetCollectRun} 과 같은 이유로 {@link Persistable} — 같은 PK 는 덮어쓰지 않고 insert 에서 막힌다.
 */
@Entity
@Table(name = "TB_MCM_WIDGET_COLLECT_DATA", schema = "MCMAPUSER",
        indexes = @Index(name = "IX_MCM_WCOL_DATA_SLOT", columnList = "SLOT")) // 90일 보관 삭제용
@IdClass(WidgetCollectDataId.class)
public class WidgetCollectData extends McmAuditEntity implements Persistable<WidgetCollectDataId> {

    public static final int KEY_MAX = 100;
    public static final int TEXT_MAX = 200;

    @Id
    @Column(name = "WIDGET_ID", length = 40, nullable = false)
    private String widgetId;

    @Id
    @Column(name = "SLOT", length = 12, nullable = false)
    private String slot;

    @Id
    @Column(name = "ITEM_KEY", length = KEY_MAX, nullable = false)
    private String itemKey;

    @Column(name = "VALUE_NUM", precision = 24, scale = 8)
    private BigDecimal valueNum;

    @Column(name = "VALUE_TXT", length = TEXT_MAX)
    private String valueTxt;

    @Transient
    private boolean isNew = true;

    public WidgetCollectData() {}

    public WidgetCollectData(String widgetId, String slot, String itemKey, BigDecimal valueNum, String valueTxt) {
        this.widgetId = widgetId;
        this.slot = slot;
        this.itemKey = itemKey;
        this.valueNum = valueNum;
        this.valueTxt = valueTxt;
    }

    @Override
    public WidgetCollectDataId getId() { return new WidgetCollectDataId(widgetId, slot, itemKey); }

    @Override
    public boolean isNew() { return isNew; }

    @PostLoad
    @PostPersist
    void markNotNew() { this.isNew = false; }

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }
    public String getItemKey() { return itemKey; }
    public void setItemKey(String itemKey) { this.itemKey = itemKey; }
    public BigDecimal getValueNum() { return valueNum; }
    public void setValueNum(BigDecimal valueNum) { this.valueNum = valueNum; }
    public String getValueTxt() { return valueTxt; }
    public void setValueTxt(String valueTxt) { this.valueTxt = valueTxt; }
}
