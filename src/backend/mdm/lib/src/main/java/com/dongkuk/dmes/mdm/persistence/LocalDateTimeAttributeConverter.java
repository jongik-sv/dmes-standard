package com.dongkuk.dmes.mdm.persistence;

import jakarta.persistence.AttributeConverter;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;

/**
 * LocalDateTime ↔ 문자열 컨버터(SQLite local 단독 부팅 전용, TSK-07-01 design.md F7·F8).
 *
 * <p>SQLite 커뮤니티 dialect + xerial 드라이버의 네이티브 datetime 라운드트립 결함(mcm {@code
 * LocalDateTimeAttributeConverter} 선례가 이미 경고한 결함)을 우회한다. 운영(MSSQL)은 네이티브 {@code
 * datetime2}를 쓰므로 전역 auto-apply({@code @Converter(autoApply=true)})를 쓰지 않고, {@link
 * MdmSqliteTemporalConverterContributor}가 SQLite 프로파일에만 명시 등록한다(MSSQL/dev/prod 미적용).
 *
 * <p>저장 형식은 mcm 과 달리 소수초를 남기지 않는다({@code naming-dialect-rules.md} §3 #16, {@code DTS}
 * 토큰: {@code 'yyyy-MM-dd HH:mm:ss'}) — 경계 비교(§3.1-11)가 사전식 순서와 시간 순서가 같은 고정 폭
 * 포맷에 의존하기 때문이다.
 *
 * @see MdmSqliteTemporalConverterContributor
 */
public class LocalDateTimeAttributeConverter implements AttributeConverter<LocalDateTime, String> {

    private static final DateTimeFormatter WRITE_FORMATTER =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

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
        return LocalDateTime.parse(dbData.trim(), READ_FORMATTER);
    }
}
