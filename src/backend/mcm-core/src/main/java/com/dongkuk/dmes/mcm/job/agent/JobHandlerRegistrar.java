package com.dongkuk.dmes.mcm.job.agent;

import com.dongkuk.dmes.mcm.job.def.CronSpec;
import com.dongkuk.dmes.mcm.job.def.JobVars;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 모듈 앱이 기동할 때 자기 모듈의 {@link ScheduledJob} 빈을 DB 에 직접 등록한다(설계 §5.2·D30) — 등록 SQL 은 이 클래스 한 곳이다.
 * <ul>
 *   <li>HANDLER 에 MERGE(처리기 목록·{@code SEEN_AT} 갱신 — 화면의 「코드 실행」 처리기 목록과 「코드 없음」 배지가 읽는다).</li>
 *   <li>{@code defaultCron()} 이 있는 처리기만 DEF 에 같은 id 의 CODE 작업을 <b>없을 때만</b> INSERT(MERGE … WHEN NOT MATCHED).
 *       화면에서 바꾼 일정·사용 여부는 덮어쓰지 않는다. 동시에 두 대가 떠도 행은 하나.</li>
 *   <li>id 형식이나 기본 일정이 틀린 처리기는 ERROR 로그로 건너뛴다(기동 실패 아님).</li>
 *   <li>실패(표 없음·권한·DB 순간 오류)는 {@link #registerWithRetry()} 가 WARN 한 번 남기고 지연(운영 1분) 뒤 한 번 더 한다. 앱 기동은 실패하지 않는다.</li>
 * </ul>
 * 스키마 접두는 {@code dmes.job.schema}, 연결은 그 앱의 기본 DataSource(자기 스키마 사용자)이다. 로그에는 예외 종류만 남긴다.
 */
public class JobHandlerRegistrar {

    private static final Logger log = LoggerFactory.getLogger(JobHandlerRegistrar.class);
    private static final Pattern ID = Pattern.compile("^[A-Za-z0-9_.-]{1,60}$");
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    private final JdbcTemplate jdbc;
    private final JobHandlerRegistry registry;
    private final Duration retryDelay;
    private final String mergeHandlerSql;
    private final String mergeDefSql;

    public JobHandlerRegistrar(DataSource dataSource, String schema, JobHandlerRegistry registry, Duration retryDelay) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = dataSource == null ? null : new JdbcTemplate(dataSource);
        this.registry = registry;
        this.retryDelay = retryDelay;
        this.mergeHandlerSql = """
                MERGE INTO %1$s.TB_MCM_JOB_HANDLER T
                USING (SELECT ? HANDLER_ID FROM DUAL) S
                ON    (T.HANDLER_ID = S.HANDLER_ID)
                WHEN MATCHED THEN UPDATE
                SET   T.MODULE_CD = ?
                    , T.HANDLER_NM = ?
                    , T.DEFAULT_CRON = ?
                    , T.VARS_JSON = ?
                    , T.SEEN_AT = %2$s
                    , T.U_AT = %2$s
                    , T.U_USR_ID = 'SYSTEM'
                    , T.U_PGM_ID = 'JobHandlerRegistrar'
                    , T.VER = T.VER + 1
                WHEN NOT MATCHED THEN INSERT
                      (HANDLER_ID, MODULE_CD, HANDLER_NM, DEFAULT_CRON, VARS_JSON, SEEN_AT, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.HANDLER_ID, ?, ?, ?, ?, %2$s, %2$s, 'SYSTEM', 'JobHandlerRegistrar', %2$s, 'SYSTEM', 'JobHandlerRegistrar', 0)
                """.formatted(schema, NOW);
        this.mergeDefSql = """
                MERGE INTO %1$s.TB_MCM_JOB_DEF T
                USING (SELECT ? JOB_ID FROM DUAL) S
                ON    (T.JOB_ID = S.JOB_ID)
                WHEN NOT MATCHED THEN INSERT
                      (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
                       OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.JOB_ID, ?, ?, 'CODE', 'jobCode', 'run', ?, 'Y', ?, ?, ?, ?,
                        'CODE', %2$s, 'SYSTEM', 'JobHandlerRegistrar', %2$s, 'SYSTEM', 'JobHandlerRegistrar', 0)
                """.formatted(schema, NOW);
    }

    /** @return 등록한 처리기 수(건너뛴 것 제외). 처리기가 없거나 DataSource 가 없으면 DB 에 닿지 않고 0. */
    public int register() {
        if (registry.all().isEmpty() || jdbc == null) return 0;
        Timestamp now = jdbc.queryForObject("SELECT " + NOW + " FROM DUAL", Timestamp.class);
        int count = 0;
        for (ScheduledJob job : registry.all()) {
            if (!ID.matcher(job.id()).matches()) {
                log.error("예약 작업 처리기 id 형식이 올바르지 않아 건너뜁니다: {}", job.id());
                continue;
            }
            CronSpec cron = null;
            if (job.defaultCron() != null) {
                try {
                    cron = CronSpec.parse(job.defaultCron());
                } catch (IllegalArgumentException e) {
                    log.error("예약 작업 처리기 {} 의 기본 일정을 읽을 수 없어 건너뜁니다: {}", job.id(), e.getMessage());
                    continue;
                }
            }
            String vars = JobVars.toJson(job.defaultVars());
            String cronText = cron == null ? null : cron.expression();
            jdbc.update(mergeHandlerSql, job.id(), job.module().name(), job.name(), cronText, vars, job.module().name(), job.name(), cronText, vars);
            if (cron != null) {
                LocalDateTime next = cron.next(now.toLocalDateTime());
                jdbc.update(mergeDefSql, job.id(), job.module().name(), job.name(), cronText, "{\"handlerId\":\"" + job.id() + "\"}", vars,
                        (int) job.defaultTimeout().toSeconds(), next == null ? null : Timestamp.valueOf(next));
            }
            count++;
        }
        log.info("[job] 코드 작업 처리기 {}개를 등록했습니다(모듈 {})", count, registry.all().get(0).module());
        return count;
    }

    /** 앱 기동 뒤 부른다. 실패하면 WARN 한 번 남기고 {@code retryDelay} 뒤 한 번 더 한다 — 예외를 던지지 않는다. */
    public void registerWithRetry() {
        if (attempt("처음")) return;
        ScheduledExecutorService timer = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "job-register-retry");
            t.setDaemon(true);
            return t;
        });
        timer.schedule(() -> {
            try {
                attempt("재시도");
            } finally {
                timer.shutdown();
            }
        }, retryDelay.toMillis(), TimeUnit.MILLISECONDS);
    }

    private boolean attempt(String label) {
        try {
            register();
            return true;
        } catch (RuntimeException e) {
            log.warn("[job] 코드 작업 처리기 등록 실패({}) 원인={}", label, e.getClass().getSimpleName());
            return false;
        }
    }
}
