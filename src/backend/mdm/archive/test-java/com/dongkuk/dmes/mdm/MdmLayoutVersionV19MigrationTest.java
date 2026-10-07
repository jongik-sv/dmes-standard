package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * D-144 3단계 — V21(당초 V19, 메타 캐시 V20 뒤로 옮김 — 클래스 이름은 그대로 둔다): 레이아웃 5표 재생성, 이력 → RELEASED 구간, 항목 행은 최신 버전에만, 헤더는 1.000 RELEASED.
 * 레이아웃마다 첫 버전의 APPLY_FROM 은 이행 하한 2000-01-01 이다(Ruling P2-11 — 이행 이전 판정 시각에도 찾혀야 한다).
 */
class MdmLayoutVersionV19MigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    /** 2026-09-01 00:00:00 KST, 2026-09-05 12:00:00 KST 의 epoch millis(엔티티 Instant 저장 형식, D-038). */
    private static final long H100_C_AT = 1788188400000L;
    private static final long M201_V2_C_AT = 1788577200000L;

    private static final String SNAP_V1 = "{\"eaiCode\":\"G1\",\"encoding\":\"EUC-KR\",\"headers\":[{\"headerLayoutId\":100,"
            + "\"headerLayoutName\":\"H\",\"items\":[],\"offset\":0,\"seq\":1,\"totalLength\":10}],\"items\":[],\"layoutId\":201,"
            + "\"layoutName\":\"M\",\"layoutVersion\":1,\"padRule\":null,\"rcvSystem\":null,\"sndSystem\":null,\"totalLength\":25}";

    @Test
    void layoutHistoryBecomesReleasedIntervalsAndRowsMoveToLatestVersion() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "20").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, REQUIRED, CHG_SEQ, VER) VALUES ('송신공장', 'SND_FAC_TP', 0, 0, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, `VERSION`, C_AT, VER) "
                    + "VALUES (100, 'HEADER', 'H', 10, 0, " + H100_C_AT + ", 3)");
            s.execute("INSERT INTO TB_MDM_EAI (EAI_CODE, EAI_NAME, ENCODING, HEADER_LAYOUT_ID, VER) VALUES ('G1', 'G1', 'EUC-KR', 100, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, EAI_CODE, TOTAL_LENGTH, `VERSION`, C_AT, VER) "
                    + "VALUES (201, 'MESSAGE', 'M', 'G1', 30, 2, '2026-09-02 10:00:00', 5)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, TOTAL_LENGTH, `VERSION`, VER) "
                    + "VALUES (305, 'MESSAGE', 'N', 5, 0, 0)");
            // 지운 끝 번호 — AUTOINCREMENT 상한(sqlite_sequence 350)이 이행 뒤에도 남아야 한다
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, VER) VALUES (350, 'MESSAGE', 'deleted', 0)");
            s.execute("DELETE FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = 350");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, COLUMN_PHYS, DEFAULT_VALUE, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (100, 1, 'CONST', 'SND_FAC_TP', 'B0', 0, 4, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (100, 2, 'FILLER', 6, 4, 6, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (201, 1, 'FILLER', 20, 10, 20, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`, VER) "
                    + "VALUES (305, 1, 'FILLER', 5, 0, 5, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_HEADER (LAYOUT_ID, SEQ, HEADER_LAYOUT_ID, VER) VALUES (201, 1, 100, 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_CONST (LAYOUT_ID, HEADER_LAYOUT_ID, HEADER_SEQ, CONST_VALUE, VER) VALUES (201, 100, 1, 'B9', 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, CHANGE_KINDS, CHANGE_SUMMARY, SNAPSHOT_JSON, "
                    + "C_USR_ID, C_AT, VER) VALUES (201, 1, 25, 'INITIAL', '최초 등록', '" + SNAP_V1 + "', 'kim', '2026-09-02 10:00:00', 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, LAYOUT_VERSION, TOTAL_LENGTH, SWITCH_MODE, CHANGE_KINDS, SNAPSHOT_JSON, "
                    + "C_USR_ID, C_AT, VER) VALUES (201, 2, 30, 'SIMULTANEOUS', 'ITEM_LENGTH', '" + SNAP_V1.replace("25}", "30}")
                    + "', 'lee', " + M201_V2_C_AT + ", 0)");
        }
        flyway(url, "21").migrate();
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            // 부모 — 업무 VERSION·EAI_CODE·TOTAL_LENGTH 칼럼이 없고 STATUS 는 INUSE
            assertThat(columns(s, "TB_MDM_LAYOUT")).doesNotContain("VERSION", "EAI_CODE", "TOTAL_LENGTH").contains("STATUS");
            assertThat(strings(s, "SELECT STATUS FROM TB_MDM_LAYOUT ORDER BY LAYOUT_ID")).containsExactly("INUSE", "INUSE", "INUSE");
            // 전문 201 — 이력 두 행이 이어진 RELEASED 구간이 된다. 첫 버전은 이행 하한부터(Ruling P2-11),
            // 다음 버전은 그 이력 행의 C_AT(epoch → KST)부터
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || STATUS || '|' || APPLY_FROM || '|' || APPLY_TO || '|' "
                    + "|| LEGACY_SNAPSHOT_YN || '|' || OWN_LENGTH || '|' || COALESCE(EAI_CODE, '-') || '|' || COALESCE(CAST(BASE_VER AS VARCHAR(40)), '-') "
                    + "FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 201 ORDER BY APPLY_FROM"))
                    .containsExactly("1|RELEASED|2000-01-01 00:00:00|2026-09-05 12:00:00|Y|15|G1|-",
                            "2|RELEASED|2026-09-05 12:00:00|9999-12-31 00:00:00|N|20|G1|1");
            assertThat(strings(s, "SELECT COALESCE(SNAPSHOT_JSON, '-') FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 201 ORDER BY APPLY_FROM").get(1))
                    .isEqualTo("-");
            // 확정 일시는 실제 저장 시각(TEXT 는 그대로, epoch 는 KST)
            assertThat(strings(s, "SELECT RELEASED_AT || '|' || REQUESTED_BY FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 201 ORDER BY APPLY_FROM"))
                    .containsExactly("2026-09-02 10:00:00|kim", "2026-09-05 12:00:00|lee");
            // 헤더 100 — 현재 행이 1.000 RELEASED, 이행 하한부터. 확정 일시는 C_AT(epoch → KST)
            // 헤더 버전 행의 EAI_CODE = 그 헤더를 표준 헤더로 가리키던 EAI(EAI 표준 헤더를 시각 T 에 해석하는 근거)
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || APPLY_FROM || '|' || OWN_LENGTH || '|' || VER_KIND || '|' "
                    + "|| COALESCE(EAI_CODE, '-') || '|' || RELEASED_AT FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 100"))
                    .containsExactly("1|2000-01-01 00:00:00|10|MAJOR|G1|2026-09-01 00:00:00");
            // 이력 없는 전문 305 — 이행 하한부터, C_AT 이 없으면 확정 일시도 이행 하한
            assertThat(strings(s, "SELECT APPLY_FROM || '|' || OWN_LENGTH || '|' || RELEASED_AT FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = 305"))
                    .containsExactly("2000-01-01 00:00:00|5|2000-01-01 00:00:00");
            // 항목·헤더 구성·상수 — 최신 버전에만, 본문 오프셋은 본문 기준 상대값
            assertThat(strings(s, "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '#' || SEQ || '=' || `OFFSET` "
                    + "FROM TB_MDM_LAYOUT_ITEM ORDER BY LAYOUT_ID, SEQ"))
                    .containsExactly("100@1#1=0", "100@1#2=4", "201@2#1=0", "305@1#1=0");
            assertThat(strings(s, "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '>' || HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER"))
                    .containsExactly("201@2>100");
            assertThat(strings(s, "SELECT CAST(VER AS VARCHAR(40)) || '|' || HEADER_COLUMN_PHYS || '|' || CONST_VALUE FROM TB_MDM_LAYOUT_CONST"))
                    .containsExactly("2|SND_FAC_TP|B9");
            // EAI 와 순환 FK 가 살아 있다
            assertThat(strings(s, "SELECT EAI_CODE || '>' || HEADER_LAYOUT_ID FROM TB_MDM_EAI")).containsExactly("G1>100");
            // 감사 카운터 개명(D-034) — 업무 VER 와 겹치지 않는다
            for (String t : List.of("TB_MDM_LAYOUT_VER", "TB_MDM_LAYOUT_ITEM", "TB_MDM_LAYOUT_HEADER", "TB_MDM_LAYOUT_CONST")) {
                assertThat(columns(s, t)).contains("VER", "AUD_VER");
                assertThat(typeOf(s, t, "VER")).isEqualTo("NUMERIC(7,3)");
            }
            assertThat(strings(s, "SELECT CAST(AUD_VER AS VARCHAR(10)) FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 201")).containsExactly("0");
            assertThat(s.executeQuery("PRAGMA foreign_key_check").next()).isFalse();
            // minor 버전 행·자식 FK 가 동작하고, AUTOINCREMENT 가 지운 끝 번호(350) 뒤에서 이어진다
            s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, VER_KIND, STATUS, OWNER_ID, OWN_LENGTH) VALUES (201, 2.001, 'MINOR', 'DRAFT', 'kim', 20)");
            s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, FILLER_LENGTH, `OFFSET`, `LENGTH`) VALUES (201, 2.001, 1, 'FILLER', 20, 0, 20)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_KIND, LAYOUT_NAME) VALUES ('MESSAGE', 'new')");
            assertThat(strings(s, "SELECT CAST(MAX(LAYOUT_ID) AS VARCHAR(10)) FROM TB_MDM_LAYOUT")).containsExactly("351");
            assertThat(strings(s, "SELECT STATUS FROM TB_MDM_LAYOUT WHERE LAYOUT_ID = 351")).containsExactly("CREATED");
            // 임시 표가 남지 않는다
            assertThat(strings(s, "SELECT name FROM sqlite_master WHERE name LIKE '%\\_BAK' ESCAPE '\\' OR name LIKE 'TB_MDM_LAYOUT_V21%'")).isEmpty();
        }
    }

    private static List<String> strings(Statement s, String sql) throws Exception {
        List<String> out = new ArrayList<>();
        try (ResultSet r = s.executeQuery(sql)) {
            while (r.next()) {
                out.add(r.getString(1));
            }
        }
        return out;
    }

    private static List<String> columns(Statement s, String table) throws Exception {
        return strings(s, "SELECT name FROM pragma_table_info('" + table + "')");
    }

    private static String typeOf(Statement s, String table, String column) throws Exception {
        List<String> t = strings(s, "SELECT type FROM pragma_table_info('" + table + "') WHERE name = '" + column + "'");
        return t.isEmpty() ? null : t.get(0);
    }
}
