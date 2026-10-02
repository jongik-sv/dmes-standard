package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UnusedScreen;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * action=unused → grids.unused (계약 C4). 기간 파라미터는 무시하고 unusedDays(기본 90)만 쓴다.
 * 판정 규칙은 개요의 미사용 수와 같아야 하므로 ScreenUsageStatSupport.unusedScreens 에 둔다.
 */
@Component
public class ScreenUsageUnusedQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageUnusedQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (UnusedScreen u : support.unusedScreens(support.menus(), ScreenUsageStatSupport.unusedDays(request))) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("pageId", u.menu().pageId());
            row.put("menuNm", u.menu().menuNm());
            row.put("menuPath", u.menu().menuPath());
            row.put("lastUsedDt", u.lastUsedDt());
            rows.add(row);
        }
        return rows;
    }
}
