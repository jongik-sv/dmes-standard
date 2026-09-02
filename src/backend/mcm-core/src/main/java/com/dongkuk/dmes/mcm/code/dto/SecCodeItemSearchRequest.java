package com.dongkuk.dmes.mcm.code.dto;

public class SecCodeItemSearchRequest {
    private String groupCd;
    private String useYn;

    public SecCodeItemSearchRequest() {}

    public String getGroupCd() { return groupCd; }
    public void setGroupCd(String groupCd) { this.groupCd = groupCd; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
}
