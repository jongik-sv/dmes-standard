package com.dongkuk.dmes.mcm.audit.repository;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.Instant;
import java.util.List;

public interface AuditLogRepository extends JpaRepository<AuditLog, String> {

    List<AuditLog> findByActorUserIdOrderByOccurredAtDesc(String actorUserId);
    List<AuditLog> findByActionOrderByOccurredAtDesc(String action);

    @Query("SELECT a FROM AuditLog a WHERE a.occurredAt BETWEEN :from AND :to ORDER BY a.occurredAt DESC")
    List<AuditLog> findByPeriod(@Param("from") Instant from, @Param("to") Instant to);
}
