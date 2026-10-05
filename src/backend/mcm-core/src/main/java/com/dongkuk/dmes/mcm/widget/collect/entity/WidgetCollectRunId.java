package com.dongkuk.dmes.mcm.widget.collect.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetCollectRun} 복합키 (WIDGET_ID, SLOT). */
public class WidgetCollectRunId implements Serializable {

    private String widgetId;
    private String slot;

    public WidgetCollectRunId() {}

    public WidgetCollectRunId(String widgetId, String slot) {
        this.widgetId = widgetId;
        this.slot = slot;
    }

    public String getWidgetId() { return widgetId; }
    public void setWidgetId(String widgetId) { this.widgetId = widgetId; }
    public String getSlot() { return slot; }
    public void setSlot(String slot) { this.slot = slot; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetCollectRunId that)) return false;
        return Objects.equals(widgetId, that.widgetId) && Objects.equals(slot, that.slot);
    }

    @Override
    public int hashCode() { return Objects.hash(widgetId, slot); }
}
