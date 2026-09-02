package com.dongkuk.oasis.transaction;

/**
 * Transaction 의 Start, Commit, Rollback 기능을 수행한다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-21
 */
public interface TransactionHandler {
    /**
     * 트랜잭션을 시작한다.
     *
     * @param transactionManagerName 트랜잭션 관리자 이름
     * @throws TransactionException 예외
     */
    void startTransaction(String transactionManagerName) throws TransactionException;

    /**
     * 트랜잭션을 커밋한다.
     *
     * @param transactionManagerName 트랜잭션 관리자 이름
     * @throws TransactionException 예외
     */
    void commitAndRestartTransaction(String transactionManagerName) throws TransactionException;

    /**
     * 트랜잭션을 롤백한다.
     *
     * @param transactionManagerName 트랜잭션 관리자 이름
     * @throws TransactionException 예외
     */
    void rollbackAndRestartTransaction(String transactionManagerName) throws TransactionException;

    /**
     * 모튼 트랜잭션을 커밋한다.
     *
     * @throws TransactionException 예외
     */
    void commitAll() throws TransactionException;

    /**
     * 모튼 트랜잭션을 롤백한다.
     * <p>
     * 단, {@code alwaysCommitTransactionManagerNames} 에 설정한 트랜잭션은 커밋한다.
     *
     * @param alwaysCommitTransactionManagerNames 롤백하지 않을 트랜잭션 매니저, nullable
     * @throws TransactionException 예외
     */
    void rollbackAll(String[] alwaysCommitTransactionManagerNames) throws TransactionException;

    /**
     * {@link Process} 를 실행하기 전에 트랜잭션을 시작하고 실행이 종료되면 트랜잭션을 닫는다.
     * <p>
     * {@code transactionManagerNames} 이 지정되면 지정된 트랜잭션만 시작하고 지정하지 않으면 트랜잭션 핸들러에 설정된 모든 커넥션을 시작한다.
     * 만약 {@code transactionManagerNames}에 트랜잭션 핸들러에 정의되지 않은 트랜잭션 핸들러가 포함되면 {@link IllegalArgumentException}
     * 이 발생한다.
     * <p>
     * {@code transactionManagerNames}는 {@link com.dongkuk.oasis.model.Process} 의 속성으로 정의한다.
     * <p>
     * {@link Process} 실행 중에 예외가 발생하면 시작한 모든 트랜잭션을 {@code Rollback} 하고 성공하면 {@code Commit} 한다.
     * 단 {@code alwaysCommitTransactionManagerNames}에 지정한 트랜잭션 매니저는 항상 {@code Commit} 한다.
     *
     * @param process                             처리기
     * @param transactionManagerNames             트랜잭션 매니저 이름, nullable
     * @param alwaysCommitTransactionManagerNames 항상 커밋할 트랜잭션 매니저 이름, nullable
     */
    void execute(Process process, String[] transactionManagerNames, String[] alwaysCommitTransactionManagerNames);

    /**
     * 프로세스.
     */
    interface Process {
        /**
         * 프로세스.
         */
        void process();
    }
}
