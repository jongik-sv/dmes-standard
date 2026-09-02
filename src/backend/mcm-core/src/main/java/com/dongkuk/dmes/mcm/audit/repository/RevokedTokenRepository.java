package com.dongkuk.dmes.mcm.audit.repository;

import com.dongkuk.dmes.mcm.audit.entity.RevokedToken;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;

public interface RevokedTokenRepository extends JpaRepository<RevokedToken, String> {
    List<RevokedToken> findByUserId(String userId);

    @Modifying
    @Transactional
    @Query("DELETE FROM RevokedToken r WHERE r.expiresAt < :now")
    int purgeExpired(@Param("now") Instant now);
}
