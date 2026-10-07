package com.dongkuk.dmes.mdm.common.rule;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.line;
import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.ruleNode;
import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunRequest;
import com.dongkuk.dmes.mdm.common.rule.dto.RuleSetRunResult;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 실행 응답의 세트 경로 문구·새 칸(하위 세트 spec §4.1·§8, srv:6 묶음 D) — 위반 문구의 경로는 판정 시각에 적용된 세트 버전 흐름의 SET 노드 label 로
 * 읽는다. SET 노드를 엔진으로 실제 실행해 하위 세트 위반을 내는 시험은 {@code RuleSetRunnerSubsetTest}(srv:6 E1).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class RuleSetRunnerSetPathSqliteTest extends AbstractMdmSharedDbTest {

    @Autowired
    RuleSetRunner runner;
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
        // RS_PARENT 1.000(~2026-06-01) 의 s1 label "품질 판정", 2.000(2026-06-01~) 의 s1 label "새 판정". s1 은 RS_MID, RS_MID 의 s2 는 label 없음.
        DmeTestSupport.ruleSet(jdbc, "RS_PARENT", "부모", "[]", "INUSE", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = TIMESTAMP '2026-06-01 00:00:00' WHERE MARU_RULE_SET_ID = 'RS_PARENT'");
        DmeTestSupport.ruleSetFlow(jdbc, "RS_PARENT", line(labeled("s1", "RS_MID", "품질 판정")));
        DmeTestSupport.ruleSetVersion(jdbc, "RS_PARENT", "2.000", "MAJOR", "RELEASED", null, "[]", "2026-06-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_PARENT", "2.000", line(labeled("s1", "RS_MID", "새 판정")));
        DmeTestSupport.ruleSet(jdbc, "RS_MID", "가운데", "[]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "RS_MID", line("{\"id\":\"s2\",\"kind\":\"SET\",\"setId\":\"RS_LINE\"}"));
    }

    @Test
    void 위반_세트_경로는_판정_시각의_세트_버전_흐름에서_label_을_읽는다() {
        Instant march = RuleSetRunner.parseKst("2026-03-01 09:00:00");
        Instant july = RuleSetRunner.parseKst("2026-07-01 09:00:00");

        assertThat(RuleSetRunner.pathText("RS_PARENT", List.of("s1", "s2"), id -> runner.flowAt(id, march)))
                .isEqualTo("세트 RS_PARENT › 품질 판정(s1) › RS_LINE(s2) › ");
        assertThat(RuleSetRunner.pathText("RS_PARENT", List.of("s1"), id -> runner.flowAt(id, july)))
                .isEqualTo("세트 RS_PARENT › 새 판정(s1) › ");
        assertThat(runner.flowAt("RS_NONE", march)).as("없는 세트는 null — 문구는 노드 ID 로").isNull();
    }

    @Test
    void SET_이_없는_실행_응답은_calls_가_비고_경로_callIndex_는_null_이다() {
        DmeTestSupport.ruleSetFlow(jdbc, "RS_LINE", line(ruleNode("r1", "QLTY_GRD_JDG")));
        RuleSetRunRequest req = new RuleSetRunRequest();
        req.setSetId("RS_LINE");
        req.setRecordJson("{\"COIL_THK\":\"2.0\",\"COIL_WID\":\"1200\",\"SURF_GRD\":\"A\"}");
        req.setEvalTs("2026-03-01 09:00:00");

        RuleSetRunResult r = runner.execute(req);

        assertThat(r.getCalls()).isEmpty();
        assertThat(r.getPath()).isNotEmpty().allSatisfy(p -> assertThat(p).containsEntry("callIndex", null));
        assertThat(r.getCaught()).isEmpty();
    }
}
