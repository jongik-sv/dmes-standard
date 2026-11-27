/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench explain 입력 DTO — 왜 되나/안 되나 설명 조건(source=CUR|DRAFT)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code explain} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchExplainRequest {

    private String userId;
    private String objectId;
    private String source;

    public CommPermBenchExplainRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getObjectId() { return objectId; }
    public void setObjectId(String objectId) { this.objectId = objectId; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
