package com.dongkuk.dmes.cactus.job;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.util.List;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * 실행 결과를 RUN 행에 직접 쓴다(설계 §4.5) — JOB 표 구조를 아는 모듈 쪽의 유일한 코드이다.
 * <ul>
 *   <li>연결: 그 모듈 앱의 기본 DataSource(자기 스키마 사용자). 스키마 접두는 {@code dmes.job.schema}(기본 MCMAPUSER).</li>
 *   <li>트랜잭션: 대상 서비스 트랜잭션과 분리된 짧은 트랜잭션({@code REQUIRES_NEW}). 대상이 롤백돼도 FAIL 기록은 남는다.</li>
 *   <li>{@code UPDATE … WHERE RUN_ID AND STATUS='RUN'} — 0행이면 이미 TIMEOUT(정리)·SKIP(MCM 거절)으로 닫힌 행이라 덮어쓰지 않고 「늦은 결과」 WARN.</li>
 *   <li>OK 이고 수집 값이 있으면 같은 트랜잭션에서 COLLECT_DATA 에 MERGE — 상태가 바뀐 그 한 번만 저장된다.
 *       칸에 안 맞는 값은 건너뛰거나 맞춰서({@code fit}) 값 하나 때문에 RUN 갱신이 롤백되지 않게 한다.</li>
 *   <li>실패하면 {@code retryDelay}(운영 5초) 뒤 한 번 더. 그래도 실패하면 WARN 하고 버린다(재전송 대기열 없음 — 정리가 TIMEOUT 으로 닫는다).</li>
 * </ul>
 * 로그에는 예외 종류만 남긴다(DB 원문 메시지·주소 금지). 이 SQL 은 실행 스레드의 MDC(대상 serviceId) 아래에서 돌아 모듈 업무 로그에 남는다.
 */
public class JobRunResultWriter implements JobRunReporter {

    public enum WriteResult { WRITTEN, LATE, FAILED }

    private static final Logger log = LoggerFactory.getLogger(JobRunResultWriter.class);
    private static final Pattern SCHEMA = Pattern.compile("^[A-Za-z][A-Za-z0-9_$#]{0,29}$");
    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";
    private static final int MSG_MAX = 500;
    private static final int KEY_MAX = 100;
    private static final int TXT_MAX = 200;
    private static final int NUM_SCALE = 8;
    private static final int NUM_INT_DIGITS = 16;   // NUMBER(24,8)

    private final TransactionTemplate tx;
    private final JdbcTemplate jdbc;
    private final Duration retryDelay;
    private final String updateRunSql;
    private final String mergeDataSql;

    public JobRunResultWriter(DataSource dataSource, String schema, Duration retryDelay) {
        if (schema == null || !SCHEMA.matcher(schema).matches()) {
            throw new IllegalArgumentException("dmes.job.schema 는 영문자로 시작하는 식별자여야 합니다");
        }
        this.jdbc = new JdbcTemplate(dataSource);
        this.tx = new TransactionTemplate(new DataSourceTransactionManager(dataSource));
        this.tx.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.retryDelay = retryDelay;
        this.updateRunSql = """
                UPDATE %1$s.TB_MCM_JOB_RUN
                SET    STATUS = ?
                     , ITEM_CNT = ?
                     , MSG = ?
                     , ENDED_AT = %2$s
                     , SERVER_NM = NVL(SERVER_NM, ?)
                     , SERVICE_TAG = ?
                     , U_AT = %2$s
                     , U_USR_ID = ?
                     , U_PGM_ID = 'JobRunResultWriter'
                     , VER = VER + 1
                WHERE  RUN_ID = ?
                AND    STATUS = 'RUN'
                """.formatted(schema, NOW);
        this.mergeDataSql = """
                MERGE INTO %1$s.TB_MCM_JOB_COLLECT_DATA T
                USING (SELECT ? JOB_ID, ? SLOT, ? ITEM_KEY, ? VALUE_NUM, ? VALUE_TXT FROM DUAL) S
                ON    (T.JOB_ID = S.JOB_ID AND T.SLOT = S.SLOT AND T.ITEM_KEY = S.ITEM_KEY)
                WHEN MATCHED THEN UPDATE
                SET   T.VALUE_NUM = S.VALUE_NUM
                    , T.VALUE_TXT = S.VALUE_TXT
                    , T.U_AT = %2$s
                    , T.U_USR_ID = ?
                    , T.U_PGM_ID = 'JobRunResultWriter'
                    , T.VER = T.VER + 1
                WHEN NOT MATCHED THEN INSERT
                      (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, VALUE_TXT, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                VALUES (S.JOB_ID, S.SLOT, S.ITEM_KEY, S.VALUE_NUM, S.VALUE_TXT, %2$s, ?, 'JobRunResultWriter', %2$s, ?, 'JobRunResultWriter', 0)
                """.formatted(schema, NOW);
    }

    @Override
    public WriteResult write(JobRunReport r) {
        for (int attempt = 1; attempt <= 2; attempt++) {
            try {
                Boolean updated = tx.execute(status -> doWrite(r));
                if (Boolean.FALSE.equals(updated)) {
                    log.warn("늦은 결과를 버립니다 — 이미 닫힌 회차 runId={} jobId={} 상태={}", r.runId(), r.jobId(), r.status());
                    return WriteResult.LATE;
                }
                return WriteResult.WRITTEN;
            } catch (RuntimeException e) {
                log.warn("예약 작업 결과 갱신 실패({}/2) runId={} 원인={}", attempt, r.runId(), e.getClass().getSimpleName());
                if (attempt == 1) pause();
            }
        }
        return WriteResult.FAILED;
    }

    private boolean doWrite(JobRunReport r) {
        String msg = r.msg() == null ? null : r.msg().length() > MSG_MAX ? r.msg().substring(0, MSG_MAX) : r.msg();
        int updated = jdbc.update(updateRunSql, r.status(), r.itemCnt(), msg, r.serverNm(), r.serviceTag(), r.userId(), r.runId());
        if (updated == 0) return false;
        if ("OK".equals(r.status())) {
            List<CollectedValue> values = r.collected();
            for (CollectedValue v : values) {
                CollectedValue fit = fit(r.runId(), v);
                if (fit == null) continue;
                jdbc.update(mergeDataSql, r.jobId(), r.slot(), fit.key(), fit.num(), fit.txt(), r.userId(), r.userId(), r.userId());
            }
        }
        return true;
    }

    /**
     * 수집 값을 COLLECT_DATA 칸에 맞춘다 — 한 값의 ORA 오류가 RUN 갱신까지 롤백하지 않게 한다.
     * 키가 비었거나 100자를 넘으면, 숫자 정수부가 16자리를 넘으면 그 값은 건너뛴다(null). 소수 8자리 초과는 HALF_UP, 글자 200자 초과는 자른다.
     */
    private static CollectedValue fit(String runId, CollectedValue v) {
        String key = v.key();
        if (key == null || key.isBlank() || key.codePointCount(0, key.length()) > KEY_MAX) {
            log.warn("수집 값을 건너뜁니다 runId={} 이유={}", runId, key == null || key.isBlank() ? "키 없음" : "키 길이 초과");
            return null;
        }
        BigDecimal num = v.num() == null ? null : v.num().setScale(NUM_SCALE, RoundingMode.HALF_UP);
        if (num != null && num.precision() - num.scale() > NUM_INT_DIGITS) {
            log.warn("수집 값을 건너뜁니다 runId={} 이유=숫자 범위 초과", runId);
            return null;
        }
        String txt = v.txt();
        if (txt != null && txt.codePointCount(0, txt.length()) > TXT_MAX) {
            txt = txt.substring(0, txt.offsetByCodePoints(0, TXT_MAX));
        }
        return new CollectedValue(key, num, txt);
    }

    private void pause() {
        if (retryDelay.isZero() || retryDelay.isNegative()) return;
        try {
            Thread.sleep(retryDelay.toMillis());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }
}
