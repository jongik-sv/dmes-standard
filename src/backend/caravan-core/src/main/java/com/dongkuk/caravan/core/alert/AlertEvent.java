package com.dongkuk.caravan.core.alert;

import lombok.Builder;
import lombok.Getter;
import lombok.ToString;

/**
 * 운영자 알림(SMS 등) 이벤트.
 *
 * <p>큐막기/DLT 등 "메시지가 정상적으로 도달하지 못하고 멈춘" 시점에 {@link AlertNotifier} 로 전달된다.
 * 실제 발송 수단(SMS 게이트웨이 등)은 caravan-core 가 알지 못하며, 앱(caravan-hub)이 구현한다.</p>
 */
@Getter
@Builder
@ToString
public class AlertEvent {

    /** 알림 발생 단계(큐막기/DLT 종류). */
    private final AlertStage stage;

    /** 비즈니스 시스템(예: {@code HUB1}). 미상이면 null. */
    private final String bizSystem;

    /** 대상 토픽 ID(또는 인터페이스 ID). */
    private final String topicId;

    /** 트랜잭션 코드(전문 ID). 미상이면 {@code PARSE_ERROR} 등. */
    private final String transactionCode;

    /** 원문 위치 힌트 — 예: {@code "offset=123"} / {@code "table=IFUSER.IF_..., tc=..."}. */
    private final String locator;

    /** 에러 코드. */
    private final String errorCode;

    /** 에러 메시지(요약). */
    private final String errorMsg;

    /** 소비 큐막기(재시도 소진) 이벤트. */
    public static AlertEvent consumeBlocked(String bizSystem, String topicId, String transactionCode,
                                            long offset, String errorCode, String errorMsg) {
        return AlertEvent.builder()
                .stage(AlertStage.CONSUME_BLOCKED)
                .bizSystem(bizSystem).topicId(topicId).transactionCode(transactionCode)
                .locator("offset=" + offset).errorCode(errorCode).errorMsg(errorMsg)
                .build();
    }

    /** 파싱 실패 큐막기 이벤트. */
    public static AlertEvent parseError(String bizSystem, String topicId,
                                        long offset, String errorMsg) {
        return AlertEvent.builder()
                .stage(AlertStage.PARSE_ERROR)
                .bizSystem(bizSystem).topicId(topicId).transactionCode("PARSE_ERROR")
                .locator("offset=" + offset).errorCode("PARSE_ERROR").errorMsg(errorMsg)
                .build();
    }

    /** DB 인바운드 큐막기 이벤트. */
    public static AlertEvent inboundBlocked(String bizSystem, String topicId, String tableName,
                                            String transactionCode, String errorMsg) {
        return AlertEvent.builder()
                .stage(AlertStage.INBOUND_BLOCKED)
                .bizSystem(bizSystem).topicId(topicId).transactionCode(transactionCode)
                .locator("table=" + tableName + ", tc=" + transactionCode)
                .errorCode("IF_FLAG=E").errorMsg(errorMsg)
                .build();
    }

    /** FILE 인바운드 부분/전체 실패(에러 폴더 격리 또는 이동 실패) 이벤트. */
    public static AlertEvent fileInboundFailed(String bizSystem, String topicId, String fileName,
                                               int successCount, int failCount, String detail) {
        return AlertEvent.builder()
                .stage(AlertStage.FILE_INBOUND_FAILED)
                .bizSystem(bizSystem).topicId(topicId).transactionCode("FILE")
                .locator("file=" + fileName + " (성공 " + successCount + ", 실패 " + failCount + ")")
                .errorCode("FILE_INBOUND_FAILED").errorMsg(detail)
                .build();
    }

    /** DLT 적재 이벤트. */
    public static AlertEvent dlt(String bizSystem, String originalTopic, Long originalOffset,
                                 String errorCode, String errorMsg) {
        return AlertEvent.builder()
                .stage(AlertStage.DLT)
                .bizSystem(bizSystem).topicId(originalTopic).transactionCode("DLT")
                .locator("offset=" + originalOffset).errorCode(errorCode).errorMsg(errorMsg)
                .build();
    }
}
