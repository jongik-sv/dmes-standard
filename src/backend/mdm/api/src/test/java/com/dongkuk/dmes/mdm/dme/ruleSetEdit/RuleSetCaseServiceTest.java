package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STD_ADMIN;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 룰 세트 테스트 케이스 저장·삭제({@code save part=CASE}, 흐름도 3단계 P7). 케이스는 세트의 ROW_VERSION 과 무관하고, 새 케이스 번호는
 * 세트 안 최대 번호 + 1 이다(룰 케이스의 카운터와 다르다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCaseServiceTest extends AbstractMdmSharedDbTest {

    static final String SET = "S_CASE";

    @Autowired
    RuleSetEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.ruleSet(jdbc, SET, "케이스 세트", "[]", "INUSE", 5);
    }

    @AfterEach
    void clearAudit() {
        AuditHolder.remove();
    }

    private static RuleSetSaveRequest caseReq(String setId, Integer caseId, Long rv, String name, String input, String evalTs, String expected) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setPart("CASE");
        r.setSetId(setId);
        r.setCaseId(caseId);
        r.setRowVersion(rv);
        r.setCaseName(name);
        r.setInputJson(input);
        r.setEvalTs(evalTs);
        r.setExpectedJson(expected);
        return r;
    }

    private RuleSetSaveResult saveNew(String name) {
        return service.save(caseReq(SET, null, null, name, "{\"GT_THK\":\"12\"}", "2026-06-01 09:00:00", "{\"GT_G\":\"A\"}"));
    }

    private int caseRows(String setId) {
        return DmeTestSupport.count(jdbc, "SELECT COUNT(*) FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = ?", setId);
    }

    private static BusinessException rejected(Runnable call) {
        return assertThrows(BusinessException.class, call::run);
    }

    @Test
    void 새_케이스는_최대_번호_더하기_1_이고_지운_번호를_다시_쓴다_룰_카운터와_다르다() {
        RuleSetSaveResult first = saveNew("기본");
        assertEquals(1, first.getCaseId());
        assertEquals(0L, first.getRowVersion());
        assertEquals(SET, first.getSetId());
        RuleSetSaveResult second = saveNew("둘째");
        assertEquals(2, second.getCaseId());

        RuleSetSaveRequest del = new RuleSetSaveRequest();
        del.setPart("CASE");
        del.setSetId(SET);
        del.setCaseId(2);
        del.setRowVersion(0L);
        del.setCaseDeleted(true);
        service.save(del);

        assertEquals(2, saveNew("다시").getCaseId());
        assertEquals("2026-06-01 09:00:00", jdbc.queryForObject(
                "SELECT EVAL_TS FROM TB_MDM_RULE_SET_TEST_CASE WHERE MARU_RULE_SET_ID = ? AND CASE_ID = 1", String.class, SET));
    }

    @Test
    void 고치기는_rowVersion_이_맞아야_하고_한_번_쓰면_같은_요청은_MDM001() {
        saveNew("기본");
        RuleSetSaveResult changed = service.save(caseReq(SET, 1, 0L, "바꾼 이름", "{\"GT_THK\":\"5\"}", null, null));
        assertEquals(1L, changed.getRowVersion());
        assertEquals(1, changed.getCaseId());
        assertEquals("바꾼 이름", jdbc.queryForObject("SELECT CASE_NAME FROM TB_MDM_RULE_SET_TEST_CASE WHERE CASE_ID = 1", String.class));
        assertNull(jdbc.queryForObject("SELECT EVAL_TS FROM TB_MDM_RULE_SET_TEST_CASE WHERE CASE_ID = 1", String.class));

        BusinessException e = rejected(() -> service.save(caseReq(SET, 1, 0L, "낡은 요청", "{}", null, null)));
        assertTrue(e.getMessage().startsWith("다른 사용자가 수정했습니다"), e.getMessage());
        assertEquals("바꾼 이름", jdbc.queryForObject("SELECT CASE_NAME FROM TB_MDM_RULE_SET_TEST_CASE WHERE CASE_ID = 1", String.class));
    }

    @Test
    void 삭제는_rowVersion_이_틀리면_MDM001_맞으면_행이_없고_결과_rowVersion_은_null() {
        saveNew("기본");
        RuleSetSaveRequest del = new RuleSetSaveRequest();
        del.setPart("CASE");
        del.setSetId(SET);
        del.setCaseId(1);
        del.setRowVersion(9L);
        del.setCaseDeleted(true);
        BusinessException e = rejected(() -> service.save(del));
        assertTrue(e.getMessage().startsWith("다른 사용자가 수정했습니다"), e.getMessage());
        assertEquals(1, caseRows(SET));

        del.setRowVersion(0L);
        RuleSetSaveResult out = service.save(del);
        assertNull(out.getRowVersion());
        assertEquals(1, out.getCaseId());
        assertEquals(0, caseRows(SET));
    }

    @Test
    void 잘못된_값은_정해진_문구로_거부한다() {
        assertEquals("케이스 이름은 필수입니다.",
                rejected(() -> service.save(caseReq(SET, null, null, " ", "{}", null, null))).getMessage());
        BusinessException longName = rejected(() -> service.save(caseReq(SET, null, null, "가".repeat(101), "{}", null, null)));
        assertTrue(longName.getMessage().contains("테스트 케이스 상한 — 케이스 이름이 101자다. 100자까지 받는다"), longName.getMessage());
        assertEquals("입력 JSON 은 JSON 객체({…})여야 합니다.",
                rejected(() -> service.save(caseReq(SET, null, null, "n", "[1]", null, null))).getMessage());
        assertEquals("기대 JSON 은 JSON 객체({…})여야 합니다.",
                rejected(() -> service.save(caseReq(SET, null, null, "n", "{}", null, "\"x\""))).getMessage());
        assertEquals("판정 시각은 yyyy-MM-dd HH:mm:ss 여야 합니다: 2026/06/01",
                rejected(() -> service.save(caseReq(SET, null, null, "n", "{}", "2026/06/01", null))).getMessage());
        RuleSetSaveRequest etc = caseReq(SET, null, null, "n", "{}", null, null);
        etc.setPart("ETC");
        assertEquals("save part 는 SET·CASE 중 하나여야 합니다: ETC", rejected(() -> service.save(etc)).getMessage());
        assertEquals("룰 세트를 찾을 수 없습니다: NOPE",
                rejected(() -> service.save(caseReq("NOPE", null, null, "n", "{}", null, null))).getMessage());
        assertEquals(0, caseRows(SET));
    }

    @Test
    void 세트마다_50건까지_51번째는_MDM021() {
        for (int i = 1; i <= 50; i++) {
            saveNew("c" + i);
        }
        BusinessException e = rejected(() -> saveNew("넘침"));
        assertTrue(e.getMessage().contains("세트의 케이스가 이미 50건이다. 세트마다 50건까지 둔다"), e.getMessage());
        assertEquals(50, caseRows(SET));
    }

    @Test
    void 폐기_세트에는_케이스를_쓸_수_없지만_view_는_케이스를_싣는다() {
        saveNew("기본");
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = ?", SET);
        BusinessException e = rejected(() -> saveNew("폐기 뒤"));
        assertTrue(e.getMessage().contains("폐기한 룰 세트에는 테스트 케이스를 쓸 수 없습니다"), e.getMessage());
        assertEquals(1, caseRows(SET));

        RuleSetViewRequest view = new RuleSetViewRequest();
        view.setSetId(SET);
        RuleSetViewResult v = service.view(view);
        assertEquals(1, v.getCases().size());
        RuleSetViewResult.Case c = v.getCases().get(0);
        assertEquals("기본", c.getCaseName());
        assertEquals("{\"GT_THK\":\"12\"}", c.getInputJson());
        assertEquals("2026-06-01 09:00:00", c.getEvalTs());
        assertEquals("{\"GT_G\":\"A\"}", c.getExpectedJson());
        assertEquals(0L, c.getRowVersion());
    }

    @Test
    void 담당자_역할이_없으면_MDM013_이고_행은_그대로() {
        saveNew("기본");
        currentUser.set("lee", STD_ADMIN);
        BusinessException e = rejected(() -> saveNew("표준 관리자"));
        assertTrue(e.getMessage().startsWith("담당자 역할이 있어야"), e.getMessage());
        assertEquals(1, caseRows(SET));
    }

    @Test
    void 세트명_없이도_저장되고_세트의_rowVersion_은_바뀌지_않는다() {
        RuleSetSaveRequest r = caseReq(SET, null, null, "기본", "{}", null, null);
        assertNull(r.getSetName());
        service.save(r);
        assertEquals(5L, Long.parseLong(DmeTestSupport.setVerValue(jdbc, SET, "1.000", "ROW_VERSION")));
    }
}
