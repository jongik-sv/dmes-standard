package com.dongkuk.dmes.mdm.common.perf;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 서버 부하 가드 테스트 공용 — 서비스 한 번 호출이 Hibernate 로 준비한 SQL 문 수({@code prepareStatementCount})를 센다. 호출이 던진 예외는
 * 삼키지 않고 그대로 던진다 — 오류로 일찍 끝난 호출의 문 수가 통과로 보이지 않게 한다. 오류 경로의 문 수는
 * {@link #inTxCatching} 으로 잰다.
 */
public final class QueryCountProbe {

    private final PlatformTransactionManager tm;
    private final EntityManager em;
    private final Statistics stats;
    private final String group;

    public QueryCountProbe(PlatformTransactionManager tm, EntityManager em, EntityManagerFactory emf, String group) {
        this.tm = tm;
        this.em = em;
        this.stats = emf.unwrap(SessionFactory.class).getStatistics();
        this.group = group;
    }

    public void start() {
        stats.setStatisticsEnabled(true);
        stats.clear();
    }

    public void stop() {
        stats.clear();
        stats.setStatisticsEnabled(false);
    }

    /** 문 수와 호출 결과(또는 던진 예외). */
    public record Measured<T>(long count, T result, RuntimeException error) {
    }

    /** 운영(OASIS 트랜잭션)과 같게 트랜잭션 안에서 부르고 롤백한다. 호출이 던진 예외는 그대로 던진다. */
    public long inTx(String name, Supplier<?> call) {
        return measureInTx(name, call).count();
    }

    /** {@link #inTx} 와 같되 호출 결과를 함께 돌려준다. 예외는 그대로 던진다. */
    public <T> Measured<T> measureInTx(String name, Supplier<T> call) {
        Measured<T> m = inTxCatching(name, call);
        if (m.error() != null) {
            throw m.error();
        }
        return m;
    }

    /** 오류를 일부러 내는 호출 — 던진 예외를 돌려주니 부른 쪽이 기대한 예외인지 단언한다. */
    public <T> Measured<T> inTxCatching(String name, Supplier<T> call) {
        Object[] box = new Object[2];
        long[] n = new long[1];
        new TransactionTemplate(tm).executeWithoutResult(st -> {
            stats.clear();
            try {
                box[0] = call.get();
            } catch (RuntimeException e) {
                box[1] = e;
            }
            em.flush();
            n[0] = stats.getPrepareStatementCount();
            st.setRollbackOnly();
        });
        System.out.println("[query-count] " + group + " " + name + " = " + n[0]);
        @SuppressWarnings("unchecked")
        T result = (T) box[0];
        return new Measured<>(n[0], result, (RuntimeException) box[1]);
    }

    /** 트랜잭션 밖 호출(서비스 테스트 대부분이 이렇게 부른다) — 커밋되므로 부른 쪽이 다시 시드한다. 예외는 그대로 던진다. */
    public long outsideTx(String name, Supplier<?> call) {
        stats.clear();
        call.get();
        long n = stats.getPrepareStatementCount();
        System.out.println("[query-count] " + group + " " + name + " (no tx) = " + n);
        return n;
    }
}
