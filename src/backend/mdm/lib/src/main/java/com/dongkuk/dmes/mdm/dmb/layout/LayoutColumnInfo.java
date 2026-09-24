package com.dongkuk.dmes.mdm.dmb.layout;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 컬럼 사전 한 행 + 도메인 조립기로 파생한 값(TSK-05-02 design.md §2, F1·F5). 컬럼에는 타입·길이 칸이 없어 모두 도메인에서 온다.
 *
 * @param displayName 화면 표시명 = labelLong ?? columnName
 */
public record LayoutColumnInfo(String physName, String columnName, String labelLong, String displayName, Long domainId,
                               String domainName, String dataType, Integer length, Integer scale, String unitCode) {

    /** 컬럼 검색 응답 행(§6.1). */
    public Map<String, Object> toRow() {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("PHYS_NAME", physName);
        row.put("COLUMN_NAME", columnName);
        row.put("LABEL_LONG", labelLong);
        row.put("DISPLAY_NAME", displayName);
        row.put("DOMAIN_ID", domainId);
        row.put("DOMAIN_NAME", domainName);
        row.put("DATA_TYPE", dataType);
        row.put("LENGTH", length);
        row.put("SCALE", scale);
        row.put("UNIT_CODE", unitCode);
        return row;
    }
}
