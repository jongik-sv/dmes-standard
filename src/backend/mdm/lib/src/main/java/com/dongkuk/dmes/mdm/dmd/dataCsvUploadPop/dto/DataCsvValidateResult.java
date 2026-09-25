package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto;

import java.util.List;

/**
 * {@code dataCsvUploadPop} action={@code validate} 응답 — {@code rows} 는 입력 행과 1:1(줄 번호 뒤섞임 없음, I7). 아무 행도
 * 저장하지 않는다(dryRun) — 저장 시각이 없다.
 */
public record DataCsvValidateResult(List<DataCsvRow> rows, int insertCount, int updateCount, int noneCount,
                                    int errorCount) {
}
