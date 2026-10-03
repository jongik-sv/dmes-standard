package com.dongkuk.dmes.mcm.csa.commUserMng.support;

import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Hibernate 가 준비하는 SQL 을 그대로 통과시키면서 기록만 하는 {@link StatementInspector} — 성능 근거 테스트용.
 *
 * <p>{@link CommUserMngJpaTestConfig} 의 EMF 에 등록돼 있다. SQL 을 바꾸지 않으므로 다른 특성 테스트에는 영향이 없다.
 * 세는 쪽은 서비스 호출 직전에 {@link #reset()} 해 데이터 준비 SQL 이 섞이지 않게 한다.
 * 테스트는 한 JVM 안에서 순차로 돌므로 전역 하나로 둔다.
 */
public final class SqlStatementCounter implements StatementInspector {

    public static final SqlStatementCounter INSTANCE = new SqlStatementCounter();

    private final List<String> statements = new ArrayList<>();

    private SqlStatementCounter() {}

    @Override
    public synchronized String inspect(String sql) {
        statements.add(sql);
        return sql;
    }

    public synchronized void reset() {
        statements.clear();
    }

    public synchronized List<String> statements() {
        return List.copyOf(statements);
    }

    /** 동사(select·delete·insert·update)로 시작하고 표 이름(대소문자 무시)을 담은 SQL 수. */
    public synchronized long count(String verb, String table) {
        String v = verb.toLowerCase(Locale.ROOT);
        String t = table.toLowerCase(Locale.ROOT);
        return statements.stream()
                .map(s -> s.trim().toLowerCase(Locale.ROOT))
                .filter(s -> s.startsWith(v) && s.contains(t))
                .count();
    }
}
