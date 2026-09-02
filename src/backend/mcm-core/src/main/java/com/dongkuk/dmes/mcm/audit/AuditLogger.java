package com.dongkuk.dmes.mcm.audit;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import com.dongkuk.dmes.mcm.audit.repository.AuditLogRepository;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.UUID;
import java.util.function.Supplier;

/**
 * 통합 감사 로그({@code TB_SEC_AUDIT_LOG}) 기록 헬퍼.
 *
 * <p>OASIS 가 호출하는 서비스 빈은 AOP 프록시될 수 없다 (CGLIB 가 {@code MethodParameters}
 * attribute 를 보존하지 않아 OASIS reflection 이 깨짐). 따라서 {@code @Around} 기반
 * 횡단 처리 대신, 감사 대상 메서드에서 본 헬퍼를 명시적으로 호출한다.
 *
 * <pre>{@code
 * public int saveRolePerms(List<Map<String,Object>> master) {
 *     return auditLogger.record("ROLE_PERM_SAVE", "SecRolePerm", master, () -> {
 *         // ... 본 메서드 로직
 *         return count;
 *     });
 * }
 * }</pre>
 */
@Component
public class AuditLogger {

    private final AuditLogRepository auditLogRepository;
    private final SecurityIdentity securityIdentity;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuditLogger(AuditLogRepository auditLogRepository, SecurityIdentity securityIdentity) {
        this.auditLogRepository = auditLogRepository;
        this.securityIdentity = securityIdentity;
    }

    /**
     * 비즈니스 로직({@code proceed}) 을 수행하면서 호출 전/후 상태를 감사 로그에 기록한다.
     * 감사 로그 저장 실패는 본 비즈니스 결과를 깨뜨리지 않도록 swallow.
     *
     * @param action     액션 코드 (예: ROLE_PERM_SAVE)
     * @param targetType 대상 entity 타입 (예: SecRolePerm). null 가능.
     * @param before     호출 전 상태(보통 입력 DTO/Map). null 가능.
     * @param proceed    실제 비즈니스 로직 supplier
     * @return proceed 결과 그대로 전달
     */
    public <T> T record(String action, String targetType, Object before, Supplier<T> proceed) {
        String beforeJson = toJson(before);
        T result = proceed.get();
        try {
            AuditLog log = new AuditLog();
            log.setAuditId(UUID.randomUUID().toString());
            log.setAction(action);
            log.setTargetType((targetType == null || targetType.isBlank()) ? null : targetType);
            log.setActorUserId(securityIdentity.currentUserId());
            log.setBeforeJson(beforeJson);
            log.setAfterJson(toJson(result));
            log.setOccurredAt(Instant.now());
            auditLogRepository.save(log);
        } catch (Exception ignore) {
            // 감사 로그 실패가 본 비즈니스를 깨뜨리지 않도록 swallow
        }
        return result;
    }

    private String toJson(Object obj) {
        if (obj == null) return null;
        try {
            return objectMapper.writeValueAsString(obj);
        } catch (Exception e) {
            return obj.toString();
        }
    }
}
