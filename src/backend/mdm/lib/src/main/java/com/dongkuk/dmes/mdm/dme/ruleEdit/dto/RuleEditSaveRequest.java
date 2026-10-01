package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code save} 요청 — {@code part} 로 저장 부분을 고른다(TABLE·COLUMNS·CASE).
 *
 * <p><b>D-105 로 HEADER 가 빠졌다</b> — 헤더 저장은 헤더·버전 화면({@code ruleMng} action save target HEADER)이 한다.
 *
 * <p><b>{@code hitPolicy} 는 part TABLE 이 받는다(D-133, D-105 (4) 번복)</b> — 적중 정책은 판정표의 해석 규칙이라 표의 다른 변경과
 * 함께 [표 저장] 한 번, 같은 트랜잭션에 저장한다. 비우면 저장된 값을 그대로 쓴다. 산출 룰(DERIVE)에 값을 보내면 거부한다.
 * part COLUMNS·CASE 는 이 칸을 쓰지 않으며, 보내면 거부한다(조용히 버리지 않는다).
 *
 * <p>{@code rows} 는 {@code params} 가 아니라 {@code grids.rows.rows} 로 받는다 — OASIS 는 params 배열을 받지 않고(6-E-2), grids 는
 * 같은 이름의 DTO 속성에 채운다(Build 실측). 이 경로에서 JSON 숫자는 {@code Double} 로 오므로 서버가 정수로 바꾼다. 원소는
 * {@code {rowId(새 행은 음수), rowKind, cells(JSON 문자열), note}} 이고 순서가 곧 표시 순서다. seq 는 받지 않는다(I10).
 *
 * <p>part CASE(TSK-08-04 design §6.6)는 {@code caseId}(없으면 새 케이스)·{@code rowVersion}(케이스의 값)·{@code caseName}·{@code inputJson}·
 * {@code expectedJson}·{@code description}·{@code caseDeleted} 를 쓴다. JSON 두 칸은 문자열로 받는다(중첩 Map 바인딩 회피).
 */
public class RuleEditSaveRequest {

    /** TABLE·COLUMNS·CASE. */
    private String part;
    private String maruRuleId;
    private Integer ver;
    private Long rowVersion;
    private String maruRuleName;
    private String description;
    private String usageNote;
    /** part TABLE 만 — FIRST·UNIQUE·PRIORITY·COLLECT·ANY. 비우면 저장된 값(D-133). */
    private String hitPolicy;
    private List<Map<String, Object>> rows;
    private Integer caseId;
    private String caseName;
    private String inputJson;
    private String expectedJson;
    private Boolean caseDeleted;

    public String getPart() { return part; }
    public String getMaruRuleId() { return maruRuleId; }
    public Integer getVer() { return ver; }
    public Long getRowVersion() { return rowVersion; }
    public String getMaruRuleName() { return maruRuleName; }
    public String getDescription() { return description; }
    public String getUsageNote() { return usageNote; }
    public String getHitPolicy() { return hitPolicy; }
    public List<Map<String, Object>> getRows() { return rows; }
    public Integer getCaseId() { return caseId; }
    public String getCaseName() { return caseName; }
    public String getInputJson() { return inputJson; }
    public String getExpectedJson() { return expectedJson; }
    public Boolean getCaseDeleted() { return caseDeleted; }

    public void setPart(String v) { this.part = v; }
    public void setMaruRuleId(String v) { this.maruRuleId = v; }
    public void setVer(Integer v) { this.ver = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setMaruRuleName(String v) { this.maruRuleName = v; }
    public void setDescription(String v) { this.description = v; }
    public void setUsageNote(String v) { this.usageNote = v; }
    public void setHitPolicy(String v) { this.hitPolicy = v; }
    public void setRows(List<Map<String, Object>> v) { this.rows = v; }
    public void setCaseId(Integer v) { this.caseId = v; }
    public void setCaseName(String v) { this.caseName = v; }
    public void setInputJson(String v) { this.inputJson = v; }
    public void setExpectedJson(String v) { this.expectedJson = v; }
    public void setCaseDeleted(Boolean v) { this.caseDeleted = v; }
}
