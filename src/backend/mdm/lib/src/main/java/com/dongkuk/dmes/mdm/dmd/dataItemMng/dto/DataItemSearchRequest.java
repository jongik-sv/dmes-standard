package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} action={@code search} 요청 — 서버 페이징(Q3). */
public class DataItemSearchRequest {

    /** 필수. */
    private String maruDataId;
    /** 키 부분 일치(대소문자 무시). */
    private String code;
    /** 이름 부분 일치. */
    private String name;
    /** 없으면 BASE(전체). */
    private String cateId;
    /** 닫힌 항목 보기. */
    private Boolean showClosed;
    /** 0부터. 기본 0. */
    private Integer page;
    /** 기본 50, 상한 200. */
    private Integer size;

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public String getName() { return name; }
    public String getCateId() { return cateId; }
    public Boolean getShowClosed() { return showClosed; }
    public Integer getPage() { return page; }
    public Integer getSize() { return size; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCode(String v) { this.code = v; }
    public void setName(String v) { this.name = v; }
    public void setCateId(String v) { this.cateId = v; }
    public void setShowClosed(Boolean v) { this.showClosed = v; }
    public void setPage(Integer v) { this.page = v; }
    public void setSize(Integer v) { this.size = v; }
}
