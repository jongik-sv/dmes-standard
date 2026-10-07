package com.dongkuk.dmes.mdm.dme.ruleSetConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.oasis.audit.AuditHolder;
import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.service.RuleSetConfirmService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.jdbc.core.JdbcTemplate;

/** D-144 2단계 — 세트 확정 화면 서비스: 검색·조회·검사·확정(직전 RELEASED 닫기·부모 승격). 시계 NOW = 2026-06-15 09:00. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetConfirmServiceSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetConfirmService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    MutableClock clock;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        clock.setLocal(DmeTestSupport.NOW);
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetConfirmMenu", "ruleSetConfirm"));
        DmeTestSupport.column(jdbc, "CF_IN", DmeTestSupport.domain(jdbc, "CF_IN_D", "QTY", "NUMBER", 0));
        DmeTestSupport.rule(jdbc, "R_A", "R_A", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_A", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_A", new BigDecimal("1.000"), 1, "COND", "1", "CF_IN", 1, null);
        DmeTestSupport.var(jdbc, "R_A", new BigDecimal("1.000"), 2, "RESULT", "Value", "OUT_A", 1, "STRING");
        DmeTestSupport.ruleSet(jdbc, "S_C", "확정 세트", "[]", "INUSE", 0);                     // 1.000 RELEASED 2000-01-01~
        DmeTestSupport.ruleSetDraft(jdbc, "S_C", "2.000", "kim", "[\"R_A\"]", 4);
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
    }

    @SuppressWarnings("unchecked")
    @Test
    void 조건_없는_조회에_limit_이_오면_세트_ID_앞쪽만_주고_전체_건수와_잘림을_알린다() {
        DmeTestSupport.ruleSet(jdbc, "S_D", "둘째 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_D", "2.000", "kim", "[\"R_A\"]", 4);
        RuleSetConfirmSearchRequest q = new RuleSetConfirmSearchRequest();
        q.setLimit(1);

        Map<String, Object> result = service.search(q);

        assertThat((List<Map<String, Object>>) result.get("rows")).extracting(r -> r.get("setId")).containsExactly("S_C");
        assertThat(result.get("totalCount")).isEqualTo(2);
        assertThat(result.get("truncated")).isEqualTo(true);
    }

    @SuppressWarnings("unchecked")
    @Test
    void limit_이_없거나_조건이_있으면_상한_없이_전부_주고_limit_없는_응답_모양은_그대로다() {
        DmeTestSupport.ruleSet(jdbc, "S_D", "둘째 세트", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_D", "2.000", "kim", "[\"R_A\"]", 4);
        RuleSetConfirmSearchRequest withKeyword = new RuleSetConfirmSearchRequest();
        withKeyword.setKeyword("S_");
        withKeyword.setLimit(1);
        RuleSetConfirmSearchRequest big = new RuleSetConfirmSearchRequest();
        big.setLimit(1000);

        Map<String, Object> noLimit = service.search(new RuleSetConfirmSearchRequest());
        Map<String, Object> keyword = service.search(withKeyword);
        Map<String, Object> bigResult = service.search(big);

        assertThat((List<?>) noLimit.get("rows")).hasSize(2);
        assertThat(noLimit.keySet()).containsExactly("rows");
        for (Map<String, Object> r : List.of(keyword, bigResult)) {
            assertThat((List<?>) r.get("rows")).hasSize(2);
            assertThat(r.get("totalCount")).isEqualTo(2);
            assertThat(r.get("truncated")).isEqualTo(false);
        }
    }

    @SuppressWarnings("unchecked")
    @Test
    void searchViewValidateConfirmClosesPreviousAndUsesNewVersion() {
        RuleSetConfirmSearchRequest s = new RuleSetConfirmSearchRequest();
        List<Map<String, Object>> rows = (List<Map<String, Object>>) service.search(s).get("rows");
        assertThat(rows).extracting(r -> r.get("setId") + "@" + r.get("ver")).containsExactly("S_C@2.000");

        RuleSetConfirmViewRequest v = new RuleSetConfirmViewRequest();
        v.setSetId("S_C");
        Map<String, Object> view = service.view(v);
        assertThat(((Map<String, Object>) view.get("version")).get("ver")).isEqualTo("2.000");
        assertThat(((Map<String, Object>) view.get("previous")).get("ver")).isEqualTo("1.000");

        RuleSetConfirmValidateRequest val = new RuleSetConfirmValidateRequest();
        val.setSetId("S_C");
        val.setVer("2.000");
        val.setApplyFrom("2026-06-15 09:00:00");
        Map<String, Object> checked = service.validate(val);
        assertThat(checked.get("rejectedCount")).isEqualTo(0);
        assertThat(((Map<String, Object>) checked.get("applyFromCheck")).get("status")).isEqualTo("PASSED");

        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(4L);
        c.setApplyFrom("2026-06-15 09:00:00");
        Map<String, Object> done = service.confirm(c);
        assertThat(((Map<String, Object>) done.get("confirmed")).get("ver")).isEqualTo("2.000");
        assertThat(done.get("closedPreviousVer")).isEqualTo("1.000");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("RELEASED");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "1.000", "APPLY_TO")).isEqualTo("2026-06-15 09:00:00");
    }

    @Test
    void createdParentIsPromotedOnAppliedConfirm() {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES ('S_NEW', '새 세트', 'CREATED')");
        DmeTestSupport.ruleSetDraft(jdbc, "S_NEW", "1.000", "kim", "[\"R_A\"]", 0);
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_NEW");
        c.setVer("1.000");
        c.setRowVersion(0L);
        c.setApplyFrom("2026-06-15 09:00:00");
        service.confirm(c);
        assertThat(jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = 'S_NEW'", String.class)).isEqualTo("INUSE");
    }

    @Test
    void confirmIsRejectedWhenARuleHasNoReleasedAtApplyFromAndDraftStays() {
        DmeTestSupport.rule(jdbc, "R_LATE", "R_LATE", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_LATE", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-09-01 00:00:00", null);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = '[\"R_A\",\"R_LATE\"]' WHERE MARU_RULE_SET_ID = 'S_C' AND VER = 2");
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(4L);
        c.setApplyFrom("2026-07-01 00:00:00");
        assertThatThrownBy(() -> service.confirm(c)).hasMessageContaining("확정 검사");          // MDM010
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("DRAFT");
    }

    /** Ruling P2-14 — 미래 경계 WARNING 은 확정을 막지 않고 warningsAcknowledged 확인만 요구한다. */
    @Test
    void futureBoundaryWarningNeedsAcknowledgementButDoesNotBlockConfirm() {
        DmeTestSupport.rule(jdbc, "R_X", "R_X", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_X", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-01-01 00:00:00", "2026-08-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_X", new BigDecimal("1.000"), 1, "COND", "1", "CF_IN", 1, null);
        DmeTestSupport.var(jdbc, "R_X", new BigDecimal("1.000"), 2, "RESULT", "Value", "OUT_X", 1, "STRING");
        DmeTestSupport.released(jdbc, "R_X", new BigDecimal("2.000"), "MAJOR", "FIRST", "2026-08-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_X", new BigDecimal("2.000"), 1, "COND", "1", "OUT_Y", 1, null);   // 뒤 룰 R_Y 의 결과를 읽는다
        DmeTestSupport.var(jdbc, "R_X", new BigDecimal("2.000"), 2, "RESULT", "Value", "OUT_X", 1, "STRING");
        DmeTestSupport.rule(jdbc, "R_Y", "R_Y", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_Y", new BigDecimal("1.000"), "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_Y", new BigDecimal("1.000"), 1, "COND", "1", "CF_IN", 1, null);
        DmeTestSupport.var(jdbc, "R_Y", new BigDecimal("1.000"), 2, "RESULT", "Value", "OUT_Y", 1, "STRING");
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET RULE_IDS = '[\"R_X\",\"R_Y\"]' WHERE MARU_RULE_SET_ID = 'S_C' AND VER = 2");

        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(4L);
        c.setApplyFrom("2026-07-01 00:00:00");
        // 확인 없이는 MDM014 — 확정되지 않고 DRAFT 그대로
        assertThatThrownBy(() -> service.confirm(c)).hasMessageContaining("경고를 확인");
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("DRAFT");

        // 확인하면 확정된다(ERROR 가 아니다)
        c.setWarningsAcknowledged(true);
        service.confirm(c);
        assertThat(DmeTestSupport.setVerValue(jdbc, "S_C", "2.000", "STATUS")).isEqualTo("RELEASED");
    }

    @Test
    void applyFromNotAfterPreviousIsRejected() {
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_FROM = TIMESTAMP '2026-06-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_C' AND VER = 1");
        RuleSetConfirmValidateRequest val = new RuleSetConfirmValidateRequest();
        val.setSetId("S_C");
        val.setVer("2.000");
        val.setApplyFrom("2026-06-01 00:00:00");
        @SuppressWarnings("unchecked")
        Map<String, Object> order = (Map<String, Object>) service.validate(val).get("applyFromCheck");
        assertThat(order.get("status")).isEqualTo("REJECTED");
    }

    @SuppressWarnings("unchecked")
    @Test
    void viewSucceedsWithDiffErrorWhenStoredFlowIsCorrupt() {
        DmeTestSupport.ruleSetFlow(jdbc, "S_C", "2.000", "{\"version\":1,\"nodes\":\"bad\",\"edges\":[]}");
        RuleSetConfirmViewRequest v = new RuleSetConfirmViewRequest();
        v.setSetId("S_C");
        Map<String, Object> view = service.view(v);
        assertThat(((Map<String, Object>) view.get("version")).get("ver")).isEqualTo("2.000");
        assertThat((List<Object>) view.get("diff")).isEmpty();
        assertThat((String) view.get("diffError")).contains("저장된 흐름");

        // 버전이 없는 경우는 지금처럼 실패한다
        v.setVer("9.000");
        assertThatThrownBy(() -> service.view(v)).hasMessageContaining("버전이 없습니다");
    }

    /** MDM 메타 캐시(spec 2026-10-02 §3.3) — 세트 확정은 공통 버전 상태 서비스 한 곳에서 RULE_SET 을 한 번 기록한다. 거부된 확정은 기록하지 않는다. */
    @Test
    void META_세트_확정은_RULE_SET_을_한_번_기록하고_거부된_확정은_기록하지_않는다() {
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId("S_C");
        c.setVer("2.000");
        c.setRowVersion(3L);                                                                      // 틀린 행 버전 → 거부
        c.setApplyFrom("2026-06-15 09:00:00");
        MetaRevTestSupport.clear(jdbc);
        assertThatThrownBy(() -> service.confirm(c));
        assertThat(MetaRevTestSupport.rows(jdbc)).isEmpty();

        c.setRowVersion(4L);
        service.confirm(c);
        assertThat(MetaRevTestSupport.rows(jdbc)).containsExactly("RULE_SET:S_C:SAVE");
    }
}
