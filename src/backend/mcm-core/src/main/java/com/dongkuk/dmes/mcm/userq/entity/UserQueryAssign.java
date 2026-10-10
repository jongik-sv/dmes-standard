package com.dongkuk.dmes.mcm.userq.entity;

import com.dongkuk.dmes.mcm.common.audit.McmAuditEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.IdClass;
import jakarta.persistence.Table;

/**
 * 공용 쿼리 할당 — 정의와 사용자를 잇는다(스펙 2026-10-10-user-query-program-design §2, D4 사용자 단위만).
 * 외래 키 없음 — 없는 사용자의 할당 행도 남는다(관리 할당 탭이 「없는 사용자」 배지로 보여준다).
 */
@Entity
@Table(name = "TB_MCM_USRQ_ASSIGN", schema = "MCMAPUSER")
@IdClass(UserQueryAssignId.class)
public class UserQueryAssign extends McmAuditEntity {

    @Id
    @Column(name = "QUERY_ID", length = 40, nullable = false)
    private String queryId;

    /** 사용자 — TB_MCM_SEC_USER.USER_ID 와 같은 길이. */
    @Id
    @Column(name = "USER_ID", length = 30, nullable = false)
    private String userId;

    public UserQueryAssign() {}

    public UserQueryAssign(String queryId, String userId) {
        this.queryId = queryId;
        this.userId = userId;
    }

    public String getQueryId() { return queryId; }
    public void setQueryId(String queryId) { this.queryId = queryId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
}
