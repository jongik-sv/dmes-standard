package com.dongkuk.dmes.mdm.common.support;

import com.dongkuk.dmes.mdm.contract.common.MdmDialect;
import com.dongkuk.dmes.mdm.contract.common.MdmDialectResolver;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

/**
 * 네이티브 SQL 일시 바인딩·읽기의 유일한 자리(TSK-01-03 B4, D9, 규칙표 #16).
 *
 * <p>SQLite 는 KST 초 단위 문자열 {@code 'yyyy-MM-dd HH:mm:ss'}, MSSQL 은 {@link LocalDateTime}(DATETIME2)으로 쓴다.
 * 모든 값은 초 단위로 자른다. TSK-04-01 이 실측 뒤 형식을 바꾸면 이 클래스만 고친다.
 */
@Component
public class MdmTemporalBinder {

    /**
     * SQLite 업무 일시 TEXT 형식(규칙표 #16). 엔티티 경로의 {@link MdmSqliteLocalDateTimeConverter} 도 이 상수를 써서
     * 네이티브·엔티티 두 경로가 글자 단위로 같은 값을 쓴다(TSK-06-01 D7).
     */
    public static final String SQLITE_TEXT_PATTERN = "yyyy-MM-dd HH:mm:ss";

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern(SQLITE_TEXT_PATTERN);
    private static final int TEXT_LENGTH = 19;

    private final MdmDialectResolver dialectResolver;

    public MdmTemporalBinder(MdmDialectResolver dialectResolver) {
        this.dialectResolver = dialectResolver;
    }

    public Object toDb(LocalDateTime value) {
        if (value == null) {
            return null;
        }
        LocalDateTime seconds = value.truncatedTo(ChronoUnit.SECONDS);
        return dialectResolver.current() == MdmDialect.SQLITE ? TEXT.format(seconds) : seconds;
    }

    public Object toDb(Instant value) {
        return value == null ? null : toDb(LocalDateTime.ofInstant(value, MdmClockConfig.KST));
    }

    public LocalDateTime fromDb(Object value) {
        if (value == null) {
            return null;
        }
        LocalDateTime read;
        if (value instanceof String text) {
            String head = text.length() > TEXT_LENGTH ? text.substring(0, TEXT_LENGTH) : text;
            read = LocalDateTime.parse(head.replace('T', ' '), TEXT);
        } else if (value instanceof Timestamp timestamp) {
            read = timestamp.toLocalDateTime();
        } else if (value instanceof LocalDateTime local) {
            read = local;
        } else {
            throw new IllegalArgumentException("일시로 읽을 수 없는 값입니다: " + value.getClass().getName());
        }
        return read.truncatedTo(ChronoUnit.SECONDS);
    }
}
