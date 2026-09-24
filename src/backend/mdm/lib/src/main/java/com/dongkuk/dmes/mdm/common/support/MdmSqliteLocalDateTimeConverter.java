package com.dongkuk.dmes.mdm.common.support;

import jakarta.persistence.AttributeConverter;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;

/**
 * SQLite(local) 전용 {@link LocalDateTime} ↔ {@code 'yyyy-MM-dd HH:mm:ss'}(KST, 초 단위) 문자열(TSK-08-01 D5, 규칙표 #16).
 *
 * <p>xerial 기본 바인딩은 일시를 정수(epoch millis)로 저장해 네이티브 쓰기({@link MdmTemporalBinder}, KST 문자열)와 형식이
 * 어긋난다. 쓰기·읽기 규칙은 {@link MdmTemporalBinder} 의 SQLite 분기와 글자까지 같다: 쓰기는 초 단위로 자르고, 읽기는
 * 앞 19자를 {@code 'T'→' '} 로 바꿔 파싱한다.
 *
 * <p>{@code @Converter} 를 붙이지 않는다: 엔티티 스캔이 이 클래스를 자동 적용하면 MSSQL 에도 켜진다. 등록은
 * {@link MdmSqliteTemporalContributor} 로만 한다(application-local.yml).
 */
public class MdmSqliteLocalDateTimeConverter implements AttributeConverter<LocalDateTime, String> {

    private static final DateTimeFormatter TEXT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final int TEXT_LENGTH = 19;

    @Override
    public String convertToDatabaseColumn(LocalDateTime attribute) {
        return attribute == null ? null : TEXT.format(attribute.truncatedTo(ChronoUnit.SECONDS));
    }

    @Override
    public LocalDateTime convertToEntityAttribute(String dbData) {
        if (dbData == null) {
            return null;
        }
        String head = dbData.length() > TEXT_LENGTH ? dbData.substring(0, TEXT_LENGTH) : dbData;
        return LocalDateTime.parse(head.replace('T', ' '), TEXT);
    }
}
