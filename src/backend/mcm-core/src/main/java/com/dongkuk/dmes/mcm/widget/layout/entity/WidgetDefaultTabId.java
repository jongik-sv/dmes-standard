package com.dongkuk.dmes.mcm.widget.layout.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetDefaultTab} 복합키 (LAYOUT_KEY, TAB_ID). */
public class WidgetDefaultTabId implements Serializable {

    private String layoutKey;
    private String tabId;

    public WidgetDefaultTabId() {}

    public WidgetDefaultTabId(String layoutKey, String tabId) {
        this.layoutKey = layoutKey;
        this.tabId = tabId;
    }

    public String getLayoutKey() { return layoutKey; }
    public void setLayoutKey(String layoutKey) { this.layoutKey = layoutKey; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetDefaultTabId that)) return false;
        return Objects.equals(layoutKey, that.layoutKey) && Objects.equals(tabId, that.tabId);
    }

    @Override
    public int hashCode() { return Objects.hash(layoutKey, tabId); }
}
