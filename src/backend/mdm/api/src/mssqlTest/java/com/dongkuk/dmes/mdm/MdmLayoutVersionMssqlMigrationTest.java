package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.entity.MdmLayoutVer;
import com.dongkuk.dmes.mdm.entity.MdmLayoutVerId;
import com.dongkuk.dmes.mdm.repository.MdmLayoutVerRepository;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-05-03 design.md §3.4 — V12 {@code TB_MDM_LAYOUT_VER} 를 실제 SQL Server(Testcontainers)에 적용해 SQLite
 * {@code MdmLayoutVersionMigrationTest} 와 같은 사실(칼럼·복합 PK·ISJSON·전환 방식·FK·엔티티 왕복)을 확인한다. NVARCHAR 한글 왕복과
 * BIN2 코드 칼럼을 함께 본다. docker 가 필요하다 — {@code :api:mssqlMigrationTest} 로만 돈다(testAll 비포함).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local-db")
class MdmLayoutVersionMssqlMigrationTest {

    @Autowired
    DataSource dataSource;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MdmLayoutVerRepository repository;

    @DynamicPropertySource
    static void registerMssql(DynamicPropertyRegistry registry) throws SQLException {
        String mdmUrl = MdmMssqlServer.newDatabase("layoutver");
        registry.add("spring.datasource.url", () -> mdmUrl);
        registry.add("spring.datasource.username", MdmMssqlServer::user);
        registry.add("spring.datasource.password", MdmMssqlServer::password);
    }

    private static final String INSERT = "INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SWITCH_MODE, "
            + "SNAPSHOT_JSON, VER) VALUES (?, ?, 187, ?, ?, 0)";

    private static long layout(Connection c) throws SQLException {
        try (Statement s = c.createStatement()) {
            s.executeUpdate("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, VER) VALUES ('MESSAGE', N'버전 이관 시험', 187, 0)");
            try (ResultSet rs = s.executeQuery("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT")) {
                rs.next();
                return rs.getLong(1);
            }
        }
    }

    private static void insert(Connection c, long id, long version, String mode, String json) throws SQLException {
        try (PreparedStatement ps = c.prepareStatement(INSERT)) {
            ps.setLong(1, id);
            ps.setLong(2, version);
            ps.setString(3, mode);
            ps.setString(4, json);
            ps.executeUpdate();
        }
    }

    interface SqlWork {
        void run(Connection c) throws SQLException;
    }

    private void inTx(SqlWork work) throws SQLException {
        try (Connection c = dataSource.getConnection()) {
            c.setAutoCommit(false);
            try {
                work.run(c);
            } finally {
                c.rollback();
            }
        }
    }

    @Test
    void V12_TB_MDM_LAYOUT_VER_가_있고_PK_는_레이아웃과_버전이다() {
        List<String> cols = jdbc.queryForList("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'TB_MDM_LAYOUT_VER' "
                + "ORDER BY ORDINAL_POSITION", String.class);
        assertEquals(List.of("LAYOUT_ID", "LAYOUT_VERSION", "TOTAL_LENGTH", "SWITCH_MODE", "CHANGE_KINDS", "CHANGE_SUMMARY",
                "SNAPSHOT_JSON", "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "VER"), cols);
        List<String> pk = jdbc.queryForList("SELECT k.COLUMN_NAME FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS t "
                + "JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON k.CONSTRAINT_NAME = t.CONSTRAINT_NAME "
                + "WHERE t.TABLE_NAME = 'TB_MDM_LAYOUT_VER' AND t.CONSTRAINT_TYPE = 'PRIMARY KEY' ORDER BY k.ORDINAL_POSITION", String.class);
        assertEquals(List.of("LAYOUT_ID", "LAYOUT_VERSION"), pk);
        String collation = jdbc.queryForObject("SELECT COLLATION_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = "
                + "'TB_MDM_LAYOUT_VER' AND COLUMN_NAME = 'SWITCH_MODE'", String.class);
        assertEquals("Latin1_General_100_BIN2", collation);
        assertEquals("nvarchar", jdbc.queryForObject("SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = "
                + "'TB_MDM_LAYOUT_VER' AND COLUMN_NAME = 'SNAPSHOT_JSON'", String.class));
    }

    @Test
    void SNAPSHOT_JSON_은_JSON_이_아니면_거부한다() throws SQLException {
        inTx(c -> {
            long id = layout(c);
            insert(c, id, 1, null, "{\"layoutId\":1}");
            SQLException e = assertThrows(SQLException.class, () -> insert(c, id, 2, null, "not json"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_SNAPSHOT_JSON"), e.getMessage());
        });
    }

    @Test
    void SWITCH_MODE_는_순차_동시_NULL_만_받는다() throws SQLException {
        inTx(c -> {
            long id = layout(c);
            insert(c, id, 1, null, "{}");
            insert(c, id, 2, "SEQUENTIAL", "{}");
            insert(c, id, 3, "SIMULTANEOUS", "{}");
            SQLException e = assertThrows(SQLException.class, () -> insert(c, id, 4, "sequential", "{}"));
            assertTrue(e.getMessage().contains("CK_TB_MDM_LAYOUT_VER_SWITCH"), "BIN2 — 소문자는 다른 값: " + e.getMessage());
        });
    }

    @Test
    void 없는_레이아웃을_가리키면_FK_로_거부한다() throws SQLException {
        inTx(c -> {
            SQLException e = assertThrows(SQLException.class, () -> insert(c, 987_654L, 1, null, "{}"));
            assertTrue(e.getMessage().contains("FK_TB_MDM_LAYOUT_VER_LAYOUT"), e.getMessage());
        });
    }

    @Test
    void 엔티티로_저장하고_읽으면_같다() {
        jdbc.update("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, VER) VALUES ('MESSAGE', N'엔티티 왕복', 187, 0)");
        Long id = jdbc.queryForObject("SELECT MAX(LAYOUT_ID) FROM TB_MDM_LAYOUT", Long.class);
        MdmLayoutVer v = new MdmLayoutVer(id, 1L);
        v.setTotalLength(187);
        v.setSwitchMode("SEQUENTIAL");
        v.setChangeKinds("FILLER_SPLIT");
        v.setChangeSummary("여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)");
        v.setSnapshotJson("{\"layoutName\":\"출측검사 실적 수신\"}");
        repository.saveAndFlush(v);
        MdmLayoutVer got = repository.findById(new MdmLayoutVerId(id, 1L)).orElseThrow();
        assertEquals("여분 29 → 코일 두께 4 + 여분 25 (여분 쪼개 쓰기)", got.getChangeSummary(), "NVARCHAR 한글 왕복");
        assertEquals("{\"layoutName\":\"출측검사 실적 수신\"}", got.getSnapshotJson());
        assertEquals("SEQUENTIAL", got.getSwitchMode());
        assertEquals(0L, got.getVersion());
        List<String> kinds = new ArrayList<>(jdbc.queryForList("SELECT CHANGE_KINDS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", String.class, id));
        assertEquals(List.of("FILLER_SPLIT"), kinds);
    }
}
