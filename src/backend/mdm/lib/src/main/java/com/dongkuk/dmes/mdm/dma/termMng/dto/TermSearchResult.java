package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/** {@code termMng} action={@code search} 응답. */
public class TermSearchResult {

    private List<TermRow> list;

    public TermSearchResult() {
    }

    public TermSearchResult(List<TermRow> list) {
        this.list = list;
    }

    public List<TermRow> getList() { return list; }
    public void setList(List<TermRow> v) { this.list = v; }
}
