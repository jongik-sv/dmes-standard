package com.dongkuk.dmes.mdm.dme.ruleConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.cactus.common.ErrorCode;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmCheck;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.dto.RuleConfirmViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleConfirm.service.RuleConfirmService;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleMngService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.time.LocalDateTime;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
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
 * TSK-08-05 design §3.2 「RuleConfirmServiceTest」 S1~S11 — 서비스 빈을 트랜잭션 없이 직접 부르고 원장은 JdbcTemplate 으로 단언한다.
 * 기본 픽스처: QLTY_GRD_JDG VER 1 RELEASED(2026-01-01~) + VER 2 DRAFT(소유자 kim, 같은 정의), NEW_JDG VER 1 DRAFT(최초 버전, 소유자 kim).
 * 샘플 정의는 저장 시 검사에서 NULL_GAP 경고 두 건이 나므로 확정 성공 경로는 {@code warningsAcknowledged=true} 로 보낸다(B1 build-log).
 * {@code VersionScenarioTestConfig} 를 import 하지 않는다 — 실제 검사로 확정해야 한다(I16).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleConfirmServiceTest extends AbstractMdmSharedDbTest {

    private static final String Q = "QLTY_GRD_JDG";
    private static final String NEW = "NEW_JDG";
    /** Q_ROW1 에서 COIL_THK 범위를 거꾸로 — 저장 경로라면 거부되었을 셀. */
    private static final String BROKEN_ROW1 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"2.5\",\"right\":\"1.6\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";
    private static final String A_INPUT = "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}";
    private static final String ITEMS = "SAVE_CHECKS,NOT_EMPTY,TEST_CASES,RESULT_VAR_RELEASED";

    @Autowired
    RuleConfirmService service;
    @Autowired
    RuleMngService ruleMngService;
    @Autowired
    VersionSpiRegistry registry;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        assertInstanceOf(RuleConfirmCheck.class, registry.confirmCheck(VersionTarget.BUSINESS_RULE), "I16 — 실제 검사 SPI 로 확정한다");
        clock.setLocal(DmeTestSupport.NOW);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, Q, 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, Q, 2);
        DmeTestSupport.rule(jdbc, NEW, "새 판정", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, NEW, 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.sampleDefinition(jdbc, NEW, 1);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleConfirmMenu", "ruleConfirm"));
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
        clock.setLocal(DmeTestSupport.NOW);
    }

    // ------------------------------------------------------------------ 도우미

    private static RuleConfirmSearchRequest search(String keyword) {
        RuleConfirmSearchRequest r = new RuleConfirmSearchRequest();
        r.setKeyword(keyword);
        return r;
    }

    private static RuleConfirmViewRequest view(String id, Integer ver) {
        RuleConfirmViewRequest r = new RuleConfirmViewRequest();
        r.setMaruRuleId(id);
        r.setVer(DmeTestSupport.verText(ver));
        return r;
    }

    private static RuleConfirmValidateRequest validate(String id, Integer ver, String applyFrom) {
        RuleConfirmValidateRequest r = new RuleConfirmValidateRequest();
        r.setMaruRuleId(id);
        r.setVer(DmeTestSupport.verText(ver));
        r.setApplyFrom(applyFrom);
        return r;
    }

    private static RuleConfirmRequest confirm(String id, Integer ver, Long rowVersion, String applyFrom, Boolean ack) {
        RuleConfirmRequest r = new RuleConfirmRequest();
        r.setMaruRuleId(id);
        r.setVer(DmeTestSupport.verText(ver));
        r.setRowVersion(rowVersion);
        r.setApplyFrom(applyFrom);
        r.setWarningsAcknowledged(ack);
        return r;
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> map(Map<String, Object> m, String key) {
        return (Map<String, Object>) m.get(key);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> m, String key) {
        return (List<Map<String, Object>>) m.get(key);
    }

    private static String code(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    /** DRAFT 의 STATUS·APPLY_FROM·ROW_VERSION 과 직전 RELEASED 의 APPLY_TO(I24). */
    private String draftState(String id, int ver) {
        String draft = jdbc.queryForObject("SELECT STATUS || '|' || COALESCE(APPLY_FROM, '-') || '|' || ROW_VERSION FROM TB_MDM_RULE_VER "
                + "WHERE MARU_RULE_ID = ? AND VER = ?", String.class, id, ver);
        List<String> previous = jdbc.queryForList("SELECT APPLY_TO FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER < ? ORDER BY VER",
                String.class, id, ver);
        return draft + " / " + previous;
    }

    private String ledger() {
        StringBuilder sb = new StringBuilder();
        for (String t : List.of("TB_MDM_RULE", "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW", "TB_MDM_RULE_TEST_CASE")) {
            sb.append(t).append('=').append(jdbc.queryForList("SELECT * FROM " + t + " ORDER BY 1, 2")).append('\n');
        }
        return sb.toString();
    }

    private void assertRejectedAndUnchanged(String expected, String id, int ver, Executable call) {
        String before = draftState(id, ver);
        assertEquals(expected, code(call));
        assertEquals(before, draftState(id, ver), "I24 — 거부 경로에서 DRAFT·직전 RELEASED 가 그대로다");
    }

    private void testCase(String id, int caseId, String input, String expected) {
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, ROW_VERSION) VALUES (?, ?, ?, ?, ?, 0)",
                id, caseId, "케이스 " + caseId, input, expected);
    }

    /** v2 에 필수 조건 변수 COIL_LEN 을 더한다(모든 NORMAL 행에 그 칸) — 입력 계약 변경 경고(SP3 과 같은 모양). */
    private void addRequiredCond() {
        DmeTestSupport.var(jdbc, Q, 2, 6, "COND", "1", "COIL_LEN", 4, "NUMBER");
        for (int rowId = 1; rowId <= 3; rowId++) {
            String cells = jdbc.queryForObject("SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = ?", String.class, Q, rowId);
            jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = ?",
                    cells.substring(0, cells.length() - 1) + ",\"6\":{\"op\":\"GT\",\"left\":\"0\"}}", Q, rowId);
        }
    }

    private static Map<String, Object> item(Map<String, Object> validated, String name) {
        return list(validated, "items").stream().filter(i -> name.equals(i.get("item"))).findFirst().orElseThrow();
    }

    // ------------------------------------------------------------------ S1 search

    @Test
    void S1_search_는_MDM_원천_룰의_DRAFT_만_룰_ID_순으로_돌려준다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부 판정");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.rule(jdbc, "REL_ONLY", "확정만", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "REL_ONLY", 1, "FIRST", "2026-01-01 00:00:00", null);

        List<Map<String, Object>> rows = list(service.search(search(null)), "rows");

        assertEquals(List.of(NEW, Q), rows.stream().map(r -> r.get("maruRuleId")).toList(), rows.toString());
        Map<String, Object> q = rows.get(1);
        assertEquals("품질 등급 판정", q.get("maruRuleName"));
        assertEquals("DECISION", q.get("ruleKind"));
        assertEquals("2.000", q.get("ver"), "ver 는 scale 3 문자열(D-144)");
        assertEquals("kim", q.get("ownerId"));
        assertEquals("INUSE", q.get("ruleStatus"));
        assertEquals("CREATED", rows.get(0).get("ruleStatus"));
        assertEquals(List.of(Q), list(service.search(search(" qlty ")), "rows").stream().map(r -> r.get("maruRuleId")).toList());
        assertEquals(List.of(NEW), list(service.search(search("새 판")), "rows").stream().map(r -> r.get("maruRuleId")).toList());
        assertEquals(List.of(), list(service.search(search("NO_SUCH")), "rows"));
    }

    // ------------------------------------------------------------------ S2 view

    @Test
    void S2_view_는_헤더_대상_버전_직전_RELEASED_diff_변수_라벨을_돌려준다() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 2",
                DmeTestSupport.Q_ROW2.replace("\"1000\"", "\"1500\""), Q);
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 3", Q);
        DmeTestSupport.row(jdbc, Q, 2, 5, 3, "NORMAL", DmeTestSupport.Q_ROW3.replace("\"C\"", "\"D\""));
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET LABEL = '두께' WHERE MARU_RULE_ID = ? AND VAR_ID = 1", Q);

        Map<String, Object> v = service.view(view(Q, null));

        Map<String, Object> rule = map(v, "rule");
        assertEquals(Q, rule.get("maruRuleId"));
        assertEquals("품질 등급 판정", rule.get("maruRuleName"));
        assertEquals("DECISION", rule.get("ruleKind"));
        assertEquals("INUSE", rule.get("status"));
        assertEquals("MDM", rule.get("sourceKind"));
        Map<String, Object> version = map(v, "version");
        assertEquals("2.000", version.get("ver"), "ver 를 비우면 DRAFT");
        assertEquals("DRAFT", version.get("status"));
        assertEquals("kim", version.get("ownerId"));
        assertEquals(0L, ((Number) version.get("rowVersion")).longValue());
        assertEquals("FIRST", version.get("hitPolicy"));
        assertEquals("1.000", version.get("baseVer"));
        assertNull(version.get("applyFrom"));
        Map<String, Object> previous = map(v, "previous");
        assertEquals("1.000", previous.get("ver"));
        assertEquals("FIRST", previous.get("hitPolicy"));
        assertEquals("2026-01-01 00:00:00", previous.get("applyFrom"));
        assertEquals("9999-12-31 00:00:00", previous.get("applyTo"));
        assertEquals(false, v.get("firstVersion"));
        assertEquals("2026-06-15 09:00:00", v.get("serverNow"));

        List<Map<String, Object>> diff = list(v, "diff");
        assertEquals(List.of(4, 1, 2, 3, 5), diff.stream().map(d -> d.get("rowId")).toList(), diff.toString());
        Map<String, Object> changed = diff.get(2);
        assertEquals("CHANGED", changed.get("kind"));
        assertEquals(2, changed.get("oldSeq"));
        assertEquals(2, changed.get("newSeq"));
        assertEquals(List.of(2), changed.get("changedVarIds"), "COIL_WID 칸만 바뀌었다");
        assertTrue(String.valueOf(changed.get("newCells")).contains("1500"), changed.toString());
        Map<String, Object> removed = diff.get(3);
        assertEquals("REMOVED", removed.get("kind"));
        assertNull(removed.get("newSeq"));
        assertNull(removed.get("newCells"));
        assertEquals(List.of(), removed.get("changedVarIds"));
        Map<String, Object> added = diff.get(4);
        assertEquals("ADDED", added.get("kind"));
        assertNull(added.get("oldCells"));
        assertEquals(3, added.get("newSeq"));
        assertEquals(Map.of("ADDED", 1, "REMOVED", 1, "CHANGED", 1, "SAME", 2), map(v, "diffCounts"));

        List<Map<String, Object>> vars = list(v, "vars");
        assertEquals(List.of(1, 2, 3, 4, 5), vars.stream().map(x -> x.get("varId")).toList(), vars.toString());
        assertEquals("두께", vars.get(0).get("label"));
        assertEquals("COIL_THK", vars.get(0).get("varName"));
        assertEquals("COND", vars.get(0).get("varKind"));
    }

    @Test
    void S2_RELEASED_버전을_주면_읽기_전용_모양으로_그_버전_기준_diff_를_돌려준다() {
        Map<String, Object> v = service.view(view(Q, 1));

        Map<String, Object> version = map(v, "version");
        assertEquals("1.000", version.get("ver"));
        assertEquals("RELEASED", version.get("status"));
        assertEquals("2026-01-01 00:00:00", version.get("applyFrom"));
        assertEquals("9999-12-31 00:00:00", version.get("applyTo"));
        assertNull(v.get("previous"));
        assertEquals(true, v.get("firstVersion"));
        assertEquals(Map.of("ADDED", 4, "REMOVED", 0, "CHANGED", 0, "SAME", 0), map(v, "diffCounts"));

        Map<String, Object> first = service.view(view(NEW, null));
        assertEquals("1.000", map(first, "version").get("ver"));
        assertEquals("CREATED", map(first, "rule").get("status"));
        assertEquals(true, first.get("firstVersion"));
        assertEquals("INVALID_VALUE", code(() -> service.view(view("NO_SUCH", null))));
        assertEquals("INVALID_VALUE", code(() -> service.view(view(Q, 9))));
    }

    // ------------------------------------------------------------------ S3·S4 validate

    @Test
    void S3_validate_는_항목_4행과_적용_순서를_돌려주고_최초_버전은_면제다() {
        Map<String, Object> first = service.validate(validate(NEW, 1, "2026-07-01 00:00:00"));

        assertEquals(ITEMS, list(first, "items").stream().map(i -> (String) i.get("item")).collect(Collectors.joining(",")));
        assertEquals("EXEMPT", map(first, "applyFromCheck").get("status"));
        assertNull(map(first, "applyFromCheck").get("previousApplyFrom"));
        assertEquals(0, first.get("rejectedCount"), first.toString());
        assertEquals(1, first.get("warnedCount"), "샘플 정의는 NULL_GAP 경고(SAVE_CHECKS WARNED)");
        Map<String, Object> save = item(first, "SAVE_CHECKS");
        assertEquals("WARNED", save.get("status"));
        Map<String, Object> issue = list(save, "issues").get(0);
        assertEquals("WARNING", issue.get("severity"));
        assertEquals("NULL_GAP", issue.get("code"));
        assertEquals("SAVE_CHECKS", issue.get("field"));
        assertTrue(issue.containsKey("message") && issue.containsKey("itemKey"), issue.toString());
        assertEquals("2026-07-01 00:00:00", first.get("applyFrom"));
        assertEquals(true, first.get("futureApplyFrom"));
        assertEquals("2026-06-15 09:00:00", first.get("serverNow"));
        assertEquals(List.of(), first.get("contractWarnings"));
        assertEquals(Map.of("total", 0, "withExpected", 0, "passed", 0, "failed", 0), map(first, "caseSummary"));

        Map<String, Object> same = service.validate(validate(Q, 2, "2026-01-01 00:00:00"));
        assertEquals("REJECTED", map(same, "applyFromCheck").get("status"), same.toString());
        assertEquals("2026-01-01 00:00:00", map(same, "applyFromCheck").get("previousApplyFrom"));
        assertTrue(String.valueOf(map(same, "applyFromCheck").get("message")).length() > 0);
        assertEquals(1, same.get("rejectedCount"), "적용 순서 REJECTED 만 1");
        assertEquals(false, same.get("futureApplyFrom"));

        Map<String, Object> later = service.validate(validate(Q, 2, "2026-01-01 00:00:01"));
        assertEquals("PASSED", map(later, "applyFromCheck").get("status"));
        assertEquals(0, later.get("rejectedCount"));
        assertEquals(false, service.validate(validate(Q, 2, "2026-06-15 09:00:00")).get("futureApplyFrom"), "서버 시계와 같으면 미래 아님");
    }

    @Test
    void S3_contractWarnings_는_CONTRACT_CHANGED_경고만_담고_caseSummary_는_케이스_건수다() {
        addRequiredCond();
        testCase(Q, 1, A_INPUT, "{\"QLTY_GRD\":\"B\",\"hit\":1}");
        testCase(Q, 2, A_INPUT, null);

        Map<String, Object> r = service.validate(validate(Q, 2, "2026-07-01 00:00:00"));

        List<Map<String, Object>> contract = list(r, "contractWarnings");
        assertEquals(List.of("CONTRACT_CHANGED"), contract.stream().map(c -> c.get("code")).toList(), r.toString());
        assertEquals("WARNING", contract.get(0).get("severity"));
        assertEquals("REJECTED", item(r, "TEST_CASES").get("status"));
        assertEquals(Map.of("total", 2, "withExpected", 1, "passed", 0, "failed", 1), map(r, "caseSummary"));
        assertEquals(1, r.get("rejectedCount"));
    }

    @Test
    void S4_validate_는_쓰지_않고_DRAFT_가_아니면_MDM002_다() {
        String before = ledger();

        service.validate(validate(Q, 2, "2026-07-01 00:00:00"));
        service.validate(validate(NEW, 1, "2026-07-01 00:00:00"));

        assertEquals(before, ledger(), "I27 — validate 는 원장에 쓰지 않는다");
        assertEquals(MdmErrorCode.NOT_DRAFT.code(), code(() -> service.validate(validate(Q, 1, "2026-07-01 00:00:00"))));
        assertEquals(ErrorCode.REQUIRED_VALUE.getCode(), code(() -> service.validate(validate(Q, 2, " "))));
        assertEquals(ErrorCode.INVALID_VALUE.getCode(), code(() -> service.validate(validate(Q, 2, "2026-07-01T00:00"))));
    }

    // ------------------------------------------------------------------ S5 거부 경로

    @Test
    void S5_표준_관리자는_입력을_보기_전에_MDM013_소유자가_아니면_MDM003_row_version_불일치는_MDM001() {
        currentUser.set("park", STD_ADMIN);
        assertRejectedAndUnchanged(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", true)));
        assertEquals(MdmErrorCode.STEWARD_ROLE_REQUIRED.code(), code(() -> service.confirm(confirm(null, null, null, null, null))),
                "I25 — 담당자 가드가 입력 검사보다 앞선다");

        currentUser.set("lee", STEWARD);
        assertRejectedAndUnchanged(MdmErrorCode.NOT_DRAFT_OWNER.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", true)));

        currentUser.set("kim", STEWARD);
        assertRejectedAndUnchanged(MdmErrorCode.ROW_VERSION_CONFLICT.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 5L, "2026-07-01 00:00:00", true)));
    }

    @Test
    void S5_저장_시_검사_ERROR_케이스_실패_행_없음은_MDM010() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_CHECK_FAILED.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", true)));

        testCase(NEW, 1, A_INPUT, "{\"QLTY_GRD\":\"B\",\"hit\":1}");
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_CHECK_FAILED.code(), NEW, 1,
                () -> service.confirm(confirm(NEW, 1, 0L, "2026-07-01 00:00:00", true)));

        DmeTestSupport.rule(jdbc, "EMPTY_JDG", "빈 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "EMPTY_JDG", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "EMPTY_JDG", 1, 1, "COND", "1", "COIL_WID", 1, "NUMBER");
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_CHECK_FAILED.code(), "EMPTY_JDG", 1,
                () -> service.confirm(confirm("EMPTY_JDG", 1, 0L, "2026-07-01 00:00:00", true)));
    }

    @Test
    void S5_결과_변수_생산_룰이_미확정이면_MDM010() {
        DmeTestSupport.rule(jdbc, "B_RULE", "생산 B", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "B_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "B_RULE", 1, 1, "RESULT", "Value", "FOO_GRD", 1, "STRING");
        DmeTestSupport.rule(jdbc, "A_RULE", "소비 A", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "A_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "A_RULE", 1, 1, "COND", "1", "FOO_GRD", 1, "STRING");
        DmeTestSupport.var(jdbc, "A_RULE", 1, 2, "RESULT", "Value", "A_RES", 1, "STRING");
        DmeTestSupport.row(jdbc, "A_RULE", 1, 1, 1, "NORMAL", "{\"1\":{\"op\":\"IN\",\"list\":[\"A\"]},\"2\":{\"val\":\"X\"}}");

        assertEquals("REJECTED", item(service.validate(validate("A_RULE", 1, "2026-07-01 00:00:00")), "RESULT_VAR_RELEASED").get("status"));
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_CHECK_FAILED.code(), "A_RULE", 1,
                () -> service.confirm(confirm("A_RULE", 1, 0L, "2026-07-01 00:00:00", true)));
    }

    @Test
    void S5_경고를_확인하지_않으면_MDM014_apply_from_이_직전과_같으면_MDM008() {
        addRequiredCond();
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", false)));
        assertRejectedAndUnchanged(MdmErrorCode.CONFIRM_WARNINGS_NOT_ACKNOWLEDGED.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", null)));
        assertRejectedAndUnchanged(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-01-01 00:00:00", true)));
    }

    // ------------------------------------------------------------------ S6·S9 성공

    @Test
    void S6_S9_확정하면_DRAFT_가_RELEASED_가_되고_직전_버전이_닫히며_ROW_VERSION_은_정확히_하나_는다() {
        Map<String, Object> r = service.confirm(confirm(Q, 2, 0L, "2026-03-01 00:00:00", true));

        Map<String, Object> v2 = jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = 2", Q);
        assertEquals("RELEASED", v2.get("STATUS"));
        assertEquals("2026-03-01 00:00:00", v2.get("APPLY_FROM"));
        assertEquals("9999-12-31 00:00:00", v2.get("APPLY_TO"));
        assertEquals(1L, ((Number) v2.get("ROW_VERSION")).longValue(), "I22·S9 — beginDraftWrite 를 부르지 않아 +1 만");
        assertEquals("kim", v2.get("REQUESTED_BY"));
        assertEquals("2026-06-15 09:00:00", v2.get("REQUESTED_AT"));
        assertEquals("2026-06-15 09:00:00", v2.get("RELEASED_AT"));
        assertNull(v2.get("APPROVED_BY"));
        assertNull(v2.get("APPROVED_AT"));
        assertEquals("N", v2.get("EMERGENCY_YN"), "칼럼 기본값");
        assertNull(v2.get("EMERGENCY_REASON"));
        assertNull(v2.get("REJECT_REASON"));
        assertEquals("2026-03-01 00:00:00",
                jdbc.queryForObject("SELECT APPLY_TO FROM TB_MDM_RULE_VER WHERE MARU_RULE_ID = ? AND VER = 1", String.class, Q));

        assertEquals(Map.of("ver", "2.000", "rowVersion", 1L), map(r, "confirmed"));
        assertEquals("1.000", r.get("closedPreviousVer"));
        assertEquals(List.of("NULL_GAP", "NULL_GAP"), list(r, "warnings").stream().map(w -> w.get("code")).toList(), r.toString());
        assertEquals("RELEASED", map(r, "version").get("status"));
        assertEquals("kim", map(r, "version").get("requestedBy"));
        assertEquals("2026-06-15 09:00:00", map(r, "version").get("releasedAt"));
    }

    // ------------------------------------------------------------------ S7 CREATED→INUSE

    @Test
    void S7_적용_시각이_지난_확정은_저장_INUSE_미래_적용은_저장_CREATED_이고_조회는_계산_상태다() {
        Map<String, Object> now = service.confirm(confirm(NEW, 1, 0L, "2026-06-15 09:00:00", true));
        assertEquals("INUSE", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", String.class, NEW), "경계 포함");
        assertEquals("INUSE", map(now, "rule").get("status"));
        assertNull(now.get("closedPreviousVer"));

        DmeTestSupport.rule(jdbc, "FUT_JDG", "미래 판정", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "FUT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.sampleDefinition(jdbc, "FUT_JDG", 1);
        Map<String, Object> fut = service.confirm(confirm("FUT_JDG", 1, 0L, "2026-07-01 00:00:00", true));
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'FUT_JDG'", String.class));
        assertEquals("CREATED", map(fut, "rule").get("status"));
        assertEquals("CREATED", map(service.view(view("FUT_JDG", 1)), "rule").get("status"));
        DmeTestSupport.pending(jdbc, "FUT_JDG", 2, "DRAFT", "kim", "FIRST", 1);
        assertEquals("CREATED", list(service.search(search("FUT_JDG")), "rows").get(0).get("ruleStatus"));

        clock.setLocal(LocalDateTime.of(2026, 7, 1, 0, 0, 0));
        assertEquals("INUSE", map(service.view(view("FUT_JDG", 1)), "rule").get("status"), "I19 — 적용 시각 뒤 계산 상태");
        assertEquals("INUSE", list(service.search(search("FUT_JDG")), "rows").get(0).get("ruleStatus"), "I19 — 확정 대기 목록도 계산 상태");
        RuleSearchRequest mng = new RuleSearchRequest();
        mng.setKeyword("FUT_JDG");
        assertEquals("INUSE", ruleMngService.search(mng).getList().get(0).getStatus());
        assertEquals("CREATED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE WHERE MARU_RULE_ID = 'FUT_JDG'", String.class), "저장값은 그대로");
    }

    // ------------------------------------------------------------------ S8 적용 순서 판정 공유

    @Test
    void S8_validate_의_applyFromCheck_와_confirm_의_MDM008_이_같은_픽스처에서_일치한다() {
        assertEquals("REJECTED", map(service.validate(validate(Q, 2, "2026-01-01 00:00:00")), "applyFromCheck").get("status"));
        assertRejectedAndUnchanged(MdmErrorCode.APPLY_FROM_NOT_AFTER_PREVIOUS.code(), Q, 2,
                () -> service.confirm(confirm(Q, 2, 0L, "2026-01-01 00:00:00", true)));
        assertEquals("REJECTED", map(service.validate(validate(Q, 2, "2025-12-31 23:59:59")), "applyFromCheck").get("status"));

        assertEquals("PASSED", map(service.validate(validate(Q, 2, "2026-01-01 00:00:01")), "applyFromCheck").get("status"));
        assertEquals("RELEASED", map(service.confirm(confirm(Q, 2, 0L, "2026-01-01 00:00:01", true)), "version").get("status"));
    }

    // ------------------------------------------------------------------ S10 룰 참조 검사 없음

    /**
     * 수용 기준 3 — 코드 원장 픽스처가 무거워 DEF 시스템 행(MES) + 그 시스템의 코드 배포 행 0건으로 만든다(design S10 허용). 룰 참조 검사가 있었다면
     * 배포 대상 시스템(MES)에 아무 코드도 배포되지 않은 상태에서 거부가 나야 한다.
     */
    @Test
    void S10_배포_대상_시스템에_코드가_없어도_거부하지_않고_항목은_넷뿐이다() {
        jdbc.update("INSERT INTO TB_MDM_RULE_SYSTEM (MARU_RULE_ID, SYSTEM_CODE, DEPLOY_KIND) VALUES (?, 'MES', 'DEF')", Q);
        assertEquals(0, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_CODE_SYSTEM WHERE SYSTEM_CODE = 'MES'"));

        Map<String, Object> r = service.validate(validate(Q, 2, "2026-07-01 00:00:00"));

        assertEquals(0, r.get("rejectedCount"), r.toString());
        assertEquals(Arrays.stream(MdmRuleConfirmCheckItem.values()).map(Enum::name).collect(Collectors.toSet()),
                list(r, "items").stream().map(i -> (String) i.get("item")).collect(Collectors.toSet()));
        assertEquals(4, list(r, "items").size());
        assertEquals("RELEASED", map(service.confirm(confirm(Q, 2, 0L, "2026-07-01 00:00:00", true)), "version").get("status"));
    }

    // ------------------------------------------------------------------ S11 EXTERNAL

    @Test
    void S11_EXTERNAL_원천_룰은_validate_confirm_이_BUSINESS_ERROR() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부 판정");
        DmeTestSupport.pending(jdbc, "EXT_JDG", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.sampleDefinition(jdbc, "EXT_JDG", 1);

        BusinessException v = assertThrows(BusinessException.class, () -> service.validate(validate("EXT_JDG", 1, "2026-07-01 00:00:00")));
        BusinessException c = assertThrows(BusinessException.class,
                () -> service.confirm(confirm("EXT_JDG", 1, 0L, "2026-07-01 00:00:00", true)));

        assertEquals(ErrorCode.BUSINESS_ERROR, v.getErrorCode());
        assertEquals(ErrorCode.BUSINESS_ERROR, c.getErrorCode());
        assertTrue(v.getMessage().contains("외부 원천(EXTERNAL)"), v.getMessage());
        assertEquals("DRAFT|-|0 / []", draftState("EXT_JDG", 1));
    }
}
