/*
 * 작성자: perm-bench-be
 * 작성일: 2026-11-27
 * 내용: 내 초안 행 잠금 이음매 — 저장 때 기준 지문을 읽기 전에 같은 관리자의 동시 저장·적용을 줄 세운다
 */
package com.dongkuk.dmes.mcm.csa.commPermBench.service;

/**
 * 초안 행({@code TB_MCM_SEC_PERM_DRAFT}, PK=OWNER_USER_ID)을 {@code SELECT ... FOR UPDATE} 로 잠근다. 잠금은 OASIS process 의
 * 트랜잭션(txBiz)이 끝날 때까지 유지된다. 행이 아직 없으면 아무것도 잠그지 않는다(첫 저장 경합은 PK 중복으로 잡는다).
 */
public interface PermDraftRowLock {

    void lock(String ownerUserId);
}
