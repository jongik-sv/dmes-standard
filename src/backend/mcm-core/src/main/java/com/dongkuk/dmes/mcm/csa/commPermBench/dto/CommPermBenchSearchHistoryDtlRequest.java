/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench searchHistoryDtl 입력 DTO — 적용 이력 줄 조회 조건
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code searchHistoryDtl} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchSearchHistoryDtlRequest {

    private String applyId;

    public CommPermBenchSearchHistoryDtlRequest() {}

    public String getApplyId() { return applyId; }
    public void setApplyId(String applyId) { this.applyId = applyId; }
}
