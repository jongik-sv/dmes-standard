package com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto;

/** {@code ruleSetEdit} action={@code delete}(폐기)·{@code restore}(되살리기) 요청. */
public class RuleSetStatusRequest {

    private String setId;
    /** D-144 2단계부터 읽지 않는다(옛 화면 호환). 폐기·되살리기는 부모 상태 조건부 UPDATE 만 한다(J2). */
    private Long rowVersion;

    public String getSetId() { return setId; }
    public Long getRowVersion() { return rowVersion; }

    public void setSetId(String v) { this.setId = v; }
    public void setRowVersion(Long v) { this.rowVersion = v; }
}
