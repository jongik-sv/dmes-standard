package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * action=byUser → grids.users (계약 C4). 사용자당 1행, 부서는 기간 안 마지막 이용 구간의 부서(C4 보충 3).
 * 일 단위로 먼저 가리고, 마지막 이용일에 부서가 둘 이상이면 집계 테이블에는 시각이 없으므로 그날 원본(1년 보관)에서
 * 같은 조건으로 가장 늦게 시작한 구간 1건을 읽어 정한다.
 */
@Component
public class ScreenUsageByUserQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageByUserQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), filter);
        Map<String, UserTotals> byUser = ScreenUsageStatSupport.groupBy(sums, UsageSum::userId, UserTotals::new);

        Map<String, String> deptByUser = new HashMap<>();
        byUser.forEach((userId, t) -> deptByUser.put(userId, lastSegmentDept(userId, t, filter)));
        Map<String, String> userNames = support.userNames(byUser.keySet());
        Map<String, String> deptNames = support.deptNames(new HashSet<>(deptByUser.values()));

        List<Map<String, Object>> rows = new ArrayList<>(byUser.size());
        byUser.forEach((userId, t) -> {
            String deptCd = deptByUser.get(userId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("userId", userId);
            row.put("userNm", userNames.get(userId));
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            row.put("lastUsedDt", t.lastUsedDt);
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("userId")));
        return rows;
    }

    /** 마지막 이용일의 부서가 하나면 그대로, 둘 이상이면 그날 원본에서 가장 늦게 시작한 구간의 부서. */
    private String lastSegmentDept(String userId, UserTotals t, Filter filter) {
        String first = t.latestDepts.iterator().next();
        if (t.latestDepts.size() == 1) {
            return first;
        }
        LocalDate day = ScreenUsageDates.parseDt(t.lastUsedDt);
        List<ScreenUsageLog> last = logRepository.findHistory(day.atStartOfDay(), day.plusDays(1).atStartOfDay(),
                userId, filter.deptCd(), filter.pageId(), PageRequest.of(0, 1));
        return last.isEmpty() ? first : ScreenUsageAggregator.normalizeDept(last.get(0).getDeptCd());
    }

    /** 사용자 합산 + 마지막 이용일에 쓰인 부서들(하나면 확정, 둘 이상이면 원본으로 가린다). */
    static final class UserTotals extends UsageTotals {
        final Set<String> latestDepts = new TreeSet<>();

        @Override
        void add(UsageSum s) {
            String before = lastUsedDt;
            super.add(s);
            if (before == null || s.lastUsedDt().compareTo(before) > 0) {
                latestDepts.clear();
                latestDepts.add(s.deptCd());
            } else if (s.lastUsedDt().equals(before)) {
                latestDepts.add(s.deptCd());
            }
        }
    }
}
