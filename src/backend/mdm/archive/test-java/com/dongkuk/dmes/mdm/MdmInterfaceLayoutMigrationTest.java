package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.INDEXES;
import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.auditCounter;
import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmInterfaceLayoutExpectations.expectedConstraints;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
 *
 * <p>D-144 3단계 — V4 적용 성공은 그대로 보고, 표 모양(칼럼·제약·인덱스)은 V21(레이아웃 버전)가 다시 만든 최종 모양으로 본다.
 * 항목·헤더 구성·상수는 버전 행(LAYOUT_ID, VER) 아래에 들어가고, 상수 재정의 대상은 헤더 항목 물리명이다.
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
    void _6테이블_전부_생성되고_칼럼_목록이_V21_기대값과_같다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                List<String> columns = new ArrayList<>();
                try (ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
                    while (rs.next()) {
                        columns.add(rs.getString("name"));
                    }
                }
                assertTrue(!columns.isEmpty(), table + " 이 생성되지 않았다");
                assertEquals(expectedColumns(table), columns, table + " 칼럼 목록(순서 포함)");
            }
        }
    }

    @Test
    void 제약_인덱스_이름이_규칙표를_따른다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            Set<String> indexNames = new LinkedHashSet<>();
            try (ResultSet rs = s.executeQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name NOT LIKE 'sqlite_autoindex%' AND tbl_name IN ("
                            + TABLES.stream().map(t -> "'" + t + "'").reduce((a, b) -> a + "," + b).orElseThrow()
                            + ")")) {
                while (rs.next()) {
                    indexNames.add(rs.getString(1));
                }
            }
            assertEquals(INDEXES, indexNames);

            for (String table : TABLES) {
                String tableSql = tableSql(s, table);
                assertTrue(tableSql.contains("CONSTRAINT PK_" + table + " "), table + " PK 이름: " + tableSql);
                Set<String> constraints = new LinkedHashSet<>();
                Matcher m = Pattern.compile("CONSTRAINT (\\w+)").matcher(tableSql);
                while (m.find()) {
                    constraints.add(m.group(1));
                }
                assertEquals(expectedConstraints(table), constraints, table + " 제약 이름");
            }
        }
    }

    /** F1·F20 대조군 — 부모 TB_MDM_COLUMN·TB_MDM_UNIT 에 없는 값은 FK 가 거부해야 한다(불변 규칙 10). */
    @Test
    void COLUMN_PHYS_와_TRANS_UNIT_FK_가_존재하지_않는_값을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long layoutId = insertLayoutWithVersion(c, "MESSAGE", "레이아웃-" + SEQ.incrementAndGet());
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

    /** V21 — 항목은 버전 행(LAYOUT_ID, VER)이 있어야 들어간다(FK_TB_MDM_LAYOUT_ITEM_VER). */
    @Test
    void 버전_행이_없는_항목은_FK_가_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long layoutId = insertLayout(c, "MESSAGE", "레이아웃-" + SEQ.incrementAndGet());
                assertThrows(SQLException.class,
                        () -> insertLayoutItem(c, layoutId, 1, "FILLER", null, null, null, 0, 10),
                        "버전 행 없는 (LAYOUT_ID, VER) 는 FK_TB_MDM_LAYOUT_ITEM_VER 가 거부해야 한다");
                insertLayoutVer(c, layoutId, null);
                insertLayoutItem(c, layoutId, 1, "FILLER", null, null, null, 0, 10); // 버전 행 뒤에는 통과
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void CHECK_가_위반을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                assertThrows(SQLException.class,
                        () -> insertLayout(c, "BAD_KIND", "레이아웃-" + SEQ.incrementAndGet()),
                        "CK_TB_MDM_LAYOUT_KIND 가 HEADER/MESSAGE 밖의 값을 거부해야 한다");
                try (Statement s = c.createStatement()) {
                    assertThrows(SQLException.class,
                            () -> s.executeUpdate("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, STATUS) "
                                    + "VALUES ('MESSAGE', '상태-" + SEQ.incrementAndGet() + "', 'RELEASED')"),
                            "CK_TB_MDM_LAYOUT_STATUS 가 CREATED/INUSE/DEPRECATED 밖의 값을 거부해야 한다");
                }

                long layoutId = insertLayoutWithVersion(c, "MESSAGE", "레이아웃-" + SEQ.incrementAndGet());
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
                long messageLayoutId = insertLayoutWithVersion(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayoutWithVersion(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                assertThrows(SQLException.class,
                        () -> insertLayoutHeader(c, messageLayoutId, 2, headerLayoutId),
                        "같은 (LAYOUT_ID,VER,HEADER_LAYOUT_ID) 재부착은 UX_TB_MDM_LAYOUT_HEADER_HDR 이 거부해야 한다");
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
                long messageLayoutId = insertLayoutWithVersion(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayoutWithVersion(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                String physName = insertColumn(c);
                insertLayoutItem(c, headerLayoutId, 1, "CONST", physName, null, null, 0, 5);

                assertThrows(SQLException.class,
                        () -> insertLayoutConst(c, messageLayoutId, headerLayoutId, physName, "X"),
                        "부착되지 않은 (LAYOUT_ID,VER,HEADER_LAYOUT_ID) 는 FK_TB_MDM_LAYOUT_CONST_HEADER 가 거부해야 한다");

                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                insertLayoutConst(c, messageLayoutId, headerLayoutId, physName, "X"); // 부착 후에는 통과해야 한다
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** V21 — EAI 는 표준 헤더(레이아웃)를, 레이아웃 버전 행은 EAI 를 가리킨다. 부모 ↔ EAI 순환은 없다. */
    @Test
    void EAI_와_레이아웃_버전_행이_서로를_가리킨다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long headerLayoutId = insertLayout(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                String eaiCode = "EAI-" + SEQ.incrementAndGet();
                insertEai(c, eaiCode);
                try (PreparedStatement ps = c.prepareStatement(
                        "UPDATE TB_MDM_EAI SET HEADER_LAYOUT_ID = ? WHERE EAI_CODE = ?")) {
                    ps.setLong(1, headerLayoutId);
                    ps.setString(2, eaiCode);
                    assertEquals(1, ps.executeUpdate());
                }
                insertLayoutVer(c, headerLayoutId, eaiCode);

                try (PreparedStatement select = c.prepareStatement(
                        "SELECT V.EAI_CODE, E.HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_VER V "
                                + "JOIN TB_MDM_EAI E ON E.EAI_CODE = V.EAI_CODE WHERE V.LAYOUT_ID = ?")) {
                    select.setLong(1, headerLayoutId);
                    try (ResultSet rs = select.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(eaiCode, rs.getString(1));
                        assertEquals(headerLayoutId, rs.getLong(2));
                    }
                }
                long other = insertLayout(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                assertThrows(SQLException.class, () -> insertLayoutVer(c, other, "NOPE-" + SEQ.incrementAndGet()),
                        "없는 EAI 는 FK_TB_MDM_LAYOUT_VER_EAI 가 거부해야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /**
     * F6·D-034 — 부모·EAI 의 감사 VER 는 BIGINT, 버전 표 4개는 업무 버전 VER NUMERIC(7,3) 키 + 감사 AUD_VER BIGINT 다.
     * 부모에는 업무 VERSION 이 없다.
     */
    @Test
    void 감사_카운터와_업무_버전_칼럼_타입이_V21_모양이다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                String tableSql = tableSql(s, table);
                if ("VER".equals(auditCounter(table))) {
                    assertTrue(Pattern.compile("(?m)^\\s*VER BIGINT,?$").matcher(tableSql).find(),
                            table + " 의 감사 VER 이 BIGINT 가 아니다: " + tableSql);
                } else {
                    assertTrue(Pattern.compile("(?m)^\\s*AUD_VER BIGINT,?$").matcher(tableSql).find(),
                            table + " 의 감사 AUD_VER 이 BIGINT 가 아니다: " + tableSql);
                    assertTrue(Pattern.compile("(?m)^\\s*VER NUMERIC\\(7,3\\) NOT NULL,$").matcher(tableSql).find(),
                            table + " 의 업무 VER 가 NUMERIC(7,3) NOT NULL 이 아니다: " + tableSql);
                }
            }
            String layoutSql = tableSql(s, "TB_MDM_LAYOUT");
            assertTrue(!layoutSql.contains("VERSION"), "TB_MDM_LAYOUT 에 업무 VERSION 이 남았다: " + layoutSql);
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
                long messageLayoutId = insertLayoutWithVersion(c, "MESSAGE", "메시지-" + SEQ.incrementAndGet());
                long headerLayoutId = insertLayoutWithVersion(c, "HEADER", "헤더-" + SEQ.incrementAndGet());
                String physName = insertColumn(c);
                insertLayoutItem(c, headerLayoutId, 1, "CONST", physName, null, null, 0, 5);
                insertLayoutHeader(c, messageLayoutId, 1, headerLayoutId);
                insertLayoutConst(c, messageLayoutId, headerLayoutId, physName, "X");

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

    // ── 삽입 헬퍼(V21 모양 — 항목·헤더 구성·상수는 버전 1 아래에 넣는다) ──

    private static String tableSql(Statement s, String table) throws SQLException {
        try (ResultSet rs = s.executeQuery(
                "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
            assertTrue(rs.next(), table + " 가 없다");
            return rs.getString(1);
        }
    }

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

    /** 레이아웃과 그 첫 DRAFT 버전(1.000) 행을 만든다. */
    private static long insertLayoutWithVersion(Connection c, String kind, String name) throws SQLException {
        long layoutId = insertLayout(c, kind, name);
        insertLayoutVer(c, layoutId, null);
        return layoutId;
    }

    private static void insertLayoutVer(Connection c, long layoutId, String eaiCode) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, EAI_CODE) "
                        + "VALUES (?, 1, 'MAJOR', 'DRAFT', 'kim', ?)")) {
            ps.setLong(1, layoutId);
            ps.setString(2, eaiCode);
            ps.executeUpdate();
        }
    }

    private static void insertLayoutItem(Connection c, long layoutId, int seq, String fillKind,
            String columnPhys, String transUnit, String unitItem, int offset, int length) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, TRANS_UNIT, "
                        + "UNIT_ITEM, `OFFSET`, `LENGTH`) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?)")) {
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
                "INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, VER, SEQ, HEADER_LAYOUT_ID) VALUES (?, 1, ?, ?)")) {
            ps.setLong(1, layoutId);
            ps.setInt(2, seq);
            ps.setLong(3, headerLayoutId);
            ps.executeUpdate();
        }
    }

    private static void insertLayoutConst(Connection c, long layoutId, long headerLayoutId, String headerColumnPhys,
            String constValue) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, VER, HEADER_LAYOUT_ID, HEADER_COLUMN_PHYS, CONST_VALUE) "
                        + "VALUES (?, 1, ?, ?, ?)")) {
            ps.setLong(1, layoutId);
            ps.setLong(2, headerLayoutId);
            ps.setString(3, headerColumnPhys);
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
