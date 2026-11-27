/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: SecRolePerm 복합 PK — (ROLE_ID, OBJECT_ID)
 */
package com.dongkuk.dmes.mcm.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * {@link SecRolePerm} 의 복합 PK({@code @IdClass}). 필드 이름·타입은 엔티티 {@code @Id} 필드와 1:1 같다.
 */
public class SecRolePermId implements Serializable {
    private static final long serialVersionUID = 1L;

    private String roleId;
    private String objectId;

    public SecRolePermId() {}

    public SecRolePermId(String roleId, String objectId) {
        this.roleId = roleId;
        this.objectId = objectId;
    }

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof SecRolePermId that)) return false;
        return Objects.equals(roleId, that.roleId) && Objects.equals(objectId, that.objectId);
    }

    @Override
    public int hashCode() { return Objects.hash(roleId, objectId); }

    @Override
    public String toString() { return roleId + "/" + objectId; }
}
