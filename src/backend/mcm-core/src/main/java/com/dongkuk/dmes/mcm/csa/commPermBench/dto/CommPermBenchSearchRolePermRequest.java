/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench searchRolePerm 입력 DTO — 역할 퍼미션 조회 조건(source=CUR|DRAFT)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code searchRolePerm} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 */
public class CommPermBenchSearchRolePermRequest {

    private String roleId;
    private String menuFolderId;
    private String source;

    public CommPermBenchSearchRolePermRequest() {}

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }

    public String getMenuFolderId() { return menuFolderId; }
    public void setMenuFolderId(String menuFolderId) { this.menuFolderId = menuFolderId; }

    public String getSource() { return source; }
    public void setSource(String source) { this.source = source; }
}
