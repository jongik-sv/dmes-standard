package com.dongkuk.dmes.mdm.dme.ruleSetConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmValidateRequest;
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
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 하위 세트 spec §5·§6.1, srv:6 조정 ② — 세트 확정 검사가 SET 노드 겉모양(apply_from 기준)·호출 그래프·연쇄 재검사를 보고, 네 코드(CALL_MISSING·
 * CALL_CYCLE·CALL_DEPTH·CALLER_BROKEN)를 수준과 상관없이 거부(FLOW_STRUCTURE ERROR)로 본다. DRAFT 의 흐름·CALL_SET_IDS 는 저장 서비스(srv:6 C)를 거치지
 * 않고 직접 넣는다. SET 노드가 든 흐름은 엔진으로 실행하지 않는다(SEAM T4 — 케이스를 두지 않는다). 시계 NOW = 2026-06-15 09:00.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetSubsetConfirmSqliteTest extends AbstractMdmSharedDbTest {

    static final String NOW = "2026-06-15 09:00:00";
    static final String UNKNOWN_OUT_X = "R_P의 조건 변수 OUT_X는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다";

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
        DmeTestSupport.column(jdbc, "IN_A", DmeTestSupport.domain(jdbc, "IN_A_D", "QTY", "NUMBER", 0));
        rule("R_A", "IN_A", "OUT_A");
        rule("R_B", "IN_A", "OUT_B");
        rule("R_C1", "IN_A", "OUT_X");
        rule("R_C2", "IN_A", "OUT_Y");
        rule("R_P", "OUT_X", "OUT_P");          // OUT_X 는 컬럼 사전에 없다 — 하위 세트 C 가 만들어야 읽을 수 있다
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
    }

    private void rule(String id, String cond, String result) {
        BigDecimal v1 = new BigDecimal("1.000");
        DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, v1, "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, v1, 1, "COND", "1", cond, 1, null);
        DmeTestSupport.var(jdbc, id, v1, 2, "RESULT", "Value", result, 1, "STRING");
    }

    /** 세트 + 1.000 RELEASED(목록 ruleIds) + 2.000 DRAFT(흐름 flow, 부르는 세트 callIds — 저장 서비스가 흐름에서 계산해 넣는 값). */
    private void setWithDraft(String id, String releasedIds, String draftIds, String flow, String callIds) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", releasedIds, "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, id, "2.000", "kim", draftIds, 1);
        if (flow != null) {
            DmeTestSupport.ruleSetFlow(jdbc, id, "2.000", flow);
        }
        DmeTestSupport.ruleSetCalls(jdbc, id, "2.000", callIds);
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> item(String setId, String name) {
        RuleSetConfirmValidateRequest v = new RuleSetConfirmValidateRequest();
        v.setSetId(setId);
        v.setVer("2.000");
        v.setApplyFrom(NOW);
        List<Map<String, Object>> items = (List<Map<String, Object>>) service.validate(v).get("items");
        return items.stream().filter(i -> name.equals(i.get("item"))).findFirst().orElseThrow();
    }

    @SuppressWarnings("unchecked")
    private List<String> issues(String setId, String name) {
        return ((List<Map<String, Object>>) item(setId, name).get("issues")).stream()
                .map(i -> i.get("severity") + " " + i.get("code") + " " + i.get("message")).toList();
    }

    private RuleSetConfirmRequest confirm(String setId) {
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId(setId);
        c.setVer("2.000");
        c.setRowVersion(1L);
        c.setApplyFrom(NOW);
        return c;
    }

    private String status(String setId) {
        return DmeTestSupport.setVerValue(jdbc, setId, "2.000", "STATUS");
    }

    /**
     * 필수 시험(Task 6 갱신 메모) — 두 DRAFT 가 순환을 반씩(A→B, B→A) 만든다. 호출 그래프는 apply_from 이후 유효한 RELEASED 행만 세므로 먼저 확정하는
     * A 는 통과하고(B 의 RELEASED 는 아무것도 부르지 않는다), 나중에 확정하는 B 는 A 의 새 RELEASED(A→B)와 만나 CALL_CYCLE 로 막힌다.
     */
    @Test
    void 두_DRAFT_가_순환을_반씩_만들면_먼저_확정은_통과하고_나중_확정이_CALL_CYCLE_로_막힌다() {
        setWithDraft("A", "[\"R_A\"]", "[]", line(setNode("s1", "B")), "[\"B\"]");
        setWithDraft("B", "[\"R_B\"]", "[]", line(setNode("s1", "A")), "[\"A\"]");

        assertThat(item("A", "FLOW_STRUCTURE").get("status")).isEqualTo("PASSED");
        service.confirm(confirm("A"));               // 경고도 없어 확인 없이 확정된다
        assertThat(status("A")).isEqualTo("RELEASED");

        assertThat(issues("B", "FLOW_STRUCTURE")).containsExactly("ERROR CALL_CYCLE 세트 호출이 순환한다: B › A › B");
        assertThat(item("B", "FLOW_STRUCTURE").get("status")).isEqualTo("REJECTED");
        RuleSetConfirmRequest b = confirm("B");
        b.setWarningsAcknowledged(true);
        assertThatThrownBy(() -> service.confirm(b)).hasMessageContaining("확정 검사");          // MDM010
        assertThat(status("B")).isEqualTo("DRAFT");
    }

    /** 필수 시험의 확정 쪽 — 자식 C 가 OUT_X 를 더 내지 않게 바뀌면 C 를 부르는 P 의 R_P 가 OUT_X 를 못 읽는다. P 에 없던 거부라 확정을 막는다. */
    @Test
    void 부르는_세트를_깨는_확정은_CALLER_BROKEN_으로_막힌다() {
        setWithDraft("C", "[\"R_C1\"]", "[\"R_C2\"]", null, "[]");                            // 목록 세트도 SET 노드로 불린다
        DmeTestSupport.ruleSet(jdbc, "P", "P 세트", "[\"R_P\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "P", "1.000", line(setNode("s1", "C"), ruleNode("r1", "R_P")));
        DmeTestSupport.ruleSetCalls(jdbc, "P", "1.000", "[\"C\"]");

        assertThat(issues("C", "FLOW_STRUCTURE")).containsExactly("ERROR CALLER_BROKEN 세트 P: " + UNKNOWN_OUT_X);
        RuleSetConfirmRequest c = confirm("C");
        c.setWarningsAcknowledged(true);
        assertThatThrownBy(() -> service.confirm(c)).hasMessageContaining("확정 검사");
        assertThat(status("C")).isEqualTo("DRAFT");
    }

    @Test
    void 부르는_세트가_폐기됐으면_연쇄_재검사를_하지_않아_확정된다() {
        setWithDraft("C", "[\"R_C1\"]", "[\"R_C2\"]", null, "[]");
        DmeTestSupport.ruleSet(jdbc, "P", "P 세트", "[\"R_P\"]", "DEPRECATED", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "P", "1.000", line(setNode("s1", "C"), ruleNode("r1", "R_P")));
        DmeTestSupport.ruleSetCalls(jdbc, "P", "1.000", "[\"C\"]");

        assertThat(issues("C", "FLOW_STRUCTURE")).isEmpty();
        service.confirm(confirm("C"));
        assertThat(status("C")).isEqualTo("RELEASED");
    }

    /** 분석기는 CALL_MISSING 을 WARN 으로 내지만(편차 13) 확정은 거부로 본다 — 기준 시각에 RELEASED 가 없는 세트를 부른다. */
    @Test
    void 없는_세트를_부르는_CALL_MISSING_경고는_확정에서_거부다() {
        DmeTestSupport.ruleSet(jdbc, "LATE", "늦은 세트", "[\"R_B\"]", "INUSE", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_FROM = '2026-09-01 00:00:00' WHERE MARU_RULE_SET_ID = 'LATE'");
        setWithDraft("A", "[\"R_A\"]", "[\"R_A\"]", line(setNode("s1", "LATE"), ruleNode("r1", "R_A")), "[\"LATE\"]");

        List<String> found = issues("A", "FLOW_STRUCTURE");
        assertThat(found).hasSize(1);
        assertThat(found.get(0)).startsWith("ERROR CALL_MISSING ");
        RuleSetConfirmRequest a = confirm("A");
        a.setWarningsAcknowledged(true);
        assertThatThrownBy(() -> service.confirm(a)).hasMessageContaining("확정 검사");
        assertThat(status("A")).isEqualTo("DRAFT");
    }

    /** 새 거부 없이 부르는 세트에 새 경고만 생기면 CALLER_WARN 한 건 — 확정은 경고 확인 뒤 된다. */
    @Test
    void 부르는_세트에_새_경고만_생기면_CALLER_WARN_이고_확인하면_확정된다() {
        // C 2.000 은 OUT_X 를 IF 한 갈래에서만 만든다(always=false) — P 의 R_P 는 FLOW_PARTIAL 경고가 된다.
        String ifFlow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + ruleNode("r1", "R_C1") + "," + ruleNode("r2", "R_C2") + ",{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
                + "{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"IN_A > 1\"},{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},"
                + "{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e3\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e4\",\"from\":\"m1\",\"to\":\"end\"}]}";
        setWithDraft("C", "[\"R_C1\"]", "[\"R_C1\",\"R_C2\"]", ifFlow, "[]");
        DmeTestSupport.ruleSet(jdbc, "P", "P 세트", "[\"R_P\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "P", "1.000", line(setNode("s1", "C"), ruleNode("r1", "R_P")));
        DmeTestSupport.ruleSetCalls(jdbc, "P", "1.000", "[\"C\"]");

        assertThat(issues("C", "FLOW_STRUCTURE")).containsExactly("WARNING CALLER_WARN 부르는 세트에 경고가 생겼다: P");
        RuleSetConfirmRequest c = confirm("C");
        assertThatThrownBy(() -> service.confirm(c)).hasMessageContaining("경고를 확인");
        c.setWarningsAcknowledged(true);
        service.confirm(c);
        assertThat(status("C")).isEqualTo("RELEASED");
    }
}
