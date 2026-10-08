package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.job.JobServiceInvoker;
import com.dongkuk.dmes.cactus.util.TxIdGenerator;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 매분 0초에 깨어나 BPMN 서비스 {@code job^^dispatch} 를 부르는 시계(설계 §4.1). 판정은 하지 않는다. 공용 스케줄러 래퍼(cactus-core
 * {@code JobLoggingTaskScheduler})가 {@code serviceId=sch.mcm.jobDispatchTrigger.tick} 와 service_tag 를 넣고 경계 두 줄을 sch 로그에 남기며, 이 클래스는
 * {@code job^^dispatch} 를 부르는 동안만 MDC {@code serviceId}·{@code txId} 를 바꿔 SQL·bind 줄이 <b>mcm 업무 로그</b>로 가게 하고(설계 §4.8), 돌아오면 되돌린다.
 * (래퍼가 MDC 를 {@code MDCTemplate} 으로 지우므로 여기서는 쓰지 않는다.) 한 틱에 {@code more} 이면 최대 {@value #MAX_ROUNDS} 번 되풀이한다.
 * 호출은 {@code serviceStarter.start} 가 돌아온 뒤(= 커밋 뒤)에만 넘긴다. 실패(결과 비성공·예외)는 선점한 것이 없으므로 연속 첫 번째만 WARN, 복구 때 INFO.
 */
public class JobDispatchTrigger {

    static final String SERVICE_ID = "job^^dispatch";
    static final int MAX_ROUNDS = 10;

    private static final Logger log = LoggerFactory.getLogger(JobDispatchTrigger.class);

    private final ServiceStarter serviceStarter;
    private final ApplicationContext spring;
    private final JobCallSink sink;
    private final int batchSize;
    private final boolean collectEnabled;
    private final AtomicBoolean failing = new AtomicBoolean();

    public JobDispatchTrigger(ServiceStarter serviceStarter, ApplicationContext spring, JobCallSink sink, int batchSize, boolean collectEnabled) {
        this.serviceStarter = serviceStarter;
        this.spring = spring;
        this.sink = sink;
        this.batchSize = batchSize;
        this.collectEnabled = collectEnabled;
    }

    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void tick() {
        String savedServiceId = MDC.get("serviceId");
        String savedTxId = MDC.get("txId");
        try {
            for (int round = 0; round < MAX_ROUNDS; round++) {
                MDC.put("serviceId", SERVICE_ID);
                MDC.put("txId", TxIdGenerator.generate("SCHEDULER", "JOB_DISPATCH"));
                ClaimedBatch batch = claim();
                if (batch == null) break;
                batch.runs().forEach(sink::submit);
                if (!batch.more()) break;
            }
        } finally {
            restore("serviceId", savedServiceId);
            restore("txId", savedTxId);
        }
    }

    private ClaimedBatch claim() {
        long startedAt = System.currentTimeMillis();
        log.info("{}/run", SERVICE_ID);   // OasisServiceExecutor 가 남기는 줄과 같은 문구 — analog 서비스 목록이 읽는다
        try {
            JobDispatchScope.open();
            Map<String, Object> inputs = new LinkedHashMap<>();
            inputs.put("action", "run");
            inputs.put("batchSize", batchSize);
            inputs.put("collectEnabled", collectEnabled ? "Y" : "N");
            ServiceResult result = JobServiceInvoker.start(serviceStarter, spring, SERVICE_ID, inputs, new CactusAudit("SCHEDULER", "JOB_DISPATCH", SERVICE_ID));
            if (result == null || result.serviceResultCode() != ServiceResultCode.SUCCESS) {
                failed(result == null ? "null" : String.valueOf(result.serviceResultCode()));
                return null;
            }
            ClaimedBatch batch = (ClaimedBatch) result.result("claimed").getObject();
            recovered();
            return batch;
        } catch (RuntimeException e) {
            failed(e.getClass().getSimpleName());
            return null;
        } finally {
            JobDispatchScope.close();
            log.info("Service end - service name [{}] RunTime : [{}]", SERVICE_ID, System.currentTimeMillis() - startedAt);
        }
    }

    private void failed(String reason) {
        if (failing.compareAndSet(false, true)) log.warn("예약 작업 판정 실패 — 이 분은 건너뛰고 다음 분에 다시 합니다 결과={}", reason);
    }

    private void recovered() {
        if (failing.compareAndSet(true, false)) log.info("예약 작업 판정이 복구되었습니다");
    }

    private static void restore(String key, String value) {
        if (value == null) MDC.remove(key);
        else MDC.put(key, value);
    }
}
