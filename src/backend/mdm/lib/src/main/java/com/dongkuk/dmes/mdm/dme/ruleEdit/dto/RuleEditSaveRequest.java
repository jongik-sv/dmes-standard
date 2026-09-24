package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code save} 요청 — {@code part} 로 저장 부분을 고른다(HEADER·TABLE, 확장 지점 design §6.8).
 *
 * <p>{@code rows} 는 {@code params} 가 아니라 {@code grids.rows.rows} 로 받는다 — OASIS 는 params 배열을 받지 않고(6-E-2), grids 는
 * 같은 이름의 DTO 속성에 채운다(Build 실측). 이 경로에서 JSON 숫자는 {@code Double} 로 오므로 서버가 정수로 바꾼다. 원소는
 * {@code {rowId(새 행은 음수), rowKind, cells(JSON 문자열), note}} 이고 순서가 곧 표시 순서다. seq 는 받지 않는다(I10).
 */
public class RuleEditSaveRequest {

    /** HEADER·TABLE. */
    private String part;
    private String maruRuleId;
    private Integer ver;
    private Long rowVersion;
    private String maruRuleName;
    private String description;
    private String usageNote;
    private String hitPolicy;
    private List<Map<String, Object>> rows;

    public String getPart() { return part; }
    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }
    public String getHitPolicy() { return hitPolicy; }
    public List<Map<String, Object>> getRows() { return rows; }

    public void setPart(String v) { this.part = v; }
    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    public void setRows(List<Map<String, Object>> v) { this.rows = v; }
}
