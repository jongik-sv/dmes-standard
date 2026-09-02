package com.dongkuk.dmes.mcm.audit.entity;

import jakarta.persistence.*;

import java.time.Instant;

@Entity
@Table(name = "TB_SEC_AUDIT_LOG")
public class AuditLog {

    @Id @Column(name = "AUDIT_ID", length = 100)
    private String auditId;

    @Column(name = "ACTION", length = 100, nullable = false)
    private String action;

    @Column(name = "TARGET_TYPE", length = 100)
    private String targetType;

    @Column(name = "TARGET_ID", length = 100)
    private String targetId;

    @Column(name = "ACTOR_USER_ID", length = 100)
    private String actorUserId;

    @Column(name = "BEFORE_JSON", columnDefinition = "TEXT")
    private String beforeJson;

    @Column(name = "AFTER_JSON", columnDefinition = "TEXT")
    private String afterJson;

    @Column(name = "CLIENT_IP", length = 64)
    private String clientIp;

    @Column(name = "OCCURRED_AT", nullable = false)
    private Instant occurredAt;

    public String getAuditId() { return auditId; }
    public void setAuditId(String auditId) { this.auditId = auditId; }
    public String getAction() { return action; }
    public void setAction(String action) { this.action = action; }
    public String getTargetType() { return targetType; }
    public void setTargetType(String targetType) { this.targetType = targetType; }
    public String getTargetId() { return targetId; }
    public void setTargetId(String targetId) { this.targetId = targetId; }
    public String getActorUserId() { return actorUserId; }
    public void setActorUserId(String actorUserId) { this.actorUserId = actorUserId; }
    public String getBeforeJson() { return beforeJson; }
    public void setBeforeJson(String beforeJson) { this.beforeJson = beforeJson; }
    public String getAfterJson() { return afterJson; }
    public void setAfterJson(String afterJson) { this.afterJson = afterJson; }
    public String getClientIp() { return clientIp; }
    public void setClientIp(String clientIp) { this.clientIp = clientIp; }
    public Instant getOccurredAt() { return occurredAt; }
    public void setOccurredAt(Instant occurredAt) { this.occurredAt = occurredAt; }
}
