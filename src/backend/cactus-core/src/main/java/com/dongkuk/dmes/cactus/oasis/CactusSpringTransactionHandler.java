package com.dongkuk.dmes.cactus.oasis;

import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.transaction.CactusTransactionWarehouseView;
import com.dongkuk.oasis.transaction.SpringTransactionHandler;
import com.dongkuk.oasis.transaction.TransactionException;
import com.dongkuk.oasis.transaction.TransactionHandler;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * 커밋 실패를 삼키지 않는 OASIS 트랜잭션 핸들러 (refactor/framework-tx 3b, 2026-10-04).
 *
 * <p>oasis {@link SpringTransactionHandler} 의 결함 두 가지를 cactus 층에서 막는다(oasis 소스는 고치지 않는다).
 * <ol>
 *   <li><b>커밋 실패 삼킴</b> — 부모 {@code commitAll()} 은 커밋 중 Spring {@code TransactionException}
 *       ({@code UnexpectedRollbackException} 등)을 잡아 로그만 남긴다. 업무 작업이 리포지토리 안 예외를 잡고 계속하면
 *       트랜잭션이 rollback-only 로 표시돼 실제로는 롤백됐는데 서비스는 SUCCESS 로 끝났다.</li>
 *   <li><b>스레드 상태 누수</b> — 커밋 시점 flush 의 {@code DataAccessException} 처럼 Spring
 *       {@code TransactionException} 이 아닌 예외는 부모 {@code commitAll()} 밖으로 새어 나가 남은 트랜잭션을
 *       커밋도 롤백도 하지 않고, 부모 {@code execute()} finally 의 {@code ThreadLocalTransactionWarehouseHolder.end()}
 *       까지 건너뛰었다. 풀 스레드에 이전 요청의 보관소와 묶인 연결이 남는다.</li>
 * </ol>
 *
 * <p>{@link #commitAll()} 은 남은 트랜잭션을 끝까지 커밋하며 실패({@code RuntimeException} 전부)를 모아 두기만 하고
 * 던지지 않는다. 그래서 부모 {@code execute()} finally 의 {@code end()} 가 반드시 돈다.
 * {@link #execute} 는 부모가 정상으로 돌아온 뒤 모인 실패를 하나의 oasis {@link TransactionException}
 * (첫 실패가 원인, 나머지는 suppressed)으로 던진다. {@code CoreServiceStarter} 가 이를 받아 SYSTEM_ERROR 로 바꾸고,
 * {@code CactusResponseConverter} 가 응답 코드 {@code S001} 로 내보낸다.
 *
 * <p>여러 트랜잭션 매니저 중 일부만 커밋에 실패하면 나머지는 커밋된 채로 남는다(부분 반영). 메시지에 실패·커밋된
 * 트랜잭션 이름을 함께 적는다.
 *
 * <p>바꾸지 않는 경로 — 트랜잭션 시작, 처리 중 예외 때의 {@code rollbackAll}(항상 커밋 {@code alwaysCommit} 포함),
 * 중간 커밋·롤백 후 재시작, 병렬 실행({@code ParallelExecutionScope}) 판정은 모두 부모 그대로다.
 *
 * <p>실패 목록은 스레드별({@link ThreadLocal})이고 {@link #execute} 가 끝날 때 이전 값으로 되돌린다(없으면 지운다).
 * 핸들러 인스턴스 하나를 여러 요청 스레드가 함께 써도 된다.
 */
public class CactusSpringTransactionHandler extends SpringTransactionHandler {

    private static final Logger log = LoggerFactory.getLogger(CactusSpringTransactionHandler.class);

    /** 진행 중인 {@link #execute} 한 번 동안 {@link #commitAll()} 이 모은 커밋 실패. execute 밖이면 null. */
    private static final ThreadLocal<List<TransactionException>> PENDING_FAILURES = new ThreadLocal<>();

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
        List<TransactionException> previous = PENDING_FAILURES.get();
        List<TransactionException> failures = new ArrayList<>();
        PENDING_FAILURES.set(failures);
        try {
            super.execute(process, transactionManagerNames, alwaysCommitTransactionManagerNames);
        } finally {
            if (previous == null) {
                PENDING_FAILURES.remove();
            } else {
                PENDING_FAILURES.set(previous);
            }
        }

        if (!failures.isEmpty()) {
            TransactionException first = failures.get(0);
            for (int i = 1; i < failures.size(); i++) {
                first.addSuppressed(failures.get(i));
            }
            throw first;
        }
    }

    /**
     * 시작 역순으로 끝나지 않은 트랜잭션을 모두 커밋한다. 하나가 실패해도 나머지 커밋을 끝까지 시도한다.
     *
     * <p>{@link #execute} 안에서 불리면 실패를 모아 두고 정상 반환한다 — 부모 execute 의 finally 가
     * 스레드 상태를 정리한 뒤 {@link #execute} 가 던진다. execute 밖에서 직접 불리면 끝까지 시도한 뒤 바로 던진다.
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

        Map<String, RuntimeException> failed = new LinkedHashMap<>();
        List<String> committed = new ArrayList<>();
        Collections.reverse(txs);
        for (CactusTransactionWarehouseView.Entry tx : txs) {
            if (tx.status().isCompleted()) {
                continue;
            }
            try {
                tx.manager().commit(tx.status());
                committed.add(tx.name());
                log.info("Transaction [{}] has been committed.", tx.name());
            } catch (RuntimeException e) {
                failed.put(tx.name(), e);
                log.error("Failed to commit : [{}] {}", tx.name(), e.getMessage());
            }
        }
        if (failed.isEmpty()) {
            return;
        }

        TransactionException failure = commitFailure(failed, committed);
        List<TransactionException> pending = PENDING_FAILURES.get();
        if (pending == null) {
            throw failure;
        }
        pending.add(failure);
    }

    /** 실패한 트랜잭션들을 하나의 예외로 묶는다 — 첫 실패가 원인, 나머지는 suppressed. */
    private static TransactionException commitFailure(Map<String, RuntimeException> failed, List<String> committed) {
        Iterator<RuntimeException> causes = failed.values().iterator();
        RuntimeException first = causes.next();

        StringBuilder message = new StringBuilder("트랜잭션 커밋 실패 ").append(failed.keySet());
        if (!committed.isEmpty()) {
            message.append(" — 커밋된 트랜잭션 ").append(committed).append(" 은 그대로 반영됐다(일부만 반영)");
        }
        message.append(": ").append(first.getMessage());

        TransactionException failure = new TransactionException(message.toString(), first);
        causes.forEachRemaining(failure::addSuppressed);
        return failure;
    }
}
