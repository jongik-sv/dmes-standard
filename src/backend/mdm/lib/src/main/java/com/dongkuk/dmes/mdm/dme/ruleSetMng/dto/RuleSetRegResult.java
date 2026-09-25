package com.dongkuk.dmes.mdm.dme.ruleSetMng.dto;

/** {@code ruleSetMng} action={@code reg} 응답 — 만든 세트의 ID 와 row_version(0). */
public class RuleSetRegResult {

    private String setId;
    private long rowVersion;

    public RuleSetRegResult() {
    }

    public RuleSetRegResult(String setId, long rowVersion) {
        this.setId = setId;
        this.rowVersion = rowVersion;
    }

    public String getSetId() { return setId; }
    public long getRowVersion() { return rowVersion; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
}
