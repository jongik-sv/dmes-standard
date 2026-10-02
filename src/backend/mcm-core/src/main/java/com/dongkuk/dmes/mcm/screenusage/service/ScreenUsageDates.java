package com.dongkuk.dmes.mcm.screenusage.service;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

/** 화면 사용 통계의 날짜 규칙 — 서버 시간대 Asia/Seoul, 일자 yyyyMMdd, 시각 yyyy-MM-dd HH:mm:ss. */
final class ScreenUsageDates {

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TS = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private ScreenUsageDates() {}

    static LocalDateTime fromEpochMillis(long epochMs) {
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(epochMs), ZONE);
    }

    static String format(LocalDate date) {
        return DT.format(date);
    }

    /** 구간의 일자 귀속 — STARTED_AT 의 일자(자정을 걸쳐도 시작 일자). */
    static String usageDt(LocalDateTime startedAt) {
        return DT.format(startedAt);
    }

    /** @throws java.time.format.DateTimeParseException 형식이 yyyyMMdd 가 아니면 */
    static LocalDate parseDt(String yyyyMMdd) {
        return LocalDate.parse(yyyyMMdd, DT);
    }

    static String timestamp(LocalDateTime time) {
        return time == null ? null : TS.format(time);
    }
}
