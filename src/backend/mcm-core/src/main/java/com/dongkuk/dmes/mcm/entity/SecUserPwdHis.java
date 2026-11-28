/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-28
 * 내용: SecUserPwdHis 엔티티 — TB_MCM_SEC_USER_PWD_HIS (비밀번호 이력, V24)
 */
package com.dongkuk.dmes.mcm.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * 비밀번호 이력 — 해시만 담는다. 최근 N개 재사용 금지(mcm.password.history-count)와 변경 시각·접속 IP 기록에 쓴다.
 *
 * <p>CHG_TP: {@code SELF} 본인 변경 · {@code INIT} 관리자 초기화(임시 비밀번호). 재사용 비교는 SELF 만 본다 —
 * 임시 비밀번호는 원래 새 비밀번호로 받지 않는다.
 */
@Entity
@Table(name = "TB_MCM_SEC_USER_PWD_HIS", schema = "MCMAPUSER")
@IdClass(SecUserPwdHis.PK.class)
public class SecUserPwdHis extends McmAuditEntity {

    /** 본인 변경. */
    public static final String TP_SELF = "SELF";
    /** 관리자 초기화. */
    public static final String TP_INIT = "INIT";

    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    @Id
    @Column(name = "CHG_AT", nullable = false)
    private LocalDateTime chgAt;

    @Column(name = "USER_ENC_PWD", length = 100, nullable = false)
    private String userEncPwd;

    @Column(name = "CHG_TP", length = 10, nullable = false)
    private String chgTp;

    @Column(name = "CLIENT_IP", length = 64)
    private String clientIp;

    public SecUserPwdHis() {}

    public SecUserPwdHis(String userId, LocalDateTime chgAt, String userEncPwd, String chgTp, String clientIp) {
        this.userId = userId;
        this.chgAt = chgAt;
        this.userEncPwd = userEncPwd;
        this.chgTp = chgTp;
        this.clientIp = clientIp;
    }

    public String getUserId() { return userId; }
    public LocalDateTime getChgAt() { return chgAt; }
    public String getUserEncPwd() { return userEncPwd; }
    public String getChgTp() { return chgTp; }
    public String getClientIp() { return clientIp; }

    /** 복합 PK — USER_ID + CHG_AT. */
    public static class PK implements Serializable {
        private static final long serialVersionUID = 1L;

        private String userId;
        private LocalDateTime chgAt;

        public PK() {}

        public PK(String userId, LocalDateTime chgAt) {
            this.userId = userId;
            this.chgAt = chgAt;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof PK pk)) return false;
            return Objects.equals(userId, pk.userId) && Objects.equals(chgAt, pk.chgAt);
        }

        @Override
        public int hashCode() {
            return Objects.hash(userId, chgAt);
        }
    }
}
