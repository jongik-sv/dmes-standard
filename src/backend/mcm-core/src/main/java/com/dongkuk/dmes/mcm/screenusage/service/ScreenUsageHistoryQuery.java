package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=history → grids.history. 슬라이스 S6 이 채운다(골격). */
@Component
public class ScreenUsageHistoryQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageHistoryQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> history(ScreenUsageStatRequest request) {
        return List.of();
    }
}
