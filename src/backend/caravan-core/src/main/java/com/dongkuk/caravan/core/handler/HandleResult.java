package com.dongkuk.caravan.core.handler;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * 핸들러 처리 결과 DTO
 *
 * <p>Kafka 메시지 핸들러의 처리 결과를 나타냅니다.</p>
 *
 * <h3>결과 유형</h3>
 * <table border="1">
 *   <tr><th>유형</th><th>success</th><th>retryable</th><th>skipOnMaxRetry</th><th>동작</th></tr>
 *   <tr><td>성공</td><td>true</td><td>-</td><td>-</td><td>메시지 커밋, 다음 메시지 처리</td></tr>
 *   <tr><td>실패 (재시도 불가)</td><td>false</td><td>false</td><td>-</td><td>에러 기록, 메시지 커밋, 다음 메시지 처리</td></tr>
 *   <tr><td>실패 (재시도 가능)</td><td>false</td><td>true</td><td>false</td><td>재시도 수행, 최대 횟수 초과 시 컨테이너 일시정지</td></tr>
 *   <tr><td>실패 (재시도 후 스킵)</td><td>false</td><td>true</td><td>true</td><td>재시도 수행, 최대 횟수 초과 시 에러 기록 후 다음 메시지 처리</td></tr>
 * </table>
 *
 * <h3>사용 예시</h3>
 * <pre>{@code
 * @Override
 * public HandleResult businessHandle(KafkaMessageContext context) {
 *     try {
 *         // 비즈니스 로직 실행
 *         businessService.process(context);
 *         return HandleResult.success();
 *
 *     } catch (TemporaryException e) {
 *         // 일시적 오류 - 재시도 후 실패 시 컨테이너 일시정지
 *         return HandleResult.failRetryable("TEMP_ERROR", e.getMessage());
 *
 *     } catch (ExternalApiException e) {
 *         // 외부 API 오류 - 재시도 후 실패 시 에러 기록하고 다음 메시지로
 *         return HandleResult.failRetryableSkip("API_ERROR", e.getMessage());
 *
 *     } catch (ValidationException e) {
 *         // 검증 오류 - 재시도해도 실패
 *         return HandleResult.fail("VALIDATION_ERROR", e.getMessage());
 *     }
 * }
 * }</pre>
 *
 * @author Caravan
 * @version 1.0.0
 * @see KafkaInterfaceHandler
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class HandleResult {

    /**
     * 처리 성공 여부
     * <ul>
     *   <li>{@code true}: 비즈니스 로직이 정상 완료됨</li>
     *   <li>{@code false}: 비즈니스 로직 처리 중 오류 발생</li>
     * </ul>
     */
    private boolean success;

    /**
     * 재시도 가능 여부 (실패 시에만 의미 있음)
     * <ul>
     *   <li>{@code true}: 동일 메시지에 대해 재시도 수행</li>
     *   <li>{@code false}: 재시도하지 않고 에러 로그 기록 후 다음 메시지 처리</li>
     * </ul>
     */
    private boolean retryable;

    /**
     * 최대 재시도 초과 시 스킵 여부 (retryable=true일 때만 의미 있음)
     * <ul>
     *   <li>{@code true}: 최대 재시도 초과 시 에러 기록 후 다음 메시지 처리 (컨테이너 유지)</li>
     *   <li>{@code false}: 최대 재시도 초과 시 컨테이너 일시정지 + Offset 롤백 (기본값)</li>
     * </ul>
     */
    private boolean skipOnMaxRetry;

    /**
     * 에러 코드 (실패 시)
     * <p>TB_CARAVAN_TC_ERROR 테이블의 ERROR_CODE 컬럼에 저장됩니다.</p>
     */
    private String errorCode;

    /**
     * 에러 메시지 (실패 시)
     * <p>TB_CARAVAN_TC_ERROR 테이블의 ERROR_MSG 컬럼에 저장됩니다.</p>
     */
    private String errorMessage;

    /**
     * 추가 데이터 (선택적)
     * <p>핸들러에서 추가적인 데이터를 반환할 때 사용합니다.</p>
     */
    private Object data;

    /**
     * 성공 결과를 생성합니다.
     *
     * <p>메시지가 정상적으로 처리되었을 때 사용합니다.</p>
     *
     * @return 성공 결과 ({@code success=true})
     */
    public static HandleResult success() {
        return HandleResult.builder()
            .success(true)
            .retryable(false)
            .build();
    }

    /**
     * 성공 결과를 데이터와 함께 생성합니다.
     *
     * @param data 추가 데이터
     * @return 성공 결과 ({@code success=true}, data 포함)
     */
    public static HandleResult success(Object data) {
        return HandleResult.builder()
            .success(true)
            .retryable(false)
            .data(data)
            .build();
    }

    /**
     * 실패 결과를 생성합니다 (재시도 불가).
     *
     * <p>검증 오류, 비즈니스 규칙 위반 등 재시도해도 성공할 수 없는 경우 사용합니다.</p>
     *
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code success=false}, {@code retryable=false})
     */
    public static HandleResult fail(String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(false)
            .errorMessage(errorMessage)
            .build();
    }

    /**
     * 실패 결과를 에러 코드와 함께 생성합니다 (재시도 불가).
     *
     * @param errorCode    에러 코드 (예: "VALIDATION_ERROR", "BUSINESS_ERROR")
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code success=false}, {@code retryable=false})
     */
    public static HandleResult fail(String errorCode, String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(false)
            .errorCode(errorCode)
            .errorMessage(errorMessage)
            .build();
    }

    /**
     * 재시도 가능한 실패 결과를 생성합니다.
     *
     * <p>일시적인 오류, 외부 시스템 장애 등 재시도 시 성공할 가능성이 있는 경우 사용합니다.</p>
     *
     * <h4>주의사항</h4>
     * <p>최대 재시도 횟수({@code caravan.kafka.retry.max-attempts})를 초과하면
     * 컨테이너가 일시정지됩니다.</p>
     *
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code success=false}, {@code retryable=true})
     */
    public static HandleResult failRetryable(String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(true)
            .errorMessage(errorMessage)
            .build();
    }

    /**
     * 재시도 가능한 실패 결과를 에러 코드와 함께 생성합니다.
     *
     * @param errorCode    에러 코드 (예: "TIMEOUT", "CONNECTION_ERROR")
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code success=false}, {@code retryable=true})
     */
    public static HandleResult failRetryable(String errorCode, String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(true)
            .errorCode(errorCode)
            .errorMessage(errorMessage)
            .build();
    }

    /**
     * 재시도 가능한 실패 결과를 생성합니다 (최대 재시도 초과 시 스킵).
     *
     * <p>재시도 후에도 실패하면 에러를 기록하고 다음 메시지로 넘어갑니다.
     * 컨테이너는 일시정지되지 않습니다.</p>
     *
     * <h4>{@code failRetryable()}과의 차이</h4>
     * <ul>
     *   <li>{@code failRetryable()}: 최대 재시도 초과 → 컨테이너 PAUSE + Offset 롤백 (운영자 개입 필요)</li>
     *   <li>{@code failRetryableSkip()}: 최대 재시도 초과 → 에러 DB 기록 + Offset 커밋 (자동 스킵)</li>
     * </ul>
     *
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code retryable=true}, {@code skipOnMaxRetry=true})
     */
    public static HandleResult failRetryableSkip(String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(true)
            .skipOnMaxRetry(true)
            .errorMessage(errorMessage)
            .build();
    }

    /**
     * 재시도 가능한 실패 결과를 에러 코드와 함께 생성합니다 (최대 재시도 초과 시 스킵).
     *
     * @param errorCode    에러 코드 (예: "API_ERROR", "EXTERNAL_TIMEOUT")
     * @param errorMessage 에러 메시지
     * @return 실패 결과 ({@code retryable=true}, {@code skipOnMaxRetry=true})
     */
    public static HandleResult failRetryableSkip(String errorCode, String errorMessage) {
        return HandleResult.builder()
            .success(false)
            .retryable(true)
            .skipOnMaxRetry(true)
            .errorCode(errorCode)
            .errorMessage(errorMessage)
            .build();
    }
}
