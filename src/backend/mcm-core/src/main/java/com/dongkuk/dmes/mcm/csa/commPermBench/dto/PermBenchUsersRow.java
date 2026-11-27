/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 응답 grid 'users' 의 행 — 칸 이름은 decompose.md §0.3 그대로
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 응답 grid {@code users} 의 한 행. {@link #toRow()} 가 내려주는 키 = 칸 이름(SNAKE_CASE) 그대로, 넣은 순서 유지.
 * Y/N 칸은 문자열 "Y"·"N", 코드 목록 칸은 쉼표 구분 문자열(PermTokens.join).
 */
public record PermBenchUsersRow(
        String userId,
        String userNm,
        String deptNm,
        String useTp) {

    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("USER_ID", userId);
        row.put("USER_NM", userNm);
        row.put("DEPT_NM", deptNm);
        row.put("USE_TP", useTp);
        return row;
    }
}
