/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 응답 grid 'menus' 의 행 — 칸 이름은 decompose.md §0.3 그대로
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 응답 grid {@code menus} 의 한 행. {@link #toRow()} 가 내려주는 키 = 칸 이름(SNAKE_CASE) 그대로, 넣은 순서 유지.
 * OBJ_USE_TP(perm-fe 요청, 끝 칸) = 오브젝트의 USE_TP — 폴더·OBJECT_ID 없는 행·그래프에 없는 오브젝트는 null.
 * Y/N 칸은 문자열 "Y"·"N", 코드 목록 칸은 쉼표 구분 문자열(PermTokens.join).
 */
public record PermBenchMenusRow(
        String menuId,
        String parentMenuId,
        String menuNm,
        String objectId,
        String sortSeq,
        String showTp,
        String useTp,
        String visible,
        String reason,
        String objUseTp) {

    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("MENU_ID", menuId);
        row.put("PARENT_MENU_ID", parentMenuId);
        row.put("MENU_NM", menuNm);
        row.put("OBJECT_ID", objectId);
        row.put("SORT_SEQ", sortSeq);
        row.put("SHOW_TP", showTp);
        row.put("USE_TP", useTp);
        row.put("VISIBLE", visible);
        row.put("REASON", reason);
        row.put("OBJ_USE_TP", objUseTp);
        return row;
    }
}
