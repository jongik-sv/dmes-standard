package com.dongkuk.caravan.core.handler;

import com.dongkuk.caravan.core.model.KafkaMessageContext;

/**
 * Kafka 메시지 처리 핸들러 인터페이스
 *
 * <p>TRANSACTION_CODE 기반으로 동적 라우팅되어 호출되는 비즈니스 핸들러의 인터페이스입니다.</p>
 *
 * <h3>핸들러 등록 규칙</h3>
 * <ul>
 *   <li><b>패키지명</b>: TRANSACTION_CODE (예: {@code com.myproject.handler.PQR02012})</li>
 *   <li><b>클래스명</b>: {@code BusinessStart} (통일)</li>
 *   <li><b>Bean 이름</b>: TRANSACTION_CODE (예: {@code @Component("PQR02012")})</li>
 * </ul>
 *
 * <h3>메시지 라우팅 흐름</h3>
 * <pre>
 * 메시지 수신 → TRANSACTION_CODE 추출 → Bean 조회 → 핸들러 호출
 * {"TRANSACTION_CODE": "PQR02012", ...} → getBean("PQR02012") → PQR02012.BusinessStart.businessHandle()
 * </pre>
 *
 * <h3>구현 예시</h3>
 * <pre>{@code
 * package com.myproject.handler.PQR02012;
 *
 * @Component("PQR02012")  // Bean 이름 = TRANSACTION_CODE
 * @RequiredArgsConstructor
 * public class BusinessStart implements KafkaInterfaceHandler {
 *
 *     private final MyBusinessService businessService;
 *
 *     @Override
 *     public HandleResult businessHandle(KafkaMessageContext context) {
 *         try {
 *             // INTERFACE_MSG 파싱
 *             String[] msgArr = context.getInterfaceMsgArray();
 *             String type = msgArr[1];
 *             String status = msgArr[2];
 *
 *             // 비즈니스 로직 실행
 *             businessService.process(type, status);
 *
 *             return HandleResult.success();
 *
 *         } catch (Exception e) {
 *             // 재시도 가능한 에러
 *             if (isRetryable(e)) {
 *                 return HandleResult.failRetryable("RETRY_ERROR", e.getMessage());
 *             }
 *             // 재시도 불가능한 에러
 *             return HandleResult.fail("FATAL_ERROR", e.getMessage());
 *         }
 *     }
 * }
 * }</pre>
 *
 * <h3>HandleResult 반환 가이드</h3>
 * <table border="1">
 *   <tr><th>상황</th><th>반환값</th><th>설명</th></tr>
 *   <tr><td>처리 성공</td><td>{@code HandleResult.success()}</td><td>메시지 커밋, 다음 메시지 처리</td></tr>
 *   <tr><td>처리 실패 (재시도 불가)</td><td>{@code HandleResult.fail(...)}</td><td>에러 기록, 메시지 커밋, 다음 메시지 처리</td></tr>
 *   <tr><td>처리 실패 (재시도 가능)</td><td>{@code HandleResult.failRetryable(...)}</td><td>설정된 횟수만큼 재시도</td></tr>
 * </table>
 *
 * @author Caravan
 * @version 1.0.0
 * @see HandleResult
 * @see KafkaMessageContext
 * @see KafkaInterfaceHandlerRegistry
 */
public interface KafkaInterfaceHandler {

    /**
     * 비즈니스 처리 메서드
     *
     * <p>Kafka 메시지를 수신하면 TRANSACTION_CODE를 기반으로 이 메서드가 호출됩니다.</p>
     *
     * <h4>Context에서 제공되는 정보</h4>
     * <ul>
     *   <li>{@code transactionCode}: 트랜잭션 코드</li>
     *   <li>{@code interfaceMsg}: 인터페이스 메시지 (파이프 구분자)</li>
     *   <li>{@code rawMessage}: 원본 JSON 메시지</li>
     *   <li>{@code rawMessageMap}: 원본 메시지를 Map으로 파싱한 결과</li>
     *   <li>{@code topic}: 토픽명</li>
     *   <li>{@code offset}: 메시지 오프셋</li>
     *   <li>{@code attemptCount}: 현재 재시도 횟수</li>
     * </ul>
     *
     * <h4>주의사항</h4>
     * <ul>
     *   <li>예외를 직접 throw하지 말고, {@link HandleResult}로 반환하세요</li>
     *   <li>예외가 throw되면 재시도 가능한 실패로 처리됩니다</li>
     *   <li>재시도 횟수 초과 시 컨테이너가 일시정지됩니다</li>
     * </ul>
     *
     * @param context 메시지 컨텍스트 (파싱된 메시지 정보)
     *                <ul>
     *                  <li>표준 필드 (TRANSACTION_CODE, INTERFACE_MSG 등)</li>
     *                  <li>원본 메시지 (rawMessage, rawMessageMap)</li>
     *                  <li>Kafka 메타데이터 (topic, partition, offset)</li>
     *                  <li>처리 정보 (attemptCount)</li>
     *                </ul>
     * @return 처리 결과
     *         <ul>
     *           <li>{@code success}: 성공 여부</li>
     *           <li>{@code retryable}: 재시도 가능 여부</li>
     *           <li>{@code errorCode}: 에러 코드 (실패 시)</li>
     *           <li>{@code errorMessage}: 에러 메시지 (실패 시)</li>
     *         </ul>
     * @see HandleResult#success()
     * @see HandleResult#fail(String, String)
     * @see HandleResult#failRetryable(String, String)
     */
    HandleResult businessHandle(KafkaMessageContext context);
}
