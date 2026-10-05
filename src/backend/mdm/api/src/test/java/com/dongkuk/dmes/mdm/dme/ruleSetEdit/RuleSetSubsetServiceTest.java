package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleSetCheck;
import com.dongkuk.dmes.mdm.common.rule.SetCallIo;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.dto.RuleSetConfirmValidateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetConfirm.service.RuleSetConfirmService;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetCallIoResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetEditSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetPickResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetStatusResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetViewResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
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
 * 하위 세트 spec §5·§6.2·§6.3·§8, srv:6 조정 ①④ — 편집 서비스의 DRAFT 저장(CALL_SET_IDS 쓰기, 네 코드는 경고), 폐기 거부, 되살리기 거부(네 코드), 조회
 * (view.calls·search CALL_IO·CALLERS). 기준 시각은 모두 지금(시계 NOW = 2026-06-15 09:00). 필수 시험(Task 6 갱신 메모)의 저장 쪽은 확정까지 서비스로
 * 이어 본다(확정 쪽 단독 시험은 ruleSetConfirm/RuleSetSubsetConfirmSqliteTest). SET 노드가 든 흐름은 여기서 엔진으로 실행하지 않는다(실행은 RuleSetRunnerSubsetTest).
 *
 * <p>룰(모두 1.000 RELEASED, 조건 하나·결과 하나): R_A(IN_A → OUT_A), R_B(IN_A → OUT_B), R_C1(IN_A → OUT_X), R_C2(IN_A → OUT_Y),
 * R_P(OUT_X → OUT_P — OUT_X 는 컬럼 사전에 없어 하위 세트가 만들어야 읽는다).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetSubsetServiceTest extends AbstractMdmSharedDbTest {

    static final String NOW = "2026-06-15 09:00:00";
    static final String UNKNOWN_OUT_X = "R_P의 조건 변수 OUT_X는 컬럼 사전에 없고 세트 안의 어느 룰도 만들지 않는다";

    @Autowired
    RuleSetEditService service;
    @Autowired
    RuleSetConfirmService confirmService;
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
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetEditMenu", "ruleSetEdit"));
        DmeTestSupport.column(jdbc, "IN_A", DmeTestSupport.domain(jdbc, "IN_A_D", "QTY", "NUMBER", 0));
        rule("R_A", "IN_A", "OUT_A");
        rule("R_B", "IN_A", "OUT_B");
        rule("R_C1", "IN_A", "OUT_X");
        rule("R_C2", "IN_A", "OUT_Y");
        rule("R_P", "OUT_X", "OUT_P");
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
    }

    // ── 도우미 ──

    private void rule(String id, String cond, String result) {
        BigDecimal v1 = new BigDecimal("1.000");
        DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, v1, "MAJOR", "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, id, v1, 1, "COND", "1", cond, 1, null);
        DmeTestSupport.var(jdbc, id, v1, 2, "RESULT", "Value", result, 1, "STRING");
    }

    /** 세트 + 1.000 RELEASED(목록 ruleIds) + kim 의 2.000 DRAFT(같은 목록, ROW_VERSION 0). */
    private void setWithDraft(String id, String status, String ruleIds) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", ruleIds, status, 0);
        DmeTestSupport.ruleSetDraft(jdbc, id, "2.000", "kim", ruleIds, 0);
    }

    /** 세트 + 1.000 RELEASED 흐름(부르는 세트 callIds 를 맞춰 둔다). */
    private void releasedFlow(String id, String status, String ruleIds, String flow, String callIds) {
        DmeTestSupport.ruleSet(jdbc, id, id + " 세트", ruleIds, status, 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, "1.000", flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, "1.000", callIds);
    }

    /** P(1.000 RELEASED) = SET C → R_P. R_P 는 C 가 내는 OUT_X 를 읽는다. */
    private void parentP(String status) {
        releasedFlow("P", status, "[\"R_P\"]", line(setNode("s1", "C"), ruleNode("r1", "R_P")), "[\"C\"]");
    }

    private RuleSetSaveRequest base(String setId, long rowVersion) {
        RuleSetSaveRequest r = new RuleSetSaveRequest();
        r.setSetId(setId);
        r.setVer("2.000");
        r.setRowVersion(rowVersion);
        r.setSetName(setId + " 세트");
        return r;
    }

    private RuleSetSaveResult saveFlow(String setId, long rowVersion, String flow) {
        RuleSetSaveRequest r = base(setId, rowVersion);
        r.setFlowJson(flow);
        return service.save(r);
    }

    private RuleSetSaveResult saveList(String setId, long rowVersion, String... ruleIds) {
        RuleSetSaveRequest r = base(setId, rowVersion);
        r.setRules(java.util.Arrays.stream(ruleIds).map(id -> Map.<String, Object>of("ruleId", id)).toList());
        return service.save(r);
    }

    private static List<String> lines(List<RuleSetCheck> checks) {
        return checks.stream().map(c -> c.severity() + " " + c.code() + " " + c.message()).toList();
    }

    private static List<String> callLines(List<RuleSetCheck> checks) {
        return lines(checks.stream().filter(c -> RuleSetCheck.CALL_CODES.contains(c.code()) || RuleSetCheck.CALLER_WARN.equals(c.code())).toList());
    }

    private String ver(String setId, String column) {
        return DmeTestSupport.setVerValue(jdbc, setId, "2.000", column);
    }

    @SuppressWarnings("unchecked")
    private List<String> confirmIssues(String setId) {
        RuleSetConfirmValidateRequest v = new RuleSetConfirmValidateRequest();
        v.setSetId(setId);
        v.setVer("2.000");
        v.setApplyFrom(NOW);
        List<Map<String, Object>> items = (List<Map<String, Object>>) confirmService.validate(v).get("items");
        Map<String, Object> item = items.stream().filter(i -> "FLOW_STRUCTURE".equals(i.get("item"))).findFirst().orElseThrow();
        return ((List<Map<String, Object>>) item.get("issues")).stream()
                .map(i -> i.get("severity") + " " + i.get("code") + " " + i.get("message")).toList();
    }

    private RuleSetConfirmRequest confirm(String setId, long rowVersion) {
        RuleSetConfirmRequest c = new RuleSetConfirmRequest();
        c.setSetId(setId);
        c.setVer("2.000");
        c.setRowVersion(rowVersion);
        c.setApplyFrom(NOW);
        return c;
    }

    private String parentStatus(String setId) {
        return jdbc.queryForObject("SELECT STATUS FROM TB_MDM_RULE_SET WHERE MARU_RULE_SET_ID = ?", String.class, setId);
    }

    private static RuleSetVersionRequest deprecateReq(String setId) {
        RuleSetVersionRequest r = new RuleSetVersionRequest();
        r.setSetId(setId);
        r.setTarget(RuleSetVersionRequest.TARGET_SET);
        return r;
    }

    private static RuleSetStatusRequest restoreReq(String setId) {
        RuleSetStatusRequest r = new RuleSetStatusRequest();
        r.setSetId(setId);
        r.setRowVersion(0L);
        return r;
    }

    // ── 저장: 필수 시험 ──

    /**
     * 필수 시험(Task 6 갱신 메모, spec §6.1 동시 수정) — 두 DRAFT 가 순환을 반씩(A→B, B→A) 만든다. 호출 그래프는 지금 이후 유효한 RELEASED 행만 세므로
     * 두 저장은 순환 경고도 없이 통과하고 CALL_SET_IDS 를 쓴다. 먼저 A 를 확정하면 통과하고, 그 뒤 B 를 다시 저장하면 A 의 새 RELEASED(A→B)와 만나
     * CALL_CYCLE 이 경고로만 오며 저장은 된다. 나중 확정인 B 는 CALL_CYCLE 로 막힌다.
     */
    @Test
    void 두_DRAFT_가_순환을_반씩_만들면_각자_저장은_경고로_통과하고_먼저_확정은_통과하고_나중_확정이_CALL_CYCLE_로_막힌다() {
        setWithDraft("A", "INUSE", "[\"R_A\"]");
        setWithDraft("B", "INUSE", "[\"R_B\"]");

        RuleSetSaveResult a = saveFlow("A", 0, line(setNode("s1", "B")));
        RuleSetSaveResult b = saveFlow("B", 0, line(setNode("s1", "A")));
        assertThat(callLines(a.getChecks())).isEmpty();
        assertThat(callLines(b.getChecks())).isEmpty();
        assertThat(ver("A", "CALL_SET_IDS")).isEqualTo("[\"B\"]");
        assertThat(ver("B", "CALL_SET_IDS")).isEqualTo("[\"A\"]");
        assertThat(ver("A", "RULE_IDS")).isEqualTo("[]");

        confirmService.confirm(confirm("A", a.getRowVersion()));
        assertThat(ver("A", "STATUS")).isEqualTo("RELEASED");

        RuleSetSaveResult again = saveFlow("B", b.getRowVersion(), line(setNode("s1", "A")));
        assertThat(callLines(again.getChecks())).containsExactly("WARN CALL_CYCLE 세트 호출이 순환한다: B › A › B");
        assertThat(again.getRowVersion()).isEqualTo(b.getRowVersion() + 1);
        assertThat(ver("B", "ROW_VERSION")).isEqualTo(String.valueOf(again.getRowVersion()));

        RuleSetConfirmRequest cb = confirm("B", again.getRowVersion());
        cb.setWarningsAcknowledged(true);
        assertThatThrownBy(() -> confirmService.confirm(cb)).hasMessageContaining("확정 검사");          // MDM010
        assertThat(ver("B", "STATUS")).isEqualTo("DRAFT");
    }

    /**
     * 필수 시험(Task 6 갱신 메모) — 같은 부모 깨짐이 DRAFT 저장에서는 경고, 확정에서는 거부다. 목록 세트 C 가 OUT_X 를 더 내지 않게 바꾸면 C 를 부르는 P
     * 의 R_P 가 OUT_X 를 못 읽는다.
     */
    @Test
    void 부르는_세트를_깨는_저장은_CALLER_BROKEN_경고로_통과하고_확정은_거부한다() {
        setWithDraft("C", "INUSE", "[\"R_C1\"]");
        parentP("INUSE");

        RuleSetSaveResult r = saveList("C", 0, "R_C2");
        assertThat(callLines(r.getChecks())).containsExactly("WARN CALLER_BROKEN 세트 P: " + UNKNOWN_OUT_X);
        assertThat(r.getChecks()).noneMatch(RuleSetCheck::rejected);
        assertThat(ver("C", "RULE_IDS")).isEqualTo("[\"R_C2\"]");
        assertThat(ver("C", "CALL_SET_IDS")).isEqualTo("[]");

        assertThat(confirmIssues("C")).containsExactly("ERROR CALLER_BROKEN 세트 P: " + UNKNOWN_OUT_X);
        RuleSetConfirmRequest c = confirm("C", r.getRowVersion());
        c.setWarningsAcknowledged(true);
        assertThatThrownBy(() -> confirmService.confirm(c)).hasMessageContaining("확정 검사");
        assertThat(ver("C", "STATUS")).isEqualTo("DRAFT");
    }

    // ── 저장: 그 밖 ──

    @Test
    void 흐름_저장은_CALL_SET_IDS_를_깊이_우선으로_중복_없이_쓰고_RULE_IDS_는_룰만_담는다() {
        setWithDraft("A", "INUSE", "[\"R_A\"]");
        setWithDraft("B", "INUSE", "[\"R_B\"]");
        setWithDraft("C", "INUSE", "[\"R_C1\"]");
        saveFlow("A", 0, line(setNode("s1", "C"), ruleNode("r1", "R_A"), setNode("s2", "B"), setNode("s3", "C")));
        assertThat(ver("A", "CALL_SET_IDS")).isEqualTo("[\"C\",\"B\"]");
        assertThat(ver("A", "RULE_IDS")).isEqualTo("[\"R_A\"]");
        assertThat(DmeTestSupport.setVerValue(jdbc, "A", "1.000", "CALL_SET_IDS")).isEqualTo("[]");    // RELEASED 는 그대로
    }

    /** 분석기의 CALL_MISSING(WARN)은 DRAFT 저장을 막지 않는다(spec §5 표). 지금 RELEASED 가 없는 세트도 같다. 네 코드가 있으면 연쇄 재검사는 하지 않는다. */
    @Test
    void 없는_세트를_부르는_저장은_CALL_MISSING_경고로_통과한다() {
        setWithDraft("A", "INUSE", "[\"R_A\"]");
        RuleSetSaveResult r = saveFlow("A", 0, line(setNode("s1", "NOPE"), ruleNode("r1", "R_A")));
        List<String> calls = callLines(r.getChecks());
        assertThat(calls).hasSize(1);
        assertThat(calls.get(0)).startsWith("WARN CALL_MISSING ");
        assertThat(ver("A", "CALL_SET_IDS")).isEqualTo("[\"NOPE\"]");
        assertThat(ver("A", "ROW_VERSION")).isEqualTo("1");
    }

    @Test
    void 부르는_세트에_새_경고만_생기면_저장하고_CALLER_WARN_으로_알린다() {
        // C 2.000 은 OUT_X 를 IF 한 갈래에서만 만든다(always=false) — P 의 R_P 는 FLOW_PARTIAL 경고가 된다.
        String ifFlow = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},"
                + ruleNode("r1", "R_C1") + "," + ruleNode("r2", "R_C2") + ",{\"id\":\"m1\",\"kind\":\"MERGE\",\"splitId\":\"if1\"},"
                + "{\"id\":\"end\",\"kind\":\"END\"}],\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},"
                + "{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"r1\",\"order\":1,\"cond\":\"IN_A > 1\"},{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"r2\",\"otherwise\":true},"
                + "{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"m1\"},{\"id\":\"e3\",\"from\":\"r2\",\"to\":\"m1\"},{\"id\":\"e4\",\"from\":\"m1\",\"to\":\"end\"}]}";
        setWithDraft("C", "INUSE", "[\"R_C1\"]");
        parentP("INUSE");

        RuleSetSaveResult r = saveFlow("C", 0, ifFlow);
        assertThat(callLines(r.getChecks())).containsExactly("WARN CALLER_WARN 부르는 세트에 경고가 생겼다: P");
        RuleSetCheck warn = r.getChecks().stream().filter(c -> RuleSetCheck.CALLER_WARN.equals(c.code())).findFirst().orElseThrow();
        assertThat(warn.ruleId()).isEqualTo("C");
    }

    @Test
    void 겉모양이_그대로거나_부르는_세트가_폐기됐으면_연쇄_경고가_없다() {
        setWithDraft("C", "INUSE", "[\"R_C1\"]");
        parentP("DEPRECATED");
        assertThat(callLines(saveList("C", 0, "R_C2").getChecks())).isEmpty();          // 부르는 세트가 폐기됐다

        jdbc.update("UPDATE TB_MDM_RULE_SET SET STATUS = 'INUSE' WHERE MARU_RULE_SET_ID = 'P'");
        assertThat(callLines(saveList("C", 1, "R_C1").getChecks())).isEmpty();          // 지금 겉모양과 같다
    }

    /**
     * 저장하려는 겉모양의 룰은 지금 적용 중인 RELEASED 로 읽는다 — 멤버 룰의 미래 RELEASED(결과가 OUT_X → OUT_Y)는 지금 겉모양을 바꾸지 않으므로 같은
     * 목록을 다시 저장해도 헛 CALLER_BROKEN 이 나지 않는다(최신 RELEASED 로 읽으면 난다).
     */
    @Test
    void 멤버_룰의_미래_RELEASED_는_저장_겉모양을_바꾸지_않는다() {
        BigDecimal v2 = new BigDecimal("2.000");
        jdbc.update("UPDATE TB_MDM_RULE_VER SET APPLY_TO = '2026-09-01 00:00:00' WHERE MARU_RULE_ID = 'R_C1'");
        DmeTestSupport.released(jdbc, "R_C1", v2, "MAJOR", "FIRST", "2026-09-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_C1", v2, 1, "COND", "1", "IN_A", 1, null);
        DmeTestSupport.var(jdbc, "R_C1", v2, 2, "RESULT", "Value", "OUT_Y", 1, "STRING");
        setWithDraft("C", "INUSE", "[\"R_C1\"]");
        parentP("INUSE");

        assertThat(callLines(saveList("C", 0, "R_C1").getChecks())).isEmpty();
    }

    // ── 폐기·되살리기 ──

    /** 폐기 거부(spec §6.3, Ruling 10 문구) — 부르는 세트 목록은 세트 ID 순·한 번씩. P 는 지금 행과 미래 행 둘이 C 를 부른다. DRAFT 만 부르면 세지 않는다. */
    @Test
    void 부르는_세트가_있으면_폐기를_거부한다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        parentP("INUSE");
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = '2026-09-01 00:00:00' WHERE MARU_RULE_SET_ID = 'P'");
        DmeTestSupport.ruleSetVersion(jdbc, "P", "1.001", "MINOR", "RELEASED", null, "[\"R_P\"]", "2026-09-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "P", "1.001", line(setNode("s1", "C"), ruleNode("r1", "R_P")));
        DmeTestSupport.ruleSetCalls(jdbc, "P", "1.001", "[\"C\"]");
        releasedFlow("M", "INUSE", "[]", line(setNode("s1", "C")), "[\"C\"]");
        setWithDraft("Q", "INUSE", "[\"R_A\"]");
        DmeTestSupport.ruleSetCalls(jdbc, "Q", "2.000", "[\"C\"]");

        BusinessException e = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class, () -> service.delete(deprecateReq("C")));
        assertThat(RuleSetEditServiceTest.code(e)).isEqualTo("MDM024");
        assertThat(e.getMessage()).contains("C[-] CALLER_BROKEN 사용 중인 세트 M, P가 이 세트를 불러 폐기할 수 없다. 부르는 세트를 먼저 고치거나 폐기한다");
        assertThat(parentStatus("C")).isEqualTo("INUSE");
    }

    @Test
    void 부르는_세트가_폐기됐으면_폐기한다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        parentP("DEPRECATED");
        RuleSetStatusResult r = (RuleSetStatusResult) service.delete(deprecateReq("C"));
        assertThat(r.getStatus()).isEqualTo("DEPRECATED");
        assertThat(parentStatus("C")).isEqualTo("DEPRECATED");
    }

    /** 되살리기는 분석기의 CALL_MISSING(WARN)도 거부로 본다(spec §6.3). */
    @Test
    void 되살리기는_없는_세트를_부르면_CALL_MISSING_으로_거부한다() {
        releasedFlow("X", "DEPRECATED", "[\"R_A\"]", line(setNode("s1", "GONE"), ruleNode("r1", "R_A")), "[\"GONE\"]");
        BusinessException e = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class, () -> service.restore(restoreReq("X")));
        assertThat(RuleSetEditServiceTest.code(e)).isEqualTo("MDM024");
        assertThat(e.getMessage()).contains("CALL_MISSING");
        assertThat(parentStatus("X")).isEqualTo("DEPRECATED");
    }

    @Test
    void 되살리기는_호출_그래프도_본다() {
        releasedFlow("G", "DEPRECATED", "[]", line(setNode("s1", "G")), "[\"G\"]");
        BusinessException e = org.junit.jupiter.api.Assertions.assertThrows(BusinessException.class, () -> service.restore(restoreReq("G")));
        assertThat(e.getMessage()).contains("CALL_CYCLE 세트 호출이 순환한다: G › G");
        assertThat(parentStatus("G")).isEqualTo("DEPRECATED");
    }

    @Test
    void 되살리기는_부르는_세트가_있으면_검사를_통과해_되살린다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        releasedFlow("Y", "DEPRECATED", "[\"R_P\"]", line(setNode("s1", "C"), ruleNode("r1", "R_P")), "[\"C\"]");
        RuleSetStatusResult r = service.restore(restoreReq("Y"));
        assertThat(r.getStatus()).isEqualTo("INUSE");
        assertThat(callLines(r.getChecks())).isEmpty();
        assertThat(parentStatus("Y")).isEqualTo("INUSE");
    }

    // ── 조회 ──

    @Test
    void 조회는_SET_노드가_부르는_세트의_겉모양을_싣고_검사에_넣는다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        parentP("INUSE");
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId("P");
        RuleSetViewResult v = service.view(r);
        assertThat(v.getCalls()).containsOnlyKeys("C");
        SetCallIo c = v.getCalls().get("C");
        assertThat(c.exists()).isTrue();
        assertThat(c.setName()).isEqualTo("C 세트");
        assertThat(c.outputs()).extracting(SetCallIo.OutputName::name).containsExactly("OUT_X");
        assertThat(c.outputs().get(0).always()).isTrue();
        assertThat(lines(v.getChecks())).isEmpty();                                       // R_P 는 C 가 만드는 OUT_X 를 읽는다 — CALL_MISSING·UNKNOWN_INPUT 없음
    }

    @Test
    void 흐름이_없는_세트의_조회는_calls_가_비었다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        RuleSetViewRequest r = new RuleSetViewRequest();
        r.setSetId("C");
        assertThat(service.view(r).getCalls()).isEmpty();
    }

    @Test
    void search_CALL_IO_는_요청_순서의_겉모양이고_RELEASED_가_없으면_exists_false() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "NEW", "새 세트", "[\"R_A\"]", "CREATED", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET STATUS = 'DRAFT', APPLY_FROM = NULL, APPLY_TO = NULL, RELEASED_AT = NULL, OWNER_ID = 'kim' "
                + "WHERE MARU_RULE_SET_ID = 'NEW'");
        RuleSetEditSearchRequest io = new RuleSetEditSearchRequest();
        io.setTarget("CALL_IO");
        io.setSetIdsJson("[\"NOPE\",\"C\",\"NEW\",\"C\"]");
        RuleSetCallIoResult calls = (RuleSetCallIoResult) service.search(io);
        assertThat(calls.getCalls()).extracting(c -> c.setId() + ":" + c.exists()).containsExactly("NOPE:false", "C:true", "NEW:false");

        io.setSetIdsJson(null);
        assertThat(((RuleSetCallIoResult) service.search(io)).getCalls()).isEmpty();
        io.setSetIdsJson("{\"a\":1}");
        assertThatThrownBy(() -> service.search(io)).hasMessageContaining("배열이어야");
    }

    @Test
    void search_CALLERS_는_부르는_세트를_세트_ID_순으로_한_번씩_계산_상태로_준다() {
        DmeTestSupport.ruleSet(jdbc, "C", "C 세트", "[\"R_C1\"]", "INUSE", 0);
        parentP("CREATED");                                                               // 적용 중 RELEASED 가 있으면 계산 상태는 INUSE
        DmeTestSupport.ruleSetVersion(jdbc, "P", "1.001", "MINOR", "RELEASED", null, "[\"R_P\"]", "2026-09-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetCalls(jdbc, "P", "1.001", "[\"C\"]");
        releasedFlow("M", "INUSE", "[]", line(setNode("s1", "C")), "[\"C\"]");
        releasedFlow("D", "DEPRECATED", "[]", line(setNode("s1", "C")), "[\"C\"]");
        setWithDraft("Q", "INUSE", "[\"R_A\"]");
        DmeTestSupport.ruleSetCalls(jdbc, "Q", "2.000", "[\"C\"]");

        RuleSetEditSearchRequest who = new RuleSetEditSearchRequest();
        who.setTarget("CALLERS");
        who.setSetId("C");
        RuleSetPickResult callers = (RuleSetPickResult) service.search(who);
        assertThat(callers.getSets()).extracting(p -> p.getSetId() + ":" + p.getSetName() + ":" + p.getStatus())
                .containsExactly("M:M 세트:INUSE", "P:P 세트:INUSE");

        who.setSetId("M");
        assertThat(((RuleSetPickResult) service.search(who)).getSets()).isEmpty();
        who.setTarget("NOPE");
        assertThatThrownBy(() -> service.search(who)).hasMessageContaining("SET·RULE·GUIDE·CALL_IO·CALLERS");
    }
}
