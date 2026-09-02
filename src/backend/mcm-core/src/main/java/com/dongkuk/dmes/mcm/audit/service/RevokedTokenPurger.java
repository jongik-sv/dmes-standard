package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * 만료된 회수 토큰 정리기 — 갭 #12.
 *
 * <p>매 시간 {@code expiresAt < now} 인 RevokedToken row 를 삭제. 토큰 자체가 만료된 후에는
 * jti 회수 검사 대상이 아니므로 보관 불필요.
 */
@Component
public class RevokedTokenPurger {

    private static final Logger log = LoggerFactory.getLogger(RevokedTokenPurger.class);

    private final RevokedTokenRepository revokedTokenRepository;

    public RevokedTokenPurger(RevokedTokenRepository revokedTokenRepository) {
        this.revokedTokenRepository = revokedTokenRepository;
    }

    /** 매 1시간마다 실행. */
    @Scheduled(fixedDelay = 3_600_000L, initialDelay = 60_000L)
    public void purge() {
        try {
            int deleted = revokedTokenRepository.purgeExpired(Instant.now());
            if (deleted > 0) {
                log.info("RevokedTokenPurger: {} 개 만료 토큰 정리", deleted);
            }
        } catch (Exception e) {
            log.warn("RevokedTokenPurger 실패 (swallow): {}", e.getMessage());
        }
    }
}
