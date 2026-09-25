package com.dongkuk.dmes.mdm.dmd.dataMng.dto;

import java.util.List;

/** {@code dataMng} action={@code search} 응답 — 페이징 없이 전체(D2 최소 범위, codeMng 선례). */
public class DataMngSearchResult {

    private List<DataMngRow> list;

    public DataMngSearchResult() {
    }

    public DataMngSearchResult(List<DataMngRow> list) {
        this.list = list;
    }

    public List<DataMngRow> getList() { return list; }

    public void setList(List<DataMngRow> v) { this.list = v; }
}
