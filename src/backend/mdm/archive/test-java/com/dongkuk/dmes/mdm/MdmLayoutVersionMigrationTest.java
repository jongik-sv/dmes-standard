package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.contract.version.VersionKind;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import com.dongkuk.dmes.mdm.repository.MdmLayoutVerRepository;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-03 design.md §3.4 — {@code TB_MDM_LAYOUT_VER}(SQLite): 칼럼·복합 PK·JSON 검사·전환 방식 검사·FK·엔티티 왕복(불변 I24).
 * 쓰기 단언은 한 트랜잭션 안에서 하고 rollback 한다(같은 {@code @TempDir} DB 를 공유한다).
 *
 * <p>D-144 3단계 — 표 모양은 V21 가 다시 만든 버전 표다: PK (LAYOUT_ID, VER NUMERIC(7,3)), 상태·적용 구간·종류·이행 스냅샷 CHECK,
 * EAI FK, 감사 카운터 AUD_VER(D-034). SNAPSHOT_JSON 은 이행 스냅샷(LEGACY_SNAPSHOT_YN='Y')에만 있어 NULL 을 받는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmLayoutVersionMigrationTest {

    @TempDir
    static Path tempDir;

    @Autowired
    DataSource dataSource;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MdmLayoutVerRepository repository;

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {
        Path db = tempDir.resolve("mdm-layout-version.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + db);
    }

    private static final String INSERT = "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, OWN_LENGTH, "
            + "SWITCH_MODE, SNAPSHOT_JSON, AUD_VER) VALUES (?, ?, 'MAJOR', 'DRAFT', 'kim', 57, ?, ?, 0)";

    private long layout(Statement s) throws SQLException {
        s.executeUpdate("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, VER) VALUES ('MESSAGE', '버전 이관 시험', 0)");
        try (ResultSet rs = s.executeQuery("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT")) {
            rs.next();
            return rs.getLong(1);
        }
    }

    /** 한 트랜잭션에서 insert 를 시도하고 늘 rollback 한다. */
    private void inTx(SqlWork work) throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try (Statement s = c.createStatement()) {
                work.run(c, s);
            } finally {
                c.rollback();
            }
        }
    }

    interface SqlWork {
        void run(Connection c, Statement s) throws SQLException;
    }

    private static void insert(Connection c, long layoutId, long version, String mode, String json) throws SQLException {
        try (var ps = c.prepareStatement(INSERT)) {
            ps.setLong(1, layoutId);
            ps.setLong(2, version);
            ps.setString(3, mode);
            ps.setString(4, json);
            ps.executeUpdate();
        }
    }

    @Test
    void V21_TB_MDM_LAYOUT_VER_가_있고_PK_는_레이아웃과_업무_버전이다() {
        List<Map<String, Object>> cols = jdbc.queryForList("PRAGMA table_info(TB_MDM_LAYOUT_VER)");
        Map<String, Integer> pk = new LinkedHashMap<>();
        List<String> names = new ArrayList<>();
        for (Map<String, Object> c : cols) {
            names.add((String) c.get("name"));
            int p = ((Number) c.get("pk")).intValue();
            if (p > 0) {
                pk.put((String) c.get("name"), p);
            }
        }
        assertEquals(List.of("LAYOUT_ID", "VER", "VER_KIND", "STATUS", "BASE_VER", "OWNER_ID", "APPLY_FROM", "APPLY_TO",
                "REQUESTED_BY", "REQUESTED_AT", "RELEASED_AT", "ROW_VERSION", "EAI_CODE", "OWN_LENGTH",
                "SWITCH_MODE", "CHANGE_KINDS", "CHANGE_SUMMARY", "SNAPSHOT_JSON", "LEGACY_SNAPSHOT_YN",
                "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "AUD_VER"), names);
        assertEquals(Map.of("LAYOUT_ID", 1, "VER", 2), pk);
        assertTrue(!names.contains("VERSION") && !names.contains("LAYOUT_VERSION") && !names.contains("TOTAL_LENGTH"),
                "예약어 칼럼·옛 버전 번호·총 길이를 두지 않는다");
        List<String> fkTargets = new ArrayList<>();
        for (Map<String, Object> fk : jdbc.queryForList("PRAGMA foreign_key_list(TB_MDM_LAYOUT_VER)")) {
            fkTargets.add(fk.get("table") + "." + fk.get("from"));
        }
        fkTargets.sort(null);
        assertEquals(List.of("TB_MDM_EAI.EAI_CODE", "TB_MDM_LAYOUT.LAYOUT_ID"), fkTargets);
        String ddl = jdbc.queryForObject("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'TB_MDM_LAYOUT_VER'", String.class);
        assertTrue(ddl.contains("VER NUMERIC(7,3) NOT NULL"), ddl);
    }

    @Test
    void 확정_상태는_적용_구간이_있어야_한다() throws SQLException {
        inTx((c, s) -> {
            long id = layout(s);
            s.executeUpdate("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, STATUS, APPLY_FROM, APPLY_TO) "
                    + "VALUES (" + id + ", 1, 'RELEASED', '2026-10-01 00:00:00', '9999-12-31 00:00:00')");
            SQLException e = assertThrows(SQLException.class, () -> s.executeUpdate(
                    "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, STATUS) VALUES (" + id + ", 2, 'RELEASED')"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_APPLY"), e.getMessage());
        });
    }

    @Test
    void 버전_종류는_MAJOR_MINOR_만_받는다() throws SQLException {
        inTx((c, s) -> {
            long id = layout(s);
            s.executeUpdate("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND) VALUES (" + id + ", 1.001, 'MINOR')");
            SQLException e = assertThrows(SQLException.class, () -> s.executeUpdate(
                    "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND) VALUES (" + id + ", 2, 'PATCH')"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_KIND"), e.getMessage());
        });
    }

    @Test
    void 이행_스냅샷_표시는_스냅샷이_있어야_한다() throws SQLException {
        inTx((c, s) -> {
            long id = layout(s);
            s.executeUpdate("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, LEGACY_SNAPSHOT_YN, SNAPSHOT_JSON) "
                    + "VALUES (" + id + ", 1, 'Y', '{}')");
            SQLException e = assertThrows(SQLException.class, () -> s.executeUpdate(
                    "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, LEGACY_SNAPSHOT_YN) VALUES (" + id + ", 2, 'Y')"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_LEGACY"), e.getMessage());
            SQLException bad = assertThrows(SQLException.class, () -> s.executeUpdate(
                    "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, LEGACY_SNAPSHOT_YN) VALUES (" + id + ", 3, 'X')"));
            assertTrue(bad.getMessage().contains("CK_TB_MDM_LAYOUT_VER_LEGACY"), bad.getMessage());
        });
    }

    @Test
    void SNAPSHOT_JSON_은_JSON_이_아니면_거부한다() throws SQLException {
        inTx((c, s) -> {
            long id = layout(s);
            insert(c, id, 1, null, "{\"layoutId\":1}");
            SQLException e = assertThrows(SQLException.class, () -> insert(c, id, 2, null, "not json"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON"), e.getMessage());
        });
    }

    @Test
    void SWITCH_MODE_는_순차_동시_NULL_만_받는다() throws SQLException {
        inTx((c, s) -> {
            long id = layout(s);
            insert(c, id, 1, null, "{}");
            insert(c, id, 2, "SEQUENTIAL", "{}");
            insert(c, id, 3, "SIMULTANEOUS", "{}");
            SQLException e = assertThrows(SQLException.class, () -> insert(c, id, 4, "X", "{}"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_SWITCH"), e.getMessage());
        });
    }

    @Test
    void 없는_레이아웃을_가리키면_FK_로_거부한다() throws SQLException {
        inTx((c, s) -> {
            SQLException e = assertThrows(SQLException.class, () -> insert(c, 987_654L, 1, null, "{}"));
            assertTrue(e.getMessage().contains("FOREIGN KEY"), e.getMessage());
        });
    }

    @Test
    void 엔티티로_저장하고_읽으면_같다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, VER) VALUES ('MESSAGE', '엔티티 왕복', 0)");
        Long id = jdbc.queryForObject("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT", Long.class);
        MdmLayoutVer v = new MdmLayoutVer(id, new BigDecimal("1.000"), VersionKind.MAJOR, "kim");
        v.setOwnLength(187);
        repository.saveAndFlush(v);
        MdmLayoutVer got = repository.findById(new MdmLayoutVerId(id, new BigDecimal("1.000"))).orElseThrow();
        assertEquals(0, new BigDecimal("1.000").compareTo(got.getVer()));
        assertEquals(VersionKind.MAJOR, got.getVerKind());
        assertEquals("DRAFT", got.getStatus());
        assertEquals("kim", got.getOwnerId());
        assertEquals(187, got.getOwnLength());
        assertEquals(0L, got.getRowVersion());
        assertEquals(false, got.isLegacySnapshot());
        assertEquals(0L, got.getVersion(), "감사 VER(AUD_VER) 0");
        assertNotNull(jdbc.queryForObject("SELECT C_AT FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", Object.class, id));
    }
}
