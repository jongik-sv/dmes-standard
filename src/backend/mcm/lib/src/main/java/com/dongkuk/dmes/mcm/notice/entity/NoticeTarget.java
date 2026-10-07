/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: NoticeTarget 엔티티 — TB_MCM_NOTICE_TARGET (공지 게시 대상 역할) 1:1 정의
 */
package com.dongkuk.dmes.mcm.notice.entity;

import com.dongkuk.dmes.cactus.audit.CactusAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Index;
import jakarta.persistence.Table;

import java.io.Serializable;
import java.util.Objects;

/**
 * 공지 게시 대상 — {@code TB_MCM_NOTICE_TARGET} (V4, 2026-10-02).
 *
 * <p>{@code TB_MCM_NOTICE.TARGET_SCOPE='ROLE'} 인 공지가 어느 역할에게 보이는지 적는다. {@code ROLE_ID} 는 mcm
 * {@code TB_MCM_SEC_ROLE.ROLE_ID} 값("ROLE_" 접두 없이)이다. 2026-10-07 mcm 이전 뒤에도 외래키는 두지 않는다(역할 삭제가 공지 저장을 막지 않게).
 *
 * <p>역할 그룹이 아니라 역할인 이유: 서비스가 요청 시점에 아는 사용자 정보는 BFF 의 {@code X-Authenticated-Role}(역할 ID 목록)
 * 뿐이다 (V4 헤더 주석).
 */
@Entity
@Table(name = "TB_MCM_NOTICE_TARGET", schema = "MCMAPUSER",
        indexes = @Index(name = "IX_TB_MCM_NOTICE_TARGET_ROLE", columnList = "ROLE_ID"))
@IdClass(NoticeTarget.Key.class)
public class NoticeTarget extends CactusAuditEntity {

    @Id
    @Column(name = "NOTICE_ID", length = 30, nullable = false)
    private String noticeId;

    @Id
    @Column(name = "ROLE_ID", length = 100, nullable = false)
    private String roleId;

    protected NoticeTarget() {
        // JPA 기본 생성자
    }

    public NoticeTarget(String noticeId, String roleId) {
        this.noticeId = noticeId;
        this.roleId = roleId;
    }

    public String getNoticeId() { return noticeId; }
    public String getRoleId() { return roleId; }

    /** 복합 PK (NOTICE_ID, ROLE_ID). */
    public static class Key implements Serializable {
        private String noticeId;
        private String roleId;

        public Key() {
        }

        public Key(String noticeId, String roleId) {
            this.noticeId = noticeId;
            this.roleId = roleId;
        }

        @Override
        public boolean equals(Object o) {
            if (this == o) return true;
            if (!(o instanceof Key k)) return false;
            return Objects.equals(noticeId, k.noticeId) && Objects.equals(roleId, k.roleId);
        }

        @Override
        public int hashCode() {
            return Objects.hash(noticeId, roleId);
        }
    }
}
