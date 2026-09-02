package com.dongkuk.caravan.console.exception;

import com.dongkuk.caravan.console.common.ConsoleApiResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * caravan-console 도메인 예외 핸들러.
 *
 * <p>{@link ConsoleException} 은 비즈니스 예외 (예: "현재 Offset 값의 변동이 있습니다") 라
 * <b>HTTP 400 BadRequest + ConsoleApiResponse</b> 로 변환한다. 호스트 측 일반 GlobalExceptionHandler
 * (Exception.class 일반 처리 → 500) 가 catch 하기 전에 본 핸들러가 우선 매칭되도록
 * {@code @Order(HIGHEST_PRECEDENCE)} 명시.</p>
 *
 * <p>caravan-console 가 호스트 모듈(mcm/mpn/mpp/mqc)에 종속되지 않도록 자체 advice 로 처리.
 * basePackages 제한으로 다른 도메인의 예외는 호스트 측 advice 가 그대로 처리.</p>
 *
 * <p>응답 래퍼 {@link ConsoleApiResponse} — caravan-console 0.2.0 자체 정의 (cactus 의존 0).</p>
 */
@RestControllerAdvice(basePackages = "com.dongkuk.caravan.console")
@Order(Ordered.HIGHEST_PRECEDENCE)
public class ConsoleExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(ConsoleExceptionHandler.class);

    @ExceptionHandler(ConsoleException.class)
    public ResponseEntity<ConsoleApiResponse<Void>> handleConsoleException(ConsoleException e) {
        log.warn("[ConsoleExceptionHandler] {}", e.getMessage());
        return ResponseEntity
                .status(HttpStatus.BAD_REQUEST)
                .body(ConsoleApiResponse.error("CONSOLE_BUSINESS", e.getMessage()));
    }
}
