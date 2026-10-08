package com.dongkuk.dmes.mcm.job.support;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobRunDispatcher;
import com.dongkuk.dmes.cactus.job.JobRunExecutor;
import com.dongkuk.dmes.cactus.job.JobRunReport;
import com.dongkuk.dmes.cactus.job.JobRunReporter;
import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.oasis.service.ServiceStarter;
import java.time.Clock;
import java.util.Map;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Consumer;
import javax.sql.DataSource;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 내장 서비스·판정 시험용 조립 — 운영과 같은 OASIS 서비스 기동기 + 예약 실행 진입점 + 보고 기록용 가짜. */
public final class JobOasisTestKit implements AutoCloseable {

    public final GenericApplicationContext ctx = new GenericApplicationContext();
    public final BlockingQueue<JobRunReport> reports = new LinkedBlockingQueue<>();
    public final ServiceStarter starter;
    public final JobRunDispatcher dispatcher;
    private final JobRunExecutor executor;

    public JobOasisTestKit(DataSource dataSource, int poolSize, Consumer<GenericApplicationContext> beans) {
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(dataSource));
        beans.accept(ctx);
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
        executor = new JobRunExecutor(poolSize);
        JobRunReporter reporter = r -> {
            reports.add(r);
            return WriteResult.WRITTEN;
        };
        dispatcher = new JobRunDispatcher(starter, ctx, reporter, executor, "test-srv", Clock.systemDefaultZone());
    }

    public static JobRunRequest request(String runId, String jobId, String serviceId, int timeoutSec, Map<String, Object> config,
                                        Map<String, Object> inputs, Map<String, String> varTypes) {
        return new JobRunRequest(runId, jobId, "MCM", serviceId, "run", inputs, varTypes, config, timeoutSec, null, "2026-10-09T02:00:00", false, null);
    }

    /** 접수 → 결과 보고까지 기다린다. */
    public JobRunReport run(JobRunRequest request) throws InterruptedException {
        assertThat(dispatcher.submit(request)).isEqualTo(JobRunDispatcher.SubmitResult.ACCEPTED);
        JobRunReport r = reports.poll(20, TimeUnit.SECONDS);
        assertThat(r).as("결과 보고가 오지 않았다").isNotNull();
        return r;
    }

    public void assertNoMoreReports() throws InterruptedException {
        assertThat(reports.poll(500, TimeUnit.MILLISECONDS)).as("회차마다 결과 갱신은 1회").isNull();
    }

    @Override
    public void close() {
        executor.close();
        ctx.close();
    }
}
