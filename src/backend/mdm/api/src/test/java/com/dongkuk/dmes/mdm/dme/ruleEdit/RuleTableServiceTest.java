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
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper;
import com.dongkuk.dmes.mdm.common.rule.RuleAnalysisInputMapper.StoredRow;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleTableService;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.dongkuk.dmes.mdm.repository.MdmRuleVarRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
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
    RuleEditService editService;
    @Autowired
    RuleVarTypeResolver resolver;
    @Autowired
    MdmRuleVarRepository varRepository;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    MdmEvaluator evaluator;

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

    /** 적중 정책은 싣지 않는다 — 비우면 저장된 값을 검사 입력으로 쓴다(D-133). 정책을 바꾸는 시험은 {@code setHitPolicy} 를 더한다. */
    static RuleEditSaveRequest table(long rowVersion, List<Map<String, Object>> rows) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("TABLE");
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setVer(2);
        r.setRowVersion(rowVersion);
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
        RuleEditSaveResult r = service.save(table(0, rows));

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

        RuleEditSaveResult r = service.save(table(0, rows));

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
        service.save(table(0, rows));
        List<Map<String, Object>> again = new ArrayList<>(rows);
        again.add(2, row(-1, "NORMAL", Q_ROW2, null));
        RuleEditSaveResult r = service.save(table(1, again));
        assertEquals(Map.of("-1", 5), r.getRowIdMap());
        assertEquals(List.of(1, 3, 5, 4), ints(stored(), "ROW_ID"));
    }

    @Test
    void 행의_셀은_정규화해_저장하고_숫자_텍스트와_설명은_그대로_둔다() {
        List<Map<String, Object>> rows = sample();
        String edited = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"1.60\",\"right\":\"2.5\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
                + "\"3\":{\"op\":\"IN\",\"list\":[\"C\",\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";
        rows.set(0, row(1, "NORMAL", edited, "메모"));
        service.save(table(0, rows));
        Map<String, Object> first = stored().get(0);
        assertEquals(edited.replace("[\"C\",\"A\"]", "[\"A\",\"C\"]"), first.get("CELLS"), "목록만 정렬하고 1.60 은 다시 쓰지 않는다(08-04 I6·I9)");
        assertEquals("메모", first.get("NOTE"));
    }

    @Test
    void 기본_행은_하나까지만_받는다() {
        List<Map<String, Object>> rows = sample();
        rows.add(row(-1, "DEFAULT", Q_DEFAULT, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, rows))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2), "저장 실패는 row_version 을 올리지 않는다(롤백)");
    }

    @Test
    void 산출_룰에는_기본_행을_받지_않고_적중_정책을_비운다() {
        DmeTestSupport.rule(jdbc, "CALC", "산출", "DERIVE", "CREATED");
        DmeTestSupport.pending(jdbc, "CALC", 1, "DRAFT", "kim", null, null);
        DmeTestSupport.var(jdbc, "CALC", 1, 1, "COND", "1", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "CALC", 1, 2, "RESULT", "Value", "OUT", 1, "NUMBER");
        RuleEditSaveRequest r = table(0, List.of(row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"val\":\"2\"}}", null),
                row(-2, "DEFAULT", "{\"2\":{\"val\":\"0\"}}", null)));
        r.setMaruRuleId("CALC");
        r.setVer(1);
        assertEquals("INVALID_VALUE", mdm(() -> service.save(r)));
        r.setRows(List.of(row(-1, "NORMAL", "{\"1\":{\"op\":\"GE\",\"left\":\"1\"},\"2\":{\"val\":\"2\"}}", null)));
        // 산출 룰에는 적중 정책이 없다 — 값을 실으면 거부한다(D-133, 원래 표 저장 규칙 그대로).
        r.setHitPolicy("FIRST");
        assertEquals("INVALID_VALUE", mdm(() -> service.save(r)));
        r.setHitPolicy(null);
        service.save(r);
        assertEquals(1, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'CALC'"));
    }

    // ── D-133 적중 정책은 표 저장이 함께 저장한다 ──

    private String storedHit() {
        return jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class);
    }

    private static RuleEditSaveRequest withHit(String hit) {
        RuleEditSaveRequest r = table(0, sample());
        r.setHitPolicy(hit);
        return r;
    }

    /** 거부 이슈 코드(details 첫 행은 MDM 코드). */
    private static List<String> rejectCodes(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals("MDM021", e.getErrors().get(0).code(), e.getMessage());
        return e.getErrors().stream().skip(1).map(ErrorDetail::code).toList();
    }

    @Test
    void 적중_정책을_행과_같은_트랜잭션에_저장하고_COLLECT_가_아니면_기본_집계를_비운다() {
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND COLLECT_AGG = 'LIST'"),
                "JDBC 픽스처 변수는 DB 기본 집계 LIST 를 갖는다");

        RuleEditSaveResult r = service.save(withHit("UNIQUE"));

        assertEquals(1L, r.getRowVersion());
        assertEquals("UNIQUE", storedHit());
        assertEquals(0, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND COLLECT_AGG IS NOT NULL"),
                "정책이 COLLECT 가 아니면 기본 집계(LIST)를 비운다 — 열 설정 검사가 막지 않게");
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1 AND COLLECT_AGG = 'LIST'"),
                "다른 버전은 건드리지 않는다");
    }

    @Test
    void 정책이_같거나_비면_정책과_변수를_쓰지_않는다() {
        service.save(withHit("FIRST"));
        service.save(table(1, sample()));
        assertEquals("FIRST", storedHit());
        assertEquals(5, count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND COLLECT_AGG = 'LIST'"),
                "정책이 그대로면 기본 집계도 건드리지 않는다(정책을 바꿀 때만 쓴다)");
    }

    @Test
    void 모르는_정책과_비소유자의_정책_변경은_거부하고_아무것도_바꾸지_않는다() {
        assertEquals("INVALID_VALUE", mdm(() -> service.save(withHit("LAST"))));
        currentUser.set("lee", STEWARD);
        assertEquals("MDM003", mdm(() -> service.save(withHit("UNIQUE"))));
        assertEquals("FIRST", storedHit());
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void COLLECT_를_벗어날_때_고른_집계가_있으면_AGG_COLLECT_로_거부한다() {
        DmeTestSupport.setStoredHitPolicy(jdbc, "QLTY_GRD_JDG", 2, "COLLECT");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET COLLECT_AGG = 'SUM' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5");

        assertEquals(List.of("AGG_COLLECT"), rejectCodes(() -> service.save(withHit("FIRST"))));
        assertEquals("COLLECT", storedHit());
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));

        // 기본 집계(LIST)만 남았으면 바꿀 수 있다 — COLLECT 에서 다른 정책으로 못 가는 막다른 길을 만들지 않는다.
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET COLLECT_AGG = 'LIST' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5");
        service.save(withHit("FIRST"));
        assertEquals("FIRST", storedHit());
    }

    @Test
    void PRIORITY_를_벗어날_때_순위가_있으면_PRIO_PRIORITY_로_거부한다() {
        DmeTestSupport.setStoredHitPolicy(jdbc, "QLTY_GRD_JDG", 2, "PRIORITY");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET PRIO_LIST = '[\"A\",\"B\"]' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4");

        assertEquals(List.of("PRIO_PRIORITY"), rejectCodes(() -> service.save(withHit("FIRST"))));
        assertEquals("PRIORITY", storedHit());
    }

    @Test
    void 결과_열_그룹이_있으면_FIRST_UNIQUE_밖으로_바꾸지_못한다() {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET RES_GRP = 'G' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID IN (4, 5)");

        assertEquals(List.of("GRP_POLICY"), rejectCodes(() -> service.save(withHit("COLLECT"))));
        assertEquals("FIRST", storedHit());
        service.save(withHit("UNIQUE"));
        assertEquals("UNIQUE", storedHit());
    }

    @Test
    void 적중_정책은_표_저장만_받고_열_설정_저장에_오면_거부한다() {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("COLUMNS");
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setVer(2);
        r.setRowVersion(0L);
        r.setRows(List.of());
        r.setHitPolicy("UNIQUE");
        assertEquals("INVALID_VALUE", mdm(() -> editService.save(r)));
        assertEquals("FIRST", storedHit());
    }

    @Test
    void 그_DRAFT_에_없던_row_id_와_중복_0_소수_ID_는_거부한다() {
        for (Object bad : List.of(9, 0, 1.5)) {
            List<Map<String, Object>> rows = sample();
            rows.add(row(bad, "NORMAL", Q_ROW1, null));
            assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, rows))), String.valueOf(bad));
        }
        List<Map<String, Object>> dup = sample();
        dup.add(row(1, "NORMAL", Q_ROW2, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, dup))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 행_종류와_셀_모양을_검사한다() {
        List<Map<String, Object>> kind = sample();
        kind.set(0, row(1, "OTHER", Q_ROW1, null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, kind))));
        List<Map<String, Object>> cells = sample();
        cells.set(0, row(1, "NORMAL", "{\"9\":{\"op\":\"NA\"}}", null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, cells))));
        List<Map<String, Object>> number = sample();
        number.set(0, row(1, "NORMAL", "{\"2\":{\"op\":\"GT\",\"left\":1000}}", null));
        assertEquals("INVALID_VALUE", mdm(() -> service.save(table(0, number))));
        assertEquals(List.of(1, 2, 3, 4), ints(stored(), "ROW_ID"));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void 변수_행은_바뀌지_않는다() {
        List<Map<String, Object>> before = jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID");
        List<Map<String, Object>> rows = sample();
        rows.add(3, row(-1, "NORMAL", "{\"1\":{\"op\":\"LT\",\"left\":\"1\"},\"2\":{\"op\":\"NA\"},\"3\":{\"op\":\"NA\"},\"4\":{\"val\":\"D\"},"
                + "\"5\":{\"val\":\"0.5\"}}", null));
        service.save(table(0, rows));
        assertEquals(before, jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID"));
    }

    @Test
    void 비소유자의_표_저장은_MDM003_이고_아무것도_바뀌지_않는다() {
        currentUser.set("lee", STEWARD);
        List<Map<String, Object>> rows = sample();
        rows.remove(0);
        assertEquals("MDM003", mdm(() -> service.save(table(0, rows))));
        assertEquals(List.of(1, 2, 3, 4), ints(stored(), "ROW_ID"));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
        assertEquals("FIRST", jdbc.queryForObject("SELECT HIT_POLICY FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2", String.class));
    }

    @Test
    void row_version_이_다르면_MDM001_이다() {
        assertEquals("MDM001", mdm(() -> service.save(table(7, sample()))));
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2));
    }

    @Test
    void RELEASED_버전은_저장하지_않는다() {
        RuleEditSaveRequest r = table(0, sample());
        r.setVer(1);
        assertTrue(List.of("MDM002", "MDM003").contains(mdm(() -> service.save(r))));
    }

    @Test
    void 외부_원천_룰은_거부한다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        RuleEditSaveRequest r = table(0, List.of());
        r.setMaruRuleId("EXT_JDG");
        r.setVer(1);
        assertEquals("BUSINESS_ERROR", mdm(() -> service.save(r)));
        assertEquals(0L, rowVersion(jdbc, "EXT_JDG", 1));
    }

    @Test
    void 응답_issues_는_저장한_정의의_분석기_결과와_같다() {
        List<Map<String, Object>> rows = sample();
        rows.set(1, row(2, "NORMAL", Q_ROW2.replace("[\"B\"]", "[\"A\",\"B\"]"), null));

        RuleEditSaveResult r = service.save(table(0, rows));

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

    // ── 2026-09-28 결정 — Expression 조건 열(변수 칸 NULL, 행 칸마다 식) 화면 왕복(§배경) ──

    /** 조건 열 6번(Expression, VAR_NAME NULL, LABEL 필수)을 이 DRAFT 에 jdbc 로 넣고 LAST_VAR_ID 를 올린다. */
    private void addExprCondVar() {
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, SEQ, LABEL) "
                + "VALUES ('QLTY_GRD_JDG', 2, 6, 'COND', 'Expression', NULL, 4, '두께 확인')");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 6 WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
    }

    /** 1행 Q_ROW1 에 6번 식 칸(ast 없음)을 붙인다. */
    private static final String ROW1_WITH_EXPR = Q_ROW1.replace("}}", "},\"6\":{\"expr\":\"COIL_THK < 2\"}}");

    /** NORMAL 행은 조건 열이 다 차야 한다(INCOMPLETE_COND) — 6번을 쓰지 않는 행은 무관({@code op:NA})으로 채운다. */
    private static String withNaExprCol(String cells) {
        return cells.replace("}}", "},\"6\":{\"op\":\"NA\"}}");
    }

    /** 1행만 {@code row1Cells}(6번 식 포함)로 바꾸고, 2·3행은 6번을 무관으로 채운 표. */
    private List<Map<String, Object>> exprCondTable(String row1Cells) {
        List<Map<String, Object>> rows = sample();
        rows.set(0, row(1, "NORMAL", row1Cells, null));
        rows.set(1, row(2, "NORMAL", withNaExprCol(Q_ROW2), null));
        rows.set(2, row(3, "NORMAL", withNaExprCol(Q_ROW3), null));
        return rows;
    }

    private String cellsOf(int rowId) {
        return jdbc.queryForObject(
                "SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND ROW_ID = " + rowId, String.class);
    }

    @Test
    void Expression_조건_열_식_칸을_저장하면_서버가_파싱해_AST_를_채운다() throws Exception {
        addExprCondVar();

        service.save(table(0, exprCondTable(ROW1_WITH_EXPR)));

        ObjectMapper plain = new ObjectMapper();
        String cells = cellsOf(1);
        JsonNode ast = plain.readTree(cells).get("6").get("ast");
        assertTrue(ast.isObject(), cells);
        assertEquals(plain.valueToTree(AstExporter.export("COIL_THK < 2", evaluator.configuration())), ast, "식 셀의 AST 는 파싱 결과와 같다");
    }

    @Test
    void 화면이_보낸_틀린_ast_도_서버_AST_로_덮어쓴다() throws Exception {
        addExprCondVar();
        String row1 = Q_ROW1.replace("}}", "},\"6\":{\"expr\":\"COIL_THK < 2\",\"ast\":{\"type\":\"NUMBER_LITERAL\",\"value\":\"1\"}}}");

        service.save(table(0, exprCondTable(row1)));

        ObjectMapper plain = new ObjectMapper();
        String cells = cellsOf(1);
        JsonNode ast = plain.readTree(cells).get("6").get("ast");
        assertEquals(plain.valueToTree(AstExporter.export("COIL_THK < 2", evaluator.configuration())), ast,
                "화면이 보낸 틀린 ast 를 무시하고 서버 AST 로 덮어쓴다");
    }

    private static RuleTestRequest versionTest(int ver, String inputJson) {
        RuleTestRequest r = new RuleTestRequest();
        r.setMaruRuleId("QLTY_GRD_JDG");
        r.setTarget("VERSION");
        r.setVer(ver);
        r.setInputJson(inputJson);
        return r;
    }

    private static List<Integer> hitRowIds(RuleTestResult r) {
        return r.getHits().stream().map(m -> ((Number) m.get("rowId")).intValue()).toList();
    }

    @Test
    void 값_테스트에서_식이_참이면_1행이_적중하고_거짓이면_기본_행으로_넘어간다() {
        addExprCondVar();
        service.save(table(0, exprCondTable(ROW1_WITH_EXPR)));

        RuleTestResult hit = editService.runTest(versionTest(2, "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}"));
        assertEquals("OK", hit.getOutcome(), String.valueOf(hit.getErrors()));
        assertEquals(List.of(1), hitRowIds(hit), "COIL_THK 1.8 은 6번 식(COIL_THK < 2)이 참이라 1행이 적중한다");
        assertEquals("A", hit.getResults().get("QLTY_GRD"));

        // COIL_THK 2.2 는 1행 구간 [1.6,2.5) 안이지만 6번 식이 거짓이라 1행이 적중하지 않는다. 2행은 SURF_GRD 가 B 라 안 맞고
        // 3행은 구간 밖이라 기본 행(C)으로 떨어진다.
        RuleTestResult miss = editService.runTest(versionTest(2, "{\"COIL_THK\":\"2.2\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}"));
        assertEquals("OK", miss.getOutcome(), String.valueOf(miss.getErrors()));
        assertTrue(miss.isDefaultApplied(), "1행이 적중하지 못해 기본 행으로 떨어진다");
        assertFalse(hitRowIds(miss).contains(1), "1행은 적중하지 않는다: " + miss.getHits());
        assertEquals("C", miss.getResults().get("QLTY_GRD"));
        Map<Integer, Object> firstFalse = new LinkedHashMap<>();
        miss.getTrace().forEach(t -> firstFalse.put(((Number) t.get("rowId")).intValue(), t.get("firstFalseVarId")));
        assertEquals(6, firstFalse.get(1), "1행을 떨어뜨린 첫 거짓 칸은 6번(식) 이다 — 저장된 AST 를 실제로 평가했다는 증거: " + miss.getTrace());
    }

    @Test
    void 파싱할_수_없는_식과_허용되지_않는_함수는_거부하고_아무것도_반영하지_않는다() {
        addExprCondVar();

        String parseErrRow1 = Q_ROW1.replace("}}", "},\"6\":{\"expr\":\"COIL_THK <\"}}");
        BusinessException e1 = assertThrows(BusinessException.class, () -> service.save(table(0, exprCondTable(parseErrRow1))));
        assertEquals("MDM021", e1.getErrors().get(0).code(), e1.getMessage());
        List<String> codes1 = e1.getErrors().stream().skip(1).map(ErrorDetail::code).toList();
        assertEquals(List.of("EXPR_PARSE"), codes1, "파싱 불가 식: " + e1.getMessage());

        // DT_NOW·RANDOM 은 EvalEx 표준 사전에 있지만 MdmExpressionConfig 가 일부러 함수 사전에서 뺐다(06:442 — 결정성 때문에
        // DT_NOW·RANDOM 을 막는다). 즉 "허용되지 않는 함수"의 실제 예다.
        String badFnRow1 = Q_ROW1.replace("}}", "},\"6\":{\"expr\":\"COIL_THK < DT_NOW()\"}}");
        BusinessException e2 = assertThrows(BusinessException.class, () -> service.save(table(0, exprCondTable(badFnRow1))));
        assertEquals("MDM021", e2.getErrors().get(0).code(), e2.getMessage());
        List<String> codes2 = e2.getErrors().stream().skip(1).map(ErrorDetail::code).toList();
        // 이 환경은 함수 사전 자체가 허용 함수 집합과 같다(FunctionDictionaries.engine — BASE+INSTR+MASTER+MASTER_AT, 비즈니스
        // 함수는 FunctionProvider.NONE). 그래서 사전 밖 함수는 파싱 단계에서 EXPR_PARSE 로 막힌다(EXPR_PROBLEM 의 FUNCTION 종류는
        // 비즈니스 함수가 등록된 칸에서만 재현된다 — 실제 관찰한 그대로 단언한다).
        assertEquals(List.of("EXPR_PARSE"), codes2, "사전 밖 함수(DT_NOW): " + e2.getMessage());

        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2), "거부된 저장은 row_version 을 올리지 않는다");
        assertEquals(Q_ROW1, cellsOf(1), "거부된 저장은 1행 셀을 바꾸지 않는다");
    }

    @Test
    void DECISION_룰_결과_Expression_열은_행_식과_기본_행_식_모두_ast_가_채워진다() throws Exception {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET DISP_TYPE = 'Expression' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5");
        List<Map<String, Object>> rows = sample();
        rows.set(0, row(1, "NORMAL", Q_ROW1.replace("\"5\":{\"val\":\"1.05\"}", "\"5\":{\"expr\":\"ROUND(COIL_WID / 1000, 2)\"}"), null));
        rows.set(3, row(4, "DEFAULT", Q_DEFAULT.replace("\"5\":{\"val\":\"0.90\"}", "\"5\":{\"expr\":\"0.9\"}"), null));
        rows.forEach(r -> r.put("cells", DmeTestSupport.valAsExpr((String) r.get("cells"), 5))); // Expression 열의 칸은 식 하나다

        service.save(table(0, rows));

        ObjectMapper plain = new ObjectMapper();
        JsonNode row1Ast = plain.readTree(cellsOf(1)).get("5").get("ast");
        assertTrue(row1Ast.isObject(), cellsOf(1));
        assertEquals(plain.valueToTree(AstExporter.export("ROUND(COIL_WID / 1000, 2)", evaluator.configuration())), row1Ast);

        JsonNode defaultAst = plain.readTree(cellsOf(4)).get("5").get("ast");
        assertTrue(defaultAst.isObject(), cellsOf(4));
        assertEquals(plain.valueToTree(AstExporter.export("0.9", evaluator.configuration())), defaultAst, "기본 행의 결과 식 칸도 ast 가 채워진다");
    }

    @Test
    void Expression_결과_열의_값_칸은_거부한다_상수도_식으로_적는다() {
        // 2026-09-28 — Expression 열은 표에 식 칸만 그려지므로 값 칸이 섞이면 보이지 않는 값이 된다. 상수는 식(1.00)으로 적는다.
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET DISP_TYPE = 'Expression' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 5");
        List<Map<String, Object>> mixed = sample();
        mixed.forEach(r -> r.put("cells", DmeTestSupport.valAsExpr((String) r.get("cells"), 5)));
        mixed.set(1, row(2, "NORMAL", Q_ROW2, null)); // 2행만 값 칸 {"val":"1.00"}

        BusinessException e = assertThrows(BusinessException.class, () -> service.save(table(0, mixed)));
        assertTrue(e.getMessage().contains("Expression 열에는 값 대신 식을 적는다"), e.getMessage());
        assertEquals(0L, rowVersion(jdbc, "QLTY_GRD_JDG", 2), "거부된 저장은 아무것도 반영하지 않는다");

        List<Map<String, Object>> exprOnly = sample();
        exprOnly.forEach(r -> r.put("cells", DmeTestSupport.valAsExpr((String) r.get("cells"), 5)));
        service.save(table(0, exprOnly));
        assertTrue(cellsOf(2).contains("\"5\":{\"expr\":\"1.00\",\"ast\":{"), cellsOf(2));
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
