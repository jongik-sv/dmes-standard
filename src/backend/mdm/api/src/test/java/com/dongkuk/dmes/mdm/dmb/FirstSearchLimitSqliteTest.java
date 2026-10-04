package com.dongkuk.dmes.mdm.dmb;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.dto.LayoutConfirmSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutConfirm.service.LayoutConfirmService;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * 조건 없는 첫 조회 상한(화면 성능 가이드 R1) — headerMng·layoutConfirm·layoutMng 의 search. {@code limit} 은 조건이 없을 때만 DB 단계에서
 * 앞쪽을 자르고 {@code totalCount}·{@code truncated} 를 싣는다. {@code limit} 이 없으면 응답 모양이 예전 그대로다(새 키 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class FirstSearchLimitSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutConfirmService confirmService;

    private int count(String sql) {
        return jdbc.queryForObject(sql, Integer.class);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> rows(Map<String, Object> out, String key) {
        return (List<Map<String, Object>>) out.get(key);
    }

    // ── headerMng ────────────────────────────────────────────────────────────────────────────────

    @Test
    void headerMng_는_조건_없이_limit_이_오면_앞쪽_헤더만_주고_전체_건수와_잘림을_알린다() {
        m201(); // 헤더 2개 + 전문 1개
        int headers = count("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'HEADER'");
        assertTrue(headers >= 2);
        HeaderMngSearchRequest q = new HeaderMngSearchRequest();
        q.setLimit(1);

        Map<String, Object> out = headerService.search(q);

        assertEquals(1, rows(out, "headers").size());
        assertEquals((long) headers, out.get("totalCount"));
        assertEquals(true, out.get("truncated"));
        // 앞쪽 = LAYOUT_ID 순(기존 정렬)
        Long first = jdbc.queryForObject("SELECT MIN(LAYOUT_ID) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'HEADER'", Long.class);
        assertEquals(first, ((Number) rows(out, "headers").get(0).get("LAYOUT_ID")).longValue());
    }

    @Test
    void headerMng_는_limit_이_전체보다_크면_잘리지_않고_검색어가_있으면_limit_을_무시한다() {
        M201 m = m201();
        int headers = count("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'HEADER'");
        HeaderMngSearchRequest big = new HeaderMngSearchRequest();
        big.setLimit(100_000);
        Map<String, Object> all = headerService.search(big);
        assertEquals(headers, rows(all, "headers").size());
        assertEquals(false, all.get("truncated"));

        HeaderMngSearchRequest byName = new HeaderMngSearchRequest();
        byName.setKeyword((String) layoutRow(m.l100()).get("LAYOUT_NAME"));
        byName.setLimit(1);
        Map<String, Object> out = headerService.search(byName);
        assertEquals(1, rows(out, "headers").size());
        assertEquals(1L, out.get("totalCount"));
        assertEquals(false, out.get("truncated"));
    }

    @Test
    void headerMng_는_limit_이_없으면_기존_응답_모양이다() {
        m201();
        Map<String, Object> out = headerService.search(new HeaderMngSearchRequest());
        assertNull(out.get("totalCount"));
        assertNull(out.get("truncated"));
        assertEquals(count("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'HEADER'"), rows(out, "headers").size());
    }

    // ── layoutConfirm ────────────────────────────────────────────────────────────────────────────

    @Test
    void layoutConfirm_은_조건_없이_limit_이_오면_앞쪽_DRAFT_만_주고_전체_건수와_잘림을_알린다() {
        M201 m = m201();
        newDraft(m.l100(), "1.000", "2.000");
        newDraft(m.l110(), "1.000", "2.000");
        int drafts = count("SELECT COUNT(*) FROM TB_MDM_LAYOUT_VER WHERE STATUS = 'DRAFT'");
        assertTrue(drafts >= 2);
        LayoutConfirmSearchRequest q = new LayoutConfirmSearchRequest();
        q.setLimit(1);

        Map<String, Object> out = confirmService.search(q);

        assertEquals(1, rows(out, "rows").size());
        assertEquals((long) drafts, out.get("totalCount"));
        assertEquals(true, out.get("truncated"));
        // 자른 앞쪽은 전체 조회의 앞쪽과 같다(종류·이름 순)
        Map<String, Object> full = confirmService.search(new LayoutConfirmSearchRequest());
        assertEquals(rows(full, "rows").get(0).get("LAYOUT_ID"), rows(out, "rows").get(0).get("LAYOUT_ID"));
        assertEquals(drafts, rows(full, "rows").size());
        assertNull(full.get("totalCount"));
    }

    @Test
    void layoutConfirm_은_검색어가_있으면_limit_을_무시한다() {
        M201 m = m201();
        newDraft(m.l100(), "1.000", "2.000");
        newDraft(m.l110(), "1.000", "2.000");
        LayoutConfirmSearchRequest q = new LayoutConfirmSearchRequest();
        q.setKeyword("GLUE");
        q.setLimit(1);
        Map<String, Object> out = confirmService.search(q);
        int matched = rows(out, "rows").size();
        assertTrue(matched >= 1);
        assertEquals((long) matched, out.get("totalCount"));
        assertEquals(false, out.get("truncated"));
    }

    // ── layoutMng ────────────────────────────────────────────────────────────────────────────────

    @Test
    void layoutMng_는_조건_없이_limit_이_오면_앞쪽_전문만_주고_전체_건수와_잘림을_알린다() {
        m201();
        m201(); // 전문 하나 더
        int messages = count("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'MESSAGE'");
        assertTrue(messages >= 2);
        LayoutMngSearchRequest q = new LayoutMngSearchRequest();
        q.setLimit(1);

        Map<String, Object> out = layoutService.search(q);

        assertEquals(1, rows(out, "layouts").size());
        assertEquals((long) messages, out.get("totalCount"));
        assertEquals(true, out.get("truncated"));
        Long first = jdbc.queryForObject("SELECT MIN(LAYOUT_ID) FROM TB_MDM_LAYOUT WHERE LAYOUT_KIND = 'MESSAGE'", Long.class);
        assertEquals(first, ((Number) rows(out, "layouts").get(0).get("LAYOUT_ID")).longValue());
        // 콤보 값(시스템·EAI·헤더)은 상한과 무관하게 그대로 온다
        assertFalse(rows(out, "headers").isEmpty());
        assertFalse(rows(out, "systems").isEmpty());
        // limit 이 없으면 새 키가 없다
        Map<String, Object> plain = layoutService.search(new LayoutMngSearchRequest());
        assertNull(plain.get("totalCount"));
        assertEquals(messages, rows(plain, "layouts").size());
    }

    @Test
    void layoutMng_는_조건이_있으면_limit_을_무시하고_optionsOnly_는_건수를_싣지_않는다() {
        M201 m = m201();
        m201(); // 전문 하나 더
        LayoutMngSearchRequest byHeader = new LayoutMngSearchRequest();
        byHeader.setHeaderLayoutId(m.l110());
        byHeader.setLimit(1);
        Map<String, Object> out = layoutService.search(byHeader);
        assertEquals(rows(out, "layouts").size(), ((Number) out.get("totalCount")).intValue());
        assertEquals(false, out.get("truncated"));

        LayoutMngSearchRequest options = new LayoutMngSearchRequest();
        options.setOptionsOnly(true);
        options.setLimit(1);
        Map<String, Object> o = layoutService.search(options);
        assertTrue(rows(o, "layouts").isEmpty());
        assertNull(o.get("totalCount"));
    }

    @Test
    void layoutMng_헤더_추가_팝업은_withoutItems_로_항목을_빼고_headerLayoutId_로_한_건의_항목을_받는다() {
        M201 m = m201();
        LayoutMngSearchRequest light = new LayoutMngSearchRequest();
        light.setTarget("HEADER");
        light.setWithoutItems(true);
        List<Map<String, Object>> picks = rows(layoutService.search(light), "headers");
        assertTrue(picks.size() >= 2);
        picks.forEach(p -> assertFalse(p.containsKey("items"), "항목은 빠진다"));
        Map<String, Object> l110 = picks.stream().filter(p -> ((Number) p.get("LAYOUT_ID")).longValue() == m.l110()).findFirst().orElseThrow();
        assertEquals(30, l110.get("TOTAL_LENGTH"));
        assertNotNullEai(l110, picks, m);

        // 행을 고를 때 — 그 헤더 한 건과 항목
        LayoutMngSearchRequest one = new LayoutMngSearchRequest();
        one.setTarget("HEADER");
        one.setHeaderLayoutId(m.l110());
        List<Map<String, Object>> detail = rows(layoutService.search(one), "headers");
        assertEquals(1, detail.size());
        assertEquals(6, ((List<?>) detail.get(0).get("items")).size());
        assertEquals(30, detail.get(0).get("TOTAL_LENGTH"));

        // 옵션 없이 부르면 예전처럼 모든 헤더에 항목이 실린다
        List<Map<String, Object>> legacy = rows(layoutService.search(headersOnly()), "headers");
        assertEquals(picks.size(), legacy.size());
        legacy.forEach(p -> assertTrue(p.containsKey("items")));
    }

    private static LayoutMngSearchRequest headersOnly() {
        LayoutMngSearchRequest r = new LayoutMngSearchRequest();
        r.setTarget("HEADER");
        return r;
    }

    private void assertNotNullEai(Map<String, Object> l110, List<Map<String, Object>> picks, M201 m) {
        Map<String, Object> l100 = picks.stream().filter(p -> ((Number) p.get("LAYOUT_ID")).longValue() == m.l100()).findFirst().orElseThrow();
        assertEquals(m.eai(), l100.get("EAI_CODE"));
    }
}
