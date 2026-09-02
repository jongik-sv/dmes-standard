/*
 * 작성자: @junhwan-park
 * 작성일: 2026-06-01
 * 내용: commUserRoleCopy save 액션의 입력 DTO — sArgument 3 파라미터 (pUserIdCopy / pInfReqNo / pDescription)
 */
package com.dongkuk.dmes.mcm.csa.commUserRoleCopy.dto;

/**
 * commUserRoleCopy {@code save} action 의 입력 DTO.
 *
 * <p>As-Is {@code fn_save} (xfdl:317~358) 의 sArgument 3 파라미터 (xfdl:343~345):
 * <ul>
 *   <li>{@code pUserIdCopy} — Copy 대상 사용자 USER_ID (ds_copyUser.getColumn(0,"USER_ID"))</li>
 *   <li>{@code pInfReqNo} — 정보처리의뢰서번호 (D-002, edt_infReqNo.value)</li>
 *   <li>{@code pDescription} — 처리사유 (D-004, edt_description.value)</li>
 * </ul>
 *
 * <p>sInDatasets = {@code ds_userTo=ds_userTo} 는 본 DTO 와 별개로 grids.ds_userTo.rows 로 전달
 * (Service.save 의 두 번째 인자 {@code master}).
 *
 * <p>BPMN serviceTask {@code saveTask} 의 dto property — OASIS executor 자동 매핑.
 *
 * <p>인용: 분석리포트 §4.3 #5 / §7.1 / 기능설계서 §6.1 / BPMN설계서 §2.3.
 */
public class CommUserRoleCopySaveRequest {

    /** Copy 대상 사용자 USER_ID (ds_copyUser 행의 USER_ID 컬럼 / xfdl:343). */
    private String pUserIdCopy;

    /**
     * 정보처리의뢰서번호 (D-002 / xfdl:344). null 또는 빈 허용 (V-003 confirm 분기).
     *
     * <p>2026-06-04 — FE 사용자 명시 정책 변경: ToBe 화면에서 본 필드 입력 UI 폐기.
     * FE 가 항상 빈 문자열("")을 보냄 → Service 가 null/blank 정규화 후 SecUserRollHis 에 null 적재.
     * DTO 필드 자체는 호환성을 위해 보존 (BPMN dto property 매핑 안정).
     */
    private String pInfReqNo;

    /**
     * 처리사유 (D-004 / xfdl:345). null 또는 빈 허용.
     *
     * <p>2026-06-04 — FE 사용자 명시 정책 변경: ToBe 화면에서 본 필드 입력 UI 폐기.
     * FE 가 항상 빈 문자열("")을 보냄 → Service 가 null/blank 정규화 후 SecUserRollHis 에 null 적재.
     * DTO 필드 자체는 호환성을 위해 보존 (BPMN dto property 매핑 안정).
     */
    private String pDescription;

    public CommUserRoleCopySaveRequest() {}

    public String getPUserIdCopy() { return pUserIdCopy; }
    public void setPUserIdCopy(String pUserIdCopy) { this.pUserIdCopy = pUserIdCopy; }

    public String getPInfReqNo() { return pInfReqNo; }
    public void setPInfReqNo(String pInfReqNo) { this.pInfReqNo = pInfReqNo; }

    public String getPDescription() { return pDescription; }
    public void setPDescription(String pDescription) { this.pDescription = pDescription; }
}
