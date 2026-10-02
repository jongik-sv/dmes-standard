package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

/** {@code ruleSetMng} action={@code reg} 응답 — 만든 세트의 ID, 첫 DRAFT 버전({@code "1.000"})과 그 row_version(0). */
public class RuleSetRegResult {

    private String setId;
    private long rowVersion;
    private String ver;

    public RuleSetRegResult() {
    }

    public RuleSetRegResult(String setId, long rowVersion, String ver) {
        this.setId = setId;
        this.rowVersion = rowVersion;
        this.ver = ver;
    }

    public String getSetId() { return setId; }
    public long getRowVersion() { return rowVersion; }
    public String getVer() { return ver; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
    public void setVer(String v) { this.ver = v; }
}
