package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * {@code ruleMng} action={@code save} 응답 — 저장 뒤의 감사 카운터(HEADER) 또는 row_version(VERSION)이라 화면이 바로 다음 저장을
 * 이어갈 수 있다. 저장 대상 밖의 칸은 null.
 */
public class RuleMngSaveResult {

    private String maruRuleId;
    private String target;
    private Long auditVer;
    private Integer ver;
    private Long rowVersion;

    public RuleMngSaveResult() {
    }

    public RuleMngSaveResult(String maruRuleId, String target, Long auditVer, Integer ver, Long rowVersion) {
        this.maruRuleId = maruRuleId;
        this.target = target;
        this.auditVer = auditVer;
        this.ver = ver;
        this.rowVersion = rowVersion;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Long getAuditVer() { return auditVer; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
