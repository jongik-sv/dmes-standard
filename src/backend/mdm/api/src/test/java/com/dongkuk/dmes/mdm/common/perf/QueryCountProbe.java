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
 * 삼킨다(오류 경로도 문 수를 잰다).
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

    /** 운영(OASIS 트랜잭션)과 같게 트랜잭션 안에서 부르고 롤백한다. */
    public long inTx(String name, Supplier<?> call) {
        long[] n = new long[1];
        new TransactionTemplate(tm).executeWithoutResult(st -> {
            stats.clear();
            invoke(call);
            em.flush();
            n[0] = stats.getPrepareStatementCount();
            st.setRollbackOnly();
        });
        System.out.println("[query-count] " + group + " " + name + " = " + n[0]);
        return n[0];
    }

    /** 트랜잭션 밖 호출(서비스 테스트 대부분이 이렇게 부른다) — 커밋되므로 부른 쪽이 다시 시드한다. */
    public long outsideTx(String name, Supplier<?> call) {
        stats.clear();
        invoke(call);
        long n = stats.getPrepareStatementCount();
        System.out.println("[query-count] " + group + " " + name + " (no tx) = " + n);
        return n;
    }

    private static void invoke(Supplier<?> call) {
        try {
            call.get();
        } catch (RuntimeException e) {
            // 오류 경로도 문 수만 잰다
        }
    }
}
