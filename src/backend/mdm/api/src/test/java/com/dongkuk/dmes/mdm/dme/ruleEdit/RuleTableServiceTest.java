package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_DEFAULT;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW1;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW2;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW3;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.count;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.rowVersion;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleTableService;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RuleAnalyzer;
import kr.dongkuk.maru.mdm.engine.rule.RuleIssue;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleTableServiceTest」 — 카드 ③ 표 저장: DRAFT 행 전체 교체(I8)와 서버가 정하는 seq·발급 번호(I10), 셀 모양
 * 검사(I17), 소유권·충돌은 공통 서비스(I6·I7, 수용 기준 4), 응답 issues = 분석기 결과(I12). ERROR 가 있는 표의 거부는 TSK-08-04
 * {@code RuleTableSaveCheckTest} 가 맡는다(08-04 D10 이 08-02 D3 을 뒤집었다).
 * 시작 상태: QLTY_GRD_JDG VER 1 RELEASED + VER 2 DRAFT(소유자 kim, base 1, VER 1 과 같은 변수·행, LAST_ROW_ID 4).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleTableServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleTableService service;
    @Autowired
    RuleVarTypeResolver resolver;
    @Autowired
    MdmRuleVarRepository varRepository;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
    }

    static Map<String, Object> row(Object rowId, String kind, String cells, String note) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("rowId", rowId);
        m.put("rowKind", kind);
        m.put("cells", cells);
        if (note != null) {
            m.put("note", note);
        }
        return m;
    }

    static RuleEditSaveRequest table(long rowVersion, String hit, List<Map<String, Object>> rows) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("TABLE");
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setVer(2);
        r.setRowVersion(rowVersion);
        r.setHitPolicy(hit);
        r.setRows(rows);
        return r;
    }

    static List<Map<String, Object>> sample() {
        return new ArrayList<>(List.of(row(1, "NORMAL", Q_ROW1, null), row(2, "NORMAL", Q_ROW2, null), row(3, "NORMAL", Q_ROW3, null),
                row(4, "DEFAULT", Q_DEFAULT, null)));
    }

    static String mdm(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private List<Map<String, Object>> stored() {
        return jdbc.queryForList("SELECT ROW_ID, SEQ, ROW_KIND, CELLS, NOTE FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 "
                + "ORDER BY CASE ROW_KIND WHEN 'NORMAL' THEN 0 ELSE 1 END, SEQ, ROW_ID");
    }

    private static List<Integer> ints(List<Map<String, Object>> rows, String key) {
        return rows.stream().map(r -> ((Number) r.get(key)).intValue()).toList();
    }

    // ── TSK-08-04 반려 재작업(1회차) RR11 — 레거시 문자열 ast 셀을 되돌려 보낸 TABLE 저장 ──

    @Test
    void 레거시_문자열_ast_행을_그대로_되돌려도_TABLE_저장이_성공하고_객체_ast_가_된다() {
        DmeTestSupport.rule(jdbc, "WGT_CALC2", "코일 중량 산출 재저장", "DERIVE", "CREATED");
        DmeTestSupport.pending(jdbc, "WGT_CALC2", 1, "DRAFT", "kim", null, null);
        DmeTestSupport.var(jdbc, "WGT_CALC2", 1, 1, "RESULT", "Expression", "OUT_V", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "WGT_CALC2", 1, 1, 1, "NORMAL", "{\"1\":{\"expr\":\"1 + 1\",\"ast\":\"{\\\"type\\\":\\\"X\\\"}\"}}");
        String legacyCells = jdbc.queryForObject(
                "SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'WGT_CALC2' AND VER = 1 AND ROW_ID = 1", String.class);
        assertTrue(legacyCells.contains("\"ast\":\""), legacyCells);

        RuleEditSaveRequest req = new RuleEditSaveRequest();
        req.setPart("TABLE");
        req.setMaruRuleId("WGT_CALC2");
        req.setVer(1);
        req.setRowVersion(0L);
        req.setRows(List.of(row(1, "NORMAL", legacyCells, null)));
        RuleEditSaveResult r = service.save(req);
        assertEquals(1L, r.getRowVersion());

        String savedCells = jdbc.queryForObject(
                "SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'WGT_CALC2' AND VER = 1 AND ROW_ID = 1", String.class);
        assertTrue(savedCells.contains("\"ast\":{"), savedCells);
        assertFalse(savedCells.contains("\"ast\":\""), savedCells);
    }

    @Test
    void 순서를_바꿔_저장하면_seq_가_보낸_순서대로_1부터_매겨지고_row_id_는_그대로다() {
        List<Map<String, Object>> rows = List.of(row(3, "NORMAL", Q_ROW3, null), row(1, "NORMAL", Q_ROW1, null), row(2, "NORMAL", Q_ROW2, null),
                row(4, "DEFAULT", Q_DEFAULT, null));
        RuleEditSaveResult r = service.save(table(0, "FIRST", rows));

        List<Map<String, Object>> s = stored();
        assertEquals(List.of(3, 1, 2, 4), ints(s, "ROW_ID"));
        assertEquals(List.of(1, 2, 3, 0), ints(s, "SEQ"));
        assertEquals(1L, r.getRowVersion());
        assertEquals(1L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
        assertEquals(Map.of(), r.getRowIdMap());
        assertEquals(List.of(3, 1, 2, 4), r.getRows().stream().map(m -> ((Number) m.get("rowId")).intValue()).toList());
        assertEquals(List.of(1, 2, 3, 0), r.getRows().stream().map(m -> ((Number) m.get("seq")).intValue()).toList());
    }

    @Test
    void 새_행의_음수_임시_ID_는_발급_번호로_바뀌고_응답에_대응표를_싣는다() {
        List<Map<String, Object>> rows = sample();
        rows.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"3\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},"
                + "\"5\":{\"val\":\"0.5\"}}", "새 행"));
        rows.add(0, row(-2.0, "NORMAL", "{\"1\":{\"op\":\"LT\",\"left\":\"1.6\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},"
                + "\"5\":{\"val\":\"0.5\"}}", null));

        RuleEditSaveResult r = service.save(table(0, "FIRST", rows));

        assertEquals(Map.of("-1", 6, "-2", 5), r.getRowIdMap(), "새 행은 요청 순서대로 한 번에 발급한다");
        assertEquals(6, jdbc.queryForObject("SELECT LAST_ROW_ID FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", Integer.class));
        List<Map<String, Object>> s = stored();
        assertEquals(List.of(5, 1, 2, 3, 6, 4), ints(s, "ROW_ID"));
        assertEquals(List.of(1, 2, 3, 4, 5, 0), ints(s, "SEQ"));
        assertEquals("새 행", s.get(4).get("NOTE"));
    }

    @Test
    void 지운_번호는_다시_쓰지_않는다() {
        List<Map<String, Object>> rows = sample();
        rows.remove(1);
        service.save(table(0, "FIRST", rows));
        List<Map<String, Object>> again = new ArrayList<>(rows);
        again.add(2, row(-1, "NORMAL", Q_ROW2, null));
        RuleEditSaveResult r = service.save(table(1, "FIRST", again));
        assertEquals(Map.of("-1", 5), r.getRowIdMap());
        assertEquals(List.of(1, 3, 5, 4), ints(stored(), "ROW_ID"));
    }

    @Test
    void 행의_셀은_정규화해_저장하고_숫자_텍스트와_설명은_그대로_둔다() {
        List<Map<String, Object>> rows = sample();
        String edited = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.60\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
                + "\"3\":{\"op\":\"IN\",\"list\":[\"C\",\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";
        rows.set(0, row(1, "NORMAL", edited, "메모"));
        service.save(table(0, "FIRST", rows));
        Map<String, Object> first = stored().get(0);
        assertEquals(edited.replace("[\"C\",\"A\"]", "[\"A\",\"C\"]"), first.get("CELLS"), "목록만 정렬하고 1.60 은 다시 쓰지 않는다(08-04 I6·I9)");
        assertEquals("메모", first.get("NOTE"));
    }

    @Test
    void 기본_행은_하나까지만_받는다() {
        List<Map<String, Object>> rows = sample();
        rows.add(row(-1, "DEFAULT", Q_DEFAULT, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", rows))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2), "저장 실패는 row_version 을 올리지 않는다(롤백)");
    }

    @Test
    void 산출_룰에는_기본_행을_받지_않고_적중_정책을_비운다() {
        DmeTestSupport.rule(jdbc, "CALC", "산출", "DERIVE", "CREATED");
        DmeTestSupport.pending(jdbc, "CALC", 1, "DRAFT", "kim", null, null);
        DmeTestSupport.var(jdbc, "CALC", 1, 1, "COND", "1", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "CALC", 1, 2, "RESULT", "Value", "OUT", 1, "NUMBER");
        RuleEditSaveRequest r = table(0, null, List.of(row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"val\":\"2\"}}", null),
                row(-2, "DEFAULT", "{\"2\":{\"val\":\"0\"}}", null)));
        r.setMaruRuleId("CALC");
        r.setVer(1);
        assertEquals("INVALID_VALUE", mdm(() -> service.save(r)));
        r.setRows(List.of(row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"val\":\"2\"}}", null)));
        r.setHitPolicy("FIRST");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(r)));
        r.setHitPolicy(null);
        service.save(r);
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'CALC'"));
    }

    @Test
    void 그_DRAFT_에_없던_row_id_와_중복_0_소수_ID_는_거부한다() {
        for (Object bad : List.of(9, 0, 1.5)) {
            List<Map<String, Object>> rows = sample();
            rows.add(row(bad, "NORMAL", Q_ROW1, null));
            assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", rows))), String.valueOf(bad));
        }
        List<Map<String, Object>> dup = sample();
        dup.add(row(1, "NORMAL", Q_ROW2, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", dup))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 행_종류와_셀_모양을_검사한다() {
        List<Map<String, Object>> kind = sample();
        kind.set(0, row(1, "OTHER", Q_ROW1, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", kind))));
        List<Map<String, Object>> cells = sample();
        cells.set(0, row(1, "NORMAL", "{\"9\":{\"op\":\"NA\"}}", null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", cells))));
        List<Map<String, Object>> number = sample();
        number.set(0, row(1, "NORMAL", "{\"2\":{\"op\":\"GT\",\"left\":1000}}", null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, "FIRST", number))));
        assertEquals(List.of(1, 2, 3, 4), ints(stored(), "ROW_ID"));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 적중_정책을_저장하고_판정_룰은_다섯_중_하나여야_한다() {
        service.save(table(0, "UNIQUE", sample()));
        assertEquals("UNIQUE", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(1, "RANDOM", sample()))));
        assertEquals("REQUIRED_VALUE", mdm(() -> service.save(table(1, null, sample()))));
        assertEquals("UNIQUE", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
    }

    @Test
    void 변수_행은_바뀌지_않는다() {
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID");
        List<Map<String, Object>> rows = sample();
        rows.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"LT\",\"left\":\"1\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},"
                + "\"5\":{\"val\":\"0.5\"}}", null));
        service.save(table(0, "UNIQUE", rows));
        assertEquals(before, jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID"));
    }

    @Test
    void 비소유자의_표_저장은_MDM003_이고_아무것도_바뀌지_않는다() {
        currentUser.set("lee", STEWARD);
        List<Map<String, Object>> rows = sample();
        rows.remove(0);
        assertEquals("MDM003", mdm(() -> service.save(table(0, "UNIQUE", rows))));
        assertEquals(List.of(1, 2, 3, 4), ints(stored(), "ROW_ID"));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
        assertEquals("FIRST", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
    }

    @Test
    void row_version_이_다르면_MDM001_이다() {
        assertEquals("MDM001", mdm(() -> service.save(table(7, "FIRST", sample()))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void RELEASED_버전은_저장하지_않는다() {
        RuleEditSaveRequest r = table(0, "FIRST", sample());
        r.setVer(1);
        assertTrue(List.of("MDM002", "MDM003").contains(mdm(() -> service.save(r))));
    }

    @Test
    void 외부_원천_룰은_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        RuleEditSaveRequest r = table(0, "FIRST", List.of());
        r.setMaruRuleId("EXT_JDG");
        r.setVer(1);
        assertEquals("BUSINESS_ERROR", mdm(() -> service.save(r)));
        assertEquals(0L, rowVersion(jdbc, "EXT_JDG", 1));
    }

    @Test
    void 응답_issues_는_저장한_정의의_분석기_결과와_같다() {
        List<Map<String, Object>> rows = sample();
        rows.set(1, row(2, "NORMAL", Q_ROW2.replace("[\"B\"]", "[\"A\",\"B\"]"), null));

        RuleEditSaveResult r = service.save(table(0, "FIRST", rows));

        assertEquals(4, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        List<MdmRuleVar> vars = varRepository.findAll().stream()
                .filter(v -> v.getMaruRuleId().equals("QLTY_GRD_JDG") && v.getVer() == 2)
                .sorted(Comparator.comparing(MdmRuleVar::getVarKind).thenComparing(MdmRuleVar::getSeq)).toList();
        List<StoredRow> storedRows = stored().stream().map(m -> new StoredRow(((Number) m.get("ROW_ID")).intValue(),
                ((Number) m.get("SEQ")).intValue(), (String) m.get("ROW_KIND"), (String) m.get("CELLS"))).toList();
        List<RuleIssue> expected = RuleAnalyzer.analyze(RuleAnalysisInputMapper.toAnalysisRule("QLTY_GRD_JDG", "DECISION", "FIRST",
                resolver.resolve("QLTY_GRD_JDG", 2, vars), storedRows));
        List<Map<String, Object>> expectedMaps = expected.stream().map(RuleTableServiceTest::issueMap).toList();
        assertEquals(expectedMaps, r.getIssues());
        assertTrue(r.getIssues().stream().anyMatch(i -> "OVERLAP".equals(i.get("code")) && "WARNING".equals(i.get("severity"))
                && List.of(1, 2).equals(i.get("rowIds"))), "FIRST 표의 1·2행 겹침은 경고: " + r.getIssues());
    }

    /** 응답 이슈 모양 — 값이 없는 칸(varId·lower·upper)은 싣지 않는다(TS 이슈 JSON 과 같은 모양). */
    static Map<String, Object> issueMap(RuleIssue i) {
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("code", i.code().name());
        m.put("severity", i.severity().name());
        m.put("rowIds", i.rowIds());
        if (i.varId() != null) {
            m.put("varId", i.varId());
        }
        if (i.lower() != null) {
            m.put("lower", i.lower());
        }
        if (i.upper() != null) {
            m.put("upper", i.upper());
        }
        m.put("message", i.message());
        return m;
    }
}
