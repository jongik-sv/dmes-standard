package com.dongkuk.caravan.core.producer;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.exception.KafkaSendException;
import com.dongkuk.caravan.core.model.KafkaMessage;
import com.dongkuk.caravan.core.repository.KafkaErrorRepository;
import com.dongkuk.caravan.core.util.JsonUtil;
import com.dongkuk.caravan.core.util.KafkaConstants;
import lombok.RequiredArgsConstructor;
import org.apache.kafka.clients.producer.RecordMetadata;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.kafka.core.KafkaTemplate;
import org.springframework.kafka.support.SendResult;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Kafka 메시지 Producer 서비스
 *
 * <p>Kafka 토픽으로 표준 메시지 포맷의 메시지를 전송하는 기능을 제공합니다.
 * 모든 전송 메서드는 아래 표준 JSON 포맷으로 메시지를 자동 구성합니다.</p>
 *
 * <h3>표준 메시지 포맷</h3>
 * <pre>{@code
 * {
 *     "TRANSACTION_CODE": "PQR02012",
 *     "KAFKA_KEYDATA": "840d4999-196b-4740-a370-bc5eed4b30ae",  // 자동 UUID
 *     "INTERFACE_ID": "MMPPMERPTT01",                           // = 토픽명
 *     "INTERFACE_MSG": "PQR02012|P|S|5A|20260130111245|...",
 *     "INTERFACE_PROTOCOL": "IF_KAFKA"                          // 고정값
 * }
 * }</pre>
 *
 * <h3>자동 생성 필드</h3>
 * <ul>
 *   <li>{@code KAFKA_KEYDATA}: 매 전송마다 랜덤 UUID 자동 생성</li>
 *   <li>{@code INTERFACE_ID}: 토픽명과 동일하게 자동 설정</li>
 *   <li>{@code INTERFACE_PROTOCOL}: "IF_KAFKA" 고정</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * @Service
 * public class MyService {
 *     private final KafkaMessageProducer producer;
 *
 *     public void sendMessage() {
 *         // 간단 동기 전송
 *         SendResult result = producer.send("MMPPMERPTT01", "PQR02012",
 *             "PQR02012|P|S|5A|20260130111245|JCM_TEST|MMPPMERPTT01|||||20250808|00011|C|");
 *
 *         // KafkaMessage 객체로 전체 필드 전송
 *         KafkaMessage msg = KafkaMessage.builder()
 *             .transactionCode("PQR02012")
 *             .interfaceMsg("PQR02012|P|S|5A|...")
 *             .build();
 *         SendResult result2 = producer.send("MMPPMERPTT01", msg);
 *     }
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaMessage
 * @see SendResult
 * @see ProducerCallback
 */
@Service
@RequiredArgsConstructor
public class KafkaMessageProducer {

    private static final Logger log = LoggerFactory.getLogger(KafkaMessageProducer.class);

    private final KafkaTemplate<String, String> kafkaTemplate;
    private final CaravanProperties properties;
    private final KafkaErrorRepository errorRepository;

    /**
     * 메시지를 동기 방식으로 전송합니다. (간단 버전)
     *
     * <p>TRANSACTION_CODE와 INTERFACE_MSG만으로 표준 포맷 메시지를 구성하여 전송합니다.
     * KEY_DATA1~3, JCM_KEYDATA는 빈 문자열로 설정됩니다.</p>
     *
     * @param topic           전송할 Kafka 토픽명 (= INTERFACE_ID)
     * @param transactionCode 트랜잭션 코드 (예: "PQR02012")
     * @param interfaceMsg    파이프(|) 구분자 메시지 (예: "PQR02012|P|S|5A|...")
     * @return 전송 결과를 담은 {@link com.dongkuk.caravan.core.producer.SendResult} 객체
     * @throws KafkaSendException 전송 실패, 타임아웃, 인터럽트 발생 시
     * @see #send(String, KafkaMessage)
     */
    public com.dongkuk.caravan.core.producer.SendResult send(String topic, String transactionCode, String interfaceMsg) {
        KafkaMessage message = KafkaMessage.builder()
            .transactionCode(transactionCode)
            .interfaceMsg(interfaceMsg)
            .build();
        return send(topic, message);
    }

    /**
     * KafkaMessage 객체를 사용하여 메시지를 동기 방식으로 전송합니다.
     *
     * <p>KafkaMessage의 모든 필드를 표준 JSON 포맷으로 변환하여 전송합니다.
     * KAFKA_KEYDATA(UUID), INTERFACE_ID(토픽명), INTERFACE_PROTOCOL("IF_KAFKA")은
     * 자동으로 설정됩니다.</p>
     *
     * <h4>타임아웃</h4>
     * <p>타임아웃은 {@code caravan.kafka.producer.timeout-seconds} 설정값을 사용하며,
     * 기본값은 10초입니다.</p>
     *
     * @param topic   전송할 Kafka 토픽명 (= INTERFACE_ID)
     * @param message 전송할 메시지 정보
     * @return 전송 결과를 담은 {@link com.dongkuk.caravan.core.producer.SendResult} 객체
     *         <ul>
     *           <li>{@code success}: 전송 성공 여부</li>
     *           <li>{@code topic}: 전송된 토픽명</li>
     *           <li>{@code partition}: 전송된 파티션 번호</li>
     *           <li>{@code offset}: 메시지가 저장된 오프셋</li>
     *           <li>{@code timestamp}: 메시지 타임스탬프</li>
     *         </ul>
     * @throws KafkaSendException 전송 실패 시 발생
     */
    public com.dongkuk.caravan.core.producer.SendResult send(String topic, KafkaMessage message) {
        // v4 결정 #12 — UUID 를 send() 단계에서 생성하여 메시지 본문 KAFKA_KEYDATA 와 SendResult 양쪽에 동일 값 노출
        String kafkaKeyData = UUID.randomUUID().toString();
        String jsonMessage = buildMessageJson(topic, message, kafkaKeyData);
        String transactionCode = message.getTransactionCode();

        try {
            CompletableFuture<SendResult<String, String>> future =
                kafkaTemplate.send(topic, jsonMessage);

            SendResult<String, String> result = future.get(
                properties.getProducer().getTimeoutSeconds(),
                TimeUnit.SECONDS
            );

            RecordMetadata metadata = result.getRecordMetadata();
            log.info("Kafka 전송 성공 - topic: {}, partition: {}, offset: {}, kafkaKeyData: {}",
                metadata.topic(), metadata.partition(), metadata.offset(), kafkaKeyData);

            return com.dongkuk.caravan.core.producer.SendResult.success(metadata, kafkaKeyData);

        } catch (TimeoutException e) {
            logError(topic, transactionCode, jsonMessage, "TIMEOUT", e.getMessage());
            throw new KafkaSendException("전송 타임아웃", e);
        } catch (ExecutionException e) {
            Throwable cause = e.getCause();
            String errorCode = cause != null ? cause.getClass().getSimpleName() : "UNKNOWN";
            String errorMsg = cause != null ? cause.getMessage() : e.getMessage();
            logError(topic, transactionCode, jsonMessage, errorCode, errorMsg);
            throw new KafkaSendException("전송 실패: " + errorCode, e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            logError(topic, transactionCode, jsonMessage, "INTERRUPTED", e.getMessage());
            throw new KafkaSendException("전송 인터럽트", e);
        }
    }

    /**
     * 메시지를 비동기 방식으로 전송합니다. (간단 버전)
     *
     * <p>TRANSACTION_CODE와 INTERFACE_MSG만으로 표준 포맷 메시지를 구성하여 비동기 전송합니다.</p>
     *
     * @param topic           전송할 Kafka 토픽명 (= INTERFACE_ID)
     * @param transactionCode 트랜잭션 코드 (예: "PQR02012")
     * @param interfaceMsg    파이프(|) 구분자 메시지
     * @param callback        전송 완료 시 호출될 콜백 (null 가능)
     * @see #sendAsync(String, KafkaMessage, ProducerCallback)
     */
    public void sendAsync(String topic, String transactionCode, String interfaceMsg, ProducerCallback callback) {
        KafkaMessage message = KafkaMessage.builder()
            .transactionCode(transactionCode)
            .interfaceMsg(interfaceMsg)
            .build();
        sendAsync(topic, message, callback);
    }

    /**
     * KafkaMessage 객체를 사용하여 메시지를 비동기 방식으로 전송합니다.
     *
     * <p>비동기 전송의 특징:</p>
     * <ul>
     *   <li>전송 요청 후 즉시 반환 (Non-blocking)</li>
     *   <li>전송 결과는 콜백의 {@code onSuccess} 또는 {@code onFailure}로 전달</li>
     *   <li>전송 실패 시에도 에러 로그가 DB에 기록됨</li>
     * </ul>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * KafkaMessage msg = KafkaMessage.builder()
     *     .transactionCode("PQR02012")
     *     .interfaceMsg("PQR02012|P|S|5A|...")
     *     .jcmKeyData("ERROR_TEST")
     *     .build();
     *
     * producer.sendAsync("MMPPMERPTT01", msg, new ProducerCallback() {
     *     public void onSuccess(SendResult result) {
     *         log.info("전송 성공: offset={}", result.getOffset());
     *     }
     *     public void onFailure(KafkaSendException exception) {
     *         log.error("전송 실패: {}", exception.getMessage());
     *     }
     * });
     * }</pre>
     *
     * @param topic    전송할 Kafka 토픽명 (= INTERFACE_ID)
     * @param message  전송할 메시지 정보
     * @param callback 전송 완료 시 호출될 콜백 (null 가능)
     */
    public void sendAsync(String topic, KafkaMessage message, ProducerCallback callback) {
        // v4 결정 #12 — UUID 를 sendAsync() 단계에서 생성하여 메시지 본문 KAFKA_KEYDATA 와 SendResult 양쪽에 동일 값 노출
        String kafkaKeyData = UUID.randomUUID().toString();
        String jsonMessage = buildMessageJson(topic, message, kafkaKeyData);
        String transactionCode = message.getTransactionCode();

        kafkaTemplate.send(topic, jsonMessage)
            .whenComplete((result, ex) -> {
                if (ex == null) {
                    if (callback != null) {
                        callback.onSuccess(com.dongkuk.caravan.core.producer.SendResult.success(result.getRecordMetadata(), kafkaKeyData));
                    }
                } else {
                    logError(topic, transactionCode, jsonMessage, ex.getClass().getSimpleName(), ex.getMessage());
                    if (callback != null) {
                        callback.onFailure(new KafkaSendException("전송 실패", ex));
                    }
                }
            });
    }

    /**
     * 표준 메시지 JSON을 구성합니다.
     *
     * <p>KafkaMessage의 비즈니스 필드와 자동 생성 필드를 조합하여
     * 표준 JSON 포맷의 메시지를 생성합니다.</p>
     *
     * <h4>자동 생성 필드</h4>
     * <ul>
     *   <li>{@code KAFKA_KEYDATA}: 호출자({@link #send} / {@link #sendAsync}) 가 생성한 UUID — SendResult 와 동일 값 (v4 결정 #12)</li>
     *   <li>{@code INTERFACE_ID}: 토픽명과 동일</li>
     *   <li>{@code INTERFACE_PROTOCOL}: "IF_KAFKA" 고정</li>
     * </ul>
     *
     * @param topic        토픽명 (= INTERFACE_ID)
     * @param message      비즈니스 메시지 정보
     * @param kafkaKeyData 메시지 1건당 UUID (호출자가 send/sendAsync 단계에서 생성)
     * @return 표준 포맷의 JSON 문자열
     */
    private String buildMessageJson(String topic, KafkaMessage message, String kafkaKeyData) {
        Map<String, Object> map = new LinkedHashMap<>();
        map.put(KafkaConstants.FIELD_TRANSACTION_CODE, message.getTransactionCode());
        map.put(KafkaConstants.FIELD_KAFKA_KEYDATA, kafkaKeyData);
        map.put(KafkaConstants.FIELD_INTERFACE_ID, topic);
        map.put(KafkaConstants.FIELD_INTERFACE_MSG, message.getInterfaceMsg());
        map.put(KafkaConstants.FIELD_INTERFACE_PROTOCOL, KafkaConstants.PROTOCOL_IF_KAFKA);
        return JsonUtil.toJson(map);
    }

    /**
     * 전송 에러를 데이터베이스에 기록합니다.
     *
     * <p>에러 로그 기록 실패 시에도 예외를 발생시키지 않고 로그만 출력합니다.</p>
     *
     * @param topic           토픽명
     * @param transactionCode 트랜잭션 코드
     * @param message         전송 메시지 (JSON)
     * @param code            에러 코드
     * @param msg             에러 메시지
     */
    private void logError(String topic, String transactionCode, String message,
                          String code, String msg) {
        try {
            errorRepository.logSendError(topic, transactionCode, message, code, msg);
        } catch (Exception e) {
            log.error("에러 로그 저장 실패", e);
        }
    }
}
