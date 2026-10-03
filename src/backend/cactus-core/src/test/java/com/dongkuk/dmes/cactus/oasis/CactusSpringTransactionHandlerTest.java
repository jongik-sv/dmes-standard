package com.dongkuk.dmes.cactus.oasis;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.springframework.test.util.ReflectionTestUtils.getField;

import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.context.SpringApplicationContext;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import com.dongkuk.oasis.service.ServiceStarter;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionException;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.AbstractPlatformTransactionManager;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.SmartTransactionObject;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link CactusSpringTransactionHandler} 단위 시험 (refactor/framework-tx 3b, 2026-10-04).
 *
 * <p>DB 없이 Spring {@link AbstractPlatformTransactionManager} 의 실제 커밋·롤백 규칙을 타는 가짜 매니저를 쓴다 —
 * 참여 트랜잭션이 rollback-only 를 표시하면 바깥 커밋이 진짜 {@link UnexpectedRollbackException} 을 낸다.
 * 실제 JPA·SQLite 로 응답까지 끝에서 끝으로 보는 시험은 mcm/lib {@code OasisCommitFailureSqliteTest} 다
 * (cactus-core 시험 경로에는 JDBC 드라이버가 없다).
 *
 * <p>각 결함마다 oasis {@link SpringTransactionHandler} 그대로의 동작(현재 동작 고정)과 cactus 하위 클래스의 동작을 나란히 둔다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class CactusSpringTransactionHandlerTest {

    private static final String HOLDER = "com.dongkuk.oasis.transaction.ThreadLocalTransactionWarehouseHolder";

    private FakeTxManager txA;
    private FakeTxManager txB;
    private GenericApplicationContext ctx;

    @BeforeEach
    void setUp() {
        txA = new FakeTxManager();
        txB = new FakeTxManager();
        ctx = new GenericApplicationContext();
        ctx.registerBean("txA", PlatformTransactionManager.class, () -> txA);
        ctx.registerBean("txB", PlatformTransactionManager.class, () -> txB);
        ctx.refresh();
    }

    /** 누수를 고정하는 시험이 남긴 스레드 상태가 다음 시험을 오염시키지 않게 치운다. */
    @AfterEach
    void tearDown() throws Exception {
        holder("end");
        txA.current.remove();
        txB.current.remove();
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.clear();
        }
        ctx.close();
    }

    // ── 1. 참여 트랜잭션이 rollback-only 표시 → 바깥 커밋 UnexpectedRollbackException ──────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러는 UnexpectedRollbackException 을 삼키고 정상 반환한다")
    void oasisHandler_swallowsUnexpectedRollback() throws Exception {
        oasisHandler().execute(this::swallowParticipantFailure, new String[]{"txA"}, null);

        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("UnexpectedRollbackException 이 나면 스레드 상태를 정리한 뒤 원인을 담아 던진다")
    void cactusHandler_throwsUnexpectedRollback() throws Exception {
        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(this::swallowParticipantFailure, new String[]{"txA"}, null));

        assertThat(thrown)
                .isInstanceOf(TransactionException.class)
                .hasCauseInstanceOf(UnexpectedRollbackException.class)
                .hasMessageContaining("[txA]");
        assertThat(thrown.getMessage()).doesNotContain("커밋된 트랜잭션");
        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThreadStateCleared();
    }

    // ── 2. 커밋 중 TransactionException 이 아닌 예외 → end() 건너뜀 ──────────────────────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러는 커밋 중 일반 예외가 나면 남은 커밋과 end() 를 건너뛴다")
    void oasisHandler_skipsRemainingCommitsAndEnd() throws Exception {
        txB.commitFailure = new IllegalStateException("flush 실패");

        assertThatThrownBy(() -> oasisHandler().execute(() -> { }, new String[]{"txA", "txB"}, null))
                .isSameAs(txB.commitFailure);

        // 시작 역순(txB → txA)으로 커밋하다 txB 에서 끊겨 txA 는 커밋도 롤백도 안 됐다.
        assertThat(txB.events).containsExactly("begin", "commit", "rollback");
        assertThat(txA.events).containsExactly("begin");
        assertThat(txA.current.get()).as("txA 가 스레드에 묶여 있다").isNotNull();
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isTrue();
        assertThat(holder("getWarehouse")).isNotNull();
        assertThat(holder("canStart")).isEqualTo(true);
    }

    @Test
    @DisplayName("커밋 중 일반 예외가 나도 남은 트랜잭션을 커밋하고 스레드 상태를 정리한 뒤 일부만 반영됐다고 던진다")
    void cactusHandler_commitsRemainingAndCleansUp() throws Exception {
        txB.commitFailure = new IllegalStateException("flush 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null));

        assertThat(thrown)
                .isInstanceOf(TransactionException.class)
                .hasCause(txB.commitFailure)
                .hasMessageContaining("트랜잭션 커밋 실패 [txB]")
                .hasMessageContaining("커밋된 트랜잭션 [txA]")
                .hasMessageEndingWith("flush 실패");
        assertThat(thrown.getSuppressed()).isEmpty();
        assertThat(txB.events).containsExactly("begin", "commit", "rollback");
        assertThat(txA.events).containsExactly("begin", "commit");
        assertThat(txA.current.get()).isNull();
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("여러 트랜잭션이 커밋에 실패하면 첫 실패가 원인이고 나머지는 suppressed 다")
    void cactusHandler_collectsEveryFailure() throws Exception {
        txB.commitFailure = new IllegalStateException("B 실패");
        txA.commitFailure = new TransactionSystemException("A 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null));

        assertThat(thrown)
                .isInstanceOf(TransactionException.class)
                .hasCause(txB.commitFailure)
                .hasMessageContaining("[txB, txA]");
        assertThat(thrown.getMessage()).doesNotContain("커밋된 트랜잭션");
        assertThat(thrown.getSuppressed()).containsExactly(txA.commitFailure);
        assertThreadStateCleared();
    }

    // ── 3. 바꾸지 않는 경로 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("정상이면 시작 역순으로 모두 커밋하고 던지지 않는다")
    void cactusHandler_commitsAll() throws Exception {
        cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null);

        assertThat(txA.events).containsExactly("begin", "commit");
        assertThat(txB.events).containsExactly("begin", "commit");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("처리 중 예외는 롤백하고 같은 예외를 그대로 던진다 — alwaysCommit 커밋 실패는 지금처럼 로그만 남긴다")
    void cactusHandler_keepsRollbackAndAlwaysCommitPath() throws Exception {
        txA.commitFailure = new TransactionSystemException("항상 커밋 실패");
        IllegalStateException processFailure = new IllegalStateException("처리 실패");

        assertThatThrownBy(() -> cactusHandler().execute(() -> {
            throw processFailure;
        }, new String[]{"txA", "txB"}, new String[]{"txA"}))
                .isSameAs(processFailure);

        assertThat(processFailure.getSuppressed()).isEmpty();
        assertThat(txB.events).containsExactly("begin", "rollback");
        // TransactionException 커밋 실패는 rollbackOnCommitFailure(기본 false) 라 따로 롤백하지 않는다 — Spring 규칙 그대로.
        assertThat(txA.events).containsExactly("begin", "commit");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("병렬 실행 판정은 부모 그대로다 — 기본 트랜잭션을 시작하지 않고, 명시 트랜잭션은 거부한다")
    void cactusHandler_keepsParallelExecutionRules() throws Exception {
        List<String> ran = new ArrayList<>();
        try (ParallelExecutionScope.Scope ignored = ParallelExecutionScope.enter()) {
            cactusHandler().execute(() -> ran.add("process"), null, null);

            assertThatThrownBy(() -> cactusHandler().execute(() -> ran.add("never"), new String[]{"txA"}, null))
                    .isInstanceOf(TransactionException.class)
                    .hasMessageContaining("Parallel execution");
        }

        assertThat(ran).containsExactly("process");
        assertThat(txA.events).isEmpty();
        assertThat(txB.events).isEmpty();
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("OasisAutoConfiguration 의 transactional 조립은 cactus 핸들러를 주입한다")
    void autoConfiguration_wiresCactusHandler() {
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/cactus-starter-char");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txA", new CactusTxProperties.TxMgrConfig());
        tx.getManagers().put("txB", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txA");

        ServiceStarter starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);

        Object core = getField(getField(starter, "serviceStarter"), "serviceStarter");
        assertThat(getField(core, "transactionHandler")).isInstanceOf(CactusSpringTransactionHandler.class);
    }

    // ── 도우미 ──────────────────────────────────────────────────────────────────

    /** 업무 작업처럼 참여 트랜잭션 안 예외를 잡고 계속한다 — 참여 트랜잭션이 바깥 트랜잭션을 rollback-only 로 표시한다. */
    private void swallowParticipantFailure() {
        try {
            new TransactionTemplate(txA).executeWithoutResult(status -> {
                throw new IllegalStateException("리포지토리 안 예외");
            });
        } catch (IllegalStateException expected) {
            // 업무 코드가 잡고 넘어간다.
        }
    }

    private SpringTransactionHandler oasisHandler() {
        return new SpringTransactionHandler(new SpringApplicationContext(ctx), new String[]{"txA", "txB"});
    }

    private CactusSpringTransactionHandler cactusHandler() {
        return new CactusSpringTransactionHandler(new SpringApplicationContext(ctx), new String[]{"txA", "txB"});
    }

    /** oasis 스레드 보관소가 비었고(end() 가 돌았고) Spring 동기화·cactus 실패 목록도 남지 않았다. */
    private static void assertThreadStateCleared() throws Exception {
        assertThat(holder("getWarehouse")).isNull();
        assertThat(holder("canStart")).isEqualTo(false);
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
        ThreadLocal<?> pending = (ThreadLocal<?>) getField(CactusSpringTransactionHandler.class, "PENDING_FAILURES");
        assertThat(pending.get()).isNull();
    }

    /** oasis 의 package-private 스레드 상태 보관소를 리플렉션으로 본다. */
    private static Object holder(String method) throws Exception {
        Method m = Class.forName(HOLDER).getDeclaredMethod(method);
        m.setAccessible(true);
        return m.invoke(null);
    }

    /**
     * DB 없이 Spring 트랜잭션 규칙(참여·rollback-only·커밋 실패 시 롤백)을 그대로 타는 트랜잭션 매니저.
     * {@link #commitFailure} 를 주면 커밋 순간 그 예외를 던진다(커밋 시점 flush 실패 흉내).
     */
    static final class FakeTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = new ArrayList<>();
        final ThreadLocal<FakeTx> current = new ThreadLocal<>();
        RuntimeException commitFailure;

        static final class FakeTx {
            boolean rollbackOnly;
        }

        static final class TxObject implements SmartTransactionObject {
            FakeTx tx;

            @Override
            public boolean isRollbackOnly() {
                return tx != null && tx.rollbackOnly;
            }

            @Override
            public void flush() {
            }
        }

        @Override
        protected Object doGetTransaction() {
            TxObject txObject = new TxObject();
            txObject.tx = current.get();
            return txObject;
        }

        @Override
        protected boolean isExistingTransaction(Object transaction) {
            return ((TxObject) transaction).tx != null;
        }

        @Override
        protected void doBegin(Object transaction, TransactionDefinition definition) {
            FakeTx tx = new FakeTx();
            ((TxObject) transaction).tx = tx;
            current.set(tx);
            events.add("begin");
        }

        @Override
        protected void doCommit(DefaultTransactionStatus status) {
            events.add("commit");
            if (commitFailure != null) {
                throw commitFailure;
            }
        }

        @Override
        protected void doRollback(DefaultTransactionStatus status) {
            events.add("rollback");
        }

        @Override
        protected void doSetRollbackOnly(DefaultTransactionStatus status) {
            ((TxObject) status.getTransaction()).tx.rollbackOnly = true;
        }

        @Override
        protected void doCleanupAfterCompletion(Object transaction) {
            current.remove();
        }
    }
}
