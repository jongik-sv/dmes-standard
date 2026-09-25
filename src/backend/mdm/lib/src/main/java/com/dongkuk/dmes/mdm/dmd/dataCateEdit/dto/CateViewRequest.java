package com.dongkuk.dmes.mdm.dmd.dataCateEdit.dto;

/** {@code dataCateEdit} action={@code view}·{@code delete}·{@code restore} 공용 요청 — 카테고리 키만 필요하다. */
public class CateViewRequest {

    private String maruDataId;
    private String cateId;

    public String getMaruDataId() { return maruDataId; }
    public String getCateId() { return cateId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCateId(String v) { this.cateId = v; }
}
