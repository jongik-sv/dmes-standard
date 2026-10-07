package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.zaxxer.hikari.HikariDataSource;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;

import java.sql.SQLException;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 화면 사용 표 {@code TB_SEC_SCREEN_USAGE_LOG}·{@code TB_SEC_SCREEN_USAGE_DAY} 의 Oracle 기준선(V1) 확인.
 * 예전 MSSQL DDL 을 H2 MSSQLServer 모드로 돌리던 {@code ScreenUsageMssqlDdlTest}(archive/test/screenusage)를 대체한다.
 *
 * <p>확인: 유일 제약 이름·칸, 색인 이름·칸·순서(USER_CONSTRAINTS·USER_CONS_COLUMNS·USER_INDEXES·USER_IND_COLUMNS),
 * 같은 (USER_ID, CLIENT_SEG_ID) 두 번째 INSERT 거절(ORA-00001), 엔티티 저장·조회 왕복.
 * 이름·칸은 {@code db/migration/oracle/mcmapuser/V1__baseline.sql} 과 엔티티 {@code @Table} 선언에 맞춘다.
 * 앱 사용자(MCMAPUSER) 접속에서 보므로 {@code USER_*} 사전이 MCMAPUSER 소유 표를 보여 준다.
 */
class ScreenUsageBaselineOraTest {

    private static final String LOG = "TB_SEC_SCREEN_USAGE_LOG";
    private static final String DAY = "TB_SEC_SCREEN_USAGE_DAY";

    private static HikariDataSource ds;
    private static JdbcTemplate jdbc;

    @BeforeAll
    static void connect() {
        ds = McmCoreOraTestDb.appDataSource("oracheck-usage");
        jdbc = new JdbcTemplate(ds);
    }

    @AfterAll
    static void disconnect() {
        if (ds != null) ds.close();
    }

    @BeforeEach
    @AfterEach
    void clean() {
        jdbc.update("DELETE FROM " + LOG);
        jdbc.update("DELETE FROM " + DAY);
    }

    private static List<String> constraintColumns(String type, String constraintName) {
        return jdbc.queryForList(
                "SELECT cc.COLUMN_NAME FROM USER_CONSTRAINTS c JOIN USER_CONS_COLUMNS cc ON cc.CONSTRAINT_NAME = c.CONSTRAINT_NAME "
                        + "WHERE c.CONSTRAINT_TYPE = ? AND c.CONSTRAINT_NAME = ? ORDER BY cc.POSITION",
                String.class, type, constraintName);
    }

    private static List<String> indexColumns(String indexName) {
        return jdbc.queryForList("SELECT COLUMN_NAME FROM USER_IND_COLUMNS WHERE INDEX_NAME = ? ORDER BY COLUMN_POSITION",
                String.class, indexName);
    }

    /** 기준선: UK_SEC_SCREEN_USAGE_LOG_SEG 가 (USER_ID, CLIENT_SEG_ID) 순서의 유일 제약이다. */
    @Test
    @DisplayName("LOG 표: UK_SEC_SCREEN_USAGE_LOG_SEG 가 (USER_ID, CLIENT_SEG_ID) 유일 제약이고, 받쳐 주는 색인도 유일하다")
    void uniqueConstraint() {
        assertThat(constraintColumns("U", "UK_SEC_SCREEN_USAGE_LOG_SEG")).containsExactly("USER_ID", "CLIENT_SEG_ID");
        assertThat(jdbc.queryForObject("SELECT TABLE_NAME FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME = 'UK_SEC_SCREEN_USAGE_LOG_SEG'", String.class))
                .isEqualTo(LOG);
        assertThat(jdbc.queryForObject("SELECT UNIQUENESS FROM USER_INDEXES WHERE INDEX_NAME = 'UK_SEC_SCREEN_USAGE_LOG_SEG'", String.class))
                .isEqualTo("UNIQUE");
    }

    /** 기준선: 기본 키 이름·칸. */
    @Test
    @DisplayName("기본 키: LOG 는 (USAGE_ID), DAY 는 (USAGE_DT, DEPT_CD, USER_ID, PAGE_ID)")
    void primaryKeys() {
        assertThat(constraintColumns("P", "PK_TB_SEC_SCREEN_USAGE_LOG")).containsExactly("USAGE_ID");
        assertThat(constraintColumns("P", "PK_TB_SEC_SCREEN_USAGE_DAY")).containsExactly("USAGE_DT", "DEPT_CD", "USER_ID", "PAGE_ID");
    }

    /** 기준선: LOG 의 보조 색인 3개 이름·칸·순서(엔티티 {@code @Index} 와 같다)와 비유일. */
    @Test
    @DisplayName("LOG 표 색인 3개: IX_…_STARTED(STARTED_AT)·IX_…_USER(USER_ID, STARTED_AT)·IX_…_PAGE(PAGE_ID, STARTED_AT), 모두 비유일")
    void secondaryIndexes() {
        assertThat(indexColumns("IX_SEC_SCREEN_USAGE_LOG_STARTED")).containsExactly("STARTED_AT");
        assertThat(indexColumns("IX_SEC_SCREEN_USAGE_LOG_USER")).containsExactly("USER_ID", "STARTED_AT");
        assertThat(indexColumns("IX_SEC_SCREEN_USAGE_LOG_PAGE")).containsExactly("PAGE_ID", "STARTED_AT");
        for (String name : List.of("IX_SEC_SCREEN_USAGE_LOG_STARTED", "IX_SEC_SCREEN_USAGE_LOG_USER", "IX_SEC_SCREEN_USAGE_LOG_PAGE")) {
            assertThat(jdbc.queryForObject("SELECT TABLE_NAME || ':' || UNIQUENESS FROM USER_INDEXES WHERE INDEX_NAME = ?", String.class, name))
                    .as(name).isEqualTo(LOG + ":NONUNIQUE");
        }
    }

    private static final String INSERT_LOG = "INSERT INTO " + LOG + " (USAGE_ID, USER_ID, PAGE_ID, START_KIND, STARTED_AT, ENDED_AT, DURATION_MS, CLIENT_SEG_ID, RECEIVED_AT) "
            + "VALUES (?, ?, 'p/a', 'OPEN', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1000, ?, CURRENT_TIMESTAMP)";

    /** 기준선: 같은 사용자·같은 clientSegId 의 두 번째 INSERT 는 유일 제약(ORA-00001)이 막고, 사용자나 구간이 다르면 허용한다. */
    @Test
    @DisplayName("같은 사용자·같은 clientSegId 두 번째 INSERT 는 ORA-00001, 다른 사용자·다른 구간은 허용")
    void uniqueRejectsDuplicate() {
        jdbc.update(INSERT_LOG, "u-1", "dupUser", "dup-seg");

        assertThatThrownBy(() -> jdbc.update(INSERT_LOG, "u-2", "dupUser", "dup-seg"))
                .isInstanceOf(DuplicateKeyException.class)
                .satisfies(e -> {
                    // ojdbc 의 가장 깊은 원인은 oracle.jdbc.OracleDatabaseException(SQLException 아님)이라 원인 사슬에서 SQLException 을 찾는다
                    SQLException sql = null;
                    for (Throwable t = e; t != null && sql == null; t = t.getCause()) {
                        if (t instanceof SQLException s) sql = s;
                    }
                    assertThat((Object) sql).as("원인 사슬의 SQLException").isNotNull();
                    assertThat(sql.getErrorCode()).as("ORA-00001 unique constraint violated").isEqualTo(1);
                    assertThat(sql.getMessage()).contains("UK_SEC_SCREEN_USAGE_LOG_SEG");
                });

        jdbc.update(INSERT_LOG, "u-3", "otherUser", "dup-seg");
        jdbc.update(INSERT_LOG, "u-4", "dupUser", "other-seg");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + LOG, Integer.class)).isEqualTo(3);
    }

    /** 기준선: 엔티티가 기준선 표에 그대로 저장되고 읽힌다(hbm2ddl none — 칸 이름·형·길이 불일치를 잡는다). */
    @Test
    @DisplayName("엔티티 왕복: LOG(시각·IP 39자)·DAY(누적 칸)가 기준선 표에 저장·조회된다")
    void entitiesRoundTrip() {
        LocalContainerEntityManagerFactoryBean factory = McmCoreOraTestDb.entityManagerFactory(ds,
                "com.dongkuk.dmes.mcm.screenusage.entity");
        factory.afterPropertiesSet();
        EntityManagerFactory emf = factory.getObject();

        ScreenUsageLog log = new ScreenUsageLog();
        log.setUsageId("rt-1");
        log.setUserId("userA");
        log.setDeptCd("D100");
        log.setPageId("csa/commUserMng");
        log.setStartKind("RESUME");
        log.setStartedAt(LocalDateTime.of(2026, 10, 2, 9, 0, 0));
        log.setEndedAt(LocalDateTime.of(2026, 10, 2, 9, 15, 0));
        log.setDurationMs(900_000L);
        log.setClientSegId("rt-seg");
        log.setClientIp("2001:0db8:85a3:0000:0000:8a2e:0370:7334");
        log.setReceivedAt(LocalDateTime.of(2026, 10, 2, 9, 16, 0));
        ScreenUsageDayId dayId = new ScreenUsageDayId("20261002", "csa/commUserMng", "userA", "-");
        ScreenUsageDay day = ScreenUsageDay.of(dayId);
        day.accumulate(true, 900_000L);

        EntityManager em = emf.createEntityManager();
        try {
            em.getTransaction().begin();
            em.persist(log);
            em.persist(day);
            em.getTransaction().commit();
            em.clear();

            ScreenUsageLog foundLog = em.find(ScreenUsageLog.class, "rt-1");
            assertThat(foundLog.getStartedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 0, 0));
            assertThat(foundLog.getEndedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 15, 0));
            assertThat(foundLog.getReceivedAt()).isEqualTo(LocalDateTime.of(2026, 10, 2, 9, 16, 0));
            assertThat(foundLog.getDurationMs()).isEqualTo(900_000L);
            assertThat(foundLog.getClientIp()).hasSize(39);
            ScreenUsageDay foundDay = em.find(ScreenUsageDay.class, dayId);
            assertThat(foundDay.getOpenCnt()).isEqualTo(1);
            assertThat(foundDay.getDurationMs()).isEqualTo(900_000L);
        } finally {
            em.close();
            factory.destroy(); // 풀(ds)은 닫지 않는다 — @AfterAll 이 닫는다
        }
    }
}
