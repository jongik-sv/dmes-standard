package com.dongkuk.dmes.mcm.userq.dto;

/**
 * userQuery 요청 params(스펙 2026-10-10-user-query-program-design §4.2). 사용자 ID 칸은 아예 없다 — 서비스가 인증 컨텍스트에서만 얻는다(IDOR).
 * SQL 을 담는 칸도 없다 — 실행은 저장된 정의의 SQL 만 쓴다. {@code paramsJson} 은 {"이름":"값"} JSON 글자(4000자 이하)다.
 */
public class UserQueryRequest {

    private String queryId;
    private String paramsJson;

    public UserQueryRequest() {}

    public String getQueryId() { return queryId; }
    public void setQueryId(String queryId) { this.queryId = queryId; }
    public String getParamsJson() { return paramsJson; }
    public void setParamsJson(String paramsJson) { this.paramsJson = paramsJson; }
}
