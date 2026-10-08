package com.dongkuk.dmes.cactus.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

import com.dongkuk.dmes.cactus.job.JobRunResultWriter.WriteResult;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.parallel.Execution;
import org.junit.jupiter.api.parallel.ExecutionMode;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.AbstractDataSource;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * {@link JobRunResultWriter} 를 실제 Oracle 에서 확인한다(설계 §4.5·§9). 접속값은 하니스(-Pdmes.ora.test=clone)가 넘기는
 * dmes.ora.url·dmes.ora.password(사용자는 dmes.ora.user, 기본 APSAPUSER)이고, 없으면 건너뛴다.
 * V3 는 mcm-core 소유라 이 시험은 접속 사용자 스키마에 V3 와 같은 칸의 표 둘을 만들고 {@code schema} 를 그 사용자로 준다.
 */
@Execution(ExecutionMode.SAME_THREAD)
class JobRunResultWriterOracleTest {

    private static final String URL = System.getProperty("dmes.ora.url");
    private static final String USER = System.getProperty("dmes.ora.user", "APSAPUSER");
    private static final String PASSWORD = System.getProperty("dmes.ora.password", "dmes_password_123");

    private static final String RUN_DDL = "CREATE TABLE TB_MCM_JOB_RUN (JOB_ID VARCHAR2(60 CHAR) NOT NULL, SCHED_AT TIMESTAMP(0) NOT NULL, "
            + "TRIGGER_TP CHAR(1 CHAR) NOT NULL, RUN_ID VARCHAR2(36 CHAR) NOT NULL, MODULE_CD VARCHAR2(10 CHAR), SERVICE_ID VARCHAR2(200 CHAR), "
            + "SERVER_NM VARCHAR2(100 CHAR), SERVICE_TAG VARCHAR2(40 CHAR), STATUS VARCHAR2(8 CHAR) NOT NULL, STARTED_AT TIMESTAMP(6), "
            + "ENDED_AT TIMESTAMP(6), ITEM_CNT NUMBER(10,0), MSG VARCHAR2(500 CHAR), REQ_USR_ID VARCHAR2(100 CHAR), TIMEOUT_SEC NUMBER(6,0), "
            + "VARS_JSON CLOB, C_AT TIMESTAMP(6), C_USR_ID VARCHAR2(100 CHAR), C_PGM_ID VARCHAR2(100 CHAR), C_SVC_ID VARCHAR2(100 CHAR), "
            + "U_AT TIMESTAMP(6), U_USR_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), U_SVC_ID VARCHAR2(100 CHAR), "
            + "VER NUMBER(19,0) DEFAULT 0 NOT NULL, CONSTRAINT PK_TEST_JOB_RUN PRIMARY KEY (JOB_ID, SCHED_AT, TRIGGER_TP), CONSTRAINT UQ_TEST_JOB_RUN UNIQUE (RUN_ID))";
    private static final String DATA_DDL = "CREATE TABLE TB_MCM_JOB_COLLECT_DATA (JOB_ID VARCHAR2(60 CHAR) NOT NULL, SLOT VARCHAR2(12 CHAR) NOT NULL, "
            + "ITEM_KEY VARCHAR2(100 CHAR) NOT NULL, VALUE_NUM NUMBER(24,8), VALUE_TXT VARCHAR2(200 CHAR), C_AT TIMESTAMP(6), C_USR_ID VARCHAR2(100 CHAR), "
            + "C_PGM_ID VARCHAR2(100 CHAR), C_SVC_ID VARCHAR2(100 CHAR), U_AT TIMESTAMP(6), U_USR_ID VARCHAR2(100 CHAR), U_PGM_ID VARCHAR2(100 CHAR), "
            + "U_SVC_ID VARCHAR2(100 CHAR), VER NUMBER(19,0) DEFAULT 0 NOT NULL, CONSTRAINT PK_TEST_JOB_CDATA PRIMARY KEY (JOB_ID, SLOT, ITEM_KEY))";

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;
    private JobRunResultWriter writer;

    @BeforeAll
    static void createTables() throws Exception {
        assumeTrue(URL != null && !URL.isBlank(), "시험 PDB 접속값(dmes.ora.url)이 없어 건너뜀");
        for (String t : List.of("TB_MCM_JOB_RUN", "TB_MCM_JOB_COLLECT_DATA")) drop(t);
        exec(RUN_DDL);
        exec(DATA_DDL);
        ds = new HikariDataSource();
        ds.setJdbcUrl(URL);
        ds.setUsername(USER);
        ds.setPassword(PASSWORD);
        ds.setMaximumPoolSize(3);
        ds.setMinimumIdle(0);
        ds.setPoolName("job-writer-test");
        jdbc = new JdbcTemplate(ds);
    }

    @AfterAll
    static void dropTables() throws Exception {
        if (ds != null) ds.close();
        if (URL == null || URL.isBlank()) return;
        for (String t : List.of("TB_MCM_JOB_RUN", "TB_MCM_JOB_COLLECT_DATA")) drop(t);
    }

    @BeforeEach
    void rows() {
        jdbc.update("DELETE FROM TB_MCM_JOB_COLLECT_DATA");
        jdbc.update("DELETE FROM TB_MCM_JOB_RUN");
        jdbc.update("INSERT INTO TB_MCM_JOB_RUN (JOB_ID, SCHED_AT, TRIGGER_TP, RUN_ID, MODULE_CD, SERVICE_ID, STATUS, STARTED_AT) "
                + "VALUES ('j1', TIMESTAMP '2026-10-09 02:00:00', 'S', 'run-1', 'MDM', 'job^^code', 'RUN', SYSTIMESTAMP)");
        writer = new JobRunResultWriter(ds, USER, Duration.ZERO);
    }

    private JobRunReport report(String status, List<CollectedValue> collected) {
        return new JobRunReport("run-1", "j1", status, 3, "메시지", "host:mdm:1", "ab12", "SCHEDULER", "202610090200", collected);
    }

    private Map<String, Object> run() {
        return jdbc.queryForMap("SELECT STATUS, ITEM_CNT, MSG, SERVER_NM, SERVICE_TAG, VER, ENDED_AT, U_USR_ID FROM TB_MCM_JOB_RUN WHERE RUN_ID = 'run-1'");
    }

    private int dataCount() {
        return jdbc.queryForObject("SELECT COUNT(*) FROM TB_MCM_JOB_COLLECT_DATA", Integer.class);
    }

    @Test
    @DisplayName("OK — RUN 행을 닫고(상태·건수·메시지·끝 시각·서버·태그·VER+1) 수집 값을 MERGE 한다")
    void okWritesRunAndCollectedValues() {
        List<CollectedValue> values = List.of(new CollectedValue("USD", new BigDecimal("1380.5"), null), new CollectedValue("NOTE", null, "정상"));
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.WRITTEN);

        Map<String, Object> r = run();
        assertThat(r.get("STATUS")).isEqualTo("OK");
        assertThat(((Number) r.get("ITEM_CNT")).intValue()).isEqualTo(3);
        assertThat(r.get("MSG")).isEqualTo("메시지");
        assertThat(r.get("SERVER_NM")).isEqualTo("host:mdm:1");
        assertThat(r.get("SERVICE_TAG")).isEqualTo("ab12");
        assertThat(r.get("ENDED_AT")).isNotNull();
        assertThat(((Number) r.get("VER")).longValue()).isEqualTo(1);
        assertThat(r.get("U_USR_ID")).isEqualTo("SCHEDULER");
        assertThat(dataCount()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT VALUE_NUM FROM TB_MCM_JOB_COLLECT_DATA WHERE ITEM_KEY = 'USD'", BigDecimal.class))
                .isEqualByComparingTo("1380.5");
    }

    @Test
    @DisplayName("SERVER_NM 은 MCM 이 접수 기록으로 이미 썼으면 덮어쓰지 않는다(NVL)")
    void serverNmKeptWhenPresent() {
        jdbc.update("UPDATE TB_MCM_JOB_RUN SET SERVER_NM = 'mcm-recorded' WHERE RUN_ID = 'run-1'");
        writer.write(report("OK", List.of()));
        assertThat(run().get("SERVER_NM")).isEqualTo("mcm-recorded");
    }

    @Test
    @DisplayName("FAIL·TIMEOUT 은 수집 값을 저장하지 않는다")
    void failDoesNotStoreCollected() {
        assertThat(writer.write(report("FAIL", List.of(new CollectedValue("USD", BigDecimal.ONE, null))))).isEqualTo(WriteResult.WRITTEN);
        assertThat(run().get("STATUS")).isEqualTo("FAIL");
        assertThat(dataCount()).isZero();
    }

    @Test
    @DisplayName("이미 TIMEOUT(정리)·SKIP 으로 닫힌 행은 덮어쓰지 않고 LATE — 수집 값도 저장하지 않는다")
    void lateResultDoesNotOverwrite() {
        jdbc.update("UPDATE TB_MCM_JOB_RUN SET STATUS = 'TIMEOUT', MSG = '결과 없음' WHERE RUN_ID = 'run-1'");
        assertThat(writer.write(report("OK", List.of(new CollectedValue("USD", BigDecimal.ONE, null))))).isEqualTo(WriteResult.LATE);
        assertThat(run().get("STATUS")).isEqualTo("TIMEOUT");
        assertThat(run().get("MSG")).isEqualTo("결과 없음");
        assertThat(dataCount()).isZero();
    }

    @Test
    @DisplayName("같은 결과를 두 번 쓰면 두 번째는 LATE — 수집 값은 상태가 바뀌는 그 한 번만 저장된다")
    void secondWriteIsLate() {
        List<CollectedValue> values = List.of(new CollectedValue("USD", BigDecimal.ONE, null));
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.WRITTEN);
        assertThat(writer.write(report("OK", values))).isEqualTo(WriteResult.LATE);
        assertThat(dataCount()).isEqualTo(1);
    }

    @Test
    @DisplayName("대상 서비스가 롤백돼도(바깥 트랜잭션 롤백) 결과 기록은 별도 트랜잭션(REQUIRES_NEW)이라 남는다")
    void writeSurvivesOuterRollback() {
        TransactionTemplate outer = new TransactionTemplate(new DataSourceTransactionManager(ds));
        outer.executeWithoutResult(status -> {
            // 바깥 트랜잭션이 스레드에 묶은 연결과 별개의 새 연결로 커밋한다
            assertThat(writer.write(report("FAIL", List.of()))).isEqualTo(WriteResult.WRITTEN);
            status.setRollbackOnly();
        });
        assertThat(run().get("STATUS")).isEqualTo("FAIL");
    }

    @Test
    @DisplayName("갱신이 DB 순간 오류로 실패하면 지연 뒤 한 번 더 한다 — 두 번째에 성공하면 WRITTEN")
    void retriesOnce() {
        AtomicInteger calls = new AtomicInteger();
        DataSource flaky = new AbstractDataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                if (calls.getAndIncrement() == 0) throw new SQLException("순간 오류");
                return ds.getConnection();
            }

            @Override
            public Connection getConnection(String u, String p) throws SQLException {
                return getConnection();
            }
        };
        JobRunResultWriter w = new JobRunResultWriter(flaky, USER, Duration.ZERO);
        assertThat(w.write(report("OK", List.of()))).isEqualTo(WriteResult.WRITTEN);
        assertThat(calls.get()).isGreaterThanOrEqualTo(2);
        assertThat(run().get("STATUS")).isEqualTo("OK");
    }

    @Test
    @DisplayName("두 번 모두 실패하면 예외를 던지지 않고 FAILED — 그 행은 정리가 TIMEOUT 으로 닫는다")
    void failsQuietlyAfterRetry() {
        DataSource broken = new AbstractDataSource() {
            @Override
            public Connection getConnection() throws SQLException {
                throw new SQLException("jdbc:oracle://secret-host/db password=hunter2");
            }

            @Override
            public Connection getConnection(String u, String p) throws SQLException {
                return getConnection();
            }
        };
        assertThat(new JobRunResultWriter(broken, USER, Duration.ZERO).write(report("OK", List.of()))).isEqualTo(WriteResult.FAILED);
        assertThat(run().get("STATUS")).isEqualTo("RUN");
    }

    @Test
    @DisplayName("스키마 이름은 식별자 모양만 받는다(SQL 접두에 그대로 들어가므로)")
    void rejectsBadSchema() {
        org.assertj.core.api.Assertions.assertThatThrownBy(() -> new JobRunResultWriter(ds, "X; DROP TABLE T", Duration.ZERO))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static void exec(String sql) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD); Statement st = c.createStatement()) {
            st.execute(sql);
        }
    }

    private static void drop(String table) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, USER, PASSWORD); Statement st = c.createStatement()) {
            st.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + table + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
        }
    }
}
