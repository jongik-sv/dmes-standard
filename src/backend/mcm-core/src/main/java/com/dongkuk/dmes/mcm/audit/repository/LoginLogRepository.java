package com.dongkuk.dmes.mcm.audit.repository;

import com.dongkuk.dmes.mcm.audit.entity.LoginLog;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface LoginLogRepository extends JpaRepository<LoginLog, String> {
    List<LoginLog> findByUserIdOrderByOccurredAtDesc(String userId);
    List<LoginLog> findByEventTypeOrderByOccurredAtDesc(String eventType);
}
