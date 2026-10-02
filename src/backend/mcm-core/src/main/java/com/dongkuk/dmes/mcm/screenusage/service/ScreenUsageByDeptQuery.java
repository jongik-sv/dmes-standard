package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;

/** action=byDept → grids.depts. 슬라이스 S3 이 채운다(골격). */
@Component
public class ScreenUsageByDeptQuery {

    private final ScreenUsageStatSupport support;

    public ScreenUsageByDeptQuery(ScreenUsageStatSupport support) {
        this.support = support;
    }

    public List<Map<String, Object>> byDept(ScreenUsageStatRequest request) {
        return List.of();
    }
}
