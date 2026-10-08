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
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/**
 * BPMN {@code jobDispatch} 의 서비스 태스크 몸체 — 색인 조회로 지금 할 작업을 읽고(설계 §4.1) 같은 트랜잭션에서 선점한다(§4.2). 트랜잭션은 OASIS 가
 * 서비스마다 연다(이 클래스에 {@code @Transactional} 없음). {@code serviceStarter.start} 가 돌아오면 이미 커밋돼 있다.
 * <ul>
 *   <li>빈 결과면 바로 끝낸다 — 평소 매분 SQL 한 문장이 전부이다.</li>
 *   <li>잠그는 SQL 에는 행 수 제한이 없다(ORA-02014). 개수는 앞의 조회가 {@code batchSize} 로 이미 제한했고, 잠근 행은 모두 이 트랜잭션에서 처리한다.</li>
 *   <li>늦은 회차(DB_NOW - NEXT_RUN_AT &gt; 2분)는 따라잡지 않고 SKIP 1건, 겹침은 SKIP, 그 밖은 RUN INSERT(PK 위반이면 건너뜀) 뒤 NEXT_RUN_AT 을 올린다.</li>
 *   <li>변수 확정은 여기서 한다(날짜 변수는 SCHED_AT 기준, {@code :prevRunAt} 은 그 변수를 쓰는 작업만 TRIGGER_TP='S' 직전 정상 회차).</li>
 *   <li>정의 한 건이 깨져 있으면(CONFIG_JSON·VARS_JSON·OPTS_JSON·crontab) 그 행만 FAIL 「정의 오류」로 남기고 NEXT_RUN_AT 을 미룬다 — 다른 작업을 막지 않는다.</li>
 * </ul>
 */
public class JobDispatchService {

    static final Duration LATE_LIMIT = Duration.ofMinutes(2);
    static final int CLEANUP_MARGIN_SEC = 300;
    static final int DEFAULT_BATCH = 50;
    static final int MAX_BATCH = 200;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final DateTimeFormatter ISO = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final ObjectMapper JSON = new ObjectMapper();
    /** null 칸(ENDED_AT·MSG·VARS_JSON)의 형을 드라이버에 묻지 않게 명시한다 — ojdbc 는 식이 섞인 INSERT 의 매개변수 메타데이터를 풀지 못한다. */
    private static final int[] INSERT_RUN_TYPES = {Types.VARCHAR, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR,
            Types.TIMESTAMP, Types.TIMESTAMP, Types.INTEGER, Types.VARCHAR, Types.CLOB};

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final String dueSql;
    private final String lockSql;
    private final String insertRunSql;
    private final String liveRunSql;
    private final String prevOkSql;
    private final String nextRunSql;

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
                     , A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON
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
                VALUES (?, ?, 'S', ?, ?, ?, ?, ?, ?, ?, ?, ?,
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
                AND    A.TRIGGER_TP = 'S'
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
    }

    /** 정의 한 건이 읽을 수 없는 상태 — 이 행만 FAIL 로 남긴다. 메시지에는 어느 칸인지만 쓴다(원문 없음). */
    private static final class BrokenDefinition extends RuntimeException {
        BrokenDefinition(String message) {
            super(message);
        }
    }

    private record Row(String jobId, String module, String serviceId, String action, String cron, int timeoutSec, LocalDateTime nextRunAt,
                       String configJson, String varsJson, String optsJson, LocalDateTime dbNow) {}

    public ClaimedBatch claimDue(Integer batchSize, String collectEnabled) {
        JobDispatchScope.require();
        int limit = batchSize == null || batchSize < 1 ? DEFAULT_BATCH : Math.min(batchSize, MAX_BATCH);
        List<String> ids = jdbc.queryForList(dueSql, String.class, "N".equalsIgnoreCase(collectEnabled) ? "N" : "Y", limit);
        if (ids.isEmpty()) return new ClaimedBatch(List.of(), false);

        List<Row> rows = named.query(lockSql, new MapSqlParameterSource("ids", ids), (rs, i) -> new Row(
                rs.getString("JOB_ID"), rs.getString("MODULE_CD"), rs.getString("SERVICE_ID"), rs.getString("ACTION"), rs.getString("CRON_EXPR"),
                rs.getInt("TIMEOUT_SEC"), rs.getTimestamp("NEXT_RUN_AT").toLocalDateTime(), rs.getString("CONFIG_JSON"),
                rs.getString("VARS_JSON"), rs.getString("OPTS_JSON"), rs.getTimestamp("DB_NOW").toLocalDateTime()));

        List<JobRunRequest> runs = new ArrayList<>();
        for (Row row : rows) {
            try {
                JobRunRequest request = process(row);
                if (request != null) runs.add(request);
            } catch (BrokenDefinition e) {
                broken(row, e.getMessage());
            }
        }
        return new ClaimedBatch(List.copyOf(runs), ids.size() == limit);
    }

    private JobRunRequest process(Row r) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);   // TIMESTAMP(0) 은 소수 초를 반올림한다
        CronSpec cron = parseCron(r.cron());
        JobRunRequest request = null;
        if (Duration.between(sched, r.dbNow()).compareTo(LATE_LIMIT) > 0) {
            insertRun(r, sched, "SKIP", "놓친 회차를 건너뜀", null, r.timeoutSec());
        } else if (jdbc.queryForObject(liveRunSql, Integer.class, r.jobId(), Timestamp.valueOf(r.dbNow())) > 0) {
            insertRun(r, sched, "SKIP", "이전 회차 실행 중", null, r.timeoutSec());
        } else {
            request = buildRequest(r, sched);
            try {
                insertRun(r, sched, "RUN", null, request, recordedTimeout(r.timeoutSec(), request.retry()));
            } catch (DuplicateKeyException e) {
                request = null;   // 같은 회차 PK — 이미 다른 인스턴스·이전 시도가 잡았다
            }
        }
        LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
        jdbc.update(nextRunSql, Timestamp.valueOf(cron.next(base)), r.jobId());
        return request;
    }

    private JobRunRequest buildRequest(Row r, LocalDateTime sched) {
        List<JobVar> vars;
        try {
            vars = JobVars.parse(r.varsJson());
        } catch (IllegalArgumentException e) {
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
        return retry == null ? timeoutSec : timeoutSec + retry.count() * (timeoutSec + retry.intervalMin() * 60);
    }

    private static CronSpec parseCron(String expr) {
        try {
            return CronSpec.parse(expr);
        } catch (IllegalArgumentException e) {
            throw new BrokenDefinition("정의 오류: crontab 식을 읽을 수 없습니다");
        }
    }

    private void insertRun(Row r, LocalDateTime sched, String status, String msg, JobRunRequest request, int recordedTimeout) {
        boolean running = "RUN".equals(status);
        Timestamp now = Timestamp.valueOf(r.dbNow());
        String varsJson = request == null ? null : writeJson(request.inputs());
        jdbc.update(insertRunSql, new Object[] {r.jobId(), Timestamp.valueOf(sched), running ? request.runId() : UUID.randomUUID().toString(), r.module(),
                r.serviceId(), status, now, running ? null : now, recordedTimeout, msg, varsJson}, INSERT_RUN_TYPES);
    }

    /** 깨진 정의: 이 행만 FAIL 로 닫고 NEXT_RUN_AT 을 한 시간 뒤로 미룬다(식을 읽을 수 없으니 계산할 수 없다). */
    private void broken(Row r, String message) {
        LocalDateTime sched = r.nextRunAt().truncatedTo(ChronoUnit.SECONDS);
        try {
            insertRun(r, sched, "FAIL", message, null, r.timeoutSec());
        } catch (DuplicateKeyException ignored) {
            // 같은 회차의 기록이 이미 있다
        }
        LocalDateTime next;
        try {
            LocalDateTime base = sched.isAfter(r.dbNow()) ? sched : r.dbNow();
            next = CronSpec.parse(r.cron()).next(base);
        } catch (IllegalArgumentException e) {
            next = r.dbNow().plusHours(1);
        }
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
