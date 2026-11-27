/*
 * 작성자: @jongik-sv
 * 작성일: 2026-11-27
 * 내용: commObjMng searchObjPerm·searchObjMenu 액션의 입력 DTO — 오브젝트 하나 지정
 */
package com.dongkuk.dmes.mcm.csa.commObjMng.dto;

/** commObjMng {@code searchObjPerm}·{@code searchObjMenu} action 의 입력 DTO (params.objectId). */
public class CommObjMngObjRequest {

    /** 대상 오브젝트 ID. */
    private String objectId;

    public CommObjMngObjRequest() {}

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }
}
