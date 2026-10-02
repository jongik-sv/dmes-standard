package com.dongkuk.dmes.mcm.startpgm.dto;

/**
 * 탭 컨텍스트 메뉴 '기본 화면 등록/해제' · 사이드바 '기본 화면' 해제 버튼 토글 요청.
 *
 * <p>{@code pageId} = portal-shell 표준 식별자 {@code "{sysCd}:{componentPath}"}
 * ({@code componentPath = ${parentMenuId}/${objectId}}). BE 는 이를 분해해 매칭 메뉴를 찾는다.
 * {@code userId} 는 인증 컨텍스트가 없을 때(테스트)만 쓰는 대체값이다.
 */
public class SecStartPgmToggleRequest {

    private String userId;
    private String pageId;

    public SecStartPgmToggleRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
}
