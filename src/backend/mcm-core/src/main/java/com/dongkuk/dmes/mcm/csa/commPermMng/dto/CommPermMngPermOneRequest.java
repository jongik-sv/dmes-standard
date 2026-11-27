/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commPermMng searchPermOne 액션의 입력 DTO — 퍼미션 한 건(역할×오브젝트)
 */
package com.dongkuk.dmes.mcm.csa.commPermMng.dto;

/**
 * commPermMng {@code searchPermOne} action 의 입력 DTO. CactusRequest {@code params} 의 roleId·objectId.
 */
public class CommPermMngPermOneRequest {

    /** 고른 줄의 역할 ID. */
    private String roleId;

    /** 고른 줄의 오브젝트 ID. */
    private String objectId;

    public CommPermMngPermOneRequest() {}

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }
}
