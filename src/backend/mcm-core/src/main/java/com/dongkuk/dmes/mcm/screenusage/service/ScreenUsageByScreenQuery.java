package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byScreen → grids.screens. 슬라이스 S2 가 채운다(골격). */
@Component
public class ScreenUsageByScreenQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByScreenQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byScreen(ScreenUsageStatRequest request) {
        return List.of();
    }
}
