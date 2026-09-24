package com.dongkuk.dmes.mdm.dmc.codeCateEdit;

import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN;
import static com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures.OPEN_END;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.assertMdm;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.byCateId;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.cateDeleted;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.cateRow;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.list;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.map;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.memberRow;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.preview;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.revert;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.save;
import static com.dongkuk.dmes.mdm.dmc.codeCateEdit.CodeCateEditRequests.view;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.ResolvedRow;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeCategoryResolver.Resolution;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeFixtures;
import com.dongkuk.dmes.mdm.common.mastercode.MasterCodeTestConfig;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefTarget;
import com.dongkuk.dmes.mdm.contract.category.CategoryDefinition;
import com.dongkuk.dmes.mdm.contract.category.CategoryKind;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeCateRow;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeSegmentService;
import com.dongkuk.dmes.mdm.contract.mastercode.MasterCodeVersionView;
import com.dongkuk.dmes.mdm.contract.security.MdmRoles;
import com.dongkuk.dmes.mdm.contract.version.VersionRef;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import com.dongkuk.dmes.mdm.dmc.codeCateEdit.service.CodeCateEditService;
import java.math.BigDecimal;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
 * TSK-06-04 design.md §5 불변 규칙 4·6·8·15 — codeCateEdit 서비스(조회·모습·저장·되돌리기·검사·미리보기)를 local(SQLite)
 * 컨텍스트로 돌린다. 서비스에는 {@code @Transactional} 이 없다 — 트랜잭션 없이 직접 부른다.
 *
 * <p>기본 시드 {@code M}(lvl_cnt 2): 1.000 RELEASED(행 A·B·C), 1.001 DRAFT(소유자 kim, row_version 3), BASE 카테고리.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@Import(MasterCodeTestConfig.class)
class CodeCateEditServiceSqliteTest {

    private static final long RV = 3L;

    @TempDir
    static Path tempDir;

    @Autowired
    CodeCateEditService service;
    @Autowired
    MasterCodeSegmentService segments;
    @Autowired
    MutableCurrentUser currentUser;
    @Autowired
    DataSource dataSource;

    private MasterCodeFixtures fx;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("mdm-code-cate-edit-service-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void seed() {
        fx = new MasterCodeFixtures(new JdbcTemplate(dataSource));
        fx.clear();
        currentUser.set("kim", Set.of(MdmRoles.STEWARD));
    }

    private void seedM() {
        fx.seedCode("M", "시험 코드", "MDM", 2, "라벨1");
        fx.seedVersion("M", "1.000", "RELEASED", "kim", "2026-01-01 00:00:00", OPEN_END, 0);
        fx.seedVersion("M", "1.001", "DRAFT", "kim", null, null, RV);
        fx.seedItem("M", "A", "1.000", OPEN, "에이", null, 1, "a1", "G");
        fx.seedItem("M", "B", "1.000", OPEN, "비", null, 2, null, "G");
        fx.seedItem("M", "C", "1.000", OPEN, "씨", null, 3, null, "H");
        fx.seedCate("M", "BASE", "1.000", OPEN, "전체", "REGEX", ".*", "CODE");
    }

    // ── 불변 규칙 4 ──────────────────────────────────────────────────────

    @Test
    void 정규식_문법_오류는_validate_save_모두_거부() {
        seedM();
        List<Map<String, Object>> categories = List.of(cateRow("ADDED", "R1", "정규식", "REGEX", "(", "CODE"));

        Map<String, Object> v = service.validate(save("M", "1.001", null), categories, List.of());
        List<Map<String, Object>> issues = list(v, "issues");
        assertEquals(List.of("INVALID_REGEX"), issues.stream().map(i -> i.get("code")).toList());

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, () -> service.save(save("M", "1.001", RV), categories, List.of()));
        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of("BASE@1.000-9999"), fx.cateSegments("M"));
    }

    // ── 불변 규칙 6 ──────────────────────────────────────────────────────

    @Test
    void preview_는_Resolver_호출_결과의_필드를_그대로_옮긴다() {
        seedM();
        VersionRef ref = new VersionRef(VersionTarget.MASTER_CODE, "M", new BigDecimal("1.001"));
        MasterCodeVersionView view = segments.viewAt(ref);
        CategoryDefinition candidate = new CategoryDefinition(null, null, CategoryKind.REGEX, "[AB]",
                CategoryDefTarget.CODE, null);
        Resolution expected = MasterCodeCategoryResolver.resolve(view.items(),
                new MasterCodeCateRow(candidate, null, null), view.cateItems());

        Map<String, Object> r = service.preview(preview("M", "1.001", null, "[AB]", "CODE"));

        assertEquals(expected.hitCount(), r.get("hitCount"));
        assertEquals(expected.total(), r.get("total"));
        assertEquals(expected.invalidExpression(), r.get("invalidExpression"));
        List<Map<String, Object>> rows = list(r, "rows");
        assertEquals(expected.rows().size(), rows.size());
        for (int i = 0; i < rows.size(); i++) {
            ResolvedRow er = expected.rows().get(i);
            Map<String, Object> ar = rows.get(i);
            assertEquals(er.code(), ar.get("code"));
            assertEquals(er.hit(), ar.get("hit"));
            assertEquals(er.reason().name(), ar.get("reason"));
            assertEquals(er.targetValue(), ar.get("targetValue"));
        }
    }

    // ── 불변 규칙 8 ──────────────────────────────────────────────────────

    @Test
    void 검사_실패시_rowVersion_이_그대로다() {
        seedM();
        List<Map<String, Object>> categories = List.of(cateRow("ADDED", "T1", null, "TABLE", null, null));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, () -> service.save(save("M", "1.001", RV), categories, List.of()));

        assertEquals(RV, fx.rowVersion("M", "1.001"));
        assertEquals(List.of("BASE@1.000-9999"), fx.cateSegments("M"));
    }

    // ── 불변 규칙 15 ─────────────────────────────────────────────────────

    @Test
    void preview_전후_행_개수가_같다() {
        seedM();
        List<String> beforeCates = fx.cateSegments("M");
        List<String> beforeItems = fx.itemSegments("M");
        List<String> beforeCateItems = fx.cateItemSegments("M");

        service.preview(preview("M", "1.001", null, "[AB]", "CODE"));

        assertEquals(beforeCates, fx.cateSegments("M"));
        assertEquals(beforeItems, fx.itemSegments("M"));
        assertEquals(beforeCateItems, fx.cateItemSegments("M"));
    }

    // ── 기본 동작 ────────────────────────────────────────────────────────

    @Test
    void 정상_저장은_카테고리와_소속을_함께_반영한다() {
        seedM();
        List<Map<String, Object>> categories = List.of(cateRow("ADDED", "T1", "표1", "TABLE", null, null));
        List<Map<String, Object>> members = List.of(memberRow("ADDED", "T1", "A"), memberRow("ADDED", "T1", "B"));

        Map<String, Object> r = service.save(save("M", "1.001", RV), categories, members);

        assertEquals(RV + 1, ((Number) r.get("rowVersion")).longValue());
        assertEquals(List.of("BASE@1.000-9999", "T1@1.001-9999"), fx.cateSegments("M"));
        assertEquals(List.of("T1 A@1.001-9999", "T1 B@1.001-9999"), fx.cateItemSegments("M"));
    }

    @Test
    void 같은_저장에서_새_TABLE_카테고리에_바로_멤버를_넣을_수_있다() {
        seedM();
        List<Map<String, Object>> categories = List.of(cateRow("ADDED", "T2", "표2", "TABLE", null, null));
        List<Map<String, Object>> members = List.of(memberRow("ADDED", "T2", "C"));

        service.save(save("M", "1.001", RV), categories, members);

        assertEquals(List.of("T2 C@1.001-9999"), fx.cateItemSegments("M"));
    }

    @Test
    void REGEX_카테고리를_겨냥한_members_행은_거부된다() {
        seedM();
        List<Map<String, Object>> members = List.of(memberRow("ADDED", "BASE", "A"));

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED, () -> service.save(save("M", "1.001", RV), List.of(), members));
    }

    @Test
    void 없는_카테고리를_닫으면_거부된다() {
        seedM();

        assertMdm(MdmErrorCode.CODE_SAVE_REJECTED,
                () -> service.save(save("M", "1.001", RV), List.of(cateDeleted("ZZ")), List.of()));
    }

    @Test
    void view_는_카테고리_코드_소속을_돌려준다() {
        seedM();
        fx.seedCate("M", "T1", "1.000", OPEN, "표1", "TABLE", null, null);
        fx.seedCateItem("M", "T1", "A", "1.000", OPEN);

        Map<String, Object> v = service.view(view("M", "1.001"));

        assertEquals("1.001", map(v, "selected").get("ver"));
        List<Map<String, Object>> categories = list(v, "categories");
        assertEquals(Set.of("BASE", "T1"), categories.stream().map(c -> c.get("cateId")).collect(java.util.stream.Collectors.toSet()));
        assertEquals("TABLE", byCateId(categories, "T1").get("defKind"));
        assertEquals(3, list(v, "items").size());
        assertEquals(List.of(Map.of("cateId", "T1", "code", "A")), list(v, "cateItems"));
    }

    @Test
    void view_빈_버전은_selected_가_null() {
        fx.seedCode("N", "버전 없음", "MDM", 0);

        Map<String, Object> v = service.view(view("N", null));

        assertNull(v.get("selected"));
        assertEquals(List.of(), v.get("categories"));
    }

    @Test
    void revert_는_카테고리_되돌리기를_처리한다() {
        seedM();
        service.save(save("M", "1.001", RV), List.of(cateRow("ADDED", "T1", "표1", "TABLE", null, null)), List.of());

        Map<String, Object> r = service.revert(revert("M", "1.001", RV + 1, "CATE", "T1", null));

        assertEquals(RV + 2, ((Number) r.get("rowVersion")).longValue());
        assertEquals(List.of("BASE@1.000-9999"), fx.cateSegments("M"));
    }
}
