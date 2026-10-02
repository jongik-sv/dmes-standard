package com.dongkuk.dmes.mdm.dme.ruleEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;

import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.SetInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.dto.RuleEditViewResult.UsageInfo;
import com.dongkuk.dmes.mdm.dme.ruleEdit.service.RuleUsageService;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-08-02 design §3.1 「RuleUsageServiceTest」·§6.3.9 — 카드 ⑧ 활용처: 이 룰을 담은 세트와 세트 안의 의존 룰(이 룰이 읽는 이름을
 * 만드는 룰)·역의존 룰(이 룰이 만드는 이름을 읽는 룰). 각 룰은 최신 RELEASED 버전으로 계산하고, 이 룰에 RELEASED 가 없으면 이 룰만
 * view 의 선택 버전으로 계산한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleUsageServiceTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleUsageService service;
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
        jdbc.update("UPDATE TB_MDM_RULE SET USAGE_NOTE = '3CCL 라인' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        // PRE_CALC 는 SURF_GRD 를 만든다 → QLTY 가 의존한다.
        DmeTestSupport.rule(jdbc, "PRE_CALC", "앞 산출", "DERIVE", "INUSE");
        DmeTestSupport.released(jdbc, "PRE_CALC", 1, null, "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "PRE_CALC", 1, 1, "COND", "1", "RAW_GRD", 1, null);
        DmeTestSupport.var(jdbc, "PRE_CALC", 1, 2, "RESULT", "Value", "SURF_GRD", 1, "STRING");
        // PRE_CALC 의 옛 RELEASED(ver 0 이 아니라 더 작은 번호)는 PRC_FCT 를 읽었지만 최신만 본다.
        // POST_JDG 는 조건 열로 QLTY_GRD 를 읽는다 → 역의존.
        DmeTestSupport.rule(jdbc, "POST_JDG", "뒤 판정", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "POST_JDG", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "POST_JDG", 1, 1, "COND", "1", "QLTY_GRD", 1, null);
        DmeTestSupport.var(jdbc, "POST_JDG", 1, 2, "RESULT", "Value", "LINE_CD", 1, "STRING");
        // EXPR_CALC 는 결과 Expression 셀의 AST 로 PRC_FCT 를 읽는다 → 역의존.
        DmeTestSupport.rule(jdbc, "EXPR_CALC", "식 산출", "DERIVE", "INUSE");
        DmeTestSupport.released(jdbc, "EXPR_CALC", 1, null, "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "EXPR_CALC", 1, 1, "RESULT", "Expression", "FINAL_FCT", 1, "NUMBER");
        DmeTestSupport.row(jdbc, "EXPR_CALC", 1, 1, 1, "NORMAL", "{\"1\":{\"expr\":\"PRC_FCT * 2\",\"ast\":{\"type\":\"INFIX_OPERATOR\",\"value\":\"*\","
                + "\"params\":[{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"PRC_FCT\",\"params\":[]},{\"type\":\"NUMBER_LITERAL\",\"value\":\"2\",\"params\":[]}]}}}");
        // VAR_READER 는 식 변수(VAR_AST)로 QLTY_GRD 를 읽는다 → 역의존. 이름 변수가 아니므로 VAR_NAME(식 텍스트)은 이름으로 보지 않는다.
        DmeTestSupport.rule(jdbc, "VAR_READER", "식 변수", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "VAR_READER", 1, "FIRST", "2026-01-01 00:00:00", null);
        jdbc.update("INSERT INTO TB_MDM_RULE_VAR (MARU_RULE_ID, VER, VAR_ID, VAR_KIND, DISP_TYPE, VAR_NAME, VAR_AST, SEQ) VALUES ('VAR_READER', 1, 1, "
                + "'COND', '1', 'SURF_GRD + QLTY_GRD', '{\"type\":\"INFIX_OPERATOR\",\"value\":\"+\",\"params\":["
                + "{\"type\":\"VARIABLE_OR_CONSTANT\",\"value\":\"QLTY_GRD\",\"params\":[]},{\"type\":\"STRING_LITERAL\",\"value\":\"X\",\"params\":[]}]}', 1)");
        DmeTestSupport.var(jdbc, "VAR_READER", 1, 2, "RESULT", "Value", "READ_OUT", 1, "STRING");
        // UNRELEASED 는 RELEASED 가 없어 세트 계산에 끼지 않는다(DRAFT 는 QLTY_GRD 를 읽는다).
        DmeTestSupport.rule(jdbc, "UNRELEASED", "미확정", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "UNRELEASED", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "UNRELEASED", 1, 1, "COND", "1", "QLTY_GRD", 1, null);
        DmeTestSupport.var(jdbc, "UNRELEASED", 1, 2, "RESULT", "Value", "U_OUT", 1, "STRING");

        set("LS_A", "3CCL", "[\"PRE_CALC\",\"QLTY_GRD_JDG\",\"POST_JDG\",\"EXPR_CALC\",\"VAR_READER\",\"UNRELEASED\"]");
        set("LS_B", "단독", "[\"QLTY_GRD_JDG\"]");
        set("LS_C", "무관", "[\"POST_JDG\"]");
        set("LS_D", "미확정 묶음", "[\"QLTY_GRD_JDG\",\"UNRELEASED\"]");
    }

    private void set(String id, String name, String ruleIds) {
        DmeTestSupport.ruleSet(jdbc, id, name, ruleIds, "INUSE", 0);
    }

    private static SetInfo find(UsageInfo u, String setId) {
        return u.getSets().stream().filter(s -> s.getSetId().equals(setId)).findFirst().orElseThrow();
    }

    @Test
    void 이_룰을_담은_세트만_세트_ID_순으로_보인다() {
        UsageInfo u = service.usage("QLTY_GRD_JDG", DmeTestSupport.v(1));
        assertEquals("3CCL 라인", u.getUsageNote());
        assertEquals(List.of("LS_A", "LS_B", "LS_D"), u.getSets().stream().map(SetInfo::getSetId).toList());
        assertEquals("3CCL", find(u, "LS_A").getSetName());
        assertEquals("INUSE", find(u, "LS_A").getStatus());
    }

    @Test
    void 의존_룰은_읽는_이름을_만드는_룰이고_역의존_룰은_만드는_이름을_읽는_룰이다() {
        SetInfo a = find(service.usage("QLTY_GRD_JDG", DmeTestSupport.v(1)), "LS_A");
        assertEquals(List.of("PRE_CALC"), a.getDependsOn());
        assertEquals(List.of("POST_JDG", "EXPR_CALC", "VAR_READER"), a.getDependedBy(), "세트 순서대로, RELEASED 없는 룰은 뺀다");
        SetInfo b = find(service.usage("QLTY_GRD_JDG", DmeTestSupport.v(1)), "LS_B");
        assertEquals(List.of(), b.getDependsOn());
        assertEquals(List.of(), b.getDependedBy());
    }

    @Test
    void RELEASED_가_없는_룰은_선택_버전으로_계산한다() {
        SetInfo d = find(service.usage("UNRELEASED", DmeTestSupport.v(1)), "LS_D");
        assertEquals(List.of("QLTY_GRD_JDG"), d.getDependsOn());
        assertEquals(List.of(), d.getDependedBy());
    }

    @Test
    void 최신_RELEASED_만_본다() {
        // POST_JDG 의 새 RELEASED(ver 2)는 QLTY_GRD 를 더는 읽지 않는다.
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-03-01 00:00:00' WHERE MARU_RULE_ID = 'POST_JDG' AND VER = 1");
        DmeTestSupport.released(jdbc, "POST_JDG", 2, "FIRST", "2026-03-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "POST_JDG", 2, 1, "COND", "1", "COIL_THK", 1, null);
        DmeTestSupport.var(jdbc, "POST_JDG", 2, 2, "RESULT", "Value", "LINE_CD", 1, "STRING");
        assertEquals(List.of("EXPR_CALC", "VAR_READER"), find(service.usage("QLTY_GRD_JDG", DmeTestSupport.v(1)), "LS_A").getDependedBy());
    }

    @Test
    void 세트에_없으면_빈_목록이다() {
        DmeTestSupport.rule(jdbc, "ALONE", "혼자", "DECISION", "CREATED");
        assertEquals(List.of(), service.usage("ALONE", null).getSets());
    }
}
