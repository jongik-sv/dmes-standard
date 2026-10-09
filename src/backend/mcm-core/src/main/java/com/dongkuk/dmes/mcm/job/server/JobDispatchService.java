package com.dongkuk.dmes.mcm.job.server;

import com.dongkuk.dmes.cactus.job.JobRunRequest;
import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVar;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * BPMN {@code jobDispatch} 의 서비스 태스크 몸체 — 색인 조회로 지금 할 작업을 읽고(설계 §4.1) 같은 트랜잭션에서 선점한다(§4.2). 트랜잭션은 OASIS 가
 * 서비스마다 연다(이 클래스에 {@code @Transactional} 없음). {@code serviceStarter.start} 가 돌아오면 이미 커밋돼 있다.
 * <ul>
 *   <li>빈 결과면 바로 끝낸다 — 평소 매분 SQL 한 문장이 전부이다.</li>
 *   <li>잠그는 SQL 에는 행 수 제한이 없다(ORA-02014). 개수는 앞의 조회가 {@code batchSize} 로 이미 제한했고, 잠근 행은 모두 이 트랜잭션에서 처리한다.</li>
 *   <li>늦은 회차(DB_NOW - NEXT_RUN_AT &gt; 2분)는 따라잡지 않고 SKIP 1건, 겹침은 SKIP, 그 밖은 RUN INSERT(PK 위반이면 건너뜀) 뒤 NEXT_RUN_AT 을 올린다.
 *       작업의 「놓친 회차 한 번 실행」(MISFIRE_RUN_YN='Y')이 켜져 있으면 늦은 회차를 SKIP 하지 않고 겹침 검사를 거쳐 TRIGGER_TP='C' RUN 한 건을 만든다(설계 §4.2.1).
 *       다음 시각은 늘 max(회차, DB_NOW) 이후로 계산하므로 몇 회차를 놓쳤든 실행은 한 번이다.</li>
 *   <li>변수 확정은 여기서 한다(날짜 변수는 SCHED_AT 기준, {@code :prevRunAt} 은 그 변수를 쓰는 작업만 TRIGGER_TP='S'·'C' 직전 정상 회차).</li>
 *   <li>정의 한 건이 깨져 있으면(CONFIG_JSON·VARS_JSON·OPTS_JSON·crontab) 그 행만 FAIL 「정의 오류」로 남기고 NEXT_RUN_AT 을 미룬다 — 다른 작업을 막지 않는다.</li>
 * </ul>
 * 화면의 「지금 한 번 실행」({@link #claimManual})도 같은 변수 확정·겹침 검사를 쓰므로 여기에 둔다(설계 §4.9).
 */
public class JobDispatchService {

    static final Duration LATE_LIMIT = Duration.ofMinutes(2);
    /** TRIGGER_TP: 일정 회차·놓친 회차 한 번 실행(설계 §4.2.1). 「지금 실행」은 M. */
    static final String TRIGGER_SCHEDULED = "S";
    static final String TRIGGER_MISSED = "C";
    static final int CLEANUP_MARGIN_SEC = 300;
    static final int DEFAULT_BATCH = 50;
    static final int MAX_BATCH = 200;
    static final int MAX_RECORDED_TIMEOUT = 999_999;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();
    /** null 칸(ENDED_AT·MSG·VARS_JSON)의 형을 드라이버에 묻지 않게 명시한다 — ojdbc 는 식이 섞인 INSERT 의 매개변수 메타데이터를 풀지 못한다. */
    private static final int[] INSERT_RUN_TYPES = {Types.VARCHAR, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR,
            Types.TIMESTAMP, Types.TIMESTAMP, Types.INTEGER, Types.VARCHAR, Types.CLOB};
    private static final int[] INSERT_MANUAL_TYPES = {Types.VARCHAR, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.TIMESTAMP,
            Types.INTEGER, Types.CLOB, Types.VARCHAR, Types.VARCHAR};

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final String dueSql;
    private final String lockSql;
    private final String insertRunSql;
    private final String liveRunSql;
    private final String prevOkSql;
    private final String nextRunSql;
    private final TransactionTemplate manualTx;
    private final String manualLockSql;
    private final String insertManualSql;

    public JobDispatchService(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.dueSql = """
                SELECT A.JOB_ID
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.USE_YN = 'Y'
                AND    A.NEXT_RUN_AT <= %2$s + INTERVAL '30' SECOND
                AND    (A.JOB_KIND <> 'COLLECT' OR ? = 'Y')
                ORDER BY A.NEXT_RUN_AT
                FETCH FIRST ? ROWS ONLY
                """.formatted(schema, NOW);
        this.lockSql = """
                SELECT A.JOB_ID, A.MODULE_CD, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.TIMEOUT_SEC, A.NEXT_RUN_AT
                     , A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON, A.MISFIRE_RUN_YN
                     , %2$s DB_NOW
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID IN (:ids)
                AND    A.USE_YN = 'Y'
                AND    A.NEXT_RUN_AT <= %2$s + INTERVAL '30' SECOND
                FOR UPDATE SKIP LOCKED
                """.formatted(schema, NOW);
        this.insertRunSql = """
                INSERT INTO %1$s.TB_MCM_JOB_RUN
                       (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, ENDED_AT, TIMEOUT_SEC, MSG, VARS_JSON,
                        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
                        %2$s, 'SCHEDULER', 'JobDispatchService', 'jobDispatch', %2$s, 'SCHEDULER', 'JobDispatchService', 'jobDispatch', 0)
                """.formatted(schema, NOW);
        this.liveRunSql = """
                SELECT COUNT(*)
                FROM   %1$s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'RUN'
                AND    A.STARTED_AT + NUMTODSINTERVAL(A.TIMEOUT_SEC + %2$d, 'SECOND') > ?
                """.formatted(schema, CLEANUP_MARGIN_SEC);
        this.prevOkSql = """
                SELECT MAX(A.SCHED_AT)
                FROM   %1$s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'OK'
                AND    A.TRIGGER_TP IN ('S', 'C')
                """.formatted(schema);
        this.nextRunSql = """
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    NEXT_RUN_AT = ?
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobDispatchService'
                     , VER = VER + 1
                WHERE  JOB_ID = ?
                """.formatted(schema, NOW);
        this.manualTx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.manualTx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.manualLockSql = """
                SELECT A.JOB_ID, A.MODULE_CD, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.TIMEOUT_SEC, A.NEXT_RUN_AT
                     , A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON, A.MISFIRE_RUN_YN
                     , %2$s DB_NOW
                FROM   %1$s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID = ?
                FOR UPDATE WAIT 5
                """.formatted(schema, NOW);
        this.insertManualSql = """
                INSERT INTO %1$s.TB_MCM_JOB_RUN
                       (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC, VARS_JSON, REQ_USR_ID,
                        C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, 'M', ?, ?, ?, 'RUN', ?, ?, ?, ?,
                        %2$s, ?, 'JobDispatchService', 'jobSchedMng', %2$s, 'SCHEDULER', 'JobDispatchService', 'jobSchedMng', 0)
                """.formatted(schema, NOW);
    }

    /** 정의 한 건이 읽을 수 없는 상태 — 이 행만 FAIL 로 남긴다. 메시지에는 어느 칸인지만 쓴다(원문 없음). */
    private static final class BrokenDefinition extends RuntimeException {
        BrokenDefinition(String message) {
            super(message);
        }
    }

    private record Row(String jobId, String module, String serviceId, String action, String cron, int timeoutSec, LocalDateTime nextRunAt,
                       String configJson, String varsJson, String optsJson, boolean misfireRunOnce, LocalDateTime dbNow) {}

    public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
        JobDispatchScope.require();
        int limit = batchSize == null || batchSize < 1 ? DEFAULT_BATCH : Math.min(batchSize, MAX_BATCH);
        List<String> ids = jdbc.queryForList(dueSql, String.class, "N".equalsIgnoreCase(collectEnabled) ? "N" : "Y", limit);
        if (ids.isEmpty()) return new ClaimedBatch(List.of(), false);

        List<Row> rows = named.query(lockSql, new MapSqlParameterSource("ids", ids), (rs, i) -> new Row(
                rs.getString("JOB_ID"), rs.getString("MODULE_CD"), rs.getString("SERVICE_ID"), rs.getString("ACTION"), rs.getString("CRON_EXPR"),
                rs.getInt("TIMEOUT_SEC"), rs.getTimestamp("NEXT_RUN_AT").toLocalDateTime(), rs.getString("CONFIG_JSON"),
                rs.getString("VARS_JSON"), rs.getString("OPTS_JSON"), "Y".equals(rs.getString("MISFIRE_RUN_YN")), rs.getTimestamp("DB_NOW").toLocalDateTime()));

        List<JobRunRequest> runs = new ArrayList<>();
        for (Row row : rows) {
            try {
                JobRunRequest request = process(row);
                if (request != null) runs.add(request);
            } catch (BrokenDefinition e) {
                broken(row, e.getMessage());
            } catch (DataAccessException e) {
                throw e;   // DB 오류는 묶음 전체를 롤백한다 — 이 분은 건너뛰고 다음 분에 다시 한다
            } catch (RuntimeException e) {
                // 정의를 손으로 고쳐 생긴 예상 밖 값(NPE 등) — 한 행 때문에 묶음 전체가 매분 롤백되지 않게 그 행만 닫는다
                broken(row, "정의 오류: 정의를 처리할 수 없습니다(" + e.getClass().getSimpleName() + ")");
            }
        }
        return new ClaimedBatch(List.copyOf(runs), ids.size() == limit);
    }

    /** {@link #claimManual} 의 결과 — 둘 중 하나만 값이 있다. */
    public record ManualClaim(JobRunRequest request, String rejectReason) {}

    /**
     * 「지금 한 번 실행」(설계 §4.9). 화면 요청은 OASIS 서비스 트랜잭션 안이라 RUN 행은 <b>별도 트랜잭션</b>(REQUIRES_NEW)에서 만든다: 정의 행을
     * {@code FOR UPDATE WAIT 5} 로 잠그고, 같은 작업이 RUN(시간 초과 + 정리 여유 안)이면 거절한다. 아니면 {@code TRIGGER_TP='M'} RUN 을 INSERT 하고
     * 커밋한다(바깥 서비스 트랜잭션에 합류하면 잠금을 쥔 채 호출하고, 서비스가 롤백되면 RUN 행 없이 모듈만 실행된다). NEXT_RUN_AT 은 바꾸지 않는다.
     * {@code varOverrides} 는 이번 한 번만 쓰는 변수 값(이력의 VARS_JSON 에 남는다 — D11). 화면 서비스가 부르므로 {@link JobDispatchScope} 는 보지 않는다.
     */
    public ManualClaim claimManual(String jobId, String reqUserId, Map<String, String> varOverrides) {
        return manualTx.execute(status -> {
            List<Row> rows;
            try {
                rows = jdbc.query(manualLockSql, (rs, i) -> {
                    LocalDateTime dbNow = rs.getTimestamp("DB_NOW").toLocalDateTime();
                    Timestamp next = rs.getTimestamp("NEXT_RUN_AT");
                    return new Row(rs.getString("JOB_ID"), rs.getString("MODULE_CD"), rs.getString("SERVICE_ID"), rs.getString("ACTION"),
                            rs.getString("CRON_EXPR"), rs.getInt("TIMEOUT_SEC"), next == null ? dbNow : next.toLocalDateTime(), rs.getString("CONFIG_JSON"),
                            rs.getString("VARS_JSON"), rs.getString("OPTS_JSON"), "Y".equals(rs.getString("MISFIRE_RUN_YN")), dbNow);
                }, jobId);
            } catch (PessimisticLockingFailureException e) {
                return new ManualClaim(null, "다른 요청이 이 작업을 처리하는 중입니다. 잠시 뒤 다시 시도하세요");   // ORA-30006 (WAIT 5 초과)
            }
            if (rows.isEmpty()) return new ManualClaim(null, "작업을 찾을 수 없습니다");
            Row r = rows.get(0);
            if (jdbc.queryForObject(liveRunSql, Integer.class, r.jobId(), Timestamp.valueOf(r.dbNow())) > 0) {
                return new ManualClaim(null, "이미 실행 중인 작업입니다");
            }
            LocalDateTime sched = r.dbNow().truncatedTo(ChronoUnit.SECONDS);   // TIMESTAMP(0) 은 소수 초를 반올림한다
            JobRunRequest base;
            try {
                base = buildRequest(withOverrides(r, varOverrides), sched);
            } catch (BrokenDefinition e) {
                return new ManualClaim(null, e.getMessage());
            }
            JobRunRequest request = new JobRunRequest(base.runId(), base.jobId(), base.module(), base.serviceId(), base.action(), base.inputs(), base.varTypes(),
                    base.config(), base.timeoutSec(), base.retry(), base.schedAt(), true, reqUserId);
            try {
                jdbc.update(insertManualSql, new Object[] {r.jobId(), Timestamp.valueOf(sched), request.runId(), r.module(), r.serviceId(),
                        Timestamp.valueOf(r.dbNow()), recordedTimeout(r.timeoutSec(), request.retry()), writeJson(request.inputs()), reqUserId, reqUserId},
                        INSERT_MANUAL_TYPES);
            } catch (DuplicateKeyException e) {
                return new ManualClaim(null, "같은 초에 이미 요청한 실행이 있습니다");
            }
            return new ManualClaim(request, null);
        });
    }

    /** 화면에서 덮어쓴 변수 값(이름 → 글자)으로 VARS_JSON 의 value 를 바꾼다. 선언 안 된 이름은 무시한다. */
    private Row withOverrides(Row r, Map<String, String> overrides) {
        if (overrides == null || overrides.isEmpty()) return r;
        List<JobVar> vars;
        try {
            vars = JobVars.parse(r.varsJson());
        } catch (RuntimeException e) {   // IllegalArgumentException 과 '[null]' 같은 손상의 NPE
            throw new BrokenDefinition("정의 오류: 변수 목록(VARS_JSON)을 읽을 수 없습니다");
        }
        List<JobVar> merged = new ArrayList<>();
        for (JobVar v : vars) {
            merged.add(overrides.containsKey(v.name()) ? new JobVar(v.name(), v.type(), overrides.get(v.name()), v.desc()) : v);
        }
        List<String> errors = JobVars.validate(merged);
        if (!errors.isEmpty()) throw new BrokenDefinition(errors.get(0));
        return new Row(r.jobId(), r.module(), r.serviceId(), r.action(), r.cron(), r.timeoutSec(), r.nextRunAt(), r.configJson(), JobVars.toJson(merged),
                r.optsJson(), r.misfireRunOnce(), r.dbNow());
    }

    /** 한 회차의 판정 결과. */
    enum Slot {
        /** 늦은 회차(옵션 꺼짐) — SKIP 「놓친 회차를 건너뜀」. */
        SKIP_LATE,
        /** 이전 회차가 아직 실행 중 — SKIP 「이전 회차 실행 중」. */
        SKIP_OVERLAP,
        /** 제때의 일정 회차 — RUN (TRIGGER_TP='S'). */
        RUN,
        /** 늦었지만 「놓친 회차 한 번 실행」 옵션이 켜져 있어 실행 — RUN (TRIGGER_TP='C'). */
        RUN_MISSED
    }

    /**
     * 늦은 회차·겹침 판정(설계 §4.2.1). 늦음({@link #LATE_LIMIT} 초과)과 겹침은 서로 독립이다: 늦었어도 옵션이 꺼져 있으면 겹침을 보지 않고 SKIP_LATE,
     * 옵션이 켜져 있으면 늦은 회차도 겹침 검사를 거친다. 겹침 조회는 필요할 때만 한다(늦은 SKIP 이면 DB 를 다시 읽지 않는다).
     */
    static Slot decide(Duration lateness, boolean misfireRunOnce, BooleanSupplier overlapping) {
        boolean late = lateness.compareTo(LATE_LIMIT) > 0;
        if (late && !misfireRunOnce) return Slot.SKIP_LATE;
        if (overlapping.getAsBoolean()) return Slot.SKIP_OVERLAP;
        return late ? Slot.RUN_MISSED : Slot.RUN;
    }

    /**
     * 한 행을 처리한다. 다음 시각은 INSERT 보다 먼저 계산한다(오지 않는 날짜면 INSERT 전에 정의 오류로 돌린다). 세 갈래(늦은 SKIP·겹침 SKIP·RUN)
     * 모두 같은 회차 PK {@code (JOB_ID, SCHED_AT, TRIGGER_TP)}(일정·SKIP 은 'S', 놓친 회차 실행은 'C') 가 이미 있으면 기록만 건너뛰고 NEXT_RUN_AT 은 그대로 올린다 — 이미 선점된 회차로
     * NEXT_RUN_AT 이 되돌아와도(화면 저장·SQL 수정) 묶음이 롤백되지 않는다.
     */
    private JobRunRequest process(Row r) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);   // TIMESTAMP(0) 은 소수 초를 반올림한다
        CronSpec cron = parseCron(r.cron());
        LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
        LocalDateTime next = cron.next(base);
        if (next == null) throw new BrokenDefinition("정의 오류: crontab 식에 앞으로 오는 시각이 없습니다");
        JobRunRequest request = null;
        Slot slot = decide(Duration.between(sched, r.dbNow()), r.misfireRunOnce(),
                () -> jdbc.queryForObject(liveRunSql, Integer.class, r.jobId(), Timestamp.valueOf(r.dbNow())) > 0);
        switch (slot) {
            case SKIP_LATE -> insertRunOnce(r, sched, TRIGGER_SCHEDULED, "SKIP", "놓친 회차를 건너뜀", null, r.timeoutSec());
            case SKIP_OVERLAP -> insertRunOnce(r, sched, TRIGGER_SCHEDULED, "SKIP", "이전 회차 실행 중", null, r.timeoutSec());
            case RUN, RUN_MISSED -> {
                request = buildRequest(r, sched);
                String trigger = slot == Slot.RUN_MISSED ? TRIGGER_MISSED : TRIGGER_SCHEDULED;
                if (!insertRunOnce(r, sched, trigger, "RUN", null, request, recordedTimeout(r.timeoutSec(), request.retry()))) {
                    request = null;   // 같은 회차 PK — 이미 다른 인스턴스·이전 시도가 잡았다
                }
            }
        }
        jdbc.update(nextRunSql, Timestamp.valueOf(next), r.jobId());
        return request;
    }

    /** RUN 행을 넣는다. 같은 회차 PK 가 이미 있으면 넣지 않고 false (Oracle 은 문장 단위 롤백이라 트랜잭션은 그대로 쓸 수 있다). */
    private boolean insertRunOnce(Row r, LocalDateTime sched, String triggerTp, String status, String msg, JobRunRequest request, int recordedTimeout) {
        try {
            insertRun(r, sched, triggerTp, status, msg, request, recordedTimeout);
            return true;
        } catch (DuplicateKeyException e) {
            return false;
        }
    }

    private JobRunRequest buildRequest(Row r, LocalDateTime sched) {
        List<JobVar> vars;
        try {
            vars = JobVars.parse(r.varsJson());
        } catch (RuntimeException e) {   // IllegalArgumentException 과 '[null]' 같은 손상의 NPE
            throw new BrokenDefinition("정의 오류: 변수 목록(VARS_JSON)을 읽을 수 없습니다");
        }
        LocalDateTime prev = null;
        if (JobVars.usesPrevRunAt(vars)) {
            Timestamp p = jdbc.queryForObject(prevOkSql, Timestamp.class, r.jobId());
            prev = p == null ? null : p.toLocalDateTime();
        }
        Map<String, Object> inputs;
        try {
            inputs = JobVars.resolve(vars, new JobVars.RunFacts(sched, r.dbNow(), prev, r.jobId(), r.module()));
        } catch (RuntimeException e) {
            throw new BrokenDefinition("정의 오류: 변수 값을 확정할 수 없습니다");
        }
        Map<String, Object> config = new LinkedHashMap<>();
        if (r.configJson() != null && !r.configJson().isBlank()) {
            try {
                config = JSON.readValue(r.configJson(), new TypeReference<LinkedHashMap<String, Object>>() {});
            } catch (JsonProcessingException e) {
                throw new BrokenDefinition("정의 오류: 설정(CONFIG_JSON)을 읽을 수 없습니다");
            }
        }
        return new JobRunRequest(UUID.randomUUID().toString(), r.jobId(), r.module(), r.serviceId(), r.action(), inputs, JobVars.typesOf(vars), config,
                r.timeoutSec(), retryOf(r.optsJson()), sched.format(ISO), false, null);
    }

    private static JobRunRequest.Retry retryOf(String optsJson) {
        if (optsJson == null || optsJson.isBlank()) return null;
        try {
            JsonNode retry = JSON.readTree(optsJson).path("retry");
            int count = retry.path("count").asInt(0);
            int interval = retry.path("intervalMin").asInt(0);
            return count > 0 && interval > 0 ? new JobRunRequest.Retry(count, interval) : null;
        } catch (JsonProcessingException e) {
            throw new BrokenDefinition("정의 오류: 고급 설정(OPTS_JSON)을 읽을 수 없습니다");
        }
    }

    /** 재시도가 있는 회차는 정리가 너무 일찍 닫지 않도록 {@code timeoutSec + count × (timeoutSec + intervalMin 분)} 을 기록한다(설계 §4.6). */
    private static int recordedTimeout(int timeoutSec, JobRunRequest.Retry retry) {
        long total = retry == null ? timeoutSec : timeoutSec + (long) retry.count() * (timeoutSec + retry.intervalMin() * 60L);
        return (int) Math.min(total, MAX_RECORDED_TIMEOUT);   // RUN.TIMEOUT_SEC 는 NUMBER(6) — SQL 로 고친 OPTS 가 넘치지 않게
    }

    private static CronSpec parseCron(String expr) {
        try {
            return CronSpec.parse(expr);
        } catch (IllegalArgumentException e) {
            throw new BrokenDefinition("정의 오류: crontab 식을 읽을 수 없습니다");
        }
    }

    private void insertRun(Row r, LocalDateTime sched, String triggerTp, String status, String msg, JobRunRequest request, int recordedTimeout) {
        boolean running = "RUN".equals(status);
        Timestamp now = Timestamp.valueOf(r.dbNow());
        String varsJson = request == null ? null : writeJson(request.inputs());
        jdbc.update(insertRunSql, new Object[] {r.jobId(), Timestamp.valueOf(sched), triggerTp, running ? request.runId() : UUID.randomUUID().toString(), r.module(),
                r.serviceId(), status, now, running ? null : now, recordedTimeout, msg, varsJson}, INSERT_RUN_TYPES);
    }

    /** 깨진 정의: 이 행만 FAIL 로 닫고 NEXT_RUN_AT 을 한 시간 뒤로 미룬다(식을 읽을 수 없으니 계산할 수 없다). */
    private void broken(Row r, String message) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);
        insertRunOnce(r, sched, TRIGGER_SCHEDULED, "FAIL", message, null, r.timeoutSec());   // 같은 회차의 기록이 이미 있으면 건너뛴다
        LocalDateTime next;
        try {
            LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
            next = CronSpec.parse(r.cron()).next(base);
        } catch (IllegalArgumentException e) {
            next = null;
        }
        if (next == null) next = r.dbNow().plusHours(1);   // 식을 읽을 수 없거나 앞으로 오는 시각이 없다
        jdbc.update(nextRunSql, Timestamp.valueOf(next), r.jobId());
    }

    private static String writeJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            return null;
        }
    }
}
