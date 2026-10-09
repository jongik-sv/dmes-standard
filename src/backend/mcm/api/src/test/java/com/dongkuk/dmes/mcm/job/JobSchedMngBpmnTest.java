package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.CactusRequestConverter;
import com.dongkuk.dmes.cactus.oasis.CactusResponseConverter;
import com.dongkuk.dmes.cactus.oasis.OasisAutoConfiguration;
import com.dongkuk.dmes.cactus.oasis.OasisProperties;
import com.dongkuk.dmes.cactus.oasis.OasisServiceExecutor;
import com.dongkuk.dmes.cactus.tx.CactusTxProperties;
import com.dongkuk.dmes.cactus.web.request.CactusRequest;
import com.dongkuk.dmes.cactus.web.request.RequestMeta;
import com.dongkuk.dmes.cactus.web.response.CactusResponse;
import com.dongkuk.dmes.mcm.common.security.SecurityIdentity;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.server.JobDefStore;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.job.server.JobSchedMngService;
import com.dongkuk.dmes.mcm.testdb.McmOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.PlatformTransactionManager;

/** 실제 services/csa/jobSchedMng.bpmn 을 OASIS 실행기로 돌려 action 분기·DTO 바인딩·응답 data.result 를 확인한다. */
class JobSchedMngBpmnTest {

    private static HikariDataSource ds;
    private static GenericApplicationContext ctx;
    private static OasisServiceExecutor executor;

    @BeforeAll
    static void start() {
        McmOraTestDb.resetSchemas();
        ds = McmOraTestDb.dataSource(McmOraTestDb.APP_USER, "job-mng-bpmn");
        SecurityIdentity identity = Mockito.mock(SecurityIdentity.class);
        Mockito.when(identity.requireUserId()).thenReturn("admin");
        ctx = new GenericApplicationContext();
        ctx.registerBean("txBiz", PlatformTransactionManager.class, () -> new DataSourceTransactionManager(ds));
        ctx.registerBean("jobSchedMngService", JobSchedMngService.class, () -> new JobSchedMngService(new JobDefStore(ds, "MCMAPUSER"),
                new JobDispatchService(ds, "MCMAPUSER"), request -> { }, new JobCollectSql(ds), Duration.ofMillis(200), identity));
        ctx.refresh();
        OasisProperties props = new OasisProperties();
        props.setTransactional(true);
        props.setServicePath("/services");
        CactusTxProperties tx = new CactusTxProperties();
        tx.getManagers().put("txBiz", new CactusTxProperties.TxMgrConfig());
        tx.setDefaultManager("txBiz");
        executor = new OasisServiceExecutor(new OasisAutoConfiguration().serviceStarter(props, tx, ctx), ctx, new CactusRequestConverter(), new CactusResponseConverter());
    }

    @AfterAll
    static void stop() {
        ctx.close();
        ds.close();
    }

    private static CactusRequest request(Map<String, Object> params) {
        return new CactusRequest(new RequestMeta("admin", "jobSchedMng"), new HashMap<>(params), Map.of());
    }

    @Test
    @DisplayName("cronPreview → data.result.valid/desc/next, save → data.result.def, list → data.result.jobs, delete — 10개 action 중 대표 흐름")
    @SuppressWarnings("unchecked")
    void actionsThroughOasis() {
        new JdbcTemplate(ds).update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        new JdbcTemplate(ds).update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        new JdbcTemplate(ds).update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");

        CactusResponse preview = executor.execute("jobSchedMng", "cronPreview", request(Map.of("expr", "0 2 * * *")));
        assertThat(preview.getMeta().success()).as(preview.getMeta().message()).isTrue();
        Map<String, Object> pv = (Map<String, Object>) preview.getData().get("result");
        assertThat(pv).containsEntry("valid", true).containsEntry("desc", "매일 02:00");

        Map<String, Object> save = new HashMap<>();
        save.put("jobId", "mcm.q1");
        save.put("moduleCd", "MCM");
        save.put("jobNm", "시험 쿼리");
        save.put("jobKind", "QUERY");
        save.put("cronExpr", "*/10 * * * *");
        save.put("useYn", "Y");
        save.put("timeoutSec", 600);
        save.put("configJson", "{\"sql\":\"UPDATE T_X SET V = 1\"}");
        CactusResponse saved = executor.execute("jobSchedMng", "save", request(save));
        assertThat(saved.getMeta().success()).as(saved.getMeta().message()).isTrue();
        Map<String, Object> def = (Map<String, Object>) ((Map<String, Object>) saved.getData().get("result")).get("def");
        assertThat(def).containsEntry("jobId", "mcm.q1").containsEntry("serviceId", "jobQuery");

        CactusResponse list = executor.execute("jobSchedMng", "list", request(Map.of()));
        List<Map<String, Object>> jobs = (List<Map<String, Object>>) ((Map<String, Object>) list.getData().get("result")).get("jobs");
        assertThat(jobs).extracting(j -> j.get("jobId")).containsExactly("mcm.q1");

        CactusResponse bad = executor.execute("jobSchedMng", "save", request(Map.of("jobId", "x y")));
        assertThat(bad.getMeta().success()).isFalse();
        assertThat(bad.getMeta().message()).contains("작업 ID");

        CactusResponse deleted = executor.execute("jobSchedMng", "delete", request(Map.of("jobId", "mcm.q1")));
        assertThat(deleted.getMeta().success()).as(deleted.getMeta().message()).isTrue();
    }

    @Test
    @DisplayName("collectData → data.result.rows/truncated/nextBeforeSlot/latestSlot/count (days·limit·itemKey·latestOnly·beforeSlot 바인딩), 수집 작업이 아니면 거절")
    @SuppressWarnings("unchecked")
    void collectDataThroughOasis() {
        JdbcTemplate jdbc = new JdbcTemplate(ds);
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mcm.col', 'MCM', '수집', 'COLLECT', 'jobCollect', 'run', '*/5 * * * *', 'Y', '{}', 600, 'USER')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mcm.q', 'MCM', '쿼리', 'QUERY', 'jobQuery', 'run', '*/10 * * * *', 'Y', '{}', 600, 'USER')");
        String older = java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmm").format(java.time.LocalDateTime.now().minusHours(2));
        String newer = java.time.format.DateTimeFormatter.ofPattern("yyyyMMddHHmm").format(java.time.LocalDateTime.now().minusHours(1));
        for (String slot : List.of(older, newer)) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT) VALUES ('mcm.col', ?, 'USD', 1350.5, NULL)", slot);
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT) VALUES ('mcm.col', ?, 'JPY', NULL, 'n/a')", slot);
        }

        CactusResponse all = executor.execute("jobSchedMng", "collectData", request(Map.of("jobId", "mcm.col", "days", 7)));
        assertThat(all.getMeta().success()).as(all.getMeta().message()).isTrue();
        Map<String, Object> res = (Map<String, Object>) all.getData().get("result");
        assertThat(res).containsEntry("count", 4).containsEntry("truncated", false);
        assertThat(((List<Map<String, Object>>) res.get("rows"))).extracting(r -> r.get("slot") + "/" + r.get("itemKey"))
                .containsExactly(newer + "/JPY", newer + "/USD", older + "/JPY", older + "/USD");

        Map<String, Object> p = new HashMap<>();
        p.put("jobId", "mcm.col");
        p.put("limit", 2);
        p.put("itemKey", "USD");
        Map<String, Object> page = (Map<String, Object>) executor.execute("jobSchedMng", "collectData", request(p)).getData().get("result");
        assertThat(page).containsEntry("count", 2).containsEntry("truncated", false);

        p.remove("itemKey");
        Map<String, Object> first = (Map<String, Object>) executor.execute("jobSchedMng", "collectData", request(p)).getData().get("result");
        assertThat(first).containsEntry("count", 2).containsEntry("truncated", true).containsEntry("nextBeforeSlot", newer);
        p.put("beforeSlot", newer);
        Map<String, Object> second = (Map<String, Object>) executor.execute("jobSchedMng", "collectData", request(p)).getData().get("result");
        assertThat(second).containsEntry("count", 2).containsEntry("truncated", false);

        Map<String, Object> latest = new HashMap<>();
        latest.put("jobId", "mcm.col");
        latest.put("latestOnly", true);
        Map<String, Object> lres = (Map<String, Object>) executor.execute("jobSchedMng", "collectData", request(latest)).getData().get("result");
        assertThat(lres).containsEntry("latestSlot", newer).containsEntry("count", 2);

        CactusResponse notCollect = executor.execute("jobSchedMng", "collectData", request(Map.of("jobId", "mcm.q")));
        assertThat(notCollect.getMeta().success()).isFalse();
        assertThat(notCollect.getMeta().message()).contains("수집 작업이 아닙니다.");

        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
    }
}
