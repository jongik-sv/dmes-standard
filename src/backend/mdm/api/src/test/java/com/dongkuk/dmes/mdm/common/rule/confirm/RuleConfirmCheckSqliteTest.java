package com.dongkuk.dmes.mdm.common.rule.confirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleTestCaseQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleVarTypeResolver;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveValidator;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmQueries.Pending;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Item;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.Report;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckResult;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleTestResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import com.dongkuk.dmes.mdm.entity.MdmRuleTestCase;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDateTime;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import kr.dongkuk.maru.mdm.engine.expr.MdmEvaluator;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-08-05 design §3.2 「RuleConfirmCheckSqliteTest」 — 검사 컴포넌트({@link RuleConfirmChecks})와 SPI 어댑터({@link RuleConfirmCheck})를
 * SQLite 원장으로 시험한다. 기본 픽스처: QLTY_GRD_JDG VER 1 RELEASED(2026-01-01~) + VER 2 DRAFT(소유자 kim, 같은 정의). 확정 트랜잭션처럼
 * 쓰기 트랜잭션 안에서 부른다(쓰기가 있으면 커밋되어 드러난다, I14). {@code VersionScenarioTestConfig} 를 import 하지 않는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleConfirmCheckSqliteTest extends AbstractMdmSharedDbTest {

    private static final String Q = "QLTY_GRD_JDG";
    private static final String A_INPUT = "{\"COIL_THK\":\"1.8\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}";
    /** Q_ROW1 에서 COIL_THK 범위를 거꾸로 — 저장 경로라면 거부되었을 셀. */
    private static final String BROKEN_ROW1 = "{\"1\":{\"op\":\"<= 변수 <\",\"left\":\"2.5\",\"right\":\"1.6\"},\"2\":{\"op\":\"GT\",\"left\":\"1000\"},"
            + "\"3\":{\"op\":\"IN\",\"list\":[\"A\"]},\"4\":{\"val\":\"A\"},\"5\":{\"val\":\"1.05\"}}";

    @Autowired
    RuleConfirmChecks checks;
    @Autowired
    RuleConfirmCheck spi;
    @Autowired
    RuleConfirmQueries confirmQueries;
    @Autowired
    VersionSpiRegistry registry;
    @Autowired
    RuleEditService ruleEdit;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    PlatformTransactionManager transactionManager;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    RuleQueries ruleQueries;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    RuleSaveValidator validator;
    @Autowired
    RuleVarTypeResolver resolver;
    @Autowired
    MdmEvaluator evaluator;
    @Autowired
    Clock clock;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, Q, 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, Q, 2);
    }

    // ------------------------------------------------------------------ 도우미

    private static VersionRef ref(String id, int ver) {
        return new VersionRef(VersionTarget.BUSINESS_RULE, id, BigDecimal.valueOf(ver));
    }

    /** 확정 트랜잭션처럼 쓰기 트랜잭션 안에서 부른다. */
    private <T> T inTx(java.util.function.Supplier<T> call) {
        return new TransactionTemplate(transactionManager).execute(status -> call.get());
    }

    private Report report(String id, int ver) {
        return inTx(() -> checks.report(ref(id, ver)));
    }

    private static Item item(Report r, MdmRuleConfirmCheckItem which) {
        return r.items().stream().filter(i -> i.item() == which).findFirst().orElseThrow();
    }

    private static Map<String, DiffKind> kinds(VersionDiff d) {
        Map<String, DiffKind> out = new LinkedHashMap<>();
        d.entries().forEach(e -> out.put(e.key(), e.kind()));
        return out;
    }

    private void testCase(String id, int caseId, String name, String input, String expected) {
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, ROW_VERSION) VALUES (?, ?, ?, ?, ?, 0)",
                id, caseId, name, input, expected);
    }

    private static ConfirmCheckRequest request(String id, int ver) {
        return new ConfirmCheckRequest(ref(id, ver), LocalDateTime.of(2026, 7, 1, 0, 0), LocalDateTime.of(2026, 1, 1, 0, 0), "kim",
                DmeTestSupport.NOW);
    }

    private String ledger() {
        StringBuilder sb = new StringBuilder();
        for (String t : List.of("TB_MDM_RULE", "TB_MDM_RULE_VER", "TB_MDM_RULE_VAR", "TB_MDM_RULE_ROW", "TB_MDM_RULE_TEST_CASE")) {
            sb.append(t).append('=').append(jdbc.queryForList("SELECT * FROM " + t + " ORDER BY 1, 2")).append('\n');
        }
        return sb.toString();
    }

    // ------------------------------------------------------------------ SP1 diff

    @Test
    void SP1_diff_는_row_id_로_CHANGED_REMOVED_ADDED_SAME_을_내고_base_는_직전_RELEASED() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1",
                DmeTestSupport.Q_ROW1.replace("\"1.6\"", "\"1.7\""), Q);
        jdbc.update("DELETE FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 2", Q);
        DmeTestSupport.row(jdbc, Q, 2, 5, 4, "NORMAL", DmeTestSupport.Q_ROW2);

        VersionDiff d = inTx(() -> spi.diff(ref(Q, 2)));

        assertEquals(ref(Q, 1), d.base());
        assertEquals(ref(Q, 2), d.target());
        assertEquals(Map.of("1", DiffKind.CHANGED, "2", DiffKind.REMOVED, "3", DiffKind.SAME, "4", DiffKind.SAME, "5", DiffKind.ADDED), kinds(d));
        assertEquals("4", d.entries().get(0).key(), "DEFAULT(seq 0)가 맨 앞");
    }

    @Test
    void SP1_최초_DRAFT_는_base_가_null_이고_직전_RELEASED_는_ver_보다_작은_것_중_가장_큰_것() {
        DmeTestSupport.rule(jdbc, "NEW_RULE", "새 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "NEW_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.row(jdbc, "NEW_RULE", 1, 1, 1, "NORMAL", "{}");
        VersionDiff first = inTx(() -> checks.diff(ref("NEW_RULE", 1)));
        assertNull(first.base());
        assertEquals(List.of(DiffKind.ADDED), first.entries().stream().map(VersionDiffEntry::kind).toList());

        DmeTestSupport.rule(jdbc, "R3", "셋째", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R3", 1, "FIRST", "2026-01-01 00:00:00", "2026-03-01 00:00:00");
        DmeTestSupport.released(jdbc, "R3", 2, "FIRST", "2026-03-01 00:00:00", null);
        DmeTestSupport.pending(jdbc, "R3", 3, "DRAFT", "kim", "FIRST", 2);

        assertEquals(ref("R3", 2), inTx(() -> checks.diff(ref("R3", 3))).base(), "v1·v2 RELEASED 면 v3 의 base 는 v2");
        assertEquals(1, inTx(() -> checks.previousReleased("R3", 2)).orElseThrow().getVer(), "자기 자신은 빼고 더 작은 것");
        assertTrue(inTx(() -> checks.previousReleased("R3", 1)).isEmpty());
    }

    // ------------------------------------------------------------------ SP2·SP3 저장 시 검사

    @Test
    void SP2_저장_시_검사_ERROR_는_SAVE_CHECKS_거부이고_check_errors_에_실린다() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);

        Report r = report(Q, 2);
        ConfirmCheckResult result = inTx(() -> spi.check(request(Q, 2)));

        Item save = item(r, MdmRuleConfirmCheckItem.SAVE_CHECKS);
        assertEquals(ItemStatus.REJECTED, save.status(), save.toString());
        MdmCheckIssue broken = save.issues().stream().filter(i -> "ERROR".equals(i.severity())).findFirst().orElseThrow().issue();
        assertEquals("ROW:1;VAR:1", broken.itemKey(), broken.toString());
        assertTrue(result.errors().contains(broken), result.toString());
        assertTrue(result.errors().stream().allMatch(e -> "SAVE_CHECKS".equals(e.field())), result.toString());
    }

    @Test
    void SP3_입력_계약_변경은_STORED_에서도_경고로_나오고_막지_않는다() {
        DmeTestSupport.var(jdbc, Q, 2, 6, "COND", "1", "COIL_LEN", 4, "NUMBER");
        for (int rowId = 1; rowId <= 3; rowId++) {
            String cells = jdbc.queryForObject("SELECT CELLS FROM TB_MDM_RULE_ROW WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = ?", String.class, Q, rowId);
            jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = ?",
                    cells.substring(0, cells.length() - 1) + ",\"6\":{\"op\":\"GT\",\"left\":\"0\"}}", Q, rowId);
        }

        ConfirmCheckResult result = inTx(() -> spi.check(request(Q, 2)));

        assertEquals(List.of(), result.errors(), result.toString());
        assertTrue(result.warnings().stream().anyMatch(w -> "CONTRACT_CHANGED".equals(w.code()) && "SAVE_CHECKS".equals(w.field())),
                result.toString());
    }

    // ------------------------------------------------------------------ SP4 테스트 케이스

    @Test
    void SP4_테스트_케이스는_값_테스트와_같은_판정으로_거부하고_기대값을_맞추면_둘_다_통과() {
        testCase(Q, 1, "틀린 기대", A_INPUT, "{\"QLTY_GRD\":\"B\",\"hit\":1}");

        assertEquals(ItemStatus.REJECTED, item(report(Q, 2), MdmRuleConfirmCheckItem.TEST_CASES).status());
        assertEquals(false, valueTestPass(1));

        jdbc.update("UPDATE TB_MDM_RULE_TEST_CASE SET EXPECTED_JSON = ? WHERE MARU_RULE_ID = ? AND CASE_ID = 1", "{\"QLTY_GRD\":\"A\",\"hit\":1}", Q);
        Report fixed = report(Q, 2);
        assertEquals(ItemStatus.PASSED, item(fixed, MdmRuleConfirmCheckItem.TEST_CASES).status(), fixed.toString());
        assertEquals(true, valueTestPass(1));
        assertEquals(new RuleConfirmReport.CaseSummary(1, 1, 1, 0), fixed.cases());

        jdbc.update("UPDATE TB_MDM_RULE_TEST_CASE SET EXPECTED_JSON = NULL WHERE MARU_RULE_ID = ? AND CASE_ID = 1", Q);
        assertEquals(ItemStatus.PASSED, item(report(Q, 2), MdmRuleConfirmCheckItem.TEST_CASES).status(), "기대값 없는 케이스만 있으면 통과");
    }

    @Test
    void SP4_기본_행_적중_기대도_값_테스트와_같게_판정한다() {
        testCase(Q, 5, "기본 행", "{\"COIL_THK\":\"9\",\"COIL_WID\":\"1\",\"SURF_GRD\":\"C\"}", "{\"QLTY_GRD\":\"C\",\"hit\":4}");

        assertEquals(ItemStatus.PASSED, item(report(Q, 2), MdmRuleConfirmCheckItem.TEST_CASES).status());
        assertEquals(true, valueTestPass(5));
    }

    private Object valueTestPass(int caseId) {
        RuleTestRequest req = new RuleTestRequest();
        req.setMaruRuleId(Q);
        req.setTarget("VERSION");
        req.setVer(2);
        req.setInputJson(A_INPUT);
        req.setRunCases(true);
        RuleTestResult r = ruleEdit.runTest(req);
        return r.getCases().stream().filter(c -> Integer.valueOf(caseId).equals(c.get("caseId"))).findFirst().orElseThrow().get("pass");
    }

    // ------------------------------------------------------------------ SP5 결과 변수 참조

    @Test
    void SP5_다른_룰의_결과_변수를_읽으면_그_룰에_RELEASED_가_있어야_한다() {
        // B: FOO_GRD 를 만든다(v2 DRAFT 만). C: 결과 열 그룹 BAR_GRD 를 만든다(v1 DRAFT 만).
        DmeTestSupport.rule(jdbc, "B_RULE", "생산 B", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "B_RULE", 2, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "B_RULE", 2, 1, "RESULT", "Value", "FOO_GRD", 1, "STRING");
        DmeTestSupport.rule(jdbc, "C_RULE", "생산 C", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "C_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "C_RULE", 1, 1, "RESULT", "Value", "C_X", 1, "STRING");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET RES_GRP = 'BAR_GRD' WHERE MARU_RULE_ID = 'C_RULE'");
        // A: FOO_GRD·BAR_GRD 를 읽는다(DATA_TYPE 선언 — 함정 5).
        DmeTestSupport.rule(jdbc, "A_RULE", "소비 A", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "A_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "A_RULE", 1, 1, "COND", "1", "FOO_GRD", 1, "STRING");
        DmeTestSupport.var(jdbc, "A_RULE", 1, 2, "COND", "1", "BAR_GRD", 2, "STRING");
        DmeTestSupport.var(jdbc, "A_RULE", 1, 3, "RESULT", "Value", "A_RES", 1, "STRING");
        DmeTestSupport.row(jdbc, "A_RULE", 1, 1, 1, "NORMAL",
                "{\"1\":{\"op\":\"IN\",\"list\":[\"A\"]},\"2\":{\"op\":\"IN\",\"list\":[\"B\"]},\"3\":{\"val\":\"X\"}}");

        Item none = item(report("A_RULE", 1), MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED);
        assertEquals(ItemStatus.REJECTED, none.status(), none.toString());
        assertEquals(List.of("NAME:FOO_GRD", "NAME:BAR_GRD"), none.issues().stream().map(i -> i.issue().itemKey()).toList(),
                "RES_GRP 로 만드는 이름도 생산으로 센다");
        assertTrue(none.issues().get(0).issue().message().contains("B_RULE"), none.toString());

        DmeTestSupport.released(jdbc, "B_RULE", 1, "FIRST", "2026-01-01 00:00:00", null);
        Item bReleased = item(report("A_RULE", 1), MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED);
        assertEquals(List.of("NAME:BAR_GRD"), bReleased.issues().stream().map(i -> i.issue().itemKey()).toList(), bReleased.toString());

        DmeTestSupport.column(jdbc, "BAR_GRD", DmeTestSupport.domain(jdbc, "BAR_GRD_D", "TEXT", "STRING", null));
        assertEquals(ItemStatus.PASSED, item(report("A_RULE", 1), MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED).status(),
                "컬럼 사전 이름은 생산 룰이 RELEASED 가 아니어도 통과(D7)");
    }

    // ------------------------------------------------------------------ SP6 비어 있음

    @Test
    void SP6_행이_없는_DRAFT_는_NOT_EMPTY_거부() {
        DmeTestSupport.rule(jdbc, "EMPTY_RULE", "빈 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "EMPTY_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "EMPTY_RULE", 1, 1, "COND", "1", "COIL_WID", 1, "NUMBER");

        Item notEmpty = item(report("EMPTY_RULE", 1), MdmRuleConfirmCheckItem.NOT_EMPTY);

        assertEquals(ItemStatus.REJECTED, notEmpty.status());
        assertEquals(List.of(RuleConfirmReport.NO_ROWS), notEmpty.issues().stream().map(i -> i.issue().code()).toList());
        assertEquals(ItemStatus.PASSED, item(report(Q, 2), MdmRuleConfirmCheckItem.NOT_EMPTY).status());
    }

    // ------------------------------------------------------------------ SP7 쓰기 없음

    @Test
    void SP7_report_diff_check_는_원장에_쓰지_않는다() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);
        testCase(Q, 1, "케이스", A_INPUT, "{\"QLTY_GRD\":\"B\"}");
        String before = ledger();

        inTx(() -> checks.report(ref(Q, 2)));
        inTx(() -> spi.diff(ref(Q, 2)));
        inTx(() -> spi.check(request(Q, 2)));

        assertEquals(before, ledger());
    }

    // ------------------------------------------------------------------ SP8 SPI 위임·레지스트리

    @Test
    void SP8_SPI_check_는_flatten_report_와_같고_레지스트리의_BUSINESS_RULE_SPI_는_RuleConfirmCheck() {
        VersionConfirmCheckSpi registered = registry.confirmCheck(VersionTarget.BUSINESS_RULE);
        assertInstanceOf(RuleConfirmCheck.class, registered);

        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);
        testCase(Q, 1, "틀린 기대", A_INPUT, "{\"QLTY_GRD\":\"B\"}");

        ConfirmCheckResult viaSpi = inTx(() -> registered.check(request(Q, 2)));

        assertEquals(RuleConfirmReport.flatten(report(Q, 2)), viaSpi);
        assertFalse(viaSpi.errors().isEmpty());
        assertEquals(inTx(() -> checks.diff(ref(Q, 2))), inTx(() -> registered.diff(ref(Q, 2))));
    }

    // ------------------------------------------------------------------ SP9 예외 없이 4행

    @Test
    void SP9_깨진_셀과_기대값_있는_케이스가_함께_있어도_4행을_돌려주고_둘_다_거부() {
        jdbc.update("UPDATE TB_MDM_RULE_ROW SET CELLS = ? WHERE MARU_RULE_ID = ? AND VER = 2 AND ROW_ID = 1", BROKEN_ROW1, Q);
        testCase(Q, 1, "틀린 기대", A_INPUT, "{\"QLTY_GRD\":\"B\"}");

        Report r = assertDoesNotThrow(() -> report(Q, 2));

        assertEquals(4, r.items().size());
        assertEquals(ItemStatus.REJECTED, item(r, MdmRuleConfirmCheckItem.SAVE_CHECKS).status());
        assertEquals(ItemStatus.REJECTED, item(r, MdmRuleConfirmCheckItem.TEST_CASES).status(), r.toString());
    }

    /**
     * 원장으로는 정의 조립이 예외를 던지게 만들 수 없었다(HIT_POLICY 는 CHECK 제약, NULL 이면 엔진이 받아들인다 — build-log.md). 그래서 케이스 조회·
     * 생산 룰 조회가 런타임 예외를 던지는 협력자로 검사 컴포넌트를 직접 만들어 두 catch 경로를 본다.
     */
    @Test
    void SP9_값_테스트와_결과_변수_참조가_예외를_던지면_CASE_RUN_FAILED_PRODUCER_CHECK_FAILED_로_바꾼다() {
        testCase(Q, 1, "케이스", A_INPUT, "{\"QLTY_GRD\":\"A\"}");
        RuleTestCaseQueries throwingCases = new RuleTestCaseQueries(null) {
            @Override
            public List<MdmRuleTestCase> cases(String ruleId) {
                throw new IllegalStateException("케이스 조회 실패");
            }
        };
        RuleConfirmQueries throwingProducers = new RuleConfirmQueries(null) {
            @Override
            public Map<String, Set<String>> producers(String ruleId, Collection<String> names) {
                throw new IllegalStateException("생산 룰 조회 실패");
            }
        };
        RuleConfirmChecks broken = new RuleConfirmChecks(ruleRepository, ruleQueries, stored, validator, throwingCases, throwingProducers,
                resolver, evaluator, clock);

        Report r = assertDoesNotThrow(() -> inTx(() -> broken.report(ref(Q, 2))));

        assertEquals(4, r.items().size());
        Item tests = item(r, MdmRuleConfirmCheckItem.TEST_CASES);
        assertEquals(ItemStatus.REJECTED, tests.status(), r.toString());
        assertEquals(new MdmCheckIssue(RuleConfirmReport.CASE_RUN_FAILED, "값 테스트를 끝내지 못했다: 케이스 조회 실패", "TEST_CASES", null),
                tests.issues().get(0).issue());
        Item producers = item(r, MdmRuleConfirmCheckItem.RESULT_VAR_RELEASED);
        assertEquals(ItemStatus.REJECTED, producers.status(), r.toString());
        assertEquals(RuleConfirmReport.PRODUCER_CHECK_FAILED, producers.issues().get(0).issue().code());
        assertEquals(ItemStatus.WARNED, item(r, MdmRuleConfirmCheckItem.SAVE_CHECKS).status(), "다른 항목은 그대로 돈다");
    }

    // ------------------------------------------------------------------ 확정 대기 목록(B3 가 쓴다)

    @Test
    void 확정_대기_목록은_MDM_원천_룰의_DRAFT_만_룰_ID_순() {
        DmeTestSupport.externalRule(jdbc, "EXT_RULE", "외부 룰");
        DmeTestSupport.pending(jdbc, "EXT_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.rule(jdbc, "A_RULE", "품질 소비", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "A_RULE", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.rule(jdbc, "R_ONLY", "확정만", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_ONLY", 1, "FIRST", "2026-01-01 00:00:00", null);

        List<Pending> all = inTx(() -> confirmQueries.drafts(null));
        assertEquals(List.of("A_RULE@1", Q + "@2"), all.stream().map(p -> p.rule().getMaruRuleId() + "@" + p.version().getVer()).toList());
        assertEquals(List.of(Q), inTx(() -> confirmQueries.drafts("grd_j")).stream().map(p -> p.rule().getMaruRuleId()).toList(), "ID 부분 일치");
        assertEquals(List.of("A_RULE"), inTx(() -> confirmQueries.drafts("소비")).stream().map(p -> p.rule().getMaruRuleId()).toList(), "이름 부분 일치");
        assertEquals(List.of(), inTx(() -> confirmQueries.drafts("NO_SUCH")));
        assertEquals(Set.of(), inTx(() -> confirmQueries.producers(Q, Set.of())).keySet(), "빈 이름 집합은 조회하지 않는다");
    }
}
