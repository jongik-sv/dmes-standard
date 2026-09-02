package com.dongkuk.oasis.transaction;

/**
 * 트랜잭션을 관리하지 않는 트랜잭션 핸들러. 프로세스의 시작과 종료처리만 수행한다.
 *
 * @author Jeongjin Kim
 * @since 2021-08-05
 */
public class NonTransactionHandler implements TransactionHandler {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(NonTransactionHandler.class);

    @Override
    public void startTransaction(String transactionManagerName) throws TransactionException {
        log.debug("Transaction is not managed.");
    }

    @Override
    public void commitAndRestartTransaction(String transactionManagerName) throws TransactionException {
        log.debug("Transaction is not managed.");
    }

    @Override
    public void rollbackAndRestartTransaction(String transactionManagerName) throws TransactionException {
        log.debug("Transaction is not managed.");
    }

    @Override
    public void commitAll() throws TransactionException {
        log.debug("Transaction is not managed.");
    }

    @Override
    public void rollbackAll(String[] alwaysCommitTransactionManagerNames) throws TransactionException {
        log.debug("Transaction is not managed.");
    }

    @Override
    public void execute(Process process, String[] transactionManagerNames,
                        String[] alwaysCommitTransactionManagerNames) {
        process.process();
    }
}
