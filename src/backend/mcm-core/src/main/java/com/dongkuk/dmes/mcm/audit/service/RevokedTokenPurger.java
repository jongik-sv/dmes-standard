package com.dongkuk.dmes.mcm.audit.service;

import com.dongkuk.dmes.mcm.audit.repository.RevokedTokenRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.time.Instant;

/**
 * 만료된 회수 토큰 정리기 — 갭 #12.
 *
 * <p>{@code expiresAt < now} 인 RevokedToken row 를 삭제. 토큰 자체가 만료된 후에는
 * jti 회수 검사 대상이 아니므로 보관 불필요. 일정은 예약 작업 `mcm.revokedTokenPurge`.
 */
@Component
public class RevokedTokenPurger {

    private static final Logger log = LoggerFactory.getLogger(RevokedTokenPurger.class);

    private final RevokedTokenRepository revokedTokenRepository;

    public RevokedTokenPurger(RevokedTokenRepository revokedTokenRepository) {
        this.revokedTokenRepository = revokedTokenRepository;
    }

    /** 만료된 회수 토큰을 지운다. 실패는 예외로 올린다 — 예약 작업 {@code mcm.revokedTokenPurge} 가 FAIL 로 기록한다. */
    public int purgeExpired() {
        int deleted = revokedTokenRepository.purgeExpired(Instant.now());
        if (deleted > 0) {
            log.info("RevokedTokenPurger: {} 개 만료 토큰 정리", deleted);
        }
        return deleted;
    }

    /** 옛 동작 유지(공개 메서드) — 실패를 삼키고 로그만 남긴다. 일정은 더 이상 이 클래스가 정하지 않는다. */
    public void purge() {
        try {
            purgeExpired();
        } catch (Exception e) {
            log.warn("RevokedTokenPurger 실패 (swallow): {}", e.getMessage());
        }
    }
}
