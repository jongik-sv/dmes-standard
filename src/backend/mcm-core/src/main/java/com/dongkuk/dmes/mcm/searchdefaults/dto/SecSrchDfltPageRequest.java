package com.dongkuk.dmes.mcm.searchdefaults.dto;

/**
 * secSrchDflt savePage·resetPage 요청의 params — savePage 의 행 목록은 grids.rows.rows(파라미터 이름 rows)로 따로 받는다.
 * 사용자 ID 는 받지 않는다(인증 컨텍스트 값만 쓴다).
 */
public class SecSrchDfltPageRequest {

    private String pageId;

    public SecSrchDfltPageRequest() {}

    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
}
