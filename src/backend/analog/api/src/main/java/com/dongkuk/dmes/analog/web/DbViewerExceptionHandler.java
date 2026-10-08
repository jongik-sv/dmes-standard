package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.util.Map;

/**
 * DB 뷰어 오류 응답 — 사유를 본문에 명시한다.
 * Boot 기본 오류 본문은 사유 노출 정책({@code server.error.include-message})에 좌우되므로,
 * FE 토스트에 검증 사유를 보여주기 위해 어드바이스에서 직접 본문을 만든다.
 * (검증 메시지는 정규화된 식별자만 포함하고 원문 입력을 반사하지 않는다.)
 */
@RestControllerAdvice
public class DbViewerExceptionHandler {

    @ExceptionHandler(DbViewerException.class)
    public ResponseEntity<Map<String, Object>> handle(DbViewerException ex) {
        String reason = ex.getReason() != null ? ex.getReason() : "요청이 올바르지 않습니다.";
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("code", "DB_VIEWER_ERROR", "message", reason));
    }
}
