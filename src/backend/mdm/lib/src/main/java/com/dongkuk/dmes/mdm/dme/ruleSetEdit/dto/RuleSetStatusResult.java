package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import java.util.List;

/**
 * {@code ruleSetEdit} action={@code delete}·{@code restore} 응답 — 바뀐 상태, 되살리기면 저장된 목록의 경고(WARN)들. {@code rowVersion} 은
 * D-144 2단계부터 null 이다(폐기·되살리기는 부모 상태만 바꾸고 행 버전을 보지 않는다, J2).
 */
public class RuleSetStatusResult {

    private String setId;
    private String status;
    private Long rowVersion;
    private List<RuleSetCheck> checks;

    public RuleSetStatusResult() {
    }

    public RuleSetStatusResult(String setId, String status, Long rowVersion, List<RuleSetCheck> checks) {
        this.setId = setId;
        this.status = status;
        this.rowVersion = rowVersion;
        this.checks = checks;
    }

    public String getSetId() { return setId; }
    public String getStatus() { return status; }
    public Long getRowVersion() { return rowVersion; }
    public List<RuleSetCheck> getChecks() { return checks; }

    public void setSetId(String v) { this.setId = v; }
    public void setStatus(String v) { this.status = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
    public void setChecks(List<RuleSetCheck> v) { this.checks = v; }
}
