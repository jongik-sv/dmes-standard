package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.JobModule;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/** 이 앱의 코드 작업 처리기 모음 — 앱 모듈 키와 같은 {@code module()} 의 {@link ScheduledJob} 만 담는다. */
public class JobHandlerRegistry {

    private final Map<String, ScheduledJob> byId = new LinkedHashMap<>();

    public JobHandlerRegistry(JobModule appModule, List<ScheduledJob> jobs) {
        for (ScheduledJob job : jobs) {
            if (job.module() != appModule) continue;
            if (byId.putIfAbsent(job.id(), job) != null) {
                throw new IllegalStateException("예약 작업 처리기 id 가 겹칩니다: " + job.id());
            }
        }
    }

    public Optional<ScheduledJob> find(String id) {
        return id == null ? Optional.empty() : Optional.ofNullable(byId.get(id));
    }

    public List<ScheduledJob> all() {
        return List.copyOf(byId.values());
    }
}
