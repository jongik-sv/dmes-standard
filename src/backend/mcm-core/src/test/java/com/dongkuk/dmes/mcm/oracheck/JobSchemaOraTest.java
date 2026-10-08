package com.dongkuk.dmes.mcm.oracheck;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

/**
 * V3(예약 작업 표 4개, 설계 §3) 확인 — 표·색인·제약·모듈 사용자 GRANT. 행은 각 시험 앞뒤에서 지운다.
 * GRANT 는 로컬 PDB 의 ANY TABLE 권한에 가려 실제 동작으로는 확인되지 않으므로 USER_TAB_PRIVS_MADE 로 읽는다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobSchemaOraTest {

    private static final List<String> MODULE_USERS = List.of("MDMAPUSER", "MLSAPUSER", "MPNAPUSER", "MPPAPUSER", "MQCAPUSER");

    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_HANDLER");
    }

    private void insertRun(String jobId, Timestamp schedAt, String trigger, String runId, String status) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES (?, ?, ?, ?, 'MCM', 'jobCode', ?)", jobId, schedAt, trigger, runId, status);
    }

    private void insertDef(String jobId, String module, String kind) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, SERVICE_ID, ACTION, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES (?, ?, 'n', ?, 'jobCode', 'run', '0 0 * * *', 60, 'USER')", jobId, module, kind);
    }

    @Test
    @DisplayName("표 4개가 있고 JOB_VER 는 없다")
    void tables() {
        List<String> tables = jdbc.queryForList(
                "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'MCMAPUSER' AND TABLE_NAME LIKE 'TB_MCM_JOB%' ORDER BY TABLE_NAME", String.class);
        assertThat(tables).containsExactly("TB_MCM_JOB_COLLECT_DATA", "TB_MCM_JOB_DEF", "TB_MCM_JOB_HANDLER", "TB_MCM_JOB_RUN");
    }

    @Test
    @DisplayName("매분 조회용 색인 IX_TB_MCM_JOB_DEF_DUE (USE_YN, NEXT_RUN_AT) 와 RUN_ID 유일 제약이 있다")
    void indexes() {
        List<String> dueCols = jdbc.queryForList(
                "SELECT COLUMN_NAME FROM ALL_IND_COLUMNS WHERE INDEX_OWNER = 'MCMAPUSER' AND INDEX_NAME = 'IX_TB_MCM_JOB_DEF_DUE' ORDER BY COLUMN_POSITION",
                String.class);
        assertThat(dueCols).containsExactly("USE_YN", "NEXT_RUN_AT");

        insertRun("J1", Timestamp.valueOf("2026-10-09 02:00:00"), "S", "run-1", "RUN");
        assertThatThrownBy(() -> insertRun("J2", Timestamp.valueOf("2026-10-09 02:00:00"), "S", "run-1", "RUN"))
                .isInstanceOf(DuplicateKeyException.class);
    }

    @Test
    @DisplayName("같은 (JOB_ID, SCHED_AT, TRIGGER_TP) 는 한 번만 — 회차 선점의 이중 안전장치")
    void duplicateRunKey() {
        Timestamp at = Timestamp.valueOf("2026-10-09 02:00:00");
        insertRun("J1", at, "S", "run-a", "RUN");
        assertThatThrownBy(() -> insertRun("J1", at, "S", "run-b", "RUN")).isInstanceOf(DuplicateKeyException.class);
        insertRun("J1", at, "M", "run-c", "RUN");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J1'", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("SCHED_AT(TIMESTAMP(0))은 소수 초를 반올림한다 — 넣기 전에 초 단위로 버려야 하는 근거")
    void schedAtRoundsToSecond() {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS) "
                + "VALUES ('J2', TIMESTAMP '2026-10-09 02:00:00.7', 'S', 'run-r', 'MCM', 'jobCode', 'RUN')");
        Timestamp stored = jdbc.queryForObject("SELECT SCHED_AT FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J2'", Timestamp.class);
        assertThat(stored).isEqualTo(Timestamp.valueOf("2026-10-09 02:00:01"));
    }

    @Test
    @DisplayName("CHECK — 유형은 CODE·BPMN·QUERY·COLLECT 만, 상태에 REQ 는 없다, 처리기 모듈은 6개만")
    void checkConstraints() {
        assertThatThrownBy(() -> insertDef("D1", "XXX", "CODE")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDef("D1", "MCM", "HTTP")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertDef("D1", "MCM", "PURGE")).isInstanceOf(DataIntegrityViolationException.class);
        insertDef("D2", "MPN", "COLLECT");
        assertThat(jdbc.queryForObject("SELECT USE_YN || VER FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'D2'", String.class)).isEqualTo("Y0");

        Timestamp at = Timestamp.valueOf("2026-10-09 02:00:00");
        assertThatThrownBy(() -> insertRun("J3", at, "S", "run-q", "REQ")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> insertRun("J3", at, "Z", "run-z", "RUN")).isInstanceOf(DataIntegrityViolationException.class);
        List<String> statuses = List.of("RUN", "OK", "FAIL", "SKIP", "TIMEOUT");
        for (int i = 0; i < statuses.size(); i++) {
            insertRun("J4", Timestamp.valueOf(java.time.LocalDateTime.of(2026, 10, 9, 2, i, 0)), "S", "run-" + statuses.get(i), statuses.get(i));
        }
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM) VALUES ('h', 'XXX', 'n')"))
                .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_HANDLER (HANDLER_ID, MODULE_CD, HANDLER_NM) VALUES ('mdm.h', 'MDM', 'n')");
    }

    @Test
    @DisplayName("모듈 사용자 5명에게 표별 최소 권한만 GRANT — RUN: SELECT·UPDATE, COLLECT_DATA·DEF·HANDLER: SELECT·INSERT·UPDATE, DELETE 없음")
    void grantsToModuleUsers() {
        Map<String, Set<String>> expected = Map.of(
                "TB_MCM_JOB_RUN", Set.of("SELECT", "UPDATE"),
                "TB_MCM_JOB_COLLECT_DATA", Set.of("SELECT", "INSERT", "UPDATE"),
                "TB_MCM_JOB_DEF", Set.of("SELECT", "INSERT", "UPDATE"),
                "TB_MCM_JOB_HANDLER", Set.of("SELECT", "INSERT", "UPDATE"));
        for (String user : MODULE_USERS) {
            Map<String, Set<String>> actual = jdbc.queryForList(
                            "SELECT TABLE_NAME, PRIVILEGE FROM USER_TAB_PRIVS_MADE WHERE GRANTEE = ? AND TABLE_NAME LIKE 'TB_MCM_JOB%'", user)
                    .stream().collect(Collectors.groupingBy(r -> (String) r.get("TABLE_NAME"),
                            Collectors.mapping(r -> (String) r.get("PRIVILEGE"), Collectors.toSet())));
            assertThat(actual).as(user).isEqualTo(expected);
        }
    }
}
