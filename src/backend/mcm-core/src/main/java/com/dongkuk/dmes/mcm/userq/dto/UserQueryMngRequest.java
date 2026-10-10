package com.dongkuk.dmes.mcm.userq.dto;

/**
 * userQueryMng 요청 params(스펙 2026-10-10-user-query-program-design §4.1). 칸은 액션마다 일부만 쓴다.
 * {@code paramsJson}·{@code columnsJson}·{@code userIdsJson} 은 JSON 글자이다(oasis-contract-check 6-E-2 — 배열·객체는 글자로 싣는다).
 * 숫자 칸({@code maxRowCnt}·{@code ver})은 FE 가 숫자 글자로 보낼 수 있어 Jackson 이 변환한다.
 */
public class UserQueryMngRequest {

    private String queryId;
    private String queryNm;
    private String categoryCd;
    private String moduleCd;
    private String queryDesc;
    private String ownerDeptCd;
    private String sqlText;
    private String paramsJson;
    private String columnsJson;
    private Integer maxRowCnt;
    private String useYn;
    private Long ver;
    // search 조건
    private String keyword;
    private String ownerDept;
    private String assignUser;
    // 할당
    private String userIdsJson;

    public UserQueryMngRequest() {}

    public String getQueryId() { return queryId; }
    public void setQueryId(String queryId) { this.queryId = queryId; }
    public String getQueryNm() { return queryNm; }
    public void setQueryNm(String queryNm) { this.queryNm = queryNm; }
    public String getCategoryCd() { return categoryCd; }
    public void setCategoryCd(String categoryCd) { this.categoryCd = categoryCd; }
    public String getModuleCd() { return moduleCd; }
    public void setModuleCd(String moduleCd) { this.moduleCd = moduleCd; }
    public String getQueryDesc() { return queryDesc; }
    public void setQueryDesc(String queryDesc) { this.queryDesc = queryDesc; }
    public String getOwnerDeptCd() { return ownerDeptCd; }
    public void setOwnerDeptCd(String ownerDeptCd) { this.ownerDeptCd = ownerDeptCd; }
    public String getSqlText() { return sqlText; }
    public void setSqlText(String sqlText) { this.sqlText = sqlText; }
    public String getParamsJson() { return paramsJson; }
    public void setParamsJson(String paramsJson) { this.paramsJson = paramsJson; }
    public String getColumnsJson() { return columnsJson; }
    public void setColumnsJson(String columnsJson) { this.columnsJson = columnsJson; }
    public Integer getMaxRowCnt() { return maxRowCnt; }
    public void setMaxRowCnt(Integer maxRowCnt) { this.maxRowCnt = maxRowCnt; }
    public String getUseYn() { return useYn; }
    public void setUseYn(String useYn) { this.useYn = useYn; }
    public Long getVer() { return ver; }
    public void setVer(Long ver) { this.ver = ver; }
    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
    public String getOwnerDept() { return ownerDept; }
    public void setOwnerDept(String ownerDept) { this.ownerDept = ownerDept; }
    public String getAssignUser() { return assignUser; }
    public void setAssignUser(String assignUser) { this.assignUser = assignUser; }
    public String getUserIdsJson() { return userIdsJson; }
    public void setUserIdsJson(String userIdsJson) { this.userIdsJson = userIdsJson; }
}
