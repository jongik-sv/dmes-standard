package com.dongkuk.caravan.hub.outbound.db;

import com.dongkuk.caravan.core.model.KafkaMessageContext;
import com.dongkuk.caravan.hub.mapper.InterfaceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * OUTBOUND DB 처리 핸들러.
 *
 * <p>Kafka에서 수신한 메시지를 {@code IF_*} 인터페이스 테이블에 INSERT한다.</p>
 *
 * <p>INSERT 시 설정되는 컬럼:</p>
 * <table>
 *   <caption>INSERT 컬럼 매핑</caption>
 *   <tr><th>컬럼</th><th>값</th></tr>
 *   <tr><td>TRANSACTION_CODE</td><td>context에서 추출</td></tr>
 *   <tr><td>INTERFACE_ID</td><td>context에서 추출</td></tr>
 *   <tr><td>INTERFACE_MSG</td><td>context에서 추출</td></tr>
 *   <tr><td>IF_FLAG</td><td>'N' (미처리)</td></tr>
 *   <tr><td>C_AT / U_AT</td><td>현재 시각 (cactus audit)</td></tr>
 *   <tr><td>C_USR_ID / U_USR_ID</td><td>'SYSTEM' (caravan §17 fallback)</td></tr>
 *   <tr><td>C_SVC_ID / U_SVC_ID</td><td>'caravan-hub'</td></tr>
 *   <tr><td>C_PGM_ID / U_PGM_ID</td><td>'DbOutboundHandler'</td></tr>
 *   <tr><td>VER</td><td>0</td></tr>
 * </table>
 *
 * @see com.dongkuk.caravan.hub.outbound.OutboundDispatchRoute
 * @see com.dongkuk.caravan.hub.mapper.InterfaceMapper#insertOutboundData
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class DbOutboundHandler {

    private final InterfaceMapper interfaceMapper;

    /**
     * Kafka 수신 메시지를 인터페이스 테이블에 INSERT한다.
     *
     * <p>처리 순서:</p>
     * <ol>
     *   <li>config에서 {@code DB_TABLE_NAME}, {@code DB_SCHEMA} 추출</li>
     *   <li>context에서 {@code TRANSACTION_CODE}, {@code INTERFACE_ID}, {@code INTERFACE_MSG} 추출</li>
     *   <li>테이블명 검증 (정규식: {@code ^[A-Za-z_][A-Za-z0-9_]*$})</li>
     *   <li>{@code InterfaceMapper.insertOutboundData()} 실행 ({@code IF_FLAG='N'})</li>
     * </ol>
     *
     * @param context Caravan이 제공하는 Kafka 메시지 컨텍스트
     * @param config  OUTBOUND 설정 정보 ({@code DB_TABLE_NAME}, {@code DB_SCHEMA} 포함)
     * @throws IllegalStateException DB_TABLE_NAME이 없거나 유효하지 않은 경우
     */
    public void handle(KafkaMessageContext context, Map<String, Object> config) {
        // 1. 설정 정보 추출
        String tableName = (String) config.get("DB_TABLE_NAME");
        String schema = (String) config.get("DB_SCHEMA");

        // 2. 원본 메시지에서 필드 추출
        String transactionCode = context.getTransactionCode();
        String interfaceId = context.getInterfaceId();
        String interfaceMsg = context.getInterfaceMsg();

        // 3. 필수값 검증
        if (tableName == null || tableName.isEmpty()) {
            throw new IllegalStateException("DB_TABLE_NAME 설정이 없습니다");
        }
        if (!isValidTableName(tableName)) {
            throw new IllegalStateException("유효하지 않은 테이블명: " + tableName);
        }

        // 4. INSERT 실행
        LocalDateTime now = LocalDateTime.now();
        interfaceMapper.insertOutboundData(schema, tableName, transactionCode, interfaceId, interfaceMsg, "N", now);

        log.info("DB INSERT 완료 - Table: {}.{}, TransactionCode: {}", schema, tableName, transactionCode);
    }

    /**
     * 테이블명이 유효한지 정규식으로 검증한다 (SQL Injection 방지).
     *
     * <p>허용 패턴: 영문 대소문자/언더스코어로 시작, 이후 영문 대소문자/숫자/언더스코어</p>
     *
     * @param tableName 검증할 테이블명 (스키마 미포함)
     * @return 유효하면 {@code true}, 그렇지 않으면 {@code false}
     */
    private boolean isValidTableName(String tableName) {
        return tableName != null && tableName.matches("^[A-Za-z_][A-Za-z0-9_]*$");
    }
}
