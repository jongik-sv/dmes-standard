package com.dongkuk.dmes.mcm.job.server;

import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * MCM 쪽 RUN·COLLECT_DATA SQL(설계 §4.3·§4.6). 호출 풀의 UPDATE 는 트랜잭션 없는 JdbcTemplate 한 문장이다(자동 커밋).
 * 접수 기록은 SERVER_NM 만 쓰고 STATUS 를 건드리지 않아 먼저 끝난 모듈의 결과 갱신과 경합하지 않는다.
 */
public class JobRunStore {

    static final int CLEANUP_MARGIN_SEC = 300;
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final int MAX_CHUNKS = 2000;

    private final JdbcTemplate jdbc;
    private final String acceptedSql;
    private final String closeSql;
    private final String sweepSql;
    private final String purgeRunsSql;
    private final String purgeCollectSql;

    public JobRunStore(DataSource dataSource, String schema) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) throw new IllegalArgumentException("dmes.job.schema 는 식별자여야 합니다");
        this.jdbc = new JdbcTemplate(dataSource);
        this.acceptedSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    SERVER_NM = NVL(SERVER_NM, ?)
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobCaller'
                WHERE  RUN_ID = ?
                """.formatted(schema, NOW);
        this.closeSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = ?
                     , MSG = ?
                     , ENDED_AT = %2$s
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobCaller'
                     , VER = VER + 1
                WHERE  RUN_ID = ?
                AND    STATUS = 'RUN'
                """.formatted(schema, NOW);
        this.sweepSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = 'TIMEOUT'
                     , MSG = '결과 없음 — 모듈 서버가 도중에 죽었을 수 있음'
                     , ENDED_AT = %2$s
                     , U_AT = %2$s
                     , U_USR_ID = 'SCHEDULER'
                     , U_PGM_ID = 'JobRunSweep'
                     , VER = VER + 1
                WHERE  STATUS = 'RUN'
                AND    STARTED_AT + NUMTODSINTERVAL(TIMEOUT_SEC + %3$d, 'SECOND') < %2$s
                """.formatted(schema, NOW, CLEANUP_MARGIN_SEC);
        this.purgeRunsSql = """
                DELETE FROM %1$s.TB_MCM_JOB_RUN
                WHERE  STARTED_AT < %2$s - NUMTODSINTERVAL(?, 'DAY')
                AND    ROWNUM <= ?
                """.formatted(schema, NOW);
        this.purgeCollectSql = """
                DELETE FROM %1$s.TB_MCM_JOB_COLLECT_DATA
                WHERE  SLOT < ?
                AND    ROWNUM <= ?
                """.formatted(schema);
    }

    public int markAccepted(String runId, String serverNm) {
        return jdbc.update(acceptedSql, serverNm, runId);
    }

    public int closeIfRunning(String runId, String status, String msg) {
        return jdbc.update(closeSql, status, msg, runId);
    }

    public int sweep() {
        return jdbc.update(sweepSql);
    }

    /** 보관 기간(일)이 지난 실행 기록을 덩어리로 지운다. 한 번의 작업 트랜잭션 안에서 0 이 될 때까지(최대 2000덩어리). */
    public int purgeRunsBefore(int days, int chunkRows) {
        return loop(() -> jdbc.update(purgeRunsSql, days, chunkRows));
    }

    public int purgeCollectBefore(String cutoffSlot, int chunkRows) {
        return loop(() -> jdbc.update(purgeCollectSql, cutoffSlot, chunkRows));
    }

    private static int loop(java.util.function.IntSupplier chunk) {
        int total = 0;
        for (int i = 0; i < MAX_CHUNKS; i++) {
            int n = chunk.getAsInt();
            if (n == 0) break;
            total += n;
        }
        return total;
    }
}
