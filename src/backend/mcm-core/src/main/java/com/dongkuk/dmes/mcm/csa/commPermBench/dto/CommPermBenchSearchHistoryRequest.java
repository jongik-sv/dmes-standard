/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench searchHistory 입력 DTO — 적용 이력 조회 조건
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code searchHistory} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchSearchHistoryRequest {

    private String fromDt;
    private String toDt;
    private String applyUserId;

    public CommPermBenchSearchHistoryRequest() {}

    public String getFromDt() { return fromDt; }
    public void setFromDt(String fromDt) { this.fromDt = fromDt; }

    public String getToDt() { return toDt; }
    public void setToDt(String toDt) { this.toDt = toDt; }

    public String getApplyUserId() { return applyUserId; }
    public void setApplyUserId(String applyUserId) { this.applyUserId = applyUserId; }
}
