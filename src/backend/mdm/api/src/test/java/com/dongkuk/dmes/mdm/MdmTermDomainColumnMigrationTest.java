package com.dongkuk.dmes.mdm;

import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.JSON_CHECK_NAMES;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.JSON_VALUE_EXPECTED;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.JSON_VALUE_FIXTURE;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.TABLES;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.embeddingFixture;
import static com.dongkuk.dmes.mdm.MdmDictionaryExpectations.expectedColumns;
import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Types;
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
 * TSK-04-01 design.md §3.1 — V3(02 용어·도메인·컬럼 7테이블, SQLite) 실제 적용을 실측한다.
 * {@code MdmSharedContractMigrationTest} 와 같은 패턴(@TempDir + local 프로파일). 쓰기 단언은 메서드마다
 * 고유 값을 쓰거나(공유 @TempDir DB) 트랜잭션을 열고 rollback 으로 끝낸다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmTermDomainColumnMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    private static final AtomicInteger SEQ = new AtomicInteger();

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-term-domain-column-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void flyway_가_V3_를_success_로_적용했다() throws SQLException {
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT success FROM flyway_schema_history WHERE version = '3'")) {
            assertTrue(rs.next(), "flyway_schema_history 에 version=3 행이 없다");
            assertTrue(rs.getBoolean("success"), "V3 마이그레이션이 success=true 가 아니다");
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
            // TSK-04-02 V10(D1) — UX_TB_MDM_TERM_ABBR(유일)를 IX_TB_MDM_TERM_ABBR(비유일)로 교체했다.
            assertTrue(indexNames.containsAll(Set.of(
                    "UX_TB_MDM_TERM_NAME_SENSE", "IX_TB_MDM_TERM_ABBR", "UX_TB_MDM_COLUMN_NAME",
                    "UX_TB_MDM_COLUMN_PHYS_NAME", "IX_TB_MDM_DOMAIN_PARENT", "IX_TB_MDM_COLUMN_SYSTEM_SYS_PHYS")),
                    indexNames.toString());

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

    /**
     * {@code TB_MDM_DOMAIN.MARU_CODE_ID=NULL} 인 QTY 종류 행 INSERT 는 성공해야 한다. TSK-06-01 V9 가
     * {@code FK_TB_MDM_DOMAIN_CODE} 를 건 뒤에도 NULL 은 FK 검사 대상이 아니라 그대로 통과한다(FK 강제 단언은
     * {@code MdmMasterCodeMigrationTest} 가 한다). V3 시점의 "FK 부재" 이름은 더 이상 사실이 아니라 이름·주석만 고쳤다.
     */
    @Test
    void MARU_CODE_ID_NULL_INSERT_는_FK_추가_뒤에도_성공한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long domainId = insertQtyDomain(c, "길이-" + SEQ.incrementAndGet(), null);
                assertTrue(domainId > 0);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    /** 대조군 — TB_MDM_SYSTEM(V2 소유) 을 가리키는 기존 FK 는 여전히 강제된다(F1 과 대조). */
    @Test
    void 기존_TB_MDM_SYSTEM_FK_는_여전히_강제된다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long domainId = insertQtyDomain(c, "무게-" + SEQ.incrementAndGet(), null);
                long columnId = insertColumn(c, domainId);

                assertThrows(SQLException.class, () -> insertColumnSystem(c, columnId, "NOPE", "PHYS"),
                        "존재하지 않는 SYSTEM_CODE 는 FK_TB_MDM_COLUMN_SYSTEM_SYSTEM 이 거부해야 한다");
                insertColumnSystem(c, columnId, "ERP", "PHYS"); // 정상 코드는 통과해야 한다

                assertThrows(SQLException.class,
                        () -> insertDictSystem(c, "NOPE"),
                        "존재하지 않는 SYSTEM_CODE 는 FK_TB_MDM_DICT_SYSTEM_SYSTEM 이 거부해야 한다");
                insertDictSystem(c, "MES");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void JSON_CHECK_8칼럼이_부정형을_거부하고_NULL_은_통과한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                // TERM: SYNONYMS·ALIASES·SYSTEMS
                assertThrows(SQLException.class, () -> insertTerm(c, "용어JSON1-" + SEQ.incrementAndGet(),
                        "{bad json", null, null));
                insertTerm(c, "용어JSON2-" + SEQ.incrementAndGet(), null, null, null); // NULL 통과

                // DOMAIN: STD_AST·BIZ_AST·EXAMPLES·TEST_CASES
                assertThrows(SQLException.class,
                        () -> insertDomainWithAst(c, "도JSON1-" + SEQ.incrementAndGet(), "not-json"));
                long okDomain = insertQtyDomain(c, "도JSON2-" + SEQ.incrementAndGet(), null);
                assertTrue(okDomain > 0);

                // COLUMN: TERM_IDS
                long domainId = insertQtyDomain(c, "도JSON3-" + SEQ.incrementAndGet(), null);
                assertThrows(SQLException.class, () -> insertColumnWithTermIds(c, domainId, "not-json"));
                insertColumnWithTermIds(c, domainId, null);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }

        // 8칼럼 정확히 — 늘리거나 줄이지 않는다(불변 규칙 12). 알려진 8개 이름만 찾지 않고 "*_JSON CHECK" 패턴
        // 전부를 정규식으로 세어, 9번째(미등재) CHECK 가 추가되는 변이도 잡는다.
        java.util.regex.Pattern jsonCkPattern = java.util.regex.Pattern.compile("CONSTRAINT (\\w+_JSON) CHECK");
        Set<String> ckNames = new LinkedHashSet<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            for (String table : Set.of("TB_MDM_TERM", "TB_MDM_DOMAIN", "TB_MDM_COLUMN")) {
                String tableSql;
                try (ResultSet rs = s.executeQuery(
                        "SELECT sql FROM sqlite_master WHERE type='table' AND name='" + table + "'")) {
                    rs.next();
                    tableSql = rs.getString(1);
                }
                java.util.regex.Matcher m = jsonCkPattern.matcher(tableSql);
                while (m.find()) {
                    ckNames.add(m.group(1));
                }
            }
        }
        assertEquals(8, ckNames.size(), "JSON CHECK 개수: " + ckNames);
        assertEquals(JSON_CHECK_NAMES, ckNames);
    }

    /**
     * TSK-04-02 V10(D1) — 요구사항이 강제하는 교정. UX_TB_MDM_TERM_ABBR(유일)가 IX_TB_MDM_TERM_ABBR
     * (비유일)로 바뀌어, 이제 동일 비NULL ENG_ABBR 도 다건 허용된다(경고는 애플리케이션 레벨에서 처리,
     * TermMngService.warnings). NULL 다건 허용은 그대로 유지된다.
     */
    @Test
    void IX_TB_MDM_TERM_ABBR_는_NULL_다건_허용_동일_비NULL_도_다건_허용한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                insertTerm(c, "약어1-" + SEQ.incrementAndGet(), null, null, null); // ENG_ABBR NULL #1
                insertTerm(c, "약어2-" + SEQ.incrementAndGet(), null, null, null); // ENG_ABBR NULL #2 — 둘 다 통과해야 한다

                String abbr = "ABBR" + SEQ.incrementAndGet();
                insertTermWithAbbr(c, "약어3-" + SEQ.incrementAndGet(), abbr);
                // V10 이후 — 같은 비NULL ENG_ABBR 재삽입도 통과해야 한다(유일 인덱스가 아니므로).
                insertTermWithAbbr(c, "약어4-" + SEQ.incrementAndGet(), abbr);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void UX_TB_MDM_COLUMN_NAME_PHYS_NAME_은_중복만_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long domainId = insertQtyDomain(c, "컬유일-" + SEQ.incrementAndGet(), null);
                String columnName = "컬럼" + SEQ.incrementAndGet();
                String physName = "PHYS" + SEQ.incrementAndGet();
                insertColumnNamed(c, domainId, columnName, physName);
                assertThrows(SQLException.class,
                        () -> insertColumnNamed(c, domainId, columnName, "OTHER" + SEQ.incrementAndGet()),
                        "COLUMN_NAME 중복은 UX_TB_MDM_COLUMN_NAME 이 거부해야 한다");
                assertThrows(SQLException.class,
                        () -> insertColumnNamed(c, domainId, "OTHER" + SEQ.incrementAndGet(), physName),
                        "PHYS_NAME 중복은 UX_TB_MDM_COLUMN_PHYS_NAME 이 거부해야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void TERM_DOMAIN_COLUMN_의_AUTOINCREMENT_는_삭제된_최댓값을_재사용하지_않는다() throws SQLException {
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            long term1 = insertTerm(c, "채번1-" + SEQ.incrementAndGet(), null, null, null);
            long term2 = insertTerm(c, "채번2-" + SEQ.incrementAndGet(), null, null, null);
            assertTrue(term2 > term1);
            s.execute("DELETE FROM TB_MDM_TERM WHERE TERM_ID = " + term2);
            long term3 = insertTerm(c, "채번3-" + SEQ.incrementAndGet(), null, null, null);
            assertTrue(term3 > term2, "삭제된 최댓값(term2)을 재사용하면 안 된다: term3=" + term3 + ", term2=" + term2);

            long domain1 = insertQtyDomain(c, "채번도1-" + SEQ.incrementAndGet(), null);
            long domain2 = insertQtyDomain(c, "채번도2-" + SEQ.incrementAndGet(), null);
            s.execute("DELETE FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = " + domain2);
            long domain3 = insertQtyDomain(c, "채번도3-" + SEQ.incrementAndGet(), null);
            assertTrue(domain3 > domain2);

            long domainForColumn = insertQtyDomain(c, "채번컬도-" + SEQ.incrementAndGet(), null);
            long col1 = insertColumn(c, domainForColumn);
            long col2 = insertColumn(c, domainForColumn);
            s.execute("DELETE FROM TB_MDM_COLUMN WHERE COLUMN_ID = " + col2);
            long col3 = insertColumn(c, domainForColumn);
            assertTrue(col3 > col2);
        }
    }

    /**
     * #5 — json_extract(COL, '$.type') 이 경로 문법으로 값을 뽑는다. {@code MdmDictionaryExpectations}의
     * 같은 픽스처/기대값을 {@code MdmTermDomainColumnMssqlMigrationTest.JSON_VALUE_가_경로_로_값을_추출한다()}
     * 와 공유해, 두 방언에 실제로 같은 입력을 넣고 같은 경로로 값을 뽑아 비교한다(§3.2-③).
     */
    @Test
    void json_extract_이_경로_로_값을_추출한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                long domainId = insertDomainWithAst(c, "JSON값추출-" + SEQ.incrementAndGet(), JSON_VALUE_FIXTURE);
                try (PreparedStatement select = c.prepareStatement(
                        "SELECT json_extract(STD_AST, '$.type') FROM TB_MDM_DOMAIN WHERE DOMAIN_ID = ?")) {
                    select.setLong(1, domainId);
                    try (ResultSet rs = select.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(JSON_VALUE_EXPECTED, rs.getString(1));
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void EMBEDDING_칼럼이_NULL_허용이고_4096바이트_BLOB_이_바이트_단위로_왕복한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                // NULL 허용
                long noEmbedding = insertTerm(c, "임베딩없음-" + SEQ.incrementAndGet(), null, null, null);
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT EMBEDDING, EMBEDDING_MODEL FROM TB_MDM_TERM WHERE TERM_ID = ?")) {
                    ps.setLong(1, noEmbedding);
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertEquals(null, rs.getBytes("EMBEDDING"));
                        assertEquals(null, rs.getString("EMBEDDING_MODEL"));
                    }
                }

                // 4,096바이트 왕복
                byte[] fixture = embeddingFixture();
                assertEquals(4096, fixture.length);
                String termName = "임베딩있음-" + SEQ.incrementAndGet();
                long termId;
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, EMBEDDING, EMBEDDING_MODEL) "
                                + "VALUES (?, 1, 'def', ?, ?)",
                        Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, termName);
                    ps.setBytes(2, fixture);
                    ps.setString(3, "KURE-v1/test");
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        keys.next();
                        termId = keys.getLong(1);
                    }
                }
                try (PreparedStatement ps = c.prepareStatement(
                        "SELECT EMBEDDING, EMBEDDING_MODEL FROM TB_MDM_TERM WHERE TERM_ID = ?")) {
                    ps.setLong(1, termId);
                    try (ResultSet rs = ps.executeQuery()) {
                        assertTrue(rs.next());
                        assertArrayEquals(fixture, rs.getBytes("EMBEDDING"));
                        assertEquals("KURE-v1/test", rs.getString("EMBEDDING_MODEL"));
                    }
                }
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void CK_TB_MDM_DOMAIN_CODE_FLAG_COLUMN_REQUIRED_가_위반을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                // CK_TB_MDM_DOMAIN_CODE — DOMAIN_KIND='CODE' 이면서 STD_RULE 이 있으면 거부.
                assertThrows(SQLException.class, () -> insertDomainKindWithRule(
                        c, "코드위반-" + SEQ.incrementAndGet(), "CODE", "rule-exists"));
                // 통과 — CODE 이면서 STD_RULE NULL.
                insertDomainKindWithRule(c, "코드정상-" + SEQ.incrementAndGet(), "CODE", null);

                // CK_TB_MDM_DOMAIN_FLAG — FLAG 이면서 PARENT_DOMAIN_ID·STD_RULE 모두 없으면 거부.
                assertThrows(SQLException.class, () -> insertDomainKindWithRule(
                        c, "플래그위반-" + SEQ.incrementAndGet(), "FLAG", null));
                // 통과 — FLAG 이면서 STD_RULE 존재.
                insertDomainKindWithRule(c, "플래그정상-" + SEQ.incrementAndGet(), "FLAG", "rule");

                // CK_TB_MDM_COLUMN_REQUIRED — REQUIRED 는 0/1 만 허용.
                long domainId = insertQtyDomain(c, "필수위반도-" + SEQ.incrementAndGet(), null);
                assertThrows(SQLException.class, () -> insertColumnWithRequired(c, domainId, 2));
                insertColumnWithRequired(c, domainId, 1);
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    // ── 삽입 헬퍼 ──

    private static long insertQtyDomain(Connection c, String stdName, String maruCodeId) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, MARU_CODE_ID) "
                        + "VALUES (?, ?, 'QTY', 'NUMBER', ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, "도메인-" + stdName);
            ps.setString(2, stdName);
            if (maruCodeId == null) {
                ps.setNull(3, Types.VARCHAR);
            } else {
                ps.setString(3, maruCodeId);
            }
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static long insertDomainWithAst(Connection c, String stdName, String stdAst) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, DOMAIN_KIND, DATA_TYPE, STD_AST) "
                        + "VALUES (?, ?, 'QTY', 'NUMBER', ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, "도메인-" + stdName);
            ps.setString(2, stdName);
            ps.setString(3, stdAst);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static void insertDomainKindWithRule(Connection c, String stdName, String kind, String stdRule)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DOMAIN (DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, STD_RULE) "
                        + "VALUES (?, ?, NULL, ?, 'STRING', ?)")) {
            ps.setString(1, "도메인-" + stdName);
            ps.setString(2, stdName);
            ps.setString(3, kind);
            if (stdRule == null) {
                ps.setNull(4, Types.VARCHAR);
            } else {
                ps.setString(4, stdRule);
            }
            ps.executeUpdate();
        }
    }

    private static long insertColumn(Connection c, long domainId) throws SQLException {
        return insertColumnNamed(c, domainId, "컬럼" + SEQ.incrementAndGet(), "PHYS" + SEQ.incrementAndGet());
    }

    private static long insertColumnNamed(Connection c, long domainId, String columnName, String physName)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, columnName);
            ps.setString(2, physName);
            ps.setLong(3, domainId);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static void insertColumnWithTermIds(Connection c, long domainId, String termIds) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, TERM_IDS) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, "컬럼" + SEQ.incrementAndGet());
            ps.setString(2, "PHYS" + SEQ.incrementAndGet());
            ps.setLong(3, domainId);
            if (termIds == null) {
                ps.setNull(4, Types.VARCHAR);
            } else {
                ps.setString(4, termIds);
            }
            ps.executeUpdate();
        }
    }

    private static void insertColumnWithRequired(Connection c, long domainId, int required) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED) VALUES (?, ?, ?, ?)")) {
            ps.setString(1, "컬럼" + SEQ.incrementAndGet());
            ps.setString(2, "PHYS" + SEQ.incrementAndGet());
            ps.setLong(3, domainId);
            ps.setInt(4, required);
            ps.executeUpdate();
        }
    }

    private static long insertTerm(Connection c, String termName, String synonyms, String aliases, String systems)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, SYNONYMS, ALIASES, SYSTEMS) "
                        + "VALUES (?, 1, 'def', ?, ?, ?)",
                Statement.RETURN_GENERATED_KEYS)) {
            ps.setString(1, termName);
            setNullableString(ps, 2, synonyms);
            setNullableString(ps, 3, aliases);
            setNullableString(ps, 4, systems);
            ps.executeUpdate();
            try (ResultSet keys = ps.getGeneratedKeys()) {
                keys.next();
                return keys.getLong(1);
            }
        }
    }

    private static void insertTermWithAbbr(Connection c, String termName, String abbr) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_TERM (TERM_NAME, SENSE_NO, DEFINITION, ENG_ABBR) VALUES (?, 1, 'def', ?)")) {
            ps.setString(1, termName);
            ps.setString(2, abbr);
            ps.executeUpdate();
        }
    }

    private static void insertColumnSystem(Connection c, long columnId, String systemCode, String physName)
            throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME) VALUES (?, ?, ?)")) {
            ps.setLong(1, columnId);
            ps.setString(2, systemCode);
            ps.setString(3, physName);
            ps.executeUpdate();
        }
    }

    private static void insertDictSystem(Connection c, String systemCode) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(
                "INSERT INTO TB_MDM_DICT_SYSTEM (DICT_CODE, SYSTEM_CODE) VALUES ('DOMAIN', ?)")) {
            ps.setString(1, systemCode);
            ps.executeUpdate();
        }
    }

    private static void setNullableString(PreparedStatement ps, int index, String value) throws SQLException {
        if (value == null) {
            ps.setNull(index, Types.VARCHAR);
        } else {
            ps.setString(index, value);
        }
    }
}
