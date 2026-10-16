package com.dongkuk.dmes.mcm.security.dto;

/**
 * 사용자 검색 요청 DTO. mcm-core SPI.
 */
public class SecUserSearchRequest {
    private String userId;
    private String userNm;
    private String useYn;
    private String deptCd;

    public SecUserSearchRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getUserNm() { return userNm; }
    public void setUserNm(String userNm) { this.userNm = userNm; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
}
