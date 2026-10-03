package com.dongkuk.dmes.cactus.jpa;

import org.hibernate.boot.model.naming.Identifier;
import org.hibernate.boot.model.naming.PhysicalNamingStrategy;
import org.hibernate.engine.jdbc.env.spi.JdbcEnvironment;

import java.util.Locale;

/**
 * camelCase 식별자를 snake_case 로 변환하고 {@code Entity} 접미사를 제거한다.
 * dmes-film 의 동명 strategy 를 cactus 로 이식 (2026-05-12).
 *
 * <p>예: {@code UserEntity} → {@code user}, {@code userName} → {@code user_name}.
 * {@code Entity} 는 이름 끝에 있을 때만 지운다 ({@code parentEntityId} → {@code parent_entity_id}).
 *
 * <p>활성 조건: {@link CactusHibernateCustomizerAutoConfiguration} 가 host EMF 의
 * {@code hibernate.physical_naming_strategy} 프로퍼티로 주입.
 *
 * <p>Hibernate 는 물리 이름 전략을 {@code @Table(name="...")}·{@code @Column(name="...")} 로 명시한
 * 이름에도 적용한다. 대문자 명시 이름({@code TB_SEC_USER} 등)은 소문자로 바뀔 뿐 밑줄 삽입·접미사 제거
 * 대상이 아니다.
 */
public class SnakePhysicalNamingStrategy implements PhysicalNamingStrategy {

    private static final String ENTITY_SUFFIX = "Entity";

    @Override
    public Identifier toPhysicalCatalogName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        return apply(name, jdbcEnvironment);
    }

    @Override
    public Identifier toPhysicalSchemaName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        return apply(name, jdbcEnvironment);
    }

    @Override
    public Identifier toPhysicalTableName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        return apply(name, jdbcEnvironment);
    }

    @Override
    public Identifier toPhysicalSequenceName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        return apply(name, jdbcEnvironment);
    }

    @Override
    public Identifier toPhysicalColumnName(Identifier name, JdbcEnvironment jdbcEnvironment) {
        return apply(name, jdbcEnvironment);
    }

    private Identifier apply(Identifier name, JdbcEnvironment jdbcEnvironment) {
        if (name == null) {
            return null;
        }
        StringBuilder builder = new StringBuilder(stripEntitySuffix(name.getText().replace('.', '_')));
        for (int i = 1; i < builder.length() - 1; i++) {
            if (isUnderscoreRequired(builder.charAt(i - 1), builder.charAt(i), builder.charAt(i + 1))) {
                builder.insert(i++, '_');
            }
        }
        return getIdentifier(builder.toString(), name.isQuoted(), jdbcEnvironment);
    }

    /** 이름 끝의 {@code Entity} 접미사만 지운다 — 이름 중간의 {@code Entity} (예: {@code parentEntityId}) 는 둔다. */
    private static String stripEntitySuffix(String text) {
        return text.endsWith(ENTITY_SUFFIX)
                ? text.substring(0, text.length() - ENTITY_SUFFIX.length())
                : text;
    }

    protected Identifier getIdentifier(String name, boolean quoted, JdbcEnvironment jdbcEnvironment) {
        if (isCaseInsensitive(jdbcEnvironment)) {
            name = name.toLowerCase(Locale.ROOT);
        }
        return new Identifier(name, quoted);
    }

    protected boolean isCaseInsensitive(JdbcEnvironment jdbcEnvironment) {
        return true;
    }

    private boolean isUnderscoreRequired(char before, char current, char after) {
        return Character.isLowerCase(before) && Character.isUpperCase(current) && Character.isLowerCase(after);
    }
}
