package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * action=history → grids.history (계약 C4). 원본 구간 그대로, 최신순 최대 10,000행.
 * 기간은 시작·종료일 포함 31일까지(DAYS.between(from, to) ≤ 30) — 화면 checkHistoryPeriod 와 같은 식(메인 결정 U2-1).
 */
@Component
public class ScreenUsageHistoryQuery {

    /** 시작·종료일 포함 최대 일수. */
    static final int HISTORY_MAX_DAYS = 31;
    static final int HISTORY_MAX_ROWS = 10_000;

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;
    private final int maxRows;

    @Autowired
    public ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this(support, logRepository, HISTORY_MAX_ROWS);
    }

    /** 테스트용 — 상한을 작게 줘 잘림을 확인한다. */
    ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository, int maxRows) {
        this.support = support;
        this.logRepository = logRepository;
        this.maxRows = maxRows;
    }

    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        Range range = ScreenUsageStatSupport.range(request);
        if (ChronoUnit.DAYS.between(range.from(), range.to()) > HISTORY_MAX_DAYS - 1) {
            throw new BusinessException(ErrorCode.INVALID_VALUE,
                    "이용 이력은 시작·종료일 포함 " + HISTORY_MAX_DAYS + "일까지 조회할 수 있습니다.");
        }
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<ScreenUsageLog> logs = logRepository.findHistory(
                range.from().atStartOfDay(), range.to().plusDays(1).atStartOfDay(),
                filter.userId(), filter.deptCd(), filter.pageId(), PageRequest.of(0, maxRows));
        Map<String, MenuInfo> menus = support.menus();
        Map<String, String> userNames = support.userNames(
                logs.stream().map(ScreenUsageLog::getUserId).collect(Collectors.toSet()));
        Map<String, String> deptNames = support.deptNames(
                logs.stream().map(l -> ScreenUsageAggregator.normalizeDept(l.getDeptCd())).collect(Collectors.toSet()));

        List<Map<String, Object>> rows = new ArrayList<>(logs.size());
        for (ScreenUsageLog l : logs) {
            String deptCd = ScreenUsageAggregator.normalizeDept(l.getDeptCd());
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageId", l.getUsageId());
            row.put("userId", l.getUserId());
            row.put("userNm", userNames.get(l.getUserId()));
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("pageId", l.getPageId());
            row.put("menuNm", ScreenUsageStatSupport.menuNm(l.getPageId(), menus));
            row.put("startKind", l.getStartKind());
            row.put("startedAt", ScreenUsageDates.timestamp(l.getStartedAt()));
            row.put("endedAt", ScreenUsageDates.timestamp(l.getEndedAt()));
            row.put("durationMs", l.getDurationMs());
            row.put("clientIp", l.getClientIp());
            rows.add(row);
        }
        return rows;
    }
}
