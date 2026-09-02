package com.dongkuk.caravan.core.config;

import org.hibernate.community.dialect.SQLiteDialect;
import org.hibernate.dialect.DatabaseVersion;
import org.hibernate.dialect.Dialect;
import org.hibernate.dialect.OracleDialect;
import org.hibernate.dialect.SQLServerDialect;
import org.hibernate.engine.jdbc.dialect.spi.DialectResolutionInfo;
import org.hibernate.engine.jdbc.dialect.spi.DialectResolver;

/**
 * Caravan 의 비표준 DB용 Hibernate Dialect 자동 감지 (이름이 Tibero 인 이유는 legacy).
 *
 * <p>처리 대상:</p>
 * <ul>
 *   <li>Tibero → OracleDialect (Tibero 는 Oracle 호환, Hibernate 가 인식 못함)</li>
 *   <li>SQLite → SQLiteDialect (community-dialects 의 SPI 자동 등록이 안 됨)</li>
 *   <li>Microsoft SQL Server → SQLServerDialect (자동 감지되긴 하지만 명시적으로 통일)</li>
 * </ul>
 *
 * <p>Oracle/PostgreSQL/MySQL/H2 등 표준 DB는 Hibernate 가 자동 감지하므로
 * 이 Resolver 는 null 을 반환하여 기본 감지 로직에 위임합니다.</p>
 */
public class TiberoDialectResolver implements DialectResolver {

    @Override
    public Dialect resolveDialect(DialectResolutionInfo info) {
        String databaseName = info.getDatabaseName();
        if (databaseName == null) return null;
        String lower = databaseName.toLowerCase();

        if (lower.contains("tibero")) {
            return new OracleDialect(DatabaseVersion.make(12, 2));
        }
        if (lower.contains("sqlite")) {
            return new SQLiteDialect();
        }
        if (lower.contains("microsoft sql server") || lower.contains("sql server")) {
            return new SQLServerDialect();
        }
        return null;
    }
}
