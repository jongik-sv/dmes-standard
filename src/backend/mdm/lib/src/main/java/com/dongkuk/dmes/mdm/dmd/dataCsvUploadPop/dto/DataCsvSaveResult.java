package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto;

/**
 * {@code dataCsvUploadPop} action={@code save} 응답 — 오류가 하나라도 있으면 이 결과 대신 예외가 난다(I2, 다른 쓰기
 * 경로처럼 {@code DataItemChecks.rejected} 가 던진다). {@code at} 은 한 저장 시각(yyyy-MM-dd HH:mm:ss).
 */
public record DataCsvSaveResult(int insertCount, int updateCount, int noneCount, String at) {
}
