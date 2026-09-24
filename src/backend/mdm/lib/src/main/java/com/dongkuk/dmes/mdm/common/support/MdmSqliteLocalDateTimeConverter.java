package com.dongkuk.dmes.mdm.common.support;

import jakarta.persistence.AttributeConverter;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * SQLite 전용 업무 일시 컨버터(TSK-06-01 D7, 규칙표 #16) — {@link MdmSqliteTemporalContributor} 가 local 프로파일에서만
 * auto-apply 한다(MSSQL 무영향).
 *
 * <p>SQLite community dialect + xerial 드라이버는 {@link LocalDateTime} 을 epoch millis 정수로 저장한다(F10). 공통 버전
 * 서비스는 네이티브 SQL 로 {@link MdmTemporalBinder#toDb(LocalDateTime)} = 19자 {@code 'yyyy-MM-dd HH:mm:ss'} 를 쓰므로,
 * 엔티티도 같은 형식을 써야 두 경로가 같은 행을 읽고 경계 비교가 어긋나지 않는다. mcm-core 의
 * {@code LocalDateTimeAttributeConverter} 는 쓰기 형식이 {@code .SSS} 23자라 쓰지 않는다.
 *
 * <p>쓰기는 초 단위로 자른 19자, 읽기는 {@link MdmTemporalBinder#fromDb(Object)} 의 문자열 규칙(앞 19자, {@code T} 허용)과
 * 같다. epoch 정수 문자열은 받지 않는다 — 형식을 하나로 고정하는 것이 목적이다.
 */
public class MdmSqliteLocalDateTimeConverter implements AttributeConverter<LocalDateTime, String> {

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern(MdmTemporalBinder.SQLITE_TEXT_PATTERN);
    private static final int TEXT_LENGTH = 19;

    @Override
    public String convertToDatabaseColumn(LocalDateTime attribute) {
        return attribute == null ? null : TEXT.format(attribute.truncatedTo(ChronoUnit.SECONDS));
    }

    @Override
    public LocalDateTime convertToEntityAttribute(String dbData) {
        if (dbData == null || dbData.isEmpty()) {
            return null;
        }
        String head = dbData.length() > TEXT_LENGTH ? dbData.substring(0, TEXT_LENGTH) : dbData;
        return LocalDateTime.parse(head.replace('T', ' '), TEXT);
    }
}
