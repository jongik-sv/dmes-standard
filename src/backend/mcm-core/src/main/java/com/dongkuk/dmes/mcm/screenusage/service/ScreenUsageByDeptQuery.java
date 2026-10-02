package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenMenuCatalog.MenuInfo;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

/**
 * action=byDept → grids.depts (계약 C4). 부서는 기록 시점 스냅숏(집계 키)이다. 부서 없음은 '-' / "(부서 없음)".
 * "선택 부서의 화면별 내역" 은 화면이 byScreen 에 deptCd 를 넣어 부른다(설계 4.5).
 */
@Component
public class ScreenUsageByDeptQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByDeptQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), ScreenUsageStatSupport.filter(request));
        Map<String, MenuInfo> menus = support.menus();
        Map<String, DeptTotals> byDept = ScreenUsageStatSupport.groupBy(sums, UsageSum::deptCd, DeptTotals::new);
        Map<String, String> deptNames = support.deptNames(byDept.keySet());

        List<Map<String, Object>> rows = new ArrayList<>(byDept.size());
        byDept.forEach((deptCd, t) -> {
            String topPageId = t.topPageId();
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("deptCd", deptCd);
            row.put("deptNm", ScreenUsageStatSupport.deptName(deptCd, deptNames));
            row.put("userCnt", (long) t.users.size());
            row.put("openCnt", t.openCnt);
            row.put("durationMs", t.durationMs);
            row.put("topPageId", topPageId);
            row.put("topMenuNm", topPageId == null ? null : ScreenUsageStatSupport.menuNm(topPageId, menus));
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("deptCd")));
        return rows;
    }

    /** 부서 합산 + 화면별 열람·시간 — 최다 이용 화면(열람 → 시간 → pageId 순). */
    static final class DeptTotals extends UsageTotals {
        private final Map<String, long[]> pages = new TreeMap<>();

        @Override
        void add(UsageSum s) {
            super.add(s);
            long[] p = pages.computeIfAbsent(s.pageId(), k -> new long[2]);
            p[0] += s.openCnt();
            p[1] += s.durationMs();
        }

        String topPageId() {
            String top = null;
            long[] best = null;
            for (Map.Entry<String, long[]> e : pages.entrySet()) { // TreeMap 이라 동률이면 pageId 앞선 것이 남는다
                long[] v = e.getValue();
                if (best == null || v[0] > best[0] || (v[0] == best[0] && v[1] > best[1])) {
                    top = e.getKey();
                    best = v;
                }
            }
            return top;
        }
    }
}
