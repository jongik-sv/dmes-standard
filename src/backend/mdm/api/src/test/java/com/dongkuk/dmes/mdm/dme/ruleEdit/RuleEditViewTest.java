package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.ResolvedVar;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleDomainSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleDomainSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleExprParseResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-02 design §3.1 「RuleEditViewTest」 — view 조립(§6.2·§6.3.1): 기본 버전 고르기, {@code editable}(I7: MDM·DRAFT·소유자),
 * {@code headerEditable}(D6), {@code me}, base 행, 해석된 타입, 서버 검사 결과. 파사드(RuleEditService)의 룰 고르기·위임도 본다.
 * 현재 시각은 2026-06-15 09:00 KST.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleEditViewTest {

    @TempDir
    static Path tempDir;

    @Autowired
    RuleEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-edit-view-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
    }

    private RuleEditViewResult view(String id, Integer ver) {
        RuleEditViewRequest r = new RuleEditViewRequest();
        r.setMaruRuleId(id);
        r.setVer(ver);
        return service.view(r);
    }

    @Test
    void RELEASED_만_있으면_현재_RELEASED_를_열고_편집할_수_없다() {
        RuleEditViewResult v = view("QLTY_GRD_JDG", null);
        assertEquals("kim", v.getMe());
        assertEquals(1, v.getSelectedVer());
        assertFalse(v.isEditable());
        assertTrue(v.isHeaderEditable(), "미적용 버전이 없으면 담당자가 헤더를 고친다(D6)");
        assertFalse(v.isUnappliedVersionExists());
        assertFalse(v.isConfirmScreenReady());
        assertEquals("품질 등급 판정", v.getRule().getMaruRuleName());
        assertEquals("MDM", v.getRule().getSourceKind());
        assertEquals("INUSE", v.getRule().getStatus());
        assertEquals(1, v.getVersions().size());
        RuleEditViewResult.VersionInfo ver = v.getVersions().get(0);
        assertEquals("RELEASED", ver.getStatus());
        assertEquals("2026-01-01 00:00:00", ver.getApplyFrom());
        assertEquals("9999-12-31 00:00:00", ver.getApplyTo());
        assertEquals("FIRST", ver.getHitPolicy());
        assertEquals(List.of(1, 2, 3, 4), v.getRows().stream().map(RuleEditViewResult.RowInfo::getRowId).toList());
        assertEquals(List.of(), v.getBaseRows());
    }

    @Test
    void 변수는_조건_먼저_seq_순이고_서버가_해석한_타입을_싣는다() {
        RuleEditViewResult v = view("QLTY_GRD_JDG", null);
        assertEquals(List.of(1, 2, 3, 4, 5), v.getVars().stream().map(ResolvedVar::varId).toList());
        ResolvedVar thk = v.getVars().get(0);
        assertEquals("NUMBER", thk.dataType());
        assertEquals(2, thk.scale());
        assertEquals("COLUMN", thk.typeSource());
        assertEquals("STRING", v.getVars().get(3).dataType());
        assertEquals("DECLARED", v.getVars().get(3).typeSource());
    }

    @Test
    void 서버_검사_결과를_싣는다() {
        RuleEditViewResult v = view("QLTY_GRD_JDG", null);
        assertEquals(List.of("NULL_GAP", "NULL_GAP"), v.getIssues().stream().map(i -> i.get("code")).toList());
        assertEquals(List.of(1, 3), v.getIssues().stream().map(i -> i.get("varId")).toList());
        assertFalse(v.getIssues().get(0).containsKey("lower"), "값이 없는 칸은 싣지 않는다");
    }

    @Test
    void 미적용_DRAFT_가_있으면_그것을_먼저_열고_소유자에게만_편집을_연다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "UNIQUE", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        RuleEditViewResult mine = view("QLTY_GRD_JDG", null);
        assertEquals(2, mine.getSelectedVer());
        assertTrue(mine.isEditable());
        assertTrue(mine.isHeaderEditable());
        assertTrue(mine.isUnappliedVersionExists());
        assertEquals(List.of(1, 2, 3, 4), mine.getBaseRows().stream().map(RuleEditViewResult.RowInfo::getRowId).toList());
        assertEquals(List.of(2, 1), mine.getVersions().stream().map(RuleEditViewResult.VersionInfo::getVer).toList(), "ver 내림차순");
        assertEquals(1, mine.getVersions().get(0).getBaseVer());

        currentUser.set("lee", STEWARD);
        RuleEditViewResult other = view("QLTY_GRD_JDG", null);
        assertEquals("lee", other.getMe());
        assertFalse(other.isEditable(), "비소유자는 표를 편집할 수 없다(I7)");
        assertFalse(other.isHeaderEditable(), "미적용 버전의 소유자가 아니면 헤더도 못 고친다(D6)");
        assertEquals(4, other.getRows().size(), "읽기는 누구나 된다");
    }

    @Test
    void 버전을_고르면_그_버전을_연다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "UNIQUE", 1);
        RuleEditViewResult v = view("QLTY_GRD_JDG", 1);
        assertEquals(1, v.getSelectedVer());
        assertFalse(v.isEditable());
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> view("QLTY_GRD_JDG", 9)).getErrorCode());
    }

    @Test
    void 결재_중_버전이_현재_RELEASED_보다_먼저다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "REQUESTED", null, "FIRST", 1);
        assertEquals(2, view("QLTY_GRD_JDG", null).getSelectedVer());
    }

    @Test
    void 현재_RELEASED_가_없으면_가장_큰_버전을_연다() {
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-02-01 00:00:00' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 3, "FIRST", "2026-07-01 00:00:00", null);
        assertEquals(3, view("QLTY_GRD_JDG", null).getSelectedVer());
    }

    @Test
    void 버전이_없으면_선택_버전이_없고_빈_표다() {
        DmeTestSupport.rule(jdbc, "EMPTY_JDG", "빈", "DECISION", "CREATED");
        RuleEditViewResult v = view("EMPTY_JDG", null);
        assertNull(v.getSelectedVer());
        assertEquals(List.of(), v.getVars());
        assertEquals(List.of(), v.getRows());
        assertEquals(List.of(), v.getIssues());
        assertFalse(v.isEditable());
    }

    @Test
    void 외부_원천_룰은_DRAFT_소유자라도_편집할_수_없다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        RuleEditViewResult v = view("EXT_JDG", null);
        assertFalse(v.isEditable());
        assertFalse(v.isHeaderEditable());
        assertEquals("EXTERNAL", v.getRule().getSourceKind());
        assertEquals("MES", v.getRule().getSourceSystem());
    }

    @Test
    void 담당자가_아니면_미적용_버전이_없어도_헤더를_못_고친다() {
        currentUser.set("stdadmin", STD_ADMIN);
        assertFalse(view("QLTY_GRD_JDG", null).isHeaderEditable());
    }

    @Test
    void 없는_룰은_INVALID_VALUE_다() {
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> view("NO_SUCH", null)).getErrorCode());
    }

    // ── 파사드 ──

    @Test
    void 룰_고르기는_ID_나_룰명_앞부분으로_20건까지_찾는다() {
        DmeTestSupport.rule(jdbc, "BASE_SPD_LKP", "기본 속도 조회", "DECISION", "INUSE");
        for (int i = 0; i < 25; i++) {
            DmeTestSupport.rule(jdbc, "QX_" + (100 + i), "품질 대량 " + i, "DECISION", "CREATED");
        }
        RuleEditSearchRequest r = new RuleEditSearchRequest();
        r.setKeyword("qlty");
        RuleEditSearchResult byId = service.searchRules(r);
        assertEquals(List.of("QLTY_GRD_JDG"), byId.getList().stream().map(RuleEditSearchResult.Row::getMaruRuleId).toList());
        r.setKeyword("기본");
        assertEquals(List.of("BASE_SPD_LKP"), service.searchRules(r).getList().stream().map(RuleEditSearchResult.Row::getMaruRuleId).toList());
        r.setKeyword("GRD");
        assertEquals(List.of(), service.searchRules(r).getList(), "앞부분 일치만 본다");
        r.setKeyword("Q");
        assertEquals(20, service.searchRules(r).getList().size());
        r.setKeyword(null);
        assertEquals(20, service.searchRules(r).getList().size());
    }

    @Test
    void 저장과_삭제는_모르는_part_와_target_을_거부한다() {
        RuleEditSaveRequest save = new RuleEditSaveRequest();
        save.setPart("NOSUCH"); // COLUMNS 는 TSK-08-03 이 실현 — 모르는 part 는 없는 이름으로 잣는다
        save.setMaruRuleId("QLTY_GRD_JDG");
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> service.save(save)).getErrorCode());
        RuleVersionRequest delete = new RuleVersionRequest();
        delete.setMaruRuleId("QLTY_GRD_JDG");
        delete.setTarget("ALL");
        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class, () -> service.delete(delete)).getErrorCode());
    }

    @Test
    void 파사드는_part_와_target_으로_위임한다() {
        RuleEditSaveRequest header = new RuleEditSaveRequest();
        header.setPart("HEADER");
        header.setMaruRuleId("QLTY_GRD_JDG");
        header.setMaruRuleName("파사드로 바꿈");
        assertEquals("HEADER", service.save(header).getPart());
        assertEquals("파사드로 바꿈", jdbc.queryForObject("SELECT MARU_RULE_NAME FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", String.class));

        RuleVersionRequest copy = new RuleVersionRequest();
        copy.setMaruRuleId("QLTY_GRD_JDG");
        assertEquals(2, service.newVersion(copy).getVer());
        RuleVersionRequest delete = new RuleVersionRequest();
        delete.setMaruRuleId("QLTY_GRD_JDG");
        delete.setVer(2);
        delete.setRowVersion(0L);
        delete.setTarget("VERSION");
        service.delete(delete);
        assertEquals(0, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2"));
        delete.setTarget("RULE");
        service.delete(delete);
        assertEquals("DEPRECATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'", String.class));
        Map<String, Object> rule = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        assertEquals("파사드로 바꿈", rule.get("MARU_RULE_NAME"));
    }

    // ── TSK-08-03: parseExpr·searchDomains 액션, view 확장(varCandidates·baseVars) ──

    private RuleExprParseRequest expr(String text) {
        RuleExprParseRequest r = new RuleExprParseRequest();
        r.setText(text);
        r.setSlot("RULE_RESULT_EXPR");
        return r;
    }

    @Test
    void parseExpr_은_AST_참조변수_화면평가_가능여부를_돌려준다() {
        RuleExprParseResult ok = service.parseExpr(expr("ROUND(COIL_THK * 2, 1)"));
        assertTrue(ok.isSupported(), "BASE 함수만 쓰면 화면이 평가한다(evalex-guide §8.5)");
        assertEquals(List.of("COIL_THK"), ok.getRefVars());
        assertFalse(ok.getAst().isEmpty(), "서버 EvalEx 파싱 결과 AST 를 내려준다(불변 9)");
        assertTrue(ok.getProblems().isEmpty());

        RuleExprParseResult master = service.parseExpr(expr("MASTER(\"GRADE\", \"CODE\", \"attr01\")"));
        assertFalse(master.isSupported(), "MDM 함수는 화면이 못 평가한다 — 서버 평가로 넘긴다");

        assertEquals(ErrorCode.INVALID_VALUE, assertThrows(BusinessException.class,
                () -> service.parseExpr(expr("COIL_THK +"))).getErrorCode(), "파싱 오류");
    }

    @Test
    void searchDomains_는_ID_앞일치_우선으로_8건까지_돌려준다() {
        for (int i = 1; i <= 10; i++) {
            DmeTestSupport.domain(jdbc, "SPD_D_" + i, "QTY", "NUMBER", 0);
        }
        DmeTestSupport.domain(jdbc, "X_SPD_D", "TEXT", "STRING", null);
        long spd = DmeTestSupport.domain(jdbc, "SPEED_MPM_D", "QTY", "NUMBER", 0);
        jdbc.update("UPDATE TB_MDM_DOMAIN SET STD_RULE = 'v > 0' WHERE DOMAIN_ID = ?", spd);

        RuleDomainSearchRequest q = new RuleDomainSearchRequest();
        q.setKeyword("SPD");
        List<RuleDomainSearchResult.Row> rows = service.searchDomains(q).getRows();
        assertEquals(8, rows.size(), "많이 겹쳐도 8건");
        assertEquals("SPD_D_1", rows.get(0).getStdName(), "ID 앞일치가 먼저");
        assertTrue(rows.stream().allMatch(r -> r.getStdName().startsWith("SPD_D")), "앞일치 그룹이 우선한다");

        q.setKeyword("SPEED");
        RuleDomainSearchResult.Row speed = service.searchDomains(q).getRows().get(0);
        assertEquals("SPEED_MPM_D", speed.getStdName());
        assertEquals("NUMBER", speed.getDataType());
        assertEquals("v > 0", speed.getStdRule(), "검증식을 함께 보여준다");
    }

    @Test
    void view_는_변수_후보와_base_버전_변수를_싣는다() {
        DmeTestSupport.rule(jdbc, "PREV_JDG", "앞 룰", "DECISION", "INUSE");
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_VAR_ID = 1 WHERE MARU_RULE_ID = 'PREV_JDG'");
        DmeTestSupport.released(jdbc, "PREV_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "PREV_JDG", 1, 1, "RESULT", "Value", "PREV_GRADE", 1, "STRING");
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);

        RuleEditViewResult v = view("QLTY_GRD_JDG", 2);
        List<RuleEditViewResult.VarCandidate> cand = v.getVarCandidates();
        assertTrue(cand.stream().anyMatch(c -> "COIL_THK".equals(c.getName()) && "COLUMN".equals(c.getKind())),
                "컬럼 사전 물리명(datalist 소스)");
        assertTrue(cand.stream().anyMatch(c -> "PREV_GRADE".equals(c.getName()) && "RULE_RESULT".equals(c.getKind())),
                "앞 룰 결과 변수");
        assertEquals(List.of(1, 2, 3, 4, 5), v.getBaseVars().stream().map(ResolvedVar::varId).toList(),
                "base(RELEASED) 버전의 변수 — 계약 diff 몫");
        assertEquals("QLTY_GRD", v.getBaseVars().get(3).varName());
    }

    @Test
    void view_는_열_설정이_되돌려_보낼_저장_원값을_varMeta_로_싣는다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET AXIS = 'ROW' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 1");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET RES_GRP = 'GRD', GRP_COND = 'COIL_THK > 1', COLLECT_AGG = 'LIST',"
                + " PRIO_LIST = '[\"A\",\"B\"]' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4");

        Map<Integer, RuleEditViewResult.VarMeta> meta = new java.util.HashMap<>();
        view("QLTY_GRD_JDG", 2).getVarMeta().forEach(m -> meta.put(m.getVarId(), m));

        assertEquals(5, meta.size());
        assertEquals("ROW", meta.get(1).getAxis());
        assertNull(meta.get(1).getDomainId(), "사전 컬럼 조건 열은 저장 원값이 null 이다(해석된 ResolvedVar.domainId 와 다르다)");
        assertNull(meta.get(4).getDomainId());
        assertEquals("STRING", meta.get(4).getDataType());
        assertEquals("GRD", meta.get(4).getResGrp());
        assertEquals("COIL_THK > 1", meta.get(4).getGrpCond());
        assertEquals("LIST", meta.get(4).getCollectAgg());
        assertEquals(List.of("A", "B"), meta.get(4).getPrioList());
    }

    @Test
    void view_는_base_버전의_저장_원값을_baseVarMeta_로_싣는다_지금_버전_값과_섞이지_않는다() {
        DmeTestSupport.pending(jdbc, "QLTY_GRD_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET RES_GRP = 'GRD', GRP_COND = 'COIL_THK > 1' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG' AND VER = 2 AND VAR_ID = 4");

        RuleEditViewResult v = view("QLTY_GRD_JDG", 2);
        Map<Integer, RuleEditViewResult.VarMeta> base = new java.util.HashMap<>();
        v.getBaseVarMeta().forEach(m -> base.put(m.getVarId(), m));

        assertEquals(v.getBaseVars().size(), base.size(), "base 변수마다 한 건");
        assertNull(base.get(4).getGrpCond(), "base(v1) 의 열 조건은 지금(v2) 초안에서 고친 값이 아니다");
        assertEquals("COIL_THK > 1", v.getVarMeta().stream().filter(m -> m.getVarId() == 4).findFirst().orElseThrow().getGrpCond());
    }

    @Test
    void base_버전이_없으면_baseVarMeta_는_빈_목록이다() {
        RuleEditViewResult v = view("QLTY_GRD_JDG", 1);
        assertEquals(List.of(), v.getBaseVarMeta());
    }
    @Test
    void 테스트_케이스를_case_id_오름차순으로_저장된_글자_그대로_버전과_무관하게_싣는다() {
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION) "
                + "VALUES ('QLTY_GRD_JDG', 2, '둘', '{\"COIL_THK\": 1.50}', NULL, NULL, 3)");
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION) "
                + "VALUES ('QLTY_GRD_JDG', 1, '하나', '{\"SURF_GRD\":\"A\"}', '{\"QLTY_GRD\":\"A\",\"hit\":1}', '설명', 0)");

        List<RuleEditViewResult.TestCaseInfo> cases = view("QLTY_GRD_JDG", 1).getTestCases();

        assertEquals(List.of(1, 2), cases.stream().map(RuleEditViewResult.TestCaseInfo::getCaseId).toList());
        RuleEditViewResult.TestCaseInfo one = cases.get(0);
        assertEquals("하나", one.getCaseName());
        assertEquals("{\"SURF_GRD\":\"A\"}", one.getInputJson());
        assertEquals("{\"QLTY_GRD\":\"A\",\"hit\":1}", one.getExpectedJson());
        assertEquals("설명", one.getDescription());
        assertEquals(0L, one.getRowVersion());
        RuleEditViewResult.TestCaseInfo two = cases.get(1);
        assertEquals("{\"COIL_THK\": 1.50}", two.getInputJson(), "JSON 을 다시 쓰지 않는다");
        assertNull(two.getExpectedJson());
        assertEquals(3L, two.getRowVersion());
        DmeTestSupport.rule(jdbc, "EMPTY_OTHER", "케이스 없음", "DECISION", "CREATED");
        assertEquals(List.of(), view("EMPTY_OTHER", null).getTestCases(), "케이스가 없는 룰은 빈 목록");
    }

    @Test
    void 버전이_없어도_테스트_케이스는_싣는다() {
        DmeTestSupport.rule(jdbc, "EMPTY_JDG", "빈", "DECISION", "CREATED");
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, ROW_VERSION) "
                + "VALUES ('EMPTY_JDG', 1, '하나', '{}', 0)");
        RuleEditViewResult v = view("EMPTY_JDG", null);
        assertNull(v.getSelectedVer());
        assertEquals(List.of(1), v.getTestCases().stream().map(RuleEditViewResult.TestCaseInfo::getCaseId).toList());
    }
}
