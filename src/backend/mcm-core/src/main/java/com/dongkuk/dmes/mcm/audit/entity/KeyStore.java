package com.dongkuk.dmes.mcm.audit.entity;

import jakarta.persistence.*;

import java.time.Instant;

/**
 * JWT 키 저장소 — 갭 #13. yml 의 단일 secret 키를 DB 다중 키 + kid 회전으로 대체.
 */
@Entity
@Table(name = "TB_SEC_KEY_STORE")
public class KeyStore {

    @Id @Column(name = "KID", length = 50)
    private String kid;

    @Column(name = "ALG", length = 20)
    private String alg;

    @Column(name = "PUBLIC_KEY", columnDefinition = "TEXT")
    private String publicKey;

    @Column(name = "PRIVATE_KEY", columnDefinition = "TEXT")
    private String privateKey;

    @Column(name = "SECRET", columnDefinition = "TEXT")
    private String secret;

    @Column(name = "ACTIVE", length = 1)
    private String active;

    @Column(name = "CREATED_AT")
    private Instant createdAt;

    @Column(name = "EXPIRES_AT")
    private Instant expiresAt;

    public String getKid() { return kid; }
    public void setKid(String kid) { this.kid = kid; }
    public String getAlg() { return alg; }
    public void setAlg(String alg) { this.alg = alg; }
    public String getPublicKey() { return publicKey; }
    public void setPublicKey(String publicKey) { this.publicKey = publicKey; }
    public String getPrivateKey() { return privateKey; }
    public void setPrivateKey(String privateKey) { this.privateKey = privateKey; }
    public String getSecret() { return secret; }
    public void setSecret(String secret) { this.secret = secret; }
    public String getActive() { return active; }
    public void setActive(String active) { this.active = active; }
    public Instant getCreatedAt() { return createdAt; }
    public void setCreatedAt(Instant createdAt) { this.createdAt = createdAt; }
    public Instant getExpiresAt() { return expiresAt; }
    public void setExpiresAt(Instant expiresAt) { this.expiresAt = expiresAt; }
}
