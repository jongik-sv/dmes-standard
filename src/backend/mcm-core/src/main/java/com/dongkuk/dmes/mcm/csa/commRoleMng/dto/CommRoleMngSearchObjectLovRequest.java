/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-02
 * 내용: commRoleMng searchObjectLov 액션의 입력 DTO — sub2 OBJECT-LoV 검색 (round-2 fix)
 */
package com.dongkuk.dmes.mcm.csa.commRoleMng.dto;

/**
 * commRoleMng {@code searchObjectLov} action 의 입력 DTO (round-2 fix / Q-016 closed).
 *
 * <p>As-Is xfdl:321~336 {@code div_object_id.commonDynamic_onload} 인자의 검색 조건명
 * {@code "edt_OBJECT_ID"} 1:1 보존.
 *
 * <ul>
 *   <li>{@code edtOBJECTID} — OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어
 *       (As-Is selectMenuObjPop xml:169~172 의 {@code #{edt_OBJECT_ID}} 1:1 매핑)</li>
 * </ul>
 *
 * <p>BPMN serviceTask {@code searchObjectLovTask} 의 dto property — As-Is {@code CommMenuMng.commonList}
 * (selectMenuObjPop) 의 본 화면 namespace 내재화.
 *
 * <p>인용: 분석리포트 §5 P-001 / round-2 worker 지시 §3 (OBJECT-LoV 신규 구현).
 *
 * <p>Cactus camelCase 정합 (FE 의 {@code edtOBJECTID} 그대로 매핑) — W1·W2 정본 패턴.
 */
public class CommRoleMngSearchObjectLovRequest {

    /** OBJECT_ID 또는 OBJECT_NM UPPER LIKE 부분 검색어 (xml:169~172). */
    private String edtOBJECTID;

    public CommRoleMngSearchObjectLovRequest() {}

    public String getEdtOBJECTID() { return edtOBJECTID; }
    public void setEdtOBJECTID(String edtOBJECTID) { this.edtOBJECTID = edtOBJECTID; }
}
