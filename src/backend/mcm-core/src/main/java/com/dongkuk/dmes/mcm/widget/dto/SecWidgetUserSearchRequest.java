package com.dongkuk.dmes.mcm.widget.dto;

/** secWidget searchUsers 요청 — 탭 공유 받는 사람 고르기. keyword 는 아이디·이름 일부(2자 이상). */
public class SecWidgetUserSearchRequest {

    private String keyword;

    public SecWidgetUserSearchRequest() {}

    public String getKeyword() { return keyword; }
    public void setKeyword(String keyword) { this.keyword = keyword; }
}
