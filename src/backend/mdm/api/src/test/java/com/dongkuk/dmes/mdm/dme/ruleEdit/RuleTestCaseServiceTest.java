package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.check.RuleLimits;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.nio.file.Path;
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
 * TSK-08-04 design §3.2 「RuleTestCaseServiceTest」·I25 — 테스트 케이스 쓰기(save part CASE, §6.6): 담당자(MDM013)·MDM 원천·폐기 아님,
 * 버전·DRAFT 소유와 무관(D8), 새 id 는 {@code issue(CASE)}, 수정·삭제는 {@code ROW_VERSION} 조건(MDM001), JSON 은 DB CHECK 전에 검사,
 * 상한(이름·JSON 길이·룰당 케이스 수)은 같으면 통과·넘으면 MDM021(I23). 파사드의 part 위임으로 부른다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleTestCaseServiceTest {

    private static final String RULE = "QLTY_GRD_JDG";
    private static final String INPUT = "{\"COIL_THK\":1.5,\"COIL_WID\":1200,\"SURF_GRD\":\"A\"}";

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
        Path dbFile = tempDir.resolve("mdm-rule-test-case-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleEditMenu", "ruleEdit"));
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    static RuleEditSaveRequest newCase(String name, String input, String expected) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("CASE");
        r.setMaruRuleId(RULE);
        r.setCaseName(name);
        r.setInputJson(input);
        r.setExpectedJson(expected);
        return r;
    }

    static RuleEditSaveRequest edit(int caseId, Long rowVersion, String name, String input, String expected, String description) {
        RuleEditSaveRequest r = newCase(name, input, expected);
        r.setCaseId(caseId);
        r.setRowVersion(rowVersion);
        r.setDescription(description);
        return r;
    }

    static RuleEditSaveRequest remove(Integer caseId, Long rowVersion) {
        RuleEditSaveRequest r = new RuleEditSaveRequest();
        r.setPart("CASE");
        r.setMaruRuleId(RULE);
        r.setCaseId(caseId);
        r.setRowVersion(rowVersion);
        r.setCaseDeleted(true);
        return r;
    }

    static String code(Executable call) {
        BusinessException e = assertThrows(BusinessException.class, call);
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    private void insertCase(int caseId, String name, String input, String expected, long rowVersion) {
        jdbc.update("INSERT INTO TB_MDM_RULE_TEST_CASE (MARU_RULE_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON, DESCRIPTION, ROW_VERSION) "
                + "VALUES (?, ?, ?, ?, ?, '원래 설명', ?)", RULE, caseId, name, input, expected, rowVersion);
    }

    private void lastCaseId(int n) {
        jdbc.update("UPDATE TB_MDM_RULE SET LAST_CASE_ID = ? WHERE MARU_RULE_ID = ?", n, RULE);
    }

    private int lastCaseId() {
        return jdbc.queryForObject("SELECT LAST_CASE_ID FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", Integer.class, RULE);
    }

    private int caseCount() {
        return DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = ?", RULE);
    }

    private Map<String, Object> stored(int caseId) {
        return jdbc.queryForMap("SELECT * FROM TB_MDM_RULE_TEST_CASE WHERE MARU_RULE_ID = ? AND CASE_ID = ?", RULE, caseId);
    }

    /** 정확히 {@code length} 자인 JSON 객체. */
    static String objectOfLength(int length) {
        return "{\"k\":\"" + "a".repeat(length - 8) + "\"}";
    }

    // ── 새 케이스·수정·삭제 ──

    @Test
    void 새_케이스는_발급기로_번호를_받아_row_version_0_으로_넣는다() {
        insertCase(1, "하나", INPUT, null, 0);
        insertCase(2, "둘", INPUT, null, 0);
        lastCaseId(5);

        RuleEditSaveResult r = service.save(newCase("판정 A", INPUT, "{\"QLTY_GRD\":\"A\",\"hit\":1}"));

        assertEquals("CASE", r.getPart());
        assertEquals(6, r.getCaseId(), "LAST_CASE_ID 5 다음 번호 — 케이스 수·최대 case_id 가 아니다");
        assertEquals(0L, r.getRowVersion());
        assertEquals(6, lastCaseId());
        Map<String, Object> row = stored(6);
        assertEquals("판정 A", row.get("CASE_NAME"));
        assertEquals(INPUT, row.get("INPUT_JSON"), "입력 JSON 은 받은 글자 그대로 저장한다");
        assertEquals("{\"QLTY_GRD\":\"A\",\"hit\":1}", row.get("EXPECTED_JSON"));
        assertEquals(0L, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("kim", row.get("C_USR_ID"));
    }

    @Test
    void 발급_번호가_이미_있는_케이스와_겹치면_덮어쓰지_않고_실패한다() {
        insertCase(1, "원래 케이스", INPUT, "{\"QLTY_GRD\":\"A\"}", 0);
        lastCaseId(0);

        assertThrows(RuntimeException.class, () -> service.save(newCase("새 케이스", "{\"COIL_THK\":9}", null)));

        Map<String, Object> row = stored(1);
        assertEquals("원래 케이스", row.get("CASE_NAME"), "새 케이스 INSERT 가 같은 PK 의 기존 케이스를 merge 로 덮어쓰면 안 된다");
        assertEquals(INPUT, row.get("INPUT_JSON"));
        assertEquals(1, caseCount());
        assertEquals(0, lastCaseId(), "실패하면 발급도 되돌아간다");
    }

    @Test
    void 기대값_없이도_저장하고_버전_DRAFT_소유와_무관하게_담당자가_쓴다() {
        DmeTestSupport.pending(jdbc, RULE, 2, "DRAFT", "lee", "FIRST", 1);

        RuleEditSaveResult r = service.save(newCase("돌려 보기만", INPUT, null));

        assertEquals(1, r.getCaseId());
        assertNull(stored(1).get("EXPECTED_JSON"));
    }

    @Test
    void 수정은_row_version_조건으로_칸을_통째로_바꾸고_row_version_을_올린다() {
        insertCase(3, "옛 이름", INPUT, "{\"QLTY_GRD\":\"B\"}", 4);
        lastCaseId(3);

        RuleEditSaveResult r = service.save(edit(3, 4L, "새 이름", "{\"COIL_THK\":2}", null, "새 설명"));

        assertEquals("CASE", r.getPart());
        assertEquals(3, r.getCaseId());
        assertEquals(5L, r.getRowVersion());
        Map<String, Object> row = stored(3);
        assertEquals("새 이름", row.get("CASE_NAME"));
        assertEquals("{\"COIL_THK\":2}", row.get("INPUT_JSON"));
        assertNull(row.get("EXPECTED_JSON"), "기대값을 빼고 보내면 기대값을 지운다(통째로 바꾼다)");
        assertEquals("새 설명", row.get("DESCRIPTION"));
        assertEquals(5L, ((Number) row.get("ROW_VERSION")).longValue());
        assertEquals("kim", row.get("U_USR_ID"));
        assertEquals(3, lastCaseId(), "수정은 발급하지 않는다");
    }

    @Test
    void 틀린_row_version_의_수정은_MDM001_이고_바꾸지_않는다() {
        insertCase(1, "옛 이름", INPUT, null, 2);

        assertEquals("MDM001", code(() -> service.save(edit(1, 1L, "새 이름", INPUT, null, null))));
        assertEquals("MDM001", code(() -> service.save(edit(9, 0L, "없는 케이스", INPUT, null, null))));

        Map<String, Object> row = stored(1);
        assertEquals("옛 이름", row.get("CASE_NAME"));
        assertEquals(2L, ((Number) row.get("ROW_VERSION")).longValue());
    }

    @Test
    void 삭제는_row_version_조건이고_틀리면_MDM001_로_남긴다() {
        insertCase(1, "하나", INPUT, null, 2);

        assertEquals("MDM001", code(() -> service.save(remove(1, 1L))));
        assertEquals(1, caseCount());

        RuleEditSaveResult r = service.save(remove(1, 2L));
        assertEquals("CASE", r.getPart());
        assertEquals(1, r.getCaseId());
        assertNull(r.getRowVersion(), "삭제면 row_version 이 없다");
        assertEquals(0, caseCount());
    }

    @Test
    void 수정_삭제는_row_version_이_필수이고_삭제는_case_id_가_필수다() {
        insertCase(1, "하나", INPUT, null, 0);

        assertEquals("REQUIRED_VALUE", code(() -> service.save(edit(1, null, "새 이름", INPUT, null, null))));
        assertEquals("REQUIRED_VALUE", code(() -> service.save(remove(1, null))));
        assertEquals("REQUIRED_VALUE", code(() -> service.save(remove(null, 0L))));
        assertEquals("하나", stored(1).get("CASE_NAME"));
        assertEquals(1, caseCount());
    }

    // ── 입력 검사(DB CHECK 전) ──

    @Test
    void JSON_객체가_아닌_입력과_기대는_DB_보다_먼저_INVALID_VALUE_로_거부하고_발급하지_않는다() {
        for (String bad : List.of("abc", "[1,2]", "{\"a\":1} x", "\"문자열\"", "{\"a\":")) {
            assertEquals("INVALID_VALUE", code(() -> service.save(newCase("잘못된 입력", bad, null))), "입력 " + bad);
            assertEquals("INVALID_VALUE", code(() -> service.save(newCase("잘못된 기대", INPUT, bad))), "기대 " + bad);
        }
        assertEquals(0, caseCount());
        assertEquals(0, lastCaseId(), "검사에서 거부하면 번호를 발급하지 않는다");
    }

    @Test
    void 이름과_입력은_필수다() {
        assertEquals("REQUIRED_VALUE", code(() -> service.save(newCase("  ", INPUT, null))));
        assertEquals("REQUIRED_VALUE", code(() -> service.save(newCase(null, INPUT, null))));
        assertEquals("REQUIRED_VALUE", code(() -> service.save(newCase("이름", " ", null))));
        assertEquals("REQUIRED_VALUE", code(() -> service.save(newCase("이름", null, null))));
        assertEquals(0, caseCount());
    }

    // ── 상한(D6·I23) ──

    @Test
    void 케이스_이름_길이_상한과_같으면_저장하고_넘으면_MDM021_로_거부한다() {
        int max = RuleLimits.MAX_CASE_NAME_CHARS;
        assertEquals(1, service.save(newCase("가".repeat(max), INPUT, null)).getCaseId());
        assertEquals("MDM021", code(() -> service.save(newCase("가".repeat(max + 1), INPUT, null))));
        assertEquals(1, caseCount());
    }

    @Test
    void 입력_JSON_길이_상한과_같으면_저장하고_넘으면_MDM021_로_거부한다() {
        int max = RuleLimits.MAX_CASE_JSON_CHARS;
        assertEquals(max, objectOfLength(max).length());
        assertEquals(1, service.save(newCase("같음", objectOfLength(max), null)).getCaseId());
        assertEquals("MDM021", code(() -> service.save(newCase("넘음", objectOfLength(max + 1), null))));
        assertEquals(1, caseCount());
    }

    @Test
    void 기대_JSON_길이_상한과_같으면_저장하고_넘으면_MDM021_로_거부한다() {
        int max = RuleLimits.MAX_CASE_JSON_CHARS;
        assertEquals(1, service.save(newCase("같음", INPUT, objectOfLength(max))).getCaseId());
        assertEquals("MDM021", code(() -> service.save(newCase("넘음", INPUT, objectOfLength(max + 1)))));
        assertEquals(1, caseCount());
    }

    @Test
    void 룰당_케이스_수_상한까지는_새로_넣고_넘으면_거부하되_수정은_된다() {
        int max = RuleLimits.MAX_CASES_PER_RULE;
        for (int i = 1; i < max; i++) {
            insertCase(i, "케이스 " + i, INPUT, null, 0);
        }
        lastCaseId(max - 1);

        assertEquals(max, service.save(newCase("마지막", INPUT, null)).getCaseId(), "상한과 같아지는 새 케이스는 통과");
        assertEquals("MDM021", code(() -> service.save(newCase("하나 더", INPUT, null))));
        assertEquals(max, caseCount());
        assertEquals(max, lastCaseId(), "거부한 새 케이스는 번호를 발급하지 않는다");

        assertEquals(1L, service.save(edit(1, 0L, "상한에서도 수정", INPUT, null, null)).getRowVersion());
        assertEquals(2, service.save(remove(2, 0L)).getCaseId(), "상한에서도 삭제");
        assertEquals(max - 1, caseCount());
    }

    // ── 권한·원천·상태 ──

    @Test
    void 담당자가_아니면_MDM013_이다() {
        insertCase(1, "하나", INPUT, null, 0);
        currentUser.set("park", STD_ADMIN);

        assertEquals("MDM013", code(() -> service.save(newCase("새", INPUT, null))));
        assertEquals("MDM013", code(() -> service.save(edit(1, 0L, "새 이름", INPUT, null, null))));
        assertEquals("MDM013", code(() -> service.save(remove(1, 0L))));
        assertEquals(1, caseCount());
        assertEquals("하나", stored(1).get("CASE_NAME"));
    }

    @Test
    void 외부_원천_룰과_폐기한_룰에는_케이스를_쓰지_않는다() {
        DmeTestSupport.externalRule(jdbc, "EXT_JDG", "외부 룰");
        RuleEditSaveRequest external = newCase("외부", INPUT, null);
        external.setMaruRuleId("EXT_JDG");
        assertEquals("BUSINESS_ERROR", code(() -> service.save(external)));

        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = ?", RULE);
        assertEquals("MDM009", code(() -> service.save(newCase("폐기", INPUT, null))));
        assertEquals(0, DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_TEST_CASE"));
    }
}
