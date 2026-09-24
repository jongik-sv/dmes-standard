package com.dongkuk.dmes.mdm.dmc.codeMng.dto;

import java.util.List;

/** {@code codeMng} action={@code search} 응답. */
public class CodeMngSearchResult {

    private List<CodeMngRow> rows;
    private int totalCount;

    public List<CodeMngRow> getRows() { return rows; }
    public int getTotalCount() { return totalCount; }

    public void setRows(List<CodeMngRow> v) { this.rows = v; }
    public void setTotalCount(int v) { this.totalCount = v; }
}
