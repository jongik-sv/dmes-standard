package com.dongkuk.dmes.mcm.screenusage.repository;

/** 일자별 합계 — 열람 수, 이용자 수(COUNT DISTINCT), 이용 시간. */
public record DailySum(String usageDt, Long openCnt, Long userCnt, Long durationMs) {}
