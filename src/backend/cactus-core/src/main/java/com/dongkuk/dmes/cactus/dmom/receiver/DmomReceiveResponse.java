package com.dongkuk.dmes.cactus.dmom.receiver;

import java.time.LocalDateTime;

/**
 * 전문 수신 응답 본문.
 *
 * <p>CaravanHub 는 <b>HTTP status 로 성공/실패를 판정</b>(2xx 성공)하므로 본 body 는 추적/디버그 용도다.
 * 정상 처리는 {@link #success(DmomReceiveRequest)} 로 200 응답을, 실패는 예외 전파로
 * {@code GlobalExceptionHandler} 가 5xx 를 반환한다.
 *
 * @param resultCode       처리 결과 코드 (성공 시 {@code "SUCCESS"})
 * @param transactionCode  트랜잭션 코드
 * @param interfaceId      인터페이스 ID
 * @param errorMessage     오류 메시지 (성공 시 {@code null})
 * @param timestamp        응답 생성 시각(ISO-8601)
 */
public record DmomReceiveResponse(
        String resultCode,
        String transactionCode,
        String interfaceId,
        String errorMessage,
        String timestamp
) {

    /** 성공 응답 생성. */
    public static DmomReceiveResponse success(DmomReceiveRequest request) {
        return new DmomReceiveResponse(
                "SUCCESS",
                request.transactionCode(),
                request.interfaceId(),
                null,
                LocalDateTime.now().toString());
    }
}
