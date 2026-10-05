package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleColumnsServiceTest.columns;
import static com.dongkuk.dmes.mdm.dme.ruleEdit.RuleColumnsServiceTest.qCols;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveContext;
import com.dongkuk.dmes.mdm.common.rule.check.RuleSaveTarget;
import com.dongkuk.dmes.mdm.common.rule.check.ledger.RuleSetCallerCheck;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.contract.common.MdmCheckIssue;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleColumnsService;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 spec §6.4, srv:6 조정 ③ — 룰 쪽 연쇄 재검사 {@link RuleSetCallerCheck}(@Order(9)): 룰 → 그 룰을 담은 세트 C → C 를 부르는 세트 P. 같은 깨짐이
 * 룰 DRAFT 저장(COLUMNS·TABLE)에서는 WARNING(저장 통과), 룰 확정(STORED, 기준 시각 apply_from)에서는 ERROR(SET_CALLER_BROKEN)다.
 *
 * <p>픽스처: QLTY_GRD_JDG v1 RELEASED·v2 DRAFT(결과 QLTY_GRD·PRC_FCT), R_FCT(QLTY_GRD 를 읽음 — QLTY_GRD 는 컬럼 사전에 없다), 세트 C = [QLTY_GRD_JDG],
 * 세트 P = SET C → R_FCT(CALL_SET_IDS ["C"]). 시계 NOW = 2026-06-15 09:00.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCallerCheckTest extends AbstractMdmSharedDbTest {

    static final String ID = "QLTY_GRD_JDG";
    static final String BROKEN = "세트 C 를 부르는 세트 P: R_FCT의 조건 변수 QLTY_GRD는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다";

    @Autowired
    RuleColumnsService columnsService;
    @Autowired
    RuleConfirmChecks confirmChecks;
    @Autowired
    RuleSetCallerCheck check;
    @Autowired
    RuleQueries queries;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.pending(jdbc, ID, 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.sampleDefinition(jdbc, ID, 2);
        DmeTestSupport.rule(jdbc, "R_FCT", "R_FCT", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_FCT", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_FCT", 1, 1, "COND", "1", "QLTY_GRD", 1);
        DmeTestSupport.var(jdbc, "R_FCT", 1, 2, "RESULT", "Value", "S_FCT", 1, "STRING");
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"" + ID + "\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "P", "P 세트", "[\"R_FCT\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "P", line(setNode("s1", "C"), ruleNode("r1", "R_FCT")));
        DmeTestSupport.ruleSetCalls(jdbc, "P", "[\"C\"]");
    }

    /** v2 결과 열 QLTY_GRD 를 QLTY_X 로 바꾼 열 설정. */
    private static List<Map<String, Object>> renamed() {
        List<Map<String, Object>> cols = qCols();
        cols.get(3).put("varName", "QLTY_X");
        return cols;
    }

    private static List<String> found(List<Map<String, Object>> issues) {
        return issues.stream().filter(i -> "SET_CALLER_BROKEN".equals(i.get("code"))).map(i -> i.get("severity") + " " + i.get("message")).toList();
    }

    @Test
    void 룰_DRAFT_열_저장은_부르는_세트를_깨도_경고로_저장한다() {
        RuleEditSaveResult r = columnsService.save(columns(0, renamed()));

        assertEquals(List.of("WARNING " + BROKEN), found(r.getIssues()), r.getIssues().toString());
        assertEquals("QLTY_X", jdbc.queryForObject("SELECT VAR_NAME FROM TB_MDM_RULE_VAR WHERE MARU_RULE_ID = ? AND VER = 2 AND VAR_ID = 4",
                String.class, ID));
    }

    @Test
    void 겉모양이_그대로면_룰_저장에_SET_CALLER_BROKEN_이_없다() {
        RuleEditSaveResult r = columnsService.save(columns(0, qCols()));

        assertEquals(List.of(), found(r.getIssues()), r.getIssues().toString());
    }

    @Test
    void 룰_확정은_부르는_세트를_깨면_SET_CALLER_BROKEN_으로_거부한다() {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET VAR_NAME = 'QLTY_X' WHERE MARU_RULE_ID = ? AND VER = 2 AND VAR_ID = 4", ID);
        VersionRef ref = new VersionRef(VersionTarget.BUSINESS_RULE, ID, DmeTestSupport.v(2));

        List<MdmCheckIssue> errors = RuleConfirmReport.flatten(confirmChecks.report(ref, DmeTestSupport.NOW)).errors();

        assertEquals(List.of(BROKEN), errors.stream().filter(i -> "SET_CALLER_BROKEN".equals(i.code())).map(MdmCheckIssue::message).toList(),
                errors.toString());
    }

    @Test
    void 부르는_세트가_없으면_계산하지_않는다() {
        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'DEPRECATED' WHERE MARU_RULE_SET_ID = 'P'");
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET VAR_NAME = 'QLTY_X' WHERE MARU_RULE_ID = ? AND VER = 2 AND VAR_ID = 4", ID);

        List<Map<String, Object>> issues = check.check(context(RuleSaveTarget.STORED));

        assertFalse(issues.stream().anyMatch(i -> "SET_CALLER_BROKEN".equals(i.get("code"))), issues.toString());
    }

    @Test
    void 같은_정의라도_적용_지점이_확정이면_ERROR_DRAFT_저장이면_WARNING() {
        jdbc.update("UPDATE TB_MDM_RULE_VAR SET VAR_NAME = 'QLTY_X' WHERE MARU_RULE_ID = ? AND VER = 2 AND VAR_ID = 4", ID);

        assertEquals(List.of("ERROR " + BROKEN), found(check.check(context(RuleSaveTarget.STORED))));
        assertEquals(List.of("WARNING " + BROKEN), found(check.check(context(RuleSaveTarget.TABLE))));
        assertEquals(List.of("WARNING " + BROKEN), found(check.check(context(RuleSaveTarget.COLUMNS))));
    }

    /** v2 저장 정의(행 없이 — 겉모양은 변수로 정해진다)로 만든 검사 입력. 확정이면 기준 시각 NOW. */
    private RuleSaveContext context(RuleSaveTarget target) {
        return new RuleSaveContext(ID, DmeTestSupport.v(2), "DECISION", "FIRST", queries.vars(ID, DmeTestSupport.v(2)), List.of(), List.of(),
                List.of(), target, target == RuleSaveTarget.STORED ? DmeTestSupport.NOW : null);
    }
}
