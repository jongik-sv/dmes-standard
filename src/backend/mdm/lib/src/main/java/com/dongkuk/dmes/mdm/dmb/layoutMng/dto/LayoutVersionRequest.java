package com.dongkuk.dmes.mdm.dmb.layoutMng.dto;

/**
 * 레이아웃·헤더 버전 조작 요청(D-144 3단계, {@code layoutMng}·{@code headerMng} 공용) — copy·delete(target)·lock·unlock·handover.
 * 버전은 소수 셋째 자리 문자열({@code "1.001"}). {@code delete} 의 {@code target} 은 VERSION(DRAFT 삭제)·CONFIRM(확정 취소)이다.
 */
public class LayoutVersionRequest {

    public static final String TARGET_VERSION = "VERSION";
    public static final String TARGET_CONFIRM = "CONFIRM";

    private Long layoutId;
    private String ver;
    private String verKind;
    private Long rowVersion;
    private String newOwnerId;
    private String target;

    public Long getLayoutId() { return layoutId; }
    public String getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public Long getRowVersion() { return rowVersion; }
    public String getNewOwnerId() { return newOwnerId; }
    public String getTarget() { return target; }

    public void setLayoutId(Long v) { this.layoutId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setNewOwnerId(String v) { this.newOwnerId = v; }
    public void setTarget(String v) { this.target = v; }
}
