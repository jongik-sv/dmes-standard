package com.dongkuk.dmes.mcm.userq.entity;

import java.io.Serializable;
import java.util.Objects;

/** {@link UserQueryAssign} 복합키 (QUERY_ID, USER_ID). */
public class UserQueryAssignId implements Serializable {

    private String queryId;
    private String userId;

    public UserQueryAssignId() {}

    public UserQueryAssignId(String queryId, String userId) {
        this.queryId = queryId;
        this.userId = userId;
    }

    public String getQueryId() { return queryId; }
    public void setQueryId(String queryId) { this.queryId = queryId; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof UserQueryAssignId that)) return false;
        return Objects.equals(queryId, that.queryId) && Objects.equals(userId, that.userId);
    }

    @Override
    public int hashCode() { return Objects.hash(queryId, userId); }
}
