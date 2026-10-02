package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.repository.DailySum;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Split;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

/**
 * action=overview → data.result (계약 C4).
 * 합계·이용자 수는 집계분+원본분을 합쳐 사용자 Set 으로 센다. 일별 추이는 fromDt ~ min(toDt, 오늘) 의 빈 날을 0 으로 채운다.
 * 미사용 화면 수는 unusedDays(기본 90)로 미사용 탭과 같은 규칙(ScreenUsageStatSupport.unusedScreens)을 쓴다.
 */
@Component
public class ScreenUsageOverviewQuery {

    static final int TOP_SCREENS = 10;

    private final ScreenUsageStatSupport support;
    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageOverviewQuery(ScreenUsageStatSupport support, ScreenUsageDayRepository dayRepository) {
        this.support = support;
        this.dayRepository = dayRepository;
    }

    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        Range range = ScreenUsageStatSupport.range(request);
        Filter filter = ScreenUsageStatSupport.filter(request);
        List<UsageSum> sums = support.sums(range, filter);
        Map<String, MenuInfo> menus = support.menus();

        long openCnt = 0;
        long durationMs = 0;
        Set<String> users = new HashSet<>();
        for (UsageSum s : sums) {
            openCnt += s.openCnt();
            durationMs += s.durationMs();
            users.add(s.userId());
        }

        List<Map<String, Object>> pages = new ArrayList<>();
        ScreenUsageStatSupport.groupBy(sums, UsageSum::pageId, UsageTotals::new).forEach((pageId, t) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", pageId);
            row.put("menuNm", ScreenUsageStatSupport.menuNm(pageId, menus));
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            pages.add(row);
        });
        pages.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("pageId")));

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("totalOpenCnt", openCnt);
        result.put("userCnt", (long) users.size());
        result.put("totalDurationMs", durationMs);
        result.put("unusedScreenCnt",
                (long) support.unusedScreens(menus, ScreenUsageStatSupport.unusedDays(request)).size());
        result.put("daily", daily(range, filter));
        result.put("topScreens", new ArrayList<>(pages.subList(0, Math.min(TOP_SCREENS, pages.size()))));
        return result;
    }

    /** 일별 열람·이용자 수·이용 시간 — 집계분은 JPQL, 원본분은 Java 합산(이용자 수는 일자별 Set). */
    private List<Map<String, Object>> daily(Range range, Filter filter) {
        Split split = support.split(range);
        TreeMap<String, long[]> byDt = new TreeMap<>(); // usageDt → {openCnt, userCnt, durationMs}
        if (split.hasDay()) {
            for (DailySum d : dayRepository.sumByDay(
                    ScreenUsageDates.format(split.dayFrom()), ScreenUsageDates.format(split.dayTo()),
                    filter.deptCd(), filter.userId(), filter.pageId())) {
                byDt.put(d.usageDt(), new long[]{d.openCnt(), d.userCnt(), d.durationMs()});
            }
        }
        if (split.hasRaw()) {
            Map<String, Set<String>> usersByDt = new HashMap<>();
            for (ScreenUsageDay d : support.rawDays(split.rawFrom(), split.rawTo(), filter)) {
                long[] v = byDt.computeIfAbsent(d.getUsageDt(), k -> new long[3]);
                v[0] += d.getOpenCnt();
                v[2] += d.getDurationMs();
                usersByDt.computeIfAbsent(d.getUsageDt(), k -> new HashSet<>()).add(d.getUserId());
            }
            usersByDt.forEach((dt, u) -> byDt.get(dt)[1] = u.size());
        }
        LocalDate today = support.today();
        LocalDate last = range.to().isAfter(today) ? today : range.to();
        for (LocalDate d = range.from(); !d.isAfter(last); d = d.plusDays(1)) {
            byDt.putIfAbsent(ScreenUsageDates.format(d), new long[3]);
        }

        List<Map<String, Object>> rows = new ArrayList<>(byDt.size());
        byDt.forEach((dt, v) -> {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("usageDt", dt);
            row.put("openCnt", v[0]);
            row.put("userCnt", v[1]);
            row.put("durationMs", v[2]);
            rows.add(row);
        });
        return rows;
    }
}
