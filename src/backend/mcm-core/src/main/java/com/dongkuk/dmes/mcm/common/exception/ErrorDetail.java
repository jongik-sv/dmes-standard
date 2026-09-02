package com.dongkuk.dmes.mcm.common.exception;

/**
 * mcm-core 자체 에러 상세. cactus {@code ErrorDetail} 와 동일 record 시그니처.
 */
public record ErrorDetail(
        String grid,
        String rowKey,
        Integer rowIndex,
        String field,
        String code,
        String message
) {
    public static ErrorDetail of(String code, String message) {
        return new ErrorDetail(null, null, null, null, code, message);
    }

    public static ErrorDetail ofGrid(String grid, String rowKey, String field, String code, String message) {
        return new ErrorDetail(grid, rowKey, null, field, code, message);
    }

    public static ErrorDetail ofGrid(String grid, String rowKey, int rowIndex, String field, String code, String message) {
        return new ErrorDetail(grid, rowKey, rowIndex, field, code, message);
    }
}
