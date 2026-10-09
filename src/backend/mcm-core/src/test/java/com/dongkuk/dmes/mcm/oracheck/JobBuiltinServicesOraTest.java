package com.dongkuk.dmes.mcm.oracheck;

import static com.dongkuk.dmes.mcm.job.support.JobOasisTestKit.request;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.job.JobRunReport;
import com.dongkuk.dmes.mcm.job.JobModule;
import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.agent.SimpleScheduledJob;
import com.dongkuk.dmes.mcm.job.builtin.JobCodeService;
import com.dongkuk.dmes.mcm.job.builtin.JobCollectService;
import com.dongkuk.dmes.mcm.job.builtin.JobQueryService;
import com.dongkuk.dmes.mcm.job.builtin.collect.HttpCollectSource;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.dmes.mcm.job.support.JobOasisTestKit;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.cactus.oasis.CactusUnwrappingApplicationContext;
import com.dongkuk.dmes.cactus.job.JobServiceInvoker;
import com.dongkuk.oasis.context.DefaultServiceContext;
import com.dongkuk.oasis.service.ServiceResult;
import com.dongkuk.oasis.service.ServiceResultCode;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

class JobBuiltinServicesOraTest {

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private JobOasisTestKit kit;
    private final AtomicReference<com.dongkuk.dmes.mcm.job.agent.JobContext> seenContext = new AtomicReference<>();

    @BeforeAll
    static void tables() {
        McmCoreOraTestDb.ensureMigrated();
        ds = McmCoreOraTestDb.dataSource(McmCoreOraTestDb.APP_USER, "job-builtin");
        jdbc = new JdbcTemplate(ds);
        drop("TABLE T_JOB_Q");
        jdbc.execute("CREATE TABLE T_JOB_Q (ID NUMBER(10), DT DATE, V VARCHAR2(30))");
        jdbc.execute("CREATE OR REPLACE PROCEDURE P_JOB_Q_SLOW(P_ID NUMBER, P_SEC NUMBER) AS BEGIN "
                + "INSERT INTO T_JOB_Q (ID, DT, V) VALUES (P_ID, SYSDATE, 'slow'); DBMS_SESSION.SLEEP(P_SEC); END;");
        // 수집 SQL 은 읽기 전용 트랜잭션이라 방금 만든 표를 DDL 시각 직후에 읽으면 ORA-01466(테이블 정의가 변경되었습니다) 이 난다 — 스냅숏 시각 해상도(약 3초)만큼 기다린다
        sleepQuietly(3_500);
    }

    private static void sleepQuietly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    @AfterAll
    static void dropTables() {
        try {
            drop("PROCEDURE P_JOB_Q_SLOW");
            drop("TABLE T_JOB_Q");
        } finally {
            ds.close();
        }
    }

    private static void drop(String what) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP " + what + (what.startsWith("TABLE") ? " PURGE" : "") + "'; EXCEPTION WHEN OTHERS THEN IF SQLCODE NOT IN (-942, -4043) THEN RAISE; END IF; END;");
    }

    @BeforeEach
    void setUp() {
        jdbc.update("DELETE FROM T_JOB_Q");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (1, DATE '2026-10-08', 'a')");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (2, DATE '2026-10-09', 'b')");
        jdbc.update("INSERT INTO T_JOB_Q VALUES (3, DATE '2026-10-10', 'c')");
        JobCollectSql collectSql = new JobCollectSql(ds);
        kit = new JobOasisTestKit(ds, 2, ctx -> {
            JobHandlerRegistry registry = new JobHandlerRegistry(JobModule.MCM, List.of(
                    new SimpleScheduledJob("mcm.test", JobModule.MCM, "시험", null, Duration.ofMinutes(1), c -> {
                        seenContext.set(c);
                        return 4;
                    })));
            ctx.registerBean("jobCodeService", JobCodeService.class, () -> new JobCodeService(registry));
            ctx.registerBean("jobQueryService", JobQueryService.class, () -> new JobQueryService(ds));
            ctx.registerBean("jobCollectService", JobCollectService.class,
                    () -> new JobCollectService(new SqlCollectSource(collectSql), new HttpCollectSource(host -> false)));
        });
    }

    @AfterEach
    void tearDown() {
        kit.close();
    }

    private int count(String where) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM T_JOB_Q WHERE " + where, Integer.class);
    }

    @Test
    @DisplayName("jobQuery — DML 을 실행하고 DATE 변수는 날짜로 바인드된다. 영향 행 수가 건수 (@OptionalParam 이 비면 null 로 들어와 config 를 쓴다)")
    void queryUpdatesWithTypedBinds() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = :tag WHERE DT >= :fromDt"),
                Map.of("tag", "x", "fromDt", "2026-10-09"), Map.of("fromDt", "DATE")));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(2);
        assertThat(count("V = 'x'")).isEqualTo(2);
    }

    @Test
    @DisplayName("jobQuery — 허용되지 않는 문장(DDL)·값 없는 변수는 USER_ERROR 로 실패하고 아무것도 바뀌지 않는다. 메시지에 문장 원문이 없다")
    void queryRejectsBadStatements() throws Exception {
        JobRunReport ddl = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "DROP TABLE T_JOB_Q"), Map.of(), Map.of()));
        assertThat(ddl.status()).isEqualTo("FAIL");
        assertThat(ddl.msg()).startsWith("USER_ERROR").doesNotContain("T_JOB_Q");
        JobRunReport noVar = kit.run(request("r2", "j2", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = :missing"), Map.of(), Map.of()));
        assertThat(noVar.status()).isEqualTo("FAIL");
        assertThat(noVar.msg()).contains(":missing");
        assertThat(count("1 = 1")).isEqualTo(3);
    }

    @Test
    @DisplayName("jobQuery — 쿼리 시간 초과(남은 시간 1초, 프로시저가 5초 잔다): ORA-01013 → 서비스 트랜잭션 롤백 → TIMEOUT 정확히 1회(감시와 경합해도)")
    void queryTimeoutRollsBackAndReportsOnce() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQuery", 1, Map.of("sql", "BEGIN P_JOB_Q_SLOW(:id, :sec); END;"),
                Map.of("id", 99, "sec", 5), Map.of("id", "NUMBER", "sec", "NUMBER")));
        assertThat(r.status()).isEqualTo("TIMEOUT");
        assertThat(count("ID = 99")).as("시간 초과한 시도의 DML 은 남지 않는다").isZero();
        kit.assertNoMoreReports();
    }

    @Test
    @DisplayName("웹 경로처럼 예약 실행 범위 없이 내장 서비스를 부르면 거절 — 서비스 입력으로 SQL 을 줘도 실행되지 않는다")
    void withoutScopeIsRejected() {
        for (String id : List.of("jobQuery", "jobCode", "jobCollect")) {
            DefaultServiceContext sc = new DefaultServiceContext(new CactusUnwrappingApplicationContext(kit.ctx),
                    JobServiceInvoker.typed(Map.of("action", "run", "sql", "UPDATE T_JOB_Q SET V = 'hack'",
                            "handlerId", "mcm.test", "source", Map.of("kind", "sql"))));
            ServiceResult result = kit.starter.start(id, sc);
            assertThat(result.serviceResultCode()).as(id).isEqualTo(ServiceResultCode.SYSTEM_ERROR);
            assertThat(result.exception()).as(id).isInstanceOf(com.dongkuk.dmes.cactus.job.JobScopeRequiredException.class);
        }
        assertThat(count("V = 'hack'")).isZero();
    }

    @Test
    @DisplayName("jobQuery — 서비스 입력 sql 이 있으면 config 의 sql 보다 우선하고, 입력이 없으면 config 를 쓴다")
    void queryInputBeatsConfig() throws Exception {
        JobRunReport viaInput = kit.run(request("r1", "j1", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = 'cfg' WHERE ID = 1"),
                Map.of("sql", "UPDATE T_JOB_Q SET V = 'inp' WHERE ID = 2"), Map.of()));
        assertThat(viaInput.status()).isEqualTo("OK");
        assertThat(viaInput.itemCnt()).isEqualTo(1);
        assertThat(count("V = 'inp'")).isEqualTo(1);
        assertThat(count("V = 'cfg'")).as("config 문장은 실행되지 않는다").isZero();
        JobRunReport viaConfig = kit.run(request("r2", "j2", "jobQuery", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = 'cfg' WHERE ID = 1"), Map.of(), Map.of()));
        assertThat(viaConfig.status()).isEqualTo("OK");
        assertThat(count("V = 'cfg'")).isEqualTo(1);
    }

    @Test
    @DisplayName("jobQuery — 사용자 BPMN 이 내장 jobQuery 를 서로 다른 sql 입력으로 두 번 호출하면 두 문장이 한 트랜잭션에서 실행되고 건수가 합쳐진다")
    void userBpmnCallsQueryTwiceWithDifferentInputs() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQueryTwice", 30, Map.of("sql", "UPDATE T_JOB_Q SET V = 'cfg'"), Map.of(), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(3);
        assertThat(count("V = 'first'")).isEqualTo(1);
        assertThat(count("V = 'second'")).isEqualTo(2);
        assertThat(count("V = 'cfg'")).as("입력이 있으면 config 문장은 쓰이지 않는다").isZero();
    }

    @Test
    @DisplayName("jobQuery — 두 번째 호출이 실패하면 첫 호출의 변경도 같은 트랜잭션이라 함께 롤백된다")
    void userBpmnSecondCallFailureRollsBackFirst() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobQueryFailsSecond", 30, Map.of(), Map.of(), Map.of()));
        assertThat(r.status()).isEqualTo("FAIL");
        assertThat(count("V = 'first'")).isZero();
        assertThat(count("1 = 1")).isEqualTo(3);
    }

    @Test
    @DisplayName("jobCode — 서비스 입력 handlerId 가 config 의 handlerId 보다 우선한다")
    void codeInputBeatsConfig() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobCode", 30, Map.of("handlerId", "no.such"), Map.of("handlerId", "mcm.test"), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(4);
    }

    @Test
    @DisplayName("jobCollect — 서비스 입력 source·save 가 config 보다 우선한다")
    void collectInputBeatsConfig() throws Exception {
        Map<String, Object> good = Map.of("kind", "sql", "sql", "SELECT V, ID FROM T_JOB_Q ORDER BY ID", "valueField", "ID", "keyField", "V");
        Map<String, Object> badHost = Map.of("kind", "http", "url", "https://secret-host.example.com/x", "items", List.of(Map.of("key", "k", "path", "a")));
        JobRunReport r = kit.run(request("r1", "j1", "jobCollect", 30, Map.of("source", badHost), Map.of("source", good), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.collected()).hasSize(3);
        JobRunReport noSave = kit.run(request("r2", "j2", "jobCollect", 30, Map.of("source", good, "save", true), Map.of("save", false), Map.of()));
        assertThat(noSave.status()).isEqualTo("OK");
        assertThat(noSave.itemCnt()).isEqualTo(3);
        assertThat(noSave.collected()).as("입력 save:false 가 config save:true 보다 우선").isEmpty();
    }

    @Test
    @DisplayName("jobCode — 처리기를 실행하고 반환 건수가 이력 건수, 문맥에 변수·예정 시각이 실린다. 없는 처리기는 USER_ERROR")
    void codeRunsHandler() throws Exception {
        JobRunReport r = kit.run(request("r1", "j1", "jobCode", 30, Map.of("handlerId", "mcm.test"), Map.of("baseDt", "2026-10-09"), Map.of()));
        assertThat(r.status()).isEqualTo("OK");
        assertThat(r.itemCnt()).isEqualTo(4);
        assertThat(seenContext.get().vars()).containsEntry("baseDt", "2026-10-09");
        assertThat(seenContext.get().jobId()).isEqualTo("j1");
        assertThat(seenContext.get().schedAt().toString()).isEqualTo("2026-10-09T02:00");
        JobRunReport missing = kit.run(request("r2", "j2", "jobCode", 30, Map.of("handlerId", "no.such"), Map.of(), Map.of()));
        assertThat(missing.status()).isEqualTo("FAIL");
        assertThat(missing.msg()).contains("처리기를 찾을 수 없습니다");
    }

    @Test
    @DisplayName("jobCollect(sql) — 값이 범위에 담겨 OK 보고에 실리고, save:false 면 읽기만(건수는 남고 값은 안 실림)")
    void collectSqlSavesOrNot() throws Exception {
        Map<String, Object> source = Map.of("kind", "sql", "sql", "SELECT V, ID FROM T_JOB_Q WHERE DT >= :fromDt ORDER BY ID", "valueField", "ID", "keyField", "V");
        JobRunReport saved = kit.run(request("r1", "j1", "jobCollect", 30, Map.of("source", source), Map.of("fromDt", "2026-10-09"), Map.of("fromDt", "DATE")));
        assertThat(saved.status()).isEqualTo("OK");
        assertThat(saved.itemCnt()).isEqualTo(2);
        assertThat(saved.collected()).extracting(v -> v.key()).containsExactly("b", "c");
        JobRunReport readOnly = kit.run(request("r2", "j2", "jobCollect", 30, Map.of("source", source, "save", false), Map.of("fromDt", "2026-10-09"),
                Map.of("fromDt", "DATE")));
        assertThat(readOnly.status()).isEqualTo("OK");
        assertThat(readOnly.itemCnt()).isEqualTo(2);
        assertThat(readOnly.collected()).isEmpty();
    }

    @Test
    @DisplayName("jobCollect — 허용 안 된 호스트·제거된 환율 원천·빈 결과는 USER_ERROR 문구(주소 없음)로 실패")
    void collectFailuresHaveSafeMessages() throws Exception {
        JobRunReport http = kit.run(request("r1", "j1", "jobCollect", 30, Map.of("source", Map.of("kind", "http", "url", "https://secret-host.example.com/x?key=abc",
                "items", List.of(Map.of("key", "k", "path", "a")))), Map.of(), Map.of()));
        assertThat(http.status()).isEqualTo("FAIL");
        assertThat(http.msg()).contains("허용 목록에 없는 호스트").doesNotContain("secret-host").doesNotContain("abc");
        JobRunReport ex = kit.run(request("r2", "j2", "jobCollect", 30, Map.of("source", Map.of("kind", "exchange", "currencies", List.of("USD"))), Map.of(), Map.of()));
        assertThat(ex.msg()).contains("sql·http");
        JobRunReport empty = kit.run(request("r3", "j3", "jobCollect", 30, Map.of("source",
                Map.of("kind", "sql", "sql", "SELECT V, ID FROM T_JOB_Q WHERE 1 = 0", "valueField", "ID", "keyField", "V")), Map.of(), Map.of()));
        assertThat(empty.msg()).contains("수집된 값이 없습니다");
    }
}
