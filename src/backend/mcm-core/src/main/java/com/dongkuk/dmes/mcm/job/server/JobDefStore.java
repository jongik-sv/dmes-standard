package com.dongkuk.dmes.mcm.job.server;

import java.sql.Timestamp;
import java.sql.Types;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;

/** 관리 화면 서비스(jobSchedMng)의 JOB 표 SQL — 목록은 CLOB 칸을 싣지 않고(행마다 최대 수 KB), 상세에서만 읽는다. */
public class JobDefStore {

    public record Filter(String moduleCd, String jobKind, String useYn, String lastStatus, String keyword) {}

    public record DefRow(String jobId, String moduleCd, String jobNm, String jobKind, String serviceId, String svcAction, String cronExpr, String useYn,
                         String configJson, String varsJson, String optsJson, int timeoutSec, String jobDesc, String ownerTp, LocalDateTime nextRunAt) {}

    static final int LIST_MAX = 500;
    static final int HANDLER_STALE_DAYS = 7;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    /** SLOT(yyyyMMddHHmm) 비교에서 「끝 없음」 을 뜻하는 값 — 어떤 SLOT 보다 크다. */
    private static final String SLOT_END = "999999999999";

    private final JdbcTemplate jdbc;
    private final NamedParameterJdbcTemplate named;
    private final String schema;

    public JobDefStore(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.named = new NamedParameterJdbcTemplate(jdbc);
        this.schema = schema;
    }

    public LocalDateTime dbNow() {
        return jdbc.queryForObject("SELECT " + NOW + " FROM DUAL", Timestamp.class).toLocalDateTime();
    }

    public List<Map<String, Object>> list(Filter f) {
        StringBuilder sql = new StringBuilder("""
                SELECT A.JOB_ID, A.MODULE_CD, A.JOB_NM, A.JOB_KIND, A.CRON_EXPR, A.USE_YN, A.NEXT_RUN_AT, A.OWNER_TP
                     , B.STATUS LAST_STATUS, B.SERVER_NM LAST_SERVER_NM, B.ENDED_AT LAST_ENDED_AT
                     , C.SEEN_AT HANDLER_SEEN_AT
                FROM   %1$s.TB_MCM_JOB_DEF A
                     , (SELECT R.JOB_ID, R.STATUS, R.SERVER_NM, R.ENDED_AT
                             , ROW_NUMBER() OVER (PARTITION BY R.JOB_ID ORDER BY R.SCHED_AT DESC, R.STARTED_AT DESC) RN
                        FROM   %1$s.TB_MCM_JOB_RUN R) B
                     , %1$s.TB_MCM_JOB_HANDLER C
                WHERE  B.JOB_ID(+) = A.JOB_ID
                AND    B.RN(+) = 1
                AND    C.HANDLER_ID(+) = JSON_VALUE(A.CONFIG_JSON, '$.handlerId')
                """.formatted(schema));
        MapSqlParameterSource p = new MapSqlParameterSource();
        if (notBlank(f.moduleCd())) { sql.append("AND    A.MODULE_CD = :moduleCd\n"); p.addValue("moduleCd", f.moduleCd()); }
        if (notBlank(f.jobKind())) { sql.append("AND    A.JOB_KIND = :jobKind\n"); p.addValue("jobKind", f.jobKind()); }
        if (notBlank(f.useYn())) { sql.append("AND    A.USE_YN = :useYn\n"); p.addValue("useYn", f.useYn()); }
        if (notBlank(f.lastStatus())) { sql.append("AND    B.STATUS = :lastStatus\n"); p.addValue("lastStatus", f.lastStatus()); }
        if (notBlank(f.keyword())) {
            sql.append("AND    (UPPER(A.JOB_ID) LIKE :kw OR UPPER(A.JOB_NM) LIKE :kw)\n");
            p.addValue("kw", "%" + f.keyword().strip().toUpperCase(java.util.Locale.ROOT).replace("%", "").replace("_", "") + "%");
        }
        sql.append("ORDER BY A.MODULE_CD, A.JOB_ID\nFETCH FIRST ").append(LIST_MAX).append(" ROWS ONLY");
        return named.queryForList(sql.toString(), p);
    }

    public Optional<Map<String, Object>> find(String jobId) {
        List<Map<String, Object>> rows = jdbc.queryForList("""
                SELECT A.JOB_ID, A.MODULE_CD, A.JOB_NM, A.JOB_KIND, A.SERVICE_ID, A.ACTION, A.CRON_EXPR, A.USE_YN, A.CONFIG_JSON, A.VARS_JSON, A.OPTS_JSON
                     , A.TIMEOUT_SEC, A.NEXT_RUN_AT, A.JOB_DESC, A.OWNER_TP, A.VER
                FROM   %s.TB_MCM_JOB_DEF A
                WHERE  A.JOB_ID = ?
                """.formatted(schema), jobId);
        return rows.stream().findFirst();
    }

    public void insert(DefRow r, String userId) {
        // null 바인드는 형을 명시한다 — 형 없이 null 을 넘기면 Oracle 드라이버가 문장을 뜯어 형을 찾다 죽는다(OracleParameterMetaDataParser).
        jdbc.update("""
                INSERT INTO %1$s.TB_MCM_JOB_DEF
                       (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, USE_YN, CONFIG_JSON, VARS_JSON, OPTS_JSON, TIMEOUT_SEC, NEXT_RUN_AT,
                        JOB_DESC, OWNER_TP, C_AT, C_USR_ID, C_PGM_ID, C_SVC_ID, U_AT, U_USR_ID, U_PGM_ID, U_SVC_ID, VER)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, %2$s, ?, 'jobSchedMng', 'jobSchedMng', %2$s, ?, 'jobSchedMng', 'jobSchedMng', 0)
                """.formatted(schema, NOW),
                new Object[]{r.jobId(), r.moduleCd(), r.jobNm(), r.jobKind(), r.serviceId(), r.svcAction(), r.cronExpr(), r.useYn(), r.configJson(),
                        r.varsJson(), r.optsJson(), r.timeoutSec(), ts(r.nextRunAt()), r.jobDesc(), r.ownerTp(), userId, userId},
                new int[]{Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR,
                        Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.INTEGER, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR,
                        Types.VARCHAR});
    }

    /** VER 가 맞을 때만 고친다. nextRunAt 이 null 이면 NEXT_RUN_AT 은 그대로 둔다. 바뀐 행 수(0 이면 VER 불일치). */
    public int update(DefRow r, String userId, long expectVer) {
        return jdbc.update("""
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    MODULE_CD = ?, JOB_NM = ?, JOB_KIND = ?, SERVICE_ID = ?, ACTION = ?, CRON_EXPR = ?, USE_YN = ?, CONFIG_JSON = ?, VARS_JSON = ?, OPTS_JSON = ?
                     , TIMEOUT_SEC = ?, JOB_DESC = ?
                     , NEXT_RUN_AT = NVL(?, NEXT_RUN_AT)
                     , U_AT = %2$s, U_USR_ID = ?, U_PGM_ID = 'jobSchedMng', U_SVC_ID = 'jobSchedMng', VER = VER + 1
                WHERE  JOB_ID = ?
                AND    VER = ?
                """.formatted(schema, NOW),
                new Object[]{r.moduleCd(), r.jobNm(), r.jobKind(), r.serviceId(), r.svcAction(), r.cronExpr(), r.useYn(), r.configJson(), r.varsJson(),
                        r.optsJson(), r.timeoutSec(), r.jobDesc(), ts(r.nextRunAt()), userId, r.jobId(), expectVer},
                new int[]{Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR,
                        Types.VARCHAR, Types.VARCHAR, Types.INTEGER, Types.VARCHAR, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR, Types.BIGINT});
    }

    public int setUse(String jobId, String useYn, LocalDateTime nextRunAt, String userId) {
        return jdbc.update("""
                UPDATE %1$s.TB_MCM_JOB_DEF
                SET    USE_YN = ?, NEXT_RUN_AT = NVL(?, NEXT_RUN_AT), U_AT = %2$s, U_USR_ID = ?, U_PGM_ID = 'jobSchedMng', VER = VER + 1
                WHERE  JOB_ID = ?
                """.formatted(schema, NOW), new Object[]{useYn, ts(nextRunAt), userId, jobId},
                new int[]{Types.VARCHAR, Types.TIMESTAMP, Types.VARCHAR, Types.VARCHAR});
    }

    public boolean hasLiveRun(String jobId) {
        return jdbc.queryForObject("""
                SELECT COUNT(*)
                FROM   %s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                AND    A.STATUS = 'RUN'
                AND    A.STARTED_AT + NUMTODSINTERVAL(A.TIMEOUT_SEC + 300, 'SECOND') > %s
                """.formatted(schema, NOW), Integer.class, jobId) > 0;
    }

    /** 정의·이력·수집 값을 함께 지운다(D8). */
    public void delete(String jobId) {
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_COLLECT_DATA WHERE JOB_ID = ?", jobId);
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_RUN WHERE JOB_ID = ?", jobId);
        jdbc.update("DELETE FROM " + schema + ".TB_MCM_JOB_DEF WHERE JOB_ID = ?", jobId);
    }

    public List<Map<String, Object>> history(String jobId, int limit) {
        return jdbc.queryForList("""
                SELECT A.SCHED_AT, A.TRIGGER_TP, A.STATUS, A.SERVER_NM, A.SERVICE_TAG, A.STARTED_AT, A.ENDED_AT, A.ITEM_CNT, A.MSG, A.REQ_USR_ID
                FROM   %s.TB_MCM_JOB_RUN A
                WHERE  A.JOB_ID = ?
                ORDER BY A.SCHED_AT DESC, A.STARTED_AT DESC
                FETCH FIRST ? ROWS ONLY
                """.formatted(schema), jobId, limit);
    }

    /** 수집 작업의 가장 큰 SLOT(PK 앞 두 칸 min/max 탐색). 값이 없으면 null. */
    public String latestCollectSlot(String jobId) {
        return jdbc.queryForObject("""
                SELECT MAX(A.SLOT)
                FROM   %s.TB_MCM_JOB_COLLECT_DATA A
                WHERE  A.JOB_ID = ?
                """.formatted(schema), String.class, jobId);
    }

    /**
     * 수집 값을 SLOT 내림차순·ITEM_KEY 오름차순으로 fetchRows 행까지 읽는다. SLOT 은 문자열 비교라 PK(JOB_ID, SLOT, ITEM_KEY)의 범위 탐색을 탄다.
     * 정렬 방향이 섞여 있어 범위 안의 행을 모아 정렬한다 — 기간(90일 상한)이 읽는 양을 정한다.
     * SQL 글자는 늘 같다(선택 조건은 WHERE 의 NULL 검사). null 바인드는 형을 명시한다(OracleParameterMetaDataParser).
     *
     * @param fromSlot   SLOT &gt;= 이 값(필수)
     * @param beforeSlot SLOT &lt; 이 값. null 이면 끝 없음
     * @param itemKey    ITEM_KEY 정확 일치(대소문자 구분). null 이면 전체
     */
    public List<Map<String, Object>> collectData(String jobId, String fromSlot, String beforeSlot, String itemKey, int fetchRows) {
        return jdbc.queryForList("""
                SELECT A.SLOT, A.ITEM_KEY, A.VALUE_NUM, A.VALUE_TXT, A.U_AT
                FROM   %s.TB_MCM_JOB_COLLECT_DATA A
                WHERE  A.JOB_ID = ?
                AND    A.SLOT >= ?
                AND    A.SLOT < ?
                AND    (? IS NULL OR A.ITEM_KEY = ?)
                ORDER BY A.SLOT DESC, A.ITEM_KEY
                FETCH FIRST ? ROWS ONLY
                """.formatted(schema), new Object[]{jobId, fromSlot, beforeSlot == null ? SLOT_END : beforeSlot, itemKey, itemKey, fetchRows},
                new int[]{Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.VARCHAR, Types.INTEGER});
    }

    public List<Map<String, Object>> handlers() {
        return jdbc.queryForList("""
                SELECT A.HANDLER_ID, A.MODULE_CD, A.HANDLER_NM, A.DEFAULT_CRON, A.VARS_JSON, A.SEEN_AT
                     , CASE WHEN A.SEEN_AT IS NULL OR A.SEEN_AT < %2$s - NUMTODSINTERVAL(%3$d, 'DAY') THEN 'Y' ELSE 'N' END MISSING
                FROM   %1$s.TB_MCM_JOB_HANDLER A
                ORDER BY A.MODULE_CD, A.HANDLER_ID
                """.formatted(schema, NOW, HANDLER_STALE_DAYS));
    }

    public boolean handlerExists(String handlerId, String moduleCd) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + schema + ".TB_MCM_JOB_HANDLER WHERE HANDLER_ID = ? AND MODULE_CD = ?", Integer.class, handlerId, moduleCd) > 0;
    }

    /** 호출 결과를 최대 wait 만큼 기다려 화면에 돌려줄 문구를 만든다: 닫혔으면 사유(MSG), SERVER_NM 이 생겼으면 접수, 아니면 null. */
    public String awaitDecision(String runId, Duration wait) {
        long deadline = System.nanoTime() + wait.toNanos();
        while (true) {
            List<Map<String, Object>> rows = jdbc.queryForList("SELECT STATUS, MSG, SERVER_NM FROM " + schema + ".TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
            if (!rows.isEmpty()) {
                Map<String, Object> r = rows.get(0);
                if (!"RUN".equals(r.get("STATUS"))) return "ACCEPTED_AND_CLOSED:" + r.get("STATUS") + ":" + (r.get("MSG") == null ? "" : r.get("MSG"));
                if (r.get("SERVER_NM") != null) return "ACCEPTED:" + r.get("SERVER_NM");
            }
            if (System.nanoTime() >= deadline) return null;
            try {
                Thread.sleep(150);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                return null;
            }
        }
    }

    private static Timestamp ts(LocalDateTime t) {
        return t == null ? null : Timestamp.valueOf(t);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
