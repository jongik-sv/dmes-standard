package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/**
 * 화면 사용 통계 조회 — OASIS {@code screenUsageStat} (설계 4.5, 계약 C4) 퍼사드.
 * action 하나를 탭별 쿼리 클래스 하나로 넘기기만 한다. 탭 구현은 각 쿼리 클래스(슬라이스 S1~S6) 몫이다.
 * {@code @Transactional} 미부착 — OASIS 진입점(6-B-1).
 */
@Service("screenUsageStatService")
public class ScreenUsageStatService {

    private final ScreenUsageOverviewQuery overviewQuery;
    private final ScreenUsageByScreenQuery byScreenQuery;
    private final ScreenUsageByDeptQuery byDeptQuery;
    private final ScreenUsageByUserQuery byUserQuery;
    private final ScreenUsageUnusedQuery unusedQuery;
    private final ScreenUsageHistoryQuery historyQuery;

    public ScreenUsageStatService(ScreenUsageOverviewQuery overviewQuery,
                                  ScreenUsageByScreenQuery byScreenQuery,
                                  ScreenUsageByDeptQuery byDeptQuery,
                                  ScreenUsageByUserQuery byUserQuery,
                                  ScreenUsageUnusedQuery unusedQuery,
                                  ScreenUsageHistoryQuery historyQuery) {
        this.overviewQuery = overviewQuery;
        this.byScreenQuery = byScreenQuery;
        this.byDeptQuery = byDeptQuery;
        this.byUserQuery = byUserQuery;
        this.unusedQuery = unusedQuery;
        this.historyQuery = historyQuery;
    }

    /** action=overview → data.result */
    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        return overviewQuery.overview(request);
    }

    /** action=byScreen → grids.screens */
    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        return byScreenQuery.byScreen(request);
    }

    /** action=byDept → grids.depts */
    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        return byDeptQuery.byDept(request);
    }

    /** action=byUser → grids.users */
    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        return byUserQuery.byUser(request);
    }

    /** action=unused → grids.unused (기간 파라미터 무시) */
    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        return unusedQuery.unused(request);
    }

    /** action=history → grids.history */
    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        return historyQuery.history(request);
    }
}
