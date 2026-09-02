package com.dongkuk.oasis.transaction;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ApplicationContext;
import com.dongkuk.oasis.execution.ParallelExecutionScope;
import org.slf4j.Logger;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.TransactionStatus;
import org.springframework.transaction.support.DefaultTransactionDefinition;

import java.util.*;

import static com.dongkuk.oasis.utils.ArrayUtil.isLeftSubsetOfRight;

/**
 * 트랜젝션의 시작, 커밋, 롤백을 수행할 수 있는 {@link TransactionHandler}의 구현체이다.
 * 이미 시작된 트랜젝션이 있으면 그 트랜젝션에 참여하고, 트랜젝션 격리는 데이터 엑세스 기술 또는 DB 드라이버의 디폴트 설정에 따른다.
 * <p>
 * 스프링 트랜잭션 기술을 사용하고 있으므로 {@link ApplicationContext}에서 {@link PlatformTransactionManager}를
 * 반환할 수 있어야한다.
 *
 * @author Jeongjin Kim
 */
public class SpringTransactionHandler implements TransactionHandler {
    private static final Logger log = org.slf4j.LoggerFactory.getLogger(SpringTransactionHandler.class);
    private final ApplicationContext applicationContext;
    private final String[] transactionManagerNames;

    /**
     * 트랜잭션 핸들러를 생성한다.
     * {@code transactionManagerNames}가 설정이되면 트랜잭션이 최초 시작됐을 때 모든 트랜잭션이 시작된다.
     *
     * @param applicationContext      Application context
     * @param transactionManagerNames transactionManagerNames
     */
    public SpringTransactionHandler(ApplicationContext applicationContext, String[] transactionManagerNames) {
        this.applicationContext = applicationContext;
        this.transactionManagerNames = Arrays.copyOf(transactionManagerNames, transactionManagerNames.length);
    }

    /**
     * @param applicationContext Application context
     */
    public SpringTransactionHandler(ApplicationContext applicationContext) {
        this.applicationContext = applicationContext;
        this.transactionManagerNames = null;
    }

    /**
     * 트랜젝션 이름을 파라미터로 받아 해당 트랜젝션을 시작한다. 완료되지 않은 트랜젝션이 있는 경우는 무시한다.
     *
     * @param transactionManagerName 트랜젝션명
     * @throws TransactionException 트랜젝션 예외
     */
    @Override
    public void startTransaction(String transactionManagerName) throws TransactionException {
        assertTransactionsAllowedInParallel("start");

        if (transactionManagerName == null) {
            throw new NullPointerException("transactionManagerName is null.");
        }

        if (!ThreadLocalTransactionWarehouseHolder.canStart())
            throw new TransactionException("Begin transaction first.");

        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouse
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        if (txWarehouse == null) {
            txWarehouse = new DefaultTransactionManagerWarehouse<>();
        }

        TransactionStatus status = txWarehouse.transactionStatus(transactionManagerName);

        if (status != null && !status.isCompleted()) {
            log.info("Transaction [{}}] is in progress.", transactionManagerName);
            return;
        }

        PlatformTransactionManager platformTransactionManager =
                txWarehouse.transactionManager(transactionManagerName);
        if (platformTransactionManager == null) {
            TypedObject tx = applicationContext.get(transactionManagerName);
            if (tx == null)
                throw new IllegalStateException(
                        String.format(
                                "The specified TransactionManager [%s] cannot be found in the ApplicationContext.",
                                transactionManagerName));

            platformTransactionManager = tx.getObject(PlatformTransactionManager.class);
        }

        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setName(transactionManagerName);
        def.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRED);

        status = platformTransactionManager.getTransaction(def);
        log.info("Transaction [{}] started.", transactionManagerName);

        txWarehouse.putTransactionManagerAndStatus(
                new TransactionManagerAndStatus<>(transactionManagerName, platformTransactionManager, status));
        ThreadLocalTransactionWarehouseHolder.setWarehouse(txWarehouse);
    }

    @Override
    public void commitAndRestartTransaction(String transactionManagerName) throws TransactionException {
        assertTransactionsAllowedInParallel("commit/restart");
        commitOrRollbackTemplate(transactionManagerName, PlatformTransactionManager::commit);
        log.info("Transaction [{}] has been committed.", transactionManagerName);
        startTransaction(transactionManagerName);
        log.info("Transaction [{}] is restarted.", transactionManagerName);

    }

    @Override
    public void commitAll() {
        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouse
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        if (txWarehouse == null) {
            log.info("There is nothing to commit.");
            return;
        }

        Map<String, Throwable> failedTransactions = new HashMap<>();
        List<TransactionManagerAndStatus<PlatformTransactionManager, TransactionStatus>> txs
                = txWarehouse.transactionManagerAndStatusList();

        Collections.reverse(txs);
        for (TransactionManagerAndStatus<PlatformTransactionManager, TransactionStatus> tx : txs) {

            if (!tx.getTransactionStatus().isCompleted()) {
                try {
                    tx.getTransactionManager().commit(tx.getTransactionStatus());
                    log.info("Transaction [{}] has been committed.", tx.getTransactionManagerName());
                } catch (org.springframework.transaction.TransactionException e) {
                    failedTransactions.put(tx.getTransactionManagerName(), e);
                }
            }
        }

        for (Map.Entry<String, Throwable> failedTx : failedTransactions.entrySet()) {
            log.error("Failed to commit : [" + failedTx.getKey() + "] " + failedTx.getValue().getMessage());
        }
    }

    @Override
    public void rollbackAll(String[] alwaysCommitTransactionManagerNames) throws TransactionException {
        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouse
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        if (txWarehouse == null) {
            log.info("There is nothing to rollback.");
            return;
        }

        Map<String, Throwable> rollbackFailedTransactions = new HashMap<>();
        Map<String, Throwable> commitFailedTransactions = new HashMap<>();

        List<TransactionManagerAndStatus<PlatformTransactionManager, TransactionStatus>> txs
                = txWarehouse.transactionManagerAndStatusList();
        Collections.reverse(txs);

        for (TransactionManagerAndStatus<PlatformTransactionManager, TransactionStatus> tx : txs) {
            if (!tx.getTransactionStatus().isCompleted()) {
                if (shouldCommit(tx.getTransactionManagerName(), alwaysCommitTransactionManagerNames)) {
                    try {
                        tx.getTransactionManager().commit(tx.getTransactionStatus());
                        log.info("Transaction [{}] has been committed.", tx.getTransactionManagerName());
                    } catch (org.springframework.transaction.TransactionException e) {
                        commitFailedTransactions.put(tx.getTransactionManagerName(), e);
                    }
                } else {
                    try {
                        tx.getTransactionManager().rollback(tx.getTransactionStatus());
                        log.info("Transaction [{}] has been rolled back.", tx.getTransactionManagerName());
                    } catch (org.springframework.transaction.TransactionException e) {
                        rollbackFailedTransactions.put(tx.getTransactionManagerName(), e);
                    }
                }
            }
        }

        for (Map.Entry<String, Throwable> failedTx : rollbackFailedTransactions.entrySet()) {
            log.error("Failed to rollback : [{}] " + failedTx.getValue().getMessage(), failedTx.getKey());
        }

        for (Map.Entry<String, Throwable> failedTx : commitFailedTransactions.entrySet()) {
            log.error("Failed to commit : [{}] " + failedTx.getValue().getMessage(), failedTx.getKey());
        }
    }

    private boolean shouldCommit(String transactionManagerName,
                                 String[] alwaysCommitTransactionManagerNames) {
        if (alwaysCommitTransactionManagerNames == null)
            return false;

        for (String alwaysCommitTransactionManagerName : alwaysCommitTransactionManagerNames) {
            if (transactionManagerName.equals(alwaysCommitTransactionManagerName))
                return true;
        }
        return false;
    }

    @Override
    public void execute(Process process,
                        String[] transactionManagerNames,
                        String[] alwaysCommitTransactionManagerNames) {
        boolean parallelExecution = ParallelExecutionScope.isActive();
        if (parallelExecution && transactionManagerNames != null && transactionManagerNames.length > 0) {
            throw new TransactionException("Parallel execution does not allow explicit transaction handling.");
        }

        ThreadLocalTransactionWarehouseHolder.begin();

        boolean isException = false;

        if (transactionManagerNames != null
                && transactionManagerNames.length > 0) {
            if (this.transactionManagerNames == null)
                throw new IllegalStateException("transactionManagerNames is not defined. " +
                        "If transactionManagerNames are not specified when creating a TransactionHandler, " +
                        "an exception will occur.");

            if (!isLeftSubsetOfRight(transactionManagerNames, this.transactionManagerNames))
                throw new IllegalArgumentException("You specified a transaction manager " +
                        "that is not in the application-level transaction manager. " +
                        "Check the list of transaction manager names declared in the process.");

            for (String transactionManagerName : transactionManagerNames) {
                startTransaction(transactionManagerName);
            }
        } else if (this.transactionManagerNames != null && !parallelExecution) {
            for (String transactionManagerName : this.transactionManagerNames) {
                startTransaction(transactionManagerName);
            }
        } else if (this.transactionManagerNames != null) {
            log.info("Skipping default transaction start during parallel execution.");
        }

        try {
            process.process();
        } catch (Exception | Error e) {
            isException = true;
            try {
                rollbackAll(alwaysCommitTransactionManagerNames);
            } catch (Exception ex) {
                log.error(ex.getMessage(), ex);
            }
            throw e;

        } finally {
            if (!isException)
                commitAll();
            ThreadLocalTransactionWarehouseHolder.end();
        }
    }

    @Override
    public void rollbackAndRestartTransaction(String transactionManagerName) throws TransactionException {
        assertTransactionsAllowedInParallel("rollback/restart");
        commitOrRollbackTemplate(transactionManagerName, PlatformTransactionManager::rollback);
        log.info("Transaction [{}] has been rolled back.", transactionManagerName);
        startTransaction(transactionManagerName);
        log.info("Transaction [{}] is restarted.", transactionManagerName);
    }

    private void commitOrRollbackTemplate(String transactionName, CompleteTransaction completeTransaction) {
        TransactionManagerWarehouse<PlatformTransactionManager, TransactionStatus> txWarehouse
                = ThreadLocalTransactionWarehouseHolder.getWarehouse();
        if (txWarehouse == null) {
            throw new TransactionException("There is no transaction holder");
        }

        TransactionStatus status = txWarehouse.transactionStatus(transactionName);

        if (status == null) {
            throw new TransactionException("There is no transaction in progress");
        }
        if (status.isCompleted()) {
            throw new TransactionException("The transaction has already been completed.");
        }

        PlatformTransactionManager platformTransactionManager
                = txWarehouse.transactionManager(transactionName);
        if (platformTransactionManager == null) {
            throw new TransactionException("No transaction in progress");
        }

        completeTransaction.complete(platformTransactionManager, status);
    }

    private interface CompleteTransaction {
        void complete(PlatformTransactionManager manager, TransactionStatus status);
    }

    private void assertTransactionsAllowedInParallel(String action) {
        if (ParallelExecutionScope.isActive()) {
            throw new TransactionException(
                    String.format("Transaction %s is not allowed during parallel execution.", action));
        }
    }

}
