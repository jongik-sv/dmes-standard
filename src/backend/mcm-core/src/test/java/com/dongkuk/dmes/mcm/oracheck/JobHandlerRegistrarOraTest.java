package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistrar;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.ScheduledJob;
import com.dongkuk.dmes.mcm.job.agent.SimpleScheduledJob;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Timestamp;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobHandlerRegistrarOraTest {

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private static ScheduledJob job(String id, JobModule module, String cron) {
        return new SimpleScheduledJob(id, module, id + " 이름", cron, Duration.ofMinutes(10), c -> 0);
    }

    private JobHandlerRegistrar registrar(DataSource ds, JobModule app, ScheduledJob... jobs) {
        return new JobHandlerRegistrar(ds, "MCMAPUSER", new JobHandlerRegistry(app, List.of(jobs)), Duration.ofMillis(50));
    }

    @Test
    @DisplayName("처리기는 HANDLER 에 MERGE, 기본 일정이 있는 처리기만 DEF 에 CODE 작업으로 INSERT — 다른 모듈의 빈은 등록하지 않는다")
    void registersHandlersAndDefaultJobs() {
        int n = registrar(dataSource, JobModule.MCM,
                job("mcm.rollup", JobModule.MCM, "0 2 * * *"), job("mcm.manual", JobModule.MCM, null), job("mdm.other", JobModule.MDM, "0 1 * * *")).register();

        assertThat(n).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT HANDLER_ID FROM MCMAPUSER.TB_MCM_JOB_HANDLER ORDER BY HANDLER_ID", String.class))
                .containsExactly("mcm.manual", "mcm.rollup");
        Map<String, Object> def = jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'");
        assertThat(def.get("MODULE_CD")).isEqualTo("MCM");
        assertThat(def.get("JOB_KIND")).isEqualTo("CODE");
        assertThat(def.get("SERVICE_ID")).isEqualTo("jobCode");
        assertThat(def.get("ACTION")).isEqualTo("run");
        assertThat(def.get("OWNER_TP")).isEqualTo("CODE");
        assertThat(def.get("USE_YN")).isEqualTo("Y");
        assertThat(def.get("CRON_EXPR")).isEqualTo("0 2 * * *");
        assertThat(((Number) def.get("TIMEOUT_SEC")).intValue()).isEqualTo(600);
        assertThat(String.valueOf(def.get("CONFIG_JSON"))).contains("\"handlerId\"").contains("mcm.rollup");
        assertThat((Timestamp) def.get("NEXT_RUN_AT")).isAfter(new Timestamp(System.currentTimeMillis() - 60_000));
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.manual'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("다시 기동해도 화면에서 바꾼 일정·사용 여부는 덮어쓰지 않는다 — HANDLER 의 SEEN_AT 만 갱신")
    void doesNotOverwriteScreenValues() {
        JobHandlerRegistrar r = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        r.register();
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET CRON_EXPR = '0 5 * * *', USE_YN = 'N' WHERE JOB_ID = 'mcm.rollup'");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_HANDLER SET SEEN_AT = TIMESTAMP '2020-01-01 00:00:00' WHERE HANDLER_ID = 'mcm.rollup'");

        r.register();

        Map<String, Object> def = jdbc.queryForMap("SELECT CRON_EXPR, USE_YN FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'");
        assertThat(def.get("CRON_EXPR")).isEqualTo("0 5 * * *");
        assertThat(def.get("USE_YN")).isEqualTo("N");
        assertThat(jdbc.queryForObject("SELECT SEEN_AT FROM MCMAPUSER.TB_MCM_JOB_HANDLER WHERE HANDLER_ID = 'mcm.rollup'", Timestamp.class))
                .isAfter(Timestamp.valueOf("2026-01-01 00:00:00"));
    }

    @Test
    @DisplayName("기본 변수는 HANDLER·DEF 의 VARS_JSON 에 JSON 으로 들어간다")
    void defaultVarsAreStored() {
        ScheduledJob withVars = new SimpleScheduledJob("mcm.v", JobModule.MCM, "v", "0 3 * * *", Duration.ofMinutes(1),
                List.of(new JobVar("baseDt", JobVar.Type.DATE, ":yesterday", "기준일")), c -> 0);
        registrar(dataSource, JobModule.MCM, withVars).register();
        assertThat(jdbc.queryForObject("SELECT VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_HANDLER WHERE HANDLER_ID = 'mcm.v'", String.class)).contains("baseDt").contains(":yesterday");
        assertThat(jdbc.queryForObject("SELECT VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.v'", String.class)).contains("baseDt");
    }

    @Test
    @DisplayName("id 형식이 틀리거나 기본 일정을 읽을 수 없는 처리기는 건너뛴다 — 기동을 막지 않고 나머지는 등록한다")
    void skipsBadHandlers() {
        int n = registrar(dataSource, JobModule.MCM,
                job("bad id!", JobModule.MCM, "0 2 * * *"), job("mcm.badcron", JobModule.MCM, "0 9 1 * 1"), job("mcm.ok", JobModule.MCM, "0 4 * * *")).register();
        assertThat(n).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT HANDLER_ID FROM MCMAPUSER.TB_MCM_JOB_HANDLER", String.class)).containsExactly("mcm.ok");
    }

    @Test
    @DisplayName("같은 앱 두 대가 동시에 기동해도 DEF·HANDLER 행은 하나 — 동시 INSERT 로 한쪽이 실패해도 registerWithRetry 가 한 번 더 해서 끝난다")
    void concurrentStartupInsertsOneDefRow() throws Exception {
        JobHandlerRegistrar a = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        JobHandlerRegistrar b = registrar(dataSource, JobModule.MCM, job("mcm.rollup", JobModule.MCM, "0 2 * * *"));
        CountDownLatch go = new CountDownLatch(1);
        Thread t1 = new Thread(() -> startWhenReleased(go, a));
        Thread t2 = new Thread(() -> startWhenReleased(go, b));
        t1.start();
        t2.start();
        go.countDown();
        t1.join();
        t2.join();
        Thread.sleep(500);   // 재시도(지연 50ms) 끝날 시간
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mcm.rollup'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_HANDLER", Integer.class)).isEqualTo(1);
    }

    private static void startWhenReleased(CountDownLatch go, JobHandlerRegistrar r) {
        try {
            go.await();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            return;
        }
        r.registerWithRetry();
    }

    @Test
    @DisplayName("모듈 사용자(MDMAPUSER)로 접속해도 등록된다 — V3 의 GRANT(로컬은 ANY TABLE)")
    void worksAsModuleUser() {
        try (HikariDataSource mdm = McmCoreOraTestDb.dataSource("MDMAPUSER", "job-registrar-mdm")) {
            assertThat(registrar(mdm, JobModule.MDM, job("mdm.sync", JobModule.MDM, "0 1 * * *")).register()).isEqualTo(1);
        }
        assertThat(jdbc.queryForObject("SELECT MODULE_CD FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mdm.sync'", String.class)).isEqualTo("MDM");
    }

    @Test
    @DisplayName("JOB 표가 없거나 닿지 못해도 registerWithRetry 는 예외를 던지지 않고, 지연 뒤 딱 한 번 더 시도한다")
    void registerWithRetryNeverThrowsAndRetriesOnce() throws Exception {
        AtomicInteger attempts = new AtomicInteger();
        JobHandlerRegistrar failing = new JobHandlerRegistrar(dataSource, "MCMAPUSER", new JobHandlerRegistry(JobModule.MCM, List.of(job("mcm.a", JobModule.MCM, "0 2 * * *"))),
                Duration.ofMillis(50)) {
            @Override
            public int register() {
                attempts.incrementAndGet();
                throw new IllegalStateException("jdbc:oracle://secret-host/db password=hunter2");
            }
        };
        failing.registerWithRetry();
        Thread.sleep(400);
        assertThat(attempts.get()).isEqualTo(2);
    }

    @Test
    @DisplayName("처리기가 하나도 없는 앱은 DB 에 닿지 않는다")
    void noHandlersNoDbAccess() {
        DataSource boom = new org.springframework.jdbc.datasource.AbstractDataSource() {
            @Override
            public java.sql.Connection getConnection() {
                throw new AssertionError("DB 에 닿으면 안 된다");
            }

            @Override
            public java.sql.Connection getConnection(String u, String p) {
                return getConnection();
            }
        };
        assertThat(registrar(boom, JobModule.MDM).register()).isZero();
    }
}
