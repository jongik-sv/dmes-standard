package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.Map;

/** action=overview → data.result. 슬라이스 S1 이 채운다(골격). */
@Component
public class ScreenUsageOverviewQuery {

    private final ScreenUsageStatSupport support;
    private final ScreenUsageDayRepository dayRepository;

    public ScreenUsageOverviewQuery(ScreenUsageStatSupport support, ScreenUsageDayRepository dayRepository) {
        this.support = support;
        this.dayRepository = dayRepository;
    }

    public Map<String, Object> overview(ScreenUsageStatRequest request) {
        return new LinkedHashMap<>();
    }
}
