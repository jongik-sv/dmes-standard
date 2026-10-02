package com.dongkuk.dmes.mcm.screenusage.dto;

/**
 * 화면 사용 통계 공통 파라미터 (계약 C4). OASIS params → DTO 바인딩(기존 *Request 처럼 기본 생성자 + setter).
 * meta.userId 는 cactus 가 params 에 넣지 않으므로 {@code userId} 는 관리자가 고른 조회 조건이다.
 */
public class ScreenUsageStatRequest {

    /** yyyyMMdd (unused 제외 필수) */
    private String fromDt;
    /** yyyyMMdd (unused 제외 필수) */
    private String toDt;
    /** 부서 조건(완전 일치) — '-' 는 부서 없음 */
    private String deptCd;
    /** 사용자 조건(완전 일치) */
    private String userId;
    /** 화면 조건(완전 일치) */
    private String pageId;
    /** overview·unused 의 미사용 기준 일수, 기본 90 */
    private Integer unusedDays;

    public ScreenUsageStatRequest() {}

    public String getFromDt() { return fromDt; }
    public void setFromDt(String fromDt) { this.fromDt = fromDt; }
    public String getToDt() { return toDt; }
    public void setToDt(String toDt) { this.toDt = toDt; }
    public String getDeptCd() { return deptCd; }
    public void setDeptCd(String deptCd) { this.deptCd = deptCd; }
    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }
    public String getPageId() { return pageId; }
    public void setPageId(String pageId) { this.pageId = pageId; }
    public Integer getUnusedDays() { return unusedDays; }
    public void setUnusedDays(Integer unusedDays) { this.unusedDays = unusedDays; }
}
