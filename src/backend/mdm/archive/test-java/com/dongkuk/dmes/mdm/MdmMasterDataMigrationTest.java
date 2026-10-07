package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmMasterDataExpectations.CATE_ALLOWED_DEF_TARGETS;
import static com.dongkuk.dmes.mdm.MdmMasterDataExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmMasterDataExpectations.expectedColumns;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.category.CategoryOwner;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-07-01 design.md §3.1 — V10(05 마스터데이터 7테이블, SQLite. 당초 V7, 머지 뒤 재채번) 실제 적용을 실측한다.
 * {@code MdmInterfaceLayoutMigrationTest} 와 같은 패턴(@TempDir + local 프로파일). 쓰기 단언은
 * 트랜잭션을 열고 rollback 으로 끝낸다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmMasterDataMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    private static final AtomicInteger SEQ = new AtomicInteger();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-master-data-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void flyway_가_V10_을_success_로_적용했다() throws SQLException {
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT success FROM flyway_schema_history WHERE version = '10'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=10 행이 없다");
            assertTrue(rs.getBoolean("success"), "V10 마이그레이션이 success=true 가 아니다");
        }
    }

    @Test
    void _7테이블_전부_생성되고_칼럼_집합이_기대값과_같다() throws SQLException {
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
    void PK_이름이_규칙표를_따른다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                String tableSql;
                try (ResultSet rs = s.executeQuery(
                        "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
                    assertTrue(rs.next(), table + " 가 없다");
                    tableSql = rs.getString(1);
                }
                assertTrue(tableSql.contains("PK_" + table), table + " PK 이름: " + tableSql);
            }
        }
    }

    /** F5 대조군 — TB_MDM_SYSTEM 에 없는 값으로 SOURCE_SYSTEM/SYSTEM_CODE 를 INSERT 하면 FK 가 거부해야 한다. */
    @Test
    void F5_대조군_SOURCE_SYSTEM_FK_가_존재하지_않는_값을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                assertThrows(SQLException.class,
                        () -> insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "EXTERNAL", "NOPE-SYS"),
                        "존재하지 않는 SOURCE_SYSTEM 은 FK_TB_MDM_DATA_SYSTEM_SRC 가 거부해야 한다");

                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);
                assertThrows(SQLException.class,
                        () -> insertDataSystem(c, maruDataId, "NOPE-SYS"),
                        "존재하지 않는 SYSTEM_CODE 는 FK_TB_MDM_DATA_SYSTEM_SYSTEM 이 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertDataRecv(c, "NOPE-SYS", "2026-09-24 10:00:00", "{}"),
                        "존재하지 않는 SOURCE_SYSTEM 은 FK_TB_MDM_DATA_RECV_SYSTEM 이 거부해야 한다");

                insertDataSystem(c, maruDataId, "MDM"); // 정상 값은 통과
                insertDataRecv(c, "MDM", "2026-09-24 10:00:00", "{}"); // 정상 값은 통과
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void CHECK_제약들이_위반을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                assertThrows(SQLException.class,
                        () -> insertData(c, "DATA-" + SEQ.incrementAndGet(), "BAD_STATUS", "MDM", null),
                        "CK_TB_MDM_DATA_STATUS 가 INUSE/DEPRECATED 밖의 값을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "BAD_KIND", null),
                        "CK_TB_MDM_DATA_SRC_KIND 가 MDM/EXTERNAL 밖의 값을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "EXTERNAL", null),
                        "CK_TB_MDM_DATA_SRC_SYS 가 EXTERNAL 인데 SOURCE_SYSTEM NULL 을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", "MDM"),
                        "CK_TB_MDM_DATA_SRC_SYS 가 MDM 인데 SOURCE_SYSTEM NOT NULL 을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertDataWithLvlCnt(c, "DATA-" + SEQ.incrementAndGet(), 6),
                        "CK_TB_MDM_DATA_LVL_CNT 가 0-5 밖의 값을 거부해야 한다");

                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);

                assertThrows(SQLException.class,
                        () -> insertDataCate(c, maruDataId, "CATE-A", "2026-09-24 10:00:00", "BAD_KIND", null, null),
                        "CK_TB_MDM_DATA_CATE_KIND 가 REGEX/TABLE 밖의 값을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertDataCate(c, maruDataId, "CATE-B", "2026-09-24 10:00:00", "REGEX", null, null),
                        "CK_TB_MDM_DATA_CATE_DEF 가 REGEX 인데 EXPR·TARGET NULL 을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertDataCate(c, maruDataId, "CATE-C", "2026-09-24 10:00:00", "TABLE", "^A$", "KEY"),
                        "CK_TB_MDM_DATA_CATE_DEF 가 TABLE 인데 EXPR·TARGET 비NULL 을 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertDataCate(c, maruDataId, "CATE-D", "2026-09-24 10:00:00", "REGEX", "^A$", "CODE"),
                        "CK_TB_MDM_DATA_CATE_TARGET(F18) 이 CODE 를 거부해야 한다(04 전용값)");
                insertDataCate(c, maruDataId, "CATE-E", "2026-09-24 10:00:00", "REGEX", "^A$", "KEY"); // 정상 값 통과

                assertThrows(SQLException.class,
                        () -> insertDataRecvWithResult(c, "MDM", "BAD_RESULT"),
                        "CK_TB_MDM_DATA_RECV_RESULT 가 OK/REJECTED/FAILED 밖의 값을 거부해야 한다");
                long recvId = insertDataRecv(c, "MDM", "2026-09-24 10:00:00", "{}");
                assertThrows(SQLException.class,
                        () -> insertDataRecvItemWithAction(c, recvId, 1, "BAD_ACTION"),
                        "CK_TB_MDM_DATA_RECV_ITEM_ACTION 이 다섯 값 밖을 거부해야 한다");
                insertDataRecvItemWithAction(c, recvId, 1, "INSERT"); // 정상 값 통과
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** F13 직접 증거 — TB_MDM_DATA_CATE_ITEM 은 CATE_ID·CODE 에 FK 가 없어 존재하지 않는 값도 성공해야 한다. */
    @Test
    void F13_직접_증거_CATE_ITEM_은_CATE_ID_CODE_에_FK_가_없다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);
                insertDataCateItem(c, maruDataId, "NOPE-CATE", "NOPE-CODE", "2026-09-24 10:00:00");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** F6(선분 PK) 직접 증거 — 같은 (MARU_DATA_ID,CODE)에 VALID_FROM 만 다른 두 행이 공존한다. */
    @Test
    void F6_직접_증거_같은_키_다른_VALID_FROM_행이_공존하고_완전_중복은_거부된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);
                insertDataItem(c, maruDataId, "ITEM-1", "2026-09-24 10:00:00", "이름1");
                insertDataItem(c, maruDataId, "ITEM-1", "2026-09-25 10:00:00", "이름2"); // 다른 VALID_FROM 은 공존

                assertThrows(SQLException.class,
                        () -> insertDataItem(c, maruDataId, "ITEM-1", "2026-09-24 10:00:00", "중복"),
                        "같은 (MARU_DATA_ID,CODE,VALID_FROM) 완전 중복은 PK 위반으로 거부해야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** F6 — VALID_TO 기본값이 DDL 텍스트에 '9999-12-31 00:00:00' 로 있는지 확인한다. */
    @Test
    void VALID_TO_기본값이_9999_12_31_이다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : Set.of("TB_MDM_DATA_ITEM", "TB_MDM_DATA_CATE", "TB_MDM_DATA_CATE_ITEM")) {
                String tableSql;
                try (ResultSet rs = s.executeQuery(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name='" + table + "'")) {
                    assertTrue(rs.next());
                    tableSql = rs.getString(1);
                }
                assertTrue(tableSql.contains("'9999-12-31 00:00:00'"), table + " VALID_TO 기본값: " + tableSql);
            }
        }
    }

    /** F15 직접 증거 — 7테이블 전부의 VER 칼럼이 BIGINT 로 선언됐다(ERD 초안의 INTEGER 가 아니다). */
    @Test
    void F15_직접_증거_VER_칼럼_모두_BIGINT_로_선언됐다() throws SQLException {
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
        }
    }

    /** F18 직접 증거 — CK_TB_MDM_DATA_CATE_TARGET·CK_TB_MDM_DATA_CATE_KIND 의 값 목록이 계약 enum 과 정확히 같다. */
    @Test
    void F18_직접_증거_CATE_CHECK_값_목록이_계약과_정확히_같다() throws SQLException {
        String tableSql;
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT sql FROM sqlite_master WHERE type='table' AND name='TB_MDM_DATA_CATE'")) {
            assertTrue(rs.next());
            tableSql = rs.getString(1);
        }

        Set<String> targetValues = extractInListValues(tableSql, "CK_TB_MDM_DATA_CATE_TARGET");
        Set<String> allowed = CategoryOwner.MASTER_DATA.allowedDefTargets().stream()
                .map(Enum::name).collect(Collectors.toSet());
        assertEquals(allowed, targetValues, "CK_TB_MDM_DATA_CATE_TARGET IN 목록: " + tableSql);
        assertEquals(CATE_ALLOWED_DEF_TARGETS, targetValues);

        Set<String> kindValues = extractInListValues(tableSql, "CK_TB_MDM_DATA_CATE_KIND");
        Set<String> kinds = java.util.Arrays.stream(CategoryKind.values()).map(Enum::name).collect(Collectors.toSet());
        assertEquals(kinds, kindValues, "CK_TB_MDM_DATA_CATE_KIND IN 목록: " + tableSql);
    }

    /** ADR-0002(DEFAULT 0) — 생략 INSERT 는 배포 칸이 0 으로 채워져야 한다. */
    @Test
    void ADR_0002_배포_칸_생략_INSERT_는_0으로_채워진다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT LAST_CHG_SEQ, CHG_SEQ FROM TB_MDM_DATA WHERE MARU_DATA_ID = ?")) {
                    ps.setString(1, maruDataId);
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(0, rs.getLong("LAST_CHG_SEQ"));
                        assertEquals(0, rs.getLong("CHG_SEQ"));
                    }
                }

                insertDataItem(c, maruDataId, "ITEM-1", "2026-09-24 10:00:00", "이름1");
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT CHG_SEQ FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = ?")) {
                    ps.setString(1, maruDataId);
                    ps.setString(2, "ITEM-1");
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(0, rs.getLong("CHG_SEQ"));
                    }
                }

                insertDataCate(c, maruDataId, "CATE-CHGSEQ", "2026-09-24 10:00:00", "TABLE", null, null);
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT CHG_SEQ FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = ? AND CATE_ID = ?")) {
                    ps.setString(1, maruDataId);
                    ps.setString(2, "CATE-CHGSEQ");
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(0, rs.getLong("CHG_SEQ"));
                    }
                }

                insertDataCateItem(c, maruDataId, "CATE-CHGSEQ", "CODE-CHGSEQ", "2026-09-24 10:00:00");
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT CHG_SEQ FROM TB_MDM_DATA_CATE_ITEM WHERE MARU_DATA_ID = ? AND CATE_ID = ? AND CODE = ?")) {
                    ps.setString(1, maruDataId);
                    ps.setString(2, "CATE-CHGSEQ");
                    ps.setString(3, "CODE-CHGSEQ");
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(0, rs.getLong("CHG_SEQ"));
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /**
     * 반개구간 경계 산술(F6, §5 불변 규칙 2) — [VALID_FROM,VALID_TO) 경계 세 지점을 확인한다.
     * T1(=VALID_FROM) 포함, T2 직전 포함, T2(=VALID_TO) 배타.
     */
    @Test
    void 반개구간_경계_산술이_T1_포함_T2_배타이다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String maruDataId = insertData(c, "DATA-" + SEQ.incrementAndGet(), "INUSE", "MDM", null);
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME, VALID_TO) "
                                + "VALUES (?, 'BOUND-1', '2026-09-24 10:00:00', '경계', '2026-09-24 11:00:00')")) {
                    ps.setString(1, maruDataId);
                    ps.executeUpdate();
                }

                assertEquals(1, countInBoundary(c, maruDataId, "2026-09-24 10:00:00"), "T1 은 포함");
                assertEquals(1, countInBoundary(c, maruDataId, "2026-09-24 10:59:59"), "T2 직전은 포함");
                assertEquals(0, countInBoundary(c, maruDataId, "2026-09-24 11:00:00"), "T2 는 배타");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    private int countInBoundary(Connection c, String maruDataId, String t) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? AND CODE = 'BOUND-1' "
                        + "AND VALID_FROM <= ? AND ? < VALID_TO")) {
            ps.setString(1, maruDataId);
            ps.setString(2, t);
            ps.setString(3, t);
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next());
                return rs.getInt(1);
            }
        }
    }

    // ── CHECK IN(...) 목록 파싱(§3.1-9) ──

    private static Set<String> extractInListValues(String tableSql, String constraintName) {
        Pattern pattern = Pattern.compile(
                Pattern.quote(constraintName) + "\\s+CHECK\\s*\\([^)]*IN\\s*\\(([^)]*)\\)");
        Matcher matcher = pattern.matcher(tableSql);
        assertTrue(matcher.find(), constraintName + " 를 " + tableSql + " 에서 찾지 못했다");
        String inList = matcher.group(1);
        Set<String> values = new LinkedHashSet<>();
        for (String token : inList.split(",")) {
            values.add(token.trim().replaceAll("^'|'$", ""));
        }
        return values;
    }

    // ── INSERT 헬퍼 ──

    private String insertData(Connection c, String maruDataId, String status, String sourceKind, String sourceSystem)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, SOURCE_SYSTEM) "
                        + "VALUES (?, ?, ?, ?, ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, "테스트-" + maruDataId);
            ps.setString(3, status);
            ps.setString(4, sourceKind);
            ps.setString(5, sourceSystem);
            ps.executeUpdate();
        }
        return maruDataId;
    }

    private void insertDataWithLvlCnt(Connection c, String maruDataId, int lvlCnt) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, STATUS, SOURCE_KIND, LVL_CNT) "
                        + "VALUES (?, ?, 'INUSE', 'MDM', ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, "테스트-" + maruDataId);
            ps.setInt(3, lvlCnt);
            ps.executeUpdate();
        }
    }

    private void insertDataSystem(Connection c, String maruDataId, String systemCode) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_SYSTEM (MARU_DATA_ID, SYSTEM_CODE) VALUES (?, ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, systemCode);
            ps.executeUpdate();
        }
    }

    private void insertDataItem(Connection c, String maruDataId, String code, String validFrom, String name)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, code);
            ps.setString(3, validFrom);
            ps.setString(4, name);
            ps.executeUpdate();
        }
    }

    private void insertDataCate(Connection c, String maruDataId, String cateId, String validFrom, String defKind,
            String defExpr, String defTarget) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, DEF_KIND, DEF_EXPR, DEF_TARGET) "
                        + "VALUES (?, ?, ?, ?, ?, ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, cateId);
            ps.setString(3, validFrom);
            ps.setString(4, defKind);
            ps.setString(5, defExpr);
            ps.setString(6, defTarget);
            ps.executeUpdate();
        }
    }

    private void insertDataCateItem(Connection c, String maruDataId, String cateId, String code, String validFrom)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_CATE_ITEM (MARU_DATA_ID, CATE_ID, CODE, VALID_FROM) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, maruDataId);
            ps.setString(2, cateId);
            ps.setString(3, code);
            ps.setString(4, validFrom);
            ps.executeUpdate();
        }
    }

    private long insertDataRecv(Connection c, String sourceSystem, String receivedAt, String body)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_RECV (SOURCE_SYSTEM, RECEIVED_AT, BODY) VALUES (?, ?, ?)")) {
            ps.setString(1, sourceSystem);
            ps.setString(2, receivedAt);
            ps.setString(3, body);
            ps.executeUpdate();
        }
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("SELECT last_insert_rowid()")) {
            rs.next();
            return rs.getLong(1);
        }
    }

    private void insertDataRecvWithResult(Connection c, String sourceSystem, String result) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_RECV (SOURCE_SYSTEM, RECEIVED_AT, BODY, \"RESULT\") "
                        + "VALUES (?, '2026-09-24 10:00:00', '{}', ?)")) {
            ps.setString(1, sourceSystem);
            ps.setString(2, result);
            ps.executeUpdate();
        }
    }

    private void insertDataRecvItemWithAction(Connection c, long recvId, int seq, String action) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DATA_RECV_ITEM (RECV_ID, SEQ, \"ACTION\") VALUES (?, ?, ?)")) {
            ps.setLong(1, recvId);
            ps.setInt(2, seq);
            ps.setString(3, action);
            ps.executeUpdate();
        }
    }
}
