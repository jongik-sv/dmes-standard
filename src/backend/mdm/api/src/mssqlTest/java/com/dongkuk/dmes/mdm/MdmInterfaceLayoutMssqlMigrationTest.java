package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmLayout;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConst;
import com.dongkuk.dmes.mdm.entity.MdmLayoutConstId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeader;
import com.dongkuk.dmes.mdm.entity.MdmLayoutHeaderId;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItem;
import com.dongkuk.dmes.mdm.entity.MdmLayoutItemId;
import com.dongkuk.dmes.mdm.repository.MdmLayoutConstRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutHeaderRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutItemRepository;
import com.dongkuk.dmes.mdm.repository.MdmLayoutRepository;
import jakarta.persistence.EntityManager;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Optional;
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
 * TSK-05-01 design.md §3.2 — V4(03 인터페이스 레이아웃)을 {@code @SpringBootTest}+{@code local-db}
 * 프로파일로 실제 SQL Server(Testcontainers)에 적용해 Hibernate 매핑(예약어 인용·IDENTITY·복합키)까지
 * 실제로 거치게 한다. naming-dialect-rules §6.1 인계 지목 #19(F9)를 이 Task 가 닫는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
@Testcontainers
class MdmInterfaceLayoutMssqlMigrationTest {

    @Container
    static final MSSQLServerContainer MSSQL = new MSSQLServerContainer(
            DockerImageName.parse("mcr.microsoft.com/mssql/server:2022-CU27-ubuntu-22.04")).acceptLicense();

    @Autowired
    DataSource dataSource;
    @Autowired
    EntityManager entityManager;
    @Autowired
    MdmLayoutRepository layoutRepository;
    @Autowired
    MdmLayoutItemRepository layoutItemRepository;
    @Autowired
    MdmLayoutHeaderRepository layoutHeaderRepository;
    @Autowired
    MdmLayoutConstRepository layoutConstRepository;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        try (Connection master = java.sql.DriverManager.getConnection(
                MSSQL.getJdbcUrl(), MSSQL.getUsername(), MSSQL.getPassword());
             Statement s = master.createStatement()) {
            s.execute("IF DB_ID('mdm') IS NULL CREATE DATABASE mdm");
        }
        String mdmUrl = MSSQL.getJdbcUrl() + ";databaseName=mdm";
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MSSQL::getUsername);
        registry.add("spring.datasource.password", MSSQL::getPassword);
    }

    @Test
    void local_db_설정으로_V1_V2_V3_V4_V8_이_적용된다() throws SQLException {
        // TSK-08-01 — V8(06 업무기준) 추가 반영. 완화가 아니라 새 버전 반영이다.
        Set<String> versions = new HashSet<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT version FROM flyway_schema_history WHERE success = 1")) {
            while (rs.next()) {
                versions.add(rs.getString(1));
            }
        }
        assertEquals(Set.of("1", "2", "3", "4", "8"), versions);
    }

    /**
     * #19(F9) — naming-dialect-rules §6.1 인계 지목을 이 Task 가 닫는다. BIN2 콜레이션 칼럼을 확인하고,
     * 대소문자만 다른 두 EAI_CODE 값이 서로 다른 행으로 INSERT 됨을 실제로 확인한다.
     */
    @Test
    void BIN2_콜레이션이_04_칼럼에_있고_대소문자를_구분한다() throws SQLException {
        Map<String, String> collations = new HashMap<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT t.name AS table_name, c.name AS column_name, c.collation_name FROM sys.columns c "
                             + "JOIN sys.tables t ON t.object_id = c.object_id "
                             + "WHERE c.collation_name IS NOT NULL AND t.name IN "
                             + "('TB_MDM_EAI','TB_MDM_LAYOUT','TB_MDM_LAYOUT_ITEM')")) {
            while (rs.next()) {
                collations.put(rs.getString("table_name") + "." + rs.getString("column_name"), rs.getString("collation_name"));
            }
        }
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_EAI.EAI_CODE"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_LAYOUT.LAYOUT_KIND"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_LAYOUT_ITEM.FILL_KIND"));
        assertEquals("Latin1_General_100_BIN2", collations.get("TB_MDM_LAYOUT_ITEM.COLUMN_PHYS"));

        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES ('B1x', N'대문자', 'EUC-KR')");
                s.execute("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES ('b1x', N'소문자', 'EUC-KR')");
                assertEquals(2, count(c, "SELECT COUNT(*) FROM TB_MDM_EAI WHERE EAI_CODE IN ('B1x','b1x')"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 순환 FK 후행 ALTER(§6.6)가 실제로 존재하고 강제됨을 확인한다. */
    @Test
    void 순환_FK_FK_TB_MDM_LAYOUT_EAI_가_존재하고_강제된다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            assertEquals(1, count(c, "SELECT COUNT(*) FROM sys.foreign_keys WHERE name = 'FK_TB_MDM_LAYOUT_EAI'"));
        }
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, EAI_CODE) "
                                + "VALUES ('MESSAGE', N'없는EAI', 'NOPE-EAI-XYZ')"),
                        "존재하지 않는 EAI_CODE 는 FK_TB_MDM_LAYOUT_EAI 가 거부해야 한다");
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /**
     * 예약어 칼럼([VERSION]·[OFFSET]·[LENGTH]) 매핑 왕복 — 엔티티로 저장 후 조회한 값이 저장한 값과
     * 일치함(D1 백틱 인용이 MSSQL [ ] 로 올바르게 변환됨의 직접 증거).
     */
    @Test
    @Transactional
    void 예약어_칼럼_VERSION_OFFSET_LENGTH_가_왕복한다() {
        MdmLayout layout = new MdmLayout("MESSAGE", "예약어왕복");
        layout.setLayoutVersion(7L);
        MdmLayout savedLayout = layoutRepository.save(layout);
        entityManager.flush();

        MdmLayoutItem item = new MdmLayoutItem(savedLayout.getLayoutId(), 1, "DATA");
        item.setOffset(123);
        item.setLength(45);
        layoutItemRepository.save(item);
        entityManager.flush();
        entityManager.clear();

        MdmLayout reloadedLayout = layoutRepository.findById(savedLayout.getLayoutId()).orElseThrow();
        assertEquals(7L, reloadedLayout.getLayoutVersion());
        MdmLayoutItem reloadedItem = layoutItemRepository.findById(
                new MdmLayoutItemId(savedLayout.getLayoutId(), 1)).orElseThrow();
        assertEquals(123, reloadedItem.getOffset());
        assertEquals(45, reloadedItem.getLength());
    }

    /** F1·F20 대조군 — MSSQL 에서도 COLUMN_PHYS·TRANS_UNIT FK 가 강제됨을 확인한다. */
    @Test
    void COLUMN_PHYS_와_TRANS_UNIT_FK_가_MSSQL_에서도_강제된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME) VALUES ('MESSAGE', N'FK대조군')");
                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS) "
                                + "SELECT LAYOUT_ID, 1, 'DATA', 'NOPE-PHYS-XYZ' FROM TB_MDM_LAYOUT "
                                + "WHERE LAYOUT_NAME = N'FK대조군'"),
                        "존재하지 않는 COLUMN_PHYS 는 FK_TB_MDM_LAYOUT_ITEM_COLUMN 이 거부해야 한다");
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** LAYOUT_ID 의 IDENTITY(1,1) 이 실제 save() 연속 호출로 단조 증가함을 확인한다. */
    @Test
    @Transactional
    void LAYOUT_ID_는_IDENTITY_로_단조_증가한다() {
        MdmLayout first = layoutRepository.save(new MdmLayout("MESSAGE", "채번1"));
        entityManager.flush();
        MdmLayout second = layoutRepository.save(new MdmLayout("MESSAGE", "채번2"));
        entityManager.flush();
        assertTrue(second.getLayoutId() > first.getLayoutId());
    }

    /** CASCADE 없음 — MSSQL 에서도 부착된 자식(LAYOUT_CONST)이 있으면 부모(LAYOUT_HEADER) DELETE 가 거부된다. */
    @Test
    void 부착된_CONST_가_있으면_MSSQL_에서도_HEADER_행_DELETE_가_거부된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                long messageLayoutId = insertLayout(c, "MESSAGE", "카스케이드메시지");
                long headerLayoutId = insertLayout(c, "HEADER", "카스케이드헤더");
                s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND) VALUES ("
                        + headerLayoutId + ", 1, 'CONST')");
                s.execute("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, SEQ, HEADER_LAYOUT_ID) VALUES ("
                        + messageLayoutId + ", 1, " + headerLayoutId + ")");
                s.execute("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE) "
                        + "VALUES (" + messageLayoutId + ", " + headerLayoutId + ", 1, 'X')");

                SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                        "DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = " + messageLayoutId + " AND SEQ = 1"),
                        "자식 TB_MDM_LAYOUT_CONST 가 있는 TB_MDM_LAYOUT_HEADER 행 DELETE 는 거부돼야 한다(불변 규칙 11)");
                assertEquals(547, ex.getErrorCode(), ex.getMessage());
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /**
     * 복합키 왕복(팀장 지시) — MdmLayoutItem·MdmLayoutHeader·MdmLayoutConst 세 엔티티를 각각
     * 리포지토리 {@code save()}로 저장하고, 그 {@code *Id} 값으로 {@code findById()}를 호출해 조회된
     * 필드가 저장한 값과 일치함을 확인한다(§3.3 의 SQLite {@code @IdClass} 왕복과 대조군).
     */
    @Test
    @Transactional
    void 세_복합키_엔티티가_MSSQL_에서도_findById_로_왕복한다() {
        MdmLayout messageLayout = layoutRepository.save(new MdmLayout("MESSAGE", "MSSQL복합키메시지"));
        MdmLayout headerLayout = layoutRepository.save(new MdmLayout("HEADER", "MSSQL복합키헤더"));
        entityManager.flush();

        MdmLayoutItem headerItem = new MdmLayoutItem(headerLayout.getLayoutId(), 1, "CONST");
        layoutItemRepository.save(headerItem);
        entityManager.flush();

        MdmLayoutHeader header = new MdmLayoutHeader(
                messageLayout.getLayoutId(), 1, headerLayout.getLayoutId());
        layoutHeaderRepository.save(header);
        entityManager.flush();

        // CONST_VALUE 는 VARCHAR(50) COLLATE Latin1_General_100_BIN2(단일 바이트 코드값 칼럼) 이라
        // 한글 등 비-Latin1 문자는 드라이버가 '?' 로 치환한다 — 다른 CONST 값 실측(B0/B1)과 같은 ASCII 값을 쓴다.
        MdmLayoutConst layoutConst = new MdmLayoutConst(
                messageLayout.getLayoutId(), headerLayout.getLayoutId(), 1, "MSSQL-B1");
        layoutConstRepository.save(layoutConst);
        entityManager.flush();
        entityManager.clear();

        Optional<MdmLayoutItem> reloadedItem = layoutItemRepository.findById(
                new MdmLayoutItemId(headerLayout.getLayoutId(), 1));
        assertTrue(reloadedItem.isPresent());
        assertEquals("CONST", reloadedItem.get().getFillKind());

        Optional<MdmLayoutHeader> reloadedHeader = layoutHeaderRepository.findById(
                new MdmLayoutHeaderId(messageLayout.getLayoutId(), 1));
        assertTrue(reloadedHeader.isPresent());
        assertEquals(headerLayout.getLayoutId(), reloadedHeader.get().getHeaderLayoutId());

        Optional<MdmLayoutConst> reloadedConst = layoutConstRepository.findById(
                new MdmLayoutConstId(messageLayout.getLayoutId(), headerLayout.getLayoutId(), 1));
        assertTrue(reloadedConst.isPresent());
        assertEquals("MSSQL-B1", reloadedConst.get().getConstValue());
    }

    private static long insertLayout(Connection c, String kind, String name) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME) OUTPUT inserted.LAYOUT_ID VALUES (?, ?)")) {
            ps.setString(1, kind);
            ps.setString(2, name);
            try (ResultSet rs = ps.executeQuery()) {
                rs.next();
                return rs.getLong(1);
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
