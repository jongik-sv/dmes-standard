package com.dongkuk.dmes.mcm.favorite.dto;

/**
 * 즐겨찾기 폴더(그룹) 추가/삭제 요청 (사이드바 그룹 관리).
 *
 * <ul>
 *   <li>{@code addFolder} — {@code fvtFoldNm} 으로 신규 폴더 생성 (FVT_FOLD_ID 서버 채번).</li>
 *   <li>{@code deleteFolder} — {@code fvtFoldId} 폴더 + 하위 즐겨찾기 일괄 삭제.</li>
 * </ul>
 * {@code userId} 는 인증 컨텍스트로 강제 치환(IDOR), body 값은 미인증 fallback.
 */
public class SecFavoriteFolderRequest {

    private String userId;
    private String fvtFoldId;
    private String fvtFoldNm;

    public SecFavoriteFolderRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getFvtFoldId() { return fvtFoldId; }
    public void setFvtFoldId(String fvtFoldId) { this.fvtFoldId = fvtFoldId; }
    public String getFvtFoldNm() { return fvtFoldNm; }
    public void setFvtFoldNm(String fvtFoldNm) { this.fvtFoldNm = fvtFoldNm; }
}
