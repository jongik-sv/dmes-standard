package com.dongkuk.dmes.mcm.oracheck;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.sql.Timestamp;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * V3(예약 작업 표 4개)를 실제 Oracle 에서 확인한다 — 표 존재·모듈 버전 6행·실행 기록 기본 키(중복 선점 방지)·
 * SCHED_AT 초 단위 정밀도·CHECK 제약. 표는 기준선(V1~V3)이 만들고, 시험이 넣은 행은 각 시험 앞뒤에서 지운다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class JobSchemaOraTest {

    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_RUN");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_DEF");
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("UPDATE MCMAPUSER.TB_MCM_JOB_VER SET DEF_VER = 0");
    }

    private void insertRun(String jobId, Timestamp schedAt, String trigger, String module) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, MODULE_CD, STATUS) VALUES (?, ?, ?, ?, 'REQ')",
                jobId, schedAt, trigger, module);
    }

    @Test
    @DisplayName("표 4개가 있고 TB_MCM_JOB_VER 에 모듈 6행이 DEF_VER 0 으로 들어 있다")
    void tablesAndVerRows() {
        List<String> tables = jdbc.queryForList(
                "SELECT TABLE_NAME FROM ALL_TABLES WHERE OWNER = 'MCMAPUSER' AND TABLE_NAME LIKE 'TB_MCM_JOB%' ORDER BY TABLE_NAME", String.class);
        assertThat(tables).containsExactly("TB_MCM_JOB_COLLECT_DATA", "TB_MCM_JOB_DEF", "TB_MCM_JOB_RUN", "TB_MCM_JOB_VER");

        List<String> modules = jdbc.queryForList("SELECT MODULE_CD FROM MCMAPUSER.TB_MCM_JOB_VER ORDER BY MODULE_CD", String.class);
        assertThat(modules).containsExactly("MCM", "MDM", "MLS", "MPN", "MPP", "MQC");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_VER WHERE DEF_VER = 0", Integer.class)).isEqualTo(6);
    }

    @Test
    @DisplayName("같은 (JOB_ID, SCHED_AT, TRIGGER_TP) 를 두 번 넣으면 DuplicateKeyException — 회차 선점의 근거")
    void duplicateRunKey() {
        Timestamp at = Timestamp.valueOf("2026-10-08 02:00:00");
        insertRun("J1", at, "S", "MCM");
        assertThatThrownBy(() -> insertRun("J1", at, "S", "MCM")).isInstanceOf(DuplicateKeyException.class);
        // 트리거 구분이 다르면 별개 회차다
        insertRun("J1", at, "M", "MCM");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J1'", Integer.class)).isEqualTo(2);
    }

    @Test
    @DisplayName("SCHED_AT(TIMESTAMP(0))에 소수 초를 넣으면 초 단위로 반올림되어 저장된다 — 실측 기록")
    void schedAtRoundsToSecond() {
        // 2026-10-08 02:00:00.7 → Oracle 은 TIMESTAMP(0) 에 넣을 때 소수 초를 반올림한다(.7 → 다음 초 02:00:01)
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, MODULE_CD, STATUS) "
                + "VALUES ('J2', TIMESTAMP '2026-10-08 02:00:00.7', 'S', 'MCM', 'REQ')");
        Timestamp stored = jdbc.queryForObject("SELECT SCHED_AT FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J2'", Timestamp.class);
        assertThat(stored.getNanos()).isZero();
        assertThat(stored).isEqualTo(Timestamp.valueOf("2026-10-08 02:00:01"));

        // .3 → 반올림하면 같은 초
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, MODULE_CD, STATUS) "
                + "VALUES ('J3', TIMESTAMP '2026-10-08 02:00:00.3', 'S', 'MCM', 'REQ')");
        Timestamp stored3 = jdbc.queryForObject("SELECT SCHED_AT FROM MCMAPUSER.TB_MCM_JOB_RUN WHERE JOB_ID = 'J3'", Timestamp.class);
        assertThat(stored3).isEqualTo(Timestamp.valueOf("2026-10-08 02:00:00"));
    }

    @Test
    @DisplayName("CHECK 제약 — 정의의 모듈·유형·소유, 기록의 트리거·상태가 허용 값이 아니면 DataIntegrityViolationException")
    void checkConstraints() {
        Timestamp at = Timestamp.valueOf("2026-10-08 02:00:00");
        assertThatThrownBy(() -> insertRun("J4", at, "Z", "MCM")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, MODULE_CD, STATUS) "
                + "VALUES ('J4', ?, 'S', 'MCM', 'BAD')", at)).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('D1', 'XXX', 'n', 'CODE', '0 0 * * *', 60, 'CODE')")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('D1', 'MCM', 'n', 'NOPE', '0 0 * * *', 60, 'CODE')")).isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('D1', 'MCM', 'n', 'CODE', '0 0 * * *', 60, 'ETC')")).isInstanceOf(DataIntegrityViolationException.class);
        // 올바른 정의는 들어가고 USE_YN·VER 기본값이 채워진다
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_JOB_DEF (JOB_ID, MODULE_CD, JOB_NM, JOB_KIND, CRON_EXPR, TIMEOUT_SEC, OWNER_TP) "
                + "VALUES ('D2', 'MPN', 'n', 'PURGE', '0 0 * * *', 60, 'USER')");
        assertThat(jdbc.queryForObject("SELECT USE_YN || VER FROM MCMAPUSER.TB_MCM_JOB_DEF WHERE JOB_ID = 'D2'", String.class)).isEqualTo("Y0");
    }
}
