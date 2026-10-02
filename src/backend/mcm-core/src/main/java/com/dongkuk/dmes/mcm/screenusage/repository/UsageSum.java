package com.dongkuk.dmes.mcm.screenusage.repository;

/** (화면, 사용자, 부서) 단위 합계 — 집계 테이블 JPQL GROUP BY 또는 원본 합산 결과. */
public record UsageSum(String pageId, String userId, String deptCd,
                       Long openCnt, Long segCnt, Long durationMs, String lastUsedDt) {}
