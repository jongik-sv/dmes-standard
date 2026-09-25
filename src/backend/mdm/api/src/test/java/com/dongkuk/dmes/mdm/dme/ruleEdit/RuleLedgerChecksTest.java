package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW1;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW2;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.Q_ROW3;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleColumnsServiceTest.col;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleColumnsServiceTest.columns;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleColumnsServiceTest.qCols;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.row;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.sample;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleTableServiceTest.table;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.web.response.ErrorDetail;
import com.dongkuk.dmes.mdm.common.dictionary.DomainJson;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleColumnsService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleTableService;
import com.ezylang.evalex.parser.ParseException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-04 design §3.1 「RuleLedgerChecksTest」 — 원장을 읽는 저장 시 검사 빈(§2.2 표): 도메인 범위·코드 참조·MDM 참조·필수 컬럼·룰 세트
 * 순서·입력 계약 변경·케이스로 본 결과 타입(I14·I15·I16·I17), COLUMNS 적용 지점(I18). 표 저장(TABLE)과 열 설정 적용(COLUMNS)을 서비스로 태운다.
 * 시작 상태: QLTY_GRD_JDG VER 1 RELEASED + VER 2 DRAFT(소유자 kim, FIRST) — 두 버전 정의가 같다(계약 변경 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleLedgerChecksTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleTableService tableService;
    @Autowired
    RuleColumnsService columnsService;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MdmEvaluator evaluator;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        new MasterCodeFixtures(jdbc).clear();
        jdbc.update("DELETE FROM TB_MDM_DATA_CATE");
        jdbc.update("DELETE FROM TB_MDM_DATA");
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
    }

    // ── 헬퍼 ──

    /** 샘플 행 셀에서 var_id 하나를 바꾼 JSON. */
    private static String withCell(String cells, int varId, Map<String, Object> cell) {
        Map<Integer, Map<String, Object>> m = RuleCellsCodec.parse(cells);
        m.put(varId, new LinkedHashMap<>(cell));
        return RuleCellsCodec.write(m);
    }

    private static List<Map<String, Object>> rowsWith(int index, String cells) {
        List<Map<String, Object>> rows = sample();
        rows.set(index, row(index + 1, index == 3 ? "DEFAULT" : "NORMAL", cells, null));
        return rows;
    }

    private RuleEditSaveResult save(List<Map<String, Object>> rows) {
        return tableService.save(table(DmeTestSupport.rowVersion(jdbc, "QLTY_GRD_JDG", 2), "FIRST", rows));
    }

    /** 거부(MDM021)이고 VER 2 의 행·row_version 이 그대로인지 본다. */
    private BusinessException rejected(org.junit.jupiter.api.function.Executable call) {
        List<Map<String, Object>> before = snapshot();
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals("MDM021", e.getErrors().get(0).code(), e.getMessage());
        assertEquals(before, snapshot(), "거부된 저장은 원장을 바꾸지 않는다");
        return e;
    }

    private List<Map<String, Object>> snapshot() {
        List<Map<String, Object>> out = new ArrayList<>(jdbc.queryForList(
                "SELECT ROW_ID, CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY ROW_ID"));
        out.addAll(jdbc.queryForList("SELECT VAR_ID, DISP_TYPE, VAR_NAME FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 ORDER BY VAR_ID"));
        out.add(jdbc.queryForMap("SELECT ROW_VERSION FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        return out;
    }

    private static List<String> codes(BusinessException e) {
        return e.getErrors().stream().skip(1).map(ErrorDetail::code).toList();
    }

    private static List<Map<String, Object>> issues(RuleEditSaveResult r, String code) {
        return r.getIssues().stream().filter(i -> code.equals(i.get("code"))).toList();
    }

    /** 다른 룰 하나 — VER 1 RELEASED, 조건 변수 하나(읽는 이름)·결과 변수 하나(만드는 이름). */
    private void otherRule(String id, String reads, String produces) {
        DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, 1, 1, "COND", "1", reads, 1, null);
        DmeTestSupport.var(jdbc, id, 1, 2, "RESULT", "Value", produces, 1, "STRING");
    }

    private void ruleSet(String setId, String status, String... ruleIds) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, RULE_IDS, STATUS) VALUES (?, ?, ?, ?)",
                setId, setId, DomainJson.write(List.of(ruleIds)), status);
    }

    private void codeDomainOnSurfGrd() {
        new MasterCodeFixtures(jdbc).seedProcCdBeforeDraftEdits();
        jdbc.update("UPDATE TB_MDM_DOMAIN SET DOMAIN_KIND = 'CODE', MARU_CODE_ID = 'PROC_CD' WHERE STD_NAME = 'SURF_GRD_D'");
    }

    private void v2ResultAsExpression(int varId) {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET DISP_TYPE = 'Expression' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = ?", varId);
    }

    private Map<String, Object> astOf(String expr) {
        try {
            return AstExporter.export(expr, evaluator.configuration());
        } catch (ParseException e) {
            throw new IllegalStateException(e);
        }
    }

    // ── 도메인 범위(I16) ──

    @Test
    void 도메인_표준_식을_통과하지_못하는_셀_값은_경고하고_저장한다() {
        jdbc.update("UPDATE TB_MDM_DOMAIN SET STD_RULE = 'value >= 0' WHERE STD_NAME = 'COIL_THK_D'");

        RuleEditSaveResult r = save(rowsWith(0, Q_ROW1.replace("\"left\":\"1.6\"", "\"left\":\"-1\"")));

        List<Map<String, Object>> range = issues(r, "DOMAIN_RANGE");
        assertEquals(1, range.size(), r.getIssues().toString());
        assertEquals("WARNING", range.get(0).get("severity"));
        assertEquals(List.of(1), range.get(0).get("rowIds"));
        assertEquals(1, range.get(0).get("varId"));
        assertTrue(String.valueOf(range.get(0).get("message")).contains("-1"), range.toString());
    }

    // ── 코드 참조(I16) ──

    @Test
    void 코드_도메인_값이_마루_코드에_없으면_경고하고_도메인_범위는_건너뛴다() {
        codeDomainOnSurfGrd();

        RuleEditSaveResult r = save(new ArrayList<>(List.of(
                row(1, "NORMAL", withCell(Q_ROW1, 3, Map.of("op", "IN", "list", List.of("82", "ZZ"))), null),
                row(2, "NORMAL", withCell(Q_ROW2, 3, Map.of("op", "EQ", "left", "2P")), null),
                row(3, "NORMAL", withCell(Q_ROW3, 3, Map.of("op", "NOT_IN", "list", List.of("83"))), null),
                sample().get(3))));

        List<Map<String, Object>> missing = issues(r, "CODE_VALUE_MISSING");
        assertEquals(2, missing.size(), r.getIssues().toString());
        assertTrue(missing.stream().allMatch(i -> "WARNING".equals(i.get("severity")) && Integer.valueOf(3).equals(i.get("varId"))), missing.toString());
        assertEquals(List.of(List.of(1), List.of(2)), missing.stream().map(i -> i.get("rowIds")).toList(), "ZZ(없음)·2P(등록 시각 뒤 버전) 만");
        assertTrue(String.valueOf(missing.get(0).get("message")).contains("ZZ"), missing.toString());
        assertTrue(issues(r, "DOMAIN_RANGE").isEmpty(), "CODE 종류는 도메인 범위를 보지 않는다");
    }

    @Test
    void 코드_카테고리_IN_값이_그_마루_코드의_카테고리가_아니면_거부한다() {
        codeDomainOnSurfGrd();

        BusinessException e = rejected(() -> save(rowsWith(0, withCell(Q_ROW1, 3, Map.of("op", "CODE_IN", "left", "NOPE")))));
        assertTrue(codes(e).contains("CODE_CATE_MISSING"), codes(e).toString());

        RuleEditSaveResult ok = save(rowsWith(0, withCell(Q_ROW1, 3, Map.of("op", "CODE_IN", "left", "COATING"))));
        assertTrue(issues(ok, "CODE_CATE_MISSING").isEmpty(), ok.getIssues().toString());
    }

    // ── MDM 참조(I17) ──

    @Test
    void MASTER_대상_카테고리_attr_라벨이_원장에_없으면_거부한다() {
        new MasterCodeFixtures(jdbc).seedProcCdBeforeDraftEdits();
        jdbc.update("INSERT INTO TB_MDM_DATA (MARU_DATA_ID, MARU_DATA_NAME, SOURCE_KIND, ATTR01_NAME) VALUES ('COIL_DATA', '코일', 'MDM', '두께')");
        jdbc.update("INSERT INTO TB_MDM_DATA_CATE (MARU_DATA_ID, CATE_ID, VALID_FROM, DEF_KIND) VALUES ('COIL_DATA', 'HOT', '2026-01-01 00:00:00', 'TABLE')");
        v2ResultAsExpression(4);

        Map<String, String> cases = new LinkedHashMap<>();
        cases.put("MASTER(\"NO_SUCH\", \"BASE\", SURF_GRD)", "MASTER_TARGET_MISSING");
        cases.put("MASTER(\"PROC_CD\", \"NOPE\", SURF_GRD)", "MASTER_CATE_MISSING");
        cases.put("MASTER(\"PROC_CD\", \"BASE\", SURF_GRD, \"attr02\")", "MASTER_ATTR_LABEL_MISSING");
        cases.put("MASTER_AT(\"COIL_DATA\", \"HOT\", SURF_GRD, \"2026-06-15 00:00:00\", \"attr02\")", "MASTER_ATTR_LABEL_MISSING");
        cases.forEach((expr, code) -> {
            BusinessException e = rejected(() -> save(rowsWith(0, withCell(Q_ROW1, 4, Map.of("expr", expr)))));
            assertTrue(codes(e).contains(code), expr + " → " + codes(e));
        });

        for (String expr : List.of("MASTER(\"PROC_CD\", \"BASE\", SURF_GRD)", "MASTER(\"COIL_DATA\", \"HOT\", SURF_GRD, \"attr01\")",
                "MASTER_AT(\"COIL_DATA\", \"HOT\", SURF_GRD, \"2026-06-15 00:00:00\", \"attr01\")")) {
            RuleEditSaveResult r = save(rowsWith(0, withCell(Q_ROW1, 4, Map.of("expr", expr))));
            assertTrue(r.getIssues().stream().noneMatch(i -> String.valueOf(i.get("code")).startsWith("MASTER_")), expr + " → " + r.getIssues());
        }
    }

    // ── 필수 컬럼(I16) ──

    @Test
    void 필수_컬럼에_IS_NULL_셀이_있으면_경고하고_저장한다() {
        jdbc.update("UPDATE TB_MDM_COLUMN SET REQUIRED = 1 WHERE PHYS_NAME = 'COIL_WID'");

        RuleEditSaveResult r = save(rowsWith(2, withCell(Q_ROW3, 2, Map.of("op", "IS_NULL"))));

        List<Map<String, Object>> w = issues(r, "REQUIRED_NULL_CHECK");
        assertEquals(1, w.size(), r.getIssues().toString());
        assertEquals("WARNING", w.get(0).get("severity"));
        assertEquals(List.of(3), w.get(0).get("rowIds"));
        assertEquals(2, w.get(0).get("varId"));
    }

    // ── 축 조합 완전성(TABLE) ──

    @Test
    void 표_저장도_UNIQUE_축_조합이_비면_경고한다() {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET AXIS = 'ROW' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 1");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET AXIS = 'COL' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 3");

        assertTrue(issues(save(sample()), "PIVOT_COVER_INCOMPLETE").isEmpty(), "UNIQUE 가 아닌 표는 보지 않는다");

        RuleEditSaveResult r = tableService.save(table(DmeTestSupport.rowVersion(jdbc, "QLTY_GRD_JDG", 2), "UNIQUE", sample()));

        List<Map<String, Object>> w = issues(r, "PIVOT_COVER_INCOMPLETE");
        assertEquals(1, w.size(), r.getIssues().toString());
        assertEquals("WARNING", w.get(0).get("severity"));
        assertEquals(List.of(), w.get(0).get("rowIds"));
        assertTrue(String.valueOf(w.get(0).get("message")).contains("2 × 열 축 2"), w.toString());
    }

    // ── 룰 세트 순서(I14) ──

    @Test
    void 세트에서_뒤_룰의_결과를_읽으면_거부하고_세트_ID_와_옮길_룰을_적는다() {
        otherRule("R_WID", "X_IN", "COIL_WID");
        ruleSet("S_AFTER", "INUSE", "QLTY_GRD_JDG", "R_WID");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_ORDER"), codes(e));
        assertTrue(e.getMessage().contains("S_AFTER") && e.getMessage().contains("R_WID") && e.getMessage().contains("COIL_WID"), e.getMessage());
    }

    @Test
    void 세트에서_앞_룰이_이_룰의_결과를_읽으면_거부한다() {
        otherRule("R_READ", "QLTY_GRD", "R_OUT");
        ruleSet("S_BEFORE", "INUSE", "R_READ", "QLTY_GRD_JDG");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_ORDER"), codes(e));
        assertTrue(e.getMessage().contains("S_BEFORE") && e.getMessage().contains("R_READ") && e.getMessage().contains("QLTY_GRD"), e.getMessage());
    }

    @Test
    void 서로_결과를_읽으면_순환으로_거부한다() {
        otherRule("R_CYC", "QLTY_GRD", "COIL_WID");
        ruleSet("S_CYC", "INUSE", "QLTY_GRD_JDG", "R_CYC");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_CYCLE"), codes(e));
    }

    @Test
    void 같은_결과_변수를_두_룰이_대입하면_경고하고_폐기된_세트는_보지_않는다() {
        otherRule("R_DUP", "X_IN", "PRC_FCT");
        ruleSet("S_DUP", "INUSE", "R_DUP", "QLTY_GRD_JDG");
        otherRule("R_WID", "X_IN", "COIL_WID");
        ruleSet("S_OLD", "DEPRECATED", "QLTY_GRD_JDG", "R_WID");

        RuleEditSaveResult r = save(sample());

        List<Map<String, Object>> dup = issues(r, "SET_DUP_RESULT");
        assertEquals(1, dup.size(), r.getIssues().toString());
        assertEquals("WARNING", dup.get(0).get("severity"));
        assertTrue(String.valueOf(dup.get(0).get("message")).contains("S_DUP"), dup.toString());
        assertTrue(issues(r, "SET_ORDER").isEmpty(), "DEPRECATED 세트는 보지 않는다");
    }

    // ── 입력 계약 변경(I15) ──

    /** 조건 열은 늘 계약(always)에 들므로 계약이 바뀌는 자리는 식이다 — 사전에 COIL_LEN 을 두고 v2 의 PRC_FCT 를 식 열로 바꾼다. */
    private void exprResultOverColumn() {
        DmeTestSupport.column(jdbc, "COIL_LEN", DmeTestSupport.domain(jdbc, "COIL_LEN_D", "QTY", "NUMBER", 0));
        v2ResultAsExpression(5);
    }

    @Test
    void 지금_RELEASED_보다_필요_변수가_늘면_경고만_한다() {
        assertTrue(issues(save(sample()), "CONTRACT_CHANGED").isEmpty(), "v1 과 같은 정의는 경고하지 않는다");
        exprResultOverColumn();

        RuleEditSaveResult r = save(rowsWith(0, withCell(Q_ROW1, 5, Map.of("expr", "COIL_LEN * 1"))));

        List<Map<String, Object>> changed = issues(r, "CONTRACT_CHANGED");
        assertEquals(1, changed.size(), r.getIssues().toString());
        assertEquals("WARNING", changed.get(0).get("severity"));
        assertTrue(String.valueOf(changed.get(0).get("message")).contains("COIL_LEN"), changed.toString());
    }

    @Test
    void 선택이던_변수가_필수가_되면_경고한다() {
        exprResultOverColumn();
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET DISP_TYPE = 'Expression' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1 AND VAR_ID = 5");
        String optional = "COALESCE(COIL_LEN, 1)";
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 1 AND ROW_ID = 1",
                withCell(Q_ROW1, 5, Map.of("expr", optional, "ast", astOf(optional))));

        RuleEditSaveResult r = save(rowsWith(0, withCell(Q_ROW1, 5, Map.of("expr", "COIL_LEN * 1"))));

        List<Map<String, Object>> changed = issues(r, "CONTRACT_CHANGED");
        assertEquals(1, changed.size(), r.getIssues().toString());
        assertTrue(String.valueOf(changed.get(0).get("message")).contains("COIL_LEN") && String.valueOf(changed.get(0).get("message")).contains("필수"),
                changed.toString());
    }

    // ── 케이스로 본 결과 타입(D9) ──

    @Test
    void 저장된_케이스로_돌려_결과_타입_변환이_실패하면_경고한다() {
        v2ResultAsExpression(5);
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, ROW_VERSION) VALUES "
                + "('QLTY_GRD_JDG', 1, '두께 2', '{\"COIL_THK\":2.0,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}', 0)");

        RuleEditSaveResult r = save(rowsWith(0, withCell(Q_ROW1, 5, Map.of("expr", "\"abc\""))));

        List<Map<String, Object>> w = issues(r, "EXPR_TYPE_BY_CASE");
        assertEquals(1, w.size(), r.getIssues().toString());
        assertEquals("WARNING", w.get(0).get("severity"));
        assertTrue(String.valueOf(w.get(0).get("message")).contains("두께 2"), w.toString());
    }

    // ── COLUMNS 적용 지점(I18) ──

    @Test
    void 열_설정_적용도_세트_순서로_거부하고_롤백한다() {
        otherRule("R_WID", "X_IN", "COIL_WID");
        ruleSet("S_AFTER", "INUSE", "QLTY_GRD_JDG", "R_WID");

        BusinessException e = rejected(() -> columnsService.save(columns(0, qCols())));

        assertEquals(List.of("SET_ORDER"), codes(e));
    }

    @Test
    void 열_설정_적용도_식_변수의_MASTER_대상이_없으면_거부한다() {
        List<Map<String, Object>> cols = qCols();
        Map<String, Object> exprVar = col(-1, "COND", "Expression", "MASTER(\"NO_SUCH\", \"BASE\", SURF_GRD)");
        exprVar.put("label", "마스터 확인");
        cols.add(3, exprVar);

        BusinessException e = rejected(() -> columnsService.save(columns(0, cols)));

        assertEquals(List.of("MASTER_TARGET_MISSING"), codes(e));
        assertTrue(e.getMessage().contains("마스터 확인"), e.getMessage());
    }

    @Test
    void 열_설정_적용은_미완성_검사를_돌리지_않아_셀_없는_새_열을_더할_수_있다() {
        DmeTestSupport.column(jdbc, "COIL_LEN", DmeTestSupport.domain(jdbc, "COIL_LEN_D", "QTY", "NUMBER", 0));
        List<Map<String, Object>> cols = qCols();
        cols.add(3, col(-1, "COND", "2", "COIL_LEN"));
        RuleEditSaveRequest req = columns(0, cols);

        RuleEditSaveResult r = columnsService.save(req);

        assertEquals(Map.of("-1", 6), r.getRowIdMap());
        assertFalse(r.getIssues().stream().anyMatch(i -> "ERROR".equals(i.get("severity"))), r.getIssues().toString());
        assertEquals(6, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
    }
}
