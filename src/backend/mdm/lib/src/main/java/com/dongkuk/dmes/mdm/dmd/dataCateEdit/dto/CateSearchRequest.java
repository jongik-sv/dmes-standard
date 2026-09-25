package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/** {@code dataCateEdit} action={@code search} 요청 — 그 마루 데이터의 카테고리 목록(TSK-07-02 design.md §2). */
public class CateSearchRequest {

    private String maruDataId;

    public String getMaruDataId() { return maruDataId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
}
