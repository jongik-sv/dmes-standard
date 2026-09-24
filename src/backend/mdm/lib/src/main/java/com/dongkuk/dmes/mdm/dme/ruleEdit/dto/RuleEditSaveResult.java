package com.dongkuk.dmes.mdm.dme.ruleEdit.dto;

import java.util.List;
import java.util.Map;

/**
 * {@code ruleEdit} action={@code save} 응답. TABLE 은 새 row_version, 임시 ID → 발급 번호({@code {"-1": 5}}), 저장한 정의의 서버
 * 검사 결과(값이 없는 칸은 싣지 않는다), 저장한 행(seq 포함)을 싣는다. HEADER 는 {@code part} 만 의미가 있다.
 */
public class RuleEditSaveResult {

    private String part;
    private Long rowVersion;
    private Map<String, Integer> rowIdMap;
    private List<Map<String, Object>> issues;
    private List<Map<String, Object>> rows;

    public RuleEditSaveResult() {
    }

    public RuleEditSaveResult(String part, Long rowVersion, Map<String, Integer> rowIdMap, List<Map<String, Object>> issues,
                              List<Map<String, Object>> rows) {
        this.part = part;
        this.rowVersion = rowVersion;
        this.rowIdMap = rowIdMap;
        this.issues = issues;
        this.rows = rows;
    }

    public String getPart() { return part; }
    public Long getRowVersion() { return rowVersion; }
    public Map<String, Integer> getRowIdMap() { return rowIdMap; }
    public List<Map<String, Object>> getIssues() { return issues; }
    public List<Map<String, Object>> getRows() { return rows; }

    public void setPart(String v) { this.part = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setRowIdMap(Map<String, Integer> v) { this.rowIdMap = v; }
    public void setIssues(List<Map<String, Object>> v) { this.issues = v; }
    public void setRows(List<Map<String, Object>> v) { this.rows = v; }
}
