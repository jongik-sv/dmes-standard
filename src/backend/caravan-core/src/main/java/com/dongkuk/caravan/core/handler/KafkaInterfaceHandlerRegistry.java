package com.dongkuk.caravan.core.handler;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

/**
 * Kafka 핸들러 레지스트리
 *
 * <p>TRANSACTION_CODE를 기반으로 Spring Bean을 조회하여 적절한 핸들러를 반환합니다.</p>
 *
 * <h3>핸들러 조회 방식</h3>
 * <ol>
 *   <li>TRANSACTION_CODE를 Bean 이름으로 사용하여 {@link ApplicationContext}에서 조회</li>
 *   <li>조회 성공: 해당 핸들러 반환</li>
 *   <li>조회 실패: {@link DefaultKafkaInterfaceHandler} 반환</li>
 * </ol>
 *
 * <h3>핸들러 등록 방법</h3>
 * <pre>{@code
 * // TRANSACTION_CODE가 "PQR02012"인 경우
 * @Component("PQR02012")  // Bean 이름 = TRANSACTION_CODE
 * public class BusinessStart implements KafkaInterfaceHandler {
 *     // ...
 * }
 * }</pre>
 *
 * <h3>미등록 TRANSACTION_CODE 처리</h3>
 * <p>등록되지 않은 TRANSACTION_CODE의 메시지는 {@link DefaultKafkaInterfaceHandler}가
 * 처리하며, 기본적으로 경고 로그를 출력하고 성공 처리합니다.</p>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaInterfaceHandler
 * @see DefaultKafkaInterfaceHandler
 */
@Component
public class KafkaInterfaceHandlerRegistry {

    private static final Logger log = LoggerFactory.getLogger(KafkaInterfaceHandlerRegistry.class);

    private final ApplicationContext applicationContext;
    private final DefaultKafkaInterfaceHandler defaultHandler;

    /**
     * KafkaInterfaceHandlerRegistry 생성자
     *
     * @param applicationContext Spring ApplicationContext (Bean 조회에 사용)
     * @param defaultHandler     기본 핸들러 (미등록 TRANSACTION_CODE용)
     */
    @Autowired
    public KafkaInterfaceHandlerRegistry(ApplicationContext applicationContext,
                                          DefaultKafkaInterfaceHandler defaultHandler) {
        this.applicationContext = applicationContext;
        this.defaultHandler = defaultHandler;
    }

    /**
     * TRANSACTION_CODE에 해당하는 핸들러를 조회합니다.
     *
     * <p>Bean 이름이 TRANSACTION_CODE와 일치하고 {@link KafkaInterfaceHandler}를
     * 구현한 Bean을 조회합니다.</p>
     *
     * <h4>조회 예시</h4>
     * <pre>{@code
     * // "PQR02012"로 등록된 핸들러 조회
     * KafkaInterfaceHandler handler = registry.getHandler("PQR02012");
     * }</pre>
     *
     * @param transactionCode 트랜잭션 코드 (Bean 이름)
     * @return 핸들러 인스턴스
     *         <ul>
     *           <li>등록된 경우: 해당 핸들러</li>
     *           <li>미등록 또는 null/빈 문자열: {@link DefaultKafkaInterfaceHandler}</li>
     *         </ul>
     */
    public KafkaInterfaceHandler getHandler(String transactionCode) {
        if (transactionCode == null || transactionCode.trim().isEmpty()) {
            log.warn("TRANSACTION_CODE가 null 또는 빈 문자열입니다. 기본 핸들러 사용");
            return defaultHandler;
        }

        try {
            // Bean 이름으로 핸들러 조회
            KafkaInterfaceHandler handler = applicationContext.getBean(
                transactionCode, KafkaInterfaceHandler.class);
            log.debug("핸들러 조회 성공: {} -> {}",
                transactionCode, handler.getClass().getName());
            return handler;
        } catch (Exception e) {
            log.debug("핸들러 미등록: {} (기본 핸들러 사용)", transactionCode);
            return defaultHandler;
        }
    }

    /**
     * 핸들러 존재 여부를 확인합니다.
     *
     * <p>지정된 TRANSACTION_CODE에 해당하는 핸들러가 등록되어 있는지 확인합니다.</p>
     *
     * @param transactionCode 트랜잭션 코드
     * @return 핸들러 존재 여부
     *         <ul>
     *           <li>{@code true}: 핸들러가 등록되어 있음</li>
     *           <li>{@code false}: 핸들러가 등록되어 있지 않음 (null/빈 문자열 포함)</li>
     *         </ul>
     */
    public boolean hasHandler(String transactionCode) {
        if (transactionCode == null || transactionCode.trim().isEmpty()) {
            return false;
        }
        try {
            applicationContext.getBean(transactionCode, KafkaInterfaceHandler.class);
            return true;
        } catch (Exception e) {
            return false;
        }
    }
}
