package com.dongkuk.dmes.cactus.oasis.converter;

import com.dongkuk.oasis.jdbc.ColumnConverter;

import java.time.OffsetDateTime;

import static java.sql.Types.DATE;
import static java.sql.Types.TIME;
import static java.sql.Types.TIMESTAMP;
import static java.sql.Types.TIMESTAMP_WITH_TIMEZONE;

/**
 * MSSQL ResultSet 컬럼을 표준 Java time 타입으로 정규화한다.
 *
 * <p>{@code cactus.oasis.dialect=mssql} 일 때 {@link com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration}
 * 에서 빈 등록.
 *
 * <p>변환 매핑 (plan §8-2):
 * <ul>
 *   <li>{@code Types.DATE} → {@link java.time.LocalDate}</li>
 *   <li>{@code Types.TIME} → {@link java.time.LocalTime}</li>
 *   <li>{@code Types.TIMESTAMP} → {@link java.time.Instant}</li>
 *   <li>{@code Types.TIMESTAMP_WITH_TIMEZONE} → {@link java.time.Instant}</li>
 *   <li>그 외 → 원본 그대로</li>
 * </ul>
 *
 * <p>{@code microsoft.sql.DateTimeOffset} 은 mssql-jdbc 의존이라 직접 사용 안 함 —
 * {@code OffsetDateTime} 으로 들어오는 경우만 처리.
 */
public class MssqlColumnConverter implements ColumnConverter {

    @Override
    public Object convert(int columnType, Object object) {
        if (object == null) {
            return null;
        }
        switch (columnType) {
            case DATE:
                if (object instanceof java.sql.Date sqlDate) {
                    return sqlDate.toLocalDate();
                }
                return object;
            case TIME:
                if (object instanceof java.sql.Time sqlTime) {
                    return sqlTime.toLocalTime();
                }
                return object;
            case TIMESTAMP:
                if (object instanceof java.sql.Timestamp ts) {
                    return ts.toInstant();
                }
                return object;
            case TIMESTAMP_WITH_TIMEZONE:
                if (object instanceof OffsetDateTime odt) {
                    return odt.toInstant();
                }
                if (object instanceof java.sql.Timestamp ts) {
                    return ts.toInstant();
                }
                return object;
            default:
                return object;
        }
    }
}
