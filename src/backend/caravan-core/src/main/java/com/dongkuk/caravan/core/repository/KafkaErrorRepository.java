package com.dongkuk.caravan.core.repository;

import com.dongkuk.caravan.core.config.CaravanProperties;
import com.dongkuk.caravan.core.entity.KafkaErrorLogEntity;
import com.dongkuk.caravan.core.jpa.KafkaErrorLogJpaRepository;
import com.dongkuk.caravan.core.util.KafkaConstants;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Repository;

/**
 * Kafka 에러 로그 Repository
 *
 * <p>Kafka 메시지 송수신 중 발생한 에러를 TB_CARAVAN_TC_ERROR 테이블에 기록합니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaErrorLogEntity
 */
@Repository
@RequiredArgsConstructor
public class KafkaErrorRepository {

    private final KafkaErrorLogJpaRepository errorLogJpaRepository;
    private final CaravanProperties properties;

    /** CREATED_BY/UPDATED_BY 에 기록될 식별자 (max 20자). */
    private static final String AUDIT_PREFIX = "CARAVAN:";

    /**
     * 메시지 송신 에러를 저장합니다.
     */
    public void logSendError(String topic, String transactionCode,
                              String message, String errorCode, String errorMsg) {
        KafkaErrorLogEntity entity = KafkaErrorLogEntity.builder()
            .interfaceProtocol(KafkaConstants.PROTOCOL_KAFKA)
            .transactionCode(transactionCode)
            .interfaceId(topic)
            .interfaceMsg(truncate(message, 65000))
            .errorType(KafkaConstants.ERROR_TYPE_SEND)
            .errorCode(truncate(errorCode, 100))
            .errorMsg(truncate(errorMsg, 1000))
            .createdBy(buildAuditId())
            .build();

        errorLogJpaRepository.save(entity);
    }

    /**
     * 메시지 수신(소비) 에러를 저장합니다.
     *
     * <p>실패 메시지 <b>원문(payload)</b>을 {@code INTERFACE_MSG} 에 그대로 적재해
     * {@code TB_CARAVAN_TC_ERROR} 가 큐막기 실패 건의 중앙 아카이브(원문 조회/재처리 근거) 역할을
     * 하도록 한다. offset 은 별도 컬럼이 없으므로 {@code ERROR_MSG} 에 접두 보존한다.</p>
     *
     * @param message 수신 원문(payload) — null 허용
     */
    public void logConsumeError(String topic, String transactionCode,
                                 long offset, String message, String errorCode, String errorMsg) {
        KafkaErrorLogEntity entity = KafkaErrorLogEntity.builder()
            .interfaceProtocol(KafkaConstants.PROTOCOL_KAFKA)
            .transactionCode(transactionCode)
            .interfaceId(topic)
            .interfaceMsg(truncate(message, 65000))
            .errorType(KafkaConstants.ERROR_TYPE_RECEIVE)
            .errorCode(truncate(errorCode, 100))
            .errorMsg(truncate("[offset=" + offset + "] " + errorMsg, 1000))
            .createdBy(buildAuditId())
            .build();

        errorLogJpaRepository.save(entity);
    }

    /** "CARAVAN:{bizSystem}" — 20자 초과 시 절삭. */
    private String buildAuditId() {
        String biz = properties.getBizSystem() == null ? "" : properties.getBizSystem();
        return truncate(AUDIT_PREFIX + biz, 20);
    }

    private String truncate(String str, int maxLength) {
        if (str == null) {
            return null;
        }
        return str.length() > maxLength ? str.substring(0, maxLength) : str;
    }
}
