package com.dongkuk.dmes.mcm.widget.chat.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link WidgetChatMessage} 복합키 (USER_ID, INST_ID, MSG_SEQ). */
public class WidgetChatMessageId implements Serializable {

    private String userId;
    private String instId;
    private Integer msgSeq;

    public WidgetChatMessageId() {}

    public WidgetChatMessageId(String userId, String instId, Integer msgSeq) {
        this.userId = userId;
        this.instId = instId;
        this.msgSeq = msgSeq;
    }

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public Integer getMsgSeq() { return msgSeq; }
    public void setMsgSeq(Integer msgSeq) { this.msgSeq = msgSeq; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof WidgetChatMessageId that)) return false;
        return Objects.equals(userId, that.userId) && Objects.equals(instId, that.instId)
                && Objects.equals(msgSeq, that.msgSeq);
    }

    @Override
    public int hashCode() { return Objects.hash(userId, instId, msgSeq); }
}
