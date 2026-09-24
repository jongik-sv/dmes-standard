package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** {@code ruleMng} action={@code reg} 응답 — 만든 DRAFT 의 키와 row_version(자동 선점, 소유자 = 등록자). */
public class RuleRegResult {

    private String maruRuleId;
    private int ver;
    private long rowVersion;

    public RuleRegResult() {
    }

    public RuleRegResult(String maruRuleId, int ver, long rowVersion) {
        this.maruRuleId = maruRuleId;
        this.ver = ver;
        this.rowVersion = rowVersion;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public int getVer() { return ver; }
    public long getRowVersion() { return rowVersion; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(int v) { this.ver = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
}
