package com.dongkuk.dmes.mdm.dmd.dataItemMng.dto;

/** {@code dataItemMng} action={@code delete}(닫기)·{@code restore}(다시 열기) 요청. */
public class DataItemKeyRequest {

    private String maruDataId;
    private String code;
    private Integer expectedRowVersion;

    public String getMaruDataId() { return maruDataId; }
    public String getCode() { return code; }
    public Integer getExpectedRowVersion() { return expectedRowVersion; }

    public void setMaruDataId(String v) { this.maruDataId = v; }
    public void setCode(String v) { this.code = v; }
    public void setExpectedRowVersion(Integer v) { this.expectedRowVersion = v; }
}
