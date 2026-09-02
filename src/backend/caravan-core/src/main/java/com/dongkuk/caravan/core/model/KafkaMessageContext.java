package com.dongkuk.caravan.core.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * Kafka 메시지 컨텍스트 DTO
 *
 * <p>Kafka 메시지를 파싱한 결과를 담는 객체입니다.
 * {@link com.dongkuk.caravan.core.handler.KafkaInterfaceHandler#businessHandle(KafkaMessageContext)}
 * 메서드의 파라미터로 전달됩니다.</p>
 *
 * <h3>포함 정보</h3>
 * <ul>
 *   <li><b>표준 필드</b>: TRANSACTION_CODE, INTERFACE_MSG 등</li>
 *   <li><b>원본 메시지</b>: JSON 문자열 및 Map 형태</li>
 *   <li><b>Kafka 메타데이터</b>: topic, partition, offset, timestamp</li>
 *   <li><b>처리 정보</b>: 현재 재시도 횟수</li>
 * </ul>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * @Override
 * public HandleResult businessHandle(KafkaMessageContext context) {
 *     // 표준 필드 사용
 *     String transactionCode = context.getTransactionCode();
 *
 *     // INTERFACE_MSG 파이프 구분자로 분리
 *     String[] msgArr = context.getInterfaceMsgArray();
 *     String type = msgArr[1];
 *
 *     // 원본 메시지에서 커스텀 필드 조회
 *     String customField = context.getString("CUSTOM_FIELD");
 *
 *     return HandleResult.success();
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.handler.KafkaInterfaceHandler
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KafkaMessageContext {
    // ========== 표준 필드 ==========
    /** TRANSACTION_CODE */
    private String transactionCode;
    /** INTERFACE_ID */
    private String interfaceId;
    /** INTERFACE_MSG */
    private String interfaceMsg;
    /** INTERFACE_PROTOCOL */
    private String interfaceProtocol;
    /** KAFKA_KEYDATA */
    private String kafkaKeyData;

    // ========== 원본 메시지 ==========
    /** 원본 JSON 문자열 */
    private String rawMessage;
    /** 원본 메시지를 Map으로 파싱한 결과 */
    private Map<String, Object> rawMessageMap;

    // ========== Kafka 메타데이터 ==========
    /** 토픽명 */
    private String topic;
    /** 파티션 */
    private int partition;
    /** Offset */
    private long offset;
    /** 타임스탬프 */
    private long timestamp;

    // ========== 처리 정보 ==========
    /** 현재 재시도 횟수 */
    private int attemptCount;

    /**
     * INTERFACE_MSG를 파이프(|) 구분자로 분리하여 배열로 반환합니다.
     *
     * <p>레거시 시스템과의 호환을 위해 파이프 구분자로 구성된 메시지를 파싱합니다.</p>
     *
     * <h4>변환 예시</h4>
     * <pre>
     * "PQR02012|P|S|5A|20260130111245"
     *    ↓
     * ["PQR02012", "P", "S", "5A", "20260130111245"]
     * </pre>
     *
     * @return 파이프로 분리된 문자열 배열
     *         <ul>
     *           <li>interfaceMsg가 null 또는 빈 문자열인 경우: 빈 배열</li>
     *           <li>그 외: 파이프로 분리된 배열</li>
     *         </ul>
     */
    public String[] getInterfaceMsgArray() {
        if (interfaceMsg == null || interfaceMsg.isEmpty()) {
            return new String[0];
        }
        return interfaceMsg.split("\\|");
    }

    /**
     * rawMessageMap에서 특정 키의 값을 String으로 가져옵니다.
     *
     * <p>원본 JSON 메시지에서 표준 필드 외의 커스텀 필드를 조회할 때 사용합니다.</p>
     *
     * <h4>사용 예시</h4>
     * <pre>{@code
     * // 원본 메시지: {"TRANSACTION_CODE": "PQR02012", "CUSTOM_FIELD": "value", "COUNT": 10}
     * String customField = context.getString("CUSTOM_FIELD");  // "value"
     * String count = context.getString("COUNT");  // "10"
     * }</pre>
     *
     * @param key 조회할 키
     * @return 키에 해당하는 값의 문자열 표현
     *         <ul>
     *           <li>rawMessageMap이 null인 경우: null</li>
     *           <li>키가 존재하지 않는 경우: null</li>
     *           <li>값이 존재하는 경우: toString() 결과</li>
     *         </ul>
     */
    public String getString(String key) {
        if (rawMessageMap == null) {
            return null;
        }
        Object value = rawMessageMap.get(key);
        return value != null ? value.toString() : null;
    }
}
