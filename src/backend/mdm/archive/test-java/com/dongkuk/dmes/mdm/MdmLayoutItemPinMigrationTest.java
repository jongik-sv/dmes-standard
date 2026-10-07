package com.dongkuk.dmes.mdm;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.stream.Collectors;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

/**
 * D-151 — V22: 레이아웃 항목 행에 DATA_TYPE·UNIT_CODE·SCALE·PINNED_YN 칸을 더하고(표 재생성, 칼럼 순서 불변식), 확정 이후 버전(DRAFT·
 * LEGACY 아님)의 항목을 전부 고정 표시(PINNED_YN 'Y')하고 이행 시점 사전 유효값으로 한 번 채운다(유효값이 없으면 NULL 로 고정). 유효값은 {@code LayoutDictionary} 와 같은 계산이다 — 타입은 최상위 조상의
 * DATA_TYPE, 소수·단위는 자신부터 위로 처음 만나는 값, 도메인 없음·순환·노드 52개째는 세 칸 모두 없음({@code DomainTreeSnapshot}
 * 깊이 가드 50). 합성 결과가 이행 전후로 같다는 시험은 {@code LayoutPinMigrationEquivalenceSqliteTest} 가 맡는다.
 */
class MdmLayoutItemPinMigrationTest {

    @TempDir
    Path dir;

    private Flyway flyway(String url, String target) {
        return Flyway.configure().dataSource(url, null, null)
                .locations("classpath:db/migration/mdm/sqlite").target(target).load();
    }

    /**
     * 검토 Minor — 채움 SQL 은 저장소 재귀 CTE 기본형(RECURSIVE 키워드 없이 칼럼 목록을 붙인 WITH, dialect-neutral-sql.md §3 ·
     * DomainImpactQueries 선례)이고, 행 수 제한(LIMIT) 대신 MIN(DEPTH) 조인으로 처음 만나는 값을 고른다 — 운영 방언으로 옮길 때 다시 쓸 곳을
     * 줄인다. 주석은 보지 않는다.
     */
    @Test
    void fillSqlUsesTheRepositoryRecursiveCteFormWithoutLimit() throws Exception {
        String sql;
        try (InputStream in = getClass().getClassLoader().getResourceAsStream("db/migration/mdm/sqlite/V22__layout_item_pin_column_attrs.sql")) {
            sql = new String(Objects.requireNonNull(in).readAllBytes(), StandardCharsets.UTF_8);
        }
        String code = sql.lines().map(l -> l.contains("--") ? l.substring(0, l.indexOf("--")) : l)
                .collect(Collectors.joining("\n")).toUpperCase(Locale.ROOT);
        assertThat(code).contains("WITH CHAIN(").doesNotContain("RECURSIVE").doesNotContain("LIMIT");
    }

    @Test
    void releasedItemsGetEffectiveDictionaryValuesAndDraftOrLegacyStayNull() throws Exception {
        String url = "jdbc:sqlite:" + dir.resolve("m.db") + "?foreign_keys=true";
        flyway(url, "21").migrate();
        String before;
        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            s.execute("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('mm', 'LENGTH', 'mm', 1, 0)");
            s.execute("INSERT INTO TB_MDM_UNIT (UNIT_CODE, DIMENSION, BASE_UNIT, FACTOR, CHG_SEQ) VALUES ('kg', 'WEIGHT', 'kg', 1, 0)");
            // 상속 사슬 — D2 는 부모 D1 의 소수·단위를 물려받고, D3 은 둘 다 덮어쓴다. 타입은 늘 최상위(D1)의 것
            domain(s, 1, null, "NUMBER", 2, "'mm'");
            domain(s, 2, 1, "STRING", null, "NULL");
            domain(s, 3, 2, "STRING", 0, "'kg'");
            domain(s, 4, null, "STRING", null, "NULL");
            // 순환 D5 ↔ D6
            domain(s, 5, null, "NUMBER", 1, "NULL");
            domain(s, 6, 5, "NUMBER", 1, "NULL");
            s.execute("UPDATE TB_MDM_DOMAIN SET PARENT_DOMAIN_ID = 6 WHERE DOMAIN_ID = 5");
            // 노드 51개 사슬(허용) 10..60 과 52개 사슬(깊이 가드) 100..151 — 최상위가 첫 번호
            chain(s, 10, 51, "NUMBER");
            chain(s, 100, 52, "NUMBER");
            column(s, "C_D1", "1");
            column(s, "C_D2", "2");
            column(s, "C_D3", "3");
            column(s, "C_D4", "4");
            column(s, "C_CYC", "6");
            column(s, "C_NODOM", "NULL");
            column(s, "C_DEEP51", "60");
            column(s, "C_DEEP52", "151");

            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (100, 'HEADER', 'H', 'INUSE', 0)");
            s.execute("INSERT INTO TB_MDM_LAYOUT (LAYOUT_ID, LAYOUT_KIND, LAYOUT_NAME, STATUS, VER) VALUES (200, 'MESSAGE', 'M', 'INUSE', 0)");
            version(s, 100, "1", "RELEASED", "N", "NULL");
            version(s, 200, "1", "RELEASED", "Y", "'{}'");
            version(s, 200, "2", "RELEASED", "N", "NULL");
            version(s, 200, "2.001", "DRAFT", "N", "NULL");
            // 헤더 RELEASED — 상속 사슬 셋 + 여분
            item(s, 100, "1", 1, "AUTO", "'C_D1'");
            item(s, 100, "1", 2, "CONST", "'C_D2'");
            item(s, 100, "1", 3, "CONST", "'C_D3'");
            item(s, 100, "1", 4, "FILLER", "NULL");
            // 전문 LEGACY(이행 전 스냅샷 버전) — 항목 행이 있어도 채우지 않는다(합성이 SNAPSHOT_JSON 을 그대로 쓴다)
            item(s, 200, "1", 1, "DATA", "'C_D2'");
            // 전문 RELEASED — 문자·순환·도메인 없음·깊이 가드 경계
            item(s, 200, "2", 1, "DATA", "'C_D4'");
            item(s, 200, "2", 2, "DATA", "'C_CYC'");
            item(s, 200, "2", 3, "DATA", "'C_NODOM'");
            item(s, 200, "2", 4, "DATA", "'C_DEEP51'");
            item(s, 200, "2", 5, "DATA", "'C_DEEP52'");
            item(s, 200, "2", 6, "DATA", "'C_D3'");
            // 전문 DRAFT — 채우지 않는다
            item(s, 200, "2.001", 1, "DATA", "'C_D3'");
            before = String.join("\n", strings(s, ITEM_DUMP));
        }
        // 부모 행이 사라진 사슬(D7 → 없는 999) — 외래키를 끈 연결로만 만들 수 있다. 최상위는 D7 자신이다
        try (Connection c = DriverManager.getConnection("jdbc:sqlite:" + dir.resolve("m.db")); Statement s = c.createStatement()) {
            domain(s, 7, 999, "DATE", 3, "'mm'");
            column(s, "C_BROKEN", "7");
            item(s, 200, "2", 7, "DATA", "'C_BROKEN'");
        }

        flyway(url, "22").migrate();

        try (Connection c = DriverManager.getConnection(url); Statement s = c.createStatement()) {
            // 칼럼 순서 — 새 칸은 LENGTH 뒤, 감사 칼럼 앞(표 재생성)
            assertThat(strings(s, "SELECT name FROM pragma_table_info('TB_MDM_LAYOUT_ITEM')")).containsExactly(
                    "LAYOUT_ID", "VER", "SEQ", "FILL_KIND", "COLUMN_PHYS", "TRANS_UNIT", "UNIT_ITEM", "NUM_FORMAT", "DEFAULT_VALUE",
                    "FILLER_LENGTH", "OFFSET", "LENGTH", "DATA_TYPE", "UNIT_CODE", "SCALE", "PINNED_YN",
                    "C_USR_ID", "C_AT", "C_SVC_ID", "C_PGM_ID", "U_USR_ID", "U_AT", "U_SVC_ID", "U_PGM_ID", "AUD_VER");
            assertThat(strings(s, "SELECT type || '|' || \"notnull\" || '|' || COALESCE(dflt_value, '-') FROM pragma_table_info('TB_MDM_LAYOUT_ITEM') "
                    + "WHERE name IN ('DATA_TYPE', 'UNIT_CODE', 'SCALE', 'PINNED_YN') ORDER BY cid"))
                    .containsExactly("VARCHAR(20)|0|-", "VARCHAR(20)|0|-", "INTEGER|0|-", "VARCHAR(1)|1|'N'");
            // 옛 칸은 그대로 옮겨졌다 — 채우기 전 덤프는 외래키를 끈 연결로 넣은 200@2#7 행 전에 떴다
            List<String> after = strings(s, ITEM_DUMP).stream().filter(r -> !r.startsWith("200@2#7|")).toList();
            assertThat(String.join("\n", after)).isEqualTo(before);

            assertThat(strings(s, "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '#' || SEQ || '=' || PINNED_YN || ':' "
                    + "|| COALESCE(DATA_TYPE, '-') || '|' || COALESCE(UNIT_CODE, '-') || '|' || COALESCE(CAST(SCALE AS VARCHAR(10)), '-') "
                    + "FROM TB_MDM_LAYOUT_ITEM ORDER BY LAYOUT_ID, VER, SEQ")).containsExactly(
                    "100@1#1=Y:NUMBER|mm|2", // 최상위 자신
                    "100@1#2=Y:NUMBER|mm|2", // 부모의 소수·단위 상속, 자기 STRING 이 아니라 최상위 타입
                    "100@1#3=Y:NUMBER|kg|0", // 자기 값이 부모 값을 덮는다
                    "100@1#4=Y:-|-|-",       // 여분 — 물리명 없음(고정 표시는 버전의 모든 행)
                    "200@1#1=N:-|-|-",       // LEGACY — 저장된 스냅샷을 쓴다
                    "200@2#1=Y:STRING|-|-",
                    "200@2#2=Y:-|-|-",       // 순환 — 값 없음으로 고정
                    "200@2#3=Y:-|-|-",       // 도메인 없음 — 값 없음으로 고정
                    "200@2#4=Y:NUMBER|-|0",  // 노드 51개 — 허용(최상위 10 의 소수 0 이 끝까지 내려온다)
                    "200@2#5=Y:-|-|-",       // 노드 52개 — 깊이 가드
                    "200@2#6=Y:NUMBER|kg|0",
                    "200@2#7=Y:DATE|mm|3",   // 부모 행이 없으면 거기서 끝 — 최상위는 자신
                    "200@2.001#1=N:-|-|-");  // DRAFT — 지금 사전을 읽는다
            // 이행 누락 없음 — 확정 이후 버전(DRAFT·LEGACY 아님)의 항목은 전부 고정 표시됐다
            assertThat(strings(s, "SELECT CAST(COUNT(*) AS VARCHAR(10)) FROM TB_MDM_LAYOUT_ITEM i JOIN TB_MDM_LAYOUT_VER v "
                    + "ON v.LAYOUT_ID = i.LAYOUT_ID AND v.VER = i.VER WHERE v.STATUS <> 'DRAFT' AND v.LEGACY_SNAPSHOT_YN = 'N' "
                    + "AND i.PINNED_YN <> 'Y'")).containsExactly("0");
            // 단위 고정값은 단위 원장을 가리킨다
            assertThat(strings(s, "SELECT sql FROM sqlite_master WHERE name = 'TB_MDM_LAYOUT_ITEM'").get(0))
                    .contains("CONSTRAINT FK_TB_MDM_LAYOUT_ITEM_UNIT_CODE FOREIGN KEY (UNIT_CODE) REFERENCES TB_MDM_UNIT (UNIT_CODE)");
            assertThat(s.executeQuery("PRAGMA foreign_key_check('TB_MDM_LAYOUT_ITEM')").next()).isFalse();
            // 임시 표가 남지 않는다
            assertThat(strings(s, "SELECT name FROM sqlite_master WHERE name LIKE 'TB_MDM_LAYOUT_V22%' OR name LIKE '%\\_BAK' ESCAPE '\\'"))
                    .isEmpty();
            // 새 칸이 있는 표에 FK 가 살아 있다 — 있는 단위는 받고 없는 단위는 거부
            assertThat(insertFails(s, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, UNIT_CODE, PINNED_YN) "
                    + "VALUES (200, 2.001, 9, 'FILLER', 'mm', 'Y')")).isFalse();
            assertThat(insertFails(s, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, UNIT_CODE, PINNED_YN) "
                    + "VALUES (200, 2.001, 10, 'FILLER', 'zz', 'Y')")).isTrue();
            // 고정 표시 CHECK — Y·N 만, 고정하지 않은 행은 세 칸이 비어 있어야 한다. 표시를 빼면 기본 'N'
            assertThat(insertFails(s, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, PINNED_YN) "
                    + "VALUES (200, 2.001, 11, 'FILLER', 'X')")).isTrue();
            assertThat(insertFails(s, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, SCALE) "
                    + "VALUES (200, 2.001, 12, 'FILLER', 2)")).isTrue();
            assertThat(insertFails(s, "INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND) VALUES (200, 2.001, 13, 'FILLER')"))
                    .isFalse();
            assertThat(strings(s, "SELECT PINNED_YN FROM TB_MDM_LAYOUT_ITEM WHERE LAYOUT_ID = 200 AND VER = 2.001 AND SEQ = 13"))
                    .containsExactly("N");
        }
    }

    private static final String ITEM_DUMP = "SELECT LAYOUT_ID || '@' || CAST(VER AS VARCHAR(40)) || '#' || SEQ || '|' || FILL_KIND || '|' "
            + "|| COALESCE(COLUMN_PHYS, '-') || '|' || `OFFSET` || '|' || `LENGTH` || '|' || COALESCE(C_USR_ID, '-') || '|' "
            + "|| COALESCE(CAST(AUD_VER AS VARCHAR(10)), '-') FROM TB_MDM_LAYOUT_ITEM ORDER BY LAYOUT_ID, VER, SEQ";

    private static void domain(Statement s, long id, Integer parent, String type, Integer scale, String unitSql) throws Exception {
        s.execute("INSERT INTO TB_MDM_DOMAIN (DOMAIN_ID, DOMAIN_NAME, STD_NAME, PARENT_DOMAIN_ID, DOMAIN_KIND, DATA_TYPE, SCALE, UNIT_CODE, "
                + "CHG_SEQ, VER) VALUES (" + id + ", 'D" + id + "', 'D" + id + "', " + parent + ", 'QTY', '" + type + "', " + scale + ", "
                + unitSql + ", 0, 0)");
    }

    /** {@code first} 부터 {@code n} 개 — 첫 번호가 최상위(소수 0), 끝 번호가 맨 아래. */
    private static void chain(Statement s, long first, int n, String type) throws Exception {
        for (int i = 0; i < n; i++) {
            domain(s, first + i, i == 0 ? null : (int) (first + i - 1), type, i == 0 ? 0 : null, "NULL");
        }
    }

    private static void column(Statement s, String phys, String domainIdSql) throws Exception {
        s.execute("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID, REQUIRED, CHG_SEQ, VER) VALUES ('" + phys + "', '" + phys
                + "', " + domainIdSql + ", 0, 0, 0)");
    }

    private static void version(Statement s, long id, String ver, String status, String legacy, String snapshotSql) throws Exception {
        boolean draft = "DRAFT".equals(status);
        s.execute("INSERT INTO TB_MDM_LAYOUT_VER (LAYOUT_ID, VER, STATUS, APPLY_FROM, APPLY_TO, OWN_LENGTH, SNAPSHOT_JSON, LEGACY_SNAPSHOT_YN) "
                + "VALUES (" + id + ", " + ver + ", '" + status + "', " + (draft ? "NULL" : "'2000-01-01 00:00:00'") + ", "
                + (draft ? "NULL" : "'9999-12-31 00:00:00'") + ", 0, " + snapshotSql + ", '" + legacy + "')");
    }

    private static void item(Statement s, long id, String ver, int seq, String kind, String physSql) throws Exception {
        s.execute("INSERT INTO TB_MDM_LAYOUT_ITEM (LAYOUT_ID, VER, SEQ, FILL_KIND, COLUMN_PHYS, `OFFSET`, `LENGTH`, C_USR_ID, AUD_VER) "
                + "VALUES (" + id + ", " + ver + ", " + seq + ", '" + kind + "', " + physSql + ", " + (seq * 10) + ", 10, 'kim', " + seq + ")");
    }

    private static boolean insertFails(Statement s, String sql) {
        try {
            s.execute(sql);
            return false;
        } catch (java.sql.SQLException e) {
            return true;
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
}
