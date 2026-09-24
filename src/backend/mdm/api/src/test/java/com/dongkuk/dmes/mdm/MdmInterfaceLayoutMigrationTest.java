package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.expectedColumns;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-01 design.md §3.1 — V4(03 인터페이스 레이아웃 5테이블, SQLite) 실제 적용을 실측한다.
 * {@code MdmTermDomainColumnMigrationTest} 와 같은 패턴(@TempDir + local 프로파일). 쓰기 단언은 메서드마다
 * 고유 값을 쓰거나(공유 @TempDir DB) 트랜잭션을 열고 rollback 으로 끝낸다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmInterfaceLayoutMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    private static final AtomicInteger SEQ = new AtomicInteger();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-interface-layout-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void flyway_가_V4_를_success_로_적용했다() throws SQLException {
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT success FROM flyway_schema_history WHERE version = '4'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=4 행이 없다");
            assertTrue(rs.getBoolean("success"), "V4 마이그레이션이 success=true 가 아니다");
        }
    }

    @Test
    void _5테이블_전부_생성되고_칼럼_집합이_기대값과_같다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                Set<String> columns = new LinkedHashSet<>();
                try (ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
                    while (rs.next()) {
                        columns.add(rs.getString("name"));
                    }
                }
                assertTrue(!columns.isEmpty(), table + " 이 생성되지 않았다");
                assertEquals(expectedColumns(table), columns, table + " 칼럼 집합");
            }
        }
    }

    @Test
    void 제약_인덱스_이름이_규칙표를_따른다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            Set<String> indexNames = new LinkedHashSet<>();
            try (ResultSet rs = s.executeQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name IN ("
                            + TABLES.stream().map(t -> "'" + t + "'").reduce((a, b) -> a + "," + b).orElseThrow()
                            + ")")) {
                while (rs.next()) {
                    indexNames.add(rs.getString(1));
                }
            }
            assertTrue(indexNames.contains("UX_TB_MDM_LAYOUT_HEADER_HDR"), indexNames.toString());

            for (String table : TABLES) {
                String tableSql;
                try (ResultSet rs = s.executeQuery(
                        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
                    assertTrue(rs.next(), table + " 가 없다");
                    tableSql = rs.getString(1);
                }
                assertTrue(tableSql.contains("CONSTRAINT PK_" + table + " "), table + " PK 이름: " + tableSql);
            }
        }
    }

    /** F1·F20 대조군 — 부모 TB_MDM_COLUMN·TB_MDM_UNIT 에 없는 값은 FK 가 거부해야 한다(불변 규칙 10). */
    @Test
    void COLUMN_PHYS_와_TRANS_UNIT_FK_가_존재하지_않는_값을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long layoutId = insertLayout(c, "MESSAGE", "레이아웃-" + SEQ.incrementAndGet());
                assertThrows(SQLException.class,
                        () -> insertLayoutItem(c, layoutId, 1, "DATA", "NOPE_PHYS-" + SEQ.incrementAndGet(),
                                null, null, 0, 10),
                        "존재하지 않는 COLUMN_PHYS 는 FK_TB_MDM_LAYOUT_ITEM_COLUMN 이 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertLayoutItem(c, layoutId, 2, "DATA", null,
                                "NOPE_UNIT-" + SEQ.incrementAndGet(), null, 10, 10),
                        "존재하지 않는 TRANS_UNIT 은 FK_TB_MDM_LAYOUT_ITEM_UNIT 이 거부해야 한다");

                String physName = insertColumn(c);
                String unitCode = insertUnit(c);
                insertLayoutItem(c, layoutId, 3, "DATA", physName, null, null, 20, 10); // 정상 값은 통과
                insertLayoutItem(c, layoutId, 4, "DATA", null, unitCode, null, 30, 10); // 정상 값은 통과
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void CHECK_3개가_위반을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                assertThrows(SQLException.class,
                        () -> insertLayout(c, "BAD_KIND", "레이아웃-" + SEQ.incrementAndGet()),
                        "CK_TB_MDM_LAYOUT_KIND 가 HEADER/MESSAGE 밖의 값을 거부해야 한다");

                long layoutId = insertLayout(c, "MESSAGE", "레이아웃-" + SEQ.incrementAndGet());
                assertThrows(SQLException.class,
                        () -> insertLayoutItem(c, layoutId, 1, "BAD_FILL", null, null, null, 0, 10),
                        "CK_TB_MDM_LAYOUT_ITEM_FILL_KIND 가 DATA/CONST/AUTO/FILLER 밖의 값을 거부해야 한다");

                String unitCode = insertUnit(c);
                assertThrows(SQLException.class,
                        () -> insertLayoutItem(c, layoutId, 2, "DATA", null, unitCode, "UNIT-ITEM", 10, 10),
                        "CK_TB_MDM_LAYOUT_ITEM_UNIT 이 TRANS_UNIT·UNIT_ITEM 동시 비NULL 을 거부해야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void UX_TB_MDM_LAYOUT_HEADER_HDR_이_중복_부착을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long messageLayoutId = insertLayout(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayout(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                assertThrows(SQLException.class,
                        () -> insertLayoutHeader(c, messageLayoutId, 2, headerLayoutId),
                        "같은 (LAYOUT_ID,HEADER_LAYOUT_ID) 재부착은 UX_TB_MDM_LAYOUT_HEADER_HDR 이 거부해야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 부착 무결성(FK3) — TB_MDM_LAYOUT_HEADER 에 실제 부착되지 않은 조합은 TB_MDM_LAYOUT_CONST 가 거부해야 한다. */
    @Test
    void 부착_안_된_조합의_LAYOUT_CONST_INSERT_는_FK3_이_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long messageLayoutId = insertLayout(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayout(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                insertLayoutItem(c, headerLayoutId, 1, "CONST", null, null, null, 0, 5);

                assertThrows(SQLException.class,
                        () -> insertLayoutConst(c, messageLayoutId, headerLayoutId, 1, "X"),
                        "부착되지 않은 (LAYOUT_ID,HEADER_LAYOUT_ID) 는 FK_TB_MDM_LAYOUT_CONST_HEADER 가 거부해야 한다");

                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                insertLayoutConst(c, messageLayoutId, headerLayoutId, 1, "X"); // 부착 후에는 통과해야 한다
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void EAI_LAYOUT_순환_참조가_양방향으로_성립한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String eaiCode = "EAI-" + SEQ.incrementAndGet();
                insertEai(c, eaiCode);
                long headerLayoutId = insertLayout(c, "HEADER", "헤더-" + SEQ.incrementAndGet());

                try (PreparedStatement ps = c.prepareStatement(
                        "UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = ? WHERE EAI_CODE = ?")) {
                    ps.setLong(1, headerLayoutId);
                    ps.setString(2, eaiCode);
                    assertEquals(1, ps.executeUpdate());
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "UPDATE TB_MDM_LAYOUT SET EAI_CODE = ? WHERE LAYOUT_ID = ?")) {
                    ps.setString(1, eaiCode);
                    ps.setLong(2, headerLayoutId);
                    assertEquals(1, ps.executeUpdate());
                }

                try (PreparedStatement select = c.prepareStatement(
                        "SELECT L.EAI_CODE, E.HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT L "
                                + "JOIN TB_MDM_EAI E ON E.EAI_CODE = L.EAI_CODE WHERE L.LAYOUT_ID = ?")) {
                    select.setLong(1, headerLayoutId);
                    try (ResultSet rs = select.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(eaiCode, rs.getString(1));
                        assertEquals(headerLayoutId, rs.getLong(2));
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** F6 — 감사 VER·업무 VERSION 모두 SQLite 도 BIGINT 로 선언됨을 DDL 텍스트로 직접 확인한다. */
    @Test
    void VER_와_VERSION_칼럼_모두_BIGINT_로_선언됐다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                String tableSql;
                try (ResultSet rs = s.executeQuery(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name='" + table + "'")) {
                    assertTrue(rs.next());
                    tableSql = rs.getString(1);
                }
                assertTrue(tableSql.contains("VER BIGINT"), table + " 의 VER 이 BIGINT 가 아니다: " + tableSql);
            }
            String layoutSql;
            try (ResultSet rs = s.executeQuery(
                    "SELECT sql FROM sqlite_master WHERE type='table' AND name='TB_MDM_LAYOUT'")) {
                assertTrue(rs.next());
                layoutSql = rs.getString(1);
            }
            assertTrue(layoutSql.contains("`VERSION` BIGINT") || layoutSql.contains("\"VERSION\" BIGINT"),
                    "TB_MDM_LAYOUT.VERSION 이 BIGINT 로 인용돼 있지 않다: " + layoutSql);
        }
    }

    /**
     * CASCADE 없음(불변 규칙 11) — 부착된 자식(TB_MDM_LAYOUT_CONST)이 있는 상태에서 부모
     * (TB_MDM_LAYOUT_HEADER) 행 DELETE 가 FK 위반으로 거부돼야 한다(자동 cascade 삭제가 아님의 직접 증거).
     */
    @Test
    void 부착된_CONST_가_있으면_HEADER_행_DELETE_가_거부된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long messageLayoutId = insertLayout(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayout(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                insertLayoutItem(c, headerLayoutId, 1, "CONST", null, null, null, 0, 5);
                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                insertLayoutConst(c, messageLayoutId, headerLayoutId, 1, "X");

                try (Statement s = c.createStatement()) {
                    SQLException ex = assertThrows(SQLException.class, () -> s.execute(
                            "DELETE FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = " + messageLayoutId
                                    + " AND SEQ = 1"),
                            "자식 TB_MDM_LAYOUT_CONST 가 있는 TB_MDM_LAYOUT_HEADER 행 DELETE 는 거부돼야 한다"
                                    + "(CASCADE 없음, 불변 규칙 11)");
                    assertTrue(ex.getMessage() != null);
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── 삽입 헬퍼 ──

    private static long insertLayout(Connection c, String kind, String name) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME) VALUES (?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, kind);
            ps.setString(2, name);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static void insertLayoutItem(Connection c, long layoutId, int seq, String fillKind,
            String columnPhys, String transUnit, String unitItem, int offset, int length) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, "
                        + "UNIT_ITEM, `OFFSET`, `LENGTH`) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")) {
            ps.setLong(1, layoutId);
            ps.setInt(2, seq);
            ps.setString(3, fillKind);
            ps.setString(4, columnPhys);
            ps.setString(5, transUnit);
            ps.setString(6, unitItem);
            ps.setInt(7, offset);
            ps.setInt(8, length);
            ps.executeUpdate();
        }
    }

    private static void insertLayoutHeader(Connection c, long layoutId, int seq, long headerLayoutId)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, SEQ, HEADER_LAYOUT_ID) VALUES (?, ?, ?)")) {
            ps.setLong(1, layoutId);
            ps.setInt(2, seq);
            ps.setLong(3, headerLayoutId);
            ps.executeUpdate();
        }
    }

    private static void insertLayoutConst(Connection c, long layoutId, long headerLayoutId, int headerSeq,
            String constValue) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE) "
                        + "VALUES (?, ?, ?, ?)")) {
            ps.setLong(1, layoutId);
            ps.setLong(2, headerLayoutId);
            ps.setInt(3, headerSeq);
            ps.setString(4, constValue);
            ps.executeUpdate();
        }
    }

    private static void insertEai(Connection c, String eaiCode) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING) VALUES (?, ?, 'EUC-KR')")) {
            ps.setString(1, eaiCode);
            ps.setString(2, "이름-" + eaiCode);
            ps.executeUpdate();
        }
    }

    /** 새 TB_MDM_DOMAIN·TB_MDM_COLUMN 행을 만들고 그 PHYS_NAME 값을 돌려준다(FK 대상, F1·F20). */
    private static String insertColumn(Connection c) throws SQLException {
        String physName = "PHYS" + SEQ.incrementAndGet();
        long domainId;
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE) "
                        + "VALUES (?, ?, 'QTY', 'NUMBER')",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, "도메인-" + physName);
            ps.setString(2, "STD-" + physName);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                domainId = keys.getLong(1);
            }
        }
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, ?)")) {
            ps.setString(1, "컬럼-" + physName);
            ps.setString(2, physName);
            ps.setLong(3, domainId);
            ps.executeUpdate();
        }
        return physName;
    }

    /** 새 TB_MDM_UNIT 행을 만들고 그 UNIT_CODE 값을 돌려준다(FK 대상, F1·F20). */
    private static String insertUnit(Connection c) throws SQLException {
        String unitCode = "UNIT" + SEQ.incrementAndGet();
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR) VALUES (?, 'LEN', ?, 1)")) {
            ps.setString(1, unitCode);
            ps.setString(2, unitCode);
            ps.executeUpdate();
        }
        return unitCode;
    }
}
