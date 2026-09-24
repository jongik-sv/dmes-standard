package com.dongkuk.dmes.mdm.dma.unitMng.dto;

/** {@code unitMng} action={@code compare}(method=convertPreview) 요청 — A-PREVIEW. */
public class ConvertPreviewRequest {

    private String value;
    private String fromUnitCode;
    private String toUnitCode;

    public String getValue() { return value; }
    public String getFromUnitCode() { return fromUnitCode; }
    public String getToUnitCode() { return toUnitCode; }

    public void setValue(String v) { this.value = v; }
    public void setFromUnitCode(String v) { this.fromUnitCode = v; }
    public void setToUnitCode(String v) { this.toUnitCode = v; }
}
