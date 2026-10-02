package com.dongkuk.dmes.mcm.widget.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserWidgetTab} 복합키 (USER_ID, TAB_ID). */
public class SecUserWidgetTabId implements Serializable {

    private String userId;
    private String tabId;

    public SecUserWidgetTabId() {}

    public SecUserWidgetTabId(String userId, String tabId) {
        this.userId = userId;
        this.tabId = tabId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserWidgetTabId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(tabId, that.tabId);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, tabId); }
}
