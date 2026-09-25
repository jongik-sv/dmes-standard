package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngViewRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-02 design.md §3.2 — 전문 저장: M201 재현(수용 기준 6), 헤더 잠김·상수 재정의(수용 기준 3), EAI 자동 부착, 거부 L01·L02·
 * L09·L10·L11(불변 I1·I3·I4·I5·I8·I9·I10·I14·I16·I17).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class LayoutMngServiceSqliteTest extends LayoutTestSupport {

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private LayoutMngViewRequest viewReq(long id) {
        LayoutMngViewRequest r = new LayoutMngViewRequest();
        r.setLayoutId(id);
        return r;
    }

    private LayoutMngSaveRequest resave(long id) {
        Map<String, Object> row = layoutRow(id);
        return layoutReq((String) row.get("LAYOUT_NAME"), (String) row.get("EAI_CODE"), r -> {
            r.setLayoutId(id);
            r.setVer(ver(row));
        });
    }

    private List<Map<String, Object>> stackRows(long messageId) {
        return jdbc.queryForList("SELECT SEQ, HEADER_LAYOUT_ID FROM TB_MDM_LAYOUT_HEADER WHERE LAYOUT_ID = ? ORDER BY SEQ", messageId);
    }

    private String rejectMessage(org.junit.jupiter.api.function.Executable call) {
        BusinessException ex = rejected(call);
        return ex.getMessage();
    }

    @Test
    @SuppressWarnings("unchecked")
    void M201_총_길이_187_본문_첫_오프셋_130_을_재현한다() {
        M201 m = m201();
        Map<String, Object> msg = layoutRow(m.message());
        assertEquals("MESSAGE", msg.get("LAYOUT_KIND"));
        assertEquals(187, ((Number) msg.get("TOTAL_LENGTH")).intValue());
        List<Map<String, Object>> body = itemRows(m.message());
        assertEquals(130, ((Number) body.get(0).get("OFFSET")).intValue());
        assertEquals(List.of(130, 150, 158, 162), column(body, "OFFSET"));
        assertEquals(List.of(20, 8, 4, 25), column(body, "LENGTH"));
        List<Map<String, Object>> stack = stackRows(m.message());
        assertEquals(2, stack.size());
        assertEquals(m.l100(), ((Number) stack.get(0).get("HEADER_LAYOUT_ID")).longValue());
        assertEquals(m.l110(), ((Number) stack.get(1).get("HEADER_LAYOUT_ID")).longValue());

        Map<String, Object> view = layoutService.view(viewReq(m.message()));
        Map<String, Object> layout = (Map<String, Object>) view.get("layout");
        assertEquals(130, layout.get("HEADER_LENGTH"));
        assertEquals(187, layout.get("TOTAL_LENGTH"));
        List<Map<String, Object>> headers = (List<Map<String, Object>>) view.get("headers");
        assertEquals(List.of(0, 100), headers.stream().map(h -> h.get("OFFSET")).toList());
        assertEquals(List.of(100, 30), headers.stream().map(h -> h.get("TOTAL_LENGTH")).toList());
        List<Map<String, Object>> l110Items = (List<Map<String, Object>>) headers.get(1).get("items");
        assertEquals(6, l110Items.get(2).get("OFFSET"), "헤더 항목 오프셋은 그 헤더 안 상대값(I2)");
    }

    @Test
    void EAI_를_고르면_그_EAI_표준_헤더를_1번으로_끼운다() {
        String eai = uniq("G");
        long l100 = saveL100(eai);
        long l110 = saveL110();
        long only = saveLayout(layoutReq(uniq("EAI 만 "), eai, r -> {}), List.of(), List.of(), m201Items());
        List<Map<String, Object>> stack = stackRows(only);
        assertEquals(1, stack.size());
        assertEquals(l100, ((Number) stack.get(0).get("HEADER_LAYOUT_ID")).longValue());
        assertEquals(157, ((Number) layoutRow(only).get("TOTAL_LENGTH")).intValue(), "03 원문 샘플(L110 제외) 157");
        // 이미 있으면 중복으로 넣지 않는다 — 순서도 그대로
        long both = saveLayout(layoutReq(uniq("EAI+L110 "), eai, r -> {}), List.of(headerRow(l100), headerRow(l110)), List.of(),
                m201Items());
        assertEquals(2, stackRows(both).size());
        long reversed = saveLayout(layoutReq(uniq("L110 먼저 "), eai, r -> {}), List.of(headerRow(l110), headerRow(l100)),
                List.of(), m201Items());
        List<Map<String, Object>> rs = stackRows(reversed);
        assertEquals(List.of(l110, l100), rs.stream().map(r -> ((Number) r.get("HEADER_LAYOUT_ID")).longValue()).toList());
        // EAI 가 없으면 끼우지 않는다
        long none = saveLayout(layoutReq(uniq("EAI 없음 "), null, r -> {}), List.of(headerRow(l110)), List.of(), m201Items());
        assertEquals(1, stackRows(none).size());
        assertEquals(30 + 57, ((Number) layoutRow(none).get("TOTAL_LENGTH")).intValue());
    }

    @Test
    void 전문_저장은_헤더_행을_바꾸지_않는다() {
        M201 m = m201();
        Map<String, Object> l100Before = layoutRow(m.l100());
        List<Map<String, Object>> l100ItemsBefore = itemRows(m.l100());
        Map<String, Object> l110Before = layoutRow(m.l110());
        List<Map<String, Object>> l110ItemsBefore = itemRows(m.l110());
        List<Map<String, Object>> items = m201Items();
        items.remove(3);
        saveLayout(resave(m.message()), List.of(headerRow(m.l110())), List.of(constRowFor(m.l100(), 2, "B1")), items);
        assertEquals(l100Before, layoutRow(m.l100()));
        assertEquals(l100ItemsBefore, itemRows(m.l100()));
        assertEquals(l110Before, layoutRow(m.l110()));
        assertEquals(l110ItemsBefore, itemRows(m.l110()));
        assertEquals(162, ((Number) layoutRow(m.message()).get("TOTAL_LENGTH")).intValue());
    }

    private static Map<String, Object> constRowFor(long header, int seq, String value) {
        return constRow(header, seq, value);
    }

    @Test
    @SuppressWarnings("unchecked")
    void 상수_재정의는_이_전문에만_보이고_헤더_기본값은_그대로다() {
        M201 a = m201(List.of(l100Const(2, "B1")));
        long b = saveLayout(layoutReq(uniq("전문 B "), a.eai(), r -> {}), List.of(headerRow(a.l110())), List.of(), m201Items());

        Map<String, Object> sndA = headerItem(layoutService.view(viewReq(a.message())), 0, "SND_FAC_TP");
        assertEquals("B1", sndA.get("EFFECTIVE_VALUE"));
        assertEquals("B0", sndA.get("DEFAULT_VALUE"));
        assertEquals("B1", sndA.get("OVERRIDE_VALUE"));

        Map<String, Object> sndB = headerItem(layoutService.view(viewReq(b)), 0, "SND_FAC_TP");
        assertEquals("B0", sndB.get("EFFECTIVE_VALUE"));
        assertNull(sndB.get("OVERRIDE_VALUE"));

        assertEquals("B0", itemRows(a.l100()).get(1).get("DEFAULT_VALUE"), "헤더 항목 기본값은 그대로(I8)");
        assertTrue(constRows(b).isEmpty());
        // 빈 재정의는 "재정의 없음" — 행을 남기지 않는다(I10)
        saveLayout(resave(b), List.of(headerRow(a.l110())), List.of(constRow(a.l100(), 2, "")), m201Items());
        assertTrue(constRows(b).isEmpty());
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> headerItem(Map<String, Object> view, int headerIndex, String phys) {
        List<Map<String, Object>> headers = (List<Map<String, Object>>) view.get("headers");
        List<Map<String, Object>> items = (List<Map<String, Object>>) headers.get(headerIndex).get("items");
        return items.stream().filter(i -> phys.equals(i.get("COLUMN_PHYS"))).findFirst().orElseThrow();
    }

    @Test
    void L10_AUTO_DATA_FILLER_항목은_재정의할_수_없다() {
        M201 m = m201();
        String auto = rejectMessage(() -> layoutService.save(resave(m.message()), List.of(headerRow(m.l110())),
                List.of(constRow(m.l100(), 1, "X")), m201Items()));
        assertTrue(auto.startsWith("전문 저장 거부: L10"), auto);
        String filler = rejectMessage(() -> layoutService.save(resave(m.message()), List.of(headerRow(m.l110())),
                List.of(constRow(m.l100(), 13, "X")), m201Items()));
        assertTrue(filler.startsWith("전문 저장 거부: L10"), filler);
        // DATA 항목이 있는 헤더
        List<Map<String, Object>> withData = new ArrayList<>(l110Items());
        withData.add(item("DATA", "EXTRA_3", null));
        long h = saveHeader(headerReq(uniq("DATA 헤더 "), r -> {}), numbered(withData));
        String data = rejectMessage(() -> layoutService.save(layoutReq(uniq("D "), null, r -> {}), List.of(headerRow(h)),
                List.of(constRow(h, 7, "X")), m201Items()));
        assertTrue(data.startsWith("전문 저장 거부: L10"), data);
        // 없는 항목 순번
        String missing = rejectMessage(() -> layoutService.save(resave(m.message()), List.of(headerRow(m.l110())),
                List.of(constRow(m.l100(), 99, "X")), m201Items()));
        assertTrue(missing.startsWith("전문 저장 거부: L10"), missing);
    }

    @Test
    void L10_이_전문에_쌓이지_않은_헤더의_상수는_재정의할_수_없다() {
        dictionary();
        long l100 = saveL100(uniq("G"));
        long l110 = saveL110();
        String name = uniq("L110 만 ");
        String msg = rejectMessage(() -> layoutService.save(layoutReq(name, null, r -> {}), List.of(headerRow(l110)),
                List.of(constRow(l100, 2, "B1")), m201Items()));
        assertTrue(msg.startsWith("전문 저장 거부: L10"), msg);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = ?", Integer.class, name));
    }

    @Test
    void L09_HEADER_가_아닌_레이아웃은_헤더로_쌓을_수_없다() {
        M201 m = m201();
        String msg = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> {}),
                List.of(headerRow(m.message())), List.of(), m201Items()));
        assertTrue(msg.startsWith("전문 저장 거부: L09"), msg);
        String missing = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> {}),
                List.of(headerRow(999_999L)), List.of(), m201Items()));
        assertTrue(missing.startsWith("전문 저장 거부: L09"), missing);
    }

    @Test
    void L09_같은_헤더를_두_번_쌓을_수_없다() {
        long l110 = saveL110();
        String msg = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> {}),
                List.of(headerRow(l110), headerRow(l110)), List.of(), m201Items()));
        assertTrue(msg.startsWith("전문 저장 거부: L09"), msg);
    }

    @Test
    void L01_컬럼_사전에_없는_본문_항목은_거부한다() {
        long l110 = saveL110();
        List<Map<String, Object>> items = m201Items();
        items.add(item("DATA", "NOPE_X", null));
        String name = uniq("사전 밖 ");
        String msg = rejectMessage(() -> layoutService.save(layoutReq(name, null, r -> {}), List.of(headerRow(l110)), List.of(),
                items));
        assertTrue(msg.startsWith("전문 저장 거부: L01[5]"), msg);
        assertTrue(msg.contains("NOPE_X"), msg);
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = ?", Integer.class, name));
    }

    @Test
    void L02_FILLER_에_컬럼을_넣으면_거부한다() {
        List<Map<String, Object>> items = m201Items();
        items.get(3).put("COLUMN_PHYS", "COIL_ID");
        String msg = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> {}), List.of(), List.of(), items));
        assertTrue(msg.startsWith("전문 저장 거부: L02[4]"), msg);
    }

    @Test
    void L11_송신_시스템이_없으면_거부한다() {
        String missing = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> r.setSndSystem(null)),
                List.of(), List.of(), m201Items()));
        assertTrue(missing.startsWith("전문 저장 거부: L11"), missing);
        String unknown = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), null, r -> r.setRcvSystem("NOPE")),
                List.of(), List.of(), m201Items()));
        assertTrue(unknown.startsWith("전문 저장 거부: L11"), unknown);
        String noEai = rejectMessage(() -> layoutService.save(layoutReq(uniq("X "), "NO_SUCH_EAI", r -> {}),
                List.of(), List.of(), m201Items()));
        assertTrue(noEai.startsWith("전문 저장 거부: L11"), noEai);
        String noName = rejectMessage(() -> layoutService.save(layoutReq(" ", null, r -> {}), List.of(), List.of(), m201Items()));
        assertTrue(noName.startsWith("전문 저장 거부: L11"), noName);
        long l110 = saveL110();
        LayoutMngSaveRequest onHeader = layoutReq("헤더를 전문으로", null, r -> {
            r.setLayoutId(l110);
            r.setVer(ver(layoutRow(l110)));
        });
        String kind = rejectMessage(() -> layoutService.save(onHeader, List.of(), List.of(), m201Items()));
        assertTrue(kind.startsWith("전문 저장 거부: L11"), kind);
    }

    @Test
    void 상속_도메인의_길이로_항목_길이를_파생한다() {
        long parent = domain(uniq("P_THK_"), "QTY", "NUMBER", 3, 1, null);
        long child = domain(uniq("C_THK_"), "QTY", "NUMBER", null, null, parent);
        String phys = uniq("CHILD_THK_");
        column(phys, "상속 두께 " + phys, null, child);
        long id = saveLayout(layoutReq(uniq("상속 "), null, r -> {}), List.of(), List.of(),
                numbered(new ArrayList<>(List.of(item("DATA", phys, null)))));
        assertEquals(List.of(3), column(itemRows(id), "LENGTH"));
        assertEquals(3, ((Number) layoutRow(id).get("TOTAL_LENGTH")).intValue());
    }

    @Test
    void 화면이_보낸_OFFSET_LENGTH_는_무시하고_다시_계산한다() {
        List<Map<String, Object>> items = m201Items();
        for (Map<String, Object> m : items) {
            m.put("OFFSET", 0);
            m.put("LENGTH", 999);
        }
        long id = saveLayout(layoutReq(uniq("길이 "), null, r -> {}), List.of(), List.of(), items);
        assertEquals(List.of(20, 8, 4, 25), column(itemRows(id), "LENGTH"));
        assertEquals(List.of(0, 20, 28, 32), column(itemRows(id), "OFFSET"));
    }

    @Test
    void 같은_내용을_두_번_저장해도_버전은_1이다() {
        // TSK-05-03 D4 — 05-02 의 "버전을 올리지 않는다"(I17)를 "스냅샷이 바뀔 때만 버전을 만든다"(05-03 I15)로 대체한다
        M201 m = m201();
        saveLayout(resave(m.message()), List.of(headerRow(m.l110())), List.of(), m201Items());
        saveLayout(resave(m.message()), List.of(headerRow(m.l110())), List.of(), m201Items());
        assertEquals(1L, ((Number) layoutRow(m.message()).get("VERSION")).longValue());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT_VER WHERE LAYOUT_ID = ?", Integer.class, m.message()));
    }

    @Test
    @SuppressWarnings("unchecked")
    void view_는_헤더별_항목과_실효값을_돌려준다() {
        M201 m = m201(List.of(l100Const(2, "B1")));
        Map<String, Object> view = layoutService.view(viewReq(m.message()));
        List<Map<String, Object>> headers = (List<Map<String, Object>>) view.get("headers");
        assertEquals(2, headers.size());
        assertEquals(1, headers.get(0).get("SEQ"));
        assertEquals(m.l100(), ((Number) headers.get(0).get("HEADER_LAYOUT_ID")).longValue());
        Map<String, Object> tc = headerItem(view, 0, "TC_CD");
        assertEquals("(송신 시 채움: LAYOUT_ID)", tc.get("EFFECTIVE_VALUE"));
        Map<String, Object> eaiIf = headerItem(view, 0, "EAI_IF_ID");
        assertNull(eaiIf.get("EFFECTIVE_VALUE"));
        Map<String, Object> sndProc = headerItem(view, 0, "SND_PROC_TP");
        assertEquals("L2", sndProc.get("EFFECTIVE_VALUE"));
        List<Map<String, Object>> body = (List<Map<String, Object>>) view.get("items");
        assertEquals(List.of(130, 150, 158, 162), body.stream().map(b -> b.get("OFFSET")).toList());
        assertEquals("SIGN=N;ZERO=Y;SCALE=1;WIDTH=4", body.get(2).get("NUM_FORMAT"));
        assertEquals(3, body.get(2).get("DOMAIN_LENGTH"));
        assertEquals(1, body.get(2).get("SCALE"));
        assertFalse(((List<?>) view.get("units")).isEmpty());
    }

    @Test
    @SuppressWarnings("unchecked")
    void search_는_헤더_요약과_총_길이를_돌려준다() {
        M201 m = m201();
        LayoutMngSearchRequest r = new LayoutMngSearchRequest();
        r.setKeyword((String) layoutRow(m.message()).get("LAYOUT_NAME"));
        Map<String, Object> out = layoutService.search(r);
        List<Map<String, Object>> layouts = (List<Map<String, Object>>) out.get("layouts");
        assertEquals(1, layouts.size());
        Map<String, Object> row = layouts.get(0);
        String l100Name = (String) layoutRow(m.l100()).get("LAYOUT_NAME");
        String l110Name = (String) layoutRow(m.l110()).get("LAYOUT_NAME");
        assertEquals(l100Name + " (100) + " + l110Name + " (30)", row.get("HEADER_SUMMARY"));
        assertEquals(187, row.get("TOTAL_LENGTH"));
        assertEquals(4, ((Number) row.get("ITEM_COUNT")).intValue());
        assertEquals(1L, ((Number) row.get("LAYOUT_VERSION")).longValue(), "저장 즉시 버전 1(TSK-05-03 D4)");
        assertTrue(((List<Map<String, Object>>) out.get("systems")).stream().anyMatch(s -> "L2".equals(s.get("SYSTEM_CODE"))));
        assertTrue(((List<Map<String, Object>>) out.get("headers")).stream()
                .anyMatch(h -> ((Number) h.get("LAYOUT_ID")).longValue() == m.l110()));
        // 조건: 헤더·송신·수신
        LayoutMngSearchRequest byHeader = new LayoutMngSearchRequest();
        byHeader.setHeaderLayoutId(m.l110());
        byHeader.setSndSystem("L2");
        byHeader.setRcvSystem("MES");
        assertEquals(1, ((List<?>) layoutService.search(byHeader).get("layouts")).size());
        byHeader.setRcvSystem("ERP");
        assertTrue(((List<?>) layoutService.search(byHeader).get("layouts")).isEmpty());
        // target=HEADER · COLUMN
        LayoutMngSearchRequest headersOnly = new LayoutMngSearchRequest();
        headersOnly.setTarget("HEADER");
        headersOnly.setKeyword(l110Name);
        List<Map<String, Object>> picked = (List<Map<String, Object>>) layoutService.search(headersOnly).get("headers");
        assertEquals(1, picked.size());
        // 헤더 추가 팝업은 저장 전 전문에서도 상수 편집을 열 수 있게 헤더 항목(기본값)을 함께 받는다(Build 이탈 B1)
        List<Map<String, Object>> pickedItems = (List<Map<String, Object>>) picked.get(0).get("items");
        assertEquals(6, pickedItems.size());
        assertEquals("B1", pickedItems.get(0).get("DEFAULT_VALUE"));
        assertEquals("CONST", pickedItems.get(0).get("FILL_KIND"));
        LayoutMngSearchRequest cols = new LayoutMngSearchRequest();
        cols.setTarget("COLUMN");
        cols.setKeyword("COIL_THK");
        assertEquals("COIL_THK", ((List<Map<String, Object>>) layoutService.search(cols).get("columns")).get(0).get("PHYS_NAME"));
    }

    @Test
    void 요청_ver_가_DB_VER_와_다르면_MDM001_로_거부한다() {
        M201 m = m201();
        LayoutMngSaveRequest r = resave(m.message());
        r.setVer(r.getVer() - 1);
        String msg = rejectMessage(() -> layoutService.save(r, List.of(headerRow(m.l110())), List.of(), m201Items()));
        assertTrue(msg.contains("다른 사용자가 수정했습니다"), msg);
    }
}
