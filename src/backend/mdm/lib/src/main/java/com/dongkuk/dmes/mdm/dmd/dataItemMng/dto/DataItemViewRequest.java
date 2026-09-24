package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} action={@code view} 요청 — 마루 데이터를 고르면 머리 정보도 준다(design.md §2). */
public class DataItemViewRequest {

    /** 선택. 없으면 마루 데이터 목록만 돌려준다. */
    private String maruDataId;

    public String getMaruDataId() { return maruDataId; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
}
