package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.server.JobRunStore;
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
class JobRunStoreOraTest {

    private static final String NOW = "CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)";

    @Autowired DataSource dataSource;
    @Autowired JdbcTemplate jdbc;
    private JobRunStore store;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        store = new JobRunStore(dataSource, "MCMAPUSER");
    }

    /** startedAgoSec 초 전에 시작한 RUN 행. */
    private void run(String runId, String status, long startedAgoSec, int timeoutSec) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT, TIMEOUT_SEC) "
                + "VALUES (?, TIMESTAMP '2026-10-09 02:00:00' + NUMTODSINTERVAL(?, 'SECOND'), 'S', ?, 'MDM', 'jobCode', ?, "
                + NOW + " - NUMTODSINTERVAL(?, 'SECOND'), ?)", "job-" + runId, Math.abs(runId.hashCode() % 86000), runId, status, startedAgoSec, timeoutSec);
    }

    private Map<String, Object> row(String runId) {
        return jdbc.queryForMap("SELECT STATUS, MSG, SERVER_NM, ENDED_AT, VER FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE RUN_ID = ?", runId);
    }

    @Test
    @DisplayName("접수 기록은 SERVER_NM 만 쓴다(이미 있으면 유지) — STATUS 는 건드리지 않아 먼저 끝난 모듈의 결과와 경합하지 않는다")
    void markAcceptedWritesServerOnly() {
        run("a", "RUN", 5, 60);
        assertThat(store.markAccepted("a", "srv1")).isEqualTo(1);
        assertThat(row("a").get("SERVER_NM")).isEqualTo("srv1");
        assertThat(row("a").get("STATUS")).isEqualTo("RUN");
        assertThat(store.markAccepted("a", "srv2")).isEqualTo(1);
        assertThat(row("a").get("SERVER_NM")).as("NVL 이라 처음 값을 유지").isEqualTo("srv1");

        run("done", "OK", 5, 60);
        store.markAccepted("done", "srv9");
        assertThat(row("done").get("STATUS")).as("모듈이 먼저 OK 로 끝냈어도 그대로").isEqualTo("OK");
    }

    @Test
    @DisplayName("거절로 닫기 — RUN 일 때만 SKIP·FAIL 로 바꾼다. 이미 OK 인 행은 덮어쓰지 않는다")
    void closeIfRunningOnlyWhenRunning() {
        run("a", "RUN", 5, 60);
        run("b", "OK", 5, 60);
        assertThat(store.closeIfRunning("a", "SKIP", "실행 풀 가득")).isEqualTo(1);
        assertThat(store.closeIfRunning("b", "FAIL", "모듈 호출 실패(ConnectException)")).isZero();
        assertThat(row("a").get("STATUS")).isEqualTo("SKIP");
        assertThat(row("a").get("MSG")).isEqualTo("실행 풀 가득");
        assertThat(row("a").get("ENDED_AT")).isNotNull();
        assertThat(row("b").get("STATUS")).isEqualTo("OK");
    }

    @Test
    @DisplayName("정리 — RUN 이고 STARTED_AT + (TIMEOUT_SEC + 300초) 가 지났으면 TIMEOUT. 여유 안의 RUN·이미 닫힌 행은 그대로")
    void sweepClosesStaleRunsOnly() {
        run("stale", "RUN", 2 * 3600, 60);
        run("withinMargin", "RUN", 100, 60);        // 100초 < 60 + 300
        run("justPast", "RUN", 400, 60);            // 400초 > 360초
        run("closed", "OK", 2 * 3600, 60);
        assertThat(store.sweep()).isEqualTo(2);
        assertThat(row("stale").get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(String.valueOf(row("stale").get("MSG"))).contains("결과 없음");
        assertThat(row("justPast").get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(row("withinMargin").get("STATUS")).isEqualTo("RUN");
        assertThat(row("closed").get("STATUS")).isEqualTo("OK");
        assertThat(store.sweep()).isZero();
    }

    @Test
    @DisplayName("실행 기록 보관 삭제 — 90일 지난 행만 덩어리로 지운다")
    void purgeRunsKeepsRecent() {
        run("old1", "OK", 91L * 86400, 60);
        run("old2", "FAIL", 100L * 86400, 60);
        run("recent", "OK", 89L * 86400, 60);
        assertThat(store.purgeRunsBefore(90, 1)).isEqualTo(2);
        assertThat(jdbc.queryForList("SELECT RUN_ID FROM MCMAPUSER.TB_MCM_JOB_RUN", String.class)).containsExactly("recent");
    }

    @Test
    @DisplayName("수집 값 보관 삭제 — 슬롯이 기준보다 작은 값만")
    void purgeCollectBySlot() {
        for (String slot : new String[] {"202601010000", "202607010000", "202610010000"}) {
            jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_COLLECT_DATA (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM) VALUES ('j', ?, 'K', 1)", slot);
        }
        assertThat(store.purgeCollectBefore("202607010000", 1000)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT SLOT FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA ORDER BY SLOT", String.class))
                .containsExactly("202607010000", "202610010000");
    }
}
