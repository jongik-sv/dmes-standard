package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.server.ClaimedBatch;
import com.dongkuk.dmes.mcm.job.server.JobDispatchScope;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
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
import org.springframework.transaction.support.TransactionTemplate;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobDispatchServiceOraTest {

    private static final String NOW_SQL = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    /** 한 해 한 번(1월 1일 0시) — 선점 뒤 다음 회차가 30초 앞당김 창에 들어오지 않아, 같은 시험에서 두 번 선점해도 시각에 따라 흔들리지 않는다. */
    private static final String YEARLY = "0 0 1 1 *";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
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
                + "TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP, OPTS_JSON) VALUES (?, 'MDM', 'n', ?, 'job^^code', 'run', ?, 'Y', ?, ?, 600, "
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
    @DisplayName("판정 서비스는 트리거가 연 표시가 없으면 거절한다 — 웹 경로로 job^^dispatch 를 불러도 선점하지 않는다")
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
        assertThat(r.serviceId()).isEqualTo("job^^code");
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
        assertThat(row.get("SERVICE_ID")).isEqualTo("job^^code");
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

    @Test
    @DisplayName("같은 작업의 이전 회차가 RUN(시간 초과 + 정리 여유 안)이면 SKIP 「이전 회차 실행 중」")
    void overlapIsSkipped() {
        def("busy", "CODE", "*/10 * * * *", null, "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('busy', TIMESTAMP '2020-01-01 00:00:00', 'S', 'old-run', 'MDM', 'job^^code', 'RUN', " + NOW_SQL + " - INTERVAL '10' SECOND, 600)");
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
    @DisplayName(":prevRunAt 은 직전 정상 「일정」 회차(TRIGGER_TP='S')의 예정 시각만 쓴다 — 「지금 실행」(M)은 구간을 당기지 않는다")
    void prevRunAtIgnoresManualRuns() {
        def("pv", "CODE", "*/10 * * * *", "[{\"name\":\"p\",\"type\":\"DATE\",\"value\":\":prevRunAt\",\"desc\":\"\"}]", "{\"handlerId\":\"h\"}", null, -5);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 09:00:00', 'S', 'r-s', 'MDM', 'job^^code', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 10:00:00', 'M', 'r-m', 'MDM', 'job^^code', 'OK')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('pv', TIMESTAMP '2026-10-08 11:00:00', 'S', 'r-f', 'MDM', 'job^^code', 'FAIL')");
        JobRunRequest r = claim(50, "Y").runs().get(0);
        assertThat(r.inputs().get("p")).isEqualTo("2026-10-08T09:00:00");
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
}
