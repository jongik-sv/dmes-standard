package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/**
 * {@code termMng} action={@code save} 응답 — {@code warnings} 는 비차단 경고(I8, 예: {@code ENG_ABBR_DUP}).
 * 전체 용어 목록은 싣지 않는다(8천 건·약 3MB 가 저장마다 오가던 것을 뺐다) — 화면이 현재 조건(첫 조회 상한 포함)으로 다시 조회한다.
 */
public class TermSaveResult {

    private Long termId;
    private List<String> warnings;

    public TermSaveResult() {
    }

    public TermSaveResult(Long termId, List<String> warnings) {
        this.termId = termId;
        this.warnings = warnings;
    }

    public Long getTermId() { return termId; }
    public List<String> getWarnings() { return warnings; }

    public void setTermId(Long v) { this.termId = v; }
    public void setWarnings(List<String> v) { this.warnings = v; }
}
