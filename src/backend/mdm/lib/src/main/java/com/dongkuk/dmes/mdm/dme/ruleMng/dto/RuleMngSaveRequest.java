package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * {@code ruleMng} action={@code save} 요청(D-105) — {@code target} {@code HEADER}(룰명·설명·활용처)만 받는다.
 *
 * <p>액션 이름을 따로 두지 않는 이유는 권한 어휘 16종({@code MdmActions})에 헤더 저장용 이름이 없다는 점이다(D-105 (7)).
 * dme 가 이미 {@code search}(target=RULE·DOMAIN)·{@code delete}(target=VERSION·RULE·CONFIRM)로 쓴 관용구다.
 *
 * <p>D-133 으로 {@code target VERSION}(적중 정책)과 그 칸({@code ver}·{@code rowVersion}·{@code hitPolicy})을 없앴다 — 적중 정책은
 * {@code ruleEdit} save part TABLE 이 표와 함께 저장한다.
 */
public class RuleMngSaveRequest {

    public static final String TARGET_HEADER = "HEADER";

    private String maruRuleId;
    private String target;

    /** HEADER — TB_MDM_RULE.VER(감사 카운터)와 대조해 충돌을 잡는다(D-105 (5)). */
    private Long auditVer;
    private String maruRuleName;
    private String description;
    private String usageNote;

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Long getAuditVer() { return auditVer; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
}
