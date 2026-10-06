package com.dongkuk.dmes.mdm.dme.ruleCalc;

import static com.dongkuk.dmes.mdm.dme.DmeTestSupport.STEWARD;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.rule.RuleQueries;
import com.dongkuk.dmes.mdm.common.rule.RuleSetVersionQueries;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcSearchRequest;
import com.dongkuk.dmes.mdm.dme.ruleCalc.dto.RuleCalcSearchResult;
import com.dongkuk.dmes.mdm.entity.MdmRule;
import com.dongkuk.dmes.mdm.entity.MdmRuleSet;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Set;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * {@code ruleCalc} action=search(룰·세트 찾기, docs/widget-2026-10/rule-calc-api.md §2) 시험. 시드는 {@link RuleCalcTestBase} 에 더해 이 클래스가
 * 룰 몇 개와 세트 몇 개를 더 넣는다.
 *
 * <p>기본 시드: 룰 R_PRE(RELEASED 1.000 + kim DRAFT 2.000)·R_POST·R_UNQ(RELEASED), R_ONLY_DRAFT(kim DRAFT 만), R_DEP(DEPRECATED, RELEASED 있음), 세트
 * S_CALC(RELEASED). 이 클래스가 더하는 것: 룰 R_LEE_DRAFT(lee 의 DRAFT 만)·R_PCT("100% 룰")·R_US("A_B 룰")·R_XX("AXB 룰")·세트 S_KIM_DRAFT(kim DRAFT
 * 만)·S_DEP(DEPRECATED)·S_LEE_DRAFT(lee DRAFT 만)·S_NEXT(RELEASED 1.000 + kim DRAFT 2.000).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
public class RuleCalcSearchTest extends RuleCalcTestBase {

    private static final ObjectMapper JSON = new ObjectMapper();

    @Autowired RuleQueries ruleQueries;
    @Autowired RuleSetVersionQueries setQueries;

    private void extraSeed() {
        DmeTestSupport.rule(jdbc, "R_LEE_DRAFT", "이 초안", "DECISION", "CREATED");
        DmeTestSupport.pending(jdbc, "R_LEE_DRAFT", 1, "DRAFT", "lee", "FIRST", null);
        released("R_PCT", "100% 룰", "퍼센트 설명");
        released("R_US", "A_B 룰", null);
        released("R_XX", "AXB 룰", null);

        draftOnlySet("S_KIM_DRAFT", "kim 세트 초안", "kim");
        draftOnlySet("S_LEE_DRAFT", "lee 세트 초안", "lee");
        DmeTestSupport.ruleSet(jdbc, "S_DEP", "폐기 세트", "[\"R_PRE\"]", "DEPRECATED", 0);
        DmeTestSupport.ruleSet(jdbc, "S_NEXT", "다음 세트", "[\"R_PRE\"]", "INUSE", 0);
        jdbc.update("UPDATE TB_MDM_RULE_SET SET DESCRIPTION = '세트 설명' WHERE MARU_RULE_SET_ID = 'S_NEXT'");
        DmeTestSupport.ruleSetDraft(jdbc, "S_NEXT", "2.000", "kim", "[\"R_PRE\"]", 0);
    }

    private void released(String id, String name, String description) {
        DmeTestSupport.rule(jdbc, id, name, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", "2026-01-01 00:00:00", null);
        if (description != null) {
            jdbc.update("UPDATE TB_MDM_RULE SET DESCRIPTION = ? WHERE MARU_RULE_ID = ?", description, id);
        }
    }

    private void draftOnlySet(String id, String name, String owner) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS, "
                + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) "
                + "VALUES (?, ?, 'CREATED', 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', "
                + "'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 0)", id, name);
        DmeTestSupport.ruleSetDraft(jdbc, id, "1.000", owner, "[\"R_PRE\"]", 0);
    }

    private static RuleCalcSearchRequest search(String tp, String keyword, boolean preview, Integer limit) {
        RuleCalcSearchRequest r = new RuleCalcSearchRequest();
        r.setTargetTp(tp);
        r.setKeyword(keyword);
        r.setPreview(preview);
        r.setLimit(limit);
        return r;
    }

    private static List<String> ids(RuleCalcSearchResult r) {
        return r.getRows().stream().map(RuleCalcSearchResult.Row::getId).toList();
    }

    private static RuleCalcSearchResult.Row row(RuleCalcSearchResult r, String id) {
        return r.getRows().stream().filter(x -> id.equals(x.getId())).findFirst().orElseThrow(() -> new AssertionError(id + " 가 결과에 없다: " + ids(r)));
    }

    // ── 대상 종류 ─────────────────────────────────────────────────────────────

    @Test
    void 기본은_ALL_이고_ID_오름차순_RELEASED_룰과_세트를_함께_돌려준다() {
        RuleCalcSearchResult r = service.search(search(null, null, false, null));

        assertTrue(r.isOk());
        assertEquals(List.of("R_POST", "R_PRE", "R_UNQ", "S_CALC"), ids(r));
        assertEquals(List.of(), r.getMessages());
        RuleCalcSearchResult.Row pre = row(r, "R_PRE");
        assertEquals("RULE", pre.getTp());
        assertEquals("사전 계수", pre.getName());
        assertEquals("1.000", pre.getVer(), "preview 가 아니면 kim 의 DRAFT(2.000)는 보이지 않는다");
        assertEquals("RELEASED", pre.getVerStatus());
        RuleCalcSearchResult.Row set = row(r, "S_CALC");
        assertEquals("SET", set.getTp());
        assertEquals("계산 세트", set.getName());
        assertEquals("1.000", set.getVer());
        assertEquals("RELEASED", set.getVerStatus());
    }

    @Test
    void RULE_SET_ALL_을_구분하고_대소문자를_가리지_않는다() {
        assertEquals(List.of("R_POST", "R_PRE", "R_UNQ"), ids(service.search(search("RULE", "", false, null))));
        assertEquals(List.of("S_CALC"), ids(service.search(search("set", "  ", false, null))), "소문자 targetTp·공백 키워드는 전체");
        assertEquals(List.of("R_POST", "R_PRE", "R_UNQ", "S_CALC"), ids(service.search(search("All", null, false, null))));
        assertEquals(List.of("R_POST", "R_PRE", "R_UNQ", "S_CALC"), ids(service.search(search(" ", null, false, null))), "빈 targetTp 는 ALL");
        assertEquals(List.of("RULE", "RULE", "RULE"), service.search(search("RULE", null, false, null)).getRows().stream()
                .map(RuleCalcSearchResult.Row::getTp).toList());
    }

    @Test
    void 잘못된_targetTp_는_INVALID_VALUE_다() {
        assertThrows(BusinessException.class, () -> service.search(search("ROW", null, false, null)));
    }

    // ── 키워드 ────────────────────────────────────────────────────────────────

    @Test
    void ID_부분_일치는_대소문자를_가리지_않는다() {
        assertEquals(List.of("R_POST", "R_PRE"), ids(service.search(search("ALL", "r_p", false, null))));
        assertEquals(List.of("R_UNQ"), ids(service.search(search("RULE", "UNQ", false, null))));
        assertEquals(List.of(), ids(service.search(search("ALL", "NO_SUCH", false, null))));
    }

    @Test
    void 이름_부분_일치() {
        assertEquals(List.of("R_PRE"), ids(service.search(search("ALL", "계수", false, null))));
        assertEquals(List.of("S_CALC"), ids(service.search(search("ALL", "계산 세트", false, null))));
        assertEquals(List.of("R_POST"), ids(service.search(search("RULE", "  최종  ", false, null))), "앞뒤 공백은 뗀다");
    }

    @Test
    void 와일드카드_문자는_리터럴이다() {
        extraSeed();

        assertEquals(List.of("R_PCT"), ids(service.search(search("ALL", "%", false, null))), "% 는 모든 글자가 아니라 % 글자다");
        assertEquals(List.of("R_US"), ids(service.search(search("RULE", "A_B", false, null))), "_ 는 한 글자 와일드카드가 아니라 _ 글자다(AXB 는 안 맞는다)");
        assertEquals(List.of(), ids(service.search(search("ALL", "\\", false, null))));
    }

    // ── 버전 상태 ─────────────────────────────────────────────────────────────

    @Test
    void RELEASED_없이_DRAFT_만_있는_룰은_기본에서_빠진다() {
        extraSeed();

        RuleCalcSearchResult r = service.search(search("ALL", null, false, null));

        assertTrue(!ids(r).contains("R_ONLY_DRAFT") && !ids(r).contains("R_LEE_DRAFT") && !ids(r).contains("S_KIM_DRAFT") && !ids(r).contains("S_LEE_DRAFT"),
                ids(r).toString());
    }

    @Test
    void preview_는_본인_DRAFT_만_더하고_그_행은_DRAFT_버전이다() {
        extraSeed();

        RuleCalcSearchResult r = service.search(search("ALL", null, true, null));

        assertEquals(List.of("R_ONLY_DRAFT", "R_PCT", "R_POST", "R_PRE", "R_UNQ", "R_US", "R_XX", "S_CALC", "S_KIM_DRAFT", "S_NEXT"), ids(r));
        RuleCalcSearchResult.Row onlyDraft = row(r, "R_ONLY_DRAFT");
        assertEquals("1.000", onlyDraft.getVer());
        assertEquals("DRAFT", onlyDraft.getVerStatus());
        RuleCalcSearchResult.Row pre = row(r, "R_PRE");
        assertEquals("2.000", pre.getVer(), "내 DRAFT 가 있으면 RELEASED 보다 DRAFT 가 우선");
        assertEquals("DRAFT", pre.getVerStatus());
        RuleCalcSearchResult.Row post = row(r, "R_POST");
        assertEquals("1.000", post.getVer(), "DRAFT 가 없으면 RELEASED");
        assertEquals("RELEASED", post.getVerStatus());
        assertEquals("2.000", row(r, "S_NEXT").getVer());
        assertEquals("DRAFT", row(r, "S_NEXT").getVerStatus());
        assertEquals("DRAFT", row(r, "S_KIM_DRAFT").getVerStatus());
    }

    @Test
    void preview_여도_남의_DRAFT_는_넣지_않는다() {
        extraSeed();
        currentUser.set("lee", STEWARD);

        RuleCalcSearchResult r = service.search(search("ALL", null, true, null));

        assertTrue(ids(r).contains("R_LEE_DRAFT") && ids(r).contains("S_LEE_DRAFT"), ids(r).toString());
        assertTrue(!ids(r).contains("R_ONLY_DRAFT") && !ids(r).contains("S_KIM_DRAFT"), "kim 의 DRAFT 는 lee 에게 보이지 않는다: " + ids(r));
        assertEquals("1.000", row(r, "R_PRE").getVer(), "kim 의 DRAFT 2.000 이 아니라 RELEASED");
        assertEquals("RELEASED", row(r, "R_PRE").getVerStatus());
        assertEquals("1.000", row(r, "S_NEXT").getVer());
        assertEquals("RELEASED", row(r, "S_NEXT").getVerStatus());
    }

    @Test
    void 폐기_룰과_세트는_preview_여도_제외된다() {
        extraSeed();

        List<String> plain = ids(service.search(search("ALL", null, false, null)));
        assertTrue(!plain.contains("R_DEP") && !plain.contains("S_DEP"), plain.toString());
        assertEquals(List.of(), ids(service.search(search("ALL", "DEP", false, null))));
        assertEquals(List.of(), ids(service.search(search("ALL", "DEP", true, null))), "RELEASED 가 있어도 폐기 헤더면 preview 에서도 뺀다");
    }

    // ── limit ─────────────────────────────────────────────────────────────────

    @Test
    void limit_으로_ID_순_앞에서_자른다() {
        extraSeed();

        assertEquals(List.of("R_PCT", "R_POST"), ids(service.search(search("ALL", null, false, 2))));
        assertEquals(List.of("R_PCT", "R_POST", "R_PRE", "R_UNQ", "R_US", "R_XX", "S_CALC", "S_NEXT"), ids(service.search(search("ALL", null, false, 50))));
        assertEquals(8, service.search(search("ALL", null, false, 0)).getRows().size(), "1 미만은 기본(50)");
        assertEquals(8, service.search(search("ALL", null, false, 100000)).getRows().size(), "200 을 넘으면 200 으로 줄인다");
        assertEquals(List.of("R_PCT", "R_POST", "R_PRE"), ids(service.search(search("RULE", null, false, 3))));
        assertEquals(List.of("R_PCT", "R_POST", "R_PRE", "R_UNQ", "R_US", "R_XX", "S_CALC"), ids(service.search(search("ALL", null, false, 7))),
                "룰·세트를 합쳐 ID 순으로 자른다");
    }

    @Test
    void limit_상한은_200_이다() {
        for (int i = 0; i < 205; i++) {
            released(String.format("R_BULK_%03d", i), "대량 " + i, null);
        }

        assertEquals(200, service.search(search("RULE", "BULK", false, 100000)).getRows().size());
        assertEquals(50, service.search(search("RULE", "BULK", false, null)).getRows().size(), "기본은 50");
        assertEquals("R_BULK_000", service.search(search("RULE", "BULK", false, 1)).getRows().get(0).getId());
    }

    // ── 응답 모양 ─────────────────────────────────────────────────────────────

    @Test
    void 응답_키는_ok_rows_messages_이고_desc_는_있을_때만_나간다() throws Exception {
        extraSeed();

        JsonNode json = JSON.valueToTree(service.search(search("ALL", "100%", false, null)));
        assertEquals(Set.of("ok", "rows", "messages"), keys(json));
        assertTrue(json.path("ok").asBoolean(false));
        JsonNode row = json.path("rows").path(0);
        assertEquals(Set.of("tp", "id", "name", "ver", "verStatus", "desc"), keys(row));
        assertEquals("퍼센트 설명", row.path("desc").asText());

        JsonNode noDesc = JSON.valueToTree(service.search(search("RULE", "UNQ", false, null))).path("rows").path(0);
        assertEquals(Set.of("tp", "id", "name", "ver", "verStatus"), keys(noDesc), "설명이 없으면 desc 키가 없다");

        JsonNode set = JSON.valueToTree(service.search(search("SET", "S_NEXT", false, null))).path("rows").path(0);
        assertEquals("세트 설명", set.path("desc").asText());
        assertNull(service.search(search("RULE", "UNQ", false, null)).getRows().get(0).getDesc());
    }

    // ── 판정 시각·상태 조건(시험의 고정 시계 = DmeTestSupport.NOW 2026-06-15 09:00:00 KST) ─────────

    private static final String NOW_TXT = "2026-06-15 09:00:00";

    /** 룰 R_TM_* 하나 — RELEASED 1.000 을 [from, to) 로. {@code to} 가 null 이면 열린 끝. */
    private void timedRule(String id, String from, String to) {
        DmeTestSupport.rule(jdbc, id, "시각 룰 " + id, "DECISION", "INUSE");
        DmeTestSupport.released(jdbc, id, 1, "FIRST", from, to);
    }

    /** 세트 S_TM_* 하나 — RELEASED 1.000 을 [from, to) 로. */
    private void timedSet(String id, String from, String to) {
        setHeader(id, "시각 세트 " + id, "INUSE");
        DmeTestSupport.ruleSetVersion(jdbc, id, "1.000", "MAJOR", "RELEASED", null, "[\"R_PRE\"]", from, to == null ? "9999-12-31 00:00:00" : to, 0);
    }

    private void setHeader(String id, String name, String status) {
        jdbc.update("INSERT INTO TB_MDM_RULE_SET (MARU_RULE_SET_ID, MARU_RULE_SET_NAME, STATUS, "
                + "C_USR_ID, C_AT, C_SVC_ID, C_PGM_ID, U_USR_ID, U_AT, U_SVC_ID, U_PGM_ID, VER) "
                + "VALUES (?, ?, ?, 'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', "
                + "'fixture', '2026-01-01 00:00:00', 'fixture', 'fixture', 0)", id, name, status);
    }

    /**
     * 서비스 결과의 ID 목록. 서비스는 버전 선택에서 한 번 더 거르므로 DB 쿼리의 시각·상태 조건이 빠져도 서비스 결과만으론 못 잡는다 —
     * 그래서 같은 조건의 DB 쿼리({@code searchCallable}) 결과도 같은 목록인지 함께 단언한다.
     */
    private List<String> tmIds(String tp, boolean preview) {
        String owner = preview ? "kim" : null;
        List<String> fromQuery = "RULE".equals(tp)
                ? ruleQueries.searchCallable("TM_", owner, DmeTestSupport.NOW, 50).stream().map(MdmRule::getMaruRuleId).toList()
                : setQueries.searchCallable("TM_", owner, DmeTestSupport.NOW, 50).stream().map(MdmRuleSet::getMaruRuleSetId).toList();
        List<String> fromService = ids(service.search(search(tp, "TM_", preview, null)));
        assertEquals(fromService, fromQuery, "DB 쿼리가 이미 시각·상태로 걸러야 한다");
        return fromService;
    }

    @Test
    void 룰은_미래_시작과_이미_끝난_RELEASED_만_있으면_제외된다() {
        timedRule("R_TM_OK", "2026-01-01 00:00:00", null);
        timedRule("R_TM_FUT", "2026-06-15 09:00:01", null);
        timedRule("R_TM_PAST", "2026-01-01 00:00:00", "2026-06-15 08:59:59");

        assertEquals(List.of("R_TM_OK"), tmIds("RULE", false));
        assertEquals(List.of("R_TM_OK"), tmIds("RULE", true), "preview 여도 적용 구간 밖의 RELEASED 는 넣지 않는다");
    }

    @Test
    void 세트는_미래_시작과_이미_끝난_RELEASED_만_있으면_제외된다() {
        timedSet("S_TM_OK", "2026-01-01 00:00:00", null);
        timedSet("S_TM_FUT", "2026-06-15 09:00:01", null);
        timedSet("S_TM_PAST", "2026-01-01 00:00:00", "2026-06-15 08:59:59");

        assertEquals(List.of("S_TM_OK"), tmIds("SET", false));
        assertEquals(List.of("S_TM_OK"), tmIds("SET", true));
    }

    @Test
    void 룰_경계_APPLY_TO_가_정확히_지금이면_제외_APPLY_FROM_이_정확히_지금이면_포함() {
        timedRule("R_TM_TO_NOW", "2026-01-01 00:00:00", NOW_TXT);
        timedRule("R_TM_FROM_NOW", NOW_TXT, null);

        assertEquals(List.of("R_TM_FROM_NOW"), tmIds("RULE", false));
    }

    @Test
    void 세트_경계_APPLY_TO_가_정확히_지금이면_제외_APPLY_FROM_이_정확히_지금이면_포함() {
        timedSet("S_TM_TO_NOW", "2026-01-01 00:00:00", NOW_TXT);
        timedSet("S_TM_FROM_NOW", NOW_TXT, null);

        assertEquals(List.of("S_TM_FROM_NOW"), tmIds("SET", false));
    }

    @Test
    void 룰은_REQUESTED_APPROVED_만_있으면_preview_여도_제외된다() {
        timedRule("R_TM_OK", "2026-01-01 00:00:00", null);
        DmeTestSupport.rule(jdbc, "R_TM_REQ", "요청만", "DECISION", "INUSE");
        DmeTestSupport.pending(jdbc, "R_TM_REQ", 1, "REQUESTED", "kim", "FIRST", null);
        DmeTestSupport.rule(jdbc, "R_TM_APR", "승인만", "DECISION", "INUSE");
        DmeTestSupport.pending(jdbc, "R_TM_APR", 1, "APPROVED", "kim", "FIRST", null);

        assertEquals(List.of("R_TM_OK"), tmIds("RULE", false));
        assertEquals(List.of("R_TM_OK"), tmIds("RULE", true));
    }

    @Test
    void 세트는_REQUESTED_APPROVED_만_있으면_preview_여도_제외된다() {
        timedSet("S_TM_OK", "2026-01-01 00:00:00", null);
        setHeader("S_TM_REQ", "요청만", "INUSE");
        DmeTestSupport.ruleSetVersion(jdbc, "S_TM_REQ", "1.000", "MAJOR", "REQUESTED", "kim", "[\"R_PRE\"]", "2099-01-01 00:00:00", "9999-12-31 00:00:00", 0);
        setHeader("S_TM_APR", "승인만", "INUSE");
        DmeTestSupport.ruleSetVersion(jdbc, "S_TM_APR", "1.000", "MAJOR", "APPROVED", "kim", "[\"R_PRE\"]", "2099-01-01 00:00:00", "9999-12-31 00:00:00", 0);

        assertEquals(List.of("S_TM_OK"), tmIds("SET", false));
        assertEquals(List.of("S_TM_OK"), tmIds("SET", true));
    }

    // ── DB 쪽 limit ───────────────────────────────────────────────────────────

    @Test
    void 룰_쿼리는_DB_에서_limit_건만_읽는다() {
        for (int i = 0; i < 5; i++) {
            timedRule("R_TM_L" + i, "2026-01-01 00:00:00", null);
        }

        List<MdmRule> rules = ruleQueries.searchCallable("TM_", null, DmeTestSupport.NOW, 3);

        assertEquals(3, rules.size());
        assertEquals(List.of("R_TM_L0", "R_TM_L1", "R_TM_L2"), rules.stream().map(MdmRule::getMaruRuleId).toList());
    }

    @Test
    void 세트_쿼리는_DB_에서_limit_건만_읽는다() {
        for (int i = 0; i < 5; i++) {
            timedSet("S_TM_L" + i, "2026-01-01 00:00:00", null);
        }

        List<MdmRuleSet> sets = setQueries.searchCallable("TM_", null, DmeTestSupport.NOW, 3);

        assertEquals(3, sets.size());
        assertEquals(List.of("S_TM_L0", "S_TM_L1", "S_TM_L2"), sets.stream().map(MdmRuleSet::getMaruRuleSetId).toList());
    }

    private static Set<String> keys(JsonNode node) {
        Set<String> out = new java.util.TreeSet<>();
        node.fieldNames().forEachRemaining(out::add);
        return out;
    }
}
