package com.dongkuk.dmes.cactus.oasis.converter;

import com.dongkuk.oasis.jdbc.ColumnConverter;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;

import static java.sql.Types.BOOLEAN;
import static java.sql.Types.DATE;
import static java.sql.Types.TIMESTAMP;

/**
 * SQLite ResultSet 컬럼을 안전하게 정규화한다. 미결 #3 결정사항(2026-05-12): 최소 변환.
 *
 * <p>SQLite type affinity 특성:
 * <ul>
 *   <li>모든 시간 컬럼이 {@code TEXT} 로 선언되는 경우가 많아 {@code Types.VARCHAR} 로 반환됨</li>
 *   <li>그 경우 본 converter 의 {@code DATE}/{@code TIMESTAMP} 분기는 호출되지 않음 — String 으로 그대로 통과</li>
 *   <li>운영(MSSQL)과의 동작 차이는 SQLite 로컬 환경의 알려진 제약</li>
 * </ul>
 *
 * <p>변환 매핑:
 * <ul>
 *   <li>{@code Types.BOOLEAN} + {@code Integer 0/1} → {@link Boolean}</li>
 *   <li>{@code Types.DATE} 가 명시되었고 값이 ISO 문자열인 경우 → {@link LocalDate}</li>
 *   <li>{@code Types.TIMESTAMP} 가 명시되었고 값이 ISO 문자열인 경우 → {@link Instant}</li>
 *   <li>그 외 ({@code Types.NULL}=0 포함) → 원본 그대로</li>
 *   <li>변환 실패 시 원본 그대로 (견고성 우선)</li>
 * </ul>
 */
public class SqliteColumnConverter implements ColumnConverter {

    @Override
    public Object convert(int columnType, Object object) {
        if (object == null) {
            return null;
        }
        switch (columnType) {
            case BOOLEAN:
                if (object instanceof Integer i) {
                    return i != 0;
                }
                return object;
            case DATE:
                if (object instanceof java.sql.Date sqlDate) {
                    return sqlDate.toLocalDate();
                }
                if (object instanceof String s) {
                    try {
                        return LocalDate.parse(s);
                    } catch (DateTimeParseException ignored) {
                        return object;
                    }
                }
                return object;
            case TIMESTAMP:
                if (object instanceof java.sql.Timestamp ts) {
                    return ts.toInstant();
                }
                if (object instanceof String s) {
                    try {
                        return Instant.parse(s);
                    } catch (DateTimeParseException ignored) {
                        return object;
                    }
                }
                return object;
            default:
                return object;
        }
    }
}
