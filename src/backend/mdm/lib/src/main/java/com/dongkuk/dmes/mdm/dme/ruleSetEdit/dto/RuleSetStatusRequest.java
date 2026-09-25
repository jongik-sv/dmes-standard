package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/** {@code ruleSetEdit} action={@code delete}(폐기)·{@code restore}(되살리기) 요청. */
public class RuleSetStatusRequest {

    private String setId;
    private Long rowVersion;

    public String getSetId() { return setId; }
    public Long getRowVersion() { return rowVersion; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
