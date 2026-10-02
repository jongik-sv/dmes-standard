package com.dongkuk.dmes.mcm.startpgm.dto;

/** 기본 화면 조회 요청. {@code userId} 는 인증 컨텍스트가 없을 때(테스트)만 쓰는 대체값이다. */
public class SecStartPgmSearchRequest {
    private String userId;

    public SecStartPgmSearchRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
}
