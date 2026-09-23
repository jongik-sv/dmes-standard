package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.JSON_VALUE_EXPECTED;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.JSON_VALUE_FIXTURE;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.embeddingFixture;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmColumn;
import com.dongkuk.dmes.mdm.entity.MdmDomain;
import com.dongkuk.dmes.mdm.repository.MdmColumnRepository;
import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.annotation.Transactional;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.mssqlserver.MSSQLServerContainer;
import org.testcontainers.utility.DockerImageName;

/**
 * TSK-04-01 design.md §3.2 — V3(02 용어·도메인·컬럼)을 {@code @SpringBootTest}+{@code local-db} 프로파일로
 * 실제 SQL Server(Testcontainers)에 적용해 Hibernate 매핑(#15·#16·IDENTITY)까지 실제로 거치게 한다.
 * {@code MdmMssqlMigrationTest}(순수 JDBC)와 달리 엔티티 저장으로 boolean↔BIT·Instant↔DATETIME2 를
 * 실측한다. docker 가 필요하다 — {@code :api:mssqlMigrationTest} 로만 돌고 test·testAll 에 들어가지 않는다.
 *
 * <p>부팅 순서(design.md §3.2): {@code @DynamicPropertySource} 안에서 먼저 master DB 에 raw JDBC 로
 * {@code CREATE DATABASE mdm} 을 실행한 뒤 datasource url 을 등록한다 — 이 메서드는 컨텍스트가 뜨기(및
 * Flyway 자동 마이그레이션이 실행되기) 전에 평가되므로, DB 생성이 그보다 먼저 끝나 있어야 한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Testcontainers
class MdmTermDomainColumnMssqlMigrationTest {

    @Container
    static final MSSQLServerContainer MSSQL = new MSSQLServerContainer(
            DockerImageName.parse("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04")).acceptLicense();

    @Autowired
    DataSource dataSource;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MdmDomainRepository domainRepository;
    @Autowired
    MdmColumnRepository columnRepository;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        try (Connection master = DriverManager.getConnection(MSSQL.getJdbcUrl(), MSSQL.getUsername(), MSSQL.getPassword());
             Statement s = master.createStatement()) {
            s.execute("IF DB_ID('mdm') IS NULL CREATE DATABASE mdm");
        }
        String mdmUrl = MSSQL.getJdbcUrl() + ";databaseName=mdm";
        // application-local-db.yml 의 ${DB_USERNAME}/${DB_PASSWORD} 는 기본값 없는 자리표시자라 세 값 모두 덮는다.
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MSSQL::getUsername);
        registry.add("spring.datasource.password", MSSQL::getPassword);
    }

    @Test
    void local_db_설정으로_V1_V2_V3_V4_가_적용된다() throws SQLException {
        // TSK-05-01 — V4(03 인터페이스 레이아웃) 추가 반영. 완화가 아니라 새 버전 반영이다.
        Set<String> versions = new HashSet<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT version FROM flyway_schema_history WHERE success = 1")) {
            while (rs.next()) {
                versions.add(rs.getString(1));
            }
        }
        assertEquals(Set.of("1", "2", "3", "4"), versions);
    }

    /** #3 — CHECK(ISJSON(...) = 1) 8개, 부정형 JSON INSERT 는 오류 547(CHECK 위반)로 거부. */
    @Test
    void JSON_CHECK_8개가_ISJSON_으로_부정형을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            long checkCount = count(c, "SELECT COUNT(*) FROM sys.check_constraints cc "
                    + "JOIN sys.tables t ON t.object_id = cc.parent_object_id "
                    + "WHERE t.name IN ('TB_MDM_TERM','TB_MDM_DOMAIN','TB_MDM_COLUMN') AND cc.definition LIKE '%ISJSON%'");
            assertEquals(8, checkCount, "불변 규칙 12 — JSON CHECK 는 정확히 8개");

            c.setAutoCommit(false);
            try {
                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, SYNONYMS) "
                                + "VALUES (N'JSON위반', 1, N'def', 'not-json')"));
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /**
     * #5 — JSON_VALUE(COL, '$.type') 이 SQLite json_extract 와 같은 경로 문법·같은 값을 반환한다.
     * {@code MdmDictionaryExpectations.JSON_VALUE_FIXTURE}/{@code _EXPECTED} 를
     * {@code MdmTermDomainColumnMigrationTest} 의 같은 이름 테스트와 공유해, 두 방언에 실제로 같은 입력을
     * 넣고 같은 경로로 값을 뽑아 비교한다(§3.2-③ "같은 입력 JSON 으로 양쪽 실행 후 비교").
     */
    @Test
    void JSON_VALUE_가_경로_로_값을_추출한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, STD_AST) "
                            + "OUTPUT inserted.DOMAIN_ID VALUES (N'JSON값', 'JSON_VALUE_D', 'QTY', 'NUMBER', ?)")) {
                ps.setString(1, JSON_VALUE_FIXTURE);
                try (ResultSet keys = ps.executeQuery()) {
                    keys.next();
                    long domainId = keys.getLong(1);
                    try (PreparedStatement select = c.prepareStatement(
                            "SELECT JSON_VALUE(STD_AST, '$.type') FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?")) {
                        select.setLong(1, domainId);
                        try (ResultSet rs = select.executeQuery()) {
                            assertTrue(rs.next());
                            assertEquals(JSON_VALUE_EXPECTED, rs.getString(1),
                                    "SQLite json_extract(STD_AST,'$.type') 와 같은 값이어야 한다");
                        }
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** #15 — MdmColumn.required(boolean) 를 실제 save()/findById() 로 BIT 왕복시킨다. */
    @Test
    @Transactional
    void REQUIRED_boolean_이_BIT_로_왕복한다() {
        MdmDomain domain = domainRepository.save(new MdmDomain("BIT용도메인", "MSSQL_BIT_DOMAIN", "TEXT", "STRING"));
        entityManager.flush();

        MdmColumn required = new MdmColumn("BIT컬럼참", "MSSQL_BIT_TRUE", domain.getDomainId());
        required.setRequired(true);
        MdmColumn savedRequired = columnRepository.save(required);
        MdmColumn notRequired = new MdmColumn("BIT컬럼거짓", "MSSQL_BIT_FALSE", domain.getDomainId());
        notRequired.setRequired(false);
        MdmColumn savedNotRequired = columnRepository.save(notRequired);
        entityManager.flush();
        entityManager.clear();

        assertTrue(columnRepository.findById(savedRequired.getColumnId()).orElseThrow().isRequired());
        assertFalse(columnRepository.findById(savedNotRequired.getColumnId()).orElseThrow().isRequired());
    }

    /**
     * #16 — {@code CactusAuditEntity.C_AT} 를 엔티티 저장으로 채우고(F14 — 항상 {@code Instant.now()}) DATETIME2
     * 칼럼에서 다시 읽어 왕복 오차가 허용 범위 안임을 확인한다. {@code C_USR_ID} 등은 AuditHolder 문맥이 없는
     * 순수 리포지토리 테스트이므로 NULL 로 남는 것이 정상이다(F14, "실패"가 아니다).
     */
    @Test
    @Transactional
    void C_AT_가_DATETIME2_로_왕복하고_AuditHolder_문맥_없이_C_USR_ID_는_NULL_로_남는다() {
        Instant before = Instant.now();
        MdmDomain saved = domainRepository.save(new MdmDomain("감사도메인", "MSSQL_AUDIT_DOMAIN", "TEXT", "STRING"));
        entityManager.flush();
        entityManager.clear();
        Instant after = Instant.now();

        MdmDomain reloaded = domainRepository.findById(saved.getDomainId()).orElseThrow();
        assertNotNull(reloaded.getCreatedAt(), "CactusAuditListener 가 C_AT 을 항상 채워야 한다(F14)");
        long toleranceSeconds = 5;
        assertTrue(!reloaded.getCreatedAt().isBefore(before.minusSeconds(toleranceSeconds))
                        && !reloaded.getCreatedAt().isAfter(after.plusSeconds(toleranceSeconds)),
                "C_AT 왕복 오차가 허용 범위를 벗어났다: " + reloaded.getCreatedAt());
        assertEquals(0L, reloaded.getVersion());
        assertNull(reloaded.getCreatedBy(), "AuditHolder 문맥이 없으면 C_USR_ID 는 NULL 로 남는 것이 정상이다(F14)");
    }

    /** #19 — BIN2 콜레이션 칼럼에 sys.columns 로 콜레이션을 확인하고, 대소문자만 다른 값의 실제 INSERT 로 이중 확인. */
    @Test
    void BIN2_콜레이션이_STD_NAME_DOMAIN_KIND_PHYS_NAME_SYSTEM_CODE_에_있고_대소문자를_구분한다() throws SQLException {
        Map<String, String> collations = new HashMap<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT t.name AS table_name, c.name AS column_name, c.collation_name FROM sys.columns c "
                             + "JOIN sys.tables t ON t.object_id = c.object_id "
                             + "WHERE c.collation_name IS NOT NULL AND t.name IN "
                             + "('TB_MDM_DOMAIN','TB_MDM_COLUMN','TB_MDM_COLUMN_SYSTEM')")) {
            while (rs.next()) {
                collations.put(rs.getString("table_name") + "." + rs.getString("column_name"), rs.getString("collation_name"));
            }
        }
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_DOMAIN.STD_NAME"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_DOMAIN.DOMAIN_KIND"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_COLUMN.PHYS_NAME"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_COLUMN_SYSTEM.SYSTEM_CODE"));

        // 실제 INSERT — 대소문자만 다른 PHYS_NAME 두 값이 서로 다른 행(UX_TB_MDM_COLUMN_PHYS_NAME 유일 위반 없음)으로 들어가야 한다.
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                long domainId;
                try (ResultSet keys = s.executeQuery(
                        "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE) "
                                + "OUTPUT inserted.DOMAIN_ID VALUES (N'BIN2도메인', 'MSSQL_BIN2_DOMAIN', 'QTY', 'NUMBER')")) {
                    keys.next();
                    domainId = keys.getLong(1);
                }
                s.execute("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) "
                        + "VALUES (N'대소문자1', 'AbC', " + domainId + ")");
                s.execute("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) "
                        + "VALUES (N'대소문자2', 'ABC', " + domainId + ")");
                assertEquals(2, count(c, "SELECT COUNT(*) FROM TB_MDM_COLUMN WHERE PHYS_NAME IN ('AbC','ABC')"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** #20 — UX_TB_MDM_TERM_ABBR 만 필터 인덱스(has_filter=1), NULL 다건·중복 비NULL 1건 규칙을 강제한다. */
    @Test
    void 필터_인덱스는_UX_TB_MDM_TERM_ABBR_만이고_NULL_다건_중복_비NULL_거부를_강제한다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            assertEquals(1, count(c, "SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_TB_MDM_TERM_ABBR' "
                    + "AND is_unique = 1 AND has_filter = 1"));
            assertEquals(0, count(c, "SELECT COUNT(*) FROM sys.indexes WHERE name = 'UX_TB_MDM_COLUMN_PHYS_NAME' "
                    + "AND has_filter = 1"), "UX_TB_MDM_COLUMN_PHYS_NAME 은 필터 인덱스가 아니다");
        }

        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION) VALUES (N'약어없음1', 1, N'd')");
                s.execute("INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION) VALUES (N'약어없음2', 1, N'd')");
                s.execute("INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_ABBR) "
                        + "VALUES (N'약어있음1', 1, N'd', 'DUPABBR')");
                SQLException dup = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_ABBR) "
                                + "VALUES (N'약어있음2', 1, N'd', 'DUPABBR')"));
                assertEquals(2601, dup.getErrorCode(), dup.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** #23 — VARBINARY(4096) 에 4,096바이트를 저장·재조회해 SQLite BLOB 결과와 바이트 단위로 동일함을 확인. */
    @Test
    void EMBEDDING_이_VARBINARY_4096_에_바이트_단위로_왕복한다() throws SQLException {
        byte[] fixture = embeddingFixture();
        assertEquals(4096, fixture.length);
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, EMBEDDING, EMBEDDING_MODEL) "
                            + "OUTPUT inserted.TERM_ID VALUES (N'MSSQL임베딩', 1, N'd', ?, ?)")) {
                ps.setBytes(1, fixture);
                ps.setString(2, "KURE-v1/test");
                long termId;
                try (ResultSet keys = ps.executeQuery()) {
                    keys.next();
                    termId = keys.getLong(1);
                }
                try (PreparedStatement select = c.prepareStatement(
                        "SELECT EMBEDDING, EMBEDDING_MODEL FROM TB_MDM_TERM WHERE TERM_ID = ?")) {
                    select.setLong(1, termId);
                    try (ResultSet rs = select.executeQuery()) {
                        assertTrue(rs.next());
                        assertArrayEquals(fixture, rs.getBytes("EMBEDDING"), "SQLite BLOB 왕복 결과와 바이트 단위로 같아야 한다");
                        assertEquals("KURE-v1/test", rs.getString("EMBEDDING_MODEL"));
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** IDENTITY(1,1) 이 실제 save() 연속 호출로 단조 증가함을 확인한다. */
    @Test
    @Transactional
    void DOMAIN_ID_는_IDENTITY_로_단조_증가한다() {
        MdmDomain first = domainRepository.save(new MdmDomain("채번1", "MSSQL_IDENTITY_1", "QTY", "NUMBER"));
        entityManager.flush();
        MdmDomain second = domainRepository.save(new MdmDomain("채번2", "MSSQL_IDENTITY_2", "QTY", "NUMBER"));
        entityManager.flush();
        assertTrue(second.getDomainId() > first.getDomainId());
    }

    /** F1 대조군을 MSSQL 에서도 실행 — TB_MDM_CODE 가 없어도 MARU_CODE_ID=NULL INSERT 는 정상 동작한다(D1 이 실제 파일에 반영됐음을 고정). */
    @Test
    void F1_대조군_TB_MDM_CODE_없이도_MARU_CODE_ID_NULL_INSERT_가_성공한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID) "
                            + "VALUES (N'F1대조군', 'MSSQL_F1_CONTROL', 'QTY', 'NUMBER', ?)")) {
                ps.setNull(1, Types.VARCHAR);
                assertEquals(1, ps.executeUpdate());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next());
            return rs.getLong(1);
        }
    }
}
