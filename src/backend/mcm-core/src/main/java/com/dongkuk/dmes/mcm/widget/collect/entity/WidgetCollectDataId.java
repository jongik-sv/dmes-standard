package com.dongkuk.dmes.mcm.widget.collect.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetCollectData} 복합키 (WIDGET_ID, SLOT, ITEM_KEY). */
public class WidgetCollectDataId implements Serializable {

    private String widgetId;
    private String slot;
    private String itemKey;

    public WidgetCollectDataId() {}

    public WidgetCollectDataId(String widgetId, String slot, String itemKey) {
        this.widgetId = widgetId;
        this.slot = slot;
        this.itemKey = itemKey;
    }

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }
    public String getItemKey() { return itemKey; }
    public void setItemKey(String itemKey) { this.itemKey = itemKey; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetCollectDataId that)) return false;
        return Objects.equals(widgetId, that.widgetId) && Objects.equals(slot, that.slot) && Objects.equals(itemKey, that.itemKey);
    }

    @Override
    public int hashCode() { return Objects.hash(widgetId, slot, itemKey); }
}
