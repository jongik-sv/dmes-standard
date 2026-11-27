/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench searchMenuTree 입력 DTO — 메뉴 트리 조건(userId 또는 roleId, source=CUR|DRAFT)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code searchMenuTree} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchSearchMenuTreeRequest {

    private String userId;
    private String roleId;
    private String source;

    public CommPermBenchSearchMenuTreeRequest() {}

    public String getUserId() { return userId; }
    public void setUserId(String userId) { this.userId = userId; }

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
