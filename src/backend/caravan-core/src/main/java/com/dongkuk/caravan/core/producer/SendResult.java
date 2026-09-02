package com.dongkuk.caravan.core.producer;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;
import org.apache.kafka.clients.producer.RecordMetadata;

/**
 * Kafka 전송 결과 DTO
 *
 * <p>Kafka 메시지 전송 결과를 담는 객체입니다.</p>
 *
 * <h3>포함 정보</h3>
 * <ul>
 *   <li>{@code success}: 전송 성공 여부</li>
 *   <li>{@code topic}: 전송된 토픽명</li>
 *   <li>{@code partition}: 저장된 파티션 번호</li>
 *   <li>{@code offset}: 메시지의 Offset</li>
 *   <li>{@code timestamp}: 메시지 타임스탬프</li>
 *   <li>{@code kafkaKeyData}: 메시지 1건당 UUID (메시지 본문 KAFKA_KEYDATA 와 동일 값. v4 결정 #12)</li>
 *   <li>{@code errorMessage}: 에러 메시지 (실패 시)</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * SendResult result = producer.send("my-topic", "message");
 * if (result.isSuccess()) {
 *     log.info("전송 성공 - partition: {}, offset: {}", result.getPartition(), result.getOffset());
 * } else {
 *     log.error("전송 실패 - {}", result.getErrorMessage());
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.producer.KafkaMessageProducer
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SendResult {
    /** 성공 여부 */
    private boolean success;
    /** 토픽명 */
    private String topic;
    /** 파티션 */
    private int partition;
    /** Offset */
    private long offset;
    /** 타임스탬프 */
    private long timestamp;
    /**
     * 메시지 1건당 UUID — 메시지 본문 {@code KAFKA_KEYDATA} 필드와 동일 값 (v4 결정 #12).
     * HTTP 호출자가 본 값으로 메시지 상태 추적 / 멱등 처리 가능.
     */
    private String kafkaKeyData;
    /** 에러 메시지 (실패 시) */
    private String errorMessage;

    /**
     * 성공 결과를 생성합니다 (kafkaKeyData 포함).
     *
     * @param metadata     Kafka 전송 메타데이터
     * @param kafkaKeyData 메시지 1건당 UUID (메시지 본문 KAFKA_KEYDATA 와 동일)
     * @return 성공 결과 ({@code success=true})
     */
    public static SendResult success(RecordMetadata metadata, String kafkaKeyData) {
        return SendResult.builder()
            .success(true)
            .topic(metadata.topic())
            .partition(metadata.partition())
            .offset(metadata.offset())
            .timestamp(metadata.timestamp())
            .kafkaKeyData(kafkaKeyData)
            .build();
    }

    /**
     * 성공 결과를 생성합니다 (kafkaKeyData 없음 — backward compatible).
     *
     * <p>신규 호출은 {@link #success(RecordMetadata, String)} 를 사용해 kafkaKeyData 를 명시 전달하세요.</p>
     *
     * @param metadata Kafka 전송 메타데이터
     * @return 성공 결과 ({@code success=true}, kafkaKeyData=null)
     */
    public static SendResult success(RecordMetadata metadata) {
        return success(metadata, null);
    }

    /**
     * 실패 결과를 생성합니다.
     *
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code success=false})
     */
    public static SendResult fail(String errorMessage) {
        return SendResult.builder()
            .success(false)
            .errorMessage(errorMessage)
            .build();
    }
}
