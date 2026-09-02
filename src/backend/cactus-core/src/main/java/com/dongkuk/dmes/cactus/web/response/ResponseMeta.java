package com.dongkuk.dmes.cactus.web.response;

/**
 * 응답 메타 정보.
 *
 * @param txId    요청 추적 ID (형식: {userId}-{menuId}-{yyyyMMddHHmmss}-{random3})
 * @param success 처리 성공 여부
 * @param code    결과 코드 ("0000": 성공, "E0xx": 비즈니스 에러, "S0xx": 시스템 에러)
 * @param message 사용자에게 표시할 메시지 (성공 시 생략 가능)
 */
public record ResponseMeta(
        String txId,
        boolean success,
        String code,
        String message
) {

    /** 성공 결과 코드 */
    private static final String SUCCESS_CODE = "0000";

    /**
     * 메시지 없이 성공 메타를 생성한다.
     *
     * @param txId 트랜잭션 ID
     */
    public static ResponseMeta success(String txId) {
        return new ResponseMeta(txId, true, SUCCESS_CODE, null);
    }

    /**
     * 메시지를 포함한 성공 메타를 생성한다.
     *
     * @param txId    트랜잭션 ID
     * @param message 성공 메시지
     */
    public static ResponseMeta success(String txId, String message) {
        return new ResponseMeta(txId, true, SUCCESS_CODE, message);
    }

    /**
     * 에러 메타를 생성한다.
     *
     * @param txId    트랜잭션 ID
     * @param code    에러 코드
     * @param message 에러 메시지
     */
    public static ResponseMeta error(String txId, String code, String message) {
        return new ResponseMeta(txId, false, code, message);
    }
}
