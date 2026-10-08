package com.dongkuk.dmes.mcm.job.server;

import java.util.List;
import javax.sql.DataSource;

/** BPMN {@code job^^dispatch} 의 서비스 태스크 몸체 — 색인 조회와 선점(설계 §4.1·§4.2). 몸체는 다음 커밋에서 채운다. */
public class JobDispatchService {

    public JobDispatchService(DataSource dataSource, String schema) {
    }

    public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
        JobDispatchScope.require();
        return new ClaimedBatch(List.of(), false);
    }
}
