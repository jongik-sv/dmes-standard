package com.dongkuk.caravan.core.exception;

/**
 * Kafka Offset 관련 예외
 *
 * <p>Kafka Offset 조회 또는 조작 중 발생하는 예외입니다.</p>
 *
 * <h3>발생 상황</h3>
 * <ul>
 *   <li>현재 Offset 조회 실패</li>
 *   <li>최대/최소 Offset 조회 실패</li>
 *   <li>Offset 변경(스킵) 실패</li>
 *   <li>AdminClient 작업 타임아웃</li>
 * </ul>
 *
 * <h3>추적 정보</h3>
 * <p>예외에는 다음 정보가 포함되어 디버깅에 활용할 수 있습니다:</p>
 * <ul>
 *   <li>{@code topic}: 관련 토픽명</li>
 *   <li>{@code groupId}: Consumer Group ID</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.offset.KafkaOffsetManager
 */
public class KafkaOffsetException extends RuntimeException {

    /** 토픽명 */
    private final String topic;

    /** Consumer Group ID */
    private final String groupId;

    /**
     * 메시지, 토픽, 그룹 ID로 예외를 생성합니다.
     *
     * @param message 예외 메시지
     * @param topic   토픽명
     * @param groupId Consumer Group ID (null 가능)
     */
    public KafkaOffsetException(String message, String topic, String groupId) {
        super(message);
        this.topic = topic;
        this.groupId = groupId;
    }

    /**
     * 메시지, 원인 예외, 토픽, 그룹 ID로 예외를 생성합니다.
     *
     * @param message 예외 메시지
     * @param cause   원인 예외
     * @param topic   토픽명
     * @param groupId Consumer Group ID (null 가능)
     */
    public KafkaOffsetException(String message, Throwable cause, String topic, String groupId) {
        super(message, cause);
        this.topic = topic;
        this.groupId = groupId;
    }

    /**
     * 토픽명을 반환합니다.
     *
     * @return 토픽명
     */
    public String getTopic() {
        return topic;
    }

    /**
     * Consumer Group ID를 반환합니다.
     *
     * @return Consumer Group ID
     */
    public String getGroupId() {
        return groupId;
    }
}
