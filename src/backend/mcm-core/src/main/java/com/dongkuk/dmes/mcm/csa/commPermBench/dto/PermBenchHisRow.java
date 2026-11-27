/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench 응답 grid 'his' 의 행 — 칸 이름은 decompose.md §0.3 그대로
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.dto;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 응답 grid {@code his} 의 한 행. {@link #toRow()} 가 내려주는 키 = §0.3 칸 이름(SNAKE_CASE) 그대로.
 * 값 타입은 b1 에서 고정하지 않는다(Object) — 실제 형은 c0 엔티티 확정 뒤 좁힌다.
 */
public record PermBenchHisRow(
        Object applyId,
        Object applyUserId,
        Object applyAt,
        Object changeCnt,
        Object gainUserCnt,
        Object loseUserCnt,
        Object applyMemo) {

    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("APPLY_ID", applyId);
        row.put("APPLY_USER_ID", applyUserId);
        row.put("APPLY_AT", applyAt);
        row.put("CHANGE_CNT", changeCnt);
        row.put("GAIN_USER_CNT", gainUserCnt);
        row.put("LOSE_USER_CNT", loseUserCnt);
        row.put("APPLY_MEMO", applyMemo);
        return row;
    }
}
