package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;

/**
 * {@code ruleSetEdit} action={@code save} 응답 — 새 row_version 과 저장을 막지 않은 경고(WARN)들. {@code part=CASE} 면 {@code rowVersion} 은 케이스의
 * 것이고(삭제면 null) {@code caseId} 가 채워진다. 세트 저장이면 {@code caseId} 는 null.
 */
public class RuleSetSaveResult {

    private String setId;
    private Long rowVersion;
    private Integer caseId;
    private List<RuleSetCheck> checks;

    public RuleSetSaveResult() {
    }

    public RuleSetSaveResult(String setId, Long rowVersion, List<RuleSetCheck> checks) {
        this.setId = setId;
        this.rowVersion = rowVersion;
        this.checks = checks;
    }

    public String getSetId() { return setId; }
    public Long getRowVersion() { return rowVersion; }
    public List<RuleSetCheck> getChecks() { return checks; }

    public Integer getCaseId() { return caseId; }
    public void setCaseId(Integer v) { this.caseId = v; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
}
