package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

import java.util.List;

/** {@code dataCateEdit} action={@code compare} 응답 — {@code DataCategoryResolver.Preview} 그대로 옮긴 것. */
public class CateCompareResult {

    private boolean invalid;
    private List<String> codes;
    private int count;

    public boolean isInvalid() { return invalid; }
    public List<String> getCodes() { return codes; }
    public int getCount() { return count; }

    public void setInvalid(boolean v) { this.invalid = v; }
    public void setCodes(List<String> v) { this.codes = v; }
    public void setCount(int v) { this.count = v; }
}
