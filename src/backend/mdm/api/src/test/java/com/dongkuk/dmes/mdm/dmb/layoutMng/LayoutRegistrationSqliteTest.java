package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSaveRequest;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-03 design.md §3.2 — 03 등록 거부 7종을 원문 순서대로 서버에서(수용 기준 3), CONST 값은 도메인 유효 식으로(수용 기준 4).
 * 저장은 쓰기 전에 거부하고 아무것도 쓰지 않는다(불변 I12). validate 는 7행 표를 돌려주고 쓰지 않는다(I20).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutRegistrationSqliteTest extends LayoutServiceTestSupport {

    @BeforeEach
    void setUp() {
        dictionary();
        unit("MM", "LENGTH", "MM", "1");
        unit("UM", "LENGTH", "MM", "0.001");
        unit("KG", "WEIGHT", "KG", "1");
        column("THK_MM", "두께 mm", null, domainWithUnit("T_THK_MM", "NUMBER", 3, 1, "MM"));
        column("FLAG1", "플래그", null, ruleDomain("T_FLAG1", "NUMBER", 1, 0, "value <= 1"));
    }

    private int count(String table) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM " + table, Integer.class);
    }

    private List<Integer> counts() {
        return List.of(count("TB_MDM_LAYOUT"), count("TB_MDM_LAYOUT_ITEM"), count("TB_MDM_LAYOUT_VER"));
    }

    /** 새 전문 저장을 시도하고 거부 문구를 돌려준다 — 거부면 레이아웃·항목·버전 행이 하나도 늘지 않았음을 함께 단언한다. */
    private String reject(List<Map<String, Object>> items) {
        List<Integer> before = counts();
        String name = uniq("거부 ");
        BusinessException ex = rejected(() -> layoutService.save(layoutReq(name, null, r -> {}), List.of(), List.of(), items));
        assertEquals(before, counts(), "거부는 아무것도 쓰지 않는다(I12)");
        return ex.getMessage();
    }

    private static List<Map<String, Object>> with(Map<String, Object> extra) {
        List<Map<String, Object>> items = new ArrayList<>(m201Items());
        items.add(extra);
        return numbered(items);
    }

    private static Map<String, Object> row(String kind, String phys, String def, Object... kv) {
        Map<String, Object> m = item(kind, phys, def);
        for (int i = 0; i < kv.length; i += 2) {
            m.put((String) kv[i], kv[i + 1]);
        }
        return m;
    }

    @Test
    void 거부_1_본문_항목의_컬럼이_컬럼_사전에_없으면_L01() {
        String msg = reject(with(row("DATA", "NOPE_X", null)));
        assertTrue(msg.startsWith("전문 저장 거부: L01"), msg);
    }

    @Test
    void 거부_2_CONST_값이_도메인_유효_식을_위반하면_L12() {
        String msg = reject(with(row("CONST", "FLAG1", "2")));
        assertTrue(msg.startsWith("전문 저장 거부: L12[5]"), msg);
    }

    @Test
    void 거부_2_CONST_값이_도메인_타입이_아니면_L12() {
        String msg = reject(with(row("CONST", "FLAG1", "A")));
        assertTrue(msg.startsWith("전문 저장 거부: L12[5]"), msg);
        assertTrue(msg.contains("타입"), msg);
    }

    @Test
    void 거부_2_헤더_상수_재정의_값도_유효_식으로_검사한다() {
        long h = saveHeader(headerReq(uniq("플래그 헤더 "), r -> {}), numbered(new ArrayList<>(List.of(item("CONST", "FLAG1", "1"),
                filler(4)))));
        release(h, "1.000", HEADER_FROM);
        List<Integer> before = counts();
        String name = uniq("재정의 ");
        BusinessException ex = rejected(() -> layoutService.save(layoutReq(name, null, r -> {}), List.of(headerRow(h)),
                List.of(constRow(h, 1, "9")), m201Items()));
        assertTrue(ex.getMessage().startsWith("전문 저장 거부: L12[1]"), ex.getMessage());
        assertEquals(before, counts());
        long ok = saveLayout(layoutReq(uniq("재정의 "), null, r -> {}), List.of(headerRow(h)), List.of(constRow(h, 1, "1")), m201Items());
        assertEquals(1, constRows(ok).size());
    }

    @Test
    void 거부_2_헤더_저장도_CONST_기본값을_유효_식으로_검사한다() {
        String name = uniq("플래그 헤더 ");
        BusinessException ex = rejected(() -> headerService.save(headerReq(name, r -> {}),
                numbered(new ArrayList<>(List.of(item("CONST", "FLAG1", "5"), filler(4))))));
        assertTrue(ex.getMessage().startsWith("헤더 저장 거부: L12[1]"), ex.getMessage());
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM TB_MDM_LAYOUT WHERE LAYOUT_NAME = ?", Integer.class, name));
    }

    @Test
    void CONST_값이_유효하면_저장된다() {
        long id = saveLayout(layoutReq(uniq("유효 상수 "), null, r -> {}), List.of(), List.of(), with(row("CONST", "FLAG1", "1")));
        assertEquals("1", itemRows(id, "1").get(4).get("DEFAULT_VALUE"));
    }

    @Test
    void 거부_3_전송_단위의_차원이_다르면_L13() {
        String msg = reject(with(row("DATA", "THK_MM", null, "TRANS_UNIT", "KG", "NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=6")));
        assertTrue(msg.startsWith("전문 저장 거부: L13[5]"), msg);
    }

    @Test
    void 거부_4_숫자_표현_자리가_부족하면_L14() {
        List<Map<String, Object>> items = m201Items();
        items.get(2).put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=2");
        String msg = reject(items);
        assertTrue(msg.contains("L14[3]"), msg);
        assertTrue(msg.contains("표현 자리 2는 도메인"), msg);
    }

    @Test
    void 거부_5_FILLER_가_아닌_항목에_길이를_직접_입력하면_L02() {
        String msg = reject(with(row("DATA", "THK_MM", null, "FILLER_LENGTH", 4)));
        assertTrue(msg.startsWith("전문 저장 거부: L02[5]"), msg);
        assertTrue(msg.contains("FILLER_LENGTH"), msg);
    }

    @Test
    void 거부_6_전송_단위와_단위_항목을_함께_넣으면_L05() {
        String msg = reject(with(row("DATA", "THK_MM", null, "TRANS_UNIT", "UM", "UNIT_ITEM", "COIL_ID",
                "NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=6")));
        assertTrue(msg.startsWith("전문 저장 거부: L05[5]"), "DB CHECK 보다 먼저 앱 문구: " + msg);
    }

    @Test
    void 거부_7_단위_항목이_같은_레이아웃_항목을_가리키지_않으면_L15() {
        String msg = reject(with(row("DATA", "THK_MM", null, "UNIT_ITEM", "NOPE_UNIT")));
        assertTrue(msg.startsWith("전문 저장 거부: L15[5]"), msg);
    }

    @Test
    void 전송_단위가_같은_차원이면_저장된다() {
        long id = saveLayout(layoutReq(uniq("전송 단위 "), null, r -> {}), List.of(), List.of(),
                with(row("DATA", "THK_MM", null, "TRANS_UNIT", "UM", "NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=6")));
        assertEquals("UM", itemRows(id, "1").get(4).get("TRANS_UNIT"));
        assertEquals(6, ((Number) itemRows(id, "1").get(4).get("LENGTH")).intValue());
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> validate(M201 m, List<Map<String, Object>> items) {
        LayoutMngSaveRequest r = layoutReq(uniq("검증 "), m.eai(), x -> {});
        return layoutService.validate(r, List.of(headerRow(m.l110())), List.of(), items);
    }

    @Test
    @SuppressWarnings("unchecked")
    void validate_는_7행_표를_돌려주고_아무것도_쓰지_않는다() {
        M201 m = m201();
        List<Integer> before = counts();
        Map<String, Object> out = validate(m, m201Items());
        assertEquals(before, counts(), "validate 는 쓰지 않는다(I20)");
        List<Map<String, Object>> checks = (List<Map<String, Object>>) out.get("checks");
        assertEquals(7, checks.size());
        assertEquals(List.of("PASS", "PASS", "PASS", "PASS", "PASS", "PASS", "PASS"), checks.stream().map(c -> c.get("RESULT")).toList());
        assertEquals(true, out.get("passed"));
        assertTrue(((List<?>) out.get("otherIssues")).isEmpty());
    }

    @Test
    @SuppressWarnings("unchecked")
    void validate_는_거부_4_를_4번_행에_싣는다() {
        M201 m = m201();
        List<Map<String, Object>> items = m201Items();
        items.get(2).put("NUM_FORMAT", "SIGN=N;ZERO=Y;SCALE=1;WIDTH=2");
        Map<String, Object> out = validate(m, items);
        List<Map<String, Object>> checks = (List<Map<String, Object>>) out.get("checks");
        assertEquals(List.of("PASS", "PASS", "PASS", "FAIL", "PASS", "PASS", "PASS"), checks.stream().map(c -> c.get("RESULT")).toList());
        List<String> messages = (List<String>) checks.get(3).get("MESSAGES");
        assertTrue(messages.get(0).contains("표현 자리 2는 도메인"), messages.toString());
        assertFalse((Boolean) out.get("passed"));
    }
}
