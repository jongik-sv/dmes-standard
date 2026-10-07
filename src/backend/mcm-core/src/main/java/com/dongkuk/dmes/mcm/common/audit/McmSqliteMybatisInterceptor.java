package com.dongkuk.dmes.mcm.common.audit;

import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.reflection.SystemMetaObject;

import java.sql.Connection;
import java.sql.SQLException;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * MyBatis SQL 을 로컬 SQLite 에서 돌 수 있게 바꾸는 인터셉터 — JPA 쪽 {@link McmAuditStatementInspector} 의 SQLite 치환과 같은 규칙
 * ({@code MCMAPUSER.} 접두 제거·{@code SYSDATETIME()}·{@code ISNULL(}·{@code N'…'}). MyBatis 는 Hibernate inspector 를 거치지 않아
 * 매퍼 SQL 의 {@code MCMAPUSER.VI_MCM_CODE_ACCESS} 가 SQLite 에서 {@code no such table} 로 실패하던 것을 막는다.
 *
 * <p>판정은 정적 플래그({@link McmAuditStatementInspector#isSqlite()})가 아니라 실제 연결의 DB 제품명으로 한다 — 운영(Oracle·
 * PostgreSQL)에서는 SQL 을 건드리지 않고, 시험처럼 JpaConfig 를 거치지 않는 조립에서도 같은 코드로 동작한다.
 * 제품명은 JDBC URL 별로 한 번만 읽는다. audit 컬럼 보강은 하지 않는다(MyBatis 쓰기는 cactus {@code CactusMybatisAuditInterceptor} 몫).
 */
@Intercepts({
        @Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})
})
public class McmSqliteMybatisInterceptor implements Interceptor {

    private final Map<String, Boolean> sqliteByUrl = new ConcurrentHashMap<>();

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        Connection connection = (Connection) invocation.getArgs()[0];
        if (isSqlite(connection)) {
            BoundSql boundSql = ((StatementHandler) invocation.getTarget()).getBoundSql();
            String sql = boundSql.getSql();
            String converted = McmAuditStatementInspector.toSqliteCompatible(sql);
            if (!converted.equals(sql)) {
                MetaObject meta = SystemMetaObject.forObject(boundSql);
                meta.setValue("sql", converted);
            }
        }
        return invocation.proceed();
    }

    private boolean isSqlite(Connection connection) throws SQLException {
        var metaData = connection.getMetaData();
        String url = metaData.getURL();
        if (url == null) {
            return isSqliteProduct(metaData.getDatabaseProductName());
        }
        return sqliteByUrl.computeIfAbsent(url, u -> {
            try {
                return isSqliteProduct(metaData.getDatabaseProductName());
            } catch (SQLException e) {
                throw new IllegalStateException("DB 제품명을 읽지 못했다: " + e.getMessage(), e);
            }
        });
    }

    private static boolean isSqliteProduct(String productName) {
        return productName != null && productName.toLowerCase(Locale.ROOT).contains("sqlite");
    }
}
