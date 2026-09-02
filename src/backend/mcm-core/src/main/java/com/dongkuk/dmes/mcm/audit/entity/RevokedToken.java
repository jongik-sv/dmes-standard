package com.dongkuk.dmes.mcm.audit.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * JWT 회수 토큰 — jti 기반 블랙리스트. 갭 #12.
 *
 * <p>cactus {@code JwtAuthenticationFilter} 가 본 테이블을 조회해 매칭되면 401.
 * mcm-core 가 저장소만 제공, 실제 hook 은 사이트의 cactus 인프라가 호출.
 */
@Entity
@Table(name = "TB_SEC_REVOKED_TOKEN")
public class RevokedToken {

    @Id @Column(name = "JTI", length = 100)
    private String jti;

    @Column(name = "USER_ID", length = 100)
    private String userId;

    @Column(name = "REVOKED_AT", nullable = false)
    private Instant revokedAt;

    @Column(name = "EXPIRES_AT")
    private Instant expiresAt;

    public String getJti() { return jti; }
    public void setJti(String jti) { this.jti = jti; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public Instant getRevokedAt() { return revokedAt; }
    public void setRevokedAt(Instant revokedAt) { this.revokedAt = revokedAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
