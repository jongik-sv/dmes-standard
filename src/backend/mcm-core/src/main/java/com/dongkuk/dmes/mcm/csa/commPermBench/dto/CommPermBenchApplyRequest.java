/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench apply 입력 DTO — 초안 적용 조건(confirmLoss=Y|N, memo)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code apply} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchApplyRequest {

    private String confirmLoss;
    private String memo;

    public CommPermBenchApplyRequest() {}

    public String getConfirmLoss() { return confirmLoss; }
    public void setConfirmLoss(String confirmLoss) { this.confirmLoss = confirmLoss; }

    public String getMemo() { return memo; }
    public void setMemo(String memo) { this.memo = memo; }
}
