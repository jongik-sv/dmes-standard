package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * 세트 버전 조작 요청(D-144 2단계) — copy·delete(target)·lock·unlock·handover. 버전은 소수 셋째 자리 문자열("1.001").
 * {@code delete} 의 {@code target} 은 SET(폐기)·VERSION(DRAFT 삭제)·CONFIRM(확정 취소) 중 하나다(J6, 비면 거부).
 */
public class RuleSetVersionRequest {

    public static final String TARGET_SET = "SET";
    public static final String TARGET_VERSION = "VERSION";
    public static final String TARGET_CONFIRM = "CONFIRM";

    private String setId;
    private String ver;
    private String verKind;
    private Long rowVersion;
    private String target;
    private String newOwnerId;

    public String getSetId() { return setId; }
    public String getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public Long getRowVersion() { return rowVersion; }
    public String getTarget() { return target; }
    public String getNewOwnerId() { return newOwnerId; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setTarget(String v) { this.target = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
}
