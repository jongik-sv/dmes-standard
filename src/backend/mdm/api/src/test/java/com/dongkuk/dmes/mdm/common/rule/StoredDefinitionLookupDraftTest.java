package com.dongkuk.dmes.mdm.common.rule;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.rule.definition.RuleVersionPick;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionException;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredDefinitionLookup;
import com.dongkuk.dmes.mdm.common.rule.definition.StoredRuleDefinitions;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.repository.MdmRuleRepository;
import com.dongkuk.dmes.mdm.repository.MdmRuleSetRepository;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

/** 룰 세트 DRAFT 시험(spec 2026-10-06 §3·§4.2) — MY_DRAFT 조회기는 내 DRAFT 를 판정 시각과 무관하게 고르고, 실제 load 한 것만 기록한다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class StoredDefinitionLookupDraftTest extends AbstractMdmSharedDbTest {

    static final Instant AT = Instant.parse("2026-03-01T00:00:00Z");
    /** 모든 RELEASED 의 적용 시작(2026-01-01 KST)보다 이른 시각. */
    static final Instant EARLY = Instant.parse("2025-06-01T00:00:00Z");

    @Autowired JdbcTemplate jdbc;
    @Autowired RuleQueries queries;
    @Autowired StoredRuleDefinitions stored;
    @Autowired MdmRuleRepository ruleRepository;
    @Autowired MdmRuleSetRepository setRepository;
    @Autowired RuleSetVersionQueries setVersions;

    @BeforeEach
    void seed() {
        DmeTestSupport.clear(jdbc);
        DmeTestSupport.clearDictionary(jdbc);
        // R_MINE: v1 RELEASED + v2 내(kim) DRAFT
        DmeTestSupport.rule(jdbc, "R_MINE", "내 DRAFT 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_MINE", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_MINE", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_MINE", 2, "DRAFT", "kim", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_MINE", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_OTHER: v1 RELEASED + v2 남(lee) DRAFT
        DmeTestSupport.rule(jdbc, "R_OTHER", "남 DRAFT 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_OTHER", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_OTHER", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_OTHER", 2, "DRAFT", "lee", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_OTHER", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_REQ: v1 RELEASED + v2 내 REQUESTED
        DmeTestSupport.rule(jdbc, "R_REQ", "승인 요청 룰", "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, "R_REQ", 1, "FIRST", "2026-01-01 00:00:00", null);
        DmeTestSupport.var(jdbc, "R_REQ", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        DmeTestSupport.pending(jdbc, "R_REQ", 2, "REQUESTED", "kim", "FIRST", 1);
        DmeTestSupport.var(jdbc, "R_REQ", 2, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
        // R_NEW: RELEASED 없이 내 DRAFT v1 만
        DmeTestSupport.rule(jdbc, "R_NEW", "새 룰", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_NEW", 1, "DRAFT", "kim", "FIRST", null);
        DmeTestSupport.var(jdbc, "R_NEW", 1, 1, "RESULT", "Value", "OUT_V", 1, "STRING");
    }

    private StoredDefinitionLookup lookup(RuleVersionPick pick) {
        return new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository, pick);
    }

    @Test
    void MY_DRAFT_는_내_DRAFT_를_고르고_남의_DRAFT_와_REQUESTED_는_RELEASED() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_OTHER", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_REQ", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_NEW", AT).orElseThrow().ver()); // RELEASED 없이 DRAFT 만
    }

    @Test
    void DRAFT_는_판정_시각과_무관하다() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", EARLY).orElseThrow().ver());
        assertTrue(l.rule("R_OTHER", EARLY).isEmpty()); // RELEASED 적용 시작 전 = 지금처럼 없음
    }

    @Test
    void RELEASED_와_기본_생성자는_DRAFT_를_읽지_않는다() {
        StoredDefinitionLookup released = lookup(RuleVersionPick.RELEASED);
        StoredDefinitionLookup legacy = new StoredDefinitionLookup(queries, stored, ruleRepository, setVersions, setRepository);
        assertEquals(new BigDecimal("1.000"), released.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), legacy.rule("R_MINE", AT).orElseThrow().ver());
        assertTrue(legacy.rule("R_NEW", AT).isEmpty());
        assertTrue(released.draftRules().isEmpty());
    }

    @Test
    void 사용자_ID_가_없으면_RELEASED_다() {
        assertEquals(RuleVersionPick.RELEASED, RuleVersionPick.myDraft(null));
        assertEquals(RuleVersionPick.RELEASED, RuleVersionPick.myDraft(" "));
    }

    @Test
    void prefetch_뒤_rule_도_DRAFT() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        l.prefetch(List.of("R_MINE", "R_OTHER"), AT);
        assertEquals(new BigDecimal("2.000"), l.rule("R_MINE", AT).orElseThrow().ver());
        assertEquals(new BigDecimal("1.000"), l.rule("R_OTHER", AT).orElseThrow().ver());
    }

    @Test
    void prefetch_만_한_룰은_draftRules_에_없다() {
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        l.prefetch(List.of("R_MINE", "R_NEW"), AT);
        l.rule("R_NEW", AT);
        assertEquals(java.util.Map.of("R_NEW", new BigDecimal("1.000")), l.draftRules());
    }

    @Test
    void 내_DRAFT_세트를_고르고_draftSets_에_남긴다() {
        DmeTestSupport.ruleSet(jdbc, "S_SUB", "하위", "[\"R_OTHER\"]", "INUSE", 0);
        DmeTestSupport.ruleSetDraft(jdbc, "S_SUB", "2.000", "kim", "[\"R_MINE\"]", 0);
        StoredDefinitionLookup l = lookup(RuleVersionPick.myDraft("kim"));
        assertEquals(List.of("R_MINE"), l.ruleSet("S_SUB", AT).orElseThrow().ruleIds());
        assertEquals(new BigDecimal("2.000"), l.draftSets().get("S_SUB").getVer().setScale(3));
        assertEquals(List.of("R_OTHER"), lookup(RuleVersionPick.RELEASED).ruleSet("S_SUB", AT).orElseThrow().ruleIds());
    }

    @Test
    void 깨진_내_DRAFT_는_머리말을_붙여_던진다() {
        DmeTestSupport.row(jdbc, "R_MINE", 2, 1, 1, "NORMAL", "{\"9\":{\"op\":\"GT\",\"left\":\"1\"},\"1\":{\"val\":\"X\"}}");
        StoredDefinitionException e = assertThrows(StoredDefinitionException.class,
                () -> lookup(RuleVersionPick.myDraft("kim")).rule("R_MINE", AT));
        assertTrue(e.getMessage().startsWith("룰 R_MINE 의 내 DRAFT 버전 2.000: "), e.getMessage());
    }
}
