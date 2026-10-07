package com.dongkuk.dmes.mcm.common.persistence;

import jakarta.persistence.AttributeConverter;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;

/**
 * LocalDateTime ↔ 문자열 컨버터 (SQLite local 단독 부팅 전용).
 *
 * <p>SQLite 커뮤니티 dialect + xerial 드라이버의 네이티브 datetime 라운드트립 결함을 우회하기 위한 장치다.
 * 운영(MSSQL)은 네이티브 {@code datetime2} 를 쓰므로 전역 auto-apply 하지 않고, JpaConfig 가 SQLite dialect 일 때만
 * {@link SqliteTemporalConverterContributor} 로 auto-apply 한다(MSSQL/dev/prod 는 미적용 — 동료 환경 무영향).
 *
 * <p>읽기는 epoch(초/밀리초) 정수 문자열과 ISO text(공백/{@code T} 구분, 소수초 포함) 를 모두 처리한다 —
 * 컨버터 미등록 시절 epoch millis 로 저장된 기존 데이터도 그대로 호환된다.
 *
 * @see SqliteTemporalConverterContributor
 */
public class LocalDateTimeAttributeConverter implements AttributeConverter<LocalDateTime, String> {

    private static final DateTimeFormatter WRITE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss.SSS");

    private static final DateTimeFormatter READ_FORMATTER = new DateTimeFormatterBuilder()
            .appendPattern("yyyy-MM-dd")
            .optionalStart()
            .appendLiteral(' ')
            .optionalEnd()
            .optionalStart()
            .appendLiteral('T')
            .optionalEnd()
            .appendPattern("HH:mm:ss")
            .optionalStart()
            .appendFraction(ChronoField.NANO_OF_SECOND, 1, 9, true)
            .optionalEnd()
            .toFormatter();

    @Override
    public String convertToDatabaseColumn(LocalDateTime attribute) {
        if (attribute == null) {
            return null;
        }
        return WRITE_FORMATTER.format(attribute);
    }

    @Override
    public LocalDateTime convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isBlank()) {
            return null;
        }

        String value = dbData.trim();
        if (value.chars().allMatch(Character::isDigit)) {
            long epoch = Long.parseLong(value);
            Instant instant = value.length() <= 10
                    ? Instant.ofEpochSecond(epoch)
                    : Instant.ofEpochMilli(epoch);
            return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
        }

        return LocalDateTime.parse(value, READ_FORMATTER);
    }
}
