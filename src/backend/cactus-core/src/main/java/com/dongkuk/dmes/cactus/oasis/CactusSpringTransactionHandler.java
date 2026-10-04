package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.transaction.CactusTransactionWarehouseCleaner;
import com.dongkuk.oasis.transaction.CactusTransactionWarehouseView;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionException;
import com.dongkuk.oasis.transaction.TransactionHandler;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;

/**
 * 커밋 실패를 삼키지 않는 OASIS 트랜잭션 핸들러 (refactor/framework-tx 3b, 2026-10-04 · framework-txfix 후속).
 *
 * <p>oasis {@link SpringTransactionHandler} 의 결함 세 가지를 cactus 층에서 막는다(oasis 소스는 고치지 않는다).
 * <ol>
 *   <li><b>커밋 실패 삼킴</b> — 부모 {@code commitAll()} 은 커밋 중 Spring {@code TransactionException}
 *       ({@code UnexpectedRollbackException} 등)을 잡아 로그만 남긴다. 업무 작업이 리포지토리 안 예외를 잡고 계속하면
 *       트랜잭션이 rollback-only 로 표시돼 실제로는 롤백됐는데 서비스는 SUCCESS 로 끝났다.</li>
 *   <li><b>커밋 중 스레드 상태 누수</b> — 커밋 시점 flush 의 {@code DataAccessException} 처럼 Spring
 *       {@code TransactionException} 이 아닌 예외는 부모 {@code commitAll()} 밖으로 새어 나가 남은 트랜잭션을
 *       커밋도 롤백도 하지 않고, 부모 {@code execute()} finally 의 {@code ThreadLocalTransactionWarehouseHolder.end()}
 *       까지 건너뛰었다.</li>
 *   <li><b>시작 실패 누수</b> — 부모 {@code execute()} 는 {@code begin()} 과 트랜잭션 시작 반복문을 {@code try} 밖에
 *       둬서, 두 번째 트랜잭션 매니저 시작이 실패하면 먼저 시작된 트랜잭션이 스레드에 묶인 채 {@code end()} 가 돌지 않는다.
 *       같은 스레드의 다음 요청은 {@code startTransaction} 의 "in progress" 경로로 묵은 트랜잭션에 합류했다.</li>
 * </ol>
 *
 * <p><b>커밋 정책</b>({@link #commitAll()}) — 시작 역순으로 커밋하다 첫 실패가 나면, 아직 커밋하지 않은 나머지는
 * 롤백한다. 이미 커밋된 것은 되돌릴 수 없으므로 그대로 두고 ERROR 로그에 남긴다(일부만 반영). 롤백 자체가 실패하면
 * 그 실패도 던지는 예외의 suppressed 로 모은다. 단 항상 커밋({@code alwaysCommit}) 트랜잭션 매니저는 부모
 * {@code rollbackAll()} 과 같은 규칙 — 언제나 커밋하고, 커밋 실패는 로그만 남기고 삼킨다.
 * 실패는 모아 두기만 하고 던지지 않아, 부모 {@code execute()} finally 의 {@code end()} 가 반드시 돈다.
 * {@link #execute} 는 부모가 정상으로 돌아온 뒤 모인 실패를 하나의 oasis {@link TransactionException} 으로 던진다.
 * {@code CoreServiceStarter} 가 이를 SYSTEM_ERROR 로 바꾸고 {@code CactusResponseConverter} 가 응답 코드 {@code S001} 로 내보낸다.
 *
 * <p><b>응답 문구</b> — {@code CoreServiceStarter} 는 예외 메시지를 그대로 응답 {@code meta.message} 로 싣는다. 그래서 던지는
 * 예외 메시지는 S001 의 일반 문구({@link #CLIENT_MESSAGE})뿐이고, 트랜잭션 매니저 별칭·일부만 반영 여부·원인 메시지(SQL·제약
 * 이름)는 ERROR 로그에만 남긴다(MDC 의 {@code txId}·{@code requestId} 포함). 원인 예외는 cause 로 남는다.
 *
 * <p><b>시작 실패 정리</b>({@link #execute}) — 부모에 넘기는 process 를 감싸 "process 에 들어갔는지" 를 표시한다.
 * 부모가 던졌는데 표시가 없으면 시작 단계 실패다(처리 단계 실패는 부모가 이미 {@code rollbackAll} 하고 finally 에서
 * {@code end()} 하므로 건드리지 않는다 — 이중 롤백 없음). 시작 단계 실패면 이번 호출이 시작한 트랜잭션만 시작 역순으로
 * 롤백하고, 호출 전 보관소가 비어 있었으면 {@code end()} 로 끝낸다.
 *
 * <p>바꾸지 않는 경로 — 처리 중 예외 때의 {@code rollbackAll}(항상 커밋 포함), 중간 커밋·롤백 후 재시작,
 * 병렬 실행({@code ParallelExecutionScope}) 판정은 모두 부모 그대로다.
 *
 * <p>실행 상태(실패 목록·항상 커밋 이름)는 스레드별({@link ThreadLocal})이고 {@link #execute} 가 끝날 때 이전 값으로
 * 되돌린다(없으면 지운다). 핸들러 인스턴스 하나를 여러 요청 스레드가 함께 써도 된다.
 */
public class CactusSpringTransactionHandler extends SpringTransactionHandler {

    private static final Logger log = LoggerFactory.getLogger(CactusSpringTransactionHandler.class);

    /** 커밋 실패 때 응답 {@code meta.message} 로 나가는 일반 문구 — 응답 코드 S001 의 기본 문구. */
    public static final String CLIENT_MESSAGE = ErrorCode.INTERNAL_ERROR.getDefaultMessage();

    /** 진행 중인 {@link #execute} 한 번의 상태. execute 밖이면 null. */
    private static final ThreadLocal<ExecutionState> CURRENT = new ThreadLocal<>();

    /** {@link #execute} 한 번 동안의 스레드별 상태. */
    private static final class ExecutionState {
        final List<TransactionException> failures = new ArrayList<>();
        final String[] alwaysCommitTransactionManagerNames;
        boolean processEntered;

        ExecutionState(String[] alwaysCommitTransactionManagerNames) {
            this.alwaysCommitTransactionManagerNames = alwaysCommitTransactionManagerNames;
        }
    }

    /**
     * @param applicationContext      트랜잭션 매니저를 이름으로 찾을 애플리케이션 컨텍스트
     * @param transactionManagerNames 애플리케이션 수준 트랜잭션 매니저 이름(허용 목록)
     */
    public CactusSpringTransactionHandler(ApplicationContext applicationContext, String[] transactionManagerNames) {
        super(applicationContext, transactionManagerNames);
    }

    @Override
    public void execute(TransactionHandler.Process process,
                        String[] transactionManagerNames,
                        String[] alwaysCommitTransactionManagerNames) {
        ExecutionState previous = CURRENT.get();
        ExecutionState state = new ExecutionState(alwaysCommitTransactionManagerNames);
        List<CactusTransactionWarehouseView.Entry> before = CactusTransactionWarehouseView.currentTransactions();
        CURRENT.set(state);
        try {
            super.execute(() -> {
                state.processEntered = true;
                process.process();
            }, transactionManagerNames, alwaysCommitTransactionManagerNames);
        } catch (RuntimeException | Error e) {
            if (!state.processEntered) {
                cleanUpAfterStartFailure(before, e);
            }
            throw e;
        } finally {
            if (previous == null) {
                CURRENT.remove();
            } else {
                CURRENT.set(previous);
            }
        }

        List<TransactionException> failures = state.failures;
        if (!failures.isEmpty()) {
            TransactionException first = failures.get(0);
            for (int i = 1; i < failures.size(); i++) {
                first.addSuppressed(failures.get(i));
            }
            throw first;
        }
    }

    /**
     * 시작 단계(부모 {@code execute()} 의 {@code try} 밖)에서 실패했을 때 이번 호출이 시작한 트랜잭션을 롤백하고 보관소를 끝낸다.
     *
     * <p>호출 전 보관소에 있던 트랜잭션(바깥 execute 의 것)은 건드리지 않는다. 호출 전 보관소가 비어 있었을 때만
     * {@code end()} 한다 — 바깥 execute 가 진행 중이면 그 보관소를 지우지 않는다. 롤백 실패는 {@code failure} 의
     * suppressed 로 붙이고 나머지 롤백·정리는 계속한다.
     */
    private static void cleanUpAfterStartFailure(List<CactusTransactionWarehouseView.Entry> before, Throwable failure) {
        List<CactusTransactionWarehouseView.Entry> started = new ArrayList<>();
        for (CactusTransactionWarehouseView.Entry tx : CactusTransactionWarehouseView.currentTransactions()) {
            if (!tx.status().isCompleted() && !startedBefore(tx, before)) {
                started.add(tx);
            }
        }
        Collections.reverse(started);

        List<String> rolledBack = new ArrayList<>();
        for (CactusTransactionWarehouseView.Entry tx : started) {
            try {
                tx.manager().rollback(tx.status());
                rolledBack.add(tx.name());
            } catch (RuntimeException e) {
                failure.addSuppressed(e);
                log.error("Failed to rollback after start failure : [{}] {}", tx.name(), e.getMessage(), e);
            }
        }
        boolean ended = before.isEmpty();
        if (ended) {
            CactusTransactionWarehouseCleaner.end();
        }
        log.error("트랜잭션 시작 실패 — 먼저 시작된 트랜잭션 {} 롤백, 보관소 정리 {} (txId={}, requestId={}): {}",
                rolledBack, ended, MDC.get("txId"), MDC.get("requestId"), failure.getMessage());
    }

    private static boolean startedBefore(CactusTransactionWarehouseView.Entry tx,
                                         List<CactusTransactionWarehouseView.Entry> before) {
        for (CactusTransactionWarehouseView.Entry old : before) {
            if (old.status() == tx.status()) {
                return true;
            }
        }
        return false;
    }

    /**
     * 시작 역순으로 끝나지 않은 트랜잭션을 커밋한다. 첫 커밋 실패 뒤 남은 트랜잭션은 롤백한다(항상 커밋은 예외 — 클래스 설명).
     *
     * <p>{@link #execute} 안에서 불리면 실패를 모아 두고 정상 반환한다 — 부모 execute 의 finally 가
     * 스레드 상태를 정리한 뒤 {@link #execute} 가 던진다. execute 밖에서 직접 불리면 끝까지 처리한 뒤 바로 던진다.
     *
     * @throws TransactionException execute 밖에서 불렸고 커밋에 실패한 트랜잭션이 있을 때
     */
    @Override
    public void commitAll() {
        List<CactusTransactionWarehouseView.Entry> txs =
                new ArrayList<>(CactusTransactionWarehouseView.currentTransactions());
        if (txs.isEmpty()) {
            log.info("There is nothing to commit.");
            return;
        }
        ExecutionState state = CURRENT.get();
        String[] alwaysCommit = state == null ? null : state.alwaysCommitTransactionManagerNames;

        String failedName = null;
        RuntimeException commitFailure = null;
        List<String> committed = new ArrayList<>();
        List<String> rolledBack = new ArrayList<>();
        Map<String, RuntimeException> rollbackFailures = new LinkedHashMap<>();

        Collections.reverse(txs);
        for (CactusTransactionWarehouseView.Entry tx : txs) {
            if (tx.status().isCompleted()) {
                continue;
            }
            if (isAlwaysCommit(tx.name(), alwaysCommit)) {
                commitAlwaysCommit(tx, committed);
                continue;
            }
            if (commitFailure != null) {
                try {
                    tx.manager().rollback(tx.status());
                    rolledBack.add(tx.name());
                    log.info("Transaction [{}] has been rolled back after commit failure of [{}].", tx.name(), failedName);
                } catch (RuntimeException e) {
                    rollbackFailures.put(tx.name(), e);
                    log.error("Failed to rollback : [{}] {}", tx.name(), e.getMessage(), e);
                }
                continue;
            }
            try {
                tx.manager().commit(tx.status());
                committed.add(tx.name());
                log.info("Transaction [{}] has been committed.", tx.name());
            } catch (RuntimeException e) {
                failedName = tx.name();
                commitFailure = e;
            }
        }
        if (commitFailure == null) {
            return;
        }

        log.error("트랜잭션 커밋 실패 [{}] — 커밋된 트랜잭션 {}{}, 롤백한 트랜잭션 {}, 롤백 실패 {} (txId={}, requestId={}): {}",
                failedName, committed, committed.isEmpty() ? "" : " 은 그대로 반영됐다(일부만 반영)", rolledBack,
                rollbackFailures.keySet(), MDC.get("txId"), MDC.get("requestId"), commitFailure.getMessage(), commitFailure);

        TransactionException failure = new TransactionException(CLIENT_MESSAGE, commitFailure);
        rollbackFailures.values().forEach(failure::addSuppressed);
        if (state == null) {
            throw failure;
        }
        state.failures.add(failure);
    }

    /** 항상 커밋 트랜잭션 — 부모 {@code rollbackAll()} 처럼 커밋하고, 실패는 로그만 남기고 삼킨다. */
    private static void commitAlwaysCommit(CactusTransactionWarehouseView.Entry tx, List<String> committed) {
        try {
            tx.manager().commit(tx.status());
            committed.add(tx.name());
            log.info("Transaction [{}] has been committed.", tx.name());
        } catch (RuntimeException e) {
            log.error("Failed to commit always-commit transaction : [{}] {} (txId={}, requestId={})",
                    tx.name(), e.getMessage(), MDC.get("txId"), MDC.get("requestId"), e);
        }
    }

    private static boolean isAlwaysCommit(String name, String[] alwaysCommitTransactionManagerNames) {
        if (alwaysCommitTransactionManagerNames == null) {
            return false;
        }
        for (String alwaysCommit : alwaysCommitTransactionManagerNames) {
            if (name.equals(alwaysCommit)) {
                return true;
            }
        }
        return false;
    }
}
