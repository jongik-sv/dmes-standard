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

    /**
     * 조건(S-001~S-003)이 하나도 없을 때만 적용하는 행 수 상한(화면 성능 가이드 R1). 비우거나 0 이하면 상한 없음 — 이 값을 보내지 않는
     * 기존 호출자는 지금처럼 전체를 받는다. 조건이 있으면 무시한다.
     */
    private Integer limit;

    public Integer getLimit() { return limit; }
    public void setLimit(Integer v) { this.limit = v; }
}
