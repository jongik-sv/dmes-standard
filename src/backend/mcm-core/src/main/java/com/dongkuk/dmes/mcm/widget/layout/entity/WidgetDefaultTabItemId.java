package com.dongkuk.dmes.mcm.widget.layout.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetDefaultTabItem} 복합키 (LAYOUT_KEY, TAB_ID, INST_ID). */
public class WidgetDefaultTabItemId implements Serializable {

    private String layoutKey;
    private String tabId;
    private String instId;

    public WidgetDefaultTabItemId() {}

    public WidgetDefaultTabItemId(String layoutKey, String tabId, String instId) {
        this.layoutKey = layoutKey;
        this.tabId = tabId;
        this.instId = instId;
    }

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetDefaultTabItemId that)) return false;
        return Objects.equals(layoutKey, that.layoutKey) && Objects.equals(tabId, that.tabId)
                && Objects.equals(instId, that.instId);
    }

    @Override
    public int hashCode() { return Objects.hash(layoutKey, tabId, instId); }
}
