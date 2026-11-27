/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 응답 grid 'roles' 의 행 — 칸 이름은 decompose.md §0.3 그대로
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 응답 grid {@code roles} 의 한 행. {@link #toRow()} 가 내려주는 키 = 칸 이름(SNAKE_CASE) 그대로, 넣은 순서 유지.
 * Y/N 칸은 문자열 "Y"·"N", 코드 목록 칸은 쉼표 구분 문자열(PermTokens.join).
 */
public record PermBenchRolesRow(
        String roleId,
        String roleNm,
        String menuId,
        String useTp,
        long groupCnt,
        long userCnt,
        long permCnt) {

    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("ROLE_ID", roleId);
        row.put("ROLE_NM", roleNm);
        row.put("MENU_ID", menuId);
        row.put("USE_TP", useTp);
        row.put("GROUP_CNT", groupCnt);
        row.put("USER_CNT", userCnt);
        row.put("PERM_CNT", permCnt);
        return row;
    }
}
