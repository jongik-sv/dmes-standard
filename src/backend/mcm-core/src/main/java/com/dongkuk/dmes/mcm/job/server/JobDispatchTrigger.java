package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.oasis.service.ServiceStarter;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;

/** 매분 0초에 깨어나 BPMN 서비스 {@code job^^dispatch} 를 부르는 시계(설계 §4.1). 몸체는 다음 커밋에서 채운다. */
public class JobDispatchTrigger {

    private final ServiceStarter serviceStarter;
    private final ApplicationContext spring;
    private final JobCallSink sink;
    private final int batchSize;
    private final boolean collectEnabled;

    public JobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext spring, JobCallSink sink, int batchSize, boolean collectEnabled) {
        this.serviceStarter = serviceStarter;
        this.spring = spring;
        this.sink = sink;
        this.batchSize = batchSize;
        this.collectEnabled = collectEnabled;
    }

    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void tick() {
    }
}
