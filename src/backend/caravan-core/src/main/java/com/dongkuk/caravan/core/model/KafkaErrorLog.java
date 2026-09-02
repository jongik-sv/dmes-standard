package com.dongkuk.caravan.core.model;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Kafka 에러 로그 DTO
 *
 * <p>TB_CARAVAN_TC_ERROR 테이블에 저장될 에러 정보를 담는 객체입니다.</p>
 *
 * <h3>TB_CARAVAN_TC_ERROR 테이블 매핑</h3>
 * <table border="1">
 *   <tr><th>필드</th><th>컬럼</th><th>설명</th></tr>
 *   <tr><td>interfaceProtocol</td><td>INTERFACE_PROTOCOL</td><td>프로토콜 (KAFKA)</td></tr>
 *   <tr><td>transactionCode</td><td>TRANSACTION_CODE</td><td>트랜잭션 코드</td></tr>
 *   <tr><td>interfaceId</td><td>INTERFACE_ID</td><td>토픽명</td></tr>
 *   <tr><td>interfaceMsg</td><td>INTERFACE_MSG</td><td>메시지 또는 Offset 정보</td></tr>
 *   <tr><td>errorType</td><td>ERROR_TYPE</td><td>에러 유형 (S/R)</td></tr>
 *   <tr><td>errorCode</td><td>ERROR_CODE</td><td>에러 코드</td></tr>
 *   <tr><td>errorMsg</td><td>ERROR_MSG</td><td>에러 메시지</td></tr>
 *   <tr><td>createdObjectId</td><td>CREATED_OBJECT_ID</td><td>생성 Object ID</td></tr>
 *   <tr><td>createdProgramId</td><td>CREATED_PROGRAM_ID</td><td>생성 프로그램 ID</td></tr>
 * </table>
 *
 * @author Caravan
 * @version 1.0.0
 * @see com.dongkuk.caravan.core.repository.KafkaErrorRepository
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class KafkaErrorLog {
    /** 인터페이스 프로토콜 (KAFKA) */
    private String interfaceProtocol;
    /** 트랜잭션 코드 */
    private String transactionCode;
    /** 인터페이스 ID (Topic명) */
    private String interfaceId;
    /** 인터페이스 메시지 (최대 65000자) */
    private String interfaceMsg;
    /** 에러 타입 (S: Send, R: Receive) */
    private String errorType;
    /** 에러 코드 (최대 100자) */
    private String errorCode;
    /** 에러 메시지 (최대 1000자) */
    private String errorMsg;
    /** 생성 Object ID (bizSystem) */
    private String createdObjectId;
    /** 생성 프로그램 ID */
    private String createdProgramId;
}
