package com.dongkuk.dmes.mcm.job.builtin;

import com.dongkuk.dmes.cactus.job.JobRunScope;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.oasis.exceptions.UserException;
import com.dongkuk.oasis.methodinvoker.annotations.OptionalParam;
import java.util.LinkedHashMap;
import java.util.Map;

/** 내장 서비스 {@code jobCode}(설계 §5.1) — 등록된 {@link ScheduledJob} 빈 하나를 실행한다. 예약 실행 범위가 없으면(웹 호출 등) 거절한다. */
public class JobCodeService {

    private final JobHandlerRegistry registry;

    public JobCodeService(JobHandlerRegistry registry) {
        this.registry = registry;
    }

    /**
     * 서비스 입력 {@code handlerId} 가 있으면 그것을, 없으면 실행 범위의 정의 설정(config)을 쓴다(설계 §5.1) — 사용자 BPMN 이 호출마다 다른 처리기를 줄 수 있다.
     * 입력이 없는 호출도 묶이려면 BPMN 서비스 태스크에 {@code opt} 속성으로 이 이름을 선택 파라미터로 알려야 한다(어노테이션은 표지일 뿐 바인더는 {@code opt} 를 본다).
     */
    public Map<String, Object> run(@OptionalParam String handlerId) {
        JobRunScope scope = JobRunScope.require();
        String id = String.valueOf(handlerId == null || handlerId.isBlank() ? scope.config().get("handlerId") : handlerId);
        ScheduledJob job = registry.find(id).orElseThrow(() -> new UserException("처리기를 찾을 수 없습니다: " + id));
        int n = job.run(new JobContext(scope.jobId(), scope.runId(), scope.vars(), scope.schedAt(), scope.manual()));
        scope.addItems(n);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("itemCnt", n);
        return out;
    }
}
