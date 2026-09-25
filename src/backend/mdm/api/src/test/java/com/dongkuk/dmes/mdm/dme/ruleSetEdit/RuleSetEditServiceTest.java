package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetGuideResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetRuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-08-06 design §2.2 「RuleSetEditServiceTest」 — ruleSetEdit 의 search(SET·RULE·GUIDE)·view·save·delete(폐기)·restore(되살리기).
 * 불변 규칙 I3(버전·룰 테이블 무관)·I12(서버 재계산·조건부 UPDATE)·I13(요청 검사)·I14(폐기)·I15(되살리기)·I19(담당자)·I23(한 행만).
 *
 * <p>룰 픽스처(모두 VER 1 RELEASED, 조건은 이름 조건 열, 결과 하나): 사전 SET_THK·SET_WID. R_GRD(SET_THK → S_GRD), R_FCT(S_GRD·SET_WID → S_FCT),
 * R_SPD(S_FCT → S_SPD), R_DUP(SET_WID → S_GRD), R_CYA(S_CYB → S_CYA)·R_CYB(S_CYA → S_CYB), R_UNK(X_UNKNOWN → S_UNK), R_PROG(P_IN 선언 → S_PRG),
 * R_OLD(DEPRECATED, SET_THK → S_OLD), R_NOREL(RELEASED 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetEditServiceTest {

    @TempDir
    static Path tempDir;

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-rule-set-edit-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        jdbc.execute("DROP TRIGGER IF EXISTS TR_RULE_VER_FAIL");
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));

        DmeTestSupport.column(jdbc, "SET_THK", DmeTestSupport.domain(jdbc, "SET_THK_D", "QTY", "NUMBER", 2));
        DmeTestSupport.column(jdbc, "SET_WID", DmeTestSupport.domain(jdbc, "SET_WID_D", "QTY", "NUMBER", 0));
        rule("R_GRD", "INUSE", "S_GRD", "SET_THK");
        rule("R_FCT", "INUSE", "S_FCT", "S_GRD", "SET_WID");
        rule("R_SPD", "INUSE", "S_SPD", "S_FCT");
        rule("R_DUP", "INUSE", "S_GRD", "SET_WID");
        rule("R_CYA", "INUSE", "S_CYA", "S_CYB");
        rule("R_CYB", "INUSE", "S_CYB", "S_CYA");
        rule("R_UNK", "INUSE", "S_UNK", "X_UNKNOWN");
        rule("R_OLD", "DEPRECATED", "S_OLD", "SET_THK");
        DmeTestSupport.rule(jdbc, "R_PROG", "R_PROG 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_PROG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_PROG", 1, 1, "COND", "1", "P_IN", 1, "STRING");
        DmeTestSupport.var(jdbc, "R_PROG", 1, 2, "RESULT", "Value", "S_PRG", 1, "STRING");
        DmeTestSupport.rule(jdbc, "R_NOREL", "R_NOREL 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_NOREL", 1, "DRAFT", "kim", "FIRST", null);

        DmeTestSupport.ruleSet(jdbc, "S_CHAIN", "사슬 세트", "[\"R_GRD\",\"R_FCT\",\"R_SPD\"]", "INUSE", 3);
        DmeTestSupport.ruleSet(jdbc, "S_OTHER", "다른 세트", "[\"R_GRD\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_CYC", "순환 세트", "[\"R_CYA\",\"R_CYB\"]", "INUSE", 1);
        DmeTestSupport.ruleSet(jdbc, "S_OLD", "폐기 세트", "[\"R_GRD\"]", "DEPRECATED", 2);
        DmeTestSupport.ruleSet(jdbc, "S_BADOLD", "거부 폐기 세트", "[\"R_CYA\",\"R_CYB\"]", "DEPRECATED", 1);
        DmeTestSupport.ruleSet(jdbc, "S_WARNOLD", "경고 폐기 세트", "[\"R_GRD\",\"R_DUP\"]", "DEPRECATED", 1);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    /** VER 1 RELEASED 룰 — 이름 조건 열(사전에 없으면 NONE)과 STRING 결과 열 하나. */
    private void rule(String id, String status, String result, String... conds) {
        DmeTestSupport.rule(jdbc, id, id + " 룰", "DECISION", status);
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        int varId = 1;
        for (String c : conds) {
            DmeTestSupport.var(jdbc, id, 1, varId, "COND", "1", c, varId);
            varId++;
        }
        DmeTestSupport.var(jdbc, id, 1, varId, "RESULT", "Value", result, 1, "STRING");
    }

    // ── 요청·검증 도우미 ──

    private static RuleSetSaveRequest saveReq(String setId, String name, String desc, Long rv, String... ruleIds) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setSetId(setId);
        r.setSetName(name);
        r.setDescription(desc);
        r.setRowVersion(rv);
        List<Map<String, Object>> rows = new ArrayList<>();
        for (String id : ruleIds) {
            Map<String, Object> row = new HashMap<>();
            row.put("ruleId", id);
            rows.add(row);
        }
        r.setRules(rows);
        return r;
    }

    private static RuleSetStatusRequest statusReq(String setId, Long rv) {
        RuleSetStatusRequest r = new RuleSetStatusRequest();
        r.setSetId(setId);
        r.setRowVersion(rv);
        return r;
    }

    private RuleSetViewResult view(String setId) {
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId(setId);
        return service.view(r);
    }

    private Object search(String target, String keyword, String resultVar) {
        RuleSetEditSearchRequest r = new RuleSetEditSearchRequest();
        r.setTarget(target);
        r.setKeyword(keyword);
        r.setResultVar(resultVar);
        return service.search(r);
    }

    static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private Map<String, Object> setRow(String id) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", id);
    }

    private List<Map<String, Object>> setsExcept(String id) {
        return jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID <> ? ORDER BY MARU_RULE_SET_ID", id);
    }

    /** 룰 쪽 테이블 전부(I3·I23 — 세트 쓰기는 룰·버전·변수·행을 건드리지 않는다). */
    private List<Object> ruleTables() {
        return List.of(
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE ORDER BY MARU_RULE_ID"),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VER ORDER BY MARU_RULE_ID, VER"),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_VAR ORDER BY MARU_RULE_ID, VER, VAR_ID"),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_ROW ORDER BY MARU_RULE_ID, VER, ROW_ID"));
    }

    /** 거부 — 예외를 돌려주고, 세트 행 전부와 룰 테이블이 그대로인지 본다. */
    private BusinessException refuse(Executable call) {
        List<Map<String, Object>> sets = jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET ORDER BY MARU_RULE_SET_ID");
        List<Object> rules = ruleTables();
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals(sets, jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET ORDER BY MARU_RULE_SET_ID"), "거부한 요청이 세트 행을 바꿨다");
        assertEquals(rules, ruleTables(), "거부한 요청이 룰 테이블을 바꿨다");
        return e;
    }

    private String refuseCode(Executable call) {
        return code(refuse(call));
    }

    /** 쓰기 한 번 — 대상 행 밖(다른 세트·룰 테이블)이 그대로인지 본다(I3·I23). */
    private <T> T writeOnly(String setId, java.util.function.Supplier<T> call) {
        List<Map<String, Object>> others = setsExcept(setId);
        List<Object> rules = ruleTables();
        T result = call.get();
        assertEquals(others, setsExcept(setId), "다른 세트 행이 바뀌었다");
        assertEquals(rules, ruleTables(), "룰 테이블이 바뀌었다");
        return result;
    }

    private static List<String> codes(List<RuleSetCheck> checks) {
        return checks.stream().map(RuleSetCheck::code).toList();
    }

    // ── view ──

    @Test
    void view_는_세트_행과_목록_순_입출력과_저장된_목록의_검사와_담당자_쓰기_여부를_준다() {
        RuleSetViewResult v = view("S_CHAIN");
        assertEquals("S_CHAIN", v.getSet().getSetId());
        assertEquals("사슬 세트", v.getSet().getSetName());
        assertEquals("INUSE", v.getSet().getStatus());
        assertEquals(3L, v.getSet().getRowVersion());
        assertEquals(List.of("R_GRD", "R_FCT", "R_SPD"), v.getSet().getRuleIds());
        assertEquals(List.of("R_GRD", "R_FCT", "R_SPD"), v.getRules().stream().map(RuleIo::ruleId).toList());
        assertEquals(List.of("S_GRD", "SET_WID"), v.getRules().get(1).conds().stream().map(RuleIo.IoName::name).toList());
        assertEquals(List.of(), v.getChecks());
        assertTrue(v.isEditable());
        assertFalse(v.isRestorable());

        RuleSetViewResult old = view("S_BADOLD");
        assertFalse(old.isEditable());
        assertTrue(old.isRestorable());
        assertEquals(List.of("CYCLE"), codes(old.getChecks()), "폐기한 세트도 저장된 목록으로 검사한다");

        currentUser.set("lee", STD_ADMIN);
        assertFalse(view("S_CHAIN").isEditable());
        assertFalse(view("S_OLD").isRestorable());
    }

    @Test
    void view_는_없는_룰도_목록에_싣고_없는_세트는_거부한다() {
        DmeTestSupport.ruleSet(jdbc, "S_MISS", "없는 룰 세트", "[\"R_GRD\",\"NO_SUCH\"]", "INUSE", 0);
        RuleSetViewResult v = view("S_MISS");
        assertEquals(List.of("R_GRD", "NO_SUCH"), v.getRules().stream().map(RuleIo::ruleId).toList());
        assertFalse(v.getRules().get(1).exists());
        assertEquals(List.of("RULE_NOT_FOUND"), codes(v.getChecks()));

        BusinessException e = assertThrows(BusinessException.class, () -> view("S_NONE"));
        assertEquals("INVALID_VALUE", code(e));
        assertTrue(e.getMessage().contains("S_NONE"));
        assertEquals("REQUIRED_VALUE", code(assertThrows(BusinessException.class, () -> view(" "))));
    }

    // ── save 통과 ──

    @Test
    void save_는_검사를_통과하면_한_행을_요청_순서로_바꾸고_경고를_싣는다() {
        RuleSetSaveResult r = writeOnly("S_CHAIN", () ->
                service.save(saveReq("S_CHAIN", " 새 이름 ", "설명", 3L, "R_GRD", "R_DUP", "R_FCT")));
        assertEquals("S_CHAIN", r.getSetId());
        assertEquals(4L, r.getRowVersion());
        assertEquals(1, r.getChecks().size());
        RuleSetCheck w = r.getChecks().get(0);
        assertEquals("DUP_RESULT", w.code());
        assertEquals("WARN", w.severity());
        assertEquals("R_GRD와 R_DUP가 같은 결과 변수 S_GRD에 대입한다", w.message());

        Map<String, Object> row = setRow("S_CHAIN");
        assertEquals("[\"R_GRD\",\"R_DUP\",\"R_FCT\"]", row.get("RULE_IDS"));
        assertEquals("새 이름", row.get("MARU_RULE_SET_NAME"));
        assertEquals("설명", row.get("DESCRIPTION"));
        assertEquals("INUSE", row.get("STATUS"));
        assertEquals(4L, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(1L, ((Number) row.get("VER")).longValue());
        assertEquals("fixture", row.get("C_USR_ID"));
    }

    @Test
    void save_는_RELEASED_없음_경고만_있어도_저장하고_빈_설명은_null_이며_세트명은_100자까지다() {
        String name = "가".repeat(100);
        RuleSetSaveResult r = service.save(saveReq("S_OTHER", name, " ", 0L, "R_PROG", "R_NOREL"));
        assertEquals(1L, r.getRowVersion());
        assertEquals(List.of("NO_RELEASED"), codes(r.getChecks()));
        Map<String, Object> row = setRow("S_OTHER");
        assertEquals(name, row.get("MARU_RULE_SET_NAME"));
        assertNull(row.get("DESCRIPTION"));
        assertEquals("[\"R_PROG\",\"R_NOREL\"]", row.get("RULE_IDS"));
    }

    // ── save 거부 — 서버가 요청 목록으로 다시 계산한다(I12) ──

    @Test
    void 순환이면_MDM024_로_거부하고_메시지에_CYCLE_과_순환을_싣는다() {
        BusinessException e = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_CYA", "R_CYB")));
        assertEquals("MDM024", code(e));
        assertEquals("룰 세트 저장 검사를 통과하지 못했습니다: R_CYA[S_CYB] CYCLE "
                + "R_CYA와 R_CYB가 서로의 결과 변수를 읽는다(순환). 순서를 바꿔서는 풀리지 않는다", e.getMessage());
        assertEquals("CYCLE", e.getErrors().get(1).code());
    }

    @Test
    void 순서_빈_목록_없는_룰_DEPRECATED_룰_알_수_없는_입력은_각각_MDM024_다() {
        BusinessException order = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_FCT", "R_GRD")));
        assertEquals("MDM024", code(order));
        assertTrue(order.getMessage().contains("R_FCT[S_GRD] ORDER R_FCT가 뒤에 도는 R_GRD의 결과 변수 S_GRD를 읽는다"), order.getMessage());

        BusinessException empty = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L)));
        assertEquals("룰 세트 저장 검사를 통과하지 못했습니다: -[-] EMPTY 룰이 하나도 없다", empty.getMessage());
        RuleSetSaveRequest noRows = saveReq("S_CHAIN", "사슬 세트", null, 3L);
        noRows.setRules(null);
        assertTrue(refuse(() -> service.save(noRows)).getMessage().contains("EMPTY"));

        assertTrue(refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "NO_SUCH")))
                .getMessage().contains("NO_SUCH[-] RULE_NOT_FOUND"));
        assertTrue(refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_OLD")))
                .getMessage().contains("R_OLD[-] RULE_DEPRECATED"));
        BusinessException unknown = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_UNK")));
        assertEquals("MDM024", code(unknown));
        assertTrue(unknown.getMessage().contains("R_UNK[X_UNKNOWN] UNKNOWN_INPUT"), unknown.getMessage());
    }

    @Test
    void row_version_이_다르면_MDM001_폐기한_세트는_MDM009_없는_세트는_INVALID_VALUE_다() {
        assertEquals("MDM001", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 2L, "R_GRD"))));
        assertEquals("MDM009", refuseCode(() -> service.save(saveReq("S_OLD", "폐기 세트", null, 2L, "R_GRD"))));
        BusinessException none = refuse(() -> service.save(saveReq("S_NONE", "없음", null, 0L, "R_GRD")));
        assertEquals("INVALID_VALUE", code(none));
        assertTrue(none.getMessage().contains("룰 세트를 찾을 수 없습니다"), none.getMessage());
    }

    @Test
    void 요청_검사는_쓰기_전에_거부한다() {
        assertEquals("INVALID_VALUE", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "bad-id"))));
        assertEquals("REQUIRED_VALUE", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", null))));
        BusinessException dup = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_FCT", "R_GRD")));
        assertEquals("MDM021", code(dup));
        assertTrue(dup.getMessage().contains("R_GRD"), dup.getMessage());
        assertEquals("REQUIRED_VALUE", refuseCode(() -> service.save(saveReq("S_CHAIN", " ", null, 3L, "R_GRD"))));
        assertEquals("INVALID_VALUE", refuseCode(() -> service.save(saveReq("S_CHAIN", "가".repeat(101), null, 3L, "R_GRD"))));
        assertEquals("REQUIRED_VALUE", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, null, "R_GRD"))));
        assertEquals("REQUIRED_VALUE", refuseCode(() -> service.save(saveReq(null, "사슬 세트", null, 3L, "R_GRD"))));
    }

    // ── delete(폐기) ──

    @Test
    void 폐기는_INUSE_를_DEPRECATED_로_바꾸고_검사를_돌리지_않는다() {
        RuleSetStatusResult r = writeOnly("S_CYC", () -> service.delete(statusReq("S_CYC", 1L)));
        assertEquals("S_CYC", r.getSetId());
        assertEquals("DEPRECATED", r.getStatus());
        assertEquals(2L, r.getRowVersion());
        assertEquals(List.of(), r.getChecks());
        Map<String, Object> row = setRow("S_CYC");
        assertEquals("DEPRECATED", row.get("STATUS"));
        assertEquals(2L, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("[\"R_CYA\",\"R_CYB\"]", row.get("RULE_IDS"));
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(1L, ((Number) row.get("VER")).longValue());
    }

    @Test
    void 이미_폐기한_세트는_MDM009_row_version_이_다르면_MDM001_없으면_INVALID_VALUE_다() {
        assertEquals("MDM009", refuseCode(() -> service.delete(statusReq("S_OLD", 2L))));
        assertEquals("MDM001", refuseCode(() -> service.delete(statusReq("S_CHAIN", 9L))));
        assertEquals("INVALID_VALUE", refuseCode(() -> service.delete(statusReq("S_NONE", 0L))));
        assertEquals("REQUIRED_VALUE", refuseCode(() -> service.delete(statusReq("S_CHAIN", null))));
    }

    // ── restore(되살리기) ──

    @Test
    void 되살리기는_저장된_목록의_검사를_통과하면_INUSE_로_바꾸고_경고를_싣는다() {
        RuleSetStatusResult r = writeOnly("S_OLD", () -> service.restore(statusReq("S_OLD", 2L)));
        assertEquals("INUSE", r.getStatus());
        assertEquals(3L, r.getRowVersion());
        assertEquals(List.of(), r.getChecks());
        Map<String, Object> row = setRow("S_OLD");
        assertEquals("INUSE", row.get("STATUS"));
        assertEquals(3L, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(1L, ((Number) row.get("VER")).longValue());

        RuleSetStatusResult warn = service.restore(statusReq("S_WARNOLD", 1L));
        assertEquals("INUSE", warn.getStatus());
        assertEquals(List.of("DUP_RESULT"), codes(warn.getChecks()));
        assertEquals("INUSE", setRow("S_WARNOLD").get("STATUS"));
    }

    @Test
    void 저장된_목록에_거부가_있으면_되살리기는_MDM024_이고_INUSE_면_MDM009_다() {
        BusinessException e = refuse(() -> service.restore(statusReq("S_BADOLD", 1L)));
        assertEquals("MDM024", code(e));
        assertTrue(e.getMessage().contains("CYCLE"), e.getMessage());
        assertEquals("MDM009", refuseCode(() -> service.restore(statusReq("S_CHAIN", 3L))));
        assertEquals("MDM001", refuseCode(() -> service.restore(statusReq("S_OLD", 1L))));
        assertEquals("INVALID_VALUE", refuseCode(() -> service.restore(statusReq("S_NONE", 0L))));
    }

    // ── 담당자(I19) ──

    @Test
    void 담당자가_아니면_저장_폐기_되살리기가_MDM013_이다() {
        currentUser.set("lee", STD_ADMIN);
        assertEquals("MDM013", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD"))));
        assertEquals("MDM013", refuseCode(() -> service.delete(statusReq("S_CHAIN", 3L))));
        assertEquals("MDM013", refuseCode(() -> service.restore(statusReq("S_OLD", 2L))));
    }

    // ── search ──

    @Test
    void search_SET_은_ID_대문자_포함이나_세트명_포함으로_ID_순_20건이다() {
        assertEquals(List.of("S_CHAIN"), pickIds(search(null, "chain", null)));
        assertEquals(List.of("S_BADOLD", "S_OLD", "S_WARNOLD"), pickIds(search("SET", "OLD", null)));
        assertEquals(List.of("S_CYC"), pickIds(search("SET", "순환", null)));
        RuleSetPickResult.Pick p = ((RuleSetPickResult) search("SET", "S_OLD", null)).getSets().get(0);
        assertEquals("폐기 세트", p.getSetName());
        assertEquals("DEPRECATED", p.getStatus());
        for (int i = 1; i <= 21; i++) {
            DmeTestSupport.ruleSet(jdbc, String.format("S_Z%02d", i), "많은 세트", "[]", "INUSE", 0);
        }
        List<String> all = pickIds(search("SET", " ", null));
        assertEquals(20, all.size());
        assertEquals("S_BADOLD", all.get(0));
    }

    private static List<String> pickIds(Object result) {
        return ((RuleSetPickResult) result).getSets().stream().map(RuleSetPickResult.Pick::getSetId).toList();
    }

    @Test
    void search_RULE_은_룰_20건과_각_룰의_입출력을_준다() {
        RuleSetRuleSearchResult r = (RuleSetRuleSearchResult) search("RULE", "R_C", null);
        assertEquals(List.of("R_CYA", "R_CYB"), r.getRules().stream().map(RuleIo::ruleId).toList());
        assertEquals(List.of("S_CYB"), r.getRules().get(0).conds().stream().map(RuleIo.IoName::name).toList());
        assertEquals(List.of("S_CYA"), r.getRules().get(0).results().stream().map(RuleIo.IoName::name).toList());
        for (int i = 1; i <= 21; i++) {
            DmeTestSupport.rule(jdbc, String.format("R_M%02d", i), "많은 룰", "DECISION", "CREATED");
        }
        assertEquals(20, ((RuleSetRuleSearchResult) search("RULE", "R_M", null)).getRules().size());
    }

    @Test
    void search_GUIDE_는_제안_순서와_고르기와_순서의_입출력을_준다() {
        RuleSetGuideResult g = (RuleSetGuideResult) search("GUIDE", null, "S_SPD");
        assertEquals("S_SPD", g.getTarget());
        assertNull(g.getError());
        assertEquals(List.of("R_DUP", "R_FCT", "R_SPD"), g.getOrder());
        assertEquals(List.of(new RuleSetGuide.Ambiguity("S_GRD", List.of("R_DUP", "R_GRD"))), g.getAmbiguous());
        assertEquals(List.of("R_DUP", "R_FCT", "R_SPD"), g.getRules().stream().map(RuleIo::ruleId).toList());

        RuleSetGuideResult old = (RuleSetGuideResult) search("GUIDE", null, "S_OLD");
        assertEquals("결과 변수 S_OLD를 만드는 룰이 없다", old.getError(), "DEPRECATED 룰은 생산자가 아니다");
        assertEquals(List.of(), old.getOrder());
        assertEquals(List.of(), old.getRules());
        assertEquals("X_UNKNOWN를 만드는 룰이 없다", ((RuleSetGuideResult) search("GUIDE", null, "S_UNK")).getError());
        assertTrue(((RuleSetGuideResult) search("GUIDE", null, "S_CYA")).getError().startsWith("순환이 있다("));
        assertEquals("REQUIRED_VALUE", code(assertThrows(BusinessException.class, () -> search("GUIDE", "S_SPD", " "))));
    }
}
