package com.dongkuk.dmes.analog.db;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

/** DB 뷰어 오류 — 상태 코드 지정 예외. */
public class DbViewerException extends ResponseStatusException {

    public DbViewerException(int status, String message) {
        super(HttpStatus.valueOf(status), message);
    }
}
