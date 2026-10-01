package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * {@code ruleMng} action={@code save} 응답 — 저장 뒤의 감사 카운터(HEADER)라 화면이 바로 다음 저장을 이어갈 수 있다.
 * D-133 으로 target VERSION 이 빠져 {@code ver}·{@code rowVersion} 칸도 없앴다.
 */
public class RuleMngSaveResult {

    private String maruRuleId;
    private String target;
    private Long auditVer;

    public RuleMngSaveResult() {
    }

    public RuleMngSaveResult(String maruRuleId, String target, Long auditVer) {
        this.maruRuleId = maruRuleId;
        this.target = target;
        this.auditVer = auditVer;
    }

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Long getAuditVer() { return auditVer; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
}
