package com.dongkuk.dmes.mdm.dmc.codeItemEdit;

import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.assertMdm;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.byCode;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.codes;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.deleted;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.list;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.map;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.patch;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.preview;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.row;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.save;
import static com.dongkuk.dmes.mdm.dmc.codeItemEdit.CodeItemEditRequests.view;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeItemEdit.service.CodeItemEditService;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import javax.sql.DataSource;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * TSK-06-03 design.md §4.4 SD1~SD7 — 수용 기준 1 「04 샘플 데이터 저장 검사 결과 일치」. 기대값은 원천
 * {@code 04-master-code-deploy-full.md:1059-1149}(design.md §1.3)를 글자 그대로 옮겼다. 시계 2026-09-03 00:00 KST,
 * 사용자 kim(MDM_STEWARD). 서비스 빈을 트랜잭션 없이 직접 부르고 표를 JdbcTemplate 으로 읽어 단언한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeItemEditSampleDataTest {

    @TempDir
    static Path tempDir;

    @Autowired
    CodeItemEditService service;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-item-edit-sample-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        fx = new MasterCodeFixtures(new JdbcTemplate(dataSource));
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    // ── PROC_CD ─────────────────────────────────────────────────────────

    @Test
    void SD1_PROC_CD_의_DRAFT_v2_000_이_82_83_을_닫으면_원천_최종_상태가_된다() {
        fx.seedProcCdBeforeDraftEdits();

        Map<String, Object> result = service.save(save("PROC_CD", "2.000", 0L), List.of(deleted("82"), deleted("83")));

        assertEquals(List.of(
                "1P|1.000|9999|PLTCM|PLTCM|11",
                "2P|1.001|9999|PLTCM2|PLTCM|12",
                "82|1.000|2.000|2CGL|CGL|21",
                "83|1.000|1.001|3CGl|CGL|22",
                "83|1.001|2.000|3CGL|CGL|22"), fx.itemRows("PROC_CD"));
        assertEquals(List.of("BASE@1.000-9999", "COATING@1.000-9999", "COLD_MILL@1.000-9999", "MAJOR@1.000-9999"),
                fx.cateSegments("PROC_CD"));
        assertEquals(List.of(
                "COLD_MILL 1P@1.000-9999",
                "COLD_MILL 2P@1.001-9999",
                "MAJOR 1P@1.000-9999",
                "MAJOR 2P@1.001-9999",
                "MAJOR 82@1.000-2.000"), fx.cateItemSegments("PROC_CD"));
        assertEquals(Map.of("82", List.of("MAJOR"), "83", List.of()), result.get("closedCategories"));
        assertEquals(1L, ((Number) result.get("rowVersion")).longValue());
        assertEquals(1L, fx.rowVersion("PROC_CD", "2.000"));
    }

    @Test
    void SD2_버전별_모습() {
        fx.seedProcCdBeforeDraftEdits();
        service.save(save("PROC_CD", "2.000", 0L), List.of(deleted("82"), deleted("83")));

        List<Map<String, Object>> v1001 = list(service.view(view("PROC_CD", "1.001")), "rows");
        List<Map<String, Object>> v2000 = list(service.view(view("PROC_CD", "2.000")), "rows");
        List<Map<String, Object>> v1000 = list(service.view(view("PROC_CD", "1.000")), "rows");

        assertEquals(Set.of("1P", "82", "83", "2P"), Set.copyOf(codes(v1001)));
        assertEquals("3CGL", byCode(v1001, "83").get("name"));
        assertEquals(Set.of("1P", "2P"), Set.copyOf(codes(v2000)));
        assertEquals("3CGl", byCode(v1000, "83").get("name"));
    }

    @Test
    void SD3_카테고리_해석() {
        fx.seedProcCdBeforeDraftEdits();
        service.save(save("PROC_CD", "2.000", 0L), List.of(deleted("82"), deleted("83")));

        assertEquals(Set.of("1P", "2P", "82", "83"), hits("1.001", "BASE"));
        assertEquals(Set.of("82", "83"), hits("1.001", "COATING"));
        assertEquals(Set.of("1P", "2P", "82"), hits("1.001", "MAJOR"));
        assertEquals(Set.of("1P", "2P"), hits("1.001", "COLD_MILL"));

        assertEquals(Set.of("1P", "2P"), hits("2.000", "BASE"));
        assertEquals(Set.of(), hits("2.000", "COATING"));
        assertEquals(Set.of("1P", "2P"), hits("2.000", "MAJOR"));
        List<Map<String, Object>> warnings = list(service.preview(preview("PROC_CD", "2.000", "COATING")), "warnings");
        assertEquals(List.of("CATEGORY_EMPTY"), codes2(warnings));
    }

    @Test
    void SD4_v2_000_의_diff_는_닫힌_행_셋이고_추가_수정은_없다() {
        fx.seedProcCdBeforeDraftEdits();
        service.save(save("PROC_CD", "2.000", 0L), List.of(deleted("82"), deleted("83")));

        Map<String, Object> v = service.view(view("PROC_CD", "2.000"));

        List<Map<String, Object>> closed = list(v, "closed");
        assertEquals(List.of("82@1.000", "83@1.001"),
                closed.stream().map(r -> r.get("code") + "@" + r.get("fromVer")).sorted().toList());
        assertTrue(closed.stream().allMatch(r -> "REMOVED".equals(r.get("change"))));
        assertEquals(List.of("MAJOR 82"),
                list(v, "closedCateItems").stream().map(r -> r.get("cateId") + " " + r.get("code")).toList());
        assertEquals(0, list(v, "rows").stream().filter(r -> !"NONE".equals(r.get("change"))).count());
    }

    @Test
    void SD5_DRAFT_가_닫기만_한_키와_건드리지_않은_키는_경미_수정할_수_있다() {
        fx.seedProcCdBeforeDraftEdits();
        service.save(save("PROC_CD", "2.000", 0L), List.of(deleted("82"), deleted("83")));

        service.patch(patch("PROC_CD", "82", "1.000", "2CGL-P", "CGL", 21, null));
        service.patch(patch("PROC_CD", "1P", "1.000", "PLTCM-P", "PLTCM", 11, "설명"));

        assertTrue(fx.itemRows("PROC_CD").contains("82|1.000|2.000|2CGL-P|CGL|21"), fx.itemRows("PROC_CD").toString());
        assertTrue(fx.itemRows("PROC_CD").contains("1P|1.000|9999|PLTCM-P|PLTCM|11"), fx.itemRows("PROC_CD").toString());
    }

    // ── STEEL_STD ───────────────────────────────────────────────────────

    @Test
    void SD6_STEEL_STD_저장_검사는_원천과_시뮬레이터_결과와_같다() {
        fx.seedSteelStd();
        Map<String, Object> x1 = row("ADDED", "X-1", "x", 1, "KS", null, "KS-3-CGCH");
        Map<String, Object> x2 = row("ADDED", "X-2", "x", 1, "JIS", "KS-3");
        Map<String, Object> z50 = row("ADDED", "KS-3-CGCH-Z50", "z50", 1, "KS", "KS-3", "KS-3-CGCH");
        Map<String, Object> ks3 = row("ADDED", "KS-3", "x", 1, "JIS");

        assertEquals(List.of("LVL_GAP"), validate(x1));
        assertEquals(List.of("LVL_PARENT_MISMATCH"), validate(x2));
        assertEquals(List.of(), validate(z50));
        assertEquals(List.of("LVL_PARENT_MISMATCH"), validate(ks3));

        for (Map<String, Object> bad : List.of(x1, x2, ks3)) {
            BusinessException e = assertMdm(MdmErrorCode.CODE_SAVE_REJECTED,
                    () -> service.save(save("STEEL_STD", "1.001", 0L), List.of(bad)));
            assertTrue(e.getMessage().startsWith(MdmErrorCode.CODE_SAVE_REJECTED.defaultMessage()), e.getMessage());
            assertEquals(0L, fx.rowVersion("STEEL_STD", "1.001"));
        }
        Map<String, Object> ok = service.save(save("STEEL_STD", "1.001", 0L), List.of(z50));
        assertEquals(1L, ((Number) ok.get("rowVersion")).longValue());
        assertEquals(1L, fx.rowVersion("STEEL_STD", "1.001"));
        assertTrue(fx.itemSegments("STEEL_STD").contains("KS-3-CGCH-Z50@1.001-9999"));
    }

    // ── EQP_CD ──────────────────────────────────────────────────────────

    @Test
    void SD7_EQP_CD_는_조회_전용이다() {
        fx.seedEqpCd();

        Map<String, Object> selected = map(service.view(view("EQP_CD", null)), "selected");
        assertEquals(false, selected.get("editable"));
        assertEquals(false, selected.get("patchable"));

        BusinessException save = assertMdm(MdmErrorCode.CODE_SAVE_REJECTED,
                () -> service.save(save("EQP_CD", "2.000", 0L), List.of(row("ADDED", "E2", "x", 2))));
        assertTrue(save.getMessage().contains("SOURCE_EXTERNAL"), save.getMessage());
        BusinessException patch = assertMdm(MdmErrorCode.CODE_PATCH_REJECTED,
                () -> service.patch(patch("EQP_CD", "E1", "1.000", "x", null, 1, null)));
        assertTrue(patch.getMessage().contains("SOURCE_EXTERNAL"), patch.getMessage());
    }

    // ── helpers ─────────────────────────────────────────────────────────

    private Set<String> hits(String ver, String cateId) {
        return new TreeSet<>(list(service.preview(preview("PROC_CD", ver, cateId)), "rows").stream()
                .filter(r -> Boolean.TRUE.equals(r.get("hit"))).map(r -> (String) r.get("code")).toList());
    }

    private List<String> validate(Map<String, Object> row) {
        return codes2(list(service.validate(save("STEEL_STD", "1.001", null), List.of(row)), "issues"));
    }

    private static List<String> codes2(List<Map<String, Object>> issues) {
        return issues.stream().map(i -> (String) i.get("code")).toList();
    }
}
