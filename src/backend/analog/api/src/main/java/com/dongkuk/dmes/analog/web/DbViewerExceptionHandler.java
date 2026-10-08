package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.sql.SQLException;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * DB 뷰어 오류 응답 — 사유를 본문에 명시한다.
 * Boot 기본 오류 본문은 사유 노출 정책({@code server.error.include-message})에 좌우되므로,
 * FE 토스트에 검증 사유를 보여주기 위해 어드바이스에서 직접 본문을 만든다.
 * (검증 메시지는 정규화된 식별자만 포함하고 원문 입력을 반사하지 않는다.)
 *
 * <p>DB 뷰어 컨트롤러에만 적용한다 — 같은 모듈의 다른 컨트롤러 오류 응답은 바꾸지 않는다.
 */
@RestControllerAdvice(assignableTypes = DbViewerController.class)
public class DbViewerExceptionHandler {

    private static final Pattern ORA_CODE = Pattern.compile("ORA-\\d{5}");

    /** 서버가 SQL 뒤에 붙이는 건수 제한 절 — 사용자가 쓴 글이 아니므로 안내에서 뺀다. */
    private static final Pattern SERVER_FETCH = Pattern.compile(
            "\\s*FETCH\\s+FIRST\\s+\\d+\\s+ROWS\\s+ONLY", Pattern.CASE_INSENSITIVE);

    private static final int MAX_DETAIL = 200;

    @ExceptionHandler(DbViewerException.class)
    public ResponseEntity<Map<String, Object>> handle(DbViewerException ex) {
        String reason = ex.getReason() != null ? ex.getReason() : "요청이 올바르지 않습니다.";
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("code", "DB_VIEWER_ERROR", "message", reason));
    }

    /**
     * 사용자가 쓴 SQL 때문에 오라클이 거부한 오류(문법·이름·값 형식)는 400 과 짧은 안내로 바꾼다.
     * 연결·권한·시간 초과 같은 서버 쪽 오류는 그대로 다시 던져 지금처럼 500 으로 나간다.
     */
    @ExceptionHandler(DataAccessException.class)
    public ResponseEntity<Map<String, Object>> handleDataAccess(DataAccessException ex) {
        SQLException sql = sqlExceptionOf(ex);
        if (sql == null || !isUserSqlError(sql.getErrorCode())) {
            throw ex;
        }
        return ResponseEntity.badRequest()
                .body(Map.of("code", "DB_VIEWER_SQL_ERROR", "message", sqlErrorMessage(sql)));
    }

    /** 원인 사슬에서 가장 바깥의 {@link SQLException}. 없으면 null. */
    static SQLException sqlExceptionOf(Throwable ex) {
        for (Throwable t = ex; t != null; t = t.getCause()) {
            if (t instanceof SQLException sql) {
                return sql;
            }
            if (t.getCause() == t) {
                break;
            }
        }
        return null;
    }

    /**
     * 사용자 SQL 탓으로 보는 오라클 오류 번호.
     * ORA-00900~00999(문법·이름), 03049(키워드 위치), 06550(PL/SQL), 01722(숫자 형식), 018xx(날짜 형식),
     * 01427·01476·01747·01789·01790(조건식 오류).
     */
    static boolean isUserSqlError(int code) {
        return (code >= 900 && code <= 999)
                || (code >= 1830 && code <= 1899)
                || code == 1427 || code == 1476 || code == 1722 || code == 1747
                || code == 1789 || code == 1790 || code == 3049 || code == 6550;
    }

    /** 「SQL 문법 오류: ORA-xxxxx …」 — 첫 줄만 쓰고 서버가 덧붙인 FETCH 절·도움말 줄·내부 SQL 은 뺀다. */
    static String sqlErrorMessage(SQLException sql) {
        String raw = sql.getMessage() == null ? "" : sql.getMessage();
        String firstLine = raw.strip().lines().findFirst().orElse("").strip();
        Matcher ora = ORA_CODE.matcher(firstLine);
        String code = ora.find() ? ora.group() : "ORA-" + String.format("%05d", sql.getErrorCode());
        String cleaned = SERVER_FETCH.matcher(firstLine).replaceAll("").replaceAll("[:\\s]+$", "");
        // 건수 제한 절은 서버가 붙인 것이라, 그 키워드를 탓하는 안내는 사용자가 이해할 수 없다.
        if (cleaned.toUpperCase().contains("FETCH")) {
            return "SQL 문법 오류: " + code + " SQL 끝부분(WHERE 조건 등)이 완성되었는지 확인해 주세요.";
        }
        if (cleaned.length() > MAX_DETAIL) {
            cleaned = cleaned.substring(0, MAX_DETAIL) + "…";
        }
        return "SQL 문법 오류: " + (cleaned.isEmpty() ? code : cleaned);
    }
}
