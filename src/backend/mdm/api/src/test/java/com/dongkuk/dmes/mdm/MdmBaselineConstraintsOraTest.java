package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * Oracle 기준선 V1 의 제약·인덱스가 시험 스키마(MDMAPUSER)에 실제로 다 있는지 데이터 사전으로 대조한다(oracle-1007 ②b).
 * 옛 SQLite {@code *MigrationTest} 들이 하던 제약 확인(FK·CHECK·IS JSON·유일)을 V1 하나에 대해 대신한다 — 엔티티 대조
 * ({@link MdmEntitySchemaValidateOraTest})는 표·컬럼·형만 보고 제약은 보지 않는다.
 *
 * <p>기대값은 V1 원문에서 이름 붙은 {@code CONSTRAINT <이름> <종류>} 와 {@code CREATE [UNIQUE] INDEX <이름>} 를 읽어 만든다. 실제값은
 * {@code USER_CONSTRAINTS}·{@code USER_INDEXES} 다. 이름 없는 NOT NULL(SYS_ 이름)과 Oracle 이 만든 IDENTITY·LOB 인덱스는 비교하지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmBaselineConstraintsOraTest extends AbstractMdmSharedDbTest {

    private static final Pattern CONSTRAINT = Pattern.compile("CONSTRAINT\\s+(\\w+)\\s+(PRIMARY\\s+KEY|UNIQUE|FOREIGN\\s+KEY|CHECK)");
    private static final Pattern INDEX = Pattern.compile("CREATE\\s+(UNIQUE\\s+)?INDEX\\s+(\\w+)");
    /** 시험 대상에서 뺄 객체 — 휴지통(BIN$)과 Flyway 이력 표(따옴표 붙은 소문자 표 이름, MdmSharedTestDb.HISTORY_TABLE). */
    private static final String NOT_HOUSEKEEPING = "CONSTRAINT_NAME NOT LIKE 'BIN$%' AND UPPER(TABLE_NAME) <> 'FLYWAY_SCHEMA_HISTORY'";
    /** V1 원문의 종류 → USER_CONSTRAINTS.CONSTRAINT_TYPE. */
    private static final Map<String, String> TYPE = Map.of("PRIMARY", "P", "UNIQUE", "U", "FOREIGN", "R", "CHECK", "C");

    private static String v1;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeAll
    static void readV1() throws IOException {
        v1 = new ClassPathResource("db/migration/mdm/oracle/V1__baseline.sql").getContentAsString(StandardCharsets.UTF_8)
                .lines().filter(l -> !l.stripLeading().startsWith("--")).reduce("", (a, b) -> a + "\n" + b);
    }

    @Test
    void V1_의_이름_붙은_제약이_모두_같은_종류로_있고_켜져_있다() {
        Map<String, String> expected = new TreeMap<>();
        Matcher m = CONSTRAINT.matcher(v1);
        while (m.find()) {
            expected.put(m.group(1).toUpperCase(), TYPE.get(m.group(2).split("\\s+")[0].toUpperCase()));
        }
        assertTrue(expected.size() > 100, "V1 에서 제약 이름을 읽지 못했다: " + expected.size());

        Map<String, String> actual = new TreeMap<>();
        Set<String> disabled = new TreeSet<>();
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT CONSTRAINT_NAME, CONSTRAINT_TYPE, STATUS, VALIDATED FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME NOT LIKE 'SYS\\_%' ESCAPE '\\' AND "
                        + NOT_HOUSEKEEPING)) {
            String name = (String) row.get("CONSTRAINT_NAME");
            actual.put(name, (String) row.get("CONSTRAINT_TYPE"));
            // ENABLE NOVALIDATE 로 남은 제약(DmaTestSupport.insertWithForeignKeyOff 가 되돌리지 못한 경우)도 잡는다.
            if (!"ENABLED".equals(row.get("STATUS")) || !"VALIDATED".equals(row.get("VALIDATED"))) {
                disabled.add(name);
            }
        }
        Map<String, String> missingOrWrong = new TreeMap<>();
        expected.forEach((name, type) -> {
            if (!type.equals(actual.get(name))) {
                missingOrWrong.put(name, type + "≠" + actual.get(name));
            }
        });
        assertEquals(Map.of(), missingOrWrong, "V1 제약이 없거나 종류가 다르다(이름=기대≠실제)");
        Set<String> extra = new TreeSet<>(actual.keySet());
        extra.removeAll(expected.keySet());
        assertEquals(Set.of(), extra, "V1 에 없는 이름 붙은 제약이 스키마에 있다(시험이 만든 객체가 남았거나 V1 밖 DDL)");
        disabled.retainAll(expected.keySet());
        assertEquals(Set.of(), disabled, "꺼졌거나(DISABLED) 검증하지 않은(NOT VALIDATED) V1 제약이 있다");

        // 이름 없는 제약(SYS_)은 NOT NULL 뿐이어야 한다 — PK·UNIQUE·FK·NOT NULL 아닌 CHECK 가 이름 없이 생기면 위 대조가 놓친다.
        List<String> unnamed = jdbc.queryForList(
                "SELECT TABLE_NAME || '.' || CONSTRAINT_NAME || ':' || CONSTRAINT_TYPE FROM USER_CONSTRAINTS WHERE CONSTRAINT_NAME LIKE 'SYS\\_%' ESCAPE '\\' "
                        + "AND " + NOT_HOUSEKEEPING + " AND (CONSTRAINT_TYPE IN ('P','U','R') "
                        + "OR (CONSTRAINT_TYPE = 'C' AND SEARCH_CONDITION_VC NOT LIKE '%IS NOT NULL'))", String.class);
        assertEquals(List.of(), unnamed, "이름 없는 PK·UNIQUE·FK·CHECK 가 있다");
    }

    @Test
    void IS_JSON_CHECK_와_FK_수가_V1_과_같다() {
        long jsonChecks = Pattern.compile("IS\\s+JSON").matcher(v1).results().count();
        long fks = Pattern.compile("FOREIGN\\s+KEY").matcher(v1).results().count();
        List<String> conditions = jdbc.queryForList(
                "SELECT SEARCH_CONDITION_VC FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'C' AND CONSTRAINT_NAME NOT LIKE 'SYS\\_%' ESCAPE '\\' AND "
                        + NOT_HOUSEKEEPING,
                String.class);
        long actualJson = conditions.stream().filter(c -> c != null && Pattern.compile("IS\\s+JSON", Pattern.CASE_INSENSITIVE).matcher(c).find())
                .count();
        Integer actualFk = jdbc.queryForObject("SELECT COUNT(*) FROM USER_CONSTRAINTS WHERE CONSTRAINT_TYPE = 'R' AND " + NOT_HOUSEKEEPING,
                Integer.class);
        assertEquals(jsonChecks, actualJson, "IS JSON CHECK 수");
        assertEquals(fks, actualFk.longValue(), "FK 수");
    }

    @Test
    void V1_의_인덱스가_모두_같은_유일성으로_있다() {
        Map<String, String> expected = new TreeMap<>();
        Matcher m = INDEX.matcher(v1);
        while (m.find()) {
            expected.put(m.group(2).toUpperCase(), m.group(1) == null ? "NONUNIQUE" : "UNIQUE");
        }
        assertTrue(!expected.isEmpty(), "V1 에서 인덱스 이름을 읽지 못했다");
        Map<String, String> actual = new HashMap<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT INDEX_NAME, UNIQUENESS FROM USER_INDEXES WHERE INDEX_NAME NOT LIKE 'BIN$%'")) {
            actual.put((String) row.get("INDEX_NAME"), (String) row.get("UNIQUENESS"));
        }
        Map<String, String> missingOrWrong = new TreeMap<>();
        expected.forEach((name, uniqueness) -> {
            if (!uniqueness.equals(actual.get(name))) {
                missingOrWrong.put(name, uniqueness + "≠" + actual.get(name));
            }
        });
        assertEquals(Map.of(), missingOrWrong, "V1 인덱스가 없거나 유일성이 다르다(이름=기대≠실제)");
    }
}
