package com.dongkuk.dmes.mcm.widget.memo.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetMemo} 복합키 (USER_ID, INST_ID). */
public class WidgetMemoId implements Serializable {

    private String userId;
    private String instId;

    public WidgetMemoId() {}

    public WidgetMemoId(String userId, String instId) {
        this.userId = userId;
        this.instId = instId;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetMemoId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(instId, that.instId);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, instId); }
}
