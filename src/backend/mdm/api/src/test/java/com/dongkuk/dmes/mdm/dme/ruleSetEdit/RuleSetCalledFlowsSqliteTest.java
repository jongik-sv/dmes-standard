package com.dongkuk.dmes.mdm.dme.ruleSetEdit;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.setNode;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.rule.RuleIo;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateRequest;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.dto.RuleSetSimulateResult;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetCalledFlows;
import com.dongkuk.dmes.mdm.dme.ruleSetEdit.service.RuleSetEditService;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeStatus;
import kr.dongkuk.maru.mdm.engine.rule.RunTrace.NodeTrace;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 디버거 실행 응답 {@code calledFlows}(하위 세트 spec §8, srv:6 묶음 D) — 기록을 손으로 만들어 SET 노드 {@code sub} 를 따라 모은 세트의 판정 시각
 * RELEASED 흐름을 본다. SET 노드를 엔진으로 실제 실행해 얻은 기록으로 보는 시험은 {@code RuleSetRunnerSubsetTest}(srv:6 E1).
 *
 * <p>판정 시각 2026-03-01 09:00(KST). 룰 QLTY_GRD_JDG 는 1.000(2026-01-01~)과 2.000(2026-09-01~) — rules 는 판정 시각의 1.000 으로 계산한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetCalledFlowsSqliteTest extends AbstractMdmSharedDbTest {

    private static final Instant TS = Instant.parse("2026-03-01T00:00:00Z");
    private static final String VIEW = ",\"view\":{\"positions\":{\"start\":{\"x\":0,\"y\":0}}}}";

    @Autowired
    RuleSetCalledFlows calledFlows;
    @Autowired
    RuleSetEditService service;
    @Autowired
    JdbcTemplate jdbc;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.sampleRule(jdbc);
        DmeTestSupport.released(jdbc, "QLTY_GRD_JDG", 2, "FIRST", "2026-09-01 00:00:00", null);
        DmeTestSupport.sampleDefinition(jdbc, "QLTY_GRD_JDG", 2);
        DmeTestSupport.ruleSet(jdbc, "RS_CHILD", "자식", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        String childFlow = line(setNode("s2", "RS_GRAND"), ruleNode("r1", "QLTY_GRD_JDG"));
        DmeTestSupport.ruleSetFlow(jdbc, "RS_CHILD", childFlow.substring(0, childFlow.length() - 1) + VIEW);
        DmeTestSupport.ruleSetCalls(jdbc, "RS_CHILD", "[\"RS_GRAND\"]");
        DmeTestSupport.ruleSet(jdbc, "RS_GRAND", "손주", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "RS_LATER", "나중", "[\"QLTY_GRD_JDG\"]", "INUSE", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_FROM = '2026-09-01 00:00:00' WHERE MARU_RULE_SET_ID = 'RS_LATER'");
    }

    private static NodeTrace set(int seq, String nodeId, RunTrace sub) {
        return new NodeTrace(seq, nodeId, NodeKind.SET, NodeStatus.OK, null, null, Map.of(), null, null, null, null, null, null, null, null,
                null, null, Map.of(), sub);
    }

    private static RunTrace trace(String setId, NodeTrace... nodes) {
        return new RunTrace(setId, TS, Map.of(), List.of(nodes), Map.of(), null, null, null);
    }

    @Test
    @SuppressWarnings("unchecked")
    void sub_를_깊이_우선으로_따라_판정_시각_RELEASED_흐름을_한_번씩_싣는다() {
        RunTrace child = trace("RS_CHILD", set(1, "s2", trace("RS_GRAND")));
        RunTrace top = trace("(저장 전)", set(1, "s1", child), set(2, "s3", trace("RS_LATER")), set(3, "s4", child));

        Map<String, Object> out = calledFlows.of(top);

        assertThat(out.keySet()).as("RS_LATER 는 판정 시각에 적용된 RELEASED 가 없어 뺀다").containsExactly("RS_CHILD", "RS_GRAND");
        Map<String, Object> c = (Map<String, Object>) out.get("RS_CHILD");
        assertThat(c.keySet()).containsExactly("setId", "setName", "flow", "ruleIds", "rules");
        assertThat(c.get("setName")).isEqualTo("자식");
        assertThat((Map<String, Object>) c.get("flow")).as("저장된 FLOW_JSON 그대로(view 포함)").containsKeys("version", "nodes", "edges", "view");
        assertThat(c.get("ruleIds")).isEqualTo(List.of("QLTY_GRD_JDG"));
        List<RuleIo> rules = (List<RuleIo>) c.get("rules");
        assertThat(rules).extracting(RuleIo::ruleId).containsExactly("QLTY_GRD_JDG");
        assertThat(rules.get(0).releasedVer()).as("판정 시각 기준(최신 2.000 이 아니다)").isEqualTo("1.000");

        Map<String, Object> g = (Map<String, Object>) out.get("RS_GRAND");
        assertThat(g.get("flow")).as("한 줄 세트는 flow=null, 화면이 ruleIds 로 그린다").isNull();
        assertThat(g.get("ruleIds")).isEqualTo(List.of("QLTY_GRD_JDG"));
    }

    @Test
    void 부른_세트가_없으면_빈_맵이다() {
        assertThat(calledFlows.of(trace("(저장 전)"))).isEmpty();
    }

    @Test
    void 디버거_실행_응답은_SET_이_없는_흐름에서_calledFlows_가_비어_있다() {
        RuleSetSimulateRequest req = new RuleSetSimulateRequest();
        req.setFlowJson(line(ruleNode("r1", "QLTY_GRD_JDG")));
        req.setRecordJson("{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetSimulateResult r = service.simulate(req);

        assertThat(r.getTrace()).isNotNull();
        assertThat(r.getCalledFlows()).isEmpty();
    }
}
