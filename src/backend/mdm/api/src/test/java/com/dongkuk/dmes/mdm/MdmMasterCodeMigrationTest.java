package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.AUD_VER_TABLES;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.CONSTRAINTS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.VERSION;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.VERSION_NUMBER_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.auditCounter;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmMasterCodeExpectations.pkColumns;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-01 design.md §3.1 — V6(04 마스터코드 7테이블 + {@code FK_TB_MDM_DOMAIN_CODE}, SQLite) 실제 적용을 실측한다.
 * {@code MdmInterfaceLayoutMigrationTest} 와 같은 패턴(@TempDir + local 프로파일). 쓰기 단언은 한 연결에서 트랜잭션을
 * 열고 rollback 으로 끝낸다(공유 DB 에 흔적을 남기지 않는다). 직접 INSERT 는 생성 API 가 없는 계약 전용 Task 의
 * seed-only 경로다(F27 ④).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmMasterCodeMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-master-code-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    // ── 1~4: 이력·구조 ──

    @Test
    void flyway_가_V6_을_success_로_적용했다() throws SQLException {
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT success FROM flyway_schema_history WHERE version = '" + VERSION + "'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=6 행이 없다");
            assertTrue(rs.getBoolean("success"), "V6 마이그레이션이 success=true 가 아니다");
        }
    }

    @Test
    void _7테이블_전부_생성되고_칼럼_집합이_기대값과_같다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            for (String table : TABLES) {
                Set<String> columns = new LinkedHashSet<>(tableInfo(c, table).keySet());
                assertFalse(columns.isEmpty(), table + " 이 생성되지 않았다");
                assertEquals(expectedColumns(table), columns, table + " 칼럼 집합");
            }
            // AUD_VER 예외(D-034, 불변 규칙 11): VER·RECV 에는 AUD_VER 가 있고 업무 VER 만 있다.
            for (String table : AUD_VER_TABLES) {
                assertTrue(tableInfo(c, table).containsKey("AUD_VER"), table);
            }
        }
    }

    @Test
    void PK_칼럼_순서와_제약_이름이_설계와_같다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            for (String table : TABLES) {
                TreeMap<Integer, String> pk = new TreeMap<>();
                try (Statement s = c.createStatement();
                     ResultSet rs = s.executeQuery("SELECT name, pk FROM pragma_table_info('" + table + "') WHERE pk > 0")) {
                    while (rs.next()) {
                        pk.put(rs.getInt("pk"), rs.getString("name"));
                    }
                }
                assertEquals(pkColumns(table), new ArrayList<>(pk.values()), table + " PK 칼럼 순서");

                String sql = tableSql(c, table);
                for (String constraint : CONSTRAINTS.get(table)) {
                    assertTrue(sql.contains("CONSTRAINT " + constraint + " "), table + " 에 " + constraint + " 가 없다: " + sql);
                }
            }
        }
    }

    @Test
    void 버전_칼럼은_NUMERIC_7_3_감사_카운터와_ROW_VERSION_은_BIGINT_다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            for (Map.Entry<String, Set<String>> e : VERSION_NUMBER_COLUMNS.entrySet()) {
                Map<String, Map<String, Object>> info = tableInfo(c, e.getKey());
                for (String column : e.getValue()) {
                    assertEquals("NUMERIC(7,3)", info.get(column).get("type"), e.getKey() + "." + column);
                }
            }
            for (String table : TABLES) {
                assertEquals("BIGINT", tableInfo(c, table).get(auditCounter(table)).get("type"),
                        table + " 감사 카운터(F5, 불변 규칙 12)");
            }
            assertEquals("BIGINT", tableInfo(c, "TB_MDM_CODE_VER").get("ROW_VERSION").get("type"), "ROW_VERSION(D5)");
        }
    }

    // ── 5: 기본값 ──

    @Test
    void 필수_칼럼만_넣으면_DDL_기본값이_채워진다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "DEF_CD");
            seedVer(c, "DEF_CD", "1.000");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('DEF_CD', 'A1', 1.000)");
            exec(c, "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND) VALUES ('DEF_CD', 'T1', 1.000, 'TABLE')");
            exec(c, "INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER) VALUES ('DEF_CD', 'T1', 'A1', 1.000)");

            assertEquals("CREATED|0|0", one(c,
                    "SELECT STATUS || '|' || LVL_CNT || '|' || LAST_CHG_SEQ FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'DEF_CD'"));
            assertEquals("DRAFT|N|0", one(c,
                    "SELECT STATUS || '|' || EMERGENCY_YN || '|' || ROW_VERSION FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'DEF_CD'"));
            for (String table : List.of("TB_MDM_CODE_ITEM", "TB_MDM_CODE_CATE", "TB_MDM_CODE_CATE_ITEM")) {
                BigDecimal toVer = new BigDecimal(one(c, "SELECT CAST(TO_VER AS TEXT) FROM " + table + " WHERE MARU_CODE_ID = 'DEF_CD'"));
                assertEquals(0, toVer.compareTo(new BigDecimal("9999")), table + " TO_VER 기본값: " + toVer);
            }
        });
    }

    // ── 6~7: CHECK ──

    @Test
    void CHECK_위반을_표마다_거부한다() throws SQLException {
        inRollback(c -> {
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, STATUS) VALUES ('C1','n','MDM','GONE')",
                    "CK_TB_MDM_CODE_STATUS");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES ('C2','n','SAP')",
                    "CK_TB_MDM_CODE_SRC_KIND");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES ('C3','n','EXTERNAL')",
                    "CK_TB_MDM_CODE_SRC_SYS(EXTERNAL 인데 원천 없음)");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, SOURCE_SYSTEM) VALUES ('C4','n','MDM','MES')",
                    "CK_TB_MDM_CODE_SRC_SYS(MDM 인데 원천 있음)");
            exec(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, SOURCE_SYSTEM) VALUES ('C5','n','EXTERNAL','MES')");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, LVL_CNT) VALUES ('C6','n','MDM',-1)",
                    "CK_TB_MDM_CODE_LVL_CNT(-1)");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, LVL_CNT) VALUES ('C7','n','MDM',6)",
                    "CK_TB_MDM_CODE_LVL_CNT(6)");
            exec(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, LVL_CNT) VALUES ('C8','n','MDM',0)");
            exec(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, LVL_CNT) VALUES ('C9','n','MDM',5)");

            rejected(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND) VALUES ('C8', 1.000, 'PATCH')",
                    "CK_TB_MDM_CODE_VER_KIND");
            rejected(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS) VALUES ('C8', 1.000, 'MAJOR', 'DONE')",
                    "CK_TB_MDM_CODE_VER_STATUS");
            rejected(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, EMERGENCY_YN) VALUES ('C8', 1.000, 'MAJOR', 'X')",
                    "CK_TB_MDM_CODE_VER_EMERGENCY_YN");

            seedVer(c, "C8", "1.000");
            rejected(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('C8', 'A B', 1.000)",
                    "CK_TB_MDM_CODE_ITEM_CODE(공백)");
            rejected(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('C8', 'A,B', 1.000)",
                    "CK_TB_MDM_CODE_ITEM_CODE(콤마)");
            rejected(c, "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND) VALUES ('C8', 'K1', 1.000, 'LIST')",
                    "CK_TB_MDM_CODE_CATE_KIND");
            rejected(c, "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND, DEF_TARGET) VALUES ('C8', 'K2', 1.000, 'REGEX', 'CODE')",
                    "CK_TB_MDM_CODE_CATE_DEF(REGEX 인데 DEF_EXPR NULL)");
            rejected(c, "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND, DEF_TARGET) VALUES ('C8', 'K3', 1.000, 'TABLE', 'CODE')",
                    "CK_TB_MDM_CODE_CATE_DEF(TABLE 인데 DEF_TARGET 있음)");
            exec(c, "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND, DEF_EXPR, DEF_TARGET) VALUES ('C8', 'BASE', 1.000, 'REGEX', '.*', 'CODE')");

            rejected(c, "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) VALUES ('MES', 'X', '2026-07-01 00:00:00', '{}')",
                    "CK_TB_MDM_CODE_RECV_REQ");
            rejected(c, "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY, \"RESULT\") VALUES ('MES', 'VERSION', '2026-07-01 00:00:00', '{}', 'PARTIAL')",
                    "CK_TB_MDM_CODE_RECV_RESULT");
            exec(c, "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY, \"RESULT\") VALUES ('MES', 'VERSION', '2026-07-01 00:00:00', '{}', 'OK')");
        });
    }

    /** D4 — REQUESTED 행(희망 apply_from 만 있고 apply_to 는 승인 때 채움, 04:999-1000)을 받는다. */
    @Test
    void CK_TB_MDM_CODE_VER_APPLY_는_REQUESTED_의_APPLY_TO_NULL_을_받는다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "APPLY_CD");
            String insert = "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND, STATUS, APPLY_FROM, APPLY_TO) "
                    + "VALUES ('APPLY_CD', ?, 'MINOR', ?, ?, ?)";
            exec(c, insert, new BigDecimal("1.001"), "DRAFT", null, null);
            exec(c, insert, new BigDecimal("1.002"), "REQUESTED", "2026-07-01 00:00:00", null);
            rejected(c, insert, "REQUESTED 인데 APPLY_FROM NULL", new BigDecimal("1.003"), "REQUESTED", null, null);
            rejected(c, insert, "RELEASED 인데 APPLY_TO NULL", new BigDecimal("1.004"), "RELEASED", "2026-07-01 00:00:00", null);
            exec(c, insert, new BigDecimal("1.005"), "RELEASED", "2026-07-01 00:00:00", "9999-12-31 00:00:00");
        });
    }

    // ── 8~10: FK ──

    @Test
    void FK_가_없는_부모를_거부하고_DECIMAL_키로_대조한다() throws SQLException {
        inRollback(c -> {
            rejected(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND) VALUES ('NOPE', 1.000, 'MAJOR')",
                    "FK_TB_MDM_CODE_VER_CODE");
            seedCode(c, "FK_CD");
            seedVer(c, "FK_CD", "1.000");
            seedVer(c, "FK_CD", "1.001");
            for (String sql : List.of(
                    "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('FK_CD', 'A1', ?)",
                    "INSERT INTO TB_MDM_CODE_CATE (MARU_CODE_ID, CATE_ID, FROM_VER, DEF_KIND) VALUES ('FK_CD', 'A1', ?, 'TABLE')",
                    "INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER) VALUES ('FK_CD', 'T', 'A1', ?)")) {
                rejected(c, sql, "(MARU_CODE_ID, FROM_VER=1.002) 가 VER 에 없다", new BigDecimal("1.002"));
                exec(c, sql, new BigDecimal("1.001"));
            }
            rejected(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('NOPE', 'A1', 1.000)",
                    "FK_TB_MDM_CODE_ITEM_CODE");
            rejected(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND, SOURCE_SYSTEM) VALUES ('X1','n','EXTERNAL','NOPE')",
                    "FK_TB_MDM_CODE_SYSTEM_SRC");
            rejected(c, "INSERT INTO TB_MDM_CODE_SYSTEM (MARU_CODE_ID, SYSTEM_CODE) VALUES ('FK_CD', 'NOPE')",
                    "FK_TB_MDM_CODE_SYSTEM_SYSTEM");
            rejected(c, "INSERT INTO TB_MDM_CODE_SYSTEM (MARU_CODE_ID, SYSTEM_CODE) VALUES ('NOPE', 'MES')",
                    "FK_TB_MDM_CODE_SYSTEM_CODE");
            exec(c, "INSERT INTO TB_MDM_CODE_SYSTEM (MARU_CODE_ID, SYSTEM_CODE) VALUES ('FK_CD', 'MES')");
            rejected(c, "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) VALUES ('NOPE', 'VERSION', '2026-07-01 00:00:00', '{}')",
                    "FK_TB_MDM_CODE_RECV_SYSTEM");
            rejected(c, "INSERT INTO TB_MDM_CODE_RECV (MARU_CODE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) VALUES ('NOPE', 'MES', 'VERSION', '2026-07-01 00:00:00', '{}')",
                    "FK_TB_MDM_CODE_RECV_CODE");
        });
    }

    /** 불변 규칙 7 — CATE_ITEM → CATE·ITEM, 모든 TO_VER 에는 FK 를 걸지 않는다(04:958). */
    @Test
    void CATE_ITEM_의_소속과_TO_VER_에는_FK_가_없다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "NOFK_CD");
            seedVer(c, "NOFK_CD", "1.000");
            exec(c, "INSERT INTO TB_MDM_CODE_CATE_ITEM (MARU_CODE_ID, CATE_ID, CODE, FROM_VER) VALUES ('NOFK_CD', 'NO_CATE', 'NO_ITEM', 1.000)");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER, TO_VER) VALUES ('NOFK_CD', 'A1', 1.000, 1.500)");
        });
    }

    /** 불변 규칙 8 — CASCADE 없음: 자식이 달린 부모 행 DELETE 는 거부된다. */
    @Test
    void 자식이_달린_VER_와_CODE_행_DELETE_는_거부된다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "CAS_CD");
            seedVer(c, "CAS_CD", "1.000");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('CAS_CD', 'A1', 1.000)");
            rejected(c, "DELETE FROM TB_MDM_CODE_VER WHERE MARU_CODE_ID = 'CAS_CD'", "ITEM 이 달린 VER 행 DELETE");
            rejected(c, "DELETE FROM TB_MDM_CODE WHERE MARU_CODE_ID = 'CAS_CD'", "VER 가 달린 CODE 행 DELETE");
            assertEquals("1", one(c, "SELECT COUNT(*) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'CAS_CD'"));
        });
    }

    // ── 11~12: 규칙표 #19·#2(SQLite) ──

    @Test
    void 규칙표_19_SQLite_는_대소문자만_다른_CODE_를_다른_행으로_받는다() throws SQLException {
        inRollback(c -> {
            seedCode(c, "CASE_CD");
            seedVer(c, "CASE_CD", "1.000");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('CASE_CD', 'A1', 1.000)");
            exec(c, "INSERT INTO TB_MDM_CODE_ITEM (MARU_CODE_ID, CODE, FROM_VER) VALUES ('CASE_CD', 'a1', 1.000)");
            assertEquals("2", one(c, "SELECT COUNT(*) FROM TB_MDM_CODE_ITEM WHERE MARU_CODE_ID = 'CASE_CD'"));
        });
    }

    @Test
    void 규칙표_2_RECV_ID_는_지운_최댓값을_재사용하지_않는다() throws SQLException {
        inRollback(c -> {
            List<Long> ids = new ArrayList<>();
            for (int i = 0; i < 3; i++) {
                ids.add(insertRecv(c));
            }
            assertTrue(ids.get(0) < ids.get(1) && ids.get(1) < ids.get(2), "RECV_ID 단조 증가: " + ids);
            exec(c, "DELETE FROM TB_MDM_CODE_RECV WHERE RECV_ID = " + ids.get(2));
            long next = insertRecv(c);
            assertTrue(next > ids.get(2), "지운 최댓값 " + ids.get(2) + " 를 재사용했다: " + next);
        });
    }

    // ── 13: FK_TB_MDM_DOMAIN_CODE(D3) ──

    @Test
    void FK_TB_MDM_DOMAIN_CODE_가_강제되고_재생성_뒤에도_도메인_구조가_살아_있다() throws SQLException {
        inRollback(c -> {
            String insertDomain = "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID) "
                    + "VALUES (?, ?, 'CODE', 'CHAR', ?)";
            rejected(c, insertDomain, "없는 코드 ID 는 FK_TB_MDM_DOMAIN_CODE 가 거부해야 한다", "코드도메인1", "CODE_D1", "NOPE");
            seedCode(c, "PROC_CD");
            exec(c, insertDomain, "코드도메인2", "CODE_D2", "PROC_CD");
            exec(c, insertDomain, "코드도메인3", "CODE_D3", null);
        });

        try (Connection c = dataSource.getConnection()) {
            Set<String> indexes = column(c, "SELECT name FROM pragma_index_list('TB_MDM_DOMAIN')");
            assertTrue(indexes.contains("IX_TB_MDM_DOMAIN_PARENT"), indexes.toString());

            Set<String> fks = column(c, "SELECT \"table\" || '(' || \"from\" || '->' || \"to\" || ')' FROM pragma_foreign_key_list('TB_MDM_DOMAIN')");
            assertEquals(Set.of("TB_MDM_DOMAIN(PARENT_DOMAIN_ID->DOMAIN_ID)", "TB_MDM_UNIT(UNIT_CODE->UNIT_CODE)",
                    "TB_MDM_CODE(MARU_CODE_ID->MARU_CODE_ID)"), fks);

            String sql = tableSql(c, "TB_MDM_DOMAIN");
            for (String name : List.of("PK_TB_MDM_DOMAIN", "FK_TB_MDM_DOMAIN_DOMAIN", "FK_TB_MDM_DOMAIN_UNIT",
                    "FK_TB_MDM_DOMAIN_CODE", "CK_TB_MDM_DOMAIN_CODE", "CK_TB_MDM_DOMAIN_FLAG",
                    "CK_TB_MDM_DOMAIN_STD_AST_JSON", "CK_TB_MDM_DOMAIN_BIZ_AST_JSON", "CK_TB_MDM_DOMAIN_EXAMPLES_JSON",
                    "CK_TB_MDM_DOMAIN_TEST_CASES_JSON")) {
                assertTrue(sql.contains("CONSTRAINT " + name + " "), "재생성된 TB_MDM_DOMAIN 에 " + name + " 가 없다: " + sql);
            }
            assertTrue(sql.contains("AUTOINCREMENT"), sql);

            Set<String> columnFks = column(c, "SELECT \"table\" FROM pragma_foreign_key_list('TB_MDM_COLUMN')");
            assertEquals(Set.of("TB_MDM_DOMAIN"), columnFks, "TB_MDM_COLUMN.FK_TB_MDM_COLUMN_DOMAIN 대상");
            assertFalse(column(c, "SELECT name FROM sqlite_master WHERE type = 'table'").contains("TB_MDM_DOMAIN_NEW"),
                    "재생성 임시 표가 남아 있다");
        }
    }

    // ── 도우미(seed-only, F27 ④) ──

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

    private static void seedCode(Connection c, String maruCodeId) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_CODE (MARU_CODE_ID, MARU_CODE_NAME, SOURCE_KIND) VALUES (?, ?, 'MDM')",
                maruCodeId, "이름-" + maruCodeId);
    }

    private static void seedVer(Connection c, String maruCodeId, String ver) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_CODE_VER (MARU_CODE_ID, VER, VER_KIND) VALUES (?, ?, 'MAJOR')",
                maruCodeId, new BigDecimal(ver));
    }

    private static long insertRecv(Connection c) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_CODE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES ('MES', 'VERSION', '2026-07-01 00:00:00', '{}')",
                Statement.RETURN_GENERATED_KEYS)) {
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

    private static void rejected(Connection c, String sql, String what, Object... params) {
        assertThrows(SQLException.class, () -> exec(c, sql, params), what + " 이(가) 거부돼야 한다: " + sql);
    }

    private static String one(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next(), sql);
            return rs.getString(1);
        }
    }

    private static Set<String> column(Connection c, String sql) throws SQLException {
        Set<String> values = new LinkedHashSet<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            while (rs.next()) {
                values.add(rs.getString(1));
            }
        }
        return values;
    }

    private static String tableSql(Connection c, String table) throws SQLException {
        return one(c, "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'");
    }

    /** 칼럼 이름 → {type, notnull, dflt_value, pk}(PRAGMA table_info). */
    private static Map<String, Map<String, Object>> tableInfo(Connection c, String table) throws SQLException {
        Map<String, Map<String, Object>> info = new java.util.LinkedHashMap<>();
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery("PRAGMA table_info(" + table + ")")) {
            while (rs.next()) {
                Map<String, Object> col = new HashMap<>();
                col.put("type", rs.getString("type"));
                col.put("notnull", rs.getInt("notnull"));
                col.put("dflt_value", rs.getString("dflt_value"));
                col.put("pk", rs.getInt("pk"));
                info.put(rs.getString("name"), col);
            }
        }
        return info;
    }
}
