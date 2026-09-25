package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_DEFAULT;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW1;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW2;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW3;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.stream.IntStream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-04 design §3.2 「RuleValueTestServiceTest」 — action execute(값 테스트). 저장된 버전(VERSION)·요청 본문(BODY) 두 정의를
 * {@code MdmRuleEngine} + 요청마다 만든 {@code DefinitionLookup} 으로 판정하고 원장에 한 줄도 쓰지 않는다(I19·I20). 키 없음과 NULL 을
 * 가르고(I21), 깨진 셀의 행은 빼며 빠진 셀은 NA 로 보고 경고한다(I22). 상한은 같으면 통과·넘으면 MDM021(I23). 케이스 비교(I24).
 * 시작 상태: QLTY_GRD_JDG VER 1 RELEASED(FIRST) + VER 2 DRAFT(소유자 kim, 같은 정의), 사전에 BASE_FCT(NUMBER) 추가.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleValueTestServiceTest {

    @org.junit.jupiter.api.io.TempDir
    static Path tempDir;

    @Autowired
    RuleEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-value-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.column(jdbc, "BASE_FCT", DmeTestSupport.domain(jdbc, "BASE_FCT_D", "QTY", "NUMBER", 2));
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
    }

    // ------------------------------------------------------------------ 요청 도우미

    private static RuleTestRequest version(int ver, String inputJson) {
        RuleTestRequest r = new RuleTestRequest();
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setTarget("VERSION");
        r.setVer(ver);
        r.setInputJson(inputJson);
        return r;
    }

    private static RuleTestRequest body(String hitPolicy, String inputJson, List<Map<String, Object>> rows) {
        RuleTestRequest r = new RuleTestRequest();
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setTarget("BODY");
        r.setVer(2);
        r.setHitPolicy(hitPolicy);
        r.setInputJson(inputJson);
        r.setRows(rows);
        return r;
    }

    /** grids 바인딩처럼 숫자는 Double 로 싣는다. */
    private static Map<String, Object> row(int rowId, String kind, String cells) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", (double) rowId);
        m.put("rowKind", kind);
        m.put("cells", cells);
        return m;
    }

    private static List<Map<String, Object>> sampleRows() {
        return new ArrayList<>(List.of(row(1, "NORMAL", Q_ROW1), row(2, "NORMAL", Q_ROW2), row(3, "NORMAL", Q_ROW3), row(4, "DEFAULT", Q_DEFAULT)));
    }

    private static final String A_INPUT = "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}";

    /** 06 표 여섯(값 테스트가 닿을 수 있는 것)과 TB_MDM_RULE 카운터·row_version 전부. */
    private String ledger() {
        StringBuilder sb = new StringBuilder();
        for (String t : List.of("TB_MDM_RULE", "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW", "TB_MDM_RULE_TEST_CASE", "TB_MDM_RULE_SET")) {
            sb.append(t).append('=').append(jdbc.queryForList("SELECT * FROM " + t + " ORDER BY 1, 2")).append('\n');
        }
        return sb.toString();
    }

    private static List<Integer> ids(List<Map<String, Object>> list, String key) {
        return list.stream().map(m -> (Integer) m.get(key)).toList();
    }

    private static String codes(List<Map<String, Object>> list) {
        return list.stream().map(m -> String.valueOf(m.get("code"))).collect(Collectors.joining(","));
    }

    private static void assertRejected(Runnable call) {
        BusinessException e = assertThrows(BusinessException.class, call::run);
        assertEquals("MDM021", e.getErrors().get(0).code(), e.getMessage());
    }

    // ------------------------------------------------------------------ ① VERSION

    @Test
    void 저장된_버전을_06_샘플_케이스대로_판정한다() {
        RuleTestResult r = service.runTest(version(1, A_INPUT));

        assertEquals("OK", r.getOutcome(), String.valueOf(r.getErrors()));
        assertEquals("VERSION", r.getTarget());
        assertEquals(1, r.getVer());
        assertEquals("2026-06-15 09:00:00", r.getEvalTs());
        assertEquals("A", r.getResults().get("QLTY_GRD"));
        assertEquals("1.05", r.getResults().get("PRC_FCT"), "숫자 결과는 toPlainString 문자열");
        assertEquals(List.of(1), ids(r.getHits(), "rowId"));
        assertEquals(List.of("COIL_THK", "COIL_WID", "SURF_GRD"), r.getContract().get("always"));
    }

    // ------------------------------------------------------------------ ② BODY · 원장 무변경

    @Test
    void 본문_정의는_새_행과_미완성_행도_판정하고_원장에_쓰지_않는다() {
        String before = ledger();
        List<Map<String, Object>> rows = sampleRows();
        rows.add(0, row(-1, "NORMAL", "{\"1\":{\"op\":\"EQ\",\"left\":\"1.8\"},\"4\":{\"val\":\"Z\"},\"5\":{\"val\":\"2\"}}"));

        RuleTestResult r = service.runTest(body("FIRST", A_INPUT, rows));
        RuleTestResult v = service.runTest(version(2, A_INPUT));

        assertEquals("OK", r.getOutcome(), String.valueOf(r.getErrors()));
        assertEquals("Z", r.getResults().get("QLTY_GRD"), "편집 중인 새 행(임시 번호 -1)이 먼저 적중한다");
        assertEquals(List.of(-1), ids(r.getHits(), "rowId"));
        assertEquals("OK", v.getOutcome());
        assertEquals(before, ledger(), "값 테스트는 원장에 한 줄도 쓰지 않는다(카운터·row_version 포함)");
    }

    // ------------------------------------------------------------------ ③ 키 없음과 NULL

    /** 결과 PRC_FCT 를 식 열로 바꾸고 3행이 BASE_FCT 를 읽게 한다 — 3행만 BASE_FCT 필수(06:1324). */
    private List<Map<String, Object>> baseFctRows() {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET DISP_TYPE = 'Expression' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5");
        List<Map<String, Object>> rows = sampleRows();
        rows.set(2, row(3, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"2.5\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NOT_IN\",\"list\":[\"C\"]},"
                + "\"4\":{\"val\":\"B\"},\"5\":{\"expr\":\"ROUND(BASE_FCT * 0.98, 2)\"}}"));
        return rows;
    }

    @Test
    void 키를_보내지_않으면_MISSING_KEY_이고_NULL_을_보내면_필수_변수는_REQUIRED_NULL_이다() {
        List<Map<String, Object>> rows = baseFctRows();

        RuleTestResult ok = service.runTest(body("FIRST", "{\"COIL_THK\":\"3\",\"COIL_WID\":\"1\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1.00\"}", rows));
        RuleTestResult missing = service.runTest(body("FIRST", "{\"COIL_THK\":\"3\",\"SURF_GRD\":\"A\",\"BASE_FCT\":\"1\"}", rows));
        RuleTestResult rowMissing = service.runTest(body("FIRST", "{\"COIL_THK\":\"3\",\"COIL_WID\":\"1\",\"SURF_GRD\":\"A\"}", rows));
        RuleTestResult nulled = service.runTest(body("FIRST", "{\"COIL_THK\":\"3\",\"COIL_WID\":\"1\",\"SURF_GRD\":\"A\",\"BASE_FCT\":null}", rows));

        assertEquals("OK", ok.getOutcome(), String.valueOf(ok.getErrors()));
        assertEquals("0.98", ok.getResults().get("PRC_FCT"));
        assertEquals(List.of("BASE_FCT"), ((List<?>) ((Map<?, ?>) ((List<?>) ok.getContract().get("rows")).get(2)).get("required")));
        assertEquals("ERROR", missing.getOutcome());
        assertEquals("MISSING_KEY", codes(missing.getErrors()));
        assertEquals("COIL_WID", missing.getErrors().get(0).get("name"));
        assertEquals("MISSING_KEY", codes(rowMissing.getErrors()), "행 필수 키가 없어도 MISSING_KEY");
        assertEquals("ERROR", nulled.getOutcome());
        assertEquals("REQUIRED_NULL", codes(nulled.getErrors()), "키가 있고 값이 null 이면 REQUIRED_NULL");
        assertEquals("BASE_FCT", nulled.getErrors().get(0).get("name"));
        assertNull(nulled.getTrace(), "판정 오류면 trace 가 없다(G4)");
    }

    // ------------------------------------------------------------------ ④ 트레이스

    @Test
    void 트레이스는_행마다_첫_거짓_셀을_준다() {
        RuleTestResult r = service.runTest(version(1, "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"900\",\"SURF_GRD\":\"A\"}"));

        assertEquals("OK", r.getOutcome(), String.valueOf(r.getErrors()));
        assertTrue(r.isDefaultApplied());
        assertEquals("C", r.getResults().get("QLTY_GRD"));
        Map<Integer, Object> firstFalse = new LinkedHashMap<>();
        r.getTrace().forEach(t -> firstFalse.put((Integer) t.get("rowId"), t.get("firstFalseVarId")));
        assertEquals(2, firstFalse.get(1));
        assertEquals(1, firstFalse.get(3));
    }

    // ------------------------------------------------------------------ ⑤⑥ 깨진 셀·빠진 셀

    @Test
    void 깨진_셀이_든_행은_판정에서_빼고_셀_오류로_돌려준다() {
        List<Map<String, Object>> rows = sampleRows();
        rows.add(0, row(-1, "NORMAL", "{\"1\":{\"op\":\"EQ\",\"left\":\"abc\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"Z\"},\"5\":{\"val\":\"2\"}}"));

        RuleTestResult r = service.runTest(body("FIRST", A_INPUT, rows));

        assertEquals("OK", r.getOutcome(), String.valueOf(r.getErrors()));
        assertEquals(List.of(-1), r.getSkippedRows());
        assertEquals(List.of(-1), ids(r.getCellErrors(), "rowId"));
        assertEquals(1, r.getCellErrors().get(0).get("varId"));
        assertEquals("TYPE_LITERAL", r.getCellErrors().get(0).get("code"));
        assertFalse(ids(r.getTrace(), "rowId").contains(-1), "깨진 행은 판정하지 않는다");
        assertEquals("A", r.getResults().get("QLTY_GRD"), "나머지 행으로 판정한다");
    }

    @Test
    void 빠진_셀은_NA_로_판정하고_경고한다() {
        List<Map<String, Object>> rows = sampleRows();
        rows.add(0, row(-1, "NORMAL", "{\"1\":{\"op\":\"EQ\",\"left\":\"1.8\"},\"4\":{\"val\":\"Z\"},\"5\":{\"val\":\"2\"}}"));

        RuleTestResult r = service.runTest(body("FIRST", A_INPUT, rows));

        assertEquals(List.of(-1), ids(r.getHits(), "rowId"), "빠진 조건 셀 2·3 은 무관으로 본다");
        List<String> warned = r.getWarnings().stream().filter(w -> "MISSING_CELL_AS_NA".equals(w.get("code")))
                .map(w -> w.get("rowId") + ":" + w.get("varId")).toList();
        assertEquals(List.of("-1:2", "-1:3"), warned);
    }

    // ------------------------------------------------------------------ ⑦ UNIQUE 다중 적중

    @Test
    void UNIQUE_다중_적중은_판정_오류다() {
        List<Map<String, Object>> rows = sampleRows();
        rows.add(0, row(-1, "NORMAL", "{\"1\":{\"op\":\"EQ\",\"left\":\"1.8\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"Z\"},\"5\":{\"val\":\"2\"}}"));

        RuleTestResult r = service.runTest(body("UNIQUE", A_INPUT, rows));

        assertEquals("ERROR", r.getOutcome());
        assertEquals("UNIQUE_MULTIPLE_HITS", codes(r.getErrors()));
    }

    // ------------------------------------------------------------------ ⑧ 케이스

    private void testCase(int id, String name, String input, String expected) {
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, ROW_VERSION) VALUES (?, ?, ?, ?, ?, 0)",
                "QLTY_GRD_JDG", id, name, input, expected);
    }

    @Test
    void 케이스를_같은_정의로_돌려_결과_변수_타입으로_견준다() {
        testCase(1, "A급", A_INPUT, "{\"QLTY_GRD\":\"A\",\"PRC_FCT\":1.050,\"hit\":1}");
        testCase(2, "틀린 기대", A_INPUT, "{\"QLTY_GRD\":\"B\",\"PRC_FCT\":\"1.05\",\"hit\":1}");
        testCase(3, "돌려 보기만", A_INPUT, null);
        testCase(4, "모르는 키", A_INPUT, "{\"NO_SUCH\":1}");
        testCase(5, "기본 행", "{\"COIL_THK\":\"9\",\"COIL_WID\":\"1\",\"SURF_GRD\":\"C\"}", "{\"QLTY_GRD\":\"C\",\"PRC_FCT\":0.9,\"hit\":4}");
        testCase(6, "판정 오류", "{\"COIL_THK\":\"1.8\"}", "{\"hit\":1}");
        testCase(7, "적중 틀림", A_INPUT, "{\"hit\":2}");
        RuleTestRequest req = version(1, A_INPUT);
        req.setRunCases(true);

        RuleTestResult r = service.runTest(req);

        Map<Integer, Map<String, Object>> byId = new LinkedHashMap<>();
        r.getCases().forEach(c -> byId.put((Integer) c.get("caseId"), c));
        assertEquals(List.of(1, 2, 3, 4, 5, 6, 7), List.copyOf(byId.keySet()));
        assertEquals(true, byId.get(1).get("pass"), "1.050 과 1.05 는 BigDecimal compareTo 로 같다: " + byId.get(1));
        assertEquals(false, byId.get(2).get("pass"));
        assertEquals("QLTY_GRD", mismatchKeys(byId.get(2)));
        assertNull(byId.get(3).get("pass"), "기대값이 없으면 돌려 보기만");
        assertEquals("OK", byId.get(3).get("outcome"));
        assertEquals(1, byId.get(3).get("hit"));
        assertEquals(false, byId.get(4).get("pass"));
        assertEquals("NO_SUCH", mismatchKeys(byId.get(4)), "기대에 모르는 키가 있으면 실패");
        assertEquals(true, byId.get(5).get("pass"), "기본 행 적용은 기본 행 row_id: " + byId.get(5));
        assertEquals(4, byId.get(5).get("hit"));
        assertEquals(false, byId.get(6).get("pass"));
        assertEquals("ERROR", byId.get(6).get("outcome"));
        assertEquals(false, byId.get(7).get("pass"));
        assertEquals("hit", mismatchKeys(byId.get(7)));
    }

    @SuppressWarnings("unchecked")
    private static String mismatchKeys(Map<String, Object> c) {
        return ((List<Map<String, Object>>) c.get("mismatches")).stream().map(m -> String.valueOf(m.get("key"))).collect(Collectors.joining(","));
    }

    // ------------------------------------------------------------------ ⑨ 상한

    private static String paddedInput(int length) {
        String base = A_INPUT;
        return "{" + " ".repeat(length - base.length()) + base.substring(1);
    }

    private static String keysInput(int keys) {
        return IntStream.rangeClosed(1, keys).mapToObj(i -> "\"K" + i + "\":\"1\"").collect(Collectors.joining(",", "{", "}"));
    }

    /** 조건 셋·결과 둘이 다 찬 행을 JSON 공백으로 정확히 {@code length} 자로 늘린다. */
    private static String paddedCells(int thk, int length) {
        String cells = "{\"1\":{\"op\":\"EQ\",\"left\":\"" + thk + "\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1\"}}";
        return length <= cells.length() ? cells : "{" + " ".repeat(length - cells.length()) + cells.substring(1);
    }

    private static List<Map<String, Object>> manyRows(int count, int cellsLength) {
        List<Map<String, Object>> rows = new ArrayList<>();
        for (int i = 1; i <= count; i++) {
            rows.add(row(-i, "NORMAL", paddedCells(i, cellsLength)));
        }
        return rows;
    }

    @Test
    void 입력_JSON_길이와_키_수는_상한과_같으면_통과하고_넘으면_거부한다() {
        service.runTest(version(1, paddedInput(RuleLimits.MAX_INPUT_JSON_CHARS)));
        assertRejected(() -> service.runTest(version(1, paddedInput(RuleLimits.MAX_INPUT_JSON_CHARS + 1))));
        service.runTest(version(1, keysInput(RuleLimits.MAX_INPUT_KEYS)));
        assertRejected(() -> service.runTest(version(1, keysInput(RuleLimits.MAX_INPUT_KEYS + 1))));
    }

    @Test
    void 본문_행_수와_셀_길이는_상한과_같으면_통과하고_넘으면_거부한다() {
        service.runTest(body("FIRST", A_INPUT, manyRows(RuleLimits.MAX_ROWS, 0)));
        assertRejected(() -> service.runTest(body("FIRST", A_INPUT, manyRows(RuleLimits.MAX_ROWS + 1, 0))));
        service.runTest(body("FIRST", A_INPUT, manyRows(1, RuleLimits.MAX_ROW_CELLS_CHARS)));
        assertRejected(() -> service.runTest(body("FIRST", A_INPUT, manyRows(1, RuleLimits.MAX_ROW_CELLS_CHARS + 1))));
        int rowsForTotal = RuleLimits.MAX_TOTAL_CELLS_CHARS / RuleLimits.MAX_ROW_CELLS_CHARS;
        List<Map<String, Object>> total = manyRows(rowsForTotal, RuleLimits.MAX_ROW_CELLS_CHARS);
        assertEquals(RuleLimits.MAX_TOTAL_CELLS_CHARS, rowsForTotal * RuleLimits.MAX_ROW_CELLS_CHARS, "합 상한이 행 상한의 배수여야 이 사례가 경계다");
        service.runTest(body("FIRST", A_INPUT, total));
        List<Map<String, Object>> over = manyRows(rowsForTotal, RuleLimits.MAX_ROW_CELLS_CHARS);
        over.set(rowsForTotal - 1, row(-rowsForTotal, "NORMAL", paddedCells(rowsForTotal, RuleLimits.MAX_ROW_CELLS_CHARS - 1)));
        over.add(row(-(rowsForTotal + 1), "NORMAL", "{}")); // 합 = 상한 - 1 + 2
        assertRejected(() -> service.runTest(body("FIRST", A_INPUT, over)));
    }

    // ------------------------------------------------------------------ ⑩ 권한·버전

    @Test
    void 비소유_담당자도_DRAFT_와_RELEASED_버전을_판정한다() {
        currentUser.set("lee", STEWARD);

        assertEquals("OK", service.runTest(version(1, A_INPUT)).getOutcome());
        assertEquals("OK", service.runTest(version(2, A_INPUT)).getOutcome());
    }

    @Test
    void 없는_버전과_모르는_대상은_거부한다() {
        assertThrows(BusinessException.class, () -> service.runTest(version(9, A_INPUT)));
        RuleTestRequest bad = version(1, A_INPUT);
        bad.setTarget("CASE");
        assertThrows(BusinessException.class, () -> service.runTest(bad));
        assertThrows(BusinessException.class, () -> service.runTest(version(1, "[1,2]")), "입력은 JSON 객체");
    }
}
