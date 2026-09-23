package com.dongkuk.dmes.mdm.dma.termMng.dto;

/** {@code termMng} action={@code search} 요청 — 기능설계서 §3 S-001~S-003. */
public class TermSearchRequest {

    /** S-001 — 표기·영문 약어·동의어·별칭 통합 부분 일치. */
    private String keyword;

    /** S-002 — 사용 시스템(SYSTEMS 배열에 포함). */
    private String systems;

    /** S-003 — 맥락(CONTEXT 부분 일치). */
    private String context;

    public String getKeyword() { return keyword; }
    public String getSystems() { return systems; }
    public String getContext() { return context; }

    public void setKeyword(String v) { this.keyword = v; }
    public void setSystems(String v) { this.systems = v; }
    public void setContext(String v) { this.context = v; }
}
