package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/**
 * 세트 버전 조작 응답(D-144 2단계) — 새 버전 번호·종류(copy), 새 row_version(lock·unlock·handover). 해당 없는 칸은 null.
 * 버전은 문자열("1.001", {@code VersionNumbers.plain}).
 */
public class RuleSetVersionResult {

    private String setId;
    private String ver;
    /** 새 버전(copy)일 때만 채운다: MAJOR 또는 MINOR. */
    private String verKind;
    private Long rowVersion;

    public RuleSetVersionResult() {
    }

    public RuleSetVersionResult(String setId, String ver, String verKind, Long rowVersion) {
        this.setId = setId;
        this.ver = ver;
        this.verKind = verKind;
        this.rowVersion = rowVersion;
    }

    public String getSetId() { return setId; }
    public String getVer() { return ver; }
    public String getVerKind() { return verKind; }
    public Long getRowVersion() { return rowVersion; }

    public void setSetId(String v) { this.setId = v; }
    public void setVer(String v) { this.ver = v; }
    public void setVerKind(String v) { this.verKind = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
