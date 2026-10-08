package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobServiceInvoker;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobDispatchScope;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.dongkuk.oasis.service.ServiceStarter;
import com.zaxxer.hikari.HikariDataSource;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 실제 {@code services/job/job^^dispatch^^claimDue.bpmn}(서비스 ID {@code job^^dispatch} — OASIS 는 파일 이름의 마지막 {@code ^^} 뒤를 설명으로 버린다) 을 OASIS 트랜잭션으로 돌려 본다 — 커밋 뒤에야 호출이 나간다·실패는 선점 0·웹 경로 거절(설계 §9). */
class JobDispatchBpmnIntegrationTest {

    private static final String NOW_SQL = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private static GenericApplicationContext ctx;
    private static ServiceStarter starter;
    private static volatile boolean explode;

    @BeforeAll
    static void start() {
        McmOraTestDb.resetSchemas();
        ds = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-dispatch-bpmn");
        jdbc = new JdbcTemplate(ds);
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        ctx.registerBean("jobDispatchService", JobDispatchService.class, () -> new JobDispatchService(ds, "MCMAPUSER") {
            @Override
            public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
                ClaimedBatch batch = super.claimDue(batchSize, collectEnabled);
                if (explode) throw new IllegalStateException("시험용 실패(선점 뒤)");
                return batch;
            }
        });
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        starter = new OasisAutoConfiguration().serviceStarter(props, tx, ctx);
    }

    @AfterAll
    static void stop() {
        ctx.close();
        ds.close();
    }

    @BeforeEach
    void seed() {
        explode = false;
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP) "
                + "VALUES ('j1', 'MDM', 'n', 'CODE', 'job^^code', 'run', '*/10 * * * *', 'Y', '{\"handlerId\":\"h\"}', 60, " + NOW_SQL + " - INTERVAL '5' SECOND, 'USER')");
    }

    private ServiceResult start(boolean withScope) {
        if (withScope) JobDispatchScope.open();
        try {
            return JobServiceInvoker.start(starter, ctx, "job^^dispatch",
                    Map.of("action", "run", "batchSize", 50, "collectEnabled", "Y"), new CactusAudit("SCHEDULER", "JOB_DISPATCH", "job^^dispatch"));
        } finally {
            JobDispatchScope.close();
        }
    }

    @Test
    @DisplayName("서비스가 돌아온 시점에 RUN 행은 이미 커밋돼 있다(다른 연결에서 보인다) — 호출은 이 뒤에만 나간다")
    void claimedRowsAreCommittedWhenStartReturns() {
        ServiceResult result = start(true);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SUCCESS);
        ClaimedBatch batch = (ClaimedBatch) result.result("claimed").getObject();
        assertThat(batch.runs()).hasSize(1);
        try (HikariDataSource other = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-dispatch-other")) {
            assertThat(new JdbcTemplate(other).queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'RUN'", Integer.class)).isEqualTo(1);
        }
    }

    @Test
    @DisplayName("몸체가 선점한 뒤 실패하면 OASIS 가 롤백해 선점한 것이 없다 — RUN 행 없음·NEXT_RUN_AT 그대로")
    void failureRollsEverythingBack() {
        explode = true;
        ServiceResult result = start(true);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE NEXT_RUN_AT <= " + NOW_SQL, Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("웹 경로(표시 없음)로 job^^dispatch 를 부르면 거절되고 선점하지 않는다")
    void webPathIsRejected() {
        ServiceResult result = start(false);
        assertThat(result.serviceResultCode()).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
        assertThat(result.exception()).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
    }
}
