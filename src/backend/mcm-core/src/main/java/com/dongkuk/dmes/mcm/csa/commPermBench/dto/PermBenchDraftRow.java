/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 응답 grid 'draft' 의 행 — 칸 이름은 decompose.md §0.3 그대로
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 응답 grid {@code draft} 의 한 행. {@link #toRow()} 가 내려주는 키 = §0.3 칸 이름(SNAKE_CASE) 그대로.
 * 값 타입은 b1 에서 고정하지 않는다(Object) — 실제 형은 c0 엔티티 확정 뒤 좁힌다.
 */
public record PermBenchDraftRow(
        Object changesJson,
        Object changeCnt,
        Object uAt) {

    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("CHANGES_JSON", changesJson);
        row.put("CHANGE_CNT", changeCnt);
        row.put("U_AT", uAt);
        return row;
    }
}
