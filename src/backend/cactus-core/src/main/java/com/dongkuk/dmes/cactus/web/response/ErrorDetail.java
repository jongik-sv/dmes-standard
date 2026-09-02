package com.dongkuk.dmes.cactus.web.response;

/**
 * 에러 상세 정보.
 * 그리드 행 단위 에러 또는 공통 에러를 표현한다.
 *
 * @param grid     에러가 발생한 그리드명 (생략 시 공통 에러)
 * @param rowKey   프론트에서 부여한 행 고유 키
 * @param rowIndex 에러 행 인덱스 (0-based, 보조 식별자)
 * @param field    에러 필드명 (생략 시 행 전체 에러)
 * @param code     에러 코드 (MUST)
 * @param message  에러 메시지 (MUST)
 */
public record ErrorDetail(
        String grid,
        String rowKey,
        Integer rowIndex,
        String field,
        String code,
        String message
) {

    /**
     * 공통 에러를 생성한다.
     *
     * @param code    에러 코드
     * @param message 에러 메시지
     */
    public static ErrorDetail of(String code, String message) {
        return new ErrorDetail(null, null, null, null, code, message);
    }

    /**
     * 그리드 행 단위 에러를 생성한다.
     *
     * @param grid    그리드명
     * @param rowKey  행 고유 키
     * @param field   에러 필드명
     * @param code    에러 코드
     * @param message 에러 메시지
     */
    public static ErrorDetail ofGrid(String grid, String rowKey, String field, String code, String message) {
        return new ErrorDetail(grid, rowKey, null, field, code, message);
    }

    /**
     * 행 인덱스를 포함한 그리드 행 단위 에러를 생성한다.
     *
     * @param grid     그리드명
     * @param rowKey   행 고유 키
     * @param rowIndex 행 인덱스 (0-based)
     * @param field    에러 필드명
     * @param code     에러 코드
     * @param message  에러 메시지
     */
    public static ErrorDetail ofGrid(String grid, String rowKey, int rowIndex, String field, String code, String message) {
        return new ErrorDetail(grid, rowKey, rowIndex, field, code, message);
    }
}
