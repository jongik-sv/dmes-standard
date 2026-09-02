package com.dongkuk.caravan.core.producer;

import com.dongkuk.caravan.core.exception.KafkaSendException;

/**
 * 비동기 전송 콜백 인터페이스
 *
 * <p>{@link com.dongkuk.caravan.core.producer.KafkaMessageProducer#sendAsync} 메서드에서
 * 전송 결과를 비동기로 받기 위한 콜백 인터페이스입니다.</p>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * producer.sendAsync("my-topic", "message", new ProducerCallback() {
 *     @Override
 *     public void onSuccess(SendResult result) {
 *         log.info("전송 성공 - offset: {}", result.getOffset());
 *     }
 *
 *     @Override
 *     public void onFailure(KafkaSendException exception) {
 *         log.error("전송 실패 - {}", exception.getMessage());
 *     }
 * });
 * }</pre>
 *
 * <h3>Lambda 사용 (익명 클래스 대신)</h3>
 * <p>Java 8 이상에서는 익명 클래스로 구현해야 합니다 (함수형 인터페이스가 아님).</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.producer.KafkaMessageProducer#sendAsync
 */
public interface ProducerCallback {

    /**
     * 메시지 전송 성공 시 호출됩니다.
     *
     * @param result 전송 결과 (offset, partition 등 포함)
     */
    void onSuccess(SendResult result);

    /**
     * 메시지 전송 실패 시 호출됩니다.
     *
     * @param exception 발생한 예외
     */
    void onFailure(KafkaSendException exception);
}
