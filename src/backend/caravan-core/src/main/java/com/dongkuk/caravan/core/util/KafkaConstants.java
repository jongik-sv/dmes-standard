package com.dongkuk.caravan.core.util;

/**
 * Kafka 관련 상수 정의
 *
 * <p>Caravan 라이브러리에서 사용하는 모든 상수를 정의합니다.</p>
 *
 * <h3>상수 그룹</h3>
 * <ul>
 *   <li><b>FIELD_*</b>: Kafka 메시지 JSON 필드명</li>
 *   <li><b>PROTOCOL_*</b>: 인터페이스 프로토콜 코드</li>
 *   <li><b>ERROR_TYPE_*</b>: 에러 유형 코드</li>
 *   <li><b>DLT_*</b>: Dead Letter Topic 관련</li>
 *   <li><b>LISTENER_*</b>: Listener ID 관련</li>
 *   <li><b>DEFAULT_*</b>: 기본값</li>
 * </ul>
 *
 * @author Caravan
 * @version 1.0.0
 */
public final class KafkaConstants {

    /** 유틸리티 클래스이므로 인스턴스화 방지 */
    private KafkaConstants() {}

    // ========== 메시지 필드명 ==========
    public static final String FIELD_TRANSACTION_CODE = "TRANSACTION_CODE";
    public static final String FIELD_INTERFACE_ID = "INTERFACE_ID";
    public static final String FIELD_INTERFACE_MSG = "INTERFACE_MSG";
    public static final String FIELD_INTERFACE_PROTOCOL = "INTERFACE_PROTOCOL";
    public static final String FIELD_KAFKA_KEYDATA = "KAFKA_KEYDATA";

    // ========== 프로토콜 ==========
    public static final String PROTOCOL_KAFKA = "KAFKA";
    public static final String PROTOCOL_IF_KAFKA = "IF_KAFKA";

    // ========== 에러 타입 ==========
    public static final String ERROR_TYPE_SEND = "S";
    public static final String ERROR_TYPE_RECEIVE = "R";

    // ========== DLT (Dead Letter Topic) ==========
    public static final String DLT_SUFFIX = ".dlt";

    // ========== Listener ID 프리픽스 ==========
    public static final String LISTENER_PREFIX = "listener-";

    // ========== caravan-hub 시스템 ==========
    public static final String BIZ_SYSTEM_PREFIX_HUB = "hub";
    public static final String HUB_HANDLER_BEAN_NAME = "CaravanHubConsumeHandler";

    // ========== 기본값 ==========
    public static final int DEFAULT_PARTITION = 0;
    public static final int DEFAULT_MAX_POLL_RECORDS = 1;
    public static final int DEFAULT_CONCURRENCY = 1;
}
