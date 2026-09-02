package com.dongkuk.caravan.core.exception;

/**
 * Kafka 메시지 수신 예외
 *
 * <p>Kafka Consumer가 메시지 처리에 실패했을 때 발생하는 예외입니다.</p>
 *
 * <h3>발생 상황</h3>
 * <ul>
 *   <li>메시지 파싱 실패</li>
 *   <li>핸들러 실행 중 예외 발생</li>
 *   <li>비즈니스 로직 처리 실패</li>
 * </ul>
 *
 * <h3>추적 정보</h3>
 * <p>예외에는 다음 정보가 포함되어 디버깅에 활용할 수 있습니다:</p>
 * <ul>
 *   <li>{@code transactionCode}: 처리 중이던 트랜잭션 코드</li>
 *   <li>{@code offset}: 실패한 메시지의 Kafka Offset</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.consumer.KafkaMessageConsumer
 */
public class KafkaConsumeException extends RuntimeException {

    /** 트랜잭션 코드 */
    private final String transactionCode;

    /** 메시지 Offset */
    private final long offset;

    /**
     * 메시지, 트랜잭션 코드, Offset으로 예외를 생성합니다.
     *
     * @param message         예외 메시지
     * @param transactionCode 트랜잭션 코드
     * @param offset          메시지 Offset
     */
    public KafkaConsumeException(String message, String transactionCode, long offset) {
        super(message);
        this.transactionCode = transactionCode;
        this.offset = offset;
    }

    /**
     * 메시지, 원인 예외, 트랜잭션 코드, Offset으로 예외를 생성합니다.
     *
     * @param message         예외 메시지
     * @param cause           원인 예외
     * @param transactionCode 트랜잭션 코드
     * @param offset          메시지 Offset
     */
    public KafkaConsumeException(String message, Throwable cause, String transactionCode, long offset) {
        super(message, cause);
        this.transactionCode = transactionCode;
        this.offset = offset;
    }

    /**
     * 트랜잭션 코드를 반환합니다.
     *
     * @return 트랜잭션 코드
     */
    public String getTransactionCode() {
        return transactionCode;
    }

    /**
     * 메시지 Offset을 반환합니다.
     *
     * @return 메시지 Offset
     */
    public long getOffset() {
        return offset;
    }
}
