package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobDispatchScope;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CyclicBarrier;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobDispatchServiceOraTest {

    private static final String NOW_SQL = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    /** 한 해 한 번(1월 1일 0시) — 선점 뒤 다음 회차가 30초 앞당김 창에 들어오지 않아, 같은 시험에서 두 번 선점해도 시각에 따라 흔들리지 않는다. */
    private static final String YEARLY = "0 0 1 1 *";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager jpaTx;   // 운영 txBiz 와 같은 JpaTransactionManager — 「지금 실행」의 바깥 서비스 트랜잭션 대용
    private JobDispatchService service;
    private TransactionTemplate tx;

    @BeforeEach
    void setUp() {
        clean();
        service = new JobDispatchService(dataSource, "MCMAPUSER");
        tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        JobDispatchScope.open();
    }

    @AfterEach
    void clean() {
        JobDispatchScope.close();
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
    }

    private LocalDateTime dbNow() {
        return jdbc.queryForObject("SELECT " + NOW_SQL + " FROM DUAL", Timestamp.class).toLocalDateTime();
    }

    /** NEXT_RUN_AT = DB 지금 + offsetSec 초. */
    private void def(String jobId, String kind, String cron, String varsJson, String configJson, String optsJson, long offsetSec) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, "
                + "TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP, OPTS_JSON) VALUES (?, 'MDM', 'n', ?, 'jobCode', 'run', ?, 'Y', ?, ?, 600, "
                + NOW_SQL + " + NUMTODSINTERVAL(?, 'SECOND'), 'USER', ?)", new Object[] {jobId, kind, cron, configJson, varsJson, offsetSec, optsJson},
                new int[] {Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.CLOB, Types.CLOB, Types.BIGINT, Types.CLOB});
    }

    private ClaimedBatch claim(int batchSize, String collectEnabled) {
        return tx.execute(s -> service.claimDue(batchSize, collectEnabled));
    }

    private Map<String, Object> run(String jobId) {
        return jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = ?", jobId);
    }

    @Test
    @DisplayName("판정 서비스는 트리거가 연 표시가 없으면 거절한다 — 웹 경로로 jobDispatch 를 불러도 선점하지 않는다")
    void rejectsWithoutScope() {
        def("j1", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        JobDispatchScope.close();
        assertThatThrownBy(() -> claim(50, "Y")).isInstanceOf(IllegalStateException.class);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
    }

    @Test
    @DisplayName("할 일이 있으면 RUN 을 INSERT 하고 NEXT_RUN_AT 을 올린다 — 호출에 쓸 값(서비스·설정·변수·시간 초과)은 잠근 행에서 읽는다")
    void claimsDueJob() {
        def("j1", "CODE", "*/10 * * * *", "[{\"name\":\"baseDt\",\"type\":\"DATE\",\"value\":\":today\",\"desc\":\"\"},{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"3\",\"desc\":\"\"}]",
                "{\"handlerId\":\"mdm.sync\"}", null, -5);
        LocalDateTime before = dbNow();

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.more()).isFalse();
        assertThat(batch.runs()).hasSize(1);
        JobRunRequest r = batch.runs().get(0);
        assertThat(r.jobId()).isEqualTo("j1");
        assertThat(r.module()).isEqualTo("MDM");
        assertThat(r.serviceId()).isEqualTo("jobCode");
        assertThat(r.action()).isEqualTo("run");
        assertThat(r.config()).containsEntry("handlerId", "mdm.sync");
        assertThat(r.timeoutSec()).isEqualTo(600);
        assertThat(r.manual()).isFalse();
        assertThat(r.inputs().get("baseDt")).isEqualTo(r.schedAtTime().toLocalDate().toString());   // SCHED_AT 기준
        assertThat(r.inputs().get("n")).hasToString("3");
        assertThat(r.varTypes()).containsEntry("baseDt", "DATE").containsEntry("n", "NUMBER");
        assertThat(r.retry()).isNull();

        Map<String, Object> row = run("j1");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(row.get("RUN_ID")).isEqualTo(r.runId());
        assertThat(row.get("TRIGGER_TP")).isEqualTo("S");
        assertThat(row.get("SERVICE_ID")).isEqualTo("jobCode");
        assertThat(((Number) row.get("TIMEOUT_SEC")).intValue()).isEqualTo(600);
        assertThat(String.valueOf(row.get("VARS_JSON"))).contains("baseDt");
        assertThat(((Timestamp) row.get("SCHED_AT")).toLocalDateTime()).isEqualTo(r.schedAtTime());
        assertThat(r.schedAtTime().getNano()).isZero();
        LocalDateTime next = jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'j1'", Timestamp.class).toLocalDateTime();
        assertThat(next).isAfter(before).isAfter(r.schedAtTime());
        assertThat(next.getMinute() % 10).isZero();
    }

    @Test
    @DisplayName("할 일이 없는 틱은 SQL 한 문장(색인 조회)뿐이다 — 잠금 조회·INSERT 없음")
    void emptyTickRunsOneStatement() {
        def("future", "CODE", "0 2 * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        CountingDataSource counting = new CountingDataSource(dataSource);
        JobDispatchService s = new JobDispatchService(counting, "MCMAPUSER");
        ClaimedBatch batch = new TransactionTemplate(new DataSourceTransactionManager(counting)).execute(st -> s.claimDue(50, "Y"));
        assertThat(batch.runs()).isEmpty();
        assertThat(batch.more()).isFalse();
        assertThat(counting.statements()).isEqualTo(1);
    }

    @Test
    @DisplayName("MCM 두 대(서로 다른 연결)가 같은 분에 동시에 선점해도 한 회차는 정확히 한 번 — 20회 반복")
    void twoInstancesRaceForOneRun() throws Exception {
        try (HikariDataSource other = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "job-claim-b")) {
            JobDispatchService a = service;
            JobDispatchService b = new JobDispatchService(other, "MCMAPUSER");
            TransactionTemplate txA = tx;
            TransactionTemplate txB = new TransactionTemplate(new DataSourceTransactionManager(other));
            for (int i = 0; i < 20; i++) {
                jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
                jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
                def("race", "CODE", YEARLY, null, "{\"handlerId\":\"h\"}", null, -2);
                CyclicBarrier go = new CyclicBarrier(2);
                CompletableFuture<ClaimedBatch> fa = CompletableFuture.supplyAsync(() -> race(go, txA, a));
                CompletableFuture<ClaimedBatch> fb = CompletableFuture.supplyAsync(() -> race(go, txB, b));
                int claimed = fa.get().runs().size() + fb.get().runs().size();
                assertThat(claimed).as("반복 %d: 두 인스턴스가 받은 실행 수", i).isEqualTo(1);
                assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'race'", Integer.class)).isEqualTo(1);
            }
        }
    }

    private static ClaimedBatch race(CyclicBarrier go, TransactionTemplate tx, JobDispatchService s) {
        try {
            go.await();
            JobDispatchScope.open();
            return tx.execute(st -> s.claimDue(50, "Y"));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        } finally {
            JobDispatchScope.close();
        }
    }

    @Test
    @DisplayName("오래 꺼졌다 켜진 뒤(2분 넘게 늦은 회차)는 따라잡지 않는다 — SKIP 1건 + 다음 미래 시각, 사이 회차 행 없음")
    void lateRunIsSkipped() {
        def("late", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        ClaimedBatch batch = claim(50, "Y");
        assertThat(batch.runs()).isEmpty();
        Map<String, Object> row = run("late");
        assertThat(row.get("STATUS")).isEqualTo("SKIP");
        assertThat(row.get("MSG")).isEqualTo("놓친 회차를 건너뜀");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'late'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'late'", Timestamp.class).toLocalDateTime()).isAfter(dbNow());
    }

    private void misfireOn(String jobId) {
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET MISFIRE_RUN_YN = 'Y' WHERE JOB_ID = ?", jobId);
    }

    @Test
    @DisplayName("옵션 칸(MISFIRE_RUN_YN)은 INSERT 에서 빠뜨려도 기본 'N' 이다 — 코드 작업 등록·옛 INSERT 가 옵션을 켜지 않는다")
    void misfireColumnDefaultsToN() {
        def("dflt", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        assertThat(jdbc.queryForObject("SELECT MISFIRE_RUN_YN FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'dflt'", String.class)).isEqualTo("N");
    }

    @Test
    @DisplayName("놓친 회차 한 번 실행(Y): 3시간 늦은 회차는 SKIP 하지 않고 RUN 한 건(TRIGGER_TP='C', SCHED_AT=놓친 첫 회차) — 사이 회차 행은 없고 다음 시각은 미래, 다음 틱은 다시 실행하지 않는다")
    void misfireRunsLateSlotOnce() {
        def("mf", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        misfireOn("mf");
        Timestamp missedFirst = schedOf("mf");   // 놓친 첫 회차 = 지금의 NEXT_RUN_AT 을 초 단위로 버린 값

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).hasSize(1);
        JobRunRequest r = batch.runs().get(0);
        assertThat(r.jobId()).isEqualTo("mf");
        assertThat(r.manual()).isFalse();
        Map<String, Object> row = run("mf");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(row.get("TRIGGER_TP")).isEqualTo("C");
        assertThat(row.get("RUN_ID")).isEqualTo(r.runId());
        assertThat(((Timestamp) row.get("SCHED_AT")).toLocalDateTime()).isEqualTo(missedFirst.toLocalDateTime());
        assertThat(r.schedAtTime()).isEqualTo(missedFirst.toLocalDateTime());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'mf'", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mf'", Timestamp.class).toLocalDateTime()).isAfter(dbNow());
        assertThat(claim(50, "Y").runs()).isEmpty();   // 여러 회차를 놓쳤어도 한 번뿐
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'mf'", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("놓친 회차 한 번 실행(Y)이어도 겹침 규칙은 그대로다 — 이전 회차가 실행 중이면 SKIP 「이전 회차 실행 중」(TRIGGER_TP='S')")
    void misfireStillSkipsOnOverlap() {
        def("mfo", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        misfireOn("mfo");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('mfo', TIMESTAMP '2020-01-01 00:00:00', 'S', 'old-run', 'MDM', 'jobCode', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)");

        assertThat(claim(50, "Y").runs()).isEmpty();

        Map<String, Object> skip = jdbc.queryForMap("SELECT TRIGGER_TP, MSG FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'mfo' AND STATUS = 'SKIP'");
        assertThat(skip.get("MSG")).isEqualTo("이전 회차 실행 중");
        assertThat(skip.get("TRIGGER_TP")).isEqualTo("S");
        assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mfo'", Timestamp.class).toLocalDateTime()).isAfter(dbNow());
    }

    @Test
    @DisplayName("옵션이 켜져도 제때 도는 회차는 그대로 일정 RUN(TRIGGER_TP='S')이다 — 'C' 는 늦은 회차에만")
    void misfireOptionDoesNotChangeOnTimeRuns() {
        def("mft", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        misfireOn("mft");
        assertThat(claim(50, "Y").runs()).hasSize(1);
        assertThat(run("mft").get("TRIGGER_TP")).isEqualTo("S");
    }

    @Test
    @DisplayName("놓친 회차 실행 'C' 가 이미 있는 회차 PK 를 만나도 예외 없이 건너뛰고 NEXT_RUN_AT 을 올린다 — 다른 작업은 정상 선점")
    void misfireOnExistingSlotDoesNotPoisonBatch() {
        def("dupM", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        misfireOn("dupM");
        def("okM", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('dupM', ?, 'C', 'prev-c', 'MDM', 'jobCode', 'OK')", schedOf("dupM"));

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("okM");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'dupM'", Integer.class)).isEqualTo(1);
        assertThat(nextRunAt("dupM").toLocalDateTime()).isAfter(dbNow());
    }

    @Test
    @DisplayName("지금 실행은 놓친 회차 옵션과 무관하다 — 옵션이 Y 여도 TRIGGER_TP='M' 이고 NEXT_RUN_AT 은 그대로")
    void manualRunIgnoresMisfireOption() {
        def("mfm", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        misfireOn("mfm");
        Timestamp nextBefore = nextRunAt("mfm");

        JobDispatchService.ManualClaim claim = service.claimManual("mfm", "u1", null);

        assertThat(claim.rejectReason()).isNull();
        assertThat(run("mfm").get("TRIGGER_TP")).isEqualTo("M");
        assertThat(nextRunAt("mfm")).isEqualTo(nextBefore);
    }

    @Test
    @DisplayName("같은 작업의 이전 회차가 RUN(시간 초과 + 정리 여유 안)이면 SKIP 「이전 회차 실행 중」")
    void overlapIsSkipped() {
        def("busy", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('busy', TIMESTAMP '2020-01-01 00:00:00', 'S', 'old-run', 'MDM', 'jobCode', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)");
        ClaimedBatch batch = claim(50, "Y");
        assertThat(batch.runs()).isEmpty();
        assertThat(jdbc.queryForObject("SELECT MSG FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'busy' AND STATUS = 'SKIP'", String.class)).isEqualTo("이전 회차 실행 중");
    }

    @Test
    @DisplayName("사용 중지는 후보가 아니고, collectEnabled=N 이면 COLLECT 작업도 후보가 아니다")
    void filters() {
        def("on", "CODE", YEARLY, null, "{\"handlerId\":\"h\"}", null, -5);
        def("off", "CODE", YEARLY, null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET USE_YN = 'N' WHERE JOB_ID = 'off'");
        def("col", "COLLECT", YEARLY, null, "{\"source\":{}}", null, -5);
        assertThat(claim(50, "N").runs()).extracting(JobRunRequest::jobId).containsExactly("on");
        assertThat(claim(50, "Y").runs()).extracting(JobRunRequest::jobId).containsExactly("col");
    }

    @Test
    @DisplayName("깨진 정의 한 건(CONFIG_JSON 손상·읽을 수 없는 crontab·변수 오류)은 그 행만 FAIL 「정의 오류」로 남기고 다른 작업의 선점을 막지 않는다")
    void brokenDefinitionDoesNotBlockOthers() {
        def("badjson", "CODE", "*/10 * * * *", null, "{bad", null, -5);
        def("badcron", "CODE", "0 9 1 * 1", null, "{\"handlerId\":\"h\"}", null, -5);
        def("badvar", "CODE", "*/10 * * * *", "[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"abc\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        def("good", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("good");
        for (String bad : List.of("badjson", "badcron", "badvar")) {
            Map<String, Object> row = run(bad);
            assertThat(row.get("STATUS")).as(bad).isEqualTo("FAIL");
            assertThat(String.valueOf(row.get("MSG"))).as(bad).startsWith("정의 오류");
            assertThat(jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = ?", Timestamp.class, bad).toLocalDateTime())
                    .as(bad + " 다음 시각을 미룬다").isAfter(dbNow());
        }
    }

    @Test
    @DisplayName(":prevRunAt 은 직전 정상 「일정」 회차(TRIGGER_TP='S'·놓친 회차 'C')의 예정 시각만 쓴다 — 「지금 실행」(M)은 구간을 당기지 않는다")
    void prevRunAtIgnoresManualRuns() {
        def("pv", "CODE", "*/10 * * * *", "[{\"name\":\"p\",\"type\":\"DATE\",\"value\":\":prevRunAt\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 09:00:00', 'S', 'r-s', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 10:00:00', 'M', 'r-m', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 11:00:00', 'S', 'r-f', 'MDM', 'jobCode', 'FAIL')");
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.inputs().get("p")).isEqualTo("2026-10-08T09:00:00");
    }

    @Test
    @DisplayName(":prevRunAt 은 정상으로 끝난 놓친 회차 실행(C)도 직전 일정 회차로 본다")
    void prevRunAtCountsMissedRuns() {
        def("pc", "CODE", "*/10 * * * *", "[{\"name\":\"p\",\"type\":\"DATE\",\"value\":\":prevRunAt\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pc', TIMESTAMP '2026-10-08 09:00:00', 'S', 'r-s', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pc', TIMESTAMP '2026-10-08 10:00:00', 'C', 'r-c', 'MDM', 'jobCode', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pc', TIMESTAMP '2026-10-08 11:00:00', 'M', 'r-m', 'MDM', 'jobCode', 'OK')");
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.inputs().get("p")).isEqualTo("2026-10-08T10:00:00");
    }

    @Test
    @DisplayName("재시도 설정이 있으면 RUN 의 TIMEOUT_SEC 에 재시도 시간까지 더하고, 요청은 시도 하나의 시간 초과와 재시도를 싣는다")
    void retryExtendsRecordedTimeout() {
        def("rt", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", "{\"retry\":{\"count\":2,\"intervalMin\":5}}", -5);
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.timeoutSec()).isEqualTo(600);
        assertThat(r.retry()).isEqualTo(new JobRunRequest.Retry(2, 5));
        assertThat(((Number) run("rt").get("TIMEOUT_SEC")).intValue()).isEqualTo(600 + 2 * (600 + 5 * 60));
    }

    @Test
    @DisplayName("한 틱 후보 120건은 50·50·20 으로 나눠 되풀이한다(more) — 묶음마다 자기 트랜잭션, SKIP 없음")
    void batchesOf50() {
        for (int i = 0; i < 120; i++) def("b" + i, "CODE", YEARLY, null, "{\"handlerId\":\"h\"}", null, -5);
        List<Integer> sizes = new ArrayList<>();
        List<Boolean> more = new ArrayList<>();
        for (int round = 0; round < 5; round++) {
            ClaimedBatch b = claim(50, "Y");
            sizes.add(b.runs().size());
            more.add(b.more());
            if (!b.more()) break;
        }
        assertThat(sizes).containsExactly(50, 50, 20);
        assertThat(more).containsExactly(true, true, false);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'RUN'", Integer.class)).isEqualTo(120);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE STATUS = 'SKIP'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("DB 시계는 KST 로 읽는다 — SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' 이 서울 벽시계와 1분 안")
    void dbClockIsKst() {
        assertThat(Duration.between(dbNow(), LocalDateTime.now(ZoneId.of("Asia/Seoul"))).abs()).isLessThan(Duration.ofMinutes(1));
    }

    // ── 「지금 한 번 실행」(claimManual, 설계 §4.9) ──

    private Timestamp nextRunAt(String jobId) {
        return jdbc.queryForObject("SELECT NEXT_RUN_AT FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = ?", Timestamp.class, jobId);
    }

    private int manualRuns(String jobId) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = ? AND TRIGGER_TP = 'M'", Integer.class, jobId);
    }

    @Test
    @DisplayName("지금 실행은 판정 표시 없이 TRIGGER_TP='M' RUN 1행을 만들고 NEXT_RUN_AT 은 그대로 둔다 — SCHED_AT 은 DB 시각(초), 요청자 기록")
    void manualClaimRecordsRun() {
        JobDispatchScope.close();   // 화면 서비스가 부른다 — 판정 표시가 없어도 된다
        def("mn", "CODE", "*/10 * * * *", "[{\"name\":\"baseDt\",\"type\":\"DATE\",\"value\":\":today\",\"desc\":\"\"}]",
                "{\"handlerId\":\"h\"}", null, 3600);
        Timestamp nextBefore = nextRunAt("mn");
        LocalDateTime before = dbNow().withNano(0);

        JobDispatchService.ManualClaim claim = service.claimManual("mn", "u1", null);

        assertThat(claim.rejectReason()).isNull();
        JobRunRequest r = claim.request();
        assertThat(r.manual()).isTrue();
        assertThat(r.userId()).isEqualTo("u1");
        assertThat(r.serviceId()).isEqualTo("jobCode");
        assertThat(r.schedAtTime()).isAfterOrEqualTo(before);
        assertThat(r.inputs().get("baseDt")).isEqualTo(r.schedAtTime().toLocalDate().toString());
        Map<String, Object> row = run("mn");
        assertThat(row.get("TRIGGER_TP")).isEqualTo("M");
        assertThat(row.get("STATUS")).isEqualTo("RUN");
        assertThat(row.get("RUN_ID")).isEqualTo(r.runId());
        assertThat(row.get("REQ_USR_ID")).isEqualTo("u1");
        assertThat(row.get("C_USR_ID")).isEqualTo("u1");
        assertThat(row.get("C_SVC_ID")).isEqualTo("jobSchedMng");
        assertThat(((Timestamp) row.get("SCHED_AT")).toLocalDateTime()).isEqualTo(r.schedAtTime());
        assertThat(r.schedAtTime().getNano()).isZero();
        assertThat(nextRunAt("mn")).isEqualTo(nextBefore);
    }

    @Test
    @DisplayName("같은 작업이 RUN(시간 초과 + 정리 여유 안)이면 거절하고 행을 만들지 않는다")
    void manualRejectsWhileRunning() {
        def("mb", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('mb', TIMESTAMP '2020-01-01 00:00:00', 'S', 'old-run', 'MDM', 'jobCode', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)");
        JobDispatchService.ManualClaim claim = service.claimManual("mb", "u1", null);
        assertThat(claim.request()).isNull();
        assertThat(claim.rejectReason()).isEqualTo("이미 실행 중인 작업입니다");
        assertThat(manualRuns("mb")).isZero();
    }

    @Test
    @DisplayName("없는 작업은 거절한다")
    void manualRejectsUnknownJob() {
        JobDispatchService.ManualClaim claim = service.claimManual("nope", "u1", null);
        assertThat(claim.request()).isNull();
        assertThat(claim.rejectReason()).isEqualTo("작업을 찾을 수 없습니다");
    }

    @Test
    @DisplayName("변수 덮어쓰기는 이번 한 번만 — 이력 VARS_JSON 에 남고 정의는 그대로, 형에 안 맞는 값은 거절")
    void manualOverridesAreRecordedOnce() {
        def("mo", "CODE", "*/10 * * * *", "[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"3\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, 3600);

        JobDispatchService.ManualClaim bad = service.claimManual("mo", "u1", Map.of("n", "abc"));
        assertThat(bad.request()).isNull();
        assertThat(bad.rejectReason()).isNotBlank();
        assertThat(manualRuns("mo")).isZero();

        JobDispatchService.ManualClaim claim = service.claimManual("mo", "u1", Map.of("n", "7", "undeclared", "x"));
        assertThat(claim.rejectReason()).isNull();
        assertThat(claim.request().inputs().get("n")).hasToString("7");
        assertThat(claim.request().inputs()).doesNotContainKey("undeclared");
        assertThat(String.valueOf(run("mo").get("VARS_JSON"))).contains("7");
        assertThat(jdbc.queryForObject("SELECT VARS_JSON FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mo'", String.class)).contains("\"3\"");
    }

    @Test
    @DisplayName("RUN 행은 별도 트랜잭션(REQUIRES_NEW)에서 커밋된다 — 바깥 서비스 트랜잭션(JPA)이 롤백돼도 남는다")
    void manualClaimSurvivesOuterRollback() {
        def("mr", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        JobDispatchService.ManualClaim claim = new TransactionTemplate(jpaTx).execute(st -> {
            JobDispatchService.ManualClaim c = service.claimManual("mr", "u1", null);
            st.setRollbackOnly();
            return c;
        });
        assertThat(claim.rejectReason()).isNull();
        assertThat(manualRuns("mr")).isEqualTo(1);
    }

    @Test
    @DisplayName("다른 트랜잭션이 정의 행을 잠그고 있으면 5초 기다린 뒤 거절한다(FOR UPDATE WAIT 5) — 예외가 아니라 거절 사유")
    void manualRejectsWhenDefinitionLocked() throws Exception {
        def("ml", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, 3600);
        try (HikariDataSource other = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "job-manual-lock");
             Connection c = other.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement("SELECT JOB_ID FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'ml' FOR UPDATE")) {
                ps.executeQuery().close();
            }
            JobDispatchService.ManualClaim claim = service.claimManual("ml", "u1", null);
            assertThat(claim.request()).isNull();
            assertThat(claim.rejectReason()).startsWith("다른 요청이");
            c.rollback();
        }
        assertThat(manualRuns("ml")).isZero();
    }

    // ── 독약 행: 한 행의 손상·PK 중복이 묶음 전체를 롤백시키지 않는다(리뷰 I-1·M-1) ──

    /** 그 작업의 지금 NEXT_RUN_AT 을 초 단위로 버린 값 = 판정이 쓸 SCHED_AT. */
    private Timestamp schedOf(String jobId) {
        return Timestamp.valueOf(nextRunAt(jobId).toLocalDateTime().withNano(0));
    }

    @Test
    @DisplayName("겹침 SKIP 갈래가 이미 있는 회차 PK 를 만나도 예외 없이 건너뛰고 NEXT_RUN_AT 을 올린다 — 다른 작업은 정상 선점")
    void overlapSkipOnExistingSlotDoesNotPoisonBatch() {
        def("dupO", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        def("okO", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        // 같은 회차 (dupO, sched, 'S') 가 이미 RUN 으로 있다 — 선점된 회차로 NEXT_RUN_AT 이 되돌아온 상황
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('dupO', ?, 'S', 'prev-run', 'MDM', 'jobCode', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)", schedOf("dupO"));

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("okO");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'dupO'", Integer.class)).isEqualTo(1);
        assertThat(nextRunAt("dupO").toLocalDateTime()).isAfter(dbNow());
    }

    @Test
    @DisplayName("늦은 회차 SKIP 갈래가 이미 있는 회차 PK 를 만나도 예외 없이 건너뛰고 NEXT_RUN_AT 을 올린다 — 다른 작업은 정상 선점")
    void lateSkipOnExistingSlotDoesNotPoisonBatch() {
        def("dupL", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -3 * 3600);
        def("okL", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('dupL', ?, 'S', 'prev-ok', 'MDM', 'jobCode', 'OK')", schedOf("dupL"));

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("okL");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'dupL'", Integer.class)).isEqualTo(1);
        assertThat(nextRunAt("dupL").toLocalDateTime()).isAfter(dbNow());
    }

    @Test
    @DisplayName("앞으로 오는 시각이 없는 crontab(2월 30일)은 그 행만 FAIL 「정의 오류」, NEXT_RUN_AT 은 한 시간 뒤 — 다른 작업은 정상 선점")
    void cronWithoutFutureTimeIsBrokenDefinition() {
        def("never", "CODE", "0 0 30 2 *", null, "{\"handlerId\":\"h\"}", null, -5);
        def("okN", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        LocalDateTime before = dbNow();

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("okN");
        Map<String, Object> row = run("never");
        assertThat(row.get("STATUS")).isEqualTo("FAIL");
        assertThat(row.get("MSG")).isEqualTo("정의 오류: crontab 식에 앞으로 오는 시각이 없습니다");   // 식은 읽히고 next() 가 null
        assertThat(nextRunAt("never").toLocalDateTime()).isAfter(before.plusMinutes(59));
    }

    @Test
    @DisplayName("VARS_JSON 이 '[null]' 처럼 손상돼도 그 행만 FAIL 「정의 오류」 — 다른 작업은 정상 선점")
    void nullVarElementIsBrokenDefinition() {
        def("nullvar", "CODE", "*/10 * * * *", "[null]", "{\"handlerId\":\"h\"}", null, -5);
        def("okV", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);

        ClaimedBatch batch = claim(50, "Y");

        assertThat(batch.runs()).extracting(JobRunRequest::jobId).containsExactly("okV");
        Map<String, Object> row = run("nullvar");
        assertThat(row.get("STATUS")).isEqualTo("FAIL");
        assertThat(String.valueOf(row.get("MSG"))).startsWith("정의 오류");
        assertThat(nextRunAt("nullvar").toLocalDateTime()).isAfter(dbNow());
    }
}
