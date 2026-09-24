package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.AUD_VER_TABLES;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.CONSTRAINTS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.JSON_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.NULLABLE_JSON_COLUMNS;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.UNIQUE_INDEXES;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmBusinessRuleExpectations.jsonCheckName;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Pattern;
import javax.sql.DataSource;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-01 design.md §3.1 — V8(06 업무기준 8테이블, SQLite) 실제 적용과 제약 동작을 실측한다.
 * {@code MdmInterfaceLayoutMigrationTest} 와 같은 패턴(@TempDir + local 프로파일). 쓰기 단언은 트랜잭션을 열고
 * rollback 으로 끝낸다. CHECK 거부는 SQLite 오류 문구에 담긴 제약 이름으로 어느 CHECK 가 막았는지까지 확인한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmBusinessRuleMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    @Autowired
    ApplicationContext context;

    private static final AtomicInteger SEQ = new AtomicInteger();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-business-rule-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    // ── §3.1-1~3: 적용·구조 ──

    @Test
    void flyway_가_V8_을_success_로_적용했다() throws SQLException {
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT success FROM flyway_schema_history WHERE version = '8'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=8 행이 없다");
            assertTrue(rs.getBoolean("success"), "V8 마이그레이션이 success=true 가 아니다");
        }
    }

    @Test
    void _8테이블_전부_생성되고_칼럼_목록이_순서까지_기대값과_같다() throws SQLException {
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
    void 제약_이름이_모두_있고_감사_카운터와_ROW_VERSION_은_BIGINT_다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : TABLES) {
                String sql = tableSql(s, table);
                for (String name : CONSTRAINTS.get(table)) {
                    assertTrue(sql.contains("CONSTRAINT " + name + " "), table + " 에 " + name + " 가 없다: " + sql);
                }
                String counter = AUD_VER_TABLES.contains(table) ? "AUD_VER" : "VER";
                assertTrue(Pattern.compile("(?m)^\\s*" + counter + " BIGINT\\s*,").matcher(sql).find(),
                        table + " 의 감사 카운터 " + counter + " 가 BIGINT 가 아니다: " + sql);
                if (expectedColumns(table).contains("ROW_VERSION")) {
                    assertTrue(sql.contains("ROW_VERSION BIGINT NOT NULL DEFAULT 0"),
                            table + " 의 ROW_VERSION 이 BIGINT NOT NULL DEFAULT 0 이 아니다: " + sql);
                }
            }
            List<String> indexNames = new ArrayList<>();
            try (ResultSet rs = s.executeQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND name LIKE 'UX_TB_MDM_RULE%'")) {
                while (rs.next()) {
                    indexNames.add(rs.getString(1));
                }
            }
            assertTrue(indexNames.containsAll(UNIQUE_INDEXES.keySet()), indexNames.toString());
        }
    }

    // ── §3.1-4: CHECK 거부 ──

    @Test
    void CHECK_가_위반을_제약_이름으로_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = "R" + SEQ.incrementAndGet();
                String rule = "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, "
                        + "SOURCE_SYSTEM) VALUES (?, '이름', ?, ?, ?, ?)";
                rejected(c, "CK_TB_MDM_RULE_KIND", rule, r, "BAD", "CREATED", "MDM", null);
                rejected(c, "CK_TB_MDM_RULE_STATUS", rule, r, "DECISION", "BAD", "MDM", null);
                rejected(c, "CK_TB_MDM_RULE_SRC_KIND", rule, r, "DECISION", "CREATED", "BAD", null);
                rejected(c, "CK_TB_MDM_RULE_SRC_SYS", rule, r, "DECISION", "CREATED", "MDM", "ERP");
                rejected(c, "CK_TB_MDM_RULE_SRC_SYS", rule, r, "DECISION", "CREATED", "EXTERNAL", null);
                exec(c, rule, r, "DECISION", "CREATED", "EXTERNAL", "ERP");

                rejected(c, "CK_TB_MDM_RULE_SYSTEM_KIND",
                        "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE, DEPLOY_KIND) VALUES (?, 'MES', 'BAD')", r);

                String ver = "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, HIT_POLICY, APPLY_FROM, APPLY_TO, "
                        + "EMERGENCY_YN) VALUES (?, ?, ?, ?, ?, ?, ?)";
                rejected(c, "CK_TB_MDM_RULE_VER_STATUS", ver, r, 1, "BAD", null, "2026-01-01 00:00:00", "9999-12-31 00:00:00", "N");
                rejected(c, "CK_TB_MDM_RULE_VER_HIT", ver, r, 1, "DRAFT", "BAD", null, null, "N");
                rejected(c, "CK_TB_MDM_RULE_VER_APPLY", ver, r, 1, "RELEASED", "FIRST", null, "9999-12-31 00:00:00", "N");
                rejected(c, "CK_TB_MDM_RULE_VER_APPLY", ver, r, 1, "RELEASED", "FIRST", "2026-01-01 00:00:00", null, "N");
                rejected(c, "CK_TB_MDM_RULE_VER_EMERGENCY_YN", ver, r, 1, "DRAFT", null, null, null, "X");
                exec(c, ver, r, 1, "DRAFT", null, null, null, "N");

                String var = "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, AXIS, VAR_NAME, "
                        + "DATA_TYPE, COLLECT_AGG, SEQ) VALUES (?, 1, ?, ?, ?, ?, ?, ?, ?, ?)";
                rejected(c, "CK_TB_MDM_RULE_VAR_KIND", var, r, 1, "BAD", null, null, "X", null, null, 1);
                rejected(c, "CK_TB_MDM_RULE_VAR_DISP", var, r, 1, "COND", "TWO", null, "X", null, null, 1);
                rejected(c, "CK_TB_MDM_RULE_VAR_AXIS", var, r, 1, "COND", "2", "BAD", "X", null, null, 1);
                rejected(c, "CK_TB_MDM_RULE_VAR_DTYPE", var, r, 1, "COND", "2", "ROW", "X", "BAD", null, 1);
                rejected(c, "CK_TB_MDM_RULE_VAR_AGG", var, r, 1, "RESULT", "Value", null, "X", null, "AVG", 1);
                rejected(c, "CK_TB_MDM_RULE_VAR_RESULT_NAME", var, r, 1, "RESULT", "Value", null, null, null, null, 1);
                exec(c, var, r, 1, "COND", null, null, null, null, null, 1); // 조건 열은 VAR_NAME 이 NULL 이어도 된다(Expression)

                rejected(c, "CK_TB_MDM_RULE_ROW_KIND",
                        "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, 1, 1, 1, 'BAD', '{}')", r);
                rejected(c, "CK_TB_MDM_RULE_SET_STATUS",
                        "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS) VALUES (?, '세트', '[]', 'CREATED')",
                        "S" + SEQ.incrementAndGet());

                String recv = "INSERT INTO TB_MDM_RULE_RECV (MARU_RULE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY, \"RESULT\") "
                        + "VALUES (?, 'MES', ?, '2026-09-09 08:00:00', '{}', ?)";
                rejected(c, "CK_TB_MDM_RULE_RECV_REQ", recv, r, "BAD", null);
                rejected(c, "CK_TB_MDM_RULE_RECV_RESULT", recv, r, "VERSION", "BAD");
                exec(c, recv, r, "VERSION", "OK");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-5: JSON CHECK ──

    @Test
    void JSON_CHECK_는_7칼럼에서_부정형을_거부하고_NULL_허용_칼럼만_NULL_을_통과시킨다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                Map<String, String> inserts = new LinkedHashMap<>();
                inserts.put("VAR_AST", "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, VAR_AST, SEQ) "
                        + "VALUES (?, 1, ?, 'COND', 'X', ?, ?)");
                inserts.put("PRIO_LIST", "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, PRIO_LIST, SEQ) "
                        + "VALUES (?, 1, ?, 'COND', 'X', ?, ?)");
                inserts.put("GRP_COND_AST", "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, GRP_COND_AST, SEQ) "
                        + "VALUES (?, 1, ?, 'COND', 'X', ?, ?)");
                inserts.put("CELLS", "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, CELLS, SEQ, ROW_KIND) "
                        + "VALUES (?, 1, ?, ?, ?, 'NORMAL')");
                inserts.put("INPUT_JSON", "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON, CASE_NAME) "
                        + "VALUES (?, ?, ?, ?)");
                inserts.put("EXPECTED_JSON", "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON, EXPECTED_JSON) "
                        + "VALUES (?, ?, '{}', ?)");
                inserts.put("RULE_IDS", "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, DESCRIPTION) "
                        + "VALUES (?, ?, ?, ?)");

                int checked = 0;
                for (Map.Entry<String, List<String>> e : JSON_COLUMNS.entrySet()) {
                    for (String column : e.getValue()) {
                        String sql = inserts.get(column);
                        String ck = jsonCheckName(e.getKey(), column);
                        int n = SEQ.incrementAndGet();
                        Object[] bad = jsonParams(column, r, n, "{bad");
                        rejected(c, ck, sql, bad);
                        Object[] good = jsonParams(column, r, n, "{\"a\":\"1\"}");
                        exec(c, sql, good);
                        Object[] nullValue = jsonParams(column, r, SEQ.incrementAndGet(), null);
                        if (NULLABLE_JSON_COLUMNS.contains(column)) {
                            exec(c, sql, nullValue);
                        } else {
                            assertThrows(SQLException.class, () -> exec(c, sql, nullValue), column + " 은 NOT NULL 이다");
                        }
                        checked++;
                    }
                }
                assertEquals(7, checked, "JSON 칼럼은 정확히 7개다(F5)");

                // 대조군: RULE_RECV.BODY 는 요청 원문이라 JSON CHECK 가 없다(파싱 실패 요청도 남긴다, 06:1104).
                exec(c, "INSERT INTO TB_MDM_RULE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES ('MES', 'VERSION', '2026-09-09 08:00:00', '{bad')");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** JSON 칼럼별 INSERT 파라미터 — 첫째는 룰(또는 세트) ID, 그다음 고유 번호, JSON 값, 필요하면 보조 값. */
    private static Object[] jsonParams(String column, String ruleId, int n, String json) {
        return switch (column) {
            case "VAR_AST", "PRIO_LIST", "GRP_COND_AST", "CELLS" -> new Object[] {ruleId, n, json, n};
            case "INPUT_JSON" -> new Object[] {ruleId, n, json, "케이스"};
            case "EXPECTED_JSON" -> new Object[] {ruleId, n, json};
            case "RULE_IDS" -> new Object[] {"S" + n, "세트", json, "설명"};
            default -> throw new IllegalArgumentException(column);
        };
    }

    // ── §3.1-6: 부분 유일 인덱스(#20) ──

    @Test
    void 부분_유일_인덱스가_결과_열_이름과_NORMAL_행_순번만_유일하게_묶는다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                String var = "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES (?, 1, ?, ?, ?, ?)";
                exec(c, var, r, 1, "RESULT", "QLTY_GRD", 1);
                rejected(c, "UNIQUE", var, r, 2, "RESULT", "QLTY_GRD", 2);
                exec(c, var, r, 3, "COND", "COIL_THK", 1);
                exec(c, var, r, 4, "COND", "COIL_THK", 2); // 조건 열은 같은 변수를 여러 번 쓸 수 있다(06:1011)
                rejected(c, "UNIQUE", var, r, 5, "COND", "COIL_WID", 1); // (VAR_KIND, SEQ) 중복

                String row = "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, 1, ?, ?, ?, '{}')";
                exec(c, row, r, 1, 1, "NORMAL");
                rejected(c, "UNIQUE", row, r, 2, 1, "NORMAL");
                exec(c, row, r, 3, 0, "DEFAULT");
                exec(c, row, r, 4, 0, "NORMAL"); // DEFAULT 행 seq 0 과 NORMAL 행 seq 0 은 공존한다
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            Map<String, Boolean> partial = new LinkedHashMap<>();
            for (String table : List.of("TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW")) {
                try (ResultSet rs = s.executeQuery("PRAGMA index_list(" + table + ")")) {
                    while (rs.next()) {
                        if (rs.getString("name").startsWith("UX_")) {
                            partial.put(rs.getString("name"), rs.getInt("partial") == 1);
                        }
                    }
                }
            }
            assertEquals(UNIQUE_INDEXES, partial);
        }
    }

    // ── §3.1-7: FK ──

    @Test
    void FK_가_없는_부모를_거부하고_RECV_의_룰_NULL_은_통과시킨다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                String fk = "FOREIGN KEY";
                rejected(c, fk, "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND, SOURCE_SYSTEM) "
                        + "VALUES (?, '이름', 'DECISION', 'EXTERNAL', 'NOPE')", "R" + SEQ.incrementAndGet());
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE) VALUES (?, 'NOPE')", r);
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE) VALUES ('NOPE', 'MES')");
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES ('NOPE', 1)");
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, DOMAIN_ID, SEQ) "
                        + "VALUES (?, 1, 1, 'COND', 'X', 999999, 1)", r);
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) "
                        + "VALUES (?, 9, 1, 'COND', 'X', 1)", r);
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, ROW_KIND, CELLS) "
                        + "VALUES (?, 9, 1, 'NORMAL', '{}')", r);
                rejected(c, fk, "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON) VALUES ('NOPE', 1, '{}')");
                String recv = "INSERT INTO TB_MDM_RULE_RECV (MARU_RULE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES (?, ?, 'VERSION', '2026-09-09 08:00:00', '{}')";
                rejected(c, fk, recv, "NOPE", "MES");
                rejected(c, fk, recv, r, "NOPE");
                exec(c, recv, null, "MES"); // 모르는 ID 요청 로그(06:1099)

                long domainId = insertDomain(c);
                exec(c, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, DOMAIN_ID, SEQ) "
                        + "VALUES (?, 1, 1, 'COND', 'X', ?, 1)", r, domainId);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-8: CASCADE ──

    @Test
    void RULE_VER_삭제는_VAR_ROW_를_CASCADE_로_지우고_그_밖의_부모_삭제는_거부된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                insertVarsAndRows(c, r, 1);
                assertEquals(2, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = ?", r));
                assertEquals(2, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ?", r));

                rejected(c, "FOREIGN KEY", "DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", r); // RULE_VER 가 있다

                exec(c, "DELETE FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = 1", r);
                assertEquals(0, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = ?", r));
                assertEquals(0, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ?", r));

                String withCase = insertRule(c);
                exec(c, "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON) VALUES (?, 1, '{}')", withCase);
                rejected(c, "FOREIGN KEY", "DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", withCase);

                String withSystem = insertRule(c);
                exec(c, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE) VALUES (?, 'MES')", withSystem);
                rejected(c, "FOREIGN KEY", "DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", withSystem);

                String withRecv = insertRule(c);
                exec(c, "INSERT INTO TB_MDM_RULE_RECV (MARU_RULE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES (?, 'MES', 'VERSION', '2026-09-09 08:00:00', '{}')", withRecv);
                rejected(c, "FOREIGN KEY", "DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", withRecv);

                String alone = insertRule(c);
                exec(c, "DELETE FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", alone); // 자식이 없으면 지워진다
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-9: 기본값 ──

    @Test
    void 칼럼을_생략한_INSERT_는_기본값을_쓴다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                assertEquals("CREATED|0|0|0", one(c,
                        "SELECT STATUS || '|' || LAST_VAR_ID || '|' || LAST_ROW_ID || '|' || LAST_CASE_ID FROM TB_MDM_RULE "
                                + "WHERE MARU_RULE_ID = ?", r));
                assertEquals("DRAFT|0|N", one(c,
                        "SELECT STATUS || '|' || ROW_VERSION || '|' || EMERGENCY_YN FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ?", r));
                exec(c, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE) VALUES (?, 'MES')", r);
                assertEquals("DEF", one(c, "SELECT DEPLOY_KIND FROM TB_MDM_RULE_SYSTEM WHERE MARU_RULE_ID = ?", r));
                exec(c, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES (?, 1, 1, 'RESULT', 'Y', 1)", r);
                assertEquals("LIST", one(c, "SELECT COLLECT_AGG FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = ?", r));
                exec(c, "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, ROW_KIND, CELLS) VALUES (?, 1, 1, 'DEFAULT', '{}')", r);
                assertEquals("0", one(c, "SELECT SEQ FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ?", r));
                exec(c, "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, INPUT_JSON) VALUES (?, 1, '{}')", r);
                assertEquals("0", one(c, "SELECT ROW_VERSION FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = ?", r));
                String set = "S" + SEQ.incrementAndGet();
                exec(c, "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS) VALUES (?, '세트', '[]')", set);
                assertEquals("INUSE|0", one(c,
                        "SELECT STATUS || '|' || ROW_VERSION FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", set));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-10: 규칙표 06 몫 SQLite 실측(#2·#4·#5·#19) ──

    @Test
    void 규칙표_2_RECV_ID_는_지운_최댓값을_다시_쓰지_않는다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String recv = "INSERT INTO TB_MDM_RULE_RECV (SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY) "
                        + "VALUES ('MES', 'VERSION', '2026-09-09 08:00:00', '{}')";
                long first = insertReturningKey(c, recv);
                long second = insertReturningKey(c, recv);
                exec(c, "DELETE FROM TB_MDM_RULE_RECV WHERE RECV_ID = ?", second);
                long third = insertReturningKey(c, recv);
                assertTrue(second > first, first + " < " + second);
                assertTrue(third > second, "AUTOINCREMENT 는 지운 최댓값 " + second + " 을 다시 쓰지 않아야 한다: " + third);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void 규칙표_4_5_json_each_의_키_타입과_json_extract_경로가_06_셀_형식과_맞는다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String r = seedRuleAndVersion(c);
                exec(c, "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, 1, 1, 1, 'NORMAL', ?)",
                        r, "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"4\":{\"val\":\"B\"}}");
                String set = "S" + SEQ.incrementAndGet();
                exec(c, "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS) VALUES (?, '세트', ?)",
                        set, "[\"BASE_SPD_LKP\",\"SPD_EXC\",\"SPD_JOIN\"]");

                assertEquals("text,text", one(c, "SELECT group_concat(typeof(j.key)) FROM TB_MDM_RULE_ROW r, "
                        + "json_each(r.CELLS) j WHERE r.MARU_RULE_ID = ?", r));
                assertEquals("integer:0,integer:1,integer:2", one(c,
                        "SELECT group_concat(typeof(j.key) || ':' || j.key) FROM TB_MDM_RULE_SET s, json_each(s.RULE_IDS) j "
                                + "WHERE s.MARU_RULE_SET_ID = ?", set));
                assertEquals("GE", one(c, "SELECT json_extract(CELLS, '$.\"1\".op') FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ?", r));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void 규칙표_19_대소문자만_다른_룰_ID_는_서로_다른_행이다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                String rule = "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES (?, '이름', 'DECISION', 'MDM')";
                exec(c, rule, "QLTY_A");
                exec(c, rule, "qlty_a");
                assertEquals(2, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID IN ('QLTY_A', 'qlty_a')"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-11: 06 샘플(06:1293-1338) 양성 픽스처 ──

    @Test
    void _06_샘플_데이터가_모든_제약을_통과한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long gradeDomain = insertDomain(c);
                long factorDomain = insertDomain(c);
                exec(c, "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, LAST_VAR_ID, "
                        + "LAST_ROW_ID, LAST_CASE_ID) VALUES ('QLTY_GRD_JDG', '품질 등급 판정', 'DECISION', 'INUSE', 'MDM', 5, 4, 1)");
                exec(c, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE, DEPLOY_KIND) VALUES ('QLTY_GRD_JDG', 'MES', 'DEF')");
                exec(c, "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, HIT_POLICY, APPLY_FROM, APPLY_TO) "
                        + "VALUES ('QLTY_GRD_JDG', 1, 'RELEASED', 'FIRST', '2026-09-01 00:00:00', '9999-12-31 00:00:00')");
                String var = "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, DOMAIN_ID, SEQ, LABEL) "
                        + "VALUES ('QLTY_GRD_JDG', 1, ?, ?, ?, ?, ?, ?, ?)";
                exec(c, var, 1, "COND", "2", "COIL_THK", null, 1, "두께");
                exec(c, var, 2, "COND", "1", "COIL_WID", null, 2, "폭");
                exec(c, var, 3, "COND", "1", "SURF_GRD", null, 3, "표면등급");
                exec(c, var, 4, "RESULT", "Value", "QLTY_GRD", gradeDomain, 1, "판정등급");
                exec(c, var, 5, "RESULT", "Expression", "PRC_FCT", factorDomain, 2, "단가계수");
                String row = "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES ('QLTY_GRD_JDG', 1, ?, ?, ?, ?)";
                exec(c, row, 1, 1, "NORMAL", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
                        + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"expr\":\"1.05\",\"ast\":{}}}");
                exec(c, row, 2, 2, "NORMAL", "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.6\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
                        + "\"3\":{\"op\":\"IN\",\"list\":[\"B\"]},\"4\":{\"val\":\"B\"},\"5\":{\"expr\":\"1.00\",\"ast\":{}}}");
                exec(c, row, 3, 3, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"op\":\"NA\"},"
                        + "\"3\":{\"op\":\"NOT_IN\",\"list\":[\"C\"]},\"4\":{\"val\":\"B\"},\"5\":{\"expr\":\"ROUND(BASE_FCT * 0.98, 2)\",\"ast\":{}}}");
                exec(c, row, 4, 0, "DEFAULT", "{\"4\":{\"val\":\"C\"},\"5\":{\"expr\":\"0.90\",\"ast\":{}}}");
                exec(c, "INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON) "
                        + "VALUES ('QLTY_GRD_JDG', 1, '1.8mm 광폭 A급', ?, ?)",
                        "{\"COIL_THK\":1.8,\"COIL_WID\":1200,\"SURF_GRD\":\"A\",\"BASE_FCT\":1.0}",
                        "{\"QLTY_GRD\":\"A\",\"PRC_FCT\":1.05,\"hit\":1}");
                exec(c, "INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS) "
                        + "VALUES ('LS_A3', '3CCL 라인스피드', '[\"BASE_SPD_LKP\",\"SPD_EXC\",\"SPD_JOIN\"]', 'INUSE')");

                // EXTERNAL 예 — QMS 는 TB_MDM_SYSTEM 시드에 없어 APS 로 바꾼다(F28).
                exec(c, "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, STATUS, SOURCE_KIND, SOURCE_SYSTEM) "
                        + "VALUES ('EQP_CHK_JDG', '설비 점검 판정', 'DECISION', 'INUSE', 'EXTERNAL', 'MES')");
                exec(c, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE, DEPLOY_KIND) VALUES ('EQP_CHK_JDG', 'MES', 'DEF')");
                exec(c, "INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE, DEPLOY_KIND) VALUES ('EQP_CHK_JDG', 'APS', 'DEF')");
                exec(c, "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER, STATUS, OWNER_ID, HIT_POLICY, APPLY_FROM, APPLY_TO) "
                        + "VALUES ('EQP_CHK_JDG', 3, 'RELEASED', NULL, 'FIRST', '2026-09-10 00:00:00', '9999-12-31 00:00:00')");
                exec(c, "INSERT INTO TB_MDM_RULE_RECV (RECV_ID, MARU_RULE_ID, SOURCE_SYSTEM, REQ_KIND, RECEIVED_AT, BODY, \"RESULT\", VER) "
                        + "VALUES (7, 'EQP_CHK_JDG', 'MES', 'VERSION', '2026-09-09 08:00:00', '{}', 'OK', 3)");

                assertEquals(5, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'"));
                assertEquals(4, count(c, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── §3.1-12: 계약 전용 가드(런타임) ──

    /**
     * 가짜 빈이 없는 평범한 컨텍스트에서 06 확정 검사·정의 조회 구현 빈이 없다(spec 수용 기준 "실행 로직 없음", 불변 규칙 21).
     * 해제 조건(design.md §7): 08-04 가 DefinitionLookup 을, 08-05 가 확정 검사를 넣을 때 해당 줄을 지운다. 02 영역이
     * DefinitionLookup 을 빈으로 등록해도 그 줄을 지운다(F32). 발급기·DRAFT 삭제 훅 줄은 TSK-08-02 가 구현을 넣으며 지웠다.
     */
    @Test
    void 계약_전용_06_확정_검사와_정의_조회_빈이_없다() {
        assertEquals(0, context.getBeansOfType(VersionConfirmCheckSpi.class).values().stream()
                .filter(spi -> spi.target() == VersionTarget.BUSINESS_RULE).count(), "BUSINESS_RULE 확정 검사 SPI 빈(TSK-08-05 몫)");
        assertEquals(Map.of(), context.getBeansOfType(DefinitionLookup.class), "DefinitionLookup 빈(TSK-08-04 몫)");
    }

    // ── 도우미 ──

    private static String tableSql(Statement s, String table) throws SQLException {
        try (ResultSet rs = s.executeQuery("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '" + table + "'")) {
            assertTrue(rs.next(), table + " 가 없다");
            return rs.getString(1);
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

    /** 문장이 SQLException 으로 거부되고, 오류 문구에 {@code expected}(제약 이름 또는 종류)가 있어야 한다. */
    private static void rejected(Connection c, String expected, String sql, Object... params) {
        SQLException e = assertThrows(SQLException.class, () -> exec(c, sql, params), expected + " 가 거부해야 한다: " + sql);
        assertTrue(e.getMessage() != null && e.getMessage().contains(expected),
                "거부 사유가 " + expected + " 가 아니다: " + e.getMessage());
    }

    private static long insertReturningKey(Connection c, String sql) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS)) {
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static int count(Connection c, String sql, Object... params) throws SQLException {
        return Integer.parseInt(one(c, sql, params));
    }

    private static String one(Connection c, String sql, Object... params) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(sql)) {
            for (int i = 0; i < params.length; i++) {
                ps.setObject(i + 1, params[i]);
            }
            try (ResultSet rs = ps.executeQuery()) {
                assertTrue(rs.next(), sql);
                return rs.getString(1);
            }
        }
    }

    private static String insertRule(Connection c) throws SQLException {
        String r = "R" + SEQ.incrementAndGet();
        exec(c, "INSERT INTO TB_MDM_RULE (MARU_RULE_ID, MARU_RULE_NAME, RULE_KIND, SOURCE_KIND) VALUES (?, '이름', 'DECISION', 'MDM')", r);
        return r;
    }

    /** 새 룰과 그 DRAFT 버전 1 을 만들고 룰 ID 를 돌려준다. */
    private static String seedRuleAndVersion(Connection c) throws SQLException {
        String r = insertRule(c);
        exec(c, "INSERT INTO TB_MDM_RULE_VER (MARU_RULE_ID, VER) VALUES (?, 1)", r);
        return r;
    }

    private static void insertVarsAndRows(Connection c, String r, int ver) throws SQLException {
        exec(c, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES (?, ?, 1, 'COND', 'A', 1)", r, ver);
        exec(c, "INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, VAR_NAME, SEQ) VALUES (?, ?, 2, 'RESULT', 'B', 1)", r, ver);
        exec(c, "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, ?, 1, 1, 'NORMAL', '{}')", r, ver);
        exec(c, "INSERT INTO TB_MDM_RULE_ROW (MARU_RULE_ID, VER, ROW_ID, SEQ, ROW_KIND, CELLS) VALUES (?, ?, 2, 0, 'DEFAULT', '{}')", r, ver);
    }

    /** 새 TB_MDM_DOMAIN 행(FK 대상, V3)을 만들고 DOMAIN_ID 를 돌려준다. */
    private static long insertDomain(Connection c) throws SQLException {
        String name = "D" + SEQ.incrementAndGet();
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE) VALUES (?, ?, 'QTY', 'NUMBER')",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, "도메인-" + name);
            ps.setString(2, "STD-" + name);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }
}
