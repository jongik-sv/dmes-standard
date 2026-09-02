package com.dongkuk.caravan.core.exception;

/**
 * Kafka 메시지 송신 예외
 *
 * <p>Kafka Producer가 메시지 전송에 실패했을 때 발생하는 예외입니다.</p>
 *
 * <h3>발생 상황</h3>
 * <ul>
 *   <li>브로커 연결 실패</li>
 *   <li>전송 타임아웃</li>
 *   <li>직렬화 오류</li>
 *   <li>인증/인가 오류</li>
 *   <li>토픽 미존재</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.producer.KafkaMessageProducer
 */
public class KafkaSendException extends RuntimeException {

    /**
     * 메시지만으로 예외를 생성합니다.
     *
     * @param message 예외 메시지
     */
    public KafkaSendException(String message) {
        super(message);
    }

    /**
     * 메시지와 원인 예외로 예외를 생성합니다.
     *
     * @param message 예외 메시지
     * @param cause   원인 예외
     */
    public KafkaSendException(String message, Throwable cause) {
        super(message, cause);
    }
}
