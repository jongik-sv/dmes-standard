package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;

/** {@code ruleSetEdit} action={@code save} 응답 — 새 row_version 과 저장을 막지 않은 경고(WARN)들. */
public class RuleSetSaveResult {

    private String setId;
    private long rowVersion;
    private List<RuleSetCheck> checks;

    public RuleSetSaveResult() {
    }

    public RuleSetSaveResult(String setId, long rowVersion, List<RuleSetCheck> checks) {
        this.setId = setId;
        this.rowVersion = rowVersion;
        this.checks = checks;
    }

    public String getSetId() { return setId; }
    public long getRowVersion() { return rowVersion; }
    public List<RuleSetCheck> getChecks() { return checks; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(long v) { this.rowVersion = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
}
