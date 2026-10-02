package com.dongkuk.dmes.mdm.dmb.headerMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.metarev.MetaRevTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.headerMng.dto.HeaderMngViewRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-02 design.md §3.2 — 헤더 저장·EAI·사용 전문 재계산·재정의 재짝짓기(불변 I2·I3·I5·I6·I12·I13·I16·I17·I23).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class HeaderMngServiceSqliteTest extends LayoutTestSupport {

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private HeaderMngViewRequest viewReq(long id) {
        HeaderMngViewRequest r = new HeaderMngViewRequest();
        r.setLayoutId(id);
        return r;
    }

    /** 저장된 헤더를 같은 이름·EAI 없이 다시 저장하는 요청(ver 포함). */
    private HeaderMngSaveRequest resave(long id) {
        Map<String, Object> row = layoutRow(id);
        return headerReq((String) row.get("LAYOUT_NAME"), r -> {
            r.setLayoutId(id);
            r.setVer(ver(row));
        });
    }

    private HeaderMngSaveRequest resaveWithEai(long id, String eai) {
        HeaderMngSaveRequest r = resave(id);
        r.setEaiCode(eai);
        r.setEaiName("GLUE " + eai);
        r.setEncoding("EUC-KR");
        return r;
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
        assertEquals(100, ((Number) row.get("TOTAL_LENGTH")).intValue());
        assertEquals("HEADER", row.get("LAYOUT_KIND"));
        List<Map<String, Object>> items = itemRows(l100);
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
        List<Map<String, Object>> items = itemRows(l110);
        assertEquals(List.of(0, 2, 6, 11, 19, 25), column(items, "OFFSET"));
        assertEquals("LENGTH", items.get(2).get("COLUMN_PHYS"));
        assertEquals(6, ((Number) items.get(2).get("OFFSET")).intValue());
        assertEquals(5, ((Number) items.get(2).get("LENGTH")).intValue());
        assertEquals(30, ((Number) layoutRow(l110).get("TOTAL_LENGTH")).intValue());
    }

    @Test
    void 화면이_보낸_OFFSET_LENGTH_는_무시하고_다시_계산한다() {
        List<Map<String, Object>> items = l110Items();
        for (Map<String, Object> m : items) {
            m.put("OFFSET", 999);
            m.put("LENGTH", 999);
        }
        long id = saveHeader(headerReq(uniq("L2 구간 헤더 "), r -> {}), items);
        assertEquals(List.of(2, 4, 5, 8, 6, 5), column(itemRows(id), "LENGTH"));
        assertEquals(30, ((Number) layoutRow(id).get("TOTAL_LENGTH")).intValue());
    }

    @Test
    void EAI_를_함께_저장하면_그_EAI_의_표준_헤더가_된다() {
        String eai = uniq("G");
        long l100 = saveL100(eai);
        Map<String, Object> e = jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai);
        assertEquals(l100, ((Number) e.get("HEADER_LAYOUT_ID")).longValue());
        assertEquals("EUC-KR", e.get("ENCODING"));
        assertEquals("숫자 왼쪽 0, 문자 오른쪽 공백", e.get("PAD_RULE"));

        // 다른 헤더에 EAI 를 옮기면 EAI 는 새 헤더를 가리킨다
        long other = saveHeader(headerReq(uniq("다른 헤더 "), r -> {
            r.setEaiCode(eai);
            r.setEaiName("GLUE 변경");
            r.setEncoding("UTF-8");
        }), l110Items());
        e = jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai);
        assertEquals(other, ((Number) e.get("HEADER_LAYOUT_ID")).longValue());
        assertEquals("UTF-8", e.get("ENCODING"));
        assertEquals("GLUE 변경", e.get("EAI_NAME"));

        // EAI 를 빼고 저장하면 그 헤더를 가리키던 EAI 가 비워진다
        headerService.save(resave(other), l110Items());
        e = jdbc.queryForMap("SELECT * FROM TB_MDM_EAI WHERE EAI_CODE = ?", eai);
        assertNull(e.get("HEADER_LAYOUT_ID"));
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
    void 헤더_길이가_바뀌면_그_헤더를_쌓은_전문의_오프셋과_총_길이를_다시_계산한다() {
        M201 m = m201();
        assertEquals(187, ((Number) layoutRow(m.message()).get("TOTAL_LENGTH")).intValue());
        long msgVerBefore = ver(layoutRow(m.message()));
        List<Map<String, Object>> items = l110Items();
        items.add(item("DATA", "EXTRA_3", null));
        Map<String, Object> out = headerService.save(resave(m.l110()), numbered(items));
        assertEquals(33, ((Number) out.get("totalLength")).intValue());
        Map<String, Object> msg = layoutRow(m.message());
        assertEquals(190, ((Number) msg.get("TOTAL_LENGTH")).intValue());
        assertEquals(List.of(133, 153, 161, 165), column(itemRows(m.message()), "OFFSET"));
        assertEquals(List.of(20, 8, 4, 25), column(itemRows(m.message()), "LENGTH"));
        assertEquals(2L, ((Number) msg.get("VERSION")).longValue(), "M201 저장 v1 → 헤더 변경으로 v2(TSK-05-03 D4)");
        List<Map<String, Object>> versioned = (List<Map<String, Object>>) out.get("versioned");
        assertEquals(1, versioned.size());
        assertEquals(m.message(), ((Number) versioned.get(0).get("LAYOUT_ID")).longValue());
        assertEquals("SIMULTANEOUS", versioned.get(0).get("SWITCH_MODE"));
        assertTrue(ver(msg) > msgVerBefore, "감사 VER 는 오른다 — 화면을 띄워 둔 사용자는 다음 저장에서 MDM001");
        List<Map<String, Object>> recalculated = (List<Map<String, Object>>) out.get("recalculated");
        assertEquals(1, recalculated.size());
        assertEquals(m.message(), ((Number) recalculated.get(0).get("LAYOUT_ID")).longValue());
        assertEquals(187, recalculated.get(0).get("TOTAL_LENGTH_BEFORE"));
        assertEquals(190, recalculated.get(0).get("TOTAL_LENGTH_AFTER"));
    }

    @Test
    void 헤더_항목_순서가_바뀌면_재정의를_물리명으로_다시_짝짓는다() {
        M201 m = m201(List.of(l100Const(2, "B1")));
        assertEquals(1, constRows(m.message()).size());
        List<Map<String, Object>> items = new ArrayList<>(l100Items());
        Map<String, Object> sndFac = items.remove(1);
        items.add(0, sndFac);
        Map<String, Object> out = headerService.save(resaveWithEai(m.l100(), m.eai()), numbered(items));
        List<Map<String, Object>> consts = constRows(m.message());
        assertEquals(1, consts.size());
        assertEquals(1, ((Number) consts.get(0).get("HEADER_SEQ")).intValue());
        assertEquals("B1", consts.get(0).get("CONST_VALUE"));
        assertEquals("SND_FAC_TP", itemRows(m.l100()).get(0).get("COLUMN_PHYS"));
        assertEquals(0, ((Number) out.get("droppedOverrides")).intValue());
    }

    @Test
    void 재정의된_항목이_빠지거나_CONST_가_아니게_되면_재정의를_지운다() {
        M201 m = m201(List.of(l100Const(2, "B1"), l100Const(3, "L3")));
        assertEquals(2, constRows(m.message()).size());
        // SND_FAC_TP 를 뺀다
        List<Map<String, Object>> items = new ArrayList<>(l100Items());
        items.remove(1);
        Map<String, Object> out = headerService.save(resaveWithEai(m.l100(), m.eai()), numbered(items));
        assertEquals(1, ((Number) out.get("droppedOverrides")).intValue());
        List<Map<String, Object>> consts = constRows(m.message());
        assertEquals(1, consts.size());
        assertEquals("L3", consts.get(0).get("CONST_VALUE"));
        assertEquals(2, ((Number) consts.get(0).get("HEADER_SEQ")).intValue(), "SND_PROC_TP 가 2번으로 당겨졌다");
        // SND_PROC_TP 를 DATA 로 바꾼다
        items.set(1, item("DATA", "SND_PROC_TP", null));
        out = headerService.save(resaveWithEai(m.l100(), m.eai()), numbered(items));
        assertEquals(1, ((Number) out.get("droppedOverrides")).intValue());
        assertEquals(0, constRows(m.message()).size());
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
    void 요청_ver_가_DB_VER_와_다르면_MDM001_로_거부한다() {
        long id = saveL110();
        HeaderMngSaveRequest r = resave(id);
        r.setVer(r.getVer() + 5);
        BusinessException ex = rejected(() -> headerService.save(r, l110Items()));
        assertTrue(ex.getMessage().contains("다른 사용자가 수정했습니다"), ex.getMessage());
    }

    @Test
    void META_헤더_저장은_헤더와_그_헤더를_쌓은_전문을_모두_기록한다() {
        M201 m = m201();
        MetaRevTestSupport.clear(jdbc);

        headerService.save(resave(m.l110()), l110Items());

        assertEquals(Set.of(String.valueOf(m.l110()), String.valueOf(m.message())), MetaRevTestSupport.keys(jdbc, "LAYOUT"));
    }
}
