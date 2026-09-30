package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.time.Instant;
import java.util.List;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.NodeKind;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.RuleSetDefinition;
import kr.dongkuk.maru.mdm.engine.spi.DefinitionLookup.SetStatus;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/**
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — 판정 시각(KST)에 적용되는 RELEASED 버전, 세트 흐름·한 줄 흐름. 적용 기간은 시작 포함·끝 배타다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class StoredDefinitionLookupTest extends AbstractMdmSharedDbTest {

    @Autowired
    JdbcTemplate jdbc;
    @Autowired
    RuleQueries queries;
    @Autowired
    StoredRuleDefinitions stored;
    @Autowired
    MdmRuleRepository ruleRepository;
    @Autowired
    MdmRuleSetRepository setRepository;

    private StoredDefinitionLookup lookup;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        DmeTestSupport.rule(jdbc, "R_TS", "기간 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_TS", 1, "FIRST", "2026-01-01 00:00:00", "2026-06-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_TS", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.released(jdbc, "R_TS", 2, "FIRST", "2026-06-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_TS", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        lookup = new StoredDefinitionLookup(queries, stored, ruleRepository, setRepository);
    }

    @Test
    void 판정_시각이_APPLY_FROM_과_같으면_그_버전이고_APPLY_TO_와_같으면_아니다() {
        // 2026-06-01 00:00:00 KST = 2026-05-31T15:00:00Z — v1 의 끝(배타) = v2 의 시작(포함)
        assertEquals(2, lookup.rule("R_TS", Instant.parse("2026-05-31T15:00:00Z")).orElseThrow().ver());
        assertEquals(1, lookup.rule("R_TS", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver());
        // 2026-01-01 00:00:00 KST = 2025-12-31T15:00:00Z — v1 시작(포함), 1초 전은 없음
        assertEquals(1, lookup.rule("R_TS", Instant.parse("2025-12-31T15:00:00Z")).orElseThrow().ver());
        assertTrue(lookup.rule("R_TS", Instant.parse("2025-12-31T14:59:59Z")).isEmpty());
        assertTrue(lookup.rule("NO_SUCH", Instant.parse("2026-05-31T15:00:00Z")).isEmpty());
    }

    @Test
    void 세트는_FLOW_JSON_이_없으면_한_줄_흐름이고_있으면_흐름을_싣는다() {
        DmeTestSupport.ruleSet(jdbc, "S_LINE", "한 줄", "[\"R_TS\"]", "INUSE", 0);
        DmeTestSupport.ruleSet(jdbc, "S_FLOW", "흐름", "[\"R_TS\"]", "DEPRECATED", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_FLOW", "{\"version\":1,\"nodes\":[{\"id\":\"start\",\"kind\":\"START\"},"
                + "{\"id\":\"r1\",\"kind\":\"RULE\",\"ruleId\":\"R_TS\"},{\"id\":\"end\",\"kind\":\"END\"}],"
                + "\"edges\":[{\"id\":\"e1\",\"from\":\"start\",\"to\":\"r1\"},{\"id\":\"e2\",\"from\":\"r1\",\"to\":\"end\"}]}");

        RuleSetDefinition line = lookup.ruleSet("S_LINE").orElseThrow();
        assertEquals(List.of("R_TS"), line.ruleIds());
        assertEquals(SetStatus.INUSE, line.status());
        assertNull(line.flow());

        RuleSetDefinition flow = lookup.ruleSet("S_FLOW").orElseThrow();
        assertEquals(SetStatus.DEPRECATED, flow.status());
        assertEquals(NodeKind.RULE, flow.flow().nodes().get(1).kind());
        assertTrue(lookup.ruleSet("S_NONE").isEmpty());
        assertTrue(lookup.column("T", "C").isEmpty());
    }
}
