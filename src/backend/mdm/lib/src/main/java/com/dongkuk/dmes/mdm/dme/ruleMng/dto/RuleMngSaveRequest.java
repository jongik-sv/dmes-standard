package com.dongkuk.dmes.mdm.dme.ruleMng.dto;

/**
 * {@code ruleMng} action={@code save} 요청(D-105) — {@code target} 으로 헤더 수정과 버전 속성 수정을 가른다.
 *
 * <p>액션을 둘로 나누지 않는 이유는 권한 어휘 16종({@code MdmActions})에 헤더 저장용 이름이 없다는 점이다(D-105 (7)).
 * dme 가 이미 {@code search}(target=RULE·DOMAIN)·{@code delete}(target=VERSION·RULE·CONFIRM)로 쓴 관용구다.
 *
 * <p>{@code target} 별로 쓰는 칸이 서로 겹치지 않는다. <b>다른 쪽 칸을 같이 보내면 조용히 버리지 않고 거부한다</b> —
 * 버려진 칸이 있으면 화면이 계약을 잘못 읽은 것이기 때문이다.
 *
 * <table border="1">
 *   <caption>target 별 칸</caption>
 *   <tr><th>target</th><th>쓸 칸</th><th>버릴 칸(보내면 거부)</th></tr>
 *   <tr><td>{@code HEADER}</td>
 *       <td>{@code maruRuleId}, {@code auditVer}, {@code maruRuleName}, {@code description}, {@code usageNote}</td>
 *       <td>{@code ver}, {@code rowVersion}, {@code hitPolicy}</td></tr>
 *   <tr><td>{@code VERSION}</td>
 *       <td>{@code maruRuleId}, {@code ver}, {@code rowVersion}, {@code hitPolicy}</td>
 *       <td>{@code auditVer}, {@code maruRuleName}, {@code description}, {@code usageNote}</td></tr>
 * </table>
 */
public class RuleMngSaveRequest {

    public static final String TARGET_HEADER = "HEADER";
    public static final String TARGET_VERSION = "VERSION";

    private String maruRuleId;
    private String target;

    /** HEADER — TB_MDM_RULE.VER(감사 카운터)와 대조해 충돌을 잡는다(D-105 (5)). */
    private Long auditVer;
    private String maruRuleName;
    private String description;
    private String usageNote;

    /** VERSION — TB_MDM_RULE_VER 의 어느 버전인지, 그리고 그 버전의 낙관적 잠금 값. */
    private Integer ver;
    private Long rowVersion;
    /** FIRST·UNIQUE·PRIORITY·COLLECT·ANY. */
    private String hitPolicy;

    public String getMaruRuleId() { return maruRuleId; }
    public String getTarget() { return target; }
    public Long getAuditVer() { return auditVer; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getHitPolicy() { return hitPolicy; }

    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setTarget(String v) { this.target = v; }
    public void setAuditVer(Long v) { this.auditVer = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
}
