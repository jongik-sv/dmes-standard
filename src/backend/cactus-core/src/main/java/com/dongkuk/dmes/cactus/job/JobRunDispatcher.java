package com.dongkuk.dmes.cactus.job;

import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.util.concurrent.TimeUnit;
import org.springframework.context.ApplicationContext;

/**
 * 예약 실행 진입점 — 새 서비스 유형(설계 §4.4). 공개 API 먼저(다른 레인이 merge 해 간다), 몸체는 다음 커밋에서 채운다.
 */
public class JobRunDispatcher {

    public enum SubmitResult { ACCEPTED, DUPLICATE, JOB_RUNNING, POOL_FULL }

    private final String serverName;

    public JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                            JobRunExecutor executor, String serverName, Clock clock) {
        this(serviceStarter, spring, reporter, executor, serverName, clock, TimeUnit.MINUTES);
    }

    /** 시험이 재시도 대기 단위를 줄이려고 쓴다(운영은 {@code intervalMin} 이 분). */
    JobRunDispatcher(ServiceStarter serviceStarter, ApplicationContext spring, JobRunReporter reporter,
                     JobRunExecutor executor, String serverName, Clock clock, TimeUnit retryUnit) {
        this.serverName = serverName;
    }

    public String serverName() {
        return serverName;
    }

    /** 접수 뒤 실행 풀에 넣는다(비동기). 범위가 이미 열린 스레드에서 부르면 {@link IllegalStateException}. */
    public SubmitResult submit(JobRunRequest req) {
        throw new UnsupportedOperationException("JobRunDispatcher.submit 은 아직 구현 전입니다");
    }
}
