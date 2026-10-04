package com.dongkuk.dmes.mdm.measure;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.function.Supplier;
import org.hibernate.SessionFactory;
import org.hibernate.stat.Statistics;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * Hibernate Statistics 로 서비스 한 번 호출의 flush·SQL 문·엔티티 수를 센다. 기존 {@code QueryCountProbe}(기준·변경 모두 있음)와 같은 방식
 * — 운영(OASIS 트랜잭션)처럼 트랜잭션 안에서 부르고 롤백한다 — 이되 더 많은 값을 읽는다.
 *
 * <ul>
 *   <li>{@code stmts}: 호출이 돌아온 직후의 {@code prepareStatementCount}. 이 리포 mdm 설정에는 {@code hibernate.jdbc.batch_size}·
 *       {@code order_inserts} 가 없어(2026-10-04 grep) JDBC 배치가 없으므로 준비한 문 수 ≈ 실행한 문 수다.</li>
 *   <li>{@code stmtsWithTrailingFlush}: 그 뒤 {@code em.flush()} 까지의 문 수 — {@code QueryCountProbe} 의 {@code [query-count]} 값과 같은 정의다
 *       (호출이 flush 하지 않고 남긴 쓰기까지 센다).</li>
 *   <li>{@code flush}: 호출 안의 flush 횟수({@code getFlushCount}, 자동 flush 포함, 뒤따르는 em.flush 는 빼고 센다).</li>
 *   <li>{@code loads}·{@code fetches}·{@code inserts}·{@code updates}·{@code deletes}: 같은 구간의 엔티티 수.</li>
 * </ul>
 * Statistics 는 SessionFactory 전역이라 같은 JVM 의 다른 스레드가 쓰면 섞인다 — 측정 시험은 단독 클래스로 돈다.
 */
public final class StatProbe {

    private final PlatformTransactionManager tm;
    private final EntityManager em;
    private final Statistics stats;

    public StatProbe(PlatformTransactionManager tm, EntityManager em, EntityManagerFactory emf) {
        this.tm = tm;
        this.em = em;
        this.stats = emf.unwrap(SessionFactory.class).getStatistics();
    }

    public record Counts(long flushes, long stmts, long stmtsWithTrailingFlush, long loads, long fetches, long inserts,
                         long updates, long deletes, Object result, RuntimeException error) {

        public Object[] kv() {
            return new Object[] {"flush", flushes, "stmts", stmts, "stmtsWithTrailingFlush", stmtsWithTrailingFlush, "loads",
                    loads, "fetches", fetches, "inserts", inserts, "updates", updates, "deletes", deletes};
        }
    }

    /** 트랜잭션 안에서 setup(세지 않음, 끝에 flush) → 세기 시작 → call → 롤백. call 이 던진 예외는 삼켜 {@link Counts#error} 로 돌려준다. */
    public Counts inTx(Runnable setup, Supplier<?> call) {
        Object[] box = new Object[2];
        long[] n = new long[8];
        new TransactionTemplate(tm).executeWithoutResult(st -> {
            try {
                if (setup != null) {
                    setup.run();
                    em.flush();
                }
                stats.setStatisticsEnabled(true);
                stats.clear();
                try {
                    box[0] = call.get();
                } catch (RuntimeException e) {
                    box[1] = e;
                }
                n[0] = stats.getFlushCount();
                n[1] = stats.getPrepareStatementCount();
                n[3] = stats.getEntityLoadCount();
                n[4] = stats.getEntityFetchCount();
                n[5] = stats.getEntityInsertCount();
                n[6] = stats.getEntityUpdateCount();
                n[7] = stats.getEntityDeleteCount();
                if (box[1] == null) {
                    try {
                        em.flush();
                    } catch (RuntimeException e) {
                        box[1] = e;
                    }
                }
                n[2] = stats.getPrepareStatementCount();
            } finally {
                stats.clear();
                stats.setStatisticsEnabled(false);
                st.setRollbackOnly();
            }
        });
        return new Counts(n[0], n[1], n[2], n[3], n[4], n[5], n[6], n[7], box[0], (RuntimeException) box[1]);
    }

    public Counts inTx(Supplier<?> call) {
        return inTx(null, call);
    }

    /**
     * 시간 — 예열 warmup 회 뒤 reps 회. 회마다 새 트랜잭션(새 영속성 컨텍스트)에서 call 구간만 {@code System.nanoTime()} 으로 재고 롤백한다.
     * Statistics 는 끈 채로 잰다. call 이 던지면 그대로 던진다(오류 경로 시간을 재지 않게).
     */
    public long[] timeInTx(Supplier<?> call, int warmup, int reps) {
        long[] out = new long[reps];
        stats.setStatisticsEnabled(false);
        for (int i = -warmup; i < reps; i++) {
            long[] t = new long[1];
            new TransactionTemplate(tm).executeWithoutResult(st -> {
                try {
                    long t0 = System.nanoTime();
                    call.get();
                    t[0] = System.nanoTime() - t0;
                } finally {
                    st.setRollbackOnly();
                }
            });
            if (i >= 0) {
                out[i] = t[0];
            }
        }
        return out;
    }
}
