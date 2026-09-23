package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/** {@code termMng} action={@code save} 응답 — {@code warnings} 는 비차단 경고(I8, 예: {@code ENG_ABBR_DUP}). */
public class TermSaveResult {

    private Long termId;
    private List<String> warnings;
    private List<TermRow> list;

    public TermSaveResult() {
    }

    public TermSaveResult(Long termId, List<String> warnings, List<TermRow> list) {
        this.termId = termId;
        this.warnings = warnings;
        this.list = list;
    }

    public Long getTermId() { return termId; }
    public List<String> getWarnings() { return warnings; }
    public List<TermRow> getList() { return list; }

    public void setTermId(Long v) { this.termId = v; }
    public void setWarnings(List<String> v) { this.warnings = v; }
    public void setList(List<TermRow> v) { this.list = v; }
}
