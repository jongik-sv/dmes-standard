package com.dongkuk.dmes.mdm.dma.termMng.dto;

import java.util.List;

/** {@code termMng} action={@code save} 요청 — 기능설계서 §4 D-001~D-011. {@code termId} 없으면 신규. */
public class TermSaveRequest {

    private Long termId;
    private String termName;
    private Integer senseNo;
    private String definition;
    private String context;
    private String engName;
    private String engAbbr;
    private List<String> synonyms;
    private List<String> aliases;
    private List<String> systems;
    private String stdBasis;

    public Long getTermId() { return termId; }
    public String getTermName() { return termName; }
    public Integer getSenseNo() { return senseNo; }
    public String getDefinition() { return definition; }
    public String getContext() { return context; }
    public String getEngName() { return engName; }
    public String getEngAbbr() { return engAbbr; }
    public List<String> getSynonyms() { return synonyms; }
    public List<String> getAliases() { return aliases; }
    public List<String> getSystems() { return systems; }
    public String getStdBasis() { return stdBasis; }

    public void setTermId(Long v) { this.termId = v; }
    public void setTermName(String v) { this.termName = v; }
    public void setSenseNo(Integer v) { this.senseNo = v; }
    public void setDefinition(String v) { this.definition = v; }
    public void setContext(String v) { this.context = v; }
    public void setEngName(String v) { this.engName = v; }
    public void setEngAbbr(String v) { this.engAbbr = v; }
    public void setSynonyms(List<String> v) { this.synonyms = v; }
    public void setAliases(List<String> v) { this.aliases = v; }
    public void setSystems(List<String> v) { this.systems = v; }
    public void setStdBasis(String v) { this.stdBasis = v; }
}
