package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.oasis.exceptions.UserException;
import java.util.LinkedHashMap;
import java.util.Map;

/** 내장 서비스 {@code jobCode}(설계 §5.1) — 등록된 {@link ScheduledJob} 빈 하나를 실행한다. 예약 실행 범위가 없으면(웹 호출 등) 거절한다. */
public class JobCodeService {

    private final JobHandlerRegistry registry;

    public JobCodeService(JobHandlerRegistry registry) {
        this.registry = registry;
    }

    /**
     * 입력 파라미터를 받지 않는다 — OASIS 바인더가 없는 파라미터를 묶지 못해(MethodNotFoundException) 서비스 입력을 config 보다
     * 우선하는 길은 막혔다(계획 「설계와 다름」). 처리기 id·입력은 모두 진입점이 config 에 실은 정의 값으로 읽는다.
     */
    public Map<String, Object> run() {
        JobRunScope scope = JobRunScope.require();
        String id = String.valueOf(scope.config().get("handlerId"));
        ScheduledJob job = registry.find(id).orElseThrow(() -> new UserException("처리기를 찾을 수 없습니다: " + id));
        int n = job.run(new JobContext(scope.jobId(), scope.runId(), scope.vars(), scope.schedAt(), scope.manual()));
        scope.addItems(n);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", n);
        return out;
    }
}
