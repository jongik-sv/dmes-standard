package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 원본 구간 → 일별 집계 키 (USAGE_DT, PAGE_ID, USER_ID, DEPT_CD) 합산. 롤업(일자 확정)과 통계(미집계 일자 원본 합산)가
 * 같은 규칙을 쓰도록 한 곳에 둔다. 자정을 걸친 구간은 STARTED_AT 일자에 귀속, 부서 없음은 '-'.
 */
final class ScreenUsageAggregator {

    static final String NO_DEPT = "-";

    private ScreenUsageAggregator() {}

    static List<ScreenUsageDay> sumByDayKey(List<ScreenUsageLog> logs) {
        Map<ScreenUsageDayId, ScreenUsageDay> acc = new LinkedHashMap<>();
        for (ScreenUsageLog l : logs) {
            ScreenUsageDayId key = new ScreenUsageDayId(
                    ScreenUsageDates.usageDt(l.getStartedAt()), l.getPageId(), l.getUserId(), normalizeDept(l.getDeptCd()));
            acc.computeIfAbsent(key, ScreenUsageDay::of)
                    .accumulate("OPEN".equals(l.getStartKind()), l.getDurationMs());
        }
        return new ArrayList<>(acc.values());
    }

    static String normalizeDept(String deptCd) {
        return deptCd == null || deptCd.isBlank() ? NO_DEPT : deptCd;
    }
}
