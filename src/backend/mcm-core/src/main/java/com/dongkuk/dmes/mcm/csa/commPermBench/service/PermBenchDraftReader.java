/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: commPermBench source=DRAFT 용 이음매 — 저장된 내 초안의 변경 목록을 읽는다(구현 = b2)
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

import com.dongkuk.dmes.mcm.security.perm.PermChange;

import java.util.List;

/**
 * 저장된 초안 읽기 이음매. 1단계 조회의 {@code source=DRAFT} 가 이 목록을 {@code PermGraph.applyChanges} 로 겹친다.
 *
 * <p>구현은 b2(초안 저장·TB_MCM_SEC_PERM_DRAFT)가 Spring 빈으로 둔다. 빈이 없으면 DRAFT 조회는
 * {@code PERM_DRAFT_NOT_READY} 로 거절된다({@link PermBenchGraphSource}). 가짜 구현을 main 에 두지 않는다.
 */
public interface PermBenchDraftReader {

    /** 현재 로그인한 관리자의 저장된 초안 변경 목록(저장 순서). 초안이 없으면 빈 목록. */
    List<PermChange> savedChanges();
}
