package com.dongkuk.dmes.mcm.favorite.dto;

/**
 * 즐겨찾기 별 버튼 토글 요청.
 *
 * <p>{@code pageId} = portal-shell 표준 식별자 {@code "{sysCd}:{componentPath}"}
 * ({@code componentPath = ${parentMenuId}/${objectId}}). BE 는 이를 분해해 매칭 메뉴를 찾는다.
 *
 * <p>추가(미등록 상태에서 별 클릭) 시 FE 폴더 선택 팝업이 다음 중 하나를 채워 보낸다:
 * <ul>
 *   <li>{@code fvtFoldId} — 기존 폴더 선택</li>
 *   <li>{@code fvtFoldNm} — 신규 폴더 생성 (FVT_FOLD_ID 자동 채번)</li>
 *   <li>둘 다 비면 — 기본 폴더("즐겨찾기") 사용</li>
 * </ul>
 * 제거(이미 등록된 별 클릭) 시 폴더 필드는 무시된다.
 */
public class SecFavoriteToggleRequest {

    private String userId;
    private String pageId;
    private String fvtFoldId;
    private String fvtFoldNm;

    public SecFavoriteToggleRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public String getFvtFoldId() { return fvtFoldId; }
    public void setFvtFoldId(String fvtFoldId) { this.fvtFoldId = fvtFoldId; }
    public String getFvtFoldNm() { return fvtFoldNm; }
    public void setFvtFoldNm(String fvtFoldNm) { this.fvtFoldNm = fvtFoldNm; }
}
