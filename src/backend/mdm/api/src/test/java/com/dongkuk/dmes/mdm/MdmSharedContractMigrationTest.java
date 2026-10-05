package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.INSERT_SYSTEM;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SEED_AUDIT_USER;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SEED_NAMES;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.SELF_CODE;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.UPPER_SNAKE;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.expectedColumns;
import static com.dongkuk.dmes.mdm.MdmSystemSeedExpectations.seededCodes;

import jakarta.persistence.EntityManagerFactory;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-01-02 design.md §3.2 T11 — local(SQLite) 프로파일로 Flyway V1·V2 를 적용해 {@code TB_MDM_SYSTEM}
 * 행·제약·명명, {@code foreign_keys}, 감사 인스펙터 미등록을 확인한다(불변 규칙 I5~I8·I18·I19).
 *
 * <p>URL 은 파라미터 없이 주입한다 — {@code foreign_keys} 가 URL 이 아니라 드라이버 속성으로 켜져
 * 있어야 한다는 것(I18)을 보이기 위해서다. 한 클래스의 메서드는 같은 {@code @TempDir} DB 를 공유하므로
 * 쓰기 단언은 모두 한 트랜잭션 안에서 하고 rollback 으로 끝낸다(design.md §3.2-3).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmSharedContractMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;

    @Autowired
    EntityManagerFactory entityManagerFactory;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-shared-contract-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @Test
    void flyway_가_V1_V2_V3_V4_V8_V9_V10_V11_V12_V13_V14_V15_V16_V17_V18_V20_V21_V22_V23_를_적용했다() throws SQLException {
        Set<String> versions = new HashSet<>();
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery("SELECT version FROM flyway_schema_history WHERE success = 1")) {
            while (rs.next()) {
                versions.add(rs.getString(1));
            }
        }
        // TSK-04-01 F12 — V3(02 용어·도메인·컬럼) 반영. TSK-05-01 — V4(03 인터페이스 레이아웃) 추가 반영.
        // TSK-08-01 — V8(06 업무기준, 팀장 배정 번호) 추가 반영.
        // TSK-06-01 — V9(04 마스터코드, D1. 당초 V6, 2026-09-24 팀장 정정으로 머지 뒤 최대 버전+1 재채번) 추가 반영.
        // TSK-07-01 — V10(05 마스터데이터. 당초 팀장 배정 V7, 2026-09-24 팀장 정정으로 머지 뒤 최대 버전+1 재채번) 추가 반영.
        // TSK-04-02 — V11(약어 인덱스 비유일화, D1. 당초 V4→V5→V10, 2026-09-24 팀장 정정으로 머지 뒤 최대 버전+1 재채번) 추가 반영.
        // TSK-05-03 — V12(레이아웃 스냅샷 버전 이력, D2. push 직전 origin/dev 최대 버전+1) 추가 반영.
        // D-103 — V13(TB_MDM_RULE_VAR.AXIS 제거, 피벗 표현 대체) 추가 반영. V14(RULE_SET.FLOW_JSON, 룰 세트 흐름도) 추가 반영. V15(룰 세트 테스트 케이스, 흐름도 3단계) 추가 반영.
        // D-141 — V16(TB_MDM_COLUMN.DOMAIN_ID NOT NULL 해제) 추가 반영.
        // D-144 — V17(룰 버전 NUMERIC(7,3) + VER_KIND) 추가 반영.
        // D-144 2단계 — V18(룰 세트 버전 표) 추가 반영.
        // MDM 메타 캐시 — V20(TB_MDM_META_REV 변경 기록 표) 추가 반영(dev 의 V18 뒤. 채번 당시 레이아웃 버전 3단계가 V19 를 잡고 있어 V20 — 3단계는 뒤에 V21 로 옮겼다).
        // D-144 3단계 — V21(레이아웃 버전) 추가 반영(당초 V19, 메타 캐시 V20 이 dev 에 먼저 들어가 outOfOrder=false 로 V21 로 옮김).
        // D-151 — V22(레이아웃 항목 확정 고정값 DATA_TYPE·UNIT_CODE·SCALE) 추가 반영.
        // D-135 하위 세트 호출 — V23(세트 버전 행 CALL_SET_IDS) 추가 반영.
        // 모두 완화가 아니라 새 버전 반영이다.
        assertEquals(Set.of("1", "2", "3", "4", "8", "9", "10", "11", "12", "13", "14", "15", "16", "17", "18", "20", "21", "22", "23"), versions);
    }

    @Test
    void 시스템_시드는_6행이고_자기_행은_MDM_하나다() throws SQLException {
        Map<String, String> names = new HashMap<>();
        Set<String> selfRows = new HashSet<>();
        try (Connection c = dataSource.getConnection();
             Statement s = c.createStatement();
             ResultSet rs = s.executeQuery(
                     "SELECT SYSTEM_CODE, SYSTEM_NAME, SELF_YN, VER, C_USR_ID, C_AT FROM TB_MDM_SYSTEM")) {
            while (rs.next()) {
                String code = rs.getString("SYSTEM_CODE");
                names.put(code, rs.getString("SYSTEM_NAME"));
                if ("Y".equals(rs.getString("SELF_YN"))) {
                    selfRows.add(code);
                }
                assertEquals(0L, rs.getLong("VER"), code + " VER");
                assertEquals(SEED_AUDIT_USER, rs.getString("C_USR_ID"), code + " C_USR_ID");
                assertNull(rs.getObject("C_AT"), code + " C_AT 는 NULL(D10)");
            }
        }
        assertEquals(6, names.size());
        assertEquals(seededCodes(), names.keySet());
        assertEquals(SEED_NAMES, names);
        assertEquals(Set.of(SELF_CODE), selfRows);
    }

    @Test
    void 자기_행_유일과_Y_N_검사와_대소문자_구분을_DB_가_강제한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                assertThrows(SQLException.class, () -> insertSystem(c, "NEWSELF", "새 자기 행", "Y"),
                        "두 번째 SELF_YN='Y' 는 UX_TB_MDM_SYSTEM_SELF_YN 이 막아야 한다");
                assertThrows(SQLException.class, () -> insertSystem(c, "LOWER", "소문자", "y"),
                        "소문자 'y' 는 CK_TB_MDM_SYSTEM_SELF_YN 이 막아야 한다");
                assertThrows(SQLException.class, () -> insertSystem(c, "BLANK", "빈 값", "X"),
                        "Y/N 밖의 값은 CK 가 막아야 한다");

                insertSystem(c, "erp", "소문자 코드", "N");
                assertEquals(1, count(c, "SELECT COUNT(*) FROM TB_MDM_SYSTEM WHERE SYSTEM_CODE = 'ERP'"));
                assertEquals(1, count(c, "SELECT COUNT(*) FROM TB_MDM_SYSTEM WHERE SYSTEM_CODE = 'erp'"));
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void 테이블_칼럼_제약_명명이_규칙표를_따른다() throws SQLException {
        Set<String> columns = new LinkedHashSet<>();
        Map<String, String> types = new HashMap<>();
        String tableSql;
        Set<String> indexes = new HashSet<>();
        try (Connection c = dataSource.getConnection(); Statement s = c.createStatement()) {
            try (ResultSet rs = s.executeQuery("PRAGMA table_info(TB_MDM_SYSTEM)")) {
                while (rs.next()) {
                    columns.add(rs.getString("name"));
                    types.put(rs.getString("name"), rs.getString("type"));
                }
            }
            try (ResultSet rs = s.executeQuery(
                    "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'TB_MDM_SYSTEM'")) {
                assertTrue(rs.next(), "TB_MDM_SYSTEM 이 없다");
                tableSql = rs.getString(1);
            }
            try (ResultSet rs = s.executeQuery(
                    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'TB_MDM_SYSTEM'")) {
                while (rs.next()) {
                    indexes.add(rs.getString(1));
                }
            }
        }

        assertTrue("TB_MDM_SYSTEM".matches("^TB_MDM_[A-Z][A-Z0-9_]*$"));
        assertEquals(expectedColumns(), columns);
        for (String column : columns) {
            assertTrue(column.matches(UPPER_SNAKE), column);
        }
        assertEquals("TIMESTAMP", types.get("C_AT"));
        assertEquals("TIMESTAMP", types.get("U_AT"));
        assertEquals("BIGINT", types.get("VER"));
        assertTrue(tableSql.contains("CONSTRAINT PK_TB_MDM_SYSTEM "), tableSql);
        assertTrue(tableSql.contains("CONSTRAINT CK_TB_MDM_SYSTEM_SELF_YN "), tableSql);
        assertTrue(indexes.contains("UX_TB_MDM_SYSTEM_SELF_YN"), indexes.toString());
    }

    @Test
    void foreign_keys_가_켜져_있고_자식_FK_위반을_거부한다() throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            assertEquals(1, count(c, "PRAGMA foreign_keys"), "규칙표 #14 — SQLite foreign_keys 가 꺼져 있다");
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                s.execute("CREATE TABLE TMP_FK_PARENT (ID VARCHAR(10) NOT NULL PRIMARY KEY)");
                s.execute("CREATE TABLE TMP_FK_CHILD (ID VARCHAR(10) NOT NULL PRIMARY KEY, "
                        + "PARENT_ID VARCHAR(10) NOT NULL REFERENCES TMP_FK_PARENT (ID))");
                s.execute("INSERT INTO TMP_FK_PARENT (ID) VALUES ('P1')");
                s.execute("INSERT INTO TMP_FK_CHILD (ID, PARENT_ID) VALUES ('C1', 'P1')");
                assertThrows(SQLException.class,
                        () -> s.execute("INSERT INTO TMP_FK_CHILD (ID, PARENT_ID) VALUES ('C2', 'NO_PARENT')"),
                        "없는 부모를 가리키는 INSERT 는 거부돼야 한다");
            } finally {
                c.rollback();
                c.setAutoCommit(true);
            }
        }
    }

    @Test
    void 감사_statement_inspector_를_mdm_에_등록하지_않는다() {
        Map<String, Object> properties = entityManagerFactory.getProperties();
        assertFalse(properties.containsKey("hibernate.session_factory.statement_inspector"),
                "ADR-0001 D2 — McmAuditStatementInspector 는 mdm 에 등록하지 않는다: "
                        + properties.get("hibernate.session_factory.statement_inspector"));
    }

    private static void insertSystem(Connection c, String code, String name, String selfYn) throws SQLException {
        try (var ps = c.prepareStatement(INSERT_SYSTEM)) {
            ps.setString(1, code);
            ps.setString(2, name);
            ps.setString(3, selfYn);
            ps.executeUpdate();
        }
    }

    private static long count(Connection c, String sql) throws SQLException {
        try (Statement s = c.createStatement(); ResultSet rs = s.executeQuery(sql)) {
            assertTrue(rs.next());
            return rs.getLong(1);
        }
    }
}
