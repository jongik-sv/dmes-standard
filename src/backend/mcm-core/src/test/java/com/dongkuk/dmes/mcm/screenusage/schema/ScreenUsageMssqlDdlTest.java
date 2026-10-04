package com.dongkuk.dmes.mcm.screenusage.schema;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;

import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.Properties;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * 운영 MSSQL DDL 정본을 H2 MSSQLServer 모드에서 실제로 실행하고, 엔티티가 그 테이블에 그대로 저장·조회되는지 본다
 * (ddl-auto 가 아니라 DDL 로 만든 테이블 — 컬럼명·타입 불일치를 잡는다).
 */
class ScreenUsageMssqlDdlTest {

    private static final String URL = "jdbc:h2:mem:screenusage_mssql;MODE=MSSQLServer;DB_CLOSE_DELAY=-1";

    @BeforeAll
    static void createSchema() throws Exception {
        Class.forName("org.h2.Driver"); // testRuntimeOnly — 문자열로만 로드
        try (Connection c = DriverManager.getConnection(URL, "sa", ""); Statement s = c.createStatement()) {
            for (String sql : ScreenUsageMssqlDdl.allStatements()) {
                s.execute(sql);
            }
        }
    }

    private static long count(String sql, String param) throws SQLException {
        try (Connection c = DriverManager.getConnection(URL, "sa", "");
             PreparedStatement ps = c.prepareStatement(sql)) {
            ps.setString(1, param);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    @Test
    @DisplayName("인덱스 3개와 (USER_ID, CLIENT_SEG_ID) 고유 제약이 정해진 이름으로 만들어진다")
    void indexesAndUniqueConstraint() throws Exception {
        for (ScreenUsageMssqlDdl.IndexDdl index : ScreenUsageMssqlDdl.LOG_INDEXES) {
            assertThat(count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.INDEXES WHERE INDEX_NAME = ?", index.name()))
                    .as(index.name()).isEqualTo(1);
        }
        assertThat(count("SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS "
                + "WHERE CONSTRAINT_TYPE = 'UNIQUE' AND CONSTRAINT_NAME = ?", "UK_SEC_SCREEN_USAGE_LOG_SEG"))
                .isEqualTo(1);
    }

    @Test
    @DisplayName("같은 사용자·같은 clientSegId 두 번째 INSERT 는 DDL 고유 제약이 막는다")
    void uniqueRejectsDuplicate() throws Exception {
        String insert = "INSERT INTO TB_SEC_SCREEN_USAGE_LOG (USAGE_ID, USER_ID, PAGE_ID, START_KIND, STARTED_AT, "
                + "ENDED_AT, DURATION_MS, CLIENT_SEG_ID, RECEIVED_AT) VALUES (?, 'dupUser', 'p/a', 'OPEN', "
                + "CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 1000, 'dup-seg', CURRENT_TIMESTAMP)";
        try (Connection c = DriverManager.getConnection(URL, "sa", "")) {
            try (PreparedStatement ps = c.prepareStatement(insert)) {
                ps.setString(1, "u-1");
                ps.executeUpdate();
            }
            assertThatThrownBy(() -> {
                try (PreparedStatement ps = c.prepareStatement(insert)) {
                    ps.setString(1, "u-2");
                    ps.executeUpdate();
                }
            }).isInstanceOf(SQLException.class);
        }
    }

    @Test
    @DisplayName("엔티티가 DDL 로 만든 테이블에 저장되고 그대로 읽힌다 (ddl-auto 없음)")
    void entitiesRoundTrip() {
        DriverManagerDataSource ds = new DriverManagerDataSource(URL, "sa", "");
        ds.setDriverClassName("org.h2.Driver");
        LocalContainerEntityManagerFactoryBean factory = new LocalContainerEntityManagerFactoryBean();
        factory.setDataSource(ds);
        factory.setPackagesToScan("com.dongkuk.dmes.mcm.screenusage.entity");
        factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
        Properties props = new Properties();
        props.put("hibernate.hbm2ddl.auto", "none");
        factory.setJpaProperties(props);
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
        ScreenUsageDay day = ScreenUsageDay.of(new ScreenUsageDayId("20261002", "csa/commUserMng", "userA", "-"));
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
            assertThat(foundLog.getDurationMs()).isEqualTo(900_000L);
            assertThat(foundLog.getClientIp()).hasSize(39);
            ScreenUsageDay foundDay = em.find(ScreenUsageDay.class,
                    new ScreenUsageDayId("20261002", "csa/commUserMng", "userA", "-"));
            assertThat(foundDay.getOpenCnt()).isEqualTo(1);
            assertThat(foundDay.getDurationMs()).isEqualTo(900_000L);
        } finally {
            em.close();
            factory.destroy();
        }
    }

    /** mcm 시드 소스 폴더. 시험이 읽는 파일은 아래 상수에 이름으로 적는다(폴더 전체를 훑지 않는다). */
    private static final Path MCM_INIT = Path.of("../mcm/api/src/main/java/com/dongkuk/dmes/mcm/init");
    /** ScreenUsageSchemaArtifacts(이 DDL 을 실행하는 단계)가 있는 파일 — DDL 참조 세 개를 여기서 찾는다. */
    private static final Path SCREEN_USAGE_ARTIFACTS_SOURCE = MCM_INIT.resolve("seed/ScreenUsageSchemaArtifacts.java");
    /** run() 이 단계 호출 순서를 정하는 파일 — 두 호출과 그 순서를 이 파일 하나 안에서 본다. */
    private static final Path RUN_ORDER_SOURCE = MCM_INIT.resolve("DataInitializer.java");

    @Test
    @DisplayName("mcm 시드(ScreenUsageSchemaArtifacts)가 MSSQL 분기에서 이 DDL 로 두 테이블과 인덱스를 멱등 생성한다")
    void dataInitializerUsesDdl() throws Exception {
        String artifacts = Files.readString(SCREEN_USAGE_ARTIFACTS_SOURCE);
        assertThat(artifacts).as(SCREEN_USAGE_ARTIFACTS_SOURCE.getFileName().toString())
                .contains("ScreenUsageMssqlDdl.CREATE_LOG_TABLE")
                .contains("ScreenUsageMssqlDdl.CREATE_DAY_TABLE")
                .contains("ScreenUsageMssqlDdl.LOG_INDEXES");

        // 순서는 여러 파일을 이어 붙이지 않고 run() 이 있는 파일 하나 안에서 본다.
        String runOrder = Files.readString(RUN_ORDER_SOURCE);
        int call = runOrder.indexOf("initScreenUsageArtifacts();");
        int sqliteElse = runOrder.indexOf("createSecMenuFldForSqlite();");
        assertThat(call).as("initScreenUsageArtifacts(); 호출 (" + RUN_ORDER_SOURCE.getFileName() + ")").isNotNegative();
        assertThat(sqliteElse).as("createSecMenuFldForSqlite(); 호출 (" + RUN_ORDER_SOURCE.getFileName() + ")").isNotNegative();
        assertThat(call).as("MSSQL 분기 호출이 SQLite else 보다 앞").isLessThan(sqliteElse); // if (!sqliteDialect) 블록 안
    }
}
