package com.dongkuk.oasis.jdbc;

import java.sql.Date;

import static java.sql.Types.*;

public interface ColumnConverter {
    /**
     * @param columnType JDBC 컬럼 타입
     * @param object     JDBC에서 생성된 오브젝트
     * @return 형 변환된 오브젝트
     */
    default Object convert(int columnType, Object object) {
        switch (columnType) {
            case DATE:
                if (object instanceof Date)
                    return ((java.sql.Date) object).toLocalDate();
            case TIME:
                if (object instanceof java.sql.Time)
                    return ((java.sql.Time) object).toLocalTime();
            case TIMESTAMP:
                if (object instanceof java.sql.Timestamp)
                    return ((java.sql.Timestamp) object).toInstant();
            default:
                return object;
        }
    }
}
