/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 적용 이력 읽기 창구 — 서비스가 DB 없이도 시험되도록 가른 경계(PermApplyStore 와 같은 방식)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.entity.SecPermHis;
import com.dongkuk.dmes.mcm.entity.SecPermHisDtl;

import java.time.LocalDateTime;
import java.util.List;

/** 적용 이력 읽기(읽기만). Oracle 구현 = {@code PermHistoryRepository}. */
public interface PermHistoryStore {

    /**
     * 머리 목록. {@code from ≤ APPLY_AT < toExclusive}, applyUserId 가 null 이 아니면 그 적용자만,
     * APPLY_AT 내림차순(같으면 APPLY_ID 내림차순), 최대 {@code limit} 건.
     */
    List<SecPermHis> findHistory(LocalDateTime from, LocalDateTime toExclusive, String applyUserId, int limit);

    /** 한 적용의 줄, SEQ_NO 오름차순. 없는 applyId 는 빈 목록. */
    List<SecPermHisDtl> findDetails(String applyId);
}
