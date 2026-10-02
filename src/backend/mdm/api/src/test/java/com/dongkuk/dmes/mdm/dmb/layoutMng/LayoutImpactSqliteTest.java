package com.dongkuk.dmes.mdm.dmb.layoutMng;

import static org.assertj.core.api.Assertions.assertThat;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.dma.domainMng.dto.DomainMngViewRequest;
import com.dongkuk.dmes.mdm.dma.domainMng.service.DomainMngService;
import com.dongkuk.dmes.mdm.dme.DmeTestSupport;
import com.dongkuk.dmes.mdm.dmb.LayoutServiceTestSupport;
import com.dongkuk.dmes.mdm.dmb.layoutMng.dto.LayoutMngSearchRequest;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.ActiveProfiles;

/**
 * TSK-05-03 design.md §3.2·§6.7 — 컬럼·도메인 변경 영향 전문 목록(search target=IMPACT)과 domainMng 영향도의 LAYOUT_ITEM 행
 * (MdmDomainReferenceSpi, D12 — 불변 I21).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(DmeTestSupport.Config.class)
class LayoutImpactSqliteTest extends LayoutServiceTestSupport {

    @Autowired
    DomainMngService domainService;

    @BeforeEach
    void setUp() {
        dictionary();
    }

    @SuppressWarnings("unchecked")
    private List<Map<String, Object>> impacts(String keyword) {
        LayoutMngSearchRequest r = new LayoutMngSearchRequest();
        r.setTarget("IMPACT");
        r.setKeyword(keyword);
        return (List<Map<String, Object>>) layoutService.search(r).get("impacts");
    }

    private String name(long id) {
        return (String) layoutRow(id).get("LAYOUT_NAME");
    }

    @Test
    void search_IMPACT_는_컬럼을_쓰는_전문과_상대_시스템을_돌려준다() {
        M201 m = m201();
        Map<String, Object> row = impacts("COIL_THK").stream().filter(r -> name(m.message()).equals(r.get("LAYOUT_NAME"))).findFirst()
                .orElseThrow();
        assertEquals("COIL_THK", row.get("COLUMN_PHYS"));
        assertEquals("MESSAGE", row.get("LAYOUT_KIND"));
        assertEquals("3 코일 두께 (본문 28 / 4)", row.get("ITEM"));
        assertEquals("L2 → MES", row.get("SND_RCV"));
        assertEquals("길이·형식 변경 시 새 버전, 양측 동시 전환", row.get("IMPACT"));
        assertEquals("1.000", row.get("VER"));
        assertEquals("CURRENT", row.get("VER_STATE"));
        assertEquals(m.message(), ((Number) row.get("LAYOUT_ID")).longValue());
        // 소문자 키워드도 같은 컬럼
        assertTrue(impacts("coil_thk").stream().anyMatch(r -> name(m.message()).equals(r.get("LAYOUT_NAME"))));
    }

    @Test
    void search_IMPACT_는_도메인_하위_트리의_컬럼을_모두_보고_안_쓰는_컬럼도_한_줄로_낸다() {
        M201 m = m201();
        long thkDomain = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK'", Long.class);
        long child = domain(uniq("RMTL_THK_"), "QTY", "NUMBER", null, null, thkDomain);
        column("RMTL_COIL_THK", "소재 코일 두께", null, child);
        List<Map<String, Object>> rows = impacts("도메인 COIL_THK");
        assertTrue(rows.stream().anyMatch(r -> "COIL_THK".equals(r.get("COLUMN_PHYS")) && name(m.message()).equals(r.get("LAYOUT_NAME"))),
                rows.toString());
        Map<String, Object> unused = rows.stream().filter(r -> "RMTL_COIL_THK".equals(r.get("COLUMN_PHYS"))).findFirst().orElseThrow();
        assertNull(unused.get("LAYOUT_NAME"));
        assertNull(unused.get("LAYOUT_ID"));
        assertEquals("레이아웃에서 쓰지 않는다", unused.get("IMPACT"));
        // 도메인 표준명으로도 같은 두 컬럼
        List<Map<String, Object>> byStd = impacts("COIL_THK");
        assertTrue(byStd.stream().anyMatch(r -> "RMTL_COIL_THK".equals(r.get("COLUMN_PHYS"))), byStd.toString());
    }

    @Test
    void 헤더에_쓰인_컬럼은_헤더와_사용_전문_수를_보인다() {
        M201 m = m201();
        Map<String, Object> row = impacts("SND_FAC_TP").stream().filter(r -> name(m.l100()).equals(r.get("LAYOUT_NAME"))).findFirst()
                .orElseThrow();
        assertEquals("HEADER", row.get("LAYOUT_KIND"));
        assertEquals(1, ((Number) row.get("USED_BY_COUNT")).intValue());
        assertEquals("헤더 변경 — 사용 전문 1건 동시 전환", row.get("IMPACT"));
        assertEquals("2 송신공장구분 (헤더 안 8 / 4)", row.get("ITEM"));
    }

    @Test
    void 찾지_못한_키워드는_빈_목록이다() {
        m201();
        assertTrue(impacts("NOPE_" + uniq("K")).isEmpty());
        assertTrue(impacts("").isEmpty());
    }

    @Test
    @SuppressWarnings("unchecked")
    void 도메인_영향도_SPI_는_레이아웃_항목을_LAYOUT_ITEM_으로_낸다() {
        M201 m = m201();
        long thkDomain = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_THK'", Long.class);
        DomainMngViewRequest r = new DomainMngViewRequest();
        r.setDomainId(thkDomain);
        Map<String, Object> impact = (Map<String, Object>) domainService.view(r).get("impact");
        List<Map<String, Object>> items = (List<Map<String, Object>>) impact.get("layoutItems");
        String expected = name(m.message()) + "#3 COIL_THK (28/4)";
        assertTrue(items.stream().anyMatch(i -> (expected + " [v1.000 현재]").equals(i.get("REF_KEY"))), items.toString());
    }

    @Test
    void 영향은_현재_예정_작성_중_버전을_나눠_보인다() {
        M201 m = m201();
        newDraft(m.message(), "1.000", "1.001");
        assertThat(states(m.message())).containsExactlyInAnyOrder("1.000/CURRENT", "1.001/DRAFT");
        assertThat(mine(m.message())).filteredOn(r -> "1.001".equals(r.get("VER"))).singleElement()
                .satisfies(r -> assertThat((String) r.get("IMPACT")).isEqualTo("작성 중 v1.001 — 확정 전에 고칠 수 있다"));

        release(m.message(), "1.001", "2026-12-01 00:00:00");
        assertThat(states(m.message())).containsExactlyInAnyOrder("1.000/CURRENT", "1.001/FUTURE");
        assertThat(mine(m.message())).filteredOn(r -> "1.001".equals(r.get("VER"))).singleElement()
                .satisfies(r -> assertThat((String) r.get("IMPACT"))
                        .isEqualTo("적용 예정 v1.001 (2026-12-01 00:00:00) — 확정취소 또는 새 버전으로 반영"));
        // 도메인 영향도 참조에도 상태가 붙는다
        String ref = name(m.message()) + "#";
        long coilDomain = jdbc.queryForObject("SELECT DOMAIN_ID FROM TB_MDM_DOMAIN WHERE STD_NAME = 'COIL_ID'", Long.class);
        DomainMngViewRequest r = new DomainMngViewRequest();
        r.setDomainId(coilDomain);
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> items = (List<Map<String, Object>>) ((Map<String, Object>) domainService.view(r).get("impact"))
                .get("layoutItems");
        assertThat(items).extracting(i -> (String) i.get("REF_KEY")).filteredOn(k -> k.startsWith(ref))
                .anyMatch(k -> k.endsWith("[v1.001 예정]")).anyMatch(k -> k.endsWith("[v1.000 현재]"));
    }

    @Test
    void 닫힌_버전은_영향에서_빠지고_헤더_사용_전문_수는_전문_단위로_센다() {
        M201 m = m201();
        newDraft(m.message(), "1.000", "1.001");
        release(m.message(), "1.001", "2026-02-10 00:00:00"); // 지금(NOW)보다 앞 — 1.000 은 닫히고 1.001 이 현재
        assertThat(states(m.message())).containsExactly("1.001/CURRENT");
        newDraft(m.message(), "1.001", "1.002");
        Map<String, Object> header = impacts("SND_FAC_TP").stream().filter(x -> name(m.l100()).equals(x.get("LAYOUT_NAME")))
                .findFirst().orElseThrow();
        // 전문 한 건이 현재+작성 중 두 버전으로 헤더를 쌓아도 전문 수는 1
        assertEquals(1, ((Number) header.get("USED_BY_COUNT")).intValue());
    }

    private List<Map<String, Object>> mine(long messageId) {
        return impacts("COIL_ID").stream().filter(x -> name(messageId).equals(x.get("LAYOUT_NAME"))).toList();
    }

    private List<String> states(long messageId) {
        return mine(messageId).stream()
                .map(x -> x.get("VER") + "/" + x.get("VER_STATE")).toList();
    }
}
