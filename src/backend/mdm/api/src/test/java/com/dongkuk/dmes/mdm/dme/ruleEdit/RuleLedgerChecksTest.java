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
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleCellsCodec;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIo.IoName;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetAnalyzer;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.ledger.RuleSetOrderCheck;
import com.dongkuk.dmes.mdm.common.rule.check.ledger.RuleSetOrderCheck.SiblingRead;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionNumbers;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleColumnsService;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleTableService;
import com.dongkuk.dmes.mdm.entity.MdmRuleVar;
import com.ezylang.evalex.parser.ParseException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.AstExporter;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import kr.dongkuk.maru.mdm.engine.flow.FlowParse;
import kr.dongkuk.maru.mdm.engine.flow.FlowParser;
import kr.dongkuk.maru.mdm.engine.flow.FlowTree;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.FlowDefinition;
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
    @Autowired
    RuleSetOrderCheck orderCheck;
    @Autowired
    RuleQueries queries;

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

    /** 이 시험에서 Expression 으로 바꾼 결과 열 — 저장 요청의 값 칸을 식 칸으로 바꾼다(Expression 열의 칸은 식 하나다). */
    private final Set<Integer> exprResults = new HashSet<>();

    private RuleEditSaveResult save(List<Map<String, Object>> rows) {
        for (Map<String, Object> r : rows) {
            for (int varId : exprResults) {
                r.put("cells", DmeTestSupport.valAsExpr((String) r.get("cells"), varId));
            }
        }
        return tableService.save(table(DmeTestSupport.rowVersion(jdbc, "QLTY_GRD_JDG", 2), rows));
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
        exprResults.add(varId);
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

    /** 흐름 세트 — IF(또는 PARALLEL) 하나에 두 갈래. first 는 첫 갈래, second 는 둘째 갈래(IF 면 그 외)의 룰. */
    private void branchSet(String setId, String kind, String first, String second) {
        String secondEdge = "IF".equals(kind)
                ? "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"r2\",\"otherwise\":true}"
                : "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"r2\",\"order\":2}";
        String firstEdge = "IF".equals(kind)
                ? "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"r1\",\"order\":1,\"cond\":\"COIL_THK > 1\"}"
                : "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"r1\",\"order\":1}";
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s1\",\"kind\":\"" + kind + "\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"" + first + "\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"" + second + "\"},"
                + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"s1\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s1\"}," + firstEdge + "," + secondEdge + ","
                + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"end\"}]}";
        ruleSet(setId, "INUSE", first, second);
        DmeTestSupport.ruleSetFlow(jdbc, setId, flow);
    }

    @Test
    void IF_형제_갈래의_결과를_읽으면_SET_IF_SIBLING_으로_거부한다() {
        otherRule("R_WID", "X_IN", "COIL_WID");
        branchSet("S_IF", "IF", "QLTY_GRD_JDG", "R_WID");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_IF_SIBLING"), codes(e));
        assertTrue(e.getMessage().contains("S_IF") && e.getMessage().contains("COIL_WID"), e.getMessage());
    }

    @Test
    void 병렬_형제_갈래의_결과를_읽으면_SET_PAR_SIBLING_으로_거부한다() {
        otherRule("R_WID", "X_IN", "COIL_WID");
        branchSet("S_PAR", "PARALLEL", "QLTY_GRD_JDG", "R_WID");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_PAR_SIBLING"), codes(e));
    }

    @Test
    void 병렬_형제가_같은_결과를_대입하면_SET_PAR_SIBLING_이다() {
        otherRule("R_DUP", "X_IN", "PRC_FCT");
        branchSet("S_PDUP", "PARALLEL", "QLTY_GRD_JDG", "R_DUP");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_PAR_SIBLING"), codes(e));
        assertTrue(e.getMessage().contains("PRC_FCT"), e.getMessage());
    }

    @Test
    void 서로_다른_IF_갈래가_같은_결과를_대입하는_것은_정상이다() {
        otherRule("R_DUP", "X_IN", "PRC_FCT");
        branchSet("S_IFDUP", "IF", "QLTY_GRD_JDG", "R_DUP");

        RuleEditSaveResult r = save(sample());

        assertTrue(issues(r, "SET_DUP_RESULT").isEmpty(), r.getIssues().toString());
        assertTrue(issues(r, "SET_IF_SIBLING").isEmpty(), r.getIssues().toString());
    }

    /**
     * 받는 노드(받는 노드 spec §5, Ruling R8·R18) — 정상 갈래 룰(rq)과 처리 갈래 룰(rh)은 서로 다른 경로(EXCLUSIVE)다.
     * {@code start → rg(R_G) → rq(QLTY_GRD_JDG) → mr → end}, {@code c1(rg, NO_RESULT) → rh(R_WID) → mr}. 둘이 서로의 결과를 읽으면 IF 형제와 같은
     * SET_IF_SIBLING 이다(경로 상태가 받는 룰·두 갈래 룰을 모두 적어야 한다 — 빠지면 형제 판정이 null 상태를 읽는다).
     */
    @Test
    void 받는_노드의_정상_갈래와_처리_갈래가_서로의_결과를_읽으면_SET_IF_SIBLING_으로_거부한다() {
        otherRule("R_G", "X_IN", "G_OUT");
        otherRule("R_WID", "PRC_FCT", "COIL_WID");
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"rg\",\"kind\":\"RULE\",\"ruleId\":\"R_G\"},"
                + "{\"id\":\"rq\",\"kind\":\"RULE\",\"ruleId\":\"QLTY_GRD_JDG\"},"
                + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"rg\",\"catches\":[\"NO_RESULT\"]},"
                + "{\"id\":\"rh\",\"kind\":\"RULE\",\"ruleId\":\"R_WID\"},{\"id\":\"mr\",\"kind\":\"MERGE\",\"splitId\":\"rg\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"rg\"},{\"id\":\"e2\",\"from\":\"rg\",\"to\":\"rq\"},"
                + "{\"id\":\"e3\",\"from\":\"rq\",\"to\":\"mr\"},{\"id\":\"e4\",\"from\":\"c1\",\"to\":\"rh\"},"
                + "{\"id\":\"e5\",\"from\":\"rh\",\"to\":\"mr\"},{\"id\":\"e6\",\"from\":\"mr\",\"to\":\"end\"}]}";
        ruleSet("S_CATCH", "INUSE", "R_G", "QLTY_GRD_JDG", "R_WID");
        DmeTestSupport.ruleSetFlow(jdbc, "S_CATCH", flow);

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_IF_SIBLING"), codes(e), e.getMessage());
        assertTrue(e.getMessage().contains("세트 S_CATCH: QLTY_GRD_JDG와(과) R_WID가 같은 IF 의 다른 갈래에 있는데 한쪽이 다른 쪽 결과를 읽는다"
                + "(QLTY_GRD_JDG ← [COIL_WID], R_WID ← [PRC_FCT])"), e.getMessage());
    }

    /** 받는 룰 하나에 돌아오는 처리 갈래 하나 — {@code start → rg(guarded) → mr → end}, {@code c1(rg, EVAL_ERROR) → rh(handler) → mr}(정상 갈래는 비었다). */
    private void guardedSet(String setId, String guarded, String handler) {
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"rg\",\"kind\":\"RULE\",\"ruleId\":\"" + guarded + "\"},"
                + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"rg\",\"catches\":[\"EVAL_ERROR\"]},"
                + "{\"id\":\"rh\",\"kind\":\"RULE\",\"ruleId\":\"" + handler + "\"},{\"id\":\"mr\",\"kind\":\"MERGE\",\"splitId\":\"rg\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"rg\"},{\"id\":\"e2\",\"from\":\"rg\",\"to\":\"mr\"},"
                + "{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"rh\"},{\"id\":\"e4\",\"from\":\"rh\",\"to\":\"mr\"},{\"id\":\"e5\",\"from\":\"mr\",\"to\":\"end\"}]}";
        ruleSet(setId, "INUSE", guarded, handler);
        DmeTestSupport.ruleSetFlow(jdbc, setId, flow);
    }

    /** 받는 노드 spec §5 — 처리 갈래가 실패한 룰과 같은 결과 변수를 쓰는 것은 정상이다(받는 룰과 처리 갈래 룰은 EXCLUSIVE). */
    @Test
    void 처리_갈래_룰이_받는_룰과_같은_결과를_대입해도_SET_DUP_RESULT_가_아니다() {
        otherRule("R_DUP", "X_IN", "PRC_FCT");
        guardedSet("S_GDUP", "QLTY_GRD_JDG", "R_DUP");

        RuleEditSaveResult r = save(sample());

        assertTrue(issues(r, "SET_DUP_RESULT").isEmpty(), r.getIssues().toString());
    }

    /** 받는 노드 spec §5 — 실패한 RULE 의 결과는 정의되지 않은 것으로 본다. 처리 갈래 룰이 받는 룰의 결과를 읽으면 IF 형제와 같은 SET_IF_SIBLING 이다. */
    @Test
    void 처리_갈래_룰이_받는_룰의_결과를_읽으면_SET_IF_SIBLING_으로_거부한다() {
        otherRule("R_G", "X_IN", "COIL_WID");
        guardedSet("S_GREAD", "R_G", "QLTY_GRD_JDG");

        BusinessException e = rejected(() -> save(sample()));

        assertEquals(List.of("SET_IF_SIBLING"), codes(e), e.getMessage());
        assertTrue(e.getMessage().contains("세트 S_GREAD: QLTY_GRD_JDG와(과) R_G가 같은 IF 의 다른 갈래에 있는데 한쪽이 다른 쪽 결과를 읽는다"
                + "(QLTY_GRD_JDG ← [COIL_WID], R_G ← []) — 그 갈래를 타면 값이 없다"), e.getMessage());
    }

    // ── 세트 형제 판정의 경로 상태(§9.1-6, P4) ──

    /**
     * 앞 경로에서 이미 정의된 이름을 읽는 형제 갈래 — {@code start → r0(R_P: S_X 생산) → s1 { e2: rA(R_A: S_X 생산) ; e3: rB(R_B: S_X 읽기) } → m1 → end}.
     * IF 면 e3 은 그 외 갈래다.
     */
    private void definedBeforeSiblingSet(String setId, String kind) {
        otherRule("R_P", "X_IN", "S_X");
        otherRule("R_A", "X_IN", "S_X");
        otherRule("R_B", "S_X", "S_B_OUT");
        String firstEdge = "IF".equals(kind)
                ? "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"rA\",\"order\":1,\"cond\":\"X_IN > 1\"}"
                : "{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"rA\",\"order\":1}";
        String secondEdge = "IF".equals(kind)
                ? "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"rB\",\"otherwise\":true}"
                : "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"rB\",\"order\":2}";
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r0\",\"kind\":\"RULE\",\"ruleId\":\"R_P\"},"
                + "{\"id\":\"s1\",\"kind\":\"" + kind + "\"},{\"id\":\"rA\",\"kind\":\"RULE\",\"ruleId\":\"R_A\"},{\"id\":\"rB\",\"kind\":\"RULE\",\"ruleId\":\"R_B\"},"
                + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"s1\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e0\",\"from\":\"start\",\"to\":\"r0\"},{\"id\":\"e1\",\"from\":\"r0\",\"to\":\"s1\"}," + firstEdge + "," + secondEdge + ","
                + "{\"id\":\"e4\",\"from\":\"rA\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"rB\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"end\"}]}";
        ruleSet(setId, "INUSE", "R_P", "R_A", "R_B");
        DmeTestSupport.ruleSetFlow(jdbc, setId, flow);
    }

    /** 세트 저장 검사(분석기) — 시드한 세 룰의 입출력(X_IN·S_X 는 사전에 없다)과 저장된 흐름. */
    private List<RuleSetCheck> analyzerChecks(String setId) {
        IoName xIn = new IoName("X_IN", RuleIo.NONE, null, null, null, false, null);
        Map<String, RuleIo> rules = new LinkedHashMap<>();
        rules.put("R_P", new RuleIo("R_P", "R_P", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(xIn), List.of(ioName("S_X"))));
        rules.put("R_A", new RuleIo("R_A", "R_A", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(xIn), List.of(ioName("S_X"))));
        rules.put("R_B", new RuleIo("R_B", "R_B", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(ioName("S_X")), List.of(ioName("S_B_OUT"))));
        String flow = jdbc.queryForObject("SELECT FLOW_JSON FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", String.class, setId);
        return RuleSetAnalyzer.checks(RuleSetFlowJson.parse(flow), rules, Map.of("e2", new CondIo(true, null, List.of(xIn))));
    }

    private static IoName ioName(String name) {
        return new IoName(name, RuleIo.NONE, null, null, null, false, null);
    }

    /** 확정 검사 빈을 me 의 VER 1 정의(저장하려는 정의 자리)로 직접 부른다. */
    private List<Map<String, Object>> orderCheck(String me) {
        return orderCheck.check(new RuleSaveContext(me, DmeTestSupport.v(1), "DECISION", "FIRST", queries.vars(me, DmeTestSupport.v(1)), List.of(), List.of(), List.of(), RuleSaveTarget.TABLE));
    }

    private static List<Object> checkCodes(List<Map<String, Object>> issues) {
        return issues.stream().map(i -> i.get("code")).toList();
    }

    @Test
    void 앞_경로에서_이미_정의된_이름을_읽으면_IF_형제_갈래가_만들어도_SET_IF_SIBLING_이_아니다() {
        definedBeforeSiblingSet("S_IFDEF", "IF");
        List<RuleSetCheck> set = analyzerChecks("S_IFDEF");
        assertTrue(set.stream().noneMatch(c -> RuleSetCheck.IF_SIBLING.equals(c.code()) || RuleSetCheck.PAR_SIBLING.equals(c.code())), set.toString());

        List<Map<String, Object>> r = orderCheck("R_B");

        assertFalse(checkCodes(r).contains("SET_IF_SIBLING"), r.toString());
    }

    @Test
    void 앞_경로에서_이미_정의된_이름을_읽으면_병렬_형제_갈래가_만들어도_SET_PAR_SIBLING_이_아니다() {
        definedBeforeSiblingSet("S_PARDEF", "PARALLEL");
        List<RuleSetCheck> set = analyzerChecks("S_PARDEF");
        assertTrue(set.stream().noneMatch(c -> RuleSetCheck.IF_SIBLING.equals(c.code()) || RuleSetCheck.PAR_SIBLING.equals(c.code())), set.toString());

        List<Map<String, Object>> r = orderCheck("R_B");

        assertFalse(checkCodes(r).contains("SET_PAR_SIBLING"), r.toString());
    }

    /**
     * 판정이 통과 → 거부로 바뀌는 모양(P4 노드 쌍) — {@code start → s1 IF { e2: rM(R_M: S_Y 생산) ; e3(그 외): rO1(R_O: S_Y 읽기) } → m1 → rO2(R_O) → end}.
     * 옛 판정은 R_M·R_O 관계가 {EXCLUSIVE, BEFORE} 라 IF 형제 판정을 건너뛰고(모두 EXCLUSIVE 일 때만), R_O 가 R_M 뒤에서 읽는 것은 순서상 맞아 아무것도
     * 내지 않았다. 세트 저장 검사는 rO1 에서 IF_SIBLING 으로 거부하므로 확정 검사도 SET_IF_SIBLING 을 낸다.
     */
    @Test
    void 다른_룰이_형제_갈래에서_이_룰의_결과를_읽으면_합류_뒤에_같은_룰이_또_있어도_SET_IF_SIBLING_이다() {
        otherRule("R_M", "X_IN", "S_Y");
        otherRule("R_O", "S_Y", "S_O_OUT");
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s1\",\"kind\":\"IF\"},"
                + "{\"id\":\"rM\",\"kind\":\"RULE\",\"ruleId\":\"R_M\"},{\"id\":\"rO1\",\"kind\":\"RULE\",\"ruleId\":\"R_O\"},"
                + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"s1\"},{\"id\":\"rO2\",\"kind\":\"RULE\",\"ruleId\":\"R_O\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s1\"},{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"rM\",\"order\":1,\"cond\":\"X_IN > 1\"},"
                + "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"rO1\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"rM\",\"to\":\"m1\"},"
                + "{\"id\":\"e5\",\"from\":\"rO1\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"rO2\"},{\"id\":\"e7\",\"from\":\"rO2\",\"to\":\"end\"}]}";
        ruleSet("S_IFREAD", "INUSE", "R_M", "R_O");
        DmeTestSupport.ruleSetFlow(jdbc, "S_IFREAD", flow);
        IoName xIn = new IoName("X_IN", RuleIo.NONE, null, null, null, false, null);
        Map<String, RuleIo> rules = new LinkedHashMap<>();
        rules.put("R_M", new RuleIo("R_M", "R_M", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(xIn), List.of(ioName("S_Y"))));
        rules.put("R_O", new RuleIo("R_O", "R_O", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(ioName("S_Y")), List.of(ioName("S_O_OUT"))));
        List<RuleSetCheck> set = RuleSetAnalyzer.checks(RuleSetFlowJson.parse(flow), rules, Map.of("e2", new CondIo(true, null, List.of(xIn))));
        assertTrue(set.stream().anyMatch(c -> RuleSetCheck.IF_SIBLING.equals(c.code()) && "R_O".equals(c.ruleId()) && "rO1".equals(c.nodeId())
                && "S_Y".equals(c.varName()) && "R_M".equals(c.otherRuleId())), set.toString());

        List<Map<String, Object>> r = orderCheck("R_M");

        assertEquals(List.of("SET_IF_SIBLING"), checkCodes(r), r.toString());
        assertTrue(String.valueOf(r.get(0).get("message")).contains("R_O ← [S_Y]"), r.toString());
    }

    /**
     * 판정이 통과 → 거부로 바뀌는 대칭 모양(보고서 표 #3c) — {@code start → s1 IF { e2: rO(R_O: S_Y 생산) ; e3(그 외): rM1(R_M: S_Y 읽기) } → m1 → rM2(R_M) → end}.
     * 옛 판정은 R_M·R_O 관계가 {EXCLUSIVE, AFTER} 이고 R_O 가 R_M 결과를 읽지 않아 아무것도 내지 않았다(SET_ORDER 는 BEFORE 필요, IF 형제 판정은 모두
     * EXCLUSIVE 일 때만). rM1 직전 경로에는 S_Y 가 없으므로 세트 저장 검사는 rM1 에서 IF_SIBLING 으로 거부하고, 확정 검사도 SET_IF_SIBLING 을 낸다.
     */
    @Test
    void 이_룰이_형제_갈래에서_다른_룰의_결과를_읽으면_합류_뒤에_이_룰이_또_있어도_SET_IF_SIBLING_이다() {
        otherRule("R_O", "X_IN", "S_Y");
        otherRule("R_M", "S_Y", "S_M_OUT");
        String flow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"s1\",\"kind\":\"IF\"},"
                + "{\"id\":\"rO\",\"kind\":\"RULE\",\"ruleId\":\"R_O\"},{\"id\":\"rM1\",\"kind\":\"RULE\",\"ruleId\":\"R_M\"},"
                + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"s1\"},{\"id\":\"rM2\",\"kind\":\"RULE\",\"ruleId\":\"R_M\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"s1\"},{\"id\":\"e2\",\"from\":\"s1\",\"to\":\"rO\",\"order\":1,\"cond\":\"X_IN > 1\"},"
                + "{\"id\":\"e3\",\"from\":\"s1\",\"to\":\"rM1\",\"otherwise\":true},{\"id\":\"e4\",\"from\":\"rO\",\"to\":\"m1\"},"
                + "{\"id\":\"e5\",\"from\":\"rM1\",\"to\":\"m1\"},{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"rM2\"},{\"id\":\"e7\",\"from\":\"rM2\",\"to\":\"end\"}]}";
        ruleSet("S_IFREAD2", "INUSE", "R_O", "R_M");
        DmeTestSupport.ruleSetFlow(jdbc, "S_IFREAD2", flow);
        IoName xIn = new IoName("X_IN", RuleIo.NONE, null, null, null, false, null);
        Map<String, RuleIo> rules = new LinkedHashMap<>();
        rules.put("R_O", new RuleIo("R_O", "R_O", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(xIn), List.of(ioName("S_Y"))));
        rules.put("R_M", new RuleIo("R_M", "R_M", "DECISION", "INUSE", true, "1.000", "FIRST", List.of(ioName("S_Y")), List.of(ioName("S_M_OUT"))));
        List<RuleSetCheck> set = RuleSetAnalyzer.checks(RuleSetFlowJson.parse(flow), rules, Map.of("e2", new CondIo(true, null, List.of(xIn))));
        assertTrue(set.stream().anyMatch(c -> RuleSetCheck.IF_SIBLING.equals(c.code()) && "R_M".equals(c.ruleId()) && "rM1".equals(c.nodeId())
                && "S_Y".equals(c.varName()) && "R_O".equals(c.otherRuleId())), set.toString());

        List<Map<String, Object>> r = orderCheck("R_M");

        assertEquals(List.of("SET_IF_SIBLING"), checkCodes(r), r.toString());
        assertTrue(String.valueOf(r.get(0).get("message")).contains("R_M ← [S_Y]"), r.toString());
    }

    // ── P4 합격 기준 — 코퍼스·퍼즈 사례로 세트 저장 검사(분석기)와 확정 검사 대조 ──

    /** lib 테스트 자원(api 테스트 작업 디렉터리 = api 모듈 루트). api 테스트 클래스패스에는 lib 테스트 자원이 없어 파일로 읽는다. */
    private static final Path RULE_RES = Path.of("../lib/src/test/resources/com/dongkuk/dmes/mdm/common/rule");

    /** 퍼즈 사례 가운데 대조에 쓰는 앞쪽 개수(시간이 길면 줄인다 — 브리프 Step 6). */
    private static final int FUZZ_LIMIT = 200;

    private static final ObjectMapper JSON = new ObjectMapper();

    /** 대조 한 사례 — 분석기 결과(한 번)와, 흐름의 룰마다 me 로 둔 확정 검사 결과. */
    private record Compared(String name, Map<String, RuleIo> rules, List<RuleSetCheck> set, Map<String, List<SiblingRead>> pairs,
                            Map<String, List<Map<String, Object>>> issues) {
    }

    /** 사례 수와 뺀 사례 수 — 키는 파일(corpus·fuzz). */
    private record Tally(Map<String, Integer> total, Map<String, Integer> structure, Map<String, Integer> dictOverlap, List<Compared> cases) {

        String summary() {
            return "사례 " + total + " · 뺀 사례: 구조 오류 " + structure + ", DICT·결과 이름 겹침 " + dictOverlap + " · 대조 " + cases.size();
        }
    }

    private static JsonNode cases(String file) throws IOException {
        JsonNode root = JSON.readTree(RULE_RES.resolve(file).toFile());
        assertEquals(1, root.path("version").asInt(), file);
        return root.path("cases");
    }

    /** 코퍼스 전부와 퍼즈 앞 {@link #FUZZ_LIMIT}개를 읽어, 뺄 사례를 세고 나머지를 SQLite 에 시드해 두 검사를 돌린다. */
    private Tally compareCases() throws IOException {
        List<Map.Entry<JsonNode, String>> all = new ArrayList<>();
        cases("rule-set-corpus.json").forEach(c -> all.add(Map.entry(c, "corpus")));
        JsonNode fuzz = cases("rule-set-fuzz.json");
        for (int i = 0; i < Math.min(FUZZ_LIMIT, fuzz.size()); i++) {
            all.add(Map.entry(fuzz.get(i), "fuzz"));
        }
        Map<String, Integer> total = new LinkedHashMap<>();
        Map<String, Integer> structure = new LinkedHashMap<>();
        Map<String, Integer> dictOverlap = new LinkedHashMap<>();
        List<Compared> out = new ArrayList<>();
        for (Map.Entry<JsonNode, String> entry : all) {
            JsonNode c = entry.getKey();
            String source = entry.getValue();
            total.merge(source, 1, Integer::sum);
            String name = c.path("name").asText();
            List<String> ids = new ArrayList<>();
            c.path("ids").forEach(n -> ids.add(n.asText()));
            Map<String, RuleIo> rules = new LinkedHashMap<>();
            c.path("rules").properties().forEach(e -> rules.put(e.getKey(), corpusRule(e.getKey(), e.getValue())));
            Map<String, CondIo> condIo = corpusCondIo(c.path("condIo"));
            FlowDefinition flow = c.has("flow") ? RuleSetFlowJson.parse(c.get("flow").toString()) : FlowParser.linear(ids);
            FlowParse parse = FlowParser.parse(flow);
            if (!parse.issues().isEmpty() || parse.tree() == null) {
                structure.merge(source, 1, Integer::sum);
                continue;
            }
            if (dictNamesOverlapResults(rules, condIo)) {
                dictOverlap.merge(source, 1, Integer::sum);
                continue;
            }
            rules.forEach((id, r) -> assertTrue(r.conds().stream().noneMatch(x -> r.results().stream().anyMatch(y -> y.name().equals(x.name()))),
                    name + " " + id + " — 자기 결과를 읽는 룰이 있으면 PAR_SIBLING 읽기·대입 문구 구분이 흐려진다"));
            List<RuleSetCheck> set = RuleSetAnalyzer.checks(flow, rules, condIo);
            seedCase(ids, rules, condIo, c.has("flow") ? c.get("flow").toString() : null);
            Map<String, List<SiblingRead>> pairs = new LinkedHashMap<>();
            Map<String, List<Map<String, Object>>> issues = new LinkedHashMap<>();
            for (String me : parse.tree().ruleIds()) {
                RuleSaveContext ctx = new RuleSaveContext(me, DmeTestSupport.v(1), "DECISION", "FIRST", rawVars(me, rules.get(me)), List.of(), List.of(), List.of(),
                        RuleSaveTarget.TABLE);
                pairs.put(me, orderCheck.siblingReads(ctx));
                issues.put(me, orderCheck.check(ctx));
            }
            out.add(new Compared(name, rules, set, pairs, issues));
        }
        return new Tally(total, structure, dictOverlap, out);
    }

    /** DICT 출처 이름(룰 조건·조건식 변수)과 어떤 룰의 결과 이름이 겹치는가 — 분석기는 DICT 를 건너뛰고 확정 검사는 이름만 본다(P4 제외 사례). */
    private static boolean dictNamesOverlapResults(Map<String, RuleIo> rules, Map<String, CondIo> condIo) {
        Set<String> dict = new HashSet<>();
        rules.values().forEach(r -> r.conds().stream().filter(x -> RuleIo.DICT.equals(x.source())).forEach(x -> dict.add(x.name())));
        condIo.values().forEach(io -> io.vars().stream().filter(x -> RuleIo.DICT.equals(x.source())).forEach(x -> dict.add(x.name())));
        return rules.values().stream().flatMap(r -> r.results().stream()).anyMatch(x -> dict.contains(x.name()));
    }

    /** 사례 하나를 원장에 시드 — 있는 룰(없는 룰은 넣지 않는다)과 RELEASED 버전의 조건·결과 변수, DICT 이름은 컬럼 사전, INUSE 세트 S_CMP. */
    private void seedCase(List<String> ids, Map<String, RuleIo> rules, Map<String, CondIo> condIo, String flowJson) {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        Set<String> dict = new LinkedHashSet<>();
        rules.forEach((id, r) -> {
            if (!r.exists()) {
                return;
            }
            DmeTestSupport.rule(jdbc, id, id, "DECISION", r.status() == null ? "INUSE" : r.status());
            if (r.releasedVer() == null) {
                return;
            }
            DmeTestSupport.released(jdbc, id, new BigDecimal(r.releasedVer()), "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
            int varId = 0;
            for (IoName x : r.conds()) {
                varId++;
                DmeTestSupport.var(jdbc, id, new BigDecimal(r.releasedVer()), varId, "COND", "1", x.name(), varId, null);
                if (RuleIo.DICT.equals(x.source())) {
                    dict.add(x.name());
                }
            }
            for (IoName x : r.results()) {
                varId++;
                DmeTestSupport.var(jdbc, id, new BigDecimal(r.releasedVer()), varId, "RESULT", "Value", x.name(), varId, "STRING");
            }
        });
        condIo.values().forEach(io -> io.vars().stream().filter(x -> RuleIo.DICT.equals(x.source())).forEach(x -> dict.add(x.name())));
        for (String n : dict) {
            DmeTestSupport.column(jdbc, n, DmeTestSupport.domain(jdbc, n + "_D", "TEXT", "STRING", null));
        }
        ruleSet("S_CMP", "INUSE", ids.toArray(String[]::new));
        if (flowJson != null) {
            DmeTestSupport.ruleSetFlow(jdbc, "S_CMP", flowJson);
        }
    }

    /** me 의 저장하려는 정의 자리 — 사례의 조건·결과 이름으로 만든 변수(분석기가 보는 me 의 입출력과 같다). 없는 룰은 빈 정의. */
    private static List<MdmRuleVar> rawVars(String me, RuleIo r) {
        List<MdmRuleVar> out = new ArrayList<>();
        if (r == null || !r.exists()) {
            return out;
        }
        int varId = 0;
        for (IoName x : r.conds()) {
            MdmRuleVar v = new MdmRuleVar(me, DmeTestSupport.v(1), ++varId, "COND", varId);
            v.setVarName(x.name());
            out.add(v);
        }
        for (IoName x : r.results()) {
            MdmRuleVar v = new MdmRuleVar(me, DmeTestSupport.v(1), ++varId, "RESULT", varId);
            v.setVarName(x.name());
            out.add(v);
        }
        return out;
    }

    /** 분석기 PAR_SIBLING 가운데 읽기 판정(varName 이 그 룰의 조건) — 대입 판정(결과 이름)과 가른다. */
    private static boolean readSibling(RuleSetCheck k, Map<String, RuleIo> rules) {
        if (RuleSetCheck.IF_SIBLING.equals(k.code())) {
            return true;
        }
        RuleIo r = rules.get(k.ruleId());
        return RuleSetCheck.PAR_SIBLING.equals(k.code()) && r != null && r.conds().stream().anyMatch(x -> x.name().equals(k.varName()));
    }

    @Test
    void P4_가_확정_검사가_형제_읽기로_내는_변수는_세트_저장_검사도_같은_노드에서_거부한다() throws IOException {
        Tally t = compareCases();
        Set<String> rejectCodes = Set.of(RuleSetCheck.IF_SIBLING, RuleSetCheck.PAR_SIBLING, RuleSetCheck.ORDER, RuleSetCheck.CYCLE);
        int checked = 0;
        int checkedOther = 0;
        for (Compared c : t.cases()) {
            for (Map.Entry<String, List<SiblingRead>> e : c.pairs().entrySet()) {
                String me = e.getKey();
                for (SiblingRead p : e.getValue()) {
                    for (String x : p.meReads()) {
                        checked++;
                        boolean matched = c.set().stream().anyMatch(k -> me.equals(k.ruleId()) && p.meNode().equals(k.nodeId()) && x.equals(k.varName())
                                && rejectCodes.contains(k.code()) && (!RuleSetCheck.PAR_SIBLING.equals(k.code()) || readSibling(k, c.rules())));
                        assertTrue(matched, c.name() + " me=" + me + " " + p + " 변수 " + x + " — 세트 저장 검사: " + c.set());
                    }
                    // 반대 방향 — other 노드가 읽는 me 의 결과도 세트 저장 검사가 other 의 그 노드·그 변수에서 거부한다.
                    for (String y : p.otherReads()) {
                        checkedOther++;
                        boolean matched = c.set().stream().anyMatch(k -> p.otherRuleId().equals(k.ruleId()) && p.otherNode().equals(k.nodeId())
                                && y.equals(k.varName()) && rejectCodes.contains(k.code())
                                && (!RuleSetCheck.PAR_SIBLING.equals(k.code()) || readSibling(k, c.rules())));
                        assertTrue(matched, c.name() + " me=" + me + " " + p + " other 가 읽는 " + y + " — 세트 저장 검사: " + c.set());
                    }
                }
                List<Object> codes = checkCodes(c.issues().get(me));
                if (e.getValue().stream().anyMatch(p -> p.relation() == FlowTree.Relation.EXCLUSIVE)) {
                    assertTrue(codes.contains("SET_IF_SIBLING"), c.name() + " me=" + me + " " + c.issues().get(me));
                } else {
                    assertFalse(codes.contains("SET_IF_SIBLING"), c.name() + " me=" + me + " 쌍 없이 SET_IF_SIBLING: " + c.issues().get(me));
                }
                if (e.getValue().stream().anyMatch(p -> p.relation() == FlowTree.Relation.PARALLEL)) {
                    assertTrue(codes.contains("SET_PAR_SIBLING"), c.name() + " me=" + me + " " + c.issues().get(me));
                }
            }
        }
        System.out.println("[P4 가] " + t.summary() + " · 확정 검사 형제 읽기 변수 me 쪽 " + checked + "건 · other 쪽 " + checkedOther + "건 대조");
        assertTrue(checked > 0 && checkedOther > 0, "대조한 형제 읽기가 없다 — 사례가 판정을 건드리지 않는다: " + t.summary());
    }

    @Test
    void P4_나_세트_저장_검사가_형제_읽기로_거부하면_확정_검사도_그_룰에_낸다() throws IOException {
        Tally t = compareCases();
        int checked = 0;
        for (Compared c : t.cases()) {
            for (RuleSetCheck k : c.set()) {
                if (!readSibling(k, c.rules()) || !c.pairs().containsKey(k.ruleId())) {
                    continue;
                }
                checked++;
                boolean ifs = RuleSetCheck.IF_SIBLING.equals(k.code());
                FlowTree.Relation rel = ifs ? FlowTree.Relation.EXCLUSIVE : FlowTree.Relation.PARALLEL;
                boolean paired = c.pairs().get(k.ruleId()).stream().anyMatch(p -> p.relation() == rel && p.meNode().equals(k.nodeId())
                        && p.otherRuleId().equals(k.otherRuleId()) && p.meReads().contains(k.varName()));
                assertTrue(paired, c.name() + " " + k + " — 확정 검사 쌍: " + c.pairs().get(k.ruleId()));
                assertTrue(checkCodes(c.issues().get(k.ruleId())).contains(ifs ? "SET_IF_SIBLING" : "SET_PAR_SIBLING"),
                        c.name() + " " + k + " — 확정 검사: " + c.issues().get(k.ruleId()));
            }
        }
        System.out.println("[P4 나] " + t.summary() + " · 세트 저장 검사 형제 읽기 " + checked + "건 대조");
        assertTrue(checked > 0, "대조한 세트 저장 검사 형제 읽기가 없다: " + t.summary());
    }

    /** RuleSetCorpusTest 의 빈 칸 채움 규칙 그대로 — 빠진 칸은 null·false·빈 목록. */
    private static RuleIo corpusRule(String id, JsonNode r) {
        List<IoName> conds = new ArrayList<>();
        r.path("conds").forEach(n -> conds.add(new IoName(text(n, "name"), text(n, "source"), null, null, null, false, null)));
        List<IoName> results = new ArrayList<>();
        r.path("results").forEach(n -> results.add(new IoName(text(n, "name"), null, null, null, null, false, null)));
        JsonNode ver = r.path("releasedVer");
        return new RuleIo(id, null, null, text(r, "status"), r.path("exists").asBoolean(false),
                ver.isNull() || ver.isMissingNode() ? null : VersionNumbers.plain(VersionNumbers.parse(ver.asText())), null, conds, results);
    }

    /** RuleSetCorpusTest 의 condIo 읽기 그대로. */
    private static Map<String, CondIo> corpusCondIo(JsonNode node) {
        Map<String, CondIo> out = new LinkedHashMap<>();
        node.properties().forEach(e -> {
            List<IoName> vars = new ArrayList<>();
            e.getValue().path("vars").forEach(v -> vars.add(new IoName(text(v, "name"), text(v, "source"), null, null, null, false, null)));
            out.put(e.getKey(), new CondIo(e.getValue().path("ok").asBoolean(false), text(e.getValue(), "message"), vars));
        });
        return out;
    }

    private static String text(JsonNode node, String field) {
        JsonNode v = node.path(field);
        return v.isNull() || v.isMissingNode() ? null : v.asText();
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
    void 열_설정_적용도_열_조건의_MASTER_대상이_없으면_거부한다() {
        // 2026-09-28 — 변수 칸에 식(식 변수)을 받지 않으므로 열 설정에서 식을 적는 칸은 결과 그룹의 열 조건(grp_cond) 하나다.
        List<Map<String, Object>> cols = qCols();
        Map<String, Object> first = col(-1, "RESULT", "Value", "GRD_HIGH");
        first.putAll(Map.of("dataType", "STRING", "resGrp", "GRD_OUT", "label", "마스터 확인",
                "grpCond", "MASTER(\"NO_SUCH\", \"BASE\", SURF_GRD) == \"Y\""));
        Map<String, Object> dflt = col(-2, "RESULT", "Value", "GRD_BASE");
        dflt.putAll(Map.of("dataType", "STRING", "resGrp", "GRD_OUT"));
        cols.add(first);
        cols.add(dflt);

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
