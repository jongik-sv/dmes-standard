package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.BUSINESS_DATETIME_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.CONSTRAINTS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.VERSION;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.VERSION_NUMBER_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.bin2Columns;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.expectedColumns;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.version.VersionConventions;
import com.dongkuk.dmes.mdm.entity.MdmCode;
import com.dongkuk.dmes.mdm.entity.MdmCodeCate;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateId;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeCateItemId;
import com.dongkuk.dmes.mdm.entity.MdmCodeItem;
import com.dongkuk.dmes.mdm.entity.MdmCodeItemId;
import com.dongkuk.dmes.mdm.entity.MdmCodeVer;
import com.dongkuk.dmes.mdm.entity.MdmCodeVerId;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeCateRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeRepository;
import com.dongkuk.dmes.mdm.repository.MdmCodeVerRepository;
import jakarta.persistence.EntityManager;
import java.math.BigDecimal;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mssqlserver.MSSQLServerContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * TSK-06-01 design.md §3.8 — V6(04 마스터코드 7테이블 + FK_TB_MDM_DOMAIN_CODE)을 {@code @SpringBootTest}+{@code local-db}
 * 프로파일로 실제 SQL Server(Testcontainers)에 적용한다({@code MdmInterfaceLayoutMssqlMigrationTest} 패턴).
 *
 * <p><b>사용자 결정(2026-09-24, 도커 금지)으로 이 테스트는 기준선·게이트·Build·Verify 에서 돌리지 않는다.</b> 선례와 관례를
 * 유지하려고 작성만 하며 Build 는 {@code :api:compileMssqlTestJava} 로 컴파일만 확인했다. 게이트 대체는
 * {@code MdmMasterCodeDialectDdlParityTest}(§3.11)·{@code MdmCodeEntityValueTest}(§3.12)와 Verify 의 DDL 리뷰(§3.13)다.
 * docker 사용이 허용되면 {@code :api:mssqlMigrationTest} 로 그대로 돌릴 수 있다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Testcontainers
class MdmMasterCodeMssqlMigrationTest {

    private static final BigDecimal V1_000 = new BigDecimal("1.000");
    private static final BigDecimal V1_001 = new BigDecimal("1.001");

    @Container
    static final MSSQLServerContainer MSSQL = new MSSQLServerContainer(
            DockerImageName.parse("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04")).acceptLicense();

    @Autowired
    DataSource dataSource;
    @Autowired
    EntityManager entityManager;
    @Autowired
    Environment environment;
    @Autowired
    MdmCodeRepository codeRepository;
    @Autowired
    MdmCodeVerRepository verRepository;
    @Autowired
    MdmCodeItemRepository itemRepository;
    @Autowired
    MdmCodeCateRepository cateRepository;
    @Autowired
    MdmCodeCateItemRepository cateItemRepository;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        try (Connection master = java.sql.DriverManager.getConnection(
                MSSQL.getJdbcUrl(), MSSQL.getUsername(), MSSQL.getPassword());
             Statement s = master.createStatement()) {
            s.execute("IF DB_ID('mdm_master_code') IS NULL CREATE DATABASE mdm_master_code");
        }
        String mdmUrl = MSSQL.getJdbcUrl() + ";databaseName=mdm_master_code";
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MSSQL::getUsername);
        registry.add("spring.datasource.password", MSSQL::getPassword);
    }

    // ── §3.1 1~4 반복 ──

    @Test
    void local_db_설정으로_V6_이_적용되고_7테이블_칼럼_집합이_기대값과_같다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            assertTrue(column(c, "SELECT version FROM flyway_schema_history WHERE success = 1").contains(VERSION));
            for (String table : TABLES) {
                Set<String> columns = column(c,
                        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = '" + table + "'");
                assertEquals(new TreeSet<>(expectedColumns(table)), columns, table);
                Set<String> constraints = column(c, "SELECT name FROM sys.objects WHERE parent_object_id = OBJECT_ID('"
                        + table + "') AND type IN ('PK','F','C')");
                assertTrue(constraints.containsAll(CONSTRAINTS.get(table)), table + " 제약: " + constraints);
            }
        }
    }

    @Test
    void DECIMAL_7_3_과_업무_일시_DATETIME2_0_과_DEF_EXPR_NVARCHAR_MAX_타입이다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            for (Map.Entry<String, Set<String>> e : VERSION_NUMBER_COLUMNS.entrySet()) {
                for (String column : e.getValue()) {
                    assertEquals("decimal|7|3", typeOf(c, e.getKey(), column), e.getKey() + "." + column);
                }
            }
            // 소수초 자릿수는 precision 이 아니라 scale 칸이다(#16).
            for (Map.Entry<String, Set<String>> e : BUSINESS_DATETIME_COLUMNS.entrySet()) {
                for (String column : e.getValue()) {
                    assertEquals("datetime2", typeOf(c, e.getKey(), column).split("\\|")[0], e.getKey() + "." + column);
                    assertEquals("0", typeOf(c, e.getKey(), column).split("\\|")[2], e.getKey() + "." + column + " scale");
                }
            }
            assertEquals("bigint", typeOf(c, "TB_MDM_CODE_VER", "ROW_VERSION").split("\\|")[0], "G2(D5)");
            assertEquals("-1", one(c, "SELECT CAST(c.max_length AS VARCHAR(10)) FROM sys.columns c WHERE c.object_id = "
                    + "OBJECT_ID('TB_MDM_CODE_CATE') AND c.name = 'DEF_EXPR'"), "NVARCHAR(MAX)");
            assertEquals("nvarchar", typeOf(c, "TB_MDM_CODE_CATE", "DEF_EXPR").split("\\|")[0], "G4(D6)");
        }
    }

    // ── #19 ──

    @Test
    void BIN2_콜레이션이_목록_칼럼에_있고_코드는_대소문자를_구분한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            for (String table : TABLES) {
                Set<String> bin2 = column(c, "SELECT c.name FROM sys.columns c WHERE c.object_id = OBJECT_ID('" + table
                        + "') AND c.collation_name = 'Latin1_General_100_BIN2'");
                assertEquals(new TreeSet<>(bin2Columns(table)), bin2, table);
            }
        }
        inRollback(c -> {
            seedCode(c, "CASE_CD");
            seedVer(c, "CASE_CD", "1.000");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('CASE_CD', 'A1', 1.000)");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('CASE_CD', 'a1', 1.000)");
            assertEquals("2", one(c, "SELECT CAST(COUNT(*) AS VARCHAR(10)) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'CASE_CD'"));
        });
    }

    // ── #2 ──

    @Test
    void RECV_ID_는_IDENTITY_로_단조_증가하고_지운_값을_재사용하지_않는다() throws SQLException {
        inRollback(c -> {
            List<Long> ids = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                ids.add(insertRecv(c));
            }
            assertTrue(ids.get(0) < ids.get(1) && ids.get(1) < ids.get(2), ids.toString());
            exec(c, "DELETE FROM TB_MDM_CODE_RECV WHERE RECV_ID = " + ids.get(2));
            assertTrue(insertRecv(c) > ids.get(2));
        });
    }

    // ── #16: 세터 초 절단·컨버터 미적용(설정 수준) ──

    @Test
    @Transactional
    void 업무_일시는_DATETIME2_0_에_초_단위로_저장되고_MSSQL_에는_SQLite_컨버터가_없다() {
        assertNull(environment.getProperty("spring.jpa.properties.hibernate.metadata_builder_contributor"),
                "SQLite 전용 컨트리뷰터가 MSSQL 컨텍스트에 등록되면 안 된다(D7)");
        codeRepository.save(new MdmCode("TIME_CD", "시각코드", "MDM"));
        MdmCodeVer ver = new MdmCodeVer("TIME_CD", V1_000, "MAJOR");
        ver.setApplyFrom(LocalDateTime.of(2026, 7, 1, 0, 0, 0, 700_000_000));
        ver.setApplyTo(VersionConventions.OPEN_END);
        verRepository.save(ver);
        entityManager.flush();
        entityManager.clear();
        MdmCodeVer reloaded = verRepository.findById(new MdmCodeVerId("TIME_CD", V1_000)).orElseThrow();
        assertEquals(LocalDateTime.of(2026, 7, 1, 0, 0, 0), reloaded.getApplyFrom(), "반올림하면 :01 이 된다(불변 규칙 22)");
        assertEquals(VersionConventions.OPEN_END, reloaded.getApplyTo());
    }

    // ── D6 ──

    @Test
    @Transactional
    void DEF_EXPR_는_한글_정규식을_손실_없이_담는다() {
        codeRepository.save(new MdmCode("KO_CD", "한글코드", "MDM"));
        verRepository.save(new MdmCodeVer("KO_CD", V1_000, "MAJOR"));
        entityManager.flush();
        MdmCodeCate cate = new MdmCodeCate("KO_CD", "KOREAN", V1_000, "REGEX");
        cate.setDefExpr(".*강.*");
        cate.setDefTarget("ATTR01");
        cateRepository.save(cate);
        entityManager.flush();
        entityManager.clear();
        assertEquals(".*강.*", cateRepository.findById(new MdmCodeCateId("KO_CD", "KOREAN", V1_000)).orElseThrow().getDefExpr());
    }

    // ── §3.1 5~10·13 반복 ──

    @Test
    void 기본값_CHECK_FK_CASCADE_없음이_MSSQL_에서도_같다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "RULE_CD");
            seedVer(c, "RULE_CD", "1.000");
            assertEquals("CREATED|0|0", one(c, "SELECT STATUS + '|' + CAST(LVL_CNT AS VARCHAR(10)) + '|' "
                    + "+ CAST(LAST_CHG_SEQ AS VARCHAR(10)) FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'RULE_CD'"));
            assertEquals("DRAFT|N|0", one(c, "SELECT STATUS + '|' + EMERGENCY_YN + '|' + CAST(ROW_VERSION AS VARCHAR(10)) "
                    + "FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'RULE_CD'"));
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('RULE_CD', 'A1', 1.000)");
            assertEquals("9999.000", one(c, "SELECT CAST(TO_VER AS VARCHAR(20)) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'RULE_CD'"));

            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, LVL_CNT) VALUES ('X6', N'n', 'MDM', 6)");
            rejected(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('RULE_CD', 'A B', 1.000)");
            String apply = "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO) VALUES ('RULE_CD', ";
            exec(c, apply + "1.002, 'MINOR', 'REQUESTED', '2026-07-01 00:00:00', NULL)");
            rejected(c, apply + "1.003, 'MINOR', 'RELEASED', '2026-07-01 00:00:00', NULL)");
            rejected(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('RULE_CD', 'B1', 1.009)");
            exec(c, "INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER) VALUES ('RULE_CD', 'NO_CATE', 'NO_ITEM', 1.000)");
            rejected(c, "DELETE FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'RULE_CD' AND VER = 1.000");
        });
    }

    @Test
    void FK_TB_MDM_DOMAIN_CODE_가_존재하고_강제된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            assertEquals("1", one(c, "SELECT CAST(COUNT(*) AS VARCHAR(10)) FROM sys.foreign_keys WHERE name = 'FK_TB_MDM_DOMAIN_CODE'"));
        }
        inRollback(c -> {
            String insert = "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID) "
                    + "VALUES (N'코드도메인', ?, 'CODE', 'CHAR', ?)";
            rejected(c, insert, "D_NOPE", "NOPE");
            exec(c, insert, "D_NULL", null);
            seedCode(c, "PROC_CD");
            exec(c, insert, "D_PROC", "PROC_CD");
        });
    }

    // ── 복합키 왕복(5 엔티티) ──

    @Test
    @Transactional
    void 다섯_엔티티가_scale_3_키로_왕복한다() {
        codeRepository.save(new MdmCode("PROC_CD", "공정코드", "MDM"));
        verRepository.save(new MdmCodeVer("PROC_CD", V1_000, "MAJOR"));
        verRepository.save(new MdmCodeVer("PROC_CD", V1_001, "MINOR"));
        entityManager.flush();
        itemRepository.save(new MdmCodeItem("PROC_CD", "82", V1_000));
        itemRepository.save(new MdmCodeItem("PROC_CD", "82", V1_001));
        MdmCodeCate base = new MdmCodeCate("PROC_CD", "BASE", V1_000, "REGEX");
        base.setDefExpr(".*");
        base.setDefTarget("CODE");
        cateRepository.save(base);
        cateItemRepository.save(new MdmCodeCateItem("PROC_CD", "MAJOR", "82", V1_000));
        entityManager.flush();
        entityManager.clear();

        assertEquals(V1_001, verRepository.findById(new MdmCodeVerId("PROC_CD", V1_001)).orElseThrow().getVer());
        assertEquals(V1_001, itemRepository.findById(new MdmCodeItemId("PROC_CD", "82", V1_001)).orElseThrow().getFromVer());
        assertEquals(V1_000, cateRepository.findById(new MdmCodeCateId("PROC_CD", "BASE", V1_000)).orElseThrow().getFromVer());
        assertEquals(V1_000, cateItemRepository.findById(
                new MdmCodeCateItemId("PROC_CD", "MAJOR", "82", V1_000)).orElseThrow().getFromVer());
        assertEquals("CREATED", codeRepository.findById("PROC_CD").orElseThrow().getStatus());
    }

    // ── 도우미 ──

    @FunctionalInterface
    private interface SqlWork {
        void run(Connection c) throws SQLException;
    }

    private void inRollback(SqlWork work) throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                work.run(c);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    private static void seedCode(Connection c, String id) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES (?, ?, 'MDM')", id, id);
    }

    private static void seedVer(Connection c, String id, String ver) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND) VALUES (?, ?, 'MAJOR')", id, new BigDecimal(ver));
    }

    private static long insertRecv(Connection c) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES ('MES', 'VERSION', '2026-07-01 00:00:00', N'{}')", Statement.RETURN_GENERATED_KEYS)) {
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                assertTrue(keys.next());
                return keys.getLong(1);
            }
        }
    }

    private static void exec(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            ps.executeUpdate();
        }
    }

    private static void rejected(Connection c, String sql, Object... params) {
        SQLException ex = assertThrows(SQLException.class, () -> exec(c, sql, params), sql);
        assertEquals(547, ex.getErrorCode(), ex.getMessage());
    }

    private static String one(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next(), sql);
            return rs.getString(1);
        }
    }

    private static Set<String> column(Connection c, String sql) throws SQLException {
        Set<String> values = new TreeSet<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                values.add(rs.getString(1));
            }
        }
        return values;
    }

    /** "타입|precision|scale"(sys.columns). */
    private static String typeOf(Connection c, String table, String column) throws SQLException {
        return one(c, "SELECT t.name + '|' + CAST(c.precision AS VARCHAR(5)) + '|' + CAST(c.scale AS VARCHAR(5)) "
                + "FROM sys.columns c JOIN sys.types t ON t.user_type_id = c.user_type_id "
                + "WHERE c.object_id = OBJECT_ID('" + table + "') AND c.name = '" + column + "'");
    }
}
