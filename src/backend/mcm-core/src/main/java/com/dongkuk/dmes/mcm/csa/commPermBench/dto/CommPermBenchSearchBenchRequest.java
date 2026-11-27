/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench searchBench 입력 DTO — 조회 조건(사람 검색어·선택 그룹·선택 역할)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

/**
 * commPermBench {@code searchBench} action 의 입력 DTO (docs/perm-bench/decompose.md §0.3).
 * BPMN serviceTask 의 dto property 로 params → 본 DTO 변환.
 *
 * <ul>
 *   <li>{@code userQ} — 사람 ID·이름·부서명에 들어 있는 글자(대소문자 무시)</li>
 *   <li>{@code roleGroupId} — 그 그룹을 받은 사람으로 좁힌다(Q-012)</li>
 *   <li>{@code roleId} — 그룹을 거쳐 그 역할을 받은 사람으로 좁힌다(Q-012)</li>
 * </ul>
 */
public class CommPermBenchSearchBenchRequest {

    private String userQ;
    private String roleGroupId;
    private String roleId;

    public CommPermBenchSearchBenchRequest() {}

    public String getUserQ() { return userQ; }
    public void setUserQ(String userQ) { this.userQ = userQ; }

    public String getRoleGroupId() { return roleGroupId; }
    public void setRoleGroupId(String roleGroupId) { this.roleGroupId = roleGroupId; }

    public String getRoleId() { return roleId; }
    public void setRoleId(String roleId) { this.roleId = roleId; }
}
