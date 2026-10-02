package com.dongkuk.dmes.mcm.widget.chat.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

/**
 * 챗봇 위젯 대화 기록 — 스펙 2026-10-02-widget-admin-generic §4.5.
 * 사용자·위젯 인스턴스별로 MSG_SEQ 1부터 쌓고, 인스턴스당 최근 100개만 남긴다(넘으면 오래된 것부터 지움 —
 * {@code WidgetChatWriter}). 사용자가 위젯을 빼도 기록은 남고 [새 대화](reset)로 지운다.
 * CONTENT 는 길 수 있어 LONG32VARCHAR(W-D30, {@code @Lob} 금지).
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_WIDGET_CHAT", schema = "MCMAPUSER")
@IdClass(WidgetChatMessageId.class)
public class WidgetChatMessage extends McmAuditEntity {

    public static final String ROLE_USER = "user";
    public static final String ROLE_ASSISTANT = "assistant";

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "INST_ID", length = 40, nullable = false)
    private String instId;

    @Id
    @Column(name = "MSG_SEQ", nullable = false)
    private Integer msgSeq;

    /** user · assistant */
    @Column(name = "ROLE_TP", length = 10, nullable = false)
    private String roleTp;

    @JdbcTypeCode(SqlTypes.LONG32VARCHAR)
    @Column(name = "CONTENT", nullable = false)
    private String content;

    /** 답에 붙은 화면 링크 {@code [{pageId,title}]}. user 메시지·링크 없는 답은 NULL. */
    @Column(name = "LINKS_JSON", length = 4000)
    private String linksJson;

    public WidgetChatMessage() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getInstId() { return instId; }
    public void setInstId(String instId) { this.instId = instId; }
    public Integer getMsgSeq() { return msgSeq; }
    public void setMsgSeq(Integer msgSeq) { this.msgSeq = msgSeq; }
    public String getRoleTp() { return roleTp; }
    public void setRoleTp(String roleTp) { this.roleTp = roleTp; }
    public String getContent() { return content; }
    public void setContent(String content) { this.content = content; }
    public String getLinksJson() { return linksJson; }
    public void setLinksJson(String linksJson) { this.linksJson = linksJson; }
}
