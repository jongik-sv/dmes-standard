package com.dongkuk.dmes.mdm.common.support;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import org.springframework.stereotype.Component;

/**
 * 네이티브 SQL 일시 바인딩·읽기의 유일한 자리(TSK-01-03 B4, D9, 규칙표 #16).
 *
 * <p>업무 일시 칼럼은 Oracle {@code TIMESTAMP(6)} 이고 값은 KST 다(JVM 기본 시간대 Asia/Seoul, {@code hibernate.jdbc.time_zone}
 * 없음). 쓰기는 초 단위로 자른 {@link LocalDateTime} 을 그대로 바인딩하고, 읽기는 JDBC·Hibernate 가 돌려줄 수 있는 일시 형을
 * {@link LocalDateTime} 으로 바꾼다. <b>초 절삭은 쓰기·읽기 모두 유지한다</b> — {@code VALID_FROM} 이 PK 구성 요소라 소수 초가
 * 섞이면 같은 시각이 다른 키가 되고 선분 이음이 어긋난다. 형식을 바꾸면 이 클래스만 고친다.
 */
@Component
public class MdmTemporalBinder {

    /**
     * 업무 일시 문자열 형식(KST, 초 단위, 규칙표 #16). 화면 입출력·CSV 결과 문구가 이 형식을 쓴다(DB 바인딩에는 쓰지 않는다).
     */
    public static final String TEXT_PATTERN = "yyyy-MM-dd HH:mm:ss";

    public Object toDb(LocalDateTime value) {
        return value == null ? null : value.truncatedTo(ChronoUnit.SECONDS);
    }

    public Object toDb(Instant value) {
        return value == null ? null : toDb(LocalDateTime.ofInstant(value, MdmClockConfig.KST));
    }

    public LocalDateTime fromDb(Object value) {
        if (value == null) {
            return null;
        }
        LocalDateTime read;
        if (value instanceof Timestamp timestamp) {
            read = timestamp.toLocalDateTime();
        } else if (value instanceof LocalDateTime local) {
            read = local;
        } else if (value instanceof OffsetDateTime offset) {
            read = offset.atZoneSameInstant(MdmClockConfig.KST).toLocalDateTime();
        } else if (value instanceof ZonedDateTime zoned) {
            read = zoned.withZoneSameInstant(MdmClockConfig.KST).toLocalDateTime();
        } else if (value instanceof Instant instant) {
            read = LocalDateTime.ofInstant(instant, MdmClockConfig.KST);
        } else if (value instanceof java.sql.Date date) {
            read = date.toLocalDate().atStartOfDay();
        } else if (value instanceof java.util.Date date) {
            read = LocalDateTime.ofInstant(date.toInstant(), MdmClockConfig.KST);
        } else {
            throw new IllegalArgumentException("일시로 읽을 수 없는 값입니다: " + value.getClass().getName());
        }
        return read.truncatedTo(ChronoUnit.SECONDS);
    }
}
