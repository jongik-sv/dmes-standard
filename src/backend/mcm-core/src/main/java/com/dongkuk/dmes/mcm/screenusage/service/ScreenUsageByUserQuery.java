package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byUser → grids.users. 슬라이스 S4 가 채운다(골격). */
@Component
public class ScreenUsageByUserQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageLogRepository logRepository;

    public ScreenUsageByUserQuery(ScreenUsageStatSupport support, ScreenUsageLogRepository logRepository) {
        this.support = support;
        this.logRepository = logRepository;
    }

    public List<Map<String, Object>> byUser(ScreenUsageStatRequest request) {
        return List.of();
    }
}
