package com.dongkuk.dmes.mcm.csa.commUserMng.support;

import jakarta.persistence.EntityManagerFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/**
 * Hibernate 가 준비하는 SQL 을 그대로 통과시키면서 기록만 하는 {@link StatementInspector} — 성능 근거 테스트용.
 *
 * <p>{@link CommUserMngJpaTestConfig} 의 EMF 에 등록돼 있다. SQL 을 바꾸지 않으므로 다른 특성 테스트에는 영향이 없다.
 * 세는 쪽은 서비스 호출 직전에 {@link #reset()} 해 데이터 준비 SQL 이 섞이지 않게 한다.
 *
 * <p>판정이 기대는 전제 두 가지(설정을 바꿀 때 유지한다):
 * <ul>
 *   <li><b>JDBC 배치가 꺼져 있어야 한다.</b> {@code StatementInspector} 는 SQL 을 실행할 때가 아니라 준비할 때마다 불린다.
 *       {@code hibernate.jdbc.batch_size} 를 켜면 같은 DELETE·INSERT 문이 한 번만 준비돼, 건별 {@code deleteById} 같은
 *       옛 경로도 적게 세어져 회귀를 놓친다. 그래서 *SqlCountTest 는 {@link #requireNoJdbcBatching} 로 이 전제를 단언한다.</li>
 *   <li><b>시험은 순차로 돌아야 한다.</b> 전역 하나({@link #INSTANCE})가 {@link CommUserMngJpaTestConfig} 를 공유하는
 *       모든 시험의 SQL 을 {@link #reset()} 전까지 쌓는다. 지금은 junit-platform.properties 가 없어 순차 실행이다 —
 *       JUnit 병렬 실행을 켜면 이 계수기를 시험별로 나눠야 한다.</li>
 * </ul>
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

    /**
     * JDBC 배치가 켜져 있으면(batch_size &gt; 1) 실패한다 — 켜지면 준비 횟수만 세어 실행 횟수 판정이 틀어진다.
     */
    public static void requireNoJdbcBatching(EntityManagerFactory emf) {
        Object batchSize = emf.getProperties().get("hibernate.jdbc.batch_size");
        if (batchSize != null && Integer.parseInt(batchSize.toString().trim()) > 1) {
            throw new IllegalStateException("SQL 수 시험은 JDBC 배치가 꺼져 있어야 한다: hibernate.jdbc.batch_size=" + batchSize);
        }
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
