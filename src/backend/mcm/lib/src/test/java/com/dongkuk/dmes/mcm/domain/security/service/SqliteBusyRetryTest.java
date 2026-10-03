package com.dongkuk.dmes.mcm.domain.security.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertSame;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.mcm.common.audit.McmAuditStatementInspector;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.sqlite.SQLiteErrorCode;
import org.sqlite.SQLiteException;

/** 로그인 다시 시도 — 로컬 SQLite 의 SQLITE_BUSY 만, 정해진 횟수까지. 운영 방언(Oracle·PostgreSQL)에서는 다시 시도하지 않는다. */
class SqliteBusyRetryTest {

    @AfterEach
    void tearDown() {
        McmAuditStatementInspector.setSqlite(false);
    }

    private static RuntimeException busy() {
        // JPA 가 던지는 모양 — PessimisticLockException ← LockAcquisitionException ← SQLiteException(SQLITE_BUSY).
        return new IllegalStateException("lock", new RuntimeException(new SQLiteException("[SQLITE_BUSY] locked", SQLiteErrorCode.SQLITE_BUSY)));
    }

    @Test
    void SQLite_에서_BUSY_면_다시_시도해_값을_돌려준다() {
        McmAuditStatementInspector.setSqlite(true);
        AtomicInteger calls = new AtomicInteger();
        String out = SqliteBusyRetry.call(() -> {
            if (calls.incrementAndGet() < 3) throw busy();
            return "ok";
        });
        assertEquals("ok", out);
        assertEquals(3, calls.get());
    }

    @Test
    void 다시_시도는_세_번까지다() {
        McmAuditStatementInspector.setSqlite(true);
        AtomicInteger calls = new AtomicInteger();
        RuntimeException last = busy();
        RuntimeException thrown = assertThrows(RuntimeException.class, () -> SqliteBusyRetry.call(() -> {
            calls.incrementAndGet();
            throw last;
        }));
        assertSame(last, thrown);
        assertEquals(4, calls.get());
    }

    @Test
    void SQLite_가_아니면_BUSY_여도_다시_시도하지_않는다() {
        AtomicInteger calls = new AtomicInteger();
        assertThrows(RuntimeException.class, () -> SqliteBusyRetry.call(() -> {
            calls.incrementAndGet();
            throw busy();
        }));
        assertEquals(1, calls.get());
    }

    @Test
    void BUSY_가_아닌_예외는_다시_시도하지_않는다() {
        McmAuditStatementInspector.setSqlite(true);
        AtomicInteger calls = new AtomicInteger();
        assertThrows(RuntimeException.class, () -> SqliteBusyRetry.call(() -> {
            calls.incrementAndGet();
            throw new IllegalStateException(new SQLiteException("constraint", SQLiteErrorCode.SQLITE_CONSTRAINT));
        }));
        assertEquals(1, calls.get());
    }

    @Test
    void 바깥에_트랜잭션이_열려_있으면_다시_시도하지_않는다() {
        // 재시도는 트랜잭션 바깥에서만 뜻이 있다 — 바깥 트랜잭션 안이면 SHARED 가 풀리지 않고 rollback-only 로 깨진다.
        McmAuditStatementInspector.setSqlite(true);
        AtomicInteger calls = new AtomicInteger();
        TransactionSynchronizationManager.setActualTransactionActive(true);
        try {
            assertThrows(RuntimeException.class, () -> SqliteBusyRetry.call(() -> {
                calls.incrementAndGet();
                throw busy();
            }));
        } finally {
            TransactionSynchronizationManager.setActualTransactionActive(false);
        }
        assertEquals(1, calls.get());
    }
}
