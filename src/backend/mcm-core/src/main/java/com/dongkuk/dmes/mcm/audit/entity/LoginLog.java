package com.dongkuk.dmes.mcm.audit.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "TB_SEC_LOGIN_LOG")
public class LoginLog {

    @Id @Column(name = "LOG_ID", length = 100)
    private String logId;

    @Column(name = "USER_ID", length = 100)
    private String userId;

    /** LOGIN_SUCCESS / LOGIN_FAIL / LOGOUT */
    @Column(name = "EVENT_TYPE", length = 30, nullable = false)
    private String eventType;

    @Column(name = "CLIENT_IP", length = 64)
    private String clientIp;

    @Column(name = "USER_AGENT", length = 500)
    private String userAgent;

    @Column(name = "OCCURRED_AT", nullable = false)
    private Instant occurredAt;

    public String getLogId() { return logId; }
    public void setLogId(String logId) { this.logId = logId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getEventType() { return eventType; }
    public void setEventType(String eventType) { this.eventType = eventType; }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }
    public String getUserAgent() { return userAgent; }
    public void setUserAgent(String userAgent) { this.userAgent = userAgent; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
