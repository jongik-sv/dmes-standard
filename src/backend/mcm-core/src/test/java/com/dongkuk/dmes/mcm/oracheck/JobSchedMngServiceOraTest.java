package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.job.builtin.collect.JobCollectSql;
import com.dongkuk.dmes.mcm.job.server.JobCallSink;
import com.dongkuk.dmes.mcm.job.server.JobDefStore;
import com.dongkuk.dmes.mcm.job.server.JobDispatchService;
import com.dongkuk.dmes.mcm.job.server.JobSchedMngService;
import com.dongkuk.dmes.mcm.job.server.dto.JobSchedMngRequest;
import java.sql.Timestamp;
import java.time.Duration;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobSchedMngServiceOraTest {

    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    private JobSchedMngService service;
    private final List<JobRunRequest> submitted = new ArrayList<>();
    private final JobCallSink sink = submitted::add;

    @BeforeEach
    void setUp() {
        clean();
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM, SEEN_AT) VALUES ('mdm.sync', 'MDM', '동기화', " + NOW + ")");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM, SEEN_AT) VALUES ('mdm.old', 'MDM', '옛 처리기', " + NOW + " - INTERVAL '10' DAY)");
        JobDefStore store = new JobDefStore(dataSource, "MCMAPUSER");
        service = new JobSchedMngService(store, new JobDispatchService(dataSource, "MCMAPUSER"), sink, new JobCollectSql(dataSource), Duration.ofMillis(300), null);
        submitted.clear();
    }

    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private static JobSchedMngRequest req(String jobId, String module, String kind, String cron) {
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setJobId(jobId);
        r.setModuleCd(module);
        r.setJobNm("이름 " + jobId);
        r.setJobKind(kind);
        r.setCronExpr(cron);
        r.setUseYn("Y");
        r.setTimeoutSec(600);
        return r;
    }

    private static JobSchedMngRequest queryReq(String jobId) {
        JobSchedMngRequest r = req(jobId, "MDM", "QUERY", "*/10 * * * *");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = :v WHERE D = :d\"}");
        r.setVarsJson("[{\"name\":\"v\",\"type\":\"STRING\",\"value\":\"x\",\"desc\":\"\"},{\"name\":\"d\",\"type\":\"DATE\",\"value\":\":today\",\"desc\":\"\"}]");
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> def(Map<String, Object> result) {
        return (Map<String, Object>) result.get("def");
    }

    private Map<String, Object> row(String jobId) {
        return jdbc.queryForMap("SELECT * FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = ?", jobId);
    }

    @Test
    @DisplayName("QUERY 저장 — 서비스 ID 는 jobQuery·Action run 으로 정하고, NEXT_RUN_AT 은 다음 미래 시각, 출처는 USER")
    void saveQueryJob() {
        Map<String, Object> saved = def(service.save(queryReq("mdm.q1")));
        Map<String, Object> r = row("mdm.q1");
        assertThat(r.get("SERVICE_ID")).isEqualTo("jobQuery");
        assertThat(r.get("ACTION")).isEqualTo("run");
        assertThat(r.get("OWNER_TP")).isEqualTo("USER");
        assertThat(((Timestamp) r.get("NEXT_RUN_AT")).toLocalDateTime()).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(saved.get("cronDesc")).isEqualTo("10분마다");
        assertThat(((Number) saved.get("ver")).longValue()).isZero();
    }

    @Test
    @DisplayName("놓친 회차 한 번 실행(misfireRunYn) — 새 작업은 기본 N, Y 로 저장·상세에 보임, 값 없이 고치면 지금 값 유지, N 으로 끄면 꺼짐, Y·N 외 값은 거절")
    void saveMisfireOption() {
        service.save(queryReq("mdm.mf0"));
        assertThat(row("mdm.mf0").get("MISFIRE_RUN_YN")).isEqualTo("N");

        JobSchedMngRequest on = queryReq("mdm.mf1");
        on.setMisfireRunYn("Y");
        assertThat(def(service.save(on)).get("misfireRunYn")).isEqualTo("Y");
        assertThat(row("mdm.mf1").get("MISFIRE_RUN_YN")).isEqualTo("Y");

        JobSchedMngRequest keep = queryReq("mdm.mf1");   // 옵션 칸이 없는 요청(옛 화면)은 지금 값을 건드리지 않는다
        keep.setVer(((Number) row("mdm.mf1").get("VER")).longValue());
        keep.setJobNm("이름 바꿈");
        assertThat(def(service.save(keep)).get("misfireRunYn")).isEqualTo("Y");

        JobSchedMngRequest off = queryReq("mdm.mf1");
        off.setVer(((Number) row("mdm.mf1").get("VER")).longValue());
        off.setMisfireRunYn("N");
        assertThat(def(service.save(off)).get("misfireRunYn")).isEqualTo("N");

        JobSchedMngRequest bad = queryReq("mdm.mf2");
        bad.setMisfireRunYn("X");
        assertThatThrownBy(() -> service.save(bad)).isInstanceOf(BusinessException.class).hasMessageContaining("misfireRunYn");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'mdm.mf2'", Integer.class)).isZero();
    }

    @Test
    @DisplayName("저장 검사 — id 형식·중복·모듈·유형·crontab(일+요일 동시)·시간 초과 범위·QUERY 문장(DDL)·선언 안 한 변수·예약 변수 이름")
    void saveValidation() {
        service.save(queryReq("mdm.q1"));
        JobSchedMngRequest dup = queryReq("mdm.q1");
        dup.setNewJob(true);   // 화면의 [새 작업] 은 newJob=true 로 보낸다 — 같은 ID 가 있으면 거절
        assertThatThrownBy(() -> service.save(dup)).isInstanceOf(BusinessException.class).hasMessageContaining("이미");
        assertThatThrownBy(() -> service.save(queryReq("bad id!"))).isInstanceOf(BusinessException.class).hasMessageContaining("작업 ID");
        JobSchedMngRequest r = queryReq("mdm.q2");
        r.setModuleCd("XXX");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("모듈");
        r.setModuleCd("MDM");
        r.setJobKind("HTTP");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("유형");
        r.setJobKind("QUERY");
        r.setCronExpr("0 9 1 * 1");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("일과 요일");
        r.setCronExpr("*/10 * * * *");
        r.setTimeoutSec(5);
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("시간 초과");
        r.setTimeoutSec(600);
        r.setConfigJson("{\"sql\":\"DROP TABLE T_X\"}");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("INSERT");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = :undeclared\"}");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining(":undeclared");
        r.setConfigJson("{\"sql\":\"UPDATE T_X SET V = 1\"}");
        r.setVarsJson("[{\"name\":\"sql\",\"type\":\"STRING\",\"value\":\"x\",\"desc\":\"\"}]");
        assertThatThrownBy(() -> service.save(r)).isInstanceOf(BusinessException.class).hasMessageContaining("예약어");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF", Integer.class)).isEqualTo(1);
    }

    @Test
    @DisplayName("유형별 입력 — BPMN 은 서비스 ID·Action 필수(내장 jobCode·jobQuery·jobCollect 금지), CODE 는 등록된 처리기, COLLECT 는 원천(sql·http)·간격 하한(5분), 제거된 환율 원천은 거절")
    void kindSpecificValidation() {
        JobSchedMngRequest b = req("mdm.b1", "MDM", "BPMN", "0 3 * * *");
        assertThatThrownBy(() -> service.save(b)).isInstanceOf(BusinessException.class).hasMessageContaining("서비스 ID");
        b.setServiceId("jobQuery");
        b.setSvcAction("run");
        assertThatThrownBy(() -> service.save(b)).isInstanceOf(BusinessException.class).hasMessageContaining("내장");
        b.setServiceId("dmaDailyClose");
        service.save(b);
        assertThat(row("mdm.b1").get("SERVICE_ID")).isEqualTo("dmaDailyClose");

        JobSchedMngRequest c = req("mdm.c1", "MDM", "CODE", "0 4 * * *");
        c.setConfigJson("{\"handlerId\":\"no.such\"}");
        assertThatThrownBy(() -> service.save(c)).isInstanceOf(BusinessException.class).hasMessageContaining("처리기");
        c.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        service.save(c);
        assertThat(row("mdm.c1").get("SERVICE_ID")).isEqualTo("jobCode");

        JobSchedMngRequest col = req("mdm.col", "MDM", "COLLECT", "*/4 * * * *");
        col.setConfigJson("{\"source\":{\"kind\":\"sql\",\"sql\":\"SELECT 1 V FROM DUAL\",\"valueField\":\"V\"}}");
        assertThatThrownBy(() -> service.save(col)).isInstanceOf(BusinessException.class).hasMessageContaining("5분");
        col.setCronExpr("*/5 * * * *");
        service.save(col);
        JobSchedMngRequest ex = req("mdm.ex", "MDM", "COLLECT", "*/30 * * * *");
        ex.setConfigJson("{\"source\":{\"kind\":\"exchange\",\"currencies\":[\"USD\"]}}");   // 환율 수집은 2026-10-09 제거 — mdm 환율 마스터로 일원화
        assertThatThrownBy(() -> service.save(ex)).isInstanceOf(BusinessException.class).hasMessageContaining("sql·http");
        ex.setModuleCd("MCM");
        assertThatThrownBy(() -> service.save(ex)).isInstanceOf(BusinessException.class).hasMessageContaining("sql·http");
    }

    @Test
    @DisplayName("일정을 바꾸거나 사용 중지 → 사용으로 되돌리면 NEXT_RUN_AT 을 지금 기준으로 다시 계산한다 — 옛 시각이 남아 밀린 회차가 쏟아지지 않는다")
    void nextRunAtIsRecomputedOnScheduleChangeAndResume() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET NEXT_RUN_AT = " + NOW + " - INTERVAL '5' DAY WHERE JOB_ID = 'mdm.q1'");
        long ver = ((Number) row("mdm.q1").get("VER")).longValue();

        JobSchedMngRequest changed = queryReq("mdm.q1");
        changed.setCronExpr("0 2 * * *");
        changed.setVer(ver);
        service.save(changed);
        LocalDateTime next = ((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime();
        assertThat(next).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(next.getHour()).isEqualTo(2);

        JobSchedMngRequest stop = new JobSchedMngRequest();
        stop.setJobId("mdm.q1");
        stop.setUseYn("N");
        service.setUse(stop);
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_DEF SET NEXT_RUN_AT = " + NOW + " - INTERVAL '3' DAY WHERE JOB_ID = 'mdm.q1'");
        stop.setUseYn("Y");
        service.setUse(stop);
        assertThat(((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime()).isAfter(LocalDateTime.now().minusMinutes(1));
        assertThat(row("mdm.q1").get("USE_YN")).isEqualTo("Y");
    }

    @Test
    @DisplayName("낙관적 잠금 — 읽은 뒤 다른 사용자가 먼저 고쳤으면(VER 가 다르면) 저장을 거절한다")
    void optimisticLock() {
        service.save(queryReq("mdm.q1"));
        JobSchedMngRequest stale = queryReq("mdm.q1");
        stale.setVer(99L);
        assertThatThrownBy(() -> service.save(stale)).isInstanceOf(BusinessException.class).hasMessageContaining("먼저");
    }

    @Test
    @DisplayName("CODE 작업(출처 CODE)은 일정·사용·시간 초과·변수 값만 바꾼다 — 이름·유형·처리기 변경과 삭제는 거절")
    void codeJobsAreLimited() {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, TIMEOUT_SEC, NEXT_RUN_AT, OWNER_TP) "
                + "VALUES ('mdm.sync', 'MDM', '동기화', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.sync\"}', "
                + "'[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"3\",\"desc\":\"\"}]', 1800, " + NOW + " + INTERVAL '1' HOUR, 'CODE')");
        JobSchedMngRequest ok = req("mdm.sync", "MDM", "CODE", "30 1 * * *");
        ok.setJobNm("동기화");
        ok.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        ok.setVarsJson("[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"9\",\"desc\":\"\"}]");
        ok.setTimeoutSec(900);
        service.save(ok);
        assertThat(row("mdm.sync").get("CRON_EXPR")).isEqualTo("30 1 * * *");
        assertThat(String.valueOf(row("mdm.sync").get("VARS_JSON"))).contains("\"9\"");

        JobSchedMngRequest renamed = req("mdm.sync", "MDM", "CODE", "30 1 * * *");
        renamed.setJobNm("다른 이름");
        renamed.setConfigJson("{\"handlerId\":\"mdm.sync\"}");
        renamed.setVarsJson("[{\"name\":\"n\",\"type\":\"NUMBER\",\"value\":\"9\",\"desc\":\"\"}]");
        assertThatThrownBy(() -> service.save(renamed)).isInstanceOf(BusinessException.class).hasMessageContaining("코드 작업");
        JobSchedMngRequest newVar = new JobSchedMngRequest();
        newVar.setJobId("mdm.sync");
        assertThatThrownBy(() -> service.delete(newVar)).isInstanceOf(BusinessException.class).hasMessageContaining("삭제할 수 없습니다");
    }

    @Test
    @DisplayName("삭제 — USER 작업만, 정의·이력·수집 값을 함께 지운다. 실행 중이면 거절")
    void deleteUserJobs() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-08 02:00:00', 'S', 'rr', 'MDM', 'jobQuery', 'RUN', " + NOW + ", 600)");
        JobSchedMngRequest d = new JobSchedMngRequest();
        d.setJobId("mdm.q1");
        assertThatThrownBy(() -> service.delete(d)).isInstanceOf(BusinessException.class).hasMessageContaining("실행 중");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_RUN SET STATUS = 'OK'");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM) VALUES ('mdm.q1', '202610080200', 'K', 1)");
        assertThat(service.delete(d)).containsEntry("deleted", "mdm.q1");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_DEF", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA", Integer.class)).isZero();
    }

    @Test
    @DisplayName("목록 — CLOB 칸 없이 필요한 칸만, 최근 결과 1건, 코드 없음 배지(처리기가 없거나 7일 넘게 안 보임), 필터")
    void listWithFiltersAndCodeMissing() {
        service.save(queryReq("mdm.q1"));
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mdm.old', 'MDM', '옛', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.old\"}', 60, 'CODE')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('mdm.gone', 'MDM', '없음', 'CODE', 'jobCode', 'run', '0 1 * * *', 'Y', '{\"handlerId\":\"mdm.gone\"}', 60, 'CODE')");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, SERVER_NM, STARTED_AT, ENDED_AT) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-08 02:00:00', 'S', 'a', 'MDM', 'jobQuery', 'FAIL', 'old-srv', " + NOW + ", " + NOW + ")");
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, SERVER_NM, STARTED_AT, ENDED_AT) "
                + "VALUES ('mdm.q1', TIMESTAMP '2026-10-09 02:00:00', 'S', 'b', 'MDM', 'jobQuery', 'OK', 'new-srv', " + NOW + ", " + NOW + ")");

        @SuppressWarnings("unchecked")
        List<Map<String, Object>> jobs = (List<Map<String, Object>>) service.list(new JobSchedMngRequest()).get("jobs");
        assertThat(jobs).extracting(j -> j.get("jobId")).containsExactlyInAnyOrder("mdm.q1", "mdm.old", "mdm.gone");
        Map<String, Object> q1 = jobs.stream().filter(j -> j.get("jobId").equals("mdm.q1")).findFirst().orElseThrow();
        assertThat(q1.get("lastStatus")).isEqualTo("OK");
        assertThat(q1.get("lastServerNm")).isEqualTo("new-srv");
        assertThat(q1).doesNotContainKeys("configJson", "varsJson");
        assertThat(jobs.stream().filter(j -> j.get("jobId").equals("mdm.old")).findFirst().orElseThrow().get("codeMissing")).isEqualTo(true);
        assertThat(jobs.stream().filter(j -> j.get("jobId").equals("mdm.gone")).findFirst().orElseThrow().get("codeMissing")).isEqualTo(true);
        assertThat(q1.get("codeMissing")).isEqualTo(false);

        JobSchedMngRequest f = new JobSchedMngRequest();
        f.setLastStatus("OK");
        assertThat((List<?>) service.list(f).get("jobs")).hasSize(1);
        f = new JobSchedMngRequest();
        f.setKeyword("옛");
        assertThat((List<?>) service.list(f).get("jobs")).hasSize(1);
    }

    @Test
    @DisplayName("지금 실행 — 별도 트랜잭션에서 TRIGGER_TP='M' RUN 을 만들고 커밋한 뒤 호출 풀에 넘긴다. NEXT_RUN_AT 은 그대로, 같은 작업이 실행 중이면 거절")
    void runNow() {
        service.save(queryReq("mdm.q1"));
        LocalDateTime nextBefore = ((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime();
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setJobId("mdm.q1");
        r.setVarOverridesJson("{\"v\":\"manual\"}");
        Map<String, Object> out = service.runNow(r, "admin");

        assertThat(submitted).hasSize(1);
        JobRunRequest sent = submitted.get(0);
        assertThat(sent.manual()).isTrue();
        assertThat(sent.reqUserId()).isEqualTo("admin");
        assertThat(sent.inputs()).containsEntry("v", "manual");
        Map<String, Object> run = jdbc.queryForMap("SELECT TRIGGER_TP, STATUS, REQ_USR_ID, RUN_ID FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'mdm.q1'");
        assertThat(run.get("TRIGGER_TP")).isEqualTo("M");
        assertThat(run.get("STATUS")).isEqualTo("RUN");
        assertThat(run.get("REQ_USR_ID")).isEqualTo("admin");
        assertThat(((Timestamp) row("mdm.q1").get("NEXT_RUN_AT")).toLocalDateTime()).isEqualTo(nextBefore);
        assertThat(out).containsKey("runId");

        Map<String, Object> second = service.runNow(r, "admin");
        assertThat(second).containsEntry("accepted", false);
        assertThat(String.valueOf(second.get("message"))).contains("실행 중");
        assertThat(submitted).hasSize(1);
    }

    // ── collectData(수집 값 읽기) ────────────────────────────────────────

    private static final DateTimeFormatter SLOT_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");

    private static String slotAgo(long days, long hours) {
        return SLOT_FMT.format(LocalDateTime.now().minusDays(days).minusHours(hours));
    }

    private void collectJob(String jobId) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES (?, 'MDM', '수집', 'COLLECT', 'jobCollect', 'run', '*/5 * * * *', 'Y', '{}', 600, 'USER')", jobId);
    }

    private void putValue(String jobId, String slot, String itemKey, Object num, String txt) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT, U_AT) VALUES (?, ?, ?, ?, ?, " + NOW + ")",
                new Object[]{jobId, slot, itemKey, num, txt},
                new int[]{java.sql.Types.VARCHAR, java.sql.Types.VARCHAR, java.sql.Types.VARCHAR, java.sql.Types.NUMERIC, java.sql.Types.VARCHAR});   // null 바인드는 형을 명시한다
    }

    private static JobSchedMngRequest collectReq(String jobId) {
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setJobId(jobId);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rowsOf(Map<String, Object> result) {
        return (List<Map<String, Object>>) result.get("rows");
    }

    @Test
    @DisplayName("collectData 거절 — 없는 작업, 수집 작업이 아닌 작업, 잘못된 beforeSlot")
    void collectDataRejects() {
        assertThatThrownBy(() -> service.collectData(collectReq("no.such"))).isInstanceOf(BusinessException.class).hasMessageContaining("작업을 찾을 수 없습니다");
        assertThatThrownBy(() -> service.collectData(new JobSchedMngRequest())).isInstanceOf(BusinessException.class).hasMessageContaining("작업을 찾을 수 없습니다");
        service.save(queryReq("mdm.q1"));
        assertThatThrownBy(() -> service.collectData(collectReq("mdm.q1"))).isInstanceOf(BusinessException.class).hasMessage("수집 작업이 아닙니다.");
        collectJob("mdm.col");
        JobSchedMngRequest bad = collectReq("mdm.col");
        bad.setBeforeSlot("2026-10-09");
        assertThatThrownBy(() -> service.collectData(bad)).isInstanceOf(BusinessException.class).hasMessageContaining("beforeSlot");
    }

    @Test
    @DisplayName("collectData 빈 결과 — 값이 없으면 rows 비고 truncated=false·nextBeforeSlot·latestSlot=null·count=0 (latestOnly 도 같다)")
    void collectDataEmpty() {
        collectJob("mdm.col");
        Map<String, Object> out = service.collectData(collectReq("mdm.col"));
        assertThat(rowsOf(out)).isEmpty();
        assertThat(out).containsEntry("truncated", false).containsEntry("nextBeforeSlot", null).containsEntry("latestSlot", null).containsEntry("count", 0);
        JobSchedMngRequest latest = collectReq("mdm.col");
        latest.setLatestOnly(true);
        Map<String, Object> out2 = service.collectData(latest);
        assertThat(rowsOf(out2)).isEmpty();
        assertThat(out2).containsEntry("truncated", false).containsEntry("latestSlot", null).containsEntry("count", 0);
    }

    @Test
    @DisplayName("collectData 기간·정렬·값 — days 기본 7(1~90), SLOT 내림차순·ITEM_KEY 오름차순, 숫자·글자·수집 시각, 다른 작업의 값은 안 섞인다")
    void collectDataDaysAndOrder() {
        collectJob("mdm.col");
        collectJob("mdm.other");
        String s1h = slotAgo(0, 1);
        String s6d = slotAgo(6, 0);
        String s8d = slotAgo(8, 0);
        putValue("mdm.col", s1h, "B", new BigDecimal("2.5"), null);
        putValue("mdm.col", s1h, "A", new BigDecimal("1.25"), "한글");
        putValue("mdm.col", s6d, "A", null, "text");
        putValue("mdm.col", s8d, "A", BigDecimal.TEN, null);
        putValue("mdm.other", s1h, "X", BigDecimal.ONE, null);

        Map<String, Object> def7 = service.collectData(collectReq("mdm.col"));   // days 기본 7 — 8일 전은 제외(분 경계가 아니라 여유를 두고 확인한다)
        List<Map<String, Object>> rows = rowsOf(def7);
        assertThat(rows).extracting(r -> r.get("slot") + "/" + r.get("itemKey")).containsExactly(s1h + "/A", s1h + "/B", s6d + "/A");
        assertThat(((BigDecimal) rows.get(0).get("valueNum")).compareTo(new BigDecimal("1.25"))).isZero();
        assertThat(rows.get(0).get("valueTxt")).isEqualTo("한글");
        assertThat(rows.get(0).get("collectedAt")).isInstanceOf(String.class);
        assertThat(rows.get(2).get("valueNum")).isNull();
        assertThat(def7).containsEntry("truncated", false).containsEntry("nextBeforeSlot", null).containsEntry("latestSlot", null).containsEntry("count", 3);

        JobSchedMngRequest r = collectReq("mdm.col");
        r.setDays(10);
        assertThat(rowsOf(service.collectData(r))).hasSize(4);
        r.setDays(1);
        assertThat(rowsOf(service.collectData(r))).hasSize(2);
        r.setDays(0);   // 1 로 자른다
        assertThat(rowsOf(service.collectData(r))).hasSize(2);
        r.setDays(1000);   // 90 으로 자른다
        assertThat(rowsOf(service.collectData(r))).hasSize(4);
    }

    @Test
    @DisplayName("collectData itemKey — 정확 일치·대소문자 구분, 빈 문자열은 필터 없음")
    void collectDataItemKey() {
        collectJob("mdm.col");
        String s = slotAgo(0, 1);
        putValue("mdm.col", s, "USD", BigDecimal.ONE, null);
        putValue("mdm.col", s, "usd", BigDecimal.TEN, null);
        putValue("mdm.col", s, "USDX", BigDecimal.ONE, null);
        JobSchedMngRequest r = collectReq("mdm.col");
        r.setItemKey("USD");
        assertThat(rowsOf(service.collectData(r))).extracting(x -> x.get("itemKey")).containsExactly("USD");
        r.setItemKey("usd");
        assertThat(rowsOf(service.collectData(r))).extracting(x -> x.get("itemKey")).containsExactly("usd");
        r.setItemKey("US");
        assertThat(rowsOf(service.collectData(r))).isEmpty();
        r.setItemKey("");
        assertThat(rowsOf(service.collectData(r))).hasSize(3);
    }

    @Test
    @DisplayName("collectData latestOnly — 작업의 가장 큰 SLOT 한 회차만(days 무시, 90일보다 오래돼도), itemKey·beforeSlot 은 그대로 더해진다")
    void collectDataLatestOnly() {
        collectJob("mdm.col");
        String latest = slotAgo(100, 0);   // 90일 밖이라도 가장 큰 SLOT 이면 읽는다
        String older = slotAgo(101, 0);
        putValue("mdm.col", older, "A", BigDecimal.ONE, null);
        putValue("mdm.col", latest, "B", BigDecimal.TEN, null);
        putValue("mdm.col", latest, "A", BigDecimal.ONE, null);
        JobSchedMngRequest r = collectReq("mdm.col");
        r.setLatestOnly(true);
        r.setDays(1);
        Map<String, Object> out = service.collectData(r);
        assertThat(rowsOf(out)).extracting(x -> x.get("slot") + "/" + x.get("itemKey")).containsExactly(latest + "/A", latest + "/B");
        assertThat(out).containsEntry("latestSlot", latest).containsEntry("count", 2).containsEntry("truncated", false);

        r.setItemKey("B");
        Map<String, Object> onlyB = service.collectData(r);
        assertThat(rowsOf(onlyB)).hasSize(1);
        assertThat(onlyB).containsEntry("latestSlot", latest);
        r.setItemKey("none");   // 그 회차에 그 항목이 없으면 비지만 latestSlot 은 알려 준다
        Map<String, Object> none = service.collectData(r);
        assertThat(rowsOf(none)).isEmpty();
        assertThat(none).containsEntry("latestSlot", latest);
    }

    @Test
    @DisplayName("collectData limit — 한 행 더 읽어 truncated 를 정하고, 경계 SLOT 이 갈리면 그 SLOT 은 통째로 다음 쪽에 넘기며(beforeSlot 이어 읽기에 빠지는 행 없음), 한 회차가 limit 보다 크면 limit 행에서 자른다")
    void collectDataLimitAndNext() {
        collectJob("mdm.col");
        String s1 = slotAgo(0, 3);
        String s2 = slotAgo(0, 2);
        String s3 = slotAgo(0, 1);   // 가장 최근
        for (String s : List.of(s1, s2, s3)) for (String k : List.of("A", "B", "C")) putValue("mdm.col", s, k, BigDecimal.ONE, null);

        JobSchedMngRequest r = collectReq("mdm.col");
        r.setLimit(9);   // 정확히 limit 행이면 truncated 가 아니다
        Map<String, Object> all = service.collectData(r);
        assertThat(rowsOf(all)).hasSize(9);
        assertThat(all).containsEntry("truncated", false).containsEntry("nextBeforeSlot", null);

        r.setLimit(4);   // 4번째 행이 s2 의 첫 행 → s2 가 갈린다 → s3 3행만, 다음 쪽 기준은 s3
        Map<String, Object> p1 = service.collectData(r);
        assertThat(rowsOf(p1)).extracting(x -> x.get("slot")).containsOnly(s3);
        assertThat(p1).containsEntry("truncated", true).containsEntry("nextBeforeSlot", s3).containsEntry("count", 3);

        r.setBeforeSlot((String) p1.get("nextBeforeSlot"));   // s2 를 처음부터: 3행 + s1 의 첫 행 → s1 이 갈려 s2 3행만
        Map<String, Object> p2 = service.collectData(r);
        assertThat(rowsOf(p2)).extracting(x -> x.get("slot")).containsOnly(s2);
        assertThat(rowsOf(p2)).hasSize(3);
        assertThat(p2).containsEntry("truncated", true).containsEntry("nextBeforeSlot", s2);

        r.setBeforeSlot((String) p2.get("nextBeforeSlot"));   // 마지막 쪽: s1 3행, 끝
        Map<String, Object> p3 = service.collectData(r);
        assertThat(rowsOf(p3)).extracting(x -> x.get("slot")).containsOnly(s1);
        assertThat(rowsOf(p3)).hasSize(3);
        assertThat(p3).containsEntry("truncated", false).containsEntry("nextBeforeSlot", null);

        r.setBeforeSlot(null);   // 경계가 회차와 일치하면 그대로 limit 행: limit 3 → s3 3행, 다음 쪽 s3
        r.setLimit(3);
        Map<String, Object> exact = service.collectData(r);
        assertThat(rowsOf(exact)).hasSize(3);
        assertThat(exact).containsEntry("truncated", true).containsEntry("nextBeforeSlot", s3);

        r.setLimit(2);   // 한 회차(3행)가 limit(2)보다 크다 → 첫 회차를 limit 행에서 자른다
        Map<String, Object> cut = service.collectData(r);
        assertThat(rowsOf(cut)).extracting(x -> x.get("slot") + "/" + x.get("itemKey")).containsExactly(s3 + "/A", s3 + "/B");
        assertThat(cut).containsEntry("truncated", true).containsEntry("nextBeforeSlot", s3);

        r.setLimit(null);   // 기본 500 — 위 상한 자르기는 단위 시험(CollectDataPagingTest)이 본다
        assertThat(rowsOf(service.collectData(r))).hasSize(9);
    }

    @Test
    @DisplayName("cronPreview — 유효하면 설명·다음 5개·최소 간격, 틀리면 오류 문구")
    void cronPreview() {
        JobSchedMngRequest r = new JobSchedMngRequest();
        r.setExpr("0 9 * * 1-5");
        Map<String, Object> ok = service.cronPreview(r);
        assertThat(ok).containsEntry("valid", true).containsEntry("desc", "평일 09:00");
        assertThat((List<?>) ok.get("next")).hasSize(5);
        r.setExpr("0 9 1 * 1");
        Map<String, Object> bad = service.cronPreview(r);
        assertThat(bad).containsEntry("valid", false);
        assertThat(String.valueOf(bad.get("error"))).contains("일과 요일");
    }

    @Test
    @DisplayName("handlers — 등록된 처리기 목록, 7일 넘게 안 보이면 missing")
    void handlers() {
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> hs = (List<Map<String, Object>>) service.handlers(new JobSchedMngRequest()).get("handlers");
        assertThat(hs).extracting(h -> h.get("handlerId")).containsExactly("mdm.old", "mdm.sync");
        assertThat(hs.get(0).get("missing")).isEqualTo(true);
        assertThat(hs.get(1).get("missing")).isEqualTo(false);
    }
}
