package com.dongkuk.dmes.cactus.web.exception;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.cactus.web.response.ResponseMeta;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * 전역 예외 처리.
 * OasisController 밖에서 발생한 예외를 CactusResponse 형태로 변환한다.
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    /**
     * 비즈니스 예외를 처리한다.
     * ErrorCode에 정의된 HTTP 상태 코드로 응답한다.
     */
    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<CactusResponse> handleBusinessException(BusinessException e) {
        String txId = MDC.get("txId");
        ErrorCode errorCode = e.getErrorCode();

        log.warn("[{}] BusinessException: {} ({})", txId, e.getMessage(), errorCode.getCode());

        CactusResponse response = new CactusResponse.Builder(
                ResponseMeta.error(txId, errorCode.getCode(), e.getMessage()))
                .errors(e.getErrors())
                .build();

        return ResponseEntity
                .status(errorCode.getHttpStatus())
                .body(response);
    }

    /**
     * 예상하지 못한 시스템 예외를 처리한다.
     * HTTP 500 상태로 응답하며, 상세 에러는 로그에만 기록한다.
     */
    @ExceptionHandler(Exception.class)
    public ResponseEntity<CactusResponse> handleException(Exception e) {
        String txId = MDC.get("txId");

        // 프레임워크가 상태를 정한 요청 오류(없는 경로 404·허용 안 된 방식 405 등)는 그 상태를 지킨다 — 500 으로 바꾸면
        // 엔드포인트가 없는 모듈의 404 를 "기능 없음" 으로 보는 호출부(화면 메타 공급자 등)가 서버 장애로 오해한다.
        if (e instanceof ErrorResponse er && er.getStatusCode().is4xxClientError()) {
            HttpStatusCode status = er.getStatusCode();
            log.warn("[{}] {} {}", txId, status.value(), e.getMessage());
            String code = status.value() == 404 ? ErrorCode.NOT_FOUND.getCode() : "E" + status.value();
            String message = status.value() == 404 ? ErrorCode.NOT_FOUND.getDefaultMessage() : "잘못된 요청입니다.";
            return ResponseEntity.status(status)
                    .body(new CactusResponse.Builder(ResponseMeta.error(txId, code, message)).build());
        }

        log.error("[{}] Unexpected error", txId, e);

        CactusResponse response = new CactusResponse.Builder(
                ResponseMeta.error(txId, ErrorCode.UNKNOWN_ERROR.getCode(), "서버 내부 오류가 발생했습니다."))
                .build();

        return ResponseEntity
                .status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(response);
    }
}
