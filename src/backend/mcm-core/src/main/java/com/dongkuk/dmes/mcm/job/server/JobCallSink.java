package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;

/** 선점한 실행을 모듈에 보내는 쪽 — 트랜잭션 밖 호출 풀({@code JobCaller})이 구현한다. 호출은 비동기이고 이 메서드는 빨리 돌아온다. */
public interface JobCallSink {

    void submit(JobRunRequest request);
}
