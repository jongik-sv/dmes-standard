package com.dongkuk.dmes.mdm.job;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobContext;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVar.Type;
import java.time.Duration;
import java.util.List;

/**
 * 환율 마스터 동기화 예약 작업({@code mdm.exchangeRateSync}). 일정·변수는 기동 때 DB 에 한 번만 등록되고 이후 정본은 DB 이다.
 * 평일 11:10(KST)은 한국수출입은행이 영업일 11시 이후에 당일 고시분을 주기 때문이다(그 전·휴일에는 빈 결과).
 */
final class ExchangeRateSyncJob implements ScheduledJob {

    static final String ID = "mdm.exchangeRateSync";

    private static final List<JobVar> VARS = List.of(
            new JobVar("lookbackDays", Type.NUMBER, String.valueOf(ExchangeRateSyncService.DEFAULT_LOOKBACK_DAYS),
                    "수집 기간(일): 오늘부터 거슬러 올라갈 일수. 환율 마스터가 비어 있으면 이 값과 무관하게 90일을 한 번 채운다"),
            new JobVar("provider", Type.STRING, "",
                    "비우면 설정 규칙(수출입은행 키가 있으면 koreaexim, 없으면 frankfurter). koreaexim 은 키가 있을 때만 쓴다"));

    private final ExchangeRateSyncService service;

    ExchangeRateSyncJob(ExchangeRateSyncService service) {
        this.service = service;
    }

    @Override
    public String id() {
        return ID;
    }

    @Override
    public JobModule module() {
        return JobModule.MDM;
    }

    @Override
    public String name() {
        return "환율 마스터 동기화";
    }

    @Override
    public String defaultCron() {
        return "10 11 * * 1-5";
    }

    @Override
    public List<JobVar> defaultVars() {
        return VARS;
    }

    @Override
    public Duration defaultTimeout() {
        return Duration.ofMinutes(10);
    }

    @Override
    public int run(JobContext ctx) {
        return service.run(ctx);
    }
}
