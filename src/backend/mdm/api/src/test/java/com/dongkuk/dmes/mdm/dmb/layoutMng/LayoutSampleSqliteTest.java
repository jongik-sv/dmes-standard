package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dmb.LayoutTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngExecuteRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-03 design.md §3.2 — 샘플 전문 렌더(action {@code execute}). 서버 직렬화기로 인코딩 바이트 기준 한 줄을 만든다(D13, 불변 I2·I6).
 * 쓰지 않는다(I20).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class LayoutSampleSqliteTest extends LayoutTestSupport {

    @BeforeEach
    void setUp() {
        dictionary();
    }

    private static LayoutMngExecuteRequest req(String name, String eai, Long layoutId) {
        LayoutMngExecuteRequest r = new LayoutMngExecuteRequest();
        r.setLayoutId(layoutId);
        r.setLayoutName(name);
        r.setEaiCode(eai);
        r.setSndSystem("L2");
        r.setRcvSystem("MES");
        r.setSendTime("20260922143015");
        r.setSeq(1L);
        return r;
    }

    private static List<Map<String, Object>> samples(String coilId) {
        return List.of(sample("COIL_ID", coilId), sample("PROD_DT", "20260922"), sample("COIL_THK", "3.5"));
    }

    private Map<String, Object> execute(M201 m, String coilId) {
        return layoutService.execute(req((String) layoutRow(m.message()).get("LAYOUT_NAME"), m.eai(), m.message()),
                List.of(headerRow(m.l110())), List.of(), m201Items(), samples(coilId));
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> segments(Map<String, Object> out) {
        return (List<Map<String, Object>>) out.get("segments");
    }

    private static Map<String, Object> seg(Map<String, Object> out, String phys) {
        return segments(out).stream().filter(s -> phys.equals(s.get("COLUMN_PHYS")) && "BODY".equals(s.get("ZONE"))).findFirst()
                .orElseThrow();
    }

    @Test
    void execute_는_M201_을_EUC_KR_187바이트_한_줄로_렌더한다() {
        Map<String, Object> out = execute(m201(), "C26A0012345");
        assertEquals(187, out.get("totalBytes"));
        assertEquals("EUC-KR", out.get("encoding"));
        List<Map<String, Object>> segs = segments(out);
        assertEquals(23, segs.size());
        Map<String, Object> thk = seg(out, "COIL_THK");
        assertEquals(158, thk.get("OFFSET"));
        assertEquals(4, thk.get("LENGTH"));
        assertEquals("159-162", thk.get("POSITION"));
        assertEquals("0035", thk.get("TEXT"));
        assertEquals("BODY", thk.get("ZONE"));
        assertEquals("HEADER", segs.get(0).get("ZONE"));
        assertEquals(1, segs.get(0).get("HEADER_SEQ"));
        assertEquals("1-8", segs.get(0).get("POSITION"));
        assertTrue(segs.stream().anyMatch(s -> "FILLER".equals(s.get("FILL_KIND")) && "BODY".equals(s.get("ZONE"))));
        assertEquals("000187", segs.stream().filter(s -> "SNT_LTH".equals(s.get("COLUMN_PHYS"))).findFirst().orElseThrow().get("TEXT"));
        assertEquals("코일 ID", seg(out, "COIL_ID").get("NAME"));
        assertTrue(((String) out.get("line")).contains("0035"));
        assertTrue(((List<?>) out.get("errors")).isEmpty());
    }

    @Test
    void execute_는_한글_값을_인코딩_바이트로_센다() {
        Map<String, Object> euc = execute(m201(), "코일");
        Map<String, Object> coil = seg(euc, "COIL_ID");
        assertEquals(20, coil.get("LENGTH"));
        assertEquals("코일" + " ".repeat(16), coil.get("TEXT"));
        assertEquals(150, seg(euc, "PROD_DT").get("OFFSET"));
        assertEquals(187, euc.get("totalBytes"));

        // UTF-8 EAI — 같은 헤더 모양을 UTF-8 로
        String eai = uniq("U");
        long l100 = saveHeader(headerReq(uniq("UTF 공통 헤더 "), r -> {
            r.setEaiCode(eai);
            r.setEaiName("UTF " + eai);
            r.setEncoding("UTF-8");
        }), l100Items());
        long l110 = saveL110();
        long msg = saveLayout(layoutReq(uniq("UTF 전문 "), eai, r -> {}), List.of(headerRow(l110)), List.of(), m201Items());
        Map<String, Object> utf = execute(new M201(eai, l100, l110, msg), "코일");
        assertEquals("UTF-8", utf.get("encoding"));
        assertEquals("코일" + " ".repeat(14), seg(utf, "COIL_ID").get("TEXT"));
        assertEquals(150, seg(utf, "PROD_DT").get("OFFSET"));
        assertEquals(187, utf.get("totalBytes"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void execute_는_파싱_결과를_함께_돌려준다() {
        Map<String, Object> out = execute(m201(), "C26A0012345");
        List<Map<String, Object>> parsed = (List<Map<String, Object>>) out.get("parsed");
        Map<String, Object> thk = parsed.stream().filter(p -> "COIL_THK".equals(p.get("COLUMN_PHYS"))).findFirst().orElseThrow();
        assertEquals("3.5", thk.get("VALUE"));
        assertEquals("C26A0012345", parsed.get(0).get("VALUE"));
    }

    @Test
    @SuppressWarnings("unchecked")
    void execute_는_넘치는_값을_항목_오류로_돌려준다() {
        Map<String, Object> out = execute(m201(), "C".repeat(21));
        List<Map<String, Object>> errors = (List<Map<String, Object>>) out.get("errors");
        assertEquals(1, errors.size());
        assertEquals("COIL_ID", errors.get(0).get("COLUMN_PHYS"));
        assertEquals(187, out.get("totalBytes"));
        assertEquals("#".repeat(20), seg(out, "COIL_ID").get("TEXT"));
        assertEquals("0035", seg(out, "COIL_THK").get("TEXT"), "렌더는 멈추지 않는다");
    }

    @Test
    @SuppressWarnings("unchecked")
    void execute_는_초안_이슈가_있으면_렌더하지_않는다() {
        M201 m = m201();
        List<Map<String, Object>> items = new ArrayList<>(m201Items());
        items.add(item("DATA", "NOPE_X", null));
        Map<String, Object> out = layoutService.execute(req(uniq("이슈 "), m.eai(), null), List.of(headerRow(m.l110())), List.of(),
                numbered(items), samples("C1"));
        assertEquals(1, ((List<Map<String, Object>>) out.get("issues")).size());
        assertEquals("L01", ((List<Map<String, Object>>) out.get("issues")).get(0).get("CODE"));
        assertNull(out.get("segments"));
    }

    @Test
    void execute_는_아무것도_쓰지_않는다() {
        M201 m = m201();
        String counts = "SELECT (SELECT COUNT(*) FROM TB_MDM_LAYOUT) || '/' || (SELECT COUNT(*) FROM TB_MDM_LAYOUT_ITEM) || '/' "
                + "|| (SELECT COUNT(*) FROM TB_MDM_LAYOUT_VER) || '/' || (SELECT SUM(VER) FROM TB_MDM_LAYOUT) || '/' "
                + "|| (SELECT SUM(`VERSION`) FROM TB_MDM_LAYOUT)";
        String before = jdbc.queryForObject(counts, String.class);
        Map<String, Object> row = layoutRow(m.message());
        List<Map<String, Object>> items = itemRows(m.message());
        execute(m, "C26A0012345");
        // 저장된 전문과 다른 초안(이름 변경·여분 쪼개기)으로 렌더해도 그 초안은 쓰이지 않는다
        List<Map<String, Object>> changed = new ArrayList<>(m201Items());
        changed.set(3, filler(20));
        changed.add(filler(5));
        Map<String, Object> out = layoutService.execute(req("바뀐 이름 " + m.message(), m.eai(), m.message()),
                List.of(headerRow(m.l110())), List.of(), numbered(changed), samples("C1"));
        assertEquals(187, out.get("totalBytes"));
        assertEquals(before, jdbc.queryForObject(counts, String.class));
        assertEquals(row, layoutRow(m.message()));
        assertEquals(items, itemRows(m.message()));
    }
}
