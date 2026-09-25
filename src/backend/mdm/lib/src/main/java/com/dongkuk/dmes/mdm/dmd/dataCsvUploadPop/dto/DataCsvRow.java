package com.dongkuk.dmes.mdm.dmd.dataCsvUploadPop.dto;

import java.util.List;

/**
 * CSV 한 줄의 검증 결과 — {@code lineNo} 는 헤더를 1 로 센 레코드 번호(batch.sapdict.SapCsv.Row 와 같은 규약, 인용부호 안
 * 개행이 있어도 레코드 단위로 센다). {@code action} 은 파서 오류 행이면 {@code "-"}, 그 외엔
 * {@link com.dongkuk.dmes.mdm.contract.data.MdmTemporalSegmentAction} 이름 문자열(INSERT/UPDATE/NONE 중 하나 — CSV 는
 * CLOSE·REOPEN 을 만들지 않는다, I3). {@code issues} 는 이 줄에서 난 오류 문구(파서 오류 또는 검사 1~7 메시지).
 */
public record DataCsvRow(int lineNo, String code, String action, List<String> issues) {

    public DataCsvRow {
        issues = issues == null ? List.of() : List.copyOf(issues);
    }
}
