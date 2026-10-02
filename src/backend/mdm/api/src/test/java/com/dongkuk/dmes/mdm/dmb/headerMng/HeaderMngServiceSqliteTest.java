package com.dongkuk.dmes.mdm.dmb.headerMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layout.LayoutComposer;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngViewRequest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-02 design.md §3.2 — 헤더 저장·EAI(불변 I2·I3·I5·I6·I12·I16·I23). D-144 3단계: 저장은 내 DRAFT 에만 쓰고 사용 전문을 다시
 * 계산하지 않는다(I18 폐지 — 부정 시험은 {@code LayoutDraftSaveSqliteTest}, 재정의 물리명 짝은 {@code LayoutComposerSqliteTest}).
 * EAI 표준 헤더 연결은 버전 행 EAI_CODE 에만 담기고, 표준 헤더는 시각 T 에 RELEASED 인 헤더 버전으로 해석한다(Ruling P3-15).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class HeaderMngServiceSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    LayoutComposer composer;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private HeaderMngViewRequest viewReq(long id) {
        HeaderMngViewRequest r = new HeaderMngViewRequest();
        r.setLayoutId(id);
        return r;
    }

    /** 저장된 헤더를 같은 이름·EAI 없이 내 DRAFT 에 다시 저장하는 요청(ver·rowVersion 포함). DRAFT 가 없으면 2.000 을 만든다. */
    private HeaderMngSaveRequest resave(long id) {
        String ver = draftVer(id);
        if (ver == null) {
            ver = "2.000";
            newDraft(id, "1.000", ver);
        }
        String draft = ver;
        return headerReq((String) layoutRow(id).get("LAYOUT_NAME"), r -> {
            r.setLayoutId(id);
            r.setVer(draft);
            r.setRowVersion(rowVersion(id, draft));
        });
    }

    private int ownLength(long id, String ver) {
        return jdbc.queryForObject("SELECT OWN_LENGTH FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = ?", Integer.class, id,
                new java.math.BigDecimal(ver));
    }

    @Test
    void optionsOnly_는_헤더_목록을_비우고_EAI_콤보만_돌려준다() {
        String eai = uniq("G");
        saveL100(eai);
        HeaderMngSearchRequest q = new HeaderMngSearchRequest();
        q.setOptionsOnly(true);

        Map<String, Object> out = headerService.search(q);

        assertEquals(List.of(), out.get("headers"));
        assertTrue(((List<?>) out.get("eais")).stream().anyMatch(e -> eai.equals(((Map<?, ?>) e).get("EAI_CODE"))
                || eai.equals(((Map<?, ?>) e).get("eaiCode"))));
    }

    @Test
    void L100_을_저장하면_총_길이_100과_헤더_내부_오프셋을_저장한다() {
        long l100 = saveL100(uniq("G"));
        Map<String, Object> row = layoutRow(l100);
        assertEquals(100, ownLength(l100, "1.000"));
        assertEquals("HEADER", row.get("LAYOUT_KIND"));
        List<Map<String, Object>> items = itemRows(l100, "1");
        assertEquals(List.of(0, 8, 12, 15, 19, 22, 36, 50, 62, 63, 68, 69, 75), column(items, "OFFSET"));
        assertEquals(List.of(8, 4, 3, 4, 3, 14, 14, 12, 1, 5, 1, 6, 25), column(items, "LENGTH"));
        assertEquals(List.of(1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13), column(items, "SEQ"));
        Map<String, Object> sndFac = items.get(1);
        assertEquals("SND_FAC_TP", sndFac.get("COLUMN_PHYS"));
        assertEquals(8, ((Number) sndFac.get("OFFSET")).intValue());
        assertEquals(4, ((Number) sndFac.get("LENGTH")).intValue());
    }

    @Test
    void L110_Length_항목은_헤더_안_오프셋_6_길이_5다() {
        long l110 = saveL110();
        List<Map<String, Object>> items = itemRows(l110, "1");
        assertEquals(List.of(0, 2, 6, 11, 19, 25), column(items, "OFFSET"));
        assertEquals("LENGTH", items.get(2).get("COLUMN_PHYS"));
        assertEquals(6, ((Number) items.get(2).get("OFFSET")).intValue());
        assertEquals(5, ((Number) items.get(2).get("LENGTH")).intValue());
        assertEquals(30, ownLength(l110, "1.000"));
    }

    @Test
    void 화면이_보낸_OFFSET_LENGTH_는_무시하고_다시_계산한다() {
        List<Map<String, Object>> items = l110Items();
        for (Map<String, Object> m : items) {
            m.put("OFFSET", 999);
            m.put("LENGTH", 999);
        }
        long id = saveHeader(headerReq(uniq("L2 구간 헤더 "), r -> {}), items);
        assertEquals(List.of(2, 4, 5, 8, 6, 5), column(itemRows(id, "1"), "LENGTH"));
        assertEquals(30, ownLength(id, "1.000"));
    }

    /** 시각 T 의 EAI 표준 헤더(Ruling P3-15) — 없으면 null. */
    private Long standardHeader(String eai, String t) {
        return composer.eaiHeaderAt(eai, LocalDateTime.parse(t.replace(' ', 'T'))).orElse(null);
    }

    @Test
    void EAI_를_함께_저장하면_버전_행에만_담기고_확정_시각부터_그_EAI_의_표준_헤더가_된다() {
        String eai = uniq("G");
        long l100 = saveHeader(headerReq(uniq("GLUE 공통 헤더 "), r -> {
            r.setEaiCode(eai);
            r.setEaiName("GLUE " + eai);
            r.setEncoding("EUC-KR");
            r.setPadRule("숫자 왼쪽 0, 문자 오른쪽 공백");
        }), l100Items());
        Map<String, Object> e = jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai);
        assertNull(e.get("HEADER_LAYOUT_ID"), "새 EAI 는 연결 없이 등록 — 옛 칼럼은 쓰지 않는다");
        assertEquals("EUC-KR", e.get("ENCODING"));
        assertEquals("숫자 왼쪽 0, 문자 오른쪽 공백", e.get("PAD_RULE"));
        assertEquals(eai, jdbc.queryForObject("SELECT EAI_CODE FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1", String.class, l100));
        assertNull(standardHeader(eai, "2026-06-15 09:00:00"), "DRAFT 는 표준 헤더가 아니다");
        release(l100, "1.000", HEADER_FROM);
        assertEquals(l100, standardHeader(eai, "2026-06-15 09:00:00"));
        assertNull(standardHeader(eai, "2025-12-31 23:59:59"), "확정 시각 전에는 표준 헤더가 없다");

        // 다른 헤더가 같은 EAI 를 원하면 버전 행에만 담기고(DRAFT 동안 표준 헤더는 그대로), 확정 시각부터 새 헤더가 표준 헤더다.
        // 그 EAI 를 쓰는 전문이 없으면(헤더 버전 행만 가리키면) 인코딩·이름을 바꿀 수 있다
        long other = saveHeader(headerReq(uniq("다른 헤더 "), r -> {
            r.setEaiCode(eai);
            r.setEaiName("GLUE 변경");
            r.setEncoding("UTF-8");
        }), l110Items());
        e = jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai);
        assertEquals("UTF-8", e.get("ENCODING"));
        assertEquals("GLUE 변경", e.get("EAI_NAME"));
        assertEquals(l100, standardHeader(eai, "2026-06-15 09:00:00"));
        release(other, "1.000", "2026-02-01 00:00:00");
        assertEquals(l100, standardHeader(eai, "2026-01-31 23:59:59"));
        assertEquals(other, standardHeader(eai, "2026-02-01 00:00:00"), "나중에 전환한 헤더가 이긴다");

        // EAI 를 뺀 새 버전을 확정하면 그 시각부터 주장이 없어져, 아직 주장하는 앞 헤더(L100)가 다시 표준 헤더다(검토 ③)
        headerService.save(resave(other), l110Items());
        assertEquals(other, standardHeader(eai, "2026-06-15 09:00:00"), "DRAFT 저장은 표준 헤더를 바꾸지 않는다");
        release(other, "2.000", "2026-03-01 00:00:00");
        assertEquals(other, standardHeader(eai, "2026-02-28 23:59:59"));
        assertEquals(l100, standardHeader(eai, "2026-03-01 00:00:00"));
        assertNull(jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai).get("HEADER_LAYOUT_ID"), "옛 칼럼은 끝까지 비어 있다");
    }

    @Test
    void L01_컬럼_사전에_없는_컬럼은_헤더_항목으로_저장하지_않는다() {
        String name = uniq("사전 밖 헤더 ");
        List<Map<String, Object>> items = l110Items();
        items.add(item("DATA", "NOPE_X", null));
        BusinessException ex = rejected(() -> headerService.save(headerReq(name, r -> {}), items));
        assertTrue(ex.getMessage().startsWith("헤더 저장 거부: L01"), ex.getMessage());
        assertTrue(ex.getMessage().contains("NOPE_X"), ex.getMessage());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = ?", Integer.class, name));
    }

    @Test
    void L02_FILLER_에_기본값이_있으면_거부한다() {
        List<Map<String, Object>> items = l110Items();
        items.get(5).put("DEFAULT_VALUE", "X");
        BusinessException ex = rejected(() -> headerService.save(headerReq(uniq("H "), r -> {}), items));
        assertTrue(ex.getMessage().startsWith("헤더 저장 거부: L02[6]"), ex.getMessage());
    }

    @Test
    void L02_DATA_에_FILLER_길이가_있으면_거부한다() {
        List<Map<String, Object>> items = l110Items();
        Map<String, Object> data = item("DATA", "EXTRA_3", null);
        data.put("FILLER_LENGTH", 3);
        items.add(data);
        BusinessException ex = rejected(() -> headerService.save(headerReq(uniq("H "), r -> {}), items));
        assertTrue(ex.getMessage().startsWith("헤더 저장 거부: L02[7]"), ex.getMessage());
        assertTrue(ex.getMessage().contains("FILLER_LENGTH"), ex.getMessage());
    }

    @Test
    @SuppressWarnings("unchecked")
    void view_는_항목_파생값과_사용_전문을_돌려준다() {
        M201 m = m201();
        Map<String, Object> out = headerService.view(viewReq(m.l100()));
        Map<String, Object> header = (Map<String, Object>) out.get("header");
        assertEquals(m.eai(), header.get("EAI_CODE"));
        assertEquals("EUC-KR", header.get("ENCODING"));
        assertEquals(100, header.get("TOTAL_LENGTH"));
        List<Map<String, Object>> items = (List<Map<String, Object>>) out.get("items");
        assertEquals(13, items.size());
        Map<String, Object> tc = items.get(0);
        assertEquals("트랜잭션 코드", tc.get("DISPLAY_NAME"));
        assertEquals(8, tc.get("DOMAIN_LENGTH"));
        assertEquals("STRING", tc.get("DATA_TYPE"));
        assertEquals("도메인 T_STR_8", tc.get("DOMAIN_NAME"));
        assertEquals(0, tc.get("OFFSET"));
        assertEquals(8, tc.get("LENGTH"));
        List<Map<String, Object>> usedBy = (List<Map<String, Object>>) out.get("usedBy");
        assertEquals(1, usedBy.size());
        assertEquals(m.message(), ((Number) usedBy.get(0).get("LAYOUT_ID")).longValue());
        assertEquals(1, usedBy.get(0).get("HEADER_SEQ"));
        assertEquals(187, usedBy.get(0).get("TOTAL_LENGTH"));
        assertEquals("1.000", usedBy.get(0).get("VER"));
        assertEquals("CURRENT", usedBy.get(0).get("STATE"));
        assertEquals("L2", usedBy.get(0).get("SND_SYSTEM"));
        assertFalse(((List<?>) out.get("units")).isEmpty());
        // 둘째로 쌓인 헤더도 같은 전문을 사용 전문으로 본다
        Map<String, Object> l110View = headerService.view(viewReq(m.l110()));
        assertEquals(2, ((List<Map<String, Object>>) l110View.get("usedBy")).get(0).get("HEADER_SEQ"));
    }

    @Test
    void view_는_전문_레이아웃을_열지_않는다() {
        M201 m = m201();
        BusinessException ex = rejected(() -> headerService.view(viewReq(m.message())));
        assertTrue(ex.getMessage().contains("L11"), ex.getMessage());
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_HEADER_는_길이_항목_수_사용_전문_수를_돌려준다() {
        M201 m = m201();
        HeaderMngSearchRequest r = new HeaderMngSearchRequest();
        r.setKeyword((String) layoutRow(m.l100()).get("LAYOUT_NAME"));
        Map<String, Object> out = headerService.search(r);
        List<Map<String, Object>> headers = (List<Map<String, Object>>) out.get("headers");
        assertEquals(1, headers.size());
        Map<String, Object> h = headers.get(0);
        assertEquals(m.l100(), ((Number) h.get("LAYOUT_ID")).longValue());
        assertEquals(100, h.get("TOTAL_LENGTH"));
        assertEquals(13, ((Number) h.get("ITEM_COUNT")).intValue());
        assertEquals(1, ((Number) h.get("USED_BY_COUNT")).intValue());
        assertEquals(m.eai(), h.get("EAI_CODE"));
        assertEquals("1.000", h.get("HEADER_VER"));
        assertEquals("CURRENT", h.get("HEADER_STATE"));
        assertTrue(((List<Map<String, Object>>) out.get("eais")).stream().anyMatch(e -> m.eai().equals(e.get("EAI_CODE"))));
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_COLUMN_은_물리명_논리명_표시명으로_찾는다() {
        HeaderMngSearchRequest r = new HeaderMngSearchRequest();
        r.setTarget("COLUMN");
        r.setKeyword("coil");
        List<Map<String, Object>> cols = (List<Map<String, Object>>) headerService.search(r).get("columns");
        List<Object> names = cols.stream().map(c -> c.get("PHYS_NAME")).toList();
        assertTrue(names.containsAll(List.of("COIL_ID", "COIL_THK")), names.toString());
        Map<String, Object> thk = cols.stream().filter(c -> "COIL_THK".equals(c.get("PHYS_NAME"))).findFirst().orElseThrow();
        assertEquals(3, thk.get("LENGTH"));
        assertEquals(1, thk.get("SCALE"));
        assertEquals("NUMBER", thk.get("DATA_TYPE"));
        // 논리명·표시명으로도 찾는다
        r.setKeyword("생산일");
        assertEquals(List.of("PROD_DT"), ((List<Map<String, Object>>) headerService.search(r).get("columns")).stream()
                .map(c -> c.get("PHYS_NAME")).toList());
        r.setKeyword("코일 ID");
        assertEquals("코일 ID", ((List<Map<String, Object>>) headerService.search(r).get("columns")).get(0).get("DISPLAY_NAME"));
        r.setKeyword("없는키워드");
        assertTrue(((List<?>) headerService.search(r).get("columns")).isEmpty());
    }

    @Test
    void 요청_rowVersion_이_DB_와_다르면_MDM001_로_거부한다() {
        long id = saveL110();
        HeaderMngSaveRequest r = resave(id);
        r.setRowVersion(r.getRowVersion() + 5);
        BusinessException ex = rejected(() -> headerService.save(r, l110Items()));
        assertTrue(ex.getMessage().contains("다른 사용자가 수정했습니다"), ex.getMessage());
    }

    // ── Task 5 검토 Minor-4 — 헤더 저장의 소유자(MDM003)·상태(MDM002) 거부. 거부되면 어떤 행도 바뀌지 않는다 ──

    private static String code(BusinessException e) {
        return e.getErrors() == null || e.getErrors().isEmpty() ? e.getErrorCode().name() : e.getErrors().get(0).code();
    }

    @Test
    void 남의_헤더_DRAFT_를_저장하면_MDM003_로_거부한다() {
        long id = saveL110();
        HeaderMngSaveRequest r = resave(id);
        List<Map<String, Object>> before = itemRows(id, r.getVer());
        user.set("lee", Set.of(MdmRoles.STEWARD, MdmRoles.STD_ADMIN));
        List<Map<String, Object>> items = l110Items();
        items.get(5).put("FILLER_LENGTH", 9);
        BusinessException ex = rejected(() -> headerService.save(r, items));
        assertEquals("MDM003", code(ex), ex.getMessage());
        assertEquals(before, itemRows(id, r.getVer()));
        assertEquals(0L, rowVersion(id, r.getVer()));
    }

    @Test
    void 확정된_헤더_버전을_저장하면_MDM002_로_거부한다() {
        long id = saveL110();
        List<Map<String, Object>> before = itemRows(id, "1.000");
        HeaderMngSaveRequest r = headerReq((String) layoutRow(id).get("LAYOUT_NAME"), q -> {
            q.setLayoutId(id);
            q.setVer("1.000");
            q.setRowVersion(rowVersion(id, "1.000"));
        });
        List<Map<String, Object>> items = l110Items();
        items.get(5).put("FILLER_LENGTH", 9);
        BusinessException ex = rejected(() -> headerService.save(r, items));
        assertEquals("MDM002", code(ex), ex.getMessage());
        assertEquals(before, itemRows(id, "1.000"));
        assertEquals("RELEASED", jdbc.queryForObject("SELECT STATUS FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ? AND VER = 1",
                String.class, id));
    }
}
