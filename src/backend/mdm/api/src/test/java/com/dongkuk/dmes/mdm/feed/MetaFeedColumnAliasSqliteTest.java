package com.dongkuk.dmes.mdm.feed;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.perf.QueryCountProbe;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.feed.metaFeed.dto.MetaFeedViewRequest;
import com.dongkuk.dmes.mdm.feed.metaFeed.service.MetaFeedService;
import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/**
 * 컬럼 시스템 별칭 매칭(spec 2026-10-03-mdm-column-system-alias-design §2 L1·L3·L4, §4 MDM) — metaFeed view(type=COLUMN) 의
 * {@code params.systemCode}. 표준 물리명이 먼저고, 없을 때만 그 시스템의 {@code TB_MDM_COLUMN_SYSTEM} 별칭(대소문자 무시)으로 찾는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class MetaFeedColumnAliasSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    MetaFeedService service;
    @Autowired
    DataSource dataSource;
    @Autowired
    PlatformTransactionManager tm;
    @Autowired
    EntityManager em;
    @Autowired
    EntityManagerFactory emf;

    private JdbcTemplate jdbc;

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(dataSource);
        MetaRevTestSupport.clear(jdbc);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
    }

    @Test
    void 표준_물리명이_없으면_시스템_별칭으로_찾고_별칭_칸을_싣는다() {
        long col = column("ABS_CHM_RPLN_AMT", "흡수 약품 보충 금액");
        alias(col, "MES", "Abs_Chm_Slp_Amt");

        Map<String, Object> r = view("MES", "abs_chm_slp_amt");

        Map<String, Object> v = value(r, "ABS_CHM_SLP_AMT");
        assertEquals("ABS_CHM_RPLN_AMT", v.get("physName"), "physName 은 표준 물리명 그대로(L4)");
        assertEquals("흡수 약품 보충 금액", v.get("columnName"));
        assertEquals("MES", v.get("matchedSystem"));
        assertEquals("Abs_Chm_Slp_Amt", v.get("systemPhysName"), "저장된 별칭 원문");
    }

    @Test
    void 표준_물리명과_별칭이_겹치면_표준이_이기고_별칭_칸은_null_이다() {
        column("CUS", "고객");
        long other = column("CUST_CD", "고객 코드");
        alias(other, "MES", "CUS");

        Map<String, Object> v = value(view("MES", "CUS"), "CUS");

        assertEquals("CUS", v.get("physName"));
        assertEquals("고객", v.get("columnName"), "별칭 컬럼 CUST_CD 가 아니라 표준 컬럼");
        assertTrue(v.containsKey("matchedSystem") && v.get("matchedSystem") == null, v.toString());
        assertTrue(v.containsKey("systemPhysName") && v.get("systemPhysName") == null, v.toString());
    }

    @Test
    void 같은_별칭이_서로_다른_컬럼을_가리키면_모호해서_없음이다() {
        long a = column("AMB_A", "모호 A");
        long b = column("AMB_B", "모호 B");
        alias(a, "MES", "AMB");
        alias(b, "MES", "amb");

        Map<String, Object> r = view("MES", "AMB");

        assertTrue(items(r).isEmpty(), r.toString());
        assertTrue(failed(r).isEmpty(), "모호는 failed 가 아니라 없음이다: " + r);
    }

    @Test
    void 한_컬럼의_대소문자만_다른_별칭은_모호가_아니고_키와_글자까지_같은_원문을_고른다() {
        long spare = column("SPARE_VAL", "예비 값");
        alias(spare, "MES", "Spare1");
        alias(spare, "MES", "SPARE1");

        Map<String, Object> v = value(view("MES", "SPARE1"), "SPARE1");

        assertEquals("SPARE_VAL", v.get("physName"));
        assertEquals("SPARE1", v.get("systemPhysName"));
    }

    @Test
    void systemCode_가_없거나_비면_별칭을_보지_않는다() {
        long col = column("ABS_CHM_RPLN_AMT", "흡수 약품 보충 금액");
        alias(col, "MES", "ABS_CHM_SLP_AMT");

        assertTrue(items(view(null, "ABS_CHM_SLP_AMT")).isEmpty());
        assertTrue(items(view("  ", "ABS_CHM_SLP_AMT")).isEmpty());
    }

    @Test
    void 다른_시스템의_별칭은_찾지_않는다() {
        long col = column("ABS_CHM_RPLN_AMT", "흡수 약품 보충 금액");
        alias(col, "APS", "ABS_CHM_SLP_AMT");

        assertTrue(items(view("MES", "ABS_CHM_SLP_AMT")).isEmpty());
        assertEquals("APS", value(view("APS", "ABS_CHM_SLP_AMT"), "ABS_CHM_SLP_AMT").get("matchedSystem"));
    }

    @Test
    void 표준_매칭과_별칭_매칭이_한_묶음에_섞여도_각_키로_돌려준다() {
        long std = column("COIL_THK", "코일 두께");
        alias(std, "MES", "THK");
        long wid = column("COIL_WID", "코일 폭");
        alias(wid, "MES", "WID");

        Map<String, Object> r = view("MES", "COIL_THK", "WID", "NO_SUCH");

        assertEquals(List.of("COIL_THK", "WID"), items(r).stream().map(i -> i.get("key")).toList());
        assertNull(value(r, "COIL_THK").get("matchedSystem"));
        assertEquals("COIL_WID", value(r, "WID").get("physName"));
    }

    @Test
    void 시스템_코드_목록이면_앞_코드의_별칭이_이긴다() {
        long mes = column("MES_COL", "MES 쪽 컬럼");
        long mdm = column("MDM_COL", "MDM 쪽 컬럼");
        alias(mes, "MES", "DUAL_KEY");
        alias(mdm, "MDM", "DUAL_KEY");

        Map<String, Object> v = value(view("MES,MDM", "DUAL_KEY"), "DUAL_KEY");
        assertEquals("MES_COL", v.get("physName"));
        assertEquals("MES", v.get("matchedSystem"));

        Map<String, Object> reversed = value(view("MDM,MES", "DUAL_KEY"), "DUAL_KEY");
        assertEquals("MDM_COL", reversed.get("physName"), "순서를 바꾸면 결과도 바뀐다(순서가 우선순위)");
        assertEquals("MDM", reversed.get("matchedSystem"));
    }

    @Test
    void 앞_코드에_없는_키는_다음_코드의_별칭으로_찾는다() {
        long mes = column("MES_ONLY_COL", "MES 컬럼");
        long mdm = column("MDM_ONLY_COL", "MDM 컬럼");
        alias(mes, "MES", "MES_KEY");
        alias(mdm, "MDM", "MDM_KEY");

        Map<String, Object> r = view("MES,MDM", "MDM_KEY", "MES_KEY", "NO_SUCH");

        assertEquals(List.of("MDM_KEY", "MES_KEY"), items(r).stream().map(i -> i.get("key")).toList(), "응답은 요청 키 순서");
        assertEquals("MDM_ONLY_COL", value(r, "MDM_KEY").get("physName"));
        assertEquals("MDM", value(r, "MDM_KEY").get("matchedSystem"));
        assertEquals("MES", value(r, "MES_KEY").get("matchedSystem"));
    }

    @Test
    void 앞_코드에서_모호한_키는_다음_코드로_넘어가지_않고_없음이다() {
        long a = column("AMB_A", "모호 A");
        long b = column("AMB_B", "모호 B");
        long c = column("AMB_C", "MDM 쪽");
        alias(a, "MES", "AMB");
        alias(b, "MES", "AMB");
        alias(c, "MDM", "AMB");

        Map<String, Object> r = view("MES,MDM", "AMB");

        assertTrue(items(r).isEmpty(), "모호한 MES 이름을 MDM 별칭으로 바꿔 답하지 않는다: " + r);
        assertTrue(failed(r).isEmpty(), r.toString());
    }

    @Test
    void 코드_목록의_공백_빈_항목_중복은_무시한다() {
        long mdm = column("MDM_COL", "MDM 쪽 컬럼");
        alias(mdm, "MDM", "MDM_KEY");

        Map<String, Object> v = value(view(" MES , ,MDM,MES ", "MDM_KEY"), "MDM_KEY");
        assertEquals("MDM", v.get("matchedSystem"));
        assertTrue(items(view(" , ", "MDM_KEY")).isEmpty(), "코드가 하나도 없으면 별칭을 보지 않는다");
    }

    @Test
    void 코드_목록_조회의_SQL_문_수도_별칭_키_수와_무관하다() {
        QueryCountProbe probe = new QueryCountProbe(tm, em, emf, "metaFeedAliasList");
        probe.start();
        try {
            Map<Integer, Long> counts = new LinkedHashMap<>();
            for (int n : new int[] {3, 10}) {
                DmeTestSupport.clearDictionary(jdbc);
                List<String> keys = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    long id = column("STD_" + n + "_" + i, "표준 " + n + "_" + i);
                    alias(id, i % 2 == 0 ? "MES" : "MDM", "ALS_" + n + "_" + i);
                    keys.add("ALS_" + n + "_" + i);
                }
                QueryCountProbe.Measured<Map<String, Object>> m =
                        probe.measureInTx("aliasList" + n, () -> view("MES,MDM", keys.toArray(String[]::new)));
                assertEquals(n, items(m.result()).size(), m.result().toString());
                counts.put(n, m.count());
            }
            assertEquals(counts.get(3), counts.get(10), counts::toString);
        } finally {
            probe.stop();
        }
    }

    @Test
    void 키_묶음_조회의_SQL_문_수는_별칭_키_수와_무관하다() {
        QueryCountProbe probe = new QueryCountProbe(tm, em, emf, "metaFeedAlias");
        probe.start();
        try {
            Map<Integer, Long> counts = new LinkedHashMap<>();
            for (int n : new int[] {3, 10}) {
                DmeTestSupport.clearDictionary(jdbc);
                List<String> keys = new ArrayList<>();
                for (int i = 0; i < n; i++) {
                    long id = column("STD_" + n + "_" + i, "표준 " + n + "_" + i);
                    alias(id, "MES", "ALS_" + n + "_" + i);
                    keys.add("ALS_" + n + "_" + i);
                }
                QueryCountProbe.Measured<Map<String, Object>> m = probe.measureInTx("alias" + n, () -> view("MES", keys.toArray(String[]::new)));
                assertEquals(n, items(m.result()).size(), m.result().toString());
                counts.put(n, m.count());
            }
            assertEquals(counts.get(3), counts.get(10), counts::toString);
        } finally {
            probe.stop();
        }
    }

    // ── 도우미 ─────────────────────────────────────────────────────────────

    private long column(String phys, String name) {
        jdbc.update("INSERT INTO TB_MDM_COLUMN (COLUMN_NAME, PHYS_NAME, DOMAIN_ID) VALUES (?, ?, NULL)", name, phys);
        return jdbc.queryForObject("SELECT COLUMN_ID FROM TB_MDM_COLUMN WHERE PHYS_NAME = ?", Long.class, phys);
    }

    private void alias(long columnId, String system, String phys) {
        jdbc.update("INSERT INTO TB_MDM_COLUMN_SYSTEM (COLUMN_ID, SYSTEM_CODE, PHYS_NAME, VER) VALUES (?, ?, ?, 0)", columnId, system, phys);
    }

    private Map<String, Object> view(String systemCode, String... keys) {
        MetaFeedViewRequest request = new MetaFeedViewRequest();
        request.setType("COLUMN");
        request.setSystemCode(systemCode);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String k : keys) {
            rows.add(Map.of("key", k));
        }
        return service.view(request, rows);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> items(Map<String, Object> r) {
        return (List<Map<String, Object>>) r.get("items");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> failed(Map<String, Object> r) {
        return (List<Map<String, Object>>) r.get("failed");
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> value(Map<String, Object> r, String key) {
        for (Map<String, Object> i : items(r)) {
            if (key.equals(i.get("key"))) {
                return (Map<String, Object>) i.get("value");
            }
        }
        throw new AssertionError("키가 없다: " + key + " in " + r);
    }
}
