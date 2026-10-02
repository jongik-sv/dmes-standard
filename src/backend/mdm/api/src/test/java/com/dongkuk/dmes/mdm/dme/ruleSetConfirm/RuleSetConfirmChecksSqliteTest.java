package com.dongkuk.dmes.mdm.dme.ruleSetConfirm;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.audit.CactusAudit;
import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleConfirmReport.ItemStatus;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmChecks;
import com.dongkuk.dmes.mdm.common.rule.confirm.RuleSetConfirmReport;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.common.version.VersionSpiRegistry;
import com.dongkuk.dmes.mdm.contract.rule.MdmRuleSetConfirmCheckItem;
import com.dongkuk.dmes.mdm.contract.version.ConfirmCheckRequest;
import com.dongkuk.dmes.mdm.contract.version.DiffKind;
import com.dongkuk.dmes.mdm.contract.version.VersionDiff;
import com.dongkuk.dmes.mdm.contract.version.VersionDiffEntry;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dme.ruleMng.dto.RuleVersionRequest;
import com.dongkuk.dmes.mdm.dme.ruleMng.service.RuleVersionService;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSaveRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import com.dongkuk.oasis.audit.AuditHolder;
import java.math.BigDecimal;
import java.time.LocalDateTime;
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

/** D-144 2단계 — 세트 확정 검사 4항목. 시계 NOW = 2026-06-15 09:00. 입력 이름 CF_IN 은 컬럼 사전에 있다(UNKNOWN_INPUT 이 나지 않게). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetConfirmChecksSqliteTest extends AbstractMdmSharedDbTest {

    static final LocalDateTime JUL1 = LocalDateTime.of(2026, 7, 1, 0, 0, 0);
    static final LocalDateTime AUG1 = LocalDateTime.of(2026, 8, 1, 0, 0, 0);

    @Autowired
    RuleSetConfirmChecks checks;
    @Autowired
    VersionSpiRegistry spis;
    @Autowired
    RuleVersionService ruleVersions;
    @Autowired
    RuleSetEditService setEdit;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        currentUser.set("kim", STEWARD);
        AuditHolder.setAudit(new CactusAudit("kim", "ruleSetConfirmMenu", "ruleSetConfirm"));
        DmeTestSupport.column(jdbc, "CF_IN", DmeTestSupport.domain(jdbc, "CF_IN_D", "QTY", "NUMBER", 0));
        rule("R_A", "1.000", "2026-01-01 00:00:00", null, "CF_IN", "OUT_A");
    }

    @AfterEach
    void reset() {
        AuditHolder.remove();
    }

    /** RELEASED 룰 버전 — 조건 하나(reads)·결과 하나(produces), 행 없음. */
    private void rule(String id, String ver, String from, String to, String reads, String produces) {
        if (jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_RULE WHERE MARU_RULE_ID = ?", Integer.class, id) == 0) {
            DmeTestSupport.rule(jdbc, id, id, "DECISION", "INUSE");
        }
        BigDecimal v = new BigDecimal(ver);
        DmeTestSupport.released(jdbc, id, v, "MAJOR", "FIRST", from, to);
        DmeTestSupport.var(jdbc, id, v, 1, "COND", "1", reads, 1, null);
        DmeTestSupport.var(jdbc, id, v, 2, "RESULT", "Value", produces, 1, "STRING");
    }

    /** 부모 CREATED + 1.000 MAJOR DRAFT(소유자 kim, 적용 구간 없음). */
    private void draftSet(String setId, String ruleIdsJson) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS) VALUES (?, ?, 'CREATED')", setId, setId);
        DmeTestSupport.ruleSetVersion(jdbc, setId, "1.000", "MAJOR", "DRAFT", "kim", ruleIdsJson, null, null, 0);
    }

    private RuleSetConfirmReport.Report report(String setId, LocalDateTime applyFrom) {
        return checks.report(new VersionRef(VersionTarget.RULE_SET, setId, new BigDecimal("1.000")), applyFrom);
    }

    private static RuleSetConfirmReport.Item item(RuleSetConfirmReport.Report r, MdmRuleSetConfirmCheckItem which) {
        return r.items().stream().filter(i -> i.item() == which).findFirst().orElseThrow();
    }

    @Test
    void allFourPassWhenRulesAreReleasedAtApplyFrom() {
        draftSet("S_OK", "[\"R_A\"]");
        RuleSetConfirmReport.Report r = report("S_OK", JUL1);
        assertThat(r.items()).extracting(RuleSetConfirmReport.Item::item).containsExactly(MdmRuleSetConfirmCheckItem.values());
        assertThat(r.items()).extracting(RuleSetConfirmReport.Item::status).containsOnly(ItemStatus.PASSED);
    }

    @Test
    void ruleReleasedOnlyAfterApplyFromIsRejected() {
        rule("R_B", "1.000", "2026-08-01 00:00:00", null, "CF_IN", "OUT_B");
        draftSet("S_LATE", "[\"R_A\",\"R_B\"]");
        RuleSetConfirmReport.Item early = item(report("S_LATE", JUL1), MdmRuleSetConfirmCheckItem.RULES_RELEASED);
        assertThat(early.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(early.issues()).extracting(i -> i.issue().itemKey()).containsExactly("RULE:R_B");
        assertThat(early.issues().get(0).issue().code()).isEqualTo(RuleSetConfirmReport.SET_RULE_NOT_RELEASED);
        assertThat(item(report("S_LATE", AUG1), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.PASSED);
    }

    @Test
    void orderUsesRuleVersionsAtApplyFrom() {
        rule("R_X", "1.000", "2026-01-01 00:00:00", "2026-08-01 00:00:00", "CF_IN", "OUT_X");
        rule("R_X", "2.000", "2026-08-01 00:00:00", null, "OUT_Y", "OUT_X");     // 2.000 은 뒤 룰 R_Y 의 결과를 읽는다
        rule("R_Y", "1.000", "2026-01-01 00:00:00", null, "CF_IN", "OUT_Y");
        draftSet("S_ORD", "[\"R_X\",\"R_Y\"]");
        // JUL1 시점엔 R_X 1.000 이라 순서가 맞다 — 08-01 에 예약된 R_X 2.000 이 순서를 깨는 것은 WARNING 하나(Ruling P2-14)
        RuleSetConfirmReport.Item early = item(report("S_ORD", JUL1), MdmRuleSetConfirmCheckItem.ORDER);
        assertThat(early.status()).isEqualTo(ItemStatus.WARNED);
        assertThat(early.issues()).hasSize(1);
        assertThat(early.issues().get(0).severity()).isEqualTo("WARNING");
        assertThat(early.issues().get(0).issue().code()).isEqualTo("ORDER");
        assertThat(early.issues().get(0).issue().message()).startsWith("2026-08-01 00:00:00 부터 R_X v2.000 적용 시: ");
        // AUG1 로 확정하면 그 시점 검사라 ERROR
        RuleSetConfirmReport.Item late = item(report("S_ORD", AUG1), MdmRuleSetConfirmCheckItem.ORDER);
        assertThat(late.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(late.issues()).extracting(i -> i.issue().code()).contains("ORDER");
    }

    @Test
    void failingTestCaseIsAnError() {
        draftSet("S_CASE", "[\"R_A\"]");
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON) "
                + "VALUES ('S_CASE', 1, 'c1', '{\"CF_IN\":1}', '{\"OUT_A\":\"Z\"}')");
        RuleSetConfirmReport.Report r = report("S_CASE", JUL1);
        RuleSetConfirmReport.Item cases = item(r, MdmRuleSetConfirmCheckItem.TEST_CASES);
        assertThat(cases.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(cases.issues()).extracting(i -> i.issue().code()).containsExactly("CASE_FAILED");
        assertThat(cases.issues().get(0).issue().message()).startsWith("케이스 1 c1: ").doesNotEndWith("판정 오류");
        assertThat(r.cases().withExpected()).isEqualTo(1);
        assertThat(r.cases().failed()).isEqualTo(1);
    }

    @Test
    void runErrorOfCaseWithoutExpectedIsOnlyAWarning() {   // Ruling P2-22(I-1) — 스펙 §6 항목 4 는 기대값 있는 케이스의 실패만 막는다
        draftSet("S_RUN", "[\"R_A\"]");
        jdbc.update("INSERT INTO TB_MDM_RULE_SET_TEST_CASE (MARU_RULE_SET_ID, CASE_ID, CASE_NAME, INPUT_JSON, EXPECTED_JSON) "
                + "VALUES ('S_RUN', 1, 'c1', '[1]', NULL)");   // 입력이 객체가 아니라 실행 오류로 끝난다
        RuleSetConfirmReport.Report r = report("S_RUN", JUL1);
        RuleSetConfirmReport.Item cases = item(r, MdmRuleSetConfirmCheckItem.TEST_CASES);
        assertThat(cases.status()).isEqualTo(ItemStatus.WARNED);
        assertThat(cases.issues()).extracting(i -> i.severity()).containsExactly("WARNING");
        assertThat(cases.issues()).extracting(i -> i.issue().code()).containsExactly(RuleSetConfirmReport.CASE_RUN_ERROR);
        assertThat(cases.issues().get(0).issue().itemKey()).isEqualTo("CASE:1");
        assertThat(cases.issues().get(0).issue().message()).contains("입력 JSON 이 객체가 아닙니다");
        assertThat(RuleSetConfirmReport.flatten(r).errors()).isEmpty();
        assertThat(r.cases().total()).isEqualTo(1);
        assertThat(r.cases().withExpected()).isZero();
        assertThat(r.cases().failed()).isZero();
    }

    @Test
    void ruleCancelConfirmBlocksSetConfirm() {   // Review Focus 5, ADR-0002 D8-10
        rule("R_C", "1.000", "2026-07-01 00:00:00", null, "CF_IN", "OUT_C");   // 아직 적용 전인 유일 RELEASED
        jdbc.update("UPDATE TB_MDM_RULE_VER SET OWNER_ID = 'kim' WHERE MARU_RULE_ID = 'R_C'");
        draftSet("S_D8", "[\"R_C\"]");
        LocalDateTime jul2 = JUL1.plusDays(1);
        assertThat(item(report("S_D8", jul2), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.PASSED);

        RuleVersionRequest cancel = new RuleVersionRequest();
        cancel.setMaruRuleId("R_C");
        cancel.setVer("1.000");
        cancel.setRowVersion(0L);
        ruleVersions.cancelConfirm(cancel);

        assertThat(item(report("S_D8", jul2), MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.REJECTED);
        // 세트 저장은 막지 않는다 — RELEASED 없음은 저장 때 경고다
        RuleSetSaveRequest save = new RuleSetSaveRequest();
        save.setSetId("S_D8");
        save.setVer("1.000");
        save.setRowVersion(0L);
        save.setSetName("S_D8");
        save.setRules(List.of(Map.of("ruleId", "R_C")));
        assertThat(setEdit.save(save).getChecks()).extracting(c -> c.code()).contains("NO_RELEASED");
    }

    @Test
    void storedFlowJsonPathRejectsOrder() {
        rule("R_P", "1.000", "2026-01-01 00:00:00", null, "OUT_Q", "OUT_P");   // 뒤 룰 R_Q 의 결과를 읽는다
        rule("R_Q", "1.000", "2026-01-01 00:00:00", null, "CF_IN", "OUT_Q");
        draftSet("S_FLOW", "[\"R_P\",\"R_Q\"]");
        DmeTestSupport.ruleSetFlow(jdbc, "S_FLOW", linearFlowJson("R_P", "R_Q"));
        RuleSetConfirmReport.Report r = report("S_FLOW", JUL1);
        RuleSetConfirmReport.Item order = item(r, MdmRuleSetConfirmCheckItem.ORDER);
        assertThat(order.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(order.issues()).extracting(i -> i.issue().code()).contains("ORDER");
        assertThat(order.issues()).extracting(i -> i.issue().itemKey()).allMatch(k -> k != null && k.startsWith("NODE:"));
        assertThat(item(r, MdmRuleSetConfirmCheckItem.RULES_RELEASED).status()).isEqualTo(ItemStatus.PASSED);
    }

    @Test
    void corruptStoredFlowIsFlowStructureError() {
        draftSet("S_BAD", "[\"R_A\"]");
        DmeTestSupport.ruleSetFlow(jdbc, "S_BAD", "{\"version\":1,\"nodes\":\"bad\",\"edges\":[]}");
        RuleSetConfirmReport.Report r = report("S_BAD", JUL1);
        RuleSetConfirmReport.Item flow = item(r, MdmRuleSetConfirmCheckItem.FLOW_STRUCTURE);
        assertThat(flow.status()).isEqualTo(ItemStatus.REJECTED);
        assertThat(flow.issues()).extracting(i -> i.issue().code()).containsExactly(RuleSetConfirmReport.STORED_FLOW_CORRUPT);
        // diff 도 500 이 아니라 업무 예외
        VersionRef ref = new VersionRef(VersionTarget.RULE_SET, "S_BAD", new BigDecimal("1.000"));
        assertThatThrownBy(() -> checks.diff(ref)).isInstanceOf(BusinessException.class).hasMessageContaining("저장된 흐름");
    }

    @Test
    void diffOfFirstVersionIsAllAddedAndMissingVersionIsBusinessError() {
        draftSet("S_DIFF", "[\"R_A\"]");
        VersionDiff diff = checks.diff(new VersionRef(VersionTarget.RULE_SET, "S_DIFF", new BigDecimal("1.000")));
        assertThat(diff.base()).isNull();
        assertThat(diff.entries()).extracting(VersionDiffEntry::kind).containsOnly(DiffKind.ADDED);
        assertThatThrownBy(() -> checks.diff(new VersionRef(VersionTarget.RULE_SET, "S_DIFF", new BigDecimal("2.000"))))
                .isInstanceOf(BusinessException.class);
    }

    @Test
    void nullApplyFromIsRejectedWithMessage() {
        draftSet("S_NULL", "[\"R_A\"]");
        assertThatThrownBy(() -> report("S_NULL", null)).isInstanceOf(NullPointerException.class).hasMessageContaining("applyFrom");
    }

    /** RULE 노드만 있는 한 줄 흐름 JSON(편집기 linearFlow 와 같은 start·r<n>·e<n> ID). */
    private static String linearFlowJson(String... ruleIds) {
        StringBuilder nodes = new StringBuilder("{\"id\":\"start\",\"kind\":\"START\"}");
        StringBuilder edges = new StringBuilder();
        String prev = "start";
        for (int i = 0; i < ruleIds.length; i++) {
            String id = "r" + (i + 1);
            nodes.append(",{\"id\":\"").append(id).append("\",\"kind\":\"RULE\",\"ruleId\":\"").append(ruleIds[i]).append("\"}");
            edges.append(i == 0 ? "" : ",").append("{\"id\":\"e").append(i + 1).append("\",\"from\":\"").append(prev)
                    .append("\",\"to\":\"").append(id).append("\",\"otherwise\":false}");
            prev = id;
        }
        nodes.append(",{\"id\":\"end\",\"kind\":\"END\"}");
        edges.append(",{\"id\":\"e").append(ruleIds.length + 1).append("\",\"from\":\"").append(prev).append("\",\"to\":\"end\",\"otherwise\":false}");
        return "{\"version\":1,\"nodes\":[" + nodes + "],\"edges\":[" + edges + "]}";
    }

    @Test
    void spiIsRegisteredForRuleSetAndFlattensErrors() {
        rule("R_B", "1.000", "2026-08-01 00:00:00", null, "CF_IN", "OUT_B");
        draftSet("S_SPI", "[\"R_B\"]");
        VersionRef ref = new VersionRef(VersionTarget.RULE_SET, "S_SPI", new BigDecimal("1.000"));
        var result = spis.confirmCheck(VersionTarget.RULE_SET).check(new ConfirmCheckRequest(ref, JUL1, null, "kim", DmeTestSupport.NOW));
        assertThat(result.errors()).extracting(i -> i.code()).containsExactly(RuleSetConfirmReport.SET_RULE_NOT_RELEASED);
        assertThat(result.errors().get(0).field()).isEqualTo("RULES_RELEASED");
    }
}
