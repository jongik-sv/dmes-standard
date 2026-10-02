package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=unused → grids.unused. 슬라이스 S5 가 채운다(골격). */
@Component
public class ScreenUsageUnusedQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageUnusedQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> unused(ScreenUsageStatRequest request) {
        return List.of();
    }
}
