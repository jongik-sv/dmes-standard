package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** 버전 조작 응답 — 새 버전 번호(copy)·새 row_version(lock·unlock·handover). 해당 없는 칸은 null. */
public class RuleVersionResult {

    private String maruRuleId;
    private String ver;
    private Long rowVersion;
    /** 새 버전(copy)일 때만 채운다: MAJOR 또는 MINOR. */
    private String verKind;

    public RuleVersionResult() {
    }

    public RuleVersionResult(String maruRuleId, String ver, Long rowVersion) {
        this.maruRuleId = maruRuleId;
        this.ver = ver;
        this.rowVersion = rowVersion;
    }

    public RuleVersionResult(String maruRuleId, String ver, String verKind, Long rowVersion) {
        this(maruRuleId, ver, rowVersion);
        this.verKind = verKind;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public String getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getVerKind() { return verKind; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setVerKind(String v) { this.verKind = v; }
}
