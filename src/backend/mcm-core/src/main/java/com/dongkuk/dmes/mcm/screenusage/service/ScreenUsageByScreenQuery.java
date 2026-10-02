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

/**
 * action=byScreen → grids.screens (계약 C4). 부서별 탭의 "선택 부서의 화면별" 도 deptCd 를 넣어 이 action 을 쓴다.
 * avgDurationMs 는 열람 1회당 이용 시간이고, 열람(OPEN)이 0 이면 null 이다(메인 결정 U2-2).
 */
@Component
public class ScreenUsageByScreenQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByScreenQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        List<UsageSum> sums = support.sums(ScreenUsageStatSupport.range(request), ScreenUsageStatSupport.filter(request));
        Map<String, MenuInfo> menus = support.menus();

        List<Map<String, Object>> rows = new ArrayList<>();
        ScreenUsageStatSupport.groupBy(sums, UsageSum::pageId, UsageTotals::new).forEach((pageId, t) -> {
            MenuInfo menu = menus.get(pageId);
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", pageId);
            row.put("menuNm", ScreenUsageStatSupport.menuNm(pageId, menus));
            row.put("menuPath", menu != null ? menu.menuPath() : null);
            row.put("openCnt", t.openCnt);
            row.put("userCnt", (long) t.users.size());
            row.put("durationMs", t.durationMs);
            row.put("avgDurationMs", t.openCnt == 0 ? null : t.durationMs / t.openCnt); // 열람 1회당
            row.put("lastUsedDt", t.lastUsedDt);
            rows.add(row);
        });
        rows.sort(ScreenUsageStatSupport.longDesc("openCnt")
                .thenComparing(ScreenUsageStatSupport.longDesc("durationMs"))
                .thenComparing(ScreenUsageStatSupport.text("pageId")));
        return rows;
    }
}
