package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDateTime;
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
 * 운영 정의 조회기(spec §6.1, 계획 Task 11) — 판정 시각(KST)에 적용되는 RELEASED 버전(룰·세트, D-144 2단계), 세트 흐름·한 줄 흐름. 적용 기간은
 * 시작 포함·끝 배타다.
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
    @Autowired
    RuleSetVersionQueries setVersions;

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
        DmeTestSupport.rule(jdbc, "R_GAP", "버전 하나", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_GAP", 1, "FIRST", "2026-01-01 00:00:00", "2026-06-01 00:00:00");
        DmeTestSupport.var(jdbc, "R_GAP", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        lookup = new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository);
    }

    /** 변수 정의에 없는 var_id 9 를 조건 칸으로 가진 행 — 조립기가 CellFailure 로 보고하고 그 행을 뺀다. */
    static final String BAD_ROW = "{\"9\":{\"op\":\"GT\",\"left\":\"1\"},\"1\":{\"val\":\"X\"}}";

    /** R_BAD v1 RELEASED — 1행은 깨졌고(BAD_ROW), 기본 행은 D. 깨진 행을 빼고 판정하면 D 가 나온다. */
    static void badRule(JdbcTemplate jdbc) {
        DmeTestSupport.rule(jdbc, "R_BAD", "깨진 행", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_BAD", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_BAD", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.row(jdbc, "R_BAD", 1, 1, 1, "NORMAL", BAD_ROW);
        DmeTestSupport.row(jdbc, "R_BAD", 1, 2, 0, "DEFAULT", "{\"1\":{\"val\":\"D\"}}");
    }

    @Test
    void 뒤_버전이_없으면_APPLY_TO_시각에는_적용_버전이_없다() {
        // R_GAP v1 = 2026-01-01 ~ 2026-06-01(KST). 2026-06-01 00:00:00 KST = 2026-05-31T15:00:00Z — 끝은 배타다
        assertTrue(lookup.rule("R_GAP", Instant.parse("2026-05-31T15:00:00Z")).isEmpty());
        assertEquals(new BigDecimal("1.000"), lookup.rule("R_GAP", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver());
    }

    @Test
    void 조립에_실패한_행이_있으면_빼고_판정하지_않고_저장값_손상_예외를_던진다() {
        badRule(jdbc);

        // P-D9 — 행 조립 실패(BusinessException MDM021)를 원인으로 감싼 StoredDefinitionException. 메시지는 원인 그대로다.
        StoredDefinitionException e = assertThrows(StoredDefinitionException.class,
                () -> lookup.rule("R_BAD", Instant.parse("2026-03-01T00:00:00Z")));
        assertTrue(e.getCause() instanceof BusinessException, String.valueOf(e.getCause()));
        assertEquals(e.getCause().getMessage(), e.getMessage());
        assertTrue(e.getMessage().contains("R_BAD") && e.getMessage().contains("버전 1") && e.getMessage().contains("row 1")
                && e.getMessage().contains("var_id 9"), e.getMessage());
    }

    @Test
    void 저장된_FLOW_JSON_을_읽지_못하면_저장값_손상_예외다() {
        DmeTestSupport.ruleSet(jdbc, "S_BROKEN", "깨진 흐름", "[\"R_TS\"]", "INUSE", 0);
        DmeTestSupport.ruleSetFlow(jdbc, "S_BROKEN", "{\"version\":1}");

        StoredDefinitionException e = assertThrows(StoredDefinitionException.class, () -> lookup.ruleSet("S_BROKEN", DmeTestSupport.NOW_INSTANT));
        assertTrue(e.getCause() instanceof IllegalArgumentException, String.valueOf(e.getCause()));
        assertEquals("흐름의 nodes 는 배열이어야 한다", e.getMessage());
    }

    @Test
    void 판정_시각이_APPLY_FROM_과_같으면_그_버전이고_APPLY_TO_와_같으면_아니다() {
        // 2026-06-01 00:00:00 KST = 2026-05-31T15:00:00Z — v1 의 끝(배타) = v2 의 시작(포함)
        assertEquals(new BigDecimal("2.000"), lookup.rule("R_TS", Instant.parse("2026-05-31T15:00:00Z")).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), lookup.rule("R_TS", Instant.parse("2026-05-31T14:59:59Z")).orElseThrow().ver());
        // 2026-01-01 00:00:00 KST = 2025-12-31T15:00:00Z — v1 시작(포함), 1초 전은 없음
        assertEquals(new BigDecimal("1.000"), lookup.rule("R_TS", Instant.parse("2025-12-31T15:00:00Z")).orElseThrow().ver());
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

        RuleSetDefinition line = lookup.ruleSet("S_LINE", DmeTestSupport.NOW_INSTANT).orElseThrow();
        assertEquals(List.of("R_TS"), line.ruleIds());
        assertEquals(SetStatus.INUSE, line.status());
        assertNull(line.flow());

        RuleSetDefinition flow = lookup.ruleSet("S_FLOW", DmeTestSupport.NOW_INSTANT).orElseThrow();
        assertEquals(SetStatus.DEPRECATED, flow.status());
        assertEquals(NodeKind.RULE, flow.flow().nodes().get(1).kind());
        assertTrue(lookup.ruleSet("S_NONE", DmeTestSupport.NOW_INSTANT).isEmpty());
        assertTrue(lookup.column("T", "C").isEmpty());
    }

    @Test
    void 세트는_판정_시각에_적용되는_RELEASED_버전을_고르고_DRAFT_는_고르지_않는다() {
        DmeTestSupport.ruleSet(jdbc, "S_V", "버전 세트", "[\"R_TS\"]", "INUSE", 0);           // 1.000 [2000-01-01, …)
        jdbc.update("UPDATE TB_MDM_RULE_SET_VER SET APPLY_TO = TIMESTAMP '2026-05-01 00:00:00' WHERE MARU_RULE_SET_ID = 'S_V'");
        DmeTestSupport.ruleSetVersion(jdbc, "S_V", "1.001", "MINOR", "RELEASED", "kim", "[\"R_TS\",\"R_OTHER\"]",
                "2026-05-01 00:00:00", "9999-12-31 00:00:00", 0);
        DmeTestSupport.ruleSetVersion(jdbc, "S_V", "2.000", "MAJOR", "DRAFT", "kim", "[\"R_DRAFT\"]", null, null, 0);

        Instant before = LocalDateTime.of(2026, 4, 30, 23, 59, 59).atZone(MdmClockConfig.KST).toInstant();
        Instant at = LocalDateTime.of(2026, 5, 1, 0, 0, 0).atZone(MdmClockConfig.KST).toInstant();
        Instant tooEarly = LocalDateTime.of(1999, 12, 31, 23, 59, 59).atZone(MdmClockConfig.KST).toInstant();

        assertEquals(List.of("R_TS"), lookup.ruleSet("S_V", before).orElseThrow().ruleIds());
        assertEquals(List.of("R_TS", "R_OTHER"), lookup.ruleSet("S_V", at).orElseThrow().ruleIds());
        assertTrue(lookup.ruleSet("S_V", tooEarly).isEmpty());
    }

    @Test
    void 저장_CREATED_라도_적용된_RELEASED_가_있으면_세트_상태는_INUSE_다() {
        DmeTestSupport.ruleSet(jdbc, "S_C", "새 세트", "[\"R_TS\"]", "CREATED", 0);
        assertEquals(SetStatus.INUSE, lookup.ruleSet("S_C", DmeTestSupport.NOW_INSTANT).orElseThrow().status());
    }
}
