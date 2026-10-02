package com.dongkuk.dmes.mcm.screenusage.repository;

/** 화면별 마지막 이용일(전체 기간). */
public record PageLastUsed(String pageId, String lastUsedDt) {}
