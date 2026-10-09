package com.dongkuk.dmes.mdm;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.segment.DmdSegmentTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * V3 환율 마스터 시드(통화 CUR · 환율 FX_RATE)를 확인한다(docs/superpowers/specs/2026-10-09-mdm-fx-master-design.md D1·D2·R6).
 *
 * <p>시험 하니스는 JVM 당 한 번 Flyway 로 V3 까지 적용하지만 클래스마다 모든 표의 행을 지우고 V1 초기 행만 다시 넣는다. 그래서 이 시험은
 * ① Flyway 이력에 V3 가 성공으로 남았는지, ② 클래스패스의 V3 파일에서 DML(DECLARE 앞까지)을 읽어 직접 실행한 결과, ③ 다시 실행해도
 * 행이 늘지 않는지(닫은 통화를 되살리지 않는지 포함)를 본다. PL/SQL 블록(GRANT)은 ①의 Flyway 적용으로 이미 실행됐다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MdmFxMasterSeedOraTest extends AbstractMdmSharedDbTest {

    private static final String OPEN_END = "TIMESTAMP '9999-12-31 00:00:00'";

    private static List<String> dml;
    private static List<String> dml4;

    @Autowired
    JdbcTemplate jdbc;

    @BeforeAll
    static void readMigrations() throws IOException {
        dml = readDml("V3__fx_master_seed.sql");
        dml4 = readDml("V4__fx_rate_by_date.sql");
    }

    /** DECLARE/BEGIN 앞까지의 문장만(줄 주석·빈 줄 건너뜀, 끝 {@code ;} 뺌). */
    private static List<String> readDml(String file) throws IOException {
        String sql = new ClassPathResource("db/migration/mdm/oracle/" + file).getContentAsString(StandardCharsets.UTF_8);
        List<String> out = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String line : sql.split("\\R")) {
            String trimmed = line.strip();
            if (current.isEmpty() && (trimmed.isEmpty() || trimmed.startsWith("--"))) {
                continue;
            }
            if (trimmed.startsWith("DECLARE") || trimmed.startsWith("BEGIN")) {
                break;
            }
            current.append(line).append('\n');
            if (trimmed.endsWith(";")) {
                String statement = current.toString().strip();
                out.add(statement.substring(0, statement.length() - 1));
                current.setLength(0);
            }
        }
        assertTrue(current.isEmpty(), "끝나지 않은 문장: " + current);
        return List.copyOf(out);
    }

    /** 앞 시험이 남긴 행(닫은 통화·바꾼 이름)이 섞이지 않게 마루 데이터 표를 비운다. */
    @BeforeEach
    void clearMasterData() {
        DmdSegmentTestSupport.clear(jdbc);
    }

    private void applySeed() {
        dml.forEach(jdbc::execute);
    }

    private void applyV4() {
        dml4.forEach(jdbc::execute);
    }

    private int count(String sql) {
        Integer n = jdbc.queryForObject(sql, Integer.class);
        return n == null ? 0 : n;
    }

    @Test
    void flyway_V3_가_성공으로_남았다() {
        assertEquals(1, count("SELECT COUNT(*) FROM \"flyway_schema_history\" WHERE \"version\" = '3' AND \"success\" = 1"));
    }

    @Test
    void MCMAPUSER_가_있으면_항목_표_읽기_권한이_부여됐다() {
        if (count("SELECT COUNT(*) FROM ALL_USERS WHERE USERNAME = 'MCMAPUSER'") == 0) {
            return;
        }
        assertEquals(1, count("SELECT COUNT(*) FROM USER_TAB_PRIVS_MADE WHERE TABLE_NAME = 'TB_MDM_DATA_ITEM' "
                + "AND GRANTEE = 'MCMAPUSER' AND PRIVILEGE = 'SELECT'"));
    }

    @Test
    void 마스터_정의_두_행() {
        applySeed();

        Map<String, Object> cur = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'CUR'");
        assertEquals("MDM", cur.get("SOURCE_KIND"));
        assertNull(cur.get("SOURCE_SYSTEM"));
        assertEquals("^[A-Z]{3}$", cur.get("CODE_PATTERN"));
        assertEquals(Arrays.asList("지역", "고시 단위", "소수 자릿수", "환율 수집", null), attrLabels(cur));

        Map<String, Object> fx = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'FX_RATE'");
        assertEquals("EXTERNAL", fx.get("SOURCE_KIND"));
        assertEquals("MDM", fx.get("SOURCE_SYSTEM"));
        assertEquals("^[A-Z]{3}[0-9]{8}$", fx.get("CODE_PATTERN"));
        assertEquals(List.of("통화", "기준일", "환율", "기준통화", "출처"), attrLabels(fx));

        for (Map<String, Object> row : List.of(cur, fx)) {
            assertEquals("INUSE", row.get("STATUS"));
            assertEquals(0, ((Number) row.get("LVL_CNT")).intValue());
            assertEquals(0, ((Number) row.get("CHG_SEQ")).intValue());
            assertEquals(0, ((Number) row.get("LAST_CHG_SEQ")).intValue());
            assertEquals(0, ((Number) row.get("VER")).intValue());
            assertEquals("SYSTEM", row.get("C_USR_ID"));
        }
        // FX_RATE 항목은 시드하지 않는다(예약 작업이 채운다).
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE'"));
    }

    @Test
    void 카테고리_수와_모양() {
        applySeed();

        assertEquals(6, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'CUR'"));
        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'FX_RATE'"));
        assertEquals(8, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE VALID_TO = " + OPEN_END + " AND DEF_KIND = 'REGEX'"));
        // 정규식 카테고리는 소속 표를 쓰지 않는다.
        assertEquals(0, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE_ITEM"));
        for (String md : List.of("CUR", "FX_RATE")) {
            Map<String, Object> base = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = ? AND CATE_ID = 'BASE'", md);
            assertEquals("전체", base.get("CATE_NAME"));
            assertEquals("REGEX", base.get("DEF_KIND"));
            assertEquals(".*", base.get("DEF_EXPR"));
            assertEquals("KEY", base.get("DEF_TARGET"));
        }
        Map<String, Object> fxMajor = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'FX_RATE' AND CATE_ID = 'MAJOR'");
        assertEquals("ATTR01", fxMajor.get("DEF_TARGET"));
        assertEquals("^(USD|EUR|JPY|CNY)$", fxMajor.get("DEF_EXPR"));
    }

    @Test
    void 통화_항목_12행과_카테고리_소속() {
        applySeed();

        assertEquals(12, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR'"));
        assertEquals(12, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND VALID_TO = " + OPEN_END
                + " AND ROW_VERSION = 0 AND CHG_SEQ = 0"));
        assertEquals(11, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND ATTR04 = 'Y'"));
        assertEquals(List.of("KRW"), jdbc.queryForList("SELECT CODE FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND ATTR04 = 'N'", String.class));
        assertEquals("100", jdbc.queryForObject("SELECT ATTR02 FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'JPY'", String.class));
        assertEquals("0", jdbc.queryForObject("SELECT ATTR03 FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'KRW'", String.class));
        assertEquals(12, count("SELECT COUNT(DISTINCT SEQ) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR'"));

        // 카테고리 정의를 실제 정규식 리졸버로 돌려 소속이 설계 표와 같은지 본다.
        assertEquals(Set.of("USD", "EUR", "JPY", "CNY"), members("CUR", "MAJOR"));
        assertEquals(Set.of("JPY", "CNY", "HKD", "SGD", "THB"), members("CUR", "ASIA"));
        assertEquals(Set.of("EUR", "GBP", "CHF"), members("CUR", "EUROPE"));
        assertEquals(Set.of("USD", "CAD"), members("CUR", "AMERICAS"));
        assertEquals(Set.of("AUD"), members("CUR", "OCEANIA"));
        assertEquals(12, members("CUR", "BASE").size());
    }

    @Test
    void 다시_적용해도_행이_늘지_않고_닫은_통화를_되살리지_않는다() {
        applySeed();
        // 사용자가 THB 를 닫고 KRW 이름을 고쳤다고 하자(열린 행 없음 / 값 변경).
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET VALID_TO = TIMESTAMP '2026-10-10 00:00:00' WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB'");
        jdbc.update("UPDATE TB_MDM_DATA_ITEM SET NAME = '원화' WHERE MARU_DATA_ID = 'CUR' AND CODE = 'KRW'");
        jdbc.update("UPDATE TB_MDM_DATA_CATE SET CATE_NAME = '핵심' WHERE MARU_DATA_ID = 'CUR' AND CATE_ID = 'MAJOR'");

        applySeed();

        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_DATA WHERE MARU_DATA_ID IN ('CUR', 'FX_RATE')"));
        assertEquals(8, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE"));
        assertEquals(12, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR'"));
        assertEquals(1, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB' AND VALID_TO <> " + OPEN_END));
        assertEquals("원화", jdbc.queryForObject("SELECT NAME FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'KRW'", String.class));
        assertEquals("핵심", jdbc.queryForObject("SELECT CATE_NAME FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'CUR' AND CATE_ID = 'MAJOR'", String.class));
    }

    @Test
    void flyway_V4_가_성공으로_남았다() {
        assertEquals(1, count("SELECT COUNT(*) FROM \"flyway_schema_history\" WHERE \"version\" = '4' AND \"success\" = 1"));
    }

    @Test
    void V4_는_FX_RATE_를_날짜_한_행_통화는_칼럼으로_바꾼다() {
        applySeed();
        applyV4();

        Map<String, Object> fx = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'FX_RATE'");
        assertEquals("^[0-9]{8}$", fx.get("CODE_PATTERN"));
        List<String> labels = new ArrayList<>();
        for (int i = 1; i <= 10; i++) {
            labels.add((String) fx.get(String.format("ATTR%02d_NAME", i)));
        }
        assertEquals(List.of("USD", "EUR", "JPY", "CNY", "GBP", "AUD", "CAD", "CHF", "HKD", "SGD"), labels);
        assertEquals(1, ((Number) fx.get("VER")).intValue());

        // 카테고리: MAJOR 는 닫고(삭제 아님) BASE 만 열려 있다.
        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'FX_RATE'"));
        assertEquals(List.of("BASE"), jdbc.queryForList(
                "SELECT CATE_ID FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'FX_RATE' AND VALID_TO = " + OPEN_END, String.class));
        assertEquals(1, count("SELECT COUNT(*) FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = 'FX_RATE' AND CATE_ID = 'MAJOR' "
                + "AND VALID_TO > VALID_FROM AND VALID_TO < " + OPEN_END));
    }

    @Test
    void V4_는_THB_수집을_N_으로_바꾸되_선분_이력으로_남긴다() {
        applySeed();
        applyV4();

        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB'"));
        assertEquals("N", jdbc.queryForObject("SELECT ATTR04 FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB' "
                + "AND VALID_TO = " + OPEN_END, String.class));
        Map<String, Object> closed = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB' "
                + "AND VALID_TO < " + OPEN_END);
        assertEquals("Y", closed.get("ATTR04"));
        assertEquals(1, ((Number) closed.get("ROW_VERSION")).intValue());
        Map<String, Object> open = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND CODE = 'THB' "
                + "AND VALID_TO = " + OPEN_END);
        assertEquals(closed.get("VALID_TO"), open.get("VALID_FROM"));
        assertEquals(1, ((Number) open.get("ROW_VERSION")).intValue());
        assertEquals("태국 바트", open.get("NAME"));
        assertEquals("ASIA", open.get("ATTR01"));
        // 환율 수집 Y 는 USD EUR JPY CNY GBP AUD CAD CHF HKD SGD 열 개다.
        assertEquals(10, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'CUR' AND ATTR04 = 'Y' AND VALID_TO = " + OPEN_END));
    }

    @Test
    void V4_는_옛_모양_FX_RATE_행을_삭제하지_않고_닫는다_그리고_다시_적용해도_같다() {
        applySeed();
        jdbc.update("INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME, VALID_TO, ROW_VERSION, CHG_SEQ, ATTR01, ATTR02, ATTR03, ATTR04) "
                + "VALUES ('FX_RATE', 'USD20261008', TIMESTAMP '2026-10-09 09:00:00', 'USD 2026-10-08', " + OPEN_END
                + ", 0, 0, 'USD', '20261008', '1384.51000000', 'KRW')");
        // 이미 새 모양인 행(8자리)은 건드리지 않는다.
        jdbc.update("INSERT INTO TB_MDM_DATA_ITEM (MARU_DATA_ID, CODE, VALID_FROM, NAME, VALID_TO, ROW_VERSION, CHG_SEQ, ATTR01) "
                + "VALUES ('FX_RATE', '20261008', TIMESTAMP '2026-10-09 13:00:00', '2026-10-08', " + OPEN_END + ", 0, 0, '1384.51000000')");

        applyV4();

        assertEquals(2, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE'"));
        Map<String, Object> old = jdbc.queryForMap("SELECT * FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = 'USD20261008'");
        assertEquals(1, ((Number) old.get("ROW_VERSION")).intValue());
        assertEquals("1384.51000000", old.get("ATTR03"));
        assertEquals(1, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = 'USD20261008' "
                + "AND VALID_TO > VALID_FROM AND VALID_TO < " + OPEN_END));
        assertEquals(1, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = 'FX_RATE' AND CODE = '20261008' "
                + "AND VALID_TO = " + OPEN_END + " AND ROW_VERSION = 0"));

        Object before = jdbc.queryForObject("SELECT SUM(ROW_VERSION + VER) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID IN ('FX_RATE', 'CUR')", Object.class);
        int itemsBefore = count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM");
        applyV4();
        assertEquals(itemsBefore, count("SELECT COUNT(*) FROM TB_MDM_DATA_ITEM"));
        assertEquals(before, jdbc.queryForObject("SELECT SUM(ROW_VERSION + VER) FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID IN ('FX_RATE', 'CUR')", Object.class));
        assertEquals(1, ((Number) jdbc.queryForObject("SELECT VER FROM TB_MDM_DATA WHERE MARU_DATA_ID = 'FX_RATE'", Number.class)).intValue());
    }

    /** 카테고리 정의(정규식·대상 칸)를 열린 항목에 직접 적용한 소속 코드. 리졸버는 트랜잭션이 필요해 같은 규칙을 JDBC 로 다시 쓴다. */
    private Set<String> members(String maruDataId, String cateId) {
        Map<String, Object> cate = jdbc.queryForMap("SELECT DEF_EXPR, DEF_TARGET FROM TB_MDM_DATA_CATE WHERE MARU_DATA_ID = ? AND CATE_ID = ?",
                maruDataId, cateId);
        Pattern pattern = Pattern.compile((String) cate.get("DEF_EXPR"));
        String target = (String) cate.get("DEF_TARGET");
        String column = "KEY".equals(target) ? "CODE" : target;
        Set<String> out = new TreeSet<>();
        for (Map<String, Object> row : jdbc.queryForList("SELECT CODE, " + column + " V FROM TB_MDM_DATA_ITEM WHERE MARU_DATA_ID = ? "
                + "AND VALID_TO = " + OPEN_END, maruDataId)) {
            String value = (String) row.get("V");
            if (value != null && pattern.matcher(value).matches()) {
                out.add((String) row.get("CODE"));
            }
        }
        return out;
    }

    private static List<String> attrLabels(Map<String, Object> row) {
        List<String> labels = new ArrayList<>();
        for (int i = 1; i <= 5; i++) {
            labels.add((String) row.get(String.format("ATTR%02d_NAME", i)));
        }
        return labels;
    }
}
