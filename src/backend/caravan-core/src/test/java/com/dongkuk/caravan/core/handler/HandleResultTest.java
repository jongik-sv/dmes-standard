package com.dongkuk.caravan.core.handler;

import org.junit.Test;

import static org.junit.Assert.*;

/**
 * TC-UTIL-010 ~ TC-UTIL-013: HandleResult 단위 테스트
 */
public class HandleResultTest {

    // TC-UTIL-010: HandleResult.success()
    @Test
    public void TC_UTIL_010_success() {
        HandleResult result = HandleResult.success();

        assertTrue(result.isSuccess());
        assertFalse(result.isRetryable());
        assertFalse(result.isSkipOnMaxRetry());
        assertNull(result.getErrorCode());
        assertNull(result.getErrorMessage());
        assertNull(result.getData());
    }

    // TC-UTIL-011: HandleResult.success(data)
    @Test
    public void TC_UTIL_011_successWithData() {
        HandleResult result = HandleResult.success("result-data");

        assertTrue(result.isSuccess());
        assertFalse(result.isRetryable());
        assertEquals("result-data", result.getData());
    }

    // TC-UTIL-012: HandleResult.fail(code, message)
    @Test
    public void TC_UTIL_012_fail() {
        HandleResult result = HandleResult.fail("ERR001", "처리 실패");

        assertFalse(result.isSuccess());
        assertFalse(result.isRetryable());
        assertFalse(result.isSkipOnMaxRetry());
        assertEquals("ERR001", result.getErrorCode());
        assertEquals("처리 실패", result.getErrorMessage());
    }

    // TC-UTIL-013: HandleResult.failRetryable(code, message)
    @Test
    public void TC_UTIL_013_failRetryable() {
        HandleResult result = HandleResult.failRetryable("TEMP_ERR", "일시 오류");

        assertFalse(result.isSuccess());
        assertTrue(result.isRetryable());
        assertFalse(result.isSkipOnMaxRetry());
        assertEquals("TEMP_ERR", result.getErrorCode());
    }

    // HandleResult.fail(message) - 코드 없이 메시지만
    @Test
    public void failWithMessageOnly() {
        HandleResult result = HandleResult.fail("에러 메시지");

        assertFalse(result.isSuccess());
        assertFalse(result.isRetryable());
        assertNull(result.getErrorCode());
        assertEquals("에러 메시지", result.getErrorMessage());
    }

    // HandleResult.failRetryable(message) - 코드 없이 메시지만
    @Test
    public void failRetryableWithMessageOnly() {
        HandleResult result = HandleResult.failRetryable("재시도 메시지");

        assertFalse(result.isSuccess());
        assertTrue(result.isRetryable());
        assertFalse(result.isSkipOnMaxRetry());
        assertNull(result.getErrorCode());
        assertEquals("재시도 메시지", result.getErrorMessage());
    }

    // HandleResult.failRetryableSkip(code, message)
    @Test
    public void failRetryableSkipWithCode() {
        HandleResult result = HandleResult.failRetryableSkip("API_ERR", "외부 API 장애");

        assertFalse(result.isSuccess());
        assertTrue(result.isRetryable());
        assertTrue(result.isSkipOnMaxRetry());
        assertEquals("API_ERR", result.getErrorCode());
        assertEquals("외부 API 장애", result.getErrorMessage());
    }

    // HandleResult.failRetryableSkip(message) - 코드 없이 메시지만
    @Test
    public void failRetryableSkipWithMessageOnly() {
        HandleResult result = HandleResult.failRetryableSkip("스킵 메시지");

        assertFalse(result.isSuccess());
        assertTrue(result.isRetryable());
        assertTrue(result.isSkipOnMaxRetry());
        assertNull(result.getErrorCode());
        assertEquals("스킵 메시지", result.getErrorMessage());
    }
}
