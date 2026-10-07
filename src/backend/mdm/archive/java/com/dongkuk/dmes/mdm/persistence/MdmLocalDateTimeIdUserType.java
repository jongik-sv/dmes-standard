package com.dongkuk.dmes.mdm.persistence;

import java.io.Serializable;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.temporal.ChronoField;
import java.util.Objects;
import org.hibernate.engine.spi.SharedSessionContractImplementor;
import org.hibernate.usertype.UserType;

/**
 * {@code @Id} 필드에 쓰는 LocalDateTime 커스텀 타입(TSK-07-01 design.md D3).
 *
 * <p>Hibernate 7 은 {@code @jakarta.persistence.Id}가 붙은 속성에 {@code AttributeConverter}(JPA 계층,
 * {@link com.dongkuk.dmes.mdm.common.support.MdmSqliteLocalDateTimeConverter}가 그 계층이다)를 거는 것을 하드 금지한다(실측: {@code
 * org.hibernate.AnnotationException: 'AttributeConverter' not allowed for attribute ... annotated
 * '@jakarta.persistence.Id'}) — {@code MdmSqliteTemporalContributor}의 auto-apply 도 이
 * 제약을 피하지 못한다. {@code TB_MDM_DATA_ITEM}·{@code TB_MDM_DATA_CATE}·{@code TB_MDM_DATA_CATE_ITEM}
 * 은 {@code VALID_FROM}이 PK 구성 요소라(F6, 선분 모델) 이 제약을 정면으로 맞는다.
 *
 * <p>{@code UserType}(Hibernate 네이티브 타입 계층, JPA {@code AttributeConverter}와 다른 경로)은 이
 * 제약을 받지 않는다(실측 확인) — 대신 이 클래스가 방언을 직접 감지해 SQLite 는 naming-dialect-rules
 * §3 #16 형식(TEXT, {@code yyyy-MM-dd HH:mm:ss})으로, 그 밖의 DB 는 네이티브 {@code Timestamp}
 * 로 바인딩한다 — {@code MdmSqliteTemporalContributor}가 SQLite 프로파일에만 컨버터를
 * 등록하는 것과 같은 효과를 방언 감지로 낸다(정적 등록 대신 런타임 분기).
 */
public class MdmLocalDateTimeIdUserType implements UserType<LocalDateTime> {

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
    public int getSqlType() {
        return Types.VARCHAR;
    }

    @Override
    public Class<LocalDateTime> returnedClass() {
        return LocalDateTime.class;
    }

    @Override
    public boolean equals(LocalDateTime x, LocalDateTime y) {
        return Objects.equals(x, y);
    }

    @Override
    public int hashCode(LocalDateTime x) {
        return Objects.hashCode(x);
    }

    @Override
    public LocalDateTime nullSafeGet(ResultSet rs, int position, SharedSessionContractImplementor session, Object owner)
            throws SQLException {
        if (isSqlite(session)) {
            String value = rs.getString(position);
            return value == null ? null : LocalDateTime.parse(value.trim(), READ_FORMATTER);
        }
        Timestamp ts = rs.getTimestamp(position);
        return ts == null ? null : ts.toLocalDateTime();
    }

    @Override
    public void nullSafeSet(PreparedStatement st, LocalDateTime value, int index, SharedSessionContractImplementor session)
            throws SQLException {
        if (value == null) {
            st.setNull(index, getSqlType());
            return;
        }
        if (isSqlite(session)) {
            st.setString(index, WRITE_FORMATTER.format(value));
        } else {
            st.setTimestamp(index, Timestamp.valueOf(value));
        }
    }

    @Override
    public LocalDateTime deepCopy(LocalDateTime value) {
        return value;
    }

    @Override
    public boolean isMutable() {
        return false;
    }

    @Override
    public Serializable disassemble(LocalDateTime value) {
        return value;
    }

    @Override
    public LocalDateTime assemble(Serializable cached, Object owner) {
        return (LocalDateTime) cached;
    }

    @Override
    public LocalDateTime replace(LocalDateTime detached, LocalDateTime managed, Object owner) {
        return detached;
    }

    private static boolean isSqlite(SharedSessionContractImplementor session) {
        String dialect = session.getJdbcServices().getDialect().getClass().getName();
        return dialect.toLowerCase(java.util.Locale.ROOT).contains("sqlite");
    }
}
