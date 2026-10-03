package com.dongkuk.dmes.mcm.audit.repository;

import com.dongkuk.dmes.mcm.audit.entity.AuditLog;
import org.springframework.data.domain.Pageable;
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

    // ── 페이지 조회 (AuditLogService.searchByActor 의 page·size 경로) ──
    // List 반환이라 Page 와 달리 COUNT 쿼리를 따로 내지 않는다. 정렬·범위는 Pageable 이 정한다.

    List<AuditLog> findByActorUserId(String actorUserId, Pageable pageable);

    List<AuditLog> findByAction(String action, Pageable pageable);

    @Query("SELECT a FROM AuditLog a")
    List<AuditLog> findPage(Pageable pageable);
}
