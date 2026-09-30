package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/** 버전 조작 응답 — 새 버전 번호(copy)·새 row_version(lock·unlock·handover). 해당 없는 칸은 null. */
public class RuleVersionResult {

    private String maruRuleId;
    private Integer ver;
    private Long rowVersion;

    public RuleVersionResult() {
    }

    public RuleVersionResult(String maruRuleId, Integer ver, Long rowVersion) {
        this.maruRuleId = maruRuleId;
        this.ver = ver;
        this.rowVersion = rowVersion;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
