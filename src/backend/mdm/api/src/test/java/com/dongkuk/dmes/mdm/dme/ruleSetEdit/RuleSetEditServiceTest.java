package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.CondIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.rule.RuleIoReader;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.RuleSetFlowJson;
import com.dongkuk.dmes.mdm.common.rule.RuleSetGuide;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCondIoResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetGuideResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetRuleSearchResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.function.Executable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-06 design §2.2 「RuleSetEditServiceTest」 — ruleSetEdit 의 search(SET·RULE·GUIDE)·view·save·delete(target SET = 폐기)·restore(되살리기).
 * 불변 규칙 I3(버전·룰 테이블 무관)·I12(서버 재계산·조건부 UPDATE)·I13(요청 검사)·I14(폐기)·I15(되살리기)·I19(담당자)·I23(한 행만).
 *
 * <p>룰 픽스처(모두 VER 1 RELEASED, 조건은 이름 조건 열, 결과 하나): 사전 SET_THK·SET_WID. R_GRD(SET_THK → S_GRD), R_FCT(S_GRD·SET_WID → S_FCT),
 * R_SPD(S_FCT → S_SPD), R_DUP(SET_WID → S_GRD), R_CYA(S_CYB → S_CYA)·R_CYB(S_CYA → S_CYB), R_UNK(X_UNKNOWN → S_UNK), R_PROG(P_IN 선언 → S_PRG),
 * R_OLD(DEPRECATED, SET_THK → S_OLD), R_NOREL(RELEASED 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetEditServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    RuleIoReader ioReader;

    /** 저장 대상 세트(S_CHAIN·S_OTHER)의 kim DRAFT 버전. */
    static final String DRAFT = "2.000";

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
        // D-144 2단계 — 저장은 내 DRAFT 에만 쓴다. 저장 대상 세트에 kim 의 DRAFT 를 1.000 과 같은 목록·행 버전으로 둔다.
        // S_CYC 에는 두지 않는다 — 폐기 시험이 미적용 버전 없음(MDM006)을 요구한다.
        DmeTestSupport.ruleSetDraft(jdbc, "S_CHAIN", DRAFT, "kim", "[\"R_GRD\",\"R_FCT\",\"R_SPD\"]", 3);
        DmeTestSupport.ruleSetDraft(jdbc, "S_OTHER", DRAFT, "kim", "[\"R_GRD\"]", 0);
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
        r.setVer(DRAFT);
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

    /** 폐기 = delete target SET(D-144 2단계). 행 버전을 보내지 않는다(J2). */
    private static RuleSetVersionRequest deprecateReq(String setId) {
        RuleSetVersionRequest r = new RuleSetVersionRequest();
        r.setSetId(setId);
        r.setTarget(RuleSetVersionRequest.TARGET_SET);
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

    /**
     * 세트 부모 행에 1.000 버전 행의 RULE_IDS·FLOW_JSON·ROW_VERSION 을 얹은 것(D-144 2단계 — 흐름·행 버전은 버전 행에 있다).
     * 감사 칼럼(U_USR_ID·VER)은 부모의 것이다.
     */
    private Map<String, Object> setRow(String id) {
        return setRow(id, "1.000");
    }

    /** 저장이 쓰는 kim DRAFT({@link #DRAFT}) 기준 {@link #setRow(String)}. */
    private Map<String, Object> draftRow(String id) {
        return setRow(id, DRAFT);
    }

    private Map<String, Object> setRow(String id, String ver) {
        Map<String, Object> row = new LinkedHashMap<>(jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", id));
        row.put("RULE_IDS", DmeTestSupport.setVerValue(jdbc, id, ver, "RULE_IDS"));
        row.put("FLOW_JSON", DmeTestSupport.setVerValue(jdbc, id, ver, "FLOW_JSON"));
        row.put("ROW_VERSION", Long.parseLong(DmeTestSupport.setVerValue(jdbc, id, ver, "ROW_VERSION")));
        return row;
    }

    /** 다른 세트의 부모·버전 행 전부. */
    private List<Object> setsExcept(String id) {
        return List.of(
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID <> ? ORDER BY MARU_RULE_SET_ID", id),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID <> ? ORDER BY MARU_RULE_SET_ID, VER", id));
    }

    /** 세트 부모·버전 행 전부. */
    private List<Object> setTables() {
        return List.of(
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET ORDER BY MARU_RULE_SET_ID"),
                jdbc.queryForList("SELECT * FROM TB_MDM_RULE_SET_VER ORDER BY MARU_RULE_SET_ID, VER"));
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
        List<Object> sets = setTables();
        List<Object> rules = ruleTables();
        BusinessException e = assertThrows(BusinessException.class, call);
        assertEquals(sets, setTables(), "거부한 요청이 세트 행을 바꿨다");
        assertEquals(rules, ruleTables(), "거부한 요청이 룰 테이블을 바꿨다");
        return e;
    }

    private String refuseCode(Executable call) {
        return code(refuse(call));
    }

    /** 쓰기 한 번 — 대상 행 밖(다른 세트·룰 테이블)이 그대로인지 본다(I3·I23). */
    private <T> T writeOnly(String setId, java.util.function.Supplier<T> call) {
        List<Object> others = setsExcept(setId);
        List<Object> rules = ruleTables();
        T result = call.get();
        assertEquals(others, setsExcept(setId), "다른 세트 행이 바뀌었다");
        assertEquals(rules, ruleTables(), "룰 테이블이 바뀌었다");
        return result;
    }

    private static List<String> codes(List<RuleSetCheck> checks) {
        return checks.stream().map(RuleSetCheck::code).toList();
    }

    /** 응답 checks 중 거부(REJECT) 검사 — 저장은 거부로 막지 않고 응답에 싣는다(2026-10-06). */
    private static List<RuleSetCheck> rejects(RuleSetSaveResult r) {
        return r.getChecks().stream().filter(RuleSetCheck::rejected).toList();
    }

    private static String rejectText(RuleSetSaveResult r) {
        return rejects(r).stream().map(c -> c.code() + " " + c.message()).reduce("", (a, b) -> a + "; " + b);
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

        Map<String, Object> row = draftRow("S_CHAIN");
        assertEquals("[\"R_GRD\",\"R_DUP\",\"R_FCT\"]", row.get("RULE_IDS"));
        assertEquals("[\"R_GRD\",\"R_FCT\",\"R_SPD\"]", setRow("S_CHAIN").get("RULE_IDS"), "RELEASED 1.000 은 그대로다");
        assertEquals(3L, ((Number) setRow("S_CHAIN").get("ROW_VERSION")).longValue());
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
        Map<String, Object> row = draftRow("S_OTHER");
        assertEquals(name, row.get("MARU_RULE_SET_NAME"));
        assertNull(row.get("DESCRIPTION"));
        assertEquals("[\"R_PROG\",\"R_NOREL\"]", row.get("RULE_IDS"));
    }

    // ── save 거부 — 서버가 요청 목록으로 다시 계산한다(I12) ──

    @Test
    void 순환이면_저장하되_응답_checks_에_CYCLE_거부를_싣는다() {
        RuleSetSaveResult r = service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_CYA", "R_CYB"));

        assertEquals(4L, r.getRowVersion());
        assertEquals("[\"R_CYA\",\"R_CYB\"]", draftRow("S_CHAIN").get("RULE_IDS"));
        assertTrue(codes(rejects(r)).contains("CYCLE"), r.getChecks().toString());
        assertTrue(rejectText(r).contains("R_CYA와 R_CYB가 서로의 결과 변수를 읽는다(순환)"), rejectText(r));
    }

    @Test
    void 순서_빈_목록_없는_룰_DEPRECATED_룰_알_수_없는_입력도_저장하고_거부_검사를_싣는다() {
        long rv = 3L;
        RuleSetSaveResult order = service.save(saveReq("S_CHAIN", "사슬 세트", null, rv, "R_FCT", "R_GRD"));
        rv = order.getRowVersion();
        assertTrue(rejectText(order).contains("ORDER R_FCT가 뒤에 도는 R_GRD의 결과 변수 S_GRD를 읽는다"), rejectText(order));

        RuleSetSaveResult empty = service.save(saveReq("S_CHAIN", "사슬 세트", null, rv));
        rv = empty.getRowVersion();
        assertEquals(List.of("EMPTY"), codes(rejects(empty)));
        assertEquals("[]", draftRow("S_CHAIN").get("RULE_IDS"));
        RuleSetSaveRequest noRows = saveReq("S_CHAIN", "사슬 세트", null, rv);
        noRows.setRules(null);
        RuleSetSaveResult none = service.save(noRows);
        rv = none.getRowVersion();
        assertTrue(codes(rejects(none)).contains("EMPTY"));

        RuleSetSaveResult missing = service.save(saveReq("S_CHAIN", "사슬 세트", null, rv, "R_GRD", "NO_SUCH"));
        rv = missing.getRowVersion();
        assertTrue(rejectText(missing).contains("RULE_NOT_FOUND"), rejectText(missing));
        RuleSetSaveResult old = service.save(saveReq("S_CHAIN", "사슬 세트", null, rv, "R_OLD"));
        rv = old.getRowVersion();
        assertTrue(codes(rejects(old)).contains("RULE_DEPRECATED"), old.getChecks().toString());
        RuleSetSaveResult unknown = service.save(saveReq("S_CHAIN", "사슬 세트", null, rv, "R_UNK"));
        assertTrue(rejectText(unknown).contains("UNKNOWN_INPUT"), rejectText(unknown));
        assertEquals("[\"R_UNK\"]", draftRow("S_CHAIN").get("RULE_IDS"));
    }

    @Test
    void row_version_이_다르면_MDM001_폐기한_세트는_MDM009_없는_세트는_INVALID_VALUE_다() {
        assertEquals("MDM001", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 2L, "R_GRD"))));
        // 폐기 뒤에는 화면이 새 버전을 막지만 데이터로는 DRAFT 가 있을 수 있다 — 내 DRAFT 가 있어도 폐기한 세트는 MDM009 다.
        DmeTestSupport.ruleSetDraft(jdbc, "S_OLD", DRAFT, "kim", "[\"R_GRD\"]", 2);
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

    // ── delete target SET(폐기) ──

    @Test
    void 폐기는_INUSE_를_DEPRECATED_로_바꾸고_검사를_돌리지_않는다() {
        RuleSetStatusResult r = writeOnly("S_CYC", () -> (RuleSetStatusResult) service.delete(deprecateReq("S_CYC")));
        assertEquals("S_CYC", r.getSetId());
        assertEquals("DEPRECATED", r.getStatus());
        assertNull(r.getRowVersion());
        assertEquals(List.of(), r.getChecks());
        Map<String, Object> row = setRow("S_CYC");
        assertEquals("DEPRECATED", row.get("STATUS"));
        assertEquals(1L, ((Number) row.get("ROW_VERSION")).longValue(), "폐기는 버전 행을 바꾸지 않는다(J2)");
        assertEquals("[\"R_CYA\",\"R_CYB\"]", row.get("RULE_IDS"));
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(1L, ((Number) row.get("VER")).longValue());
    }

    @Test
    void 이미_폐기한_세트는_MDM009_없으면_INVALID_VALUE_다() {
        assertEquals("MDM009", refuseCode(() -> service.delete(deprecateReq("S_OLD"))));
        assertEquals("INVALID_VALUE", refuseCode(() -> service.delete(deprecateReq("S_NONE"))));
    }

    // ── restore(되살리기) ──

    @Test
    void 되살리기는_저장된_목록의_검사를_통과하면_INUSE_로_바꾸고_경고를_싣는다() {
        RuleSetStatusResult r = writeOnly("S_OLD", () -> service.restore(statusReq("S_OLD", 2L)));
        assertEquals("INUSE", r.getStatus());
        assertNull(r.getRowVersion());
        assertEquals(List.of(), r.getChecks());
        Map<String, Object> row = setRow("S_OLD");
        assertEquals("INUSE", row.get("STATUS"));
        assertEquals(2L, ((Number) row.get("ROW_VERSION")).longValue(), "되살리기는 버전 행을 바꾸지 않는다(J2)");
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
        assertEquals("INVALID_VALUE", refuseCode(() -> service.restore(statusReq("S_NONE", 0L))));
    }

    // ── 담당자(I19) ──

    @Test
    void 담당자가_아니면_저장_폐기_되살리기가_MDM013_이다() {
        currentUser.set("lee", STD_ADMIN);
        assertEquals("MDM013", refuseCode(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD"))));
        assertEquals("MDM013", refuseCode(() -> service.delete(deprecateReq("S_CHAIN"))));
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
        // 상태는 계산 상태(ruleSetMng·ruleSetConfirm 과 같다, Ruling P2-22 M-3) — 저장 CREATED 라도 적용된 RELEASED 가 있으면 INUSE
        DmeTestSupport.ruleSet(jdbc, "S_PICK_APPLIED", "적용 세트", "[]", "CREATED", 0);
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS, C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, "
                + "U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) VALUES ('S_PICK_NEW', '새 세트', 'CREATED', 'fixture', '2026-01-01 00:00:00', "
                + "'fixture', 'fixture', 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 0)");
        DmeTestSupport.ruleSetDraft(jdbc, "S_PICK_NEW", "1.000", "kim", "[]", 0);
        List<RuleSetPickResult.Pick> picked = ((RuleSetPickResult) search("SET", "S_PICK", null)).getSets();
        assertEquals(List.of("S_PICK_APPLIED", "S_PICK_NEW"), picked.stream().map(RuleSetPickResult.Pick::getSetId).toList());
        assertEquals(List.of("INUSE", "CREATED"), picked.stream().map(RuleSetPickResult.Pick::getStatus).toList());
        jdbc.update("DELETE FROM TB_MDM_RULE_SET_VER WHERE MARU_RULE_SET_ID LIKE 'S_PICK%'");
        jdbc.update("DELETE FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID LIKE 'S_PICK%'");
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

    // ── 흐름 기준 저장·조회·되살리기(흐름도 Task 10) ──

    /** IF 갈래 두 개(R_GRD / 그 외 R_DUP)가 같은 S_GRD 를 만들고, 합류 뒤 R_FCT 가 읽는다. */
    static final String IF_FLOW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
            + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_GRD\"},{\"id\":\"r2\",\"kind\":\"RULE\",\"ruleId\":\"R_DUP\"},"
            + "{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_FCT\"},{\"id\":\"end\",\"kind\":\"END\"}],"
            + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
            + "{\"id\":\"e2\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"SET_THK > 1\"},"
            + "{\"id\":\"e3\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},"
            + "{\"id\":\"e4\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e5\",\"from\":\"r2\",\"to\":\"m1\"},"
            + "{\"id\":\"e6\",\"from\":\"m1\",\"to\":\"r3\"},{\"id\":\"e7\",\"from\":\"r3\",\"to\":\"end\"}],"
            + "\"view\":{\"positions\":{\"r1\":{\"x\":10,\"y\":20}}}}";

    /** 같은 룰(R_GRD)을 두 IF 갈래에 둔 흐름 — RULE_IDS 는 중복 없이 한 번(Review Focus 3). */
    static final String SAME_RULE_FLOW = IF_FLOW.replace("\"ruleId\":\"R_DUP\"", "\"ruleId\":\"R_GRD\"");

    /** R_FCT(S_GRD 를 읽음)가 그 외 갈래에 있고 S_GRD 는 첫 갈래의 R_GRD 만 만든다 — IF_SIBLING. */
    static final String SIBLING_FLOW = IF_FLOW.replace("\"ruleId\":\"R_DUP\"", "\"ruleId\":\"R_FCT\"")
            .replace("{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_FCT\"}", "{\"id\":\"r3\",\"kind\":\"RULE\",\"ruleId\":\"R_SPD\"}");

    private static RuleSetSaveRequest flowReq(String setId, long rv, String flowJson) {
        RuleSetSaveRequest r = saveReq(setId, "흐름 세트", null, rv);
        r.setFlowJson(flowJson);
        return r;
    }

    @Test
    void 흐름을_저장하면_FLOW_JSON_은_정규_JSON_이고_RULE_IDS_는_서버가_펼친_목록이다() {
        RuleSetSaveResult r = writeOnly("S_CHAIN", () -> service.save(flowReq("S_CHAIN", 3L, IF_FLOW)));

        assertEquals(4L, r.getRowVersion());
        Map<String, Object> row = draftRow("S_CHAIN");
        assertEquals("[\"R_GRD\",\"R_DUP\",\"R_FCT\"]", row.get("RULE_IDS"));
        assertEquals(RuleSetFlowJson.canonical(IF_FLOW), row.get("FLOW_JSON"));
        assertTrue(codes(r.getChecks()).isEmpty(), r.getChecks().toString());
    }

    @Test
    void 같은_룰이_두_갈래에_있으면_RULE_IDS_에_한_번만_쓰고_검사도_한_번이다() {
        service.save(flowReq("S_CHAIN", 3L, SAME_RULE_FLOW));

        assertEquals("[\"R_GRD\",\"R_FCT\"]", draftRow("S_CHAIN").get("RULE_IDS"));
        RuleSetViewResult v = view("S_CHAIN");
        assertEquals(List.of("R_GRD", "R_FCT"), v.getSet().getRuleIds());
        assertTrue(v.getSet().isBranched());
        assertTrue(codes(v.getChecks()).isEmpty(), v.getChecks().toString());
    }

    @Test
    void 흐름_검사가_거부해도_저장하고_응답에_거부를_싣는다() {
        RuleSetSaveResult r = service.save(flowReq("S_CHAIN", 3L, SIBLING_FLOW));

        assertEquals(4L, r.getRowVersion());
        assertTrue(rejectText(r).contains("IF_SIBLING"), rejectText(r));
        Map<String, Object> row = draftRow("S_CHAIN");
        assertNotNull(row.get("FLOW_JSON"));
        assertEquals(4L, ((Number) row.get("ROW_VERSION")).longValue());
    }

    @Test
    void IF_선_조건식_문법이_틀려도_저장하고_FLOW_COND_거부를_싣는다() {
        RuleSetSaveResult r = service.save(flowReq("S_CHAIN", 3L, IF_FLOW.replace("SET_THK > 1", "SET_THK >")));

        assertEquals(4L, r.getRowVersion());
        assertTrue(codes(rejects(r)).contains("FLOW_COND"), r.getChecks().toString());
    }

    @Test
    void 사전에_없는_변수는_NONE_이라_정의되지_않았다며_거부_검사로_싣는다() {
        RuleSetSaveResult r = service.save(flowReq("S_CHAIN", 3L, IF_FLOW.replace("SET_THK > 1", "NOPE_VAR > 1")));

        assertEquals(4L, r.getRowVersion());
        assertTrue(codes(rejects(r)).contains("FLOW_COND"), r.getChecks().toString());
        assertTrue(rejectText(r).contains("e2 갈래 조건식이 읽는 NOPE_VAR는 이 지점에서 정의되지 않았다"), rejectText(r));
    }

    @Test
    void condIo_는_EVAL_TS_와_밑줄_접두어_이름을_vars_에서_뺀다() {
        var flow = RuleSetFlowJson.parse(IF_FLOW.replace("SET_THK > 1", "SET_THK > 1 && EVAL_TS > 0 && _RSV > 0 && NOPE_VAR > 0"));

        CondIo io = ioReader.condIo(flow).get("e2");

        assertTrue(io.ok(), String.valueOf(io.message()));
        Map<String, String> sources = new java.util.TreeMap<>();
        io.vars().forEach(v -> sources.put(v.name(), v.source()));
        assertEquals(Map.of("SET_THK", RuleIo.DICT, "NOPE_VAR", RuleIo.NONE), sources);
        assertNull(ioReader.condIo(flow).get("e3"), "otherwise 선은 넣지 않는다");
    }

    @Test
    void condIo_는_exprText_면_식을_파싱하고_flowJson_만이면_expr_은_null() {
        RuleSetCondIoRequest req = new RuleSetCondIoRequest();
        req.setExprText("GT_THK > 10");
        RuleSetCondIoResult r = service.condIo(req);
        assertTrue(r.getExpr().isSupported());
        assertEquals(List.of("GT_THK"), r.getExpr().getRefVars());
        assertTrue(r.getCondIo().isEmpty());

        RuleSetCondIoRequest bad = new RuleSetCondIoRequest();
        bad.setExprText("GT_THK >");
        BusinessException e = assertThrows(BusinessException.class, () -> service.condIo(bad));
        assertTrue(e.getMessage().startsWith("식을 파싱할 수 없습니다"), e.getMessage());

        RuleSetCondIoRequest flowOnly = new RuleSetCondIoRequest();
        flowOnly.setFlowJson(IF_FLOW);
        RuleSetCondIoResult flow = service.condIo(flowOnly);
        assertNull(flow.getExpr());
        assertTrue(flow.getCondIo().containsKey("e2"));
    }

    @Test
    void condIo_문법_오류는_ok_false_이고_vars_는_빈_목록이다() {
        CondIo io = ioReader.condIo(RuleSetFlowJson.parse(IF_FLOW.replace("SET_THK > 1", "SET_THK >"))).get("e2");

        assertFalse(io.ok());
        assertTrue(io.vars() != null && io.vars().isEmpty());
    }

    @Test
    void flow_와_다른_rules_를_함께_보내면_RULE_IDS_는_흐름에서_펼친_값이다() {
        RuleSetSaveRequest r = flowReq("S_CHAIN", 3L, IF_FLOW);
        r.setRules(saveReq("S_CHAIN", "x", null, 3L, "R_SPD", "R_CYA").getRules());

        service.save(r);

        assertEquals("[\"R_GRD\",\"R_DUP\",\"R_FCT\"]", draftRow("S_CHAIN").get("RULE_IDS"));
    }

    @Test
    void 흐름_형식이_틀리면_MDM021_이다() {
        RuleSetSaveRequest r = saveReq("S_CHAIN", "흐름 세트", null, 3L);
        r.setFlowJson("{\"version\":2,\"nodes\":[],\"edges\":[]}");

        assertEquals("MDM021", refuseCode(() -> service.save(r)));
    }

    @Test
    void 분기_세트를_목록으로_저장하면_FLOW_READONLY_로_거부한다() {
        DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", DRAFT, IF_FLOW);

        BusinessException e = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_FCT", "R_SPD")));

        assertEquals("MDM024", code(e));
        assertEquals("FLOW_READONLY", e.getErrors().get(1).code());
        assertEquals("룰 세트 저장 검사를 통과하지 못했습니다: -[-] FLOW_READONLY 분기가 있는 세트는 룰 목록으로 저장할 수 없다. 흐름도 편집기에서 저장한다",
                e.getMessage());
    }

    static final String LINEAR_WITH_VIEW = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_GRD\"},"
            + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}],"
            + "\"view\":{\"positions\":{\"r1\":{\"x\":5,\"y\":6}},\"notes\":[{\"id\":\"n1\",\"text\":\"메모\",\"x\":0,\"y\":0,\"w\":200,\"h\":80,\"attach\":\"r1\"}],\"groups\":[]}}";

    private String flowJsonOf(String setId) {
        return (String) draftRow(setId).get("FLOW_JSON");
    }

    @Test
    void 저장은_요청_JSON_이_아니라_정규_JSON_을_쓴다() {
        // 키 순서를 뒤섞고 알 수 없는 칸 "extra" 를 넣어 보낸다
        service.save(flowReq("S_CHAIN", 3L, "{\"extra\":1,\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_GRD\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}"));

        String stored = flowJsonOf("S_CHAIN");
        assertFalse(stored.contains("extra"), stored);
        assertTrue(stored.startsWith("{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\",\"ruleId\":null"), stored);
    }

    @Test
    void 문자열_order_는_MDM021_로_거부하고_쓰지_않는다() {
        BusinessException e = refuse(() -> service.save(flowReq("S_CHAIN", 3L, IF_FLOW.replace("\"order\":1", "\"order\":\"1\""))));

        assertEquals("MDM021", code(e));
        assertTrue(e.getMessage().contains("edges[1].order 는 정수여야 한다"), e.getMessage());
        assertNull(flowJsonOf("S_CHAIN"));
    }

    @Test
    void FLOW_JSON_이_있는_한_줄_세트에_목록_저장이_오면_거부하고_흐름을_지우지_않는다() {
        service.save(flowReq("S_CHAIN", 3L, LINEAR_WITH_VIEW));
        String before = flowJsonOf("S_CHAIN");
        assertTrue(before.contains("\"메모\""), before);

        BusinessException e = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 4L, "R_GRD", "R_FCT")));

        assertEquals("MDM024", code(e));
        assertTrue(e.getMessage().contains("FLOW_READONLY") && e.getMessage().contains("흐름도로 저장한 세트는 룰 목록으로 저장할 수 없다"), e.getMessage());
        assertEquals(before, flowJsonOf("S_CHAIN"));
    }

    @Test
    void 저장된_FLOW_JSON_을_코덱이_읽지_못하면_분기_문구로_거부하고_흐름을_지우지_않는다() {
        // json_valid 는 통과하지만 코덱이 거부하는 값(version 2)을 직접 넣는다
        String unreadable = "{\"version\":2,\"nodes\":[],\"edges\":[]}";
        DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", DRAFT, unreadable);

        BusinessException e = refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_FCT")));

        assertEquals("MDM024", code(e));
        assertEquals("FLOW_READONLY", e.getErrors().get(1).code());
        assertTrue(e.getMessage().contains("분기가 있는 세트는 룰 목록으로 저장할 수 없다"), e.getMessage());
        assertEquals(unreadable, flowJsonOf("S_CHAIN"));
    }

    @Test
    void 정규화하면_상한을_넘는_흐름은_MDM021_로_거부하고_쓰지_않는다() {
        String head = LINEAR_WITH_VIEW.substring(0, LINEAR_WITH_VIEW.indexOf("\"view\""));
        String vh = head + "\"view\":{\"pad\":\"";
        String json = vh + "x".repeat(RuleSetFlowJson.MAX_JSON_CHARS - vh.length() - 3 - 10) + "\"}}";
        assertTrue(json.length() <= RuleSetFlowJson.MAX_JSON_CHARS);

        BusinessException e = refuse(() -> service.save(flowReq("S_CHAIN", 3L, json)));

        assertEquals("MDM021", code(e));
        assertTrue(e.getMessage().contains("정규화한 흐름 JSON 이"), e.getMessage());
        assertNull(flowJsonOf("S_CHAIN"));
    }

    @Test
    void 조회_응답은_저장된_흐름의_IF_갈래_조건식_IO_를_싣는다() {
        DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", DRAFT, IF_FLOW);

        RuleSetViewResult v = view("S_CHAIN");

        assertEquals(java.util.Set.of("e2"), v.getCondIo().keySet());
        assertTrue(v.getCondIo().get("e2").ok());
        assertEquals(Map.of(), view("S_OTHER").getCondIo());
    }

    @Test
    void 조회는_흐름과_분기_여부와_흐름_기준_검사를_싣는다() {
        DmeTestSupport.ruleSetFlow(jdbc, "S_CHAIN", DRAFT, IF_FLOW);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = '[\"R_GRD\",\"R_DUP\",\"R_FCT\"]' WHERE MARU_RULE_SET_ID = 'S_CHAIN'");

        RuleSetViewResult v = view("S_CHAIN");

        assertTrue(v.getSet().isBranched());
        assertEquals(RuleSetFlowJson.toMap(IF_FLOW), v.getSet().getFlow());
        assertTrue(codes(v.getChecks()).isEmpty(), v.getChecks().toString());
        assertFalse(view("S_OTHER").getSet().isBranched());
        assertNull(view("S_OTHER").getSet().getFlow());
    }

    @Test
    void 되살리기도_흐름_기준으로_검사한다() {
        DmeTestSupport.ruleSetFlow(jdbc, "S_OLD", SIBLING_FLOW);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = '[\"R_GRD\",\"R_FCT\",\"R_SPD\"]' WHERE MARU_RULE_SET_ID = 'S_OLD'");

        assertEquals("MDM024", refuseCode(() -> service.restore(statusReq("S_OLD", 2L))));
    }

    @Test
    void META_폐기_되살리기는_룰_세트를_기록하고_내_DRAFT_저장은_기록하지_않는다() {
        // D-144 2단계 — 저장은 내 DRAFT 에만 쓴다(RELEASED·부모 상태 그대로). 폐기·되살리기는 피드가 싣는 부모 계산 상태를 바꾼다
        MetaRevTestSupport.clear(jdbc);
        service.save(saveReq("S_CHAIN", "사슬 세트", null, 3L, "R_GRD", "R_DUP", "R_FCT"));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
        service.delete(deprecateReq("S_CYC"));
        service.restore(statusReq("S_OLD", 2L));
        assertEquals(List.of("RULE_SET:S_CYC:SAVE", "RULE_SET:S_OLD:SAVE"), MetaRevTestSupport.rows(jdbc));
    }

    @Test
    void META_거부된_저장은_기록하지_않는다() {
        MetaRevTestSupport.clear(jdbc);
        refuse(() -> service.save(saveReq("S_CHAIN", "사슬 세트", null, 2L, "R_GRD")));
        assertEquals(List.of(), MetaRevTestSupport.rows(jdbc));
    }
}
