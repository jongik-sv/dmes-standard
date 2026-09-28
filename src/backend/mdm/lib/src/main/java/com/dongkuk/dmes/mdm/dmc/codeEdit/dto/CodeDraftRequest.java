package com.dongkuk.dmes.mdm.dmc.codeEdit.dto;

/**
 * {@code codeEdit} DRAFT 한 건 대상 요청 — delete·lock·unlock·handover. 행위자는 요청 사용자이고 요청에서 받는 사람 ID 는 {@code newOwnerId} 뿐이다(I22).
 * delete 는 {@code target} 이 {@code "CODE"} 면 마루 코드 통째 삭제(maruCodeId·auditVer), 비면 DRAFT 삭제(maruCodeId·ver·rowVersion)다.
 */
public class CodeDraftRequest {

    /** 마루 코드 통째 삭제 대상 값({@code target}). */
    public static final String TARGET_CODE = "CODE";

    /**
     * 확정 취소 대상 값({@code target}) — 아직 적용 시각이 오지 않은 확정 버전을 작성 중으로 되돌린다
     * (ADR-0002 D8, TSK-02-01 D4-1). 04·06 이 같은 값을 쓴다.
     */
    public static final String TARGET_CONFIRM = "CONFIRM";

    private String maruCodeId;
    /** "1.001". */
    private String ver;
    private Long rowVersion;
    /** 넘기기 대상. */
    private String newOwnerId;
    /** delete 대상 — {@code "CODE"} 면 마루 코드 삭제, 비면 DRAFT 삭제. */
    private String target;
    /** 마루 코드 삭제의 TB_MDM_CODE 감사 카운터(VER). */
    private Long auditVer;

    public String getMaruCodeId() { return maruCodeId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getTarget() { return target; }
    public Long getAuditVer() { return auditVer; }

    public void setMaruCodeId(String v) { this.maruCodeId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
}
