package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.cactus.job.JobRunRequest;

/** MCM 앱 자신의 작업을 HTTP 없이 접수 쪽으로 넘긴다(설계 §4.3). 실행은 접수 쪽 실행 풀 스레드에서 돌아 호출 스레드의 MDC 를 물려받지 않는다. */
public class LocalJobRunGateway {

    private final JobRunAcceptor acceptor;

    public LocalJobRunGateway(JobRunAcceptor acceptor) {
        this.acceptor = acceptor;
    }

    public AcceptResult call(JobRunRequest request) {
        return acceptor.accept(request);
    }
}
