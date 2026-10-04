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
                .hasMessage(CactusSpringTransactionHandler.CLIENT_MESSAGE);
        assertThat(thrown.getMessage()).doesNotContain("txA");
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
    @DisplayName("역순 첫 커밋이 실패하면 아직 커밋하지 않은 나머지는 롤백하고 스레드 상태를 정리한 뒤 일반 문구로 던진다")
    void cactusHandler_rollsBackRemainingAfterFirstCommitFailure() throws Exception {
        txB.commitFailure = new IllegalStateException("flush 실패 UNIQUE constraint UK_CODE");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null));

        assertThat(thrown)
                .isInstanceOf(TransactionException.class)
                .hasCause(txB.commitFailure)
                .hasMessage(CactusSpringTransactionHandler.CLIENT_MESSAGE);
        assertThat(thrown.getMessage()).doesNotContain("txA").doesNotContain("txB").doesNotContain("UNIQUE");
        assertThat(thrown.getSuppressed()).isEmpty();
        assertThat(txB.events).containsExactly("begin", "commit", "rollback");
        // 결정 2: 첫 실패 뒤 남은 txA 는 커밋하지 않고 롤백한다.
        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThat(txA.current.get()).isNull();
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("이미 커밋된 트랜잭션은 그대로 두고 실패 뒤의 것만 롤백한다")
    void cactusHandler_keepsAlreadyCommittedAndRollsBackRest() throws Exception {
        registerTxC();
        txB.commitFailure = new IllegalStateException("B 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler3().execute(() -> { }, new String[]{"txA", "txB", "txC"}, null));

        assertThat(thrown).isInstanceOf(TransactionException.class).hasCause(txB.commitFailure);
        // 역순: txC 커밋(되돌릴 수 없음) → txB 실패 → txA 롤백.
        assertThat(txC.events).containsExactly("begin", "commit");
        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThreadStateCleared();
        txC.current.remove();
    }

    @Test
    @DisplayName("남은 트랜잭션 롤백도 실패하면 그 실패는 suppressed 로 붙고 스레드 상태는 정리된다")
    void cactusHandler_collectsRollbackFailureAsSuppressed() throws Exception {
        txB.commitFailure = new IllegalStateException("B 실패");
        txA.rollbackFailure = new TransactionSystemException("A 롤백 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null));

        assertThat(thrown)
                .isInstanceOf(TransactionException.class)
                .hasCause(txB.commitFailure)
                .hasMessage(CactusSpringTransactionHandler.CLIENT_MESSAGE);
        assertThat(thrown.getSuppressed()).containsExactly(txA.rollbackFailure);
        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("항상 커밋 트랜잭션은 다른 커밋이 실패해도 롤백하지 않고 커밋한다")
    void cactusHandler_alwaysCommitStillCommitsAfterFailure() throws Exception {
        txB.commitFailure = new IllegalStateException("B 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, new String[]{"txA"}));

        assertThat(thrown).isInstanceOf(TransactionException.class).hasCause(txB.commitFailure);
        assertThat(txA.events).containsExactly("begin", "commit");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("항상 커밋 트랜잭션의 커밋 실패는 지금처럼 삼키고 나머지는 커밋한다")
    void cactusHandler_alwaysCommitFailureIsSwallowed() throws Exception {
        txB.commitFailure = new TransactionSystemException("항상 커밋 실패");

        cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, new String[]{"txB"});

        assertThat(txB.events).containsExactly("begin", "commit");
        assertThat(txA.events).containsExactly("begin", "commit");
        assertThreadStateCleared();
    }

    // ── 2-1. 두 번째 트랜잭션 매니저 시작 실패 → 먼저 시작된 트랜잭션 누수 ────────────────────

    @Test
    @DisplayName("[현재 동작 고정] oasis 핸들러는 두 번째 시작이 실패하면 첫 트랜잭션을 묶어 두고 다음 요청이 거기 합류한다")
    void oasisHandler_leaksFirstTransactionOnStartFailure() throws Exception {
        txB.beginFailure = new IllegalStateException("연결 실패");
        List<String> ran = new ArrayList<>();

        assertThatThrownBy(() -> oasisHandler().execute(() -> ran.add("process"), new String[]{"txA", "txB"}, null))
                .isSameAs(txB.beginFailure);

        assertThat(ran).isEmpty();
        assertThat(txA.events).containsExactly("begin");
        assertThat(txA.current.get()).as("txA 가 스레드에 묶여 있다").isNotNull();
        assertThat(holder("getWarehouse")).isNotNull();
        assertThat(holder("canStart")).isEqualTo(true);

        // 같은 스레드의 다음 요청은 txA 를 새로 시작하지 않고 묵은 트랜잭션에 합류한다.
        txB.beginFailure = null;
        oasisHandler().execute(() -> { }, new String[]{"txA", "txB"}, null);
        assertThat(txA.events).containsExactly("begin", "commit");
    }

    @Test
    @DisplayName("두 번째 시작이 실패하면 먼저 시작된 트랜잭션을 롤백·정리하고, 다음 요청은 새 트랜잭션으로 시작한다")
    void cactusHandler_rollsBackStartedTransactionsOnStartFailure() throws Exception {
        txB.beginFailure = new IllegalStateException("연결 실패");
        List<String> ran = new ArrayList<>();

        assertThatThrownBy(() -> cactusHandler().execute(() -> ran.add("process"), new String[]{"txA", "txB"}, null))
                .isSameAs(txB.beginFailure);

        assertThat(ran).isEmpty();
        assertThat(txA.events).containsExactly("begin", "rollback");
        assertThat(txA.current.get()).as("txA 연결이 풀렸다").isNull();
        assertThat(txB.events).isEmpty();
        assertThreadStateCleared();

        txB.beginFailure = null;
        cactusHandler().execute(() -> ran.add("process"), new String[]{"txA", "txB"}, null);
        assertThat(ran).containsExactly("process");
        assertThat(txA.events).containsExactly("begin", "rollback", "begin", "commit");
        assertThat(txB.events).containsExactly("begin", "commit");
        assertThreadStateCleared();
    }

    @Test
    @DisplayName("시작 실패 정리에서 롤백이 실패해도 suppressed 로 붙이고 스레드 상태는 정리한다")
    void cactusHandler_startFailureRollbackFailureIsSuppressed() throws Exception {
        txB.beginFailure = new IllegalStateException("연결 실패");
        txA.rollbackFailure = new TransactionSystemException("A 롤백 실패");

        Throwable thrown = catchThrowable(() ->
                cactusHandler().execute(() -> { }, new String[]{"txA", "txB"}, null));

        assertThat(thrown).isSameAs(txB.beginFailure);
        assertThat(thrown.getSuppressed()).containsExactly(txA.rollbackFailure);
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

    private FakeTxManager txC;

    private FakeTxManager registerTxC() {
        txC = new FakeTxManager();
        ctx.close();
        ctx = new GenericApplicationContext();
        ctx.registerBean("txA", PlatformTransactionManager.class, () -> txA);
        ctx.registerBean("txB", PlatformTransactionManager.class, () -> txB);
        ctx.registerBean("txC", PlatformTransactionManager.class, () -> txC);
        ctx.refresh();
        return txC;
    }

    private CactusSpringTransactionHandler cactusHandler3() {
        return new CactusSpringTransactionHandler(new SpringApplicationContext(ctx), new String[]{"txA", "txB", "txC"});
    }

    /** oasis 스레드 보관소가 비었고(end() 가 돌았고) Spring 동기화·cactus 실패 목록도 남지 않았다. */
    private static void assertThreadStateCleared() throws Exception {
        assertThat(holder("getWarehouse")).isNull();
        assertThat(holder("canStart")).isEqualTo(false);
        assertThat(TransactionSynchronizationManager.isSynchronizationActive()).isFalse();
        ThreadLocal<?> pending = (ThreadLocal<?>) getField(CactusSpringTransactionHandler.class, "CURRENT");
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
     * {@link #beginFailure} 는 시작 순간(연결 획득 실패 흉내), {@link #rollbackFailure} 는 롤백 순간 던진다.
     */
    static final class FakeTxManager extends AbstractPlatformTransactionManager {
        final List<String> events = new ArrayList<>();
        final ThreadLocal<FakeTx> current = new ThreadLocal<>();
        RuntimeException commitFailure;
        RuntimeException beginFailure;
        RuntimeException rollbackFailure;

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
            if (beginFailure != null) {
                throw beginFailure;
            }
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
            if (rollbackFailure != null) {
                throw rollbackFailure;
            }
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
