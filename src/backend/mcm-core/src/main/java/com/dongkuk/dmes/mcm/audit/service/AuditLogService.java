package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service("auditLogService")
public class AuditLogService {

    private final AuditLogRepository auditLogRepository;

    public AuditLogService(AuditLogRepository auditLogRepository) {
        this.auditLogRepository = auditLogRepository;
    }

    public List<AuditLog> searchByActor(Map<String, Object> request) {
        String actorUserId = (String) request.get("actorUserId");
        if (actorUserId != null && !actorUserId.isBlank()) {
            return auditLogRepository.findByActorUserIdOrderByOccurredAtDesc(actorUserId);
        }
        String action = (String) request.get("action");
        if (action != null && !action.isBlank()) {
            return auditLogRepository.findByActionOrderByOccurredAtDesc(action);
        }
        return auditLogRepository.findAll();
    }

    public List<Map<String, Object>> searchByPeriod(Map<String, Object> request) {
        String fromStr = (String) request.get("from");
        String toStr = (String) request.get("to");
        Instant from = fromStr != null ? Instant.parse(fromStr) : Instant.EPOCH;
        Instant to = toStr != null ? Instant.parse(toStr) : Instant.now();
        List<AuditLog> rows = auditLogRepository.findByPeriod(from, to);
        return rows.stream().map(this::toRow).toList();
    }

    private Map<String, Object> toRow(AuditLog a) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("auditId",     a.getAuditId());
        row.put("action",      a.getAction());
        row.put("targetType",  a.getTargetType());
        row.put("targetId",    a.getTargetId());
        row.put("actorUserId", a.getActorUserId());
        row.put("beforeJson",  a.getBeforeJson());
        row.put("afterJson",   a.getAfterJson());
        row.put("clientIp",    a.getClientIp());
        row.put("occurredAt",  a.getOccurredAt() != null ? a.getOccurredAt().toString() : null);
        return row;
    }
}
