package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.util.Arrays;
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
 * 하위 세트 spec §4.1·§4.3·§8(srv:6 묶음 E1) — SET 노드가 든 저장 세트를 실제 엔진(eng:4)으로 실행해 OASIS 입구 {@code execute} 응답의
 * {@code calls}·{@code path[].callIndex}·{@code caught[].setPath}·위반 문구의 세트 경로 접두·하위 세트 경고 모으기·하위 세트 폐기 룰 경고와,
 * 디버거 {@code simulate} 의 {@code calledFlows} 를 끝에서 끝으로 본다. 매핑만 보는 단위 시험은 lib 의 {@code RuleSetRunnerMappingTest}.
 *
 * <p>RS_PARENT: start → s1(SET RS_LINE, label "품질 판정") → end. RS_LINE: QLTY_GRD_JDG 한 줄(FLOW_JSON 없음). 판정 시각 2026-03-01 09:00(KST).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetRunnerSubsetTest extends AbstractMdmSharedDbTest {

    private static final String OK_RECORD = "{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}";
    private static final String BAD_THK = "{\"COIL_THK\":\"두껍다\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}";

    @Autowired
    RuleSetRunner runner;
    @Autowired
    RuleSetEditService service;
    @Autowired
    JdbcTemplate jdbc;

    private static String labeled(String id, String setId, String label) {
        return "{\"id\":\"" + id + "\",\"kind\":\"SET\",\"setId\":\"" + setId + "\",\"label\":\"" + label + "\"}";
    }

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.ruleSet(jdbc, "RS_LINE", "한 줄", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        parent("RS_PARENT", line(labeled("s1", "RS_LINE", "품질 판정")), "RS_LINE");
    }

    private void parent(String id, String flow, String... calls) {
        DmeTestSupport.ruleSet(jdbc, id, "부모 " + id, "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, id, flow);
        DmeTestSupport.ruleSetCalls(jdbc, id, "[" + String.join(",", Arrays.stream(calls).map(c -> "\"" + c + "\"").toList()) + "]");
    }

    private static RuleSetRunRequest req(String setId, String recordJson) {
        RuleSetRunRequest r = new RuleSetRunRequest();
        r.setSetId(setId);
        r.setRecordJson(recordJson);
        r.setEvalTs("2026-03-01 09:00:00");
        return r;
    }

    @Test
    void 경로에_callIndex_응답에_calls_요약을_싣고_하위_세트_결과가_최종값에_든다() {
        RuleSetRunResult r = runner.execute(req("RS_PARENT", OK_RECORD));

        assertThat(r.getFinalValues()).containsEntry("QLTY_GRD", "A");
        assertThat(r.getCalls()).hasSize(1);
        assertThat(r.getCalls().get(0)).containsEntry("nodeId", "s1").containsEntry("setId", "RS_LINE").containsEntry("endedBy", null);
        assertThat(r.getPath()).extracting(p -> p.get("nodeId")).containsExactly("start", "s1", "end");
        assertThat(r.getPath()).extracting(p -> p.get("callIndex")).containsExactly(null, 0, null);
        assertThat(r.getEndedBy()).isNull();
        assertThat(r.getCaught()).isEmpty();
        assertThat(r.getWarnings()).isEmpty();
    }

    @Test
    void 하위_세트_위반_문구_앞에_세트_경로를_붙인다() {
        // 키는 모두 있어 부모 사전 검사를 지나고, 하위 세트의 룰이 숫자 칸 COIL_THK 를 바꾸다 TYPE_CONVERSION 으로 멈춘다(setPath = [s1]).
        assertThatThrownBy(() -> runner.execute(req("RS_PARENT", BAD_THK)))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("세트 RS_PARENT › 품질 판정(s1) › [QLTY_GRD_JDG] ");
    }

    @Test
    void 손주_세트_위반은_세트_경로를_단계마다_잇고_label_이_없으면_세트_ID_를_쓴다() {
        parent("RS_MID", line(setNode("s2", "RS_LINE")), "RS_LINE");
        parent("RS_TOP", line(labeled("s1", "RS_MID", "가운데 호출")), "RS_MID");

        assertThatThrownBy(() -> runner.execute(req("RS_TOP", BAD_THK)))
                .isInstanceOf(BusinessException.class)
                .hasMessageStartingWith("세트 RS_TOP › 가운데 호출(s1) › RS_LINE(s2) › [QLTY_GRD_JDG] ");

        RuleSetRunResult ok = runner.execute(req("RS_TOP", OK_RECORD));
        assertThat(ok.getCalls()).extracting(c -> c.get("setId")).as("calls 는 이 세트의 SET 노드만 — 손주는 없다").containsExactly("RS_MID");
        assertThat(ok.getFinalValues()).containsEntry("QLTY_GRD", "A");
    }

    /** start → {step} → end, c1({step 노드}, INPUT_ERROR) → end. */
    private static String guarded(String stepJson, String stepId) {
        return "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"}," + stepJson + ","
                + "{\"id\":\"c1\",\"kind\":\"CATCH\",\"attachTo\":\"" + stepId + "\",\"catches\":[\"INPUT_ERROR\"]},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"" + stepId + "\"},{\"id\":\"e2\",\"from\":\"" + stepId + "\",\"to\":\"end\"},"
                + "{\"id\":\"e3\",\"from\":\"c1\",\"to\":\"end\"}]}";
    }

    @Test
    void 부모가_SET_노드에서_하위_세트_위반을_받으면_caught_의_setPath_는_비고_룰_노드는_SET_노드다() {
        parent("RS_GUARD", guarded(setNode("s1", "RS_LINE"), "s1"), "RS_LINE");

        RuleSetRunResult r = runner.execute(req("RS_GUARD", BAD_THK));

        assertThat(r.getEndedBy()).isEqualTo("c1");
        assertThat(r.getCaught()).hasSize(1);
        assertThat(r.getCaught().get(0)).containsEntry("ruleNodeId", "s1").containsEntry("catchNodeId", "c1").containsEntry("kind", "INPUT_ERROR")
                .containsEntry("code", "TYPE_CONVERSION").containsEntry("ruleId", "QLTY_GRD_JDG")
                .as("이 세트에서 받았다(spec §4.3)").containsEntry("setPath", List.of());
    }

    @Test
    void 하위_세트가_자기_받는_노드로_받은_위반은_부모_caught_에_setPath_를_달고_올라온다() {
        // RS_CATCHER: r1(QLTY_GRD_JDG) + c1(INPUT_ERROR) → END. 부모 RS_UP: s1(RS_CATCHER).
        DmeTestSupport.ruleSet(jdbc, "RS_CATCHER", "받는 하위", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_CATCHER", guarded(DmeTestSupport.ruleNode("r1", "QLTY_GRD_JDG"), "r1"));
        parent("RS_UP", line(setNode("s1", "RS_CATCHER")), "RS_CATCHER");

        RuleSetRunResult r = runner.execute(req("RS_UP", BAD_THK));

        assertThat(r.getEndedBy()).as("하위 세트의 끝냄은 부모 endedBy 와 섞지 않는다").isNull();
        assertThat(r.getCalls()).hasSize(1);
        assertThat(r.getCalls().get(0)).containsEntry("setId", "RS_CATCHER").containsEntry("endedBy", "c1");
        assertThat(r.getCaught()).hasSize(1);
        assertThat(r.getCaught().get(0)).containsEntry("ruleNodeId", "r1").containsEntry("catchNodeId", "c1").containsEntry("code", "TYPE_CONVERSION")
                .containsEntry("setPath", List.of("s1"));
    }

    @Test
    void 하위_세트의_엔진_경고를_응답_경고에_모은다() {
        // RS_WARN: IF(OPT → t1, 그 밖 → t2). OPT 가 null 이면 조건 결과 NULL → BRANCH_COND_NULL 경고(하위 세트 결과에 있다).
        String child = "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},{\"id\":\"if1\",\"kind\":\"IF\"},{\"id\":\"t1\",\"kind\":\"TASK\"},"
                + "{\"id\":\"t2\",\"kind\":\"TASK\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"if1\"},{\"id\":\"b1\",\"from\":\"if1\",\"to\":\"t1\",\"order\":1,\"cond\":\"OPT\"},"
                + "{\"id\":\"bo\",\"from\":\"if1\",\"to\":\"t2\",\"otherwise\":true},{\"id\":\"e2\",\"from\":\"t1\",\"to\":\"end\"},{\"id\":\"e3\",\"from\":\"t2\",\"to\":\"end\"}]}";
        DmeTestSupport.ruleSet(jdbc, "RS_WARN", "경고", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_WARN", child);
        parent("RS_PW", line(setNode("s1", "RS_WARN")), "RS_WARN");

        RuleSetRunResult r = runner.execute(req("RS_PW", "{\"OPT\":null}"));

        assertThat(r.getWarnings()).extracting(w -> w.get("code")).containsExactly("BRANCH_COND_NULL");
    }

    @Test
    void 하위_세트의_판정_시각_버전_룰이_폐기면_RULE_DEPRECATED_경고를_한_번_낸다() {
        jdbc.update("UPDATE TB_MDM_RULE SET STATUS = 'DEPRECATED' WHERE MARU_RULE_ID = 'QLTY_GRD_JDG'");
        // 같은 하위 세트를 두 번 부르고 손주로도 부른다 — 경고는 룰마다 한 번.
        parent("RS_MID", line(setNode("s2", "RS_LINE")), "RS_LINE");
        parent("RS_TWICE", line(setNode("s1", "RS_LINE"), setNode("s3", "RS_MID")), "RS_LINE", "RS_MID");

        RuleSetRunResult r = runner.execute(req("RS_TWICE", OK_RECORD));

        assertThat(r.getFinalValues()).containsEntry("QLTY_GRD", "A");
        assertThat(r.getWarnings()).extracting(w -> w.get("code") + " " + w.get("ruleId")).containsExactly("RULE_DEPRECATED QLTY_GRD_JDG");
    }

    @Test
    @SuppressWarnings("unchecked")
    void 디버거_실행은_실제_기록의_sub_를_따라_calledFlows_를_싣는다() {
        parent("RS_MID", line(setNode("s2", "RS_LINE")), "RS_LINE");
        RuleSetSimulateRequest req = new RuleSetSimulateRequest();
        req.setFlowJson(line(labeled("s1", "RS_MID", "가운데")));
        req.setRecordJson(OK_RECORD);
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetSimulateResult r = service.simulate(req);

        List<Map<String, Object>> nodes = (List<Map<String, Object>>) r.getTrace().get("nodes");
        Map<String, Object> s1 = nodes.stream().filter(n -> "s1".equals(n.get("nodeId"))).findFirst().orElseThrow();
        assertThat(s1).containsKey("sub");
        assertThat(r.getCalledFlows().keySet()).containsExactly("RS_MID", "RS_LINE");
        Map<String, Object> mid = (Map<String, Object>) r.getCalledFlows().get("RS_MID");
        assertThat((Map<String, Object>) mid.get("flow")).containsKeys("nodes", "edges");
        Map<String, Object> leaf = (Map<String, Object>) r.getCalledFlows().get("RS_LINE");
        assertThat(leaf.get("flow")).as("한 줄 세트").isNull();
        assertThat(leaf.get("ruleIds")).isEqualTo(List.of("QLTY_GRD_JDG"));
        assertThat((List<RuleIo>) leaf.get("rules")).extracting(RuleIo::ruleId).containsExactly("QLTY_GRD_JDG");
    }
}
