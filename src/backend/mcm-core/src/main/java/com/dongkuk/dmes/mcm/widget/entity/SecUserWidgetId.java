package com.dongkuk.dmes.mcm.widget.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link SecUserWidget} 복합키 (USER_ID, TAB_ID, INST_ID). */
public class SecUserWidgetId implements Serializable {

    private String userId;
    private String tabId;
    private String instId;

    public SecUserWidgetId() {}

    public SecUserWidgetId(String userId, String tabId, String instId) {
        this.userId = userId;
        this.tabId = tabId;
        this.instId = instId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getTabId() { return tabId; }
    public void setTabId(String tabId) { this.tabId = tabId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecUserWidgetId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(tabId, that.tabId)
                && Objects.equals(instId, that.instId);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, tabId, instId); }
}
